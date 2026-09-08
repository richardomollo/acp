// LANA MOBILE — Android Google OAuth callback route.
//
// ROOT CAUSE (confirmed via expo-web-browser's own source,
// node_modules/expo-web-browser/src/WebBrowser.ts): Android has NO native
// AuthSession support (`_authSessionIsNativelySupported()` returns
// `Platform.OS !== 'android'`), so expo-web-browser polyfills the OAuth
// redirect there with a plain `Linking.addEventListener('url', ...)`
// listener (`_waitForRedirectAsync`) — the SAME event Expo Router's own
// root navigation listens to for deep-link routing. Both fire independently
// on the same incoming URL: the WebBrowser polyfill correctly resolves the
// pending auth-session promise (so components/google-signin-button.tsx's
// sign-in genuinely completes), while Expo Router SEPARATELY tries to match
// the URL's path against a file-based route — and until this file existed,
// nothing was ever registered at /oauth2redirect/google, so it rendered
// Unmatched Route regardless of the auth flow succeeding underneath it.
//
// This route makes that path a real, recognised screen instead of a 404.
// It does NOT reimplement any auth logic — components/google-signin-button.tsx
// (mounted globally, inside the always-present GlobalAuthModal) is already
// independently watching the same redirect via useIdTokenAuthRequest's
// `response`, and completes the actual sign-in (state/PKCE validation is
// entirely expo-auth-session's own, untouched here). This screen's only
// jobs are: give maybeCompleteAuthSession() one more explicit chance to
// fire, never expose the raw OAuth query string to the user, and get out
// of the way — using the same declarative <Redirect> pattern already
// proven safe against the separate "Attempted to navigate before mounting
// the Root Layout component" issue (see app/index.tsx), never an imperative
// router.replace()/router.push() call.
//
// RACE AUDIT (2026-09) — an earlier version of this file waited a fixed
// 400ms before redirecting. Traced and confirmed race-free-vs-not:
//   - GoogleSignInButton DOES stay mounted through this navigation, proven
//     from RN's own Modal.js source (`render()` returns null only when
//     `visible` is false; nothing here ever sets it false) plus the
//     component tree (GlobalAuthModal is a SIBLING of the root <Stack>, not
//     inside it, so in-stack navigation to/from this route never touches
//     it) — so signInWithIdToken (services/auth.tsx's signInWithGoogle)
//     genuinely keeps completing independently of whatever this screen does.
//   - BUT a fixed delay of ANY length (400ms, 0ms, or otherwise) does not
//     synchronise with that completion. If app/index.tsx's one-shot
//     bootstrap (its useEffect runs exactly once per mount) re-mounts via
//     this screen's <Redirect href="/"> before signInWithIdToken has
//     actually persisted the session, it computes target:'/login' and
//     navigates the BACKGROUND stack there — invisible while the modal
//     stays open on top, and self-corrected once sign-in completes IF a
//     showAuthModal(callback) was registered for this flow (the callback
//     lives in AuthModalProvider's own state, not tied to any specific
//     screen's mount lifecycle, so it still fires and calls
//     router.replace(dest) correctly). But GlobalAuthModal is also opened
//     from places with NO callback registered — there, once the modal
//     closes, nothing re-corrects the background stack, so the race is a
//     real, user-visible regression risk THIS route introduces (before it
//     existed, the background stack was never touched during the OAuth
//     round-trip at all).
//   - Fix: wait for supabase.auth.onAuthStateChange's real SIGNED_IN /
//     TOKEN_REFRESHED event (an actual completion signal, not polling —
//     signInWithIdToken fires this the moment it succeeds) before
//     redirecting, with a bounded safety-net timeout for the cancel/error
//     paths where no such event will ever arrive.
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { palette } from '@/constants/theme';

// Safety net ONLY — not the primary signal (that's the onAuthStateChange
// listener below). Covers the cancel/error paths, where no SIGNED_IN event
// will ever fire, so this screen can never wait indefinitely.
const MAX_WAIT_MS = 4000;

export default function GoogleOAuthCallback() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let settled = false;
    const settle = () => { if (!settled) { settled = true; setReady(true); } };

    // Idempotent and safe to call again — this is the second, more reliable
    // opportunity for it to consume the pending auth session, since this
    // component mounting IS the app actually being (re)navigated to via the
    // real redirect URL, unlike the one module-scope call in
    // google-signin-button.tsx which only ever fires once at import time.
    WebBrowser.maybeCompleteAuthSession();

    // The real completion signal — fires the moment signInWithIdToken
    // (services/auth.tsx's signInWithGoogle, called independently by
    // GoogleSignInButton's own still-mounted effect) actually succeeds.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') settle();
    });
    // Bounded fallback for cancel/error/timeout — never an unbounded wait.
    const maxWaitTimer = setTimeout(settle, MAX_WAIT_MS);

    return () => { subscription.unsubscribe(); clearTimeout(maxWaitTimer); };
  }, []);

  // app/index.tsx's own bootstrap already knows how to route a signed-in
  // vs signed-out user correctly — reusing that instead of duplicating
  // destination logic here. Whether sign-in succeeded, was cancelled, or
  // errored (all already handled by google-signin-button.tsx's existing
  // response-type branches), landing back at "/" is always a safe, correct
  // outcome (§9 A/B/C) — and by the time we get here, the session (if any)
  // is already established, so index.tsx's own one-shot session check sees
  // it correctly instead of racing it.
  if (ready) return <Redirect href="/" />;

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.white }}>
      <ActivityIndicator color={palette.ink700} />
    </View>
  );
}
