// LANA MOBILE — Android Google OAuth Callback Route.
//
// This codebase has no React-component-rendering test infrastructure (no
// @testing-library/react-native, no expo-router/testing-library usage
// anywhere) — these are structural/source-level tests, the same honest
// constraint already documented for the auth-modal keyboard fix. They
// prove: the callback path is a real registered route (not relying on a
// live Expo Router boot), that its redirect URI actually matches that
// route, and — the core "root navigation safety" concern — that neither
// this route nor +not-found.tsx contains an imperative navigation call
// that could reintroduce "Attempted to navigate before mounting the Root
// Layout component." On-device verification (cold-start, warm-app, an
// actual completed Google redirect) is the necessary follow-up gate, not
// something these tests can stand in for.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MOBILE_ROOT = path.resolve(import.meta.dirname, '../..');
const OAUTH_ROUTE_FILE = path.join(MOBILE_ROOT, 'app/oauth2redirect/google.tsx');
const NOT_FOUND_FILE = path.join(MOBILE_ROOT, 'app/+not-found.tsx');
const GOOGLE_BUTTON_FILE = path.join(MOBILE_ROOT, 'components/google-signin-button.tsx');

/** Strips `//` line comments before matching against actual code — several
 *  assertions below check for the ABSENCE of a pattern, and this file's own
 *  explanatory comments legitimately mention things like "router.replace()"
 *  (explaining what NOT to do) and "oauth2redirect" (naming the sibling
 *  file) in prose, which must not trip a false positive. */
function stripComments(src: string): string {
  return src.split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n');
}

describe('callback path recognition', () => {
  test('app/oauth2redirect/google.tsx exists — Expo Router file-based routing maps this exactly to the /oauth2redirect/google path the Google redirect uses', () => {
    assert.ok(existsSync(OAUTH_ROUTE_FILE), 'expected a route file at app/oauth2redirect/google.tsx');
  });

  test('the redirect URIs google-signin-button.tsx constructs resolve to the SAME path this route registers (a regression guard tying the two together)', () => {
    const src = readFileSync(GOOGLE_BUTTON_FILE, 'utf8');
    // Both IOS_REDIRECT_URI and ANDROID_REDIRECT_URI are built as
    // `com.googleusercontent.apps.{id}:/oauth2redirect/google` — assert the
    // literal path segment is still exactly what this route matches, so a
    // future rename of either side is caught here rather than only on a
    // real device.
    const pathLiteralCount = (src.match(/:\/oauth2redirect\/google['"`]/g) ?? []).length;
    assert.equal(pathLiteralCount, 2, 'expected exactly 2 occurrences (iOS + Android redirect URI construction) of the /oauth2redirect/google path literal');
  });
});

describe('root navigation safety (§10) — no imperative navigation that could race Root Layout mounting', () => {
  const IMPERATIVE_NAV = /router\.(replace|push|navigate)\s*\(/;

  test('app/oauth2redirect/google.tsx uses only the declarative <Redirect>, never an imperative router call', () => {
    const src = readFileSync(OAUTH_ROUTE_FILE, 'utf8');
    assert.doesNotMatch(stripComments(src), IMPERATIVE_NAV);
    assert.match(src, /<Redirect\s+href="\/"\s*\/>/, 'expected a declarative <Redirect href="/" />');
    assert.match(src, /from 'expo-router'/);
  });

  test('app/+not-found.tsx uses only the declarative <Redirect>, never an imperative router call or a raw setTimeout-based navigation', () => {
    const src = readFileSync(NOT_FOUND_FILE, 'utf8');
    const code = stripComments(src);
    assert.doesNotMatch(code, IMPERATIVE_NAV);
    assert.doesNotMatch(code, /setTimeout/);
    assert.match(src, /<Redirect\s+href="\/"\s*\/>/, 'expected a declarative <Redirect href="/" />');
  });
});

describe('callback handling (§4) — the route completes the pending auth session, never re-implements auth logic', () => {
  test('calls WebBrowser.maybeCompleteAuthSession() on mount', () => {
    const src = readFileSync(OAUTH_ROUTE_FILE, 'utf8');
    assert.match(src, /WebBrowser\.maybeCompleteAuthSession\(\)/);
  });

  test('does not read or branch on OAuth query/fragment params directly — no manual state/token trust (§5)', () => {
    const src = readFileSync(OAUTH_ROUTE_FILE, 'utf8');
    for (const forbidden of ['useLocalSearchParams', 'useGlobalSearchParams', '.state', '.id_token', '.access_token', '.code']) {
      assert.ok(!src.includes(forbidden), `must not reference "${forbidden}" — auth completion stays entirely inside expo-auth-session/google-signin-button.tsx`);
    }
  });

  test('does not log or print the raw callback URL/params (no accidental token/PII logging)', () => {
    const src = readFileSync(OAUTH_ROUTE_FILE, 'utf8');
    assert.ok(!/console\.(log|warn|error)/.test(src), 'expected no logging in the callback route');
  });
});

describe('race audit fix (2026-09) — signal-driven redirect, not an arbitrary fixed delay', () => {
  test('waits on a real supabase.auth.onAuthStateChange signal, not a bare setTimeout-then-redirect', () => {
    const src = readFileSync(OAUTH_ROUTE_FILE, 'utf8');
    assert.match(src, /onAuthStateChange/);
    assert.match(src, /SIGNED_IN/);
  });

  test('the timeout present is a bounded safety net only (paired with the auth-state listener), not a standalone fixed-delay redirect', () => {
    const src = readFileSync(OAUTH_ROUTE_FILE, 'utf8');
    // A setTimeout is still present (the safety net for cancel/error paths)
    // but must be a bounded fallback alongside the real signal, not the
    // sole trigger — assert both mechanisms exist together.
    assert.match(src, /setTimeout\(settle, MAX_WAIT_MS\)/);
    assert.match(src, /onAuthStateChange/);
  });
});

describe('unrelated invalid deep link (§9 G)', () => {
  test('+not-found.tsx no longer special-cases OAuth — it is a plain, generic redirect for any other unmatched path', () => {
    const code = stripComments(readFileSync(NOT_FOUND_FILE, 'utf8'));
    assert.ok(!code.includes('maybeCompleteAuthSession'), 'OAuth completion now belongs solely to app/oauth2redirect/google.tsx');
    assert.ok(!code.includes('oauth2redirect'), 'no OAuth-specific special-casing should remain in the generic 404 handler');
  });
});
