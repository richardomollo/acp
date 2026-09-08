// Overrides Expo Router's default "Unmatched Route" screen for a genuinely
// unrecognised deep link.
//
// The Android Google OAuth redirect that used to land here (see this file's
// git history) now has its own dedicated route —
// app/oauth2redirect/google.tsx — which is the correct fix (an expected,
// first-class part of the app's routing surface should never be handled as
// a 404 special case). This screen goes back to being a plain, generic
// "somewhere else" recovery for any OTHER unmatched path.
//
// Declarative <Redirect>, never an imperative router.replace()/push() —
// the same lifecycle-safe pattern used in app/index.tsx and
// app/oauth2redirect/google.tsx, so a genuinely unmatched deep link
// reached before the root navigator has finished mounting can never
// reintroduce "Attempted to navigate before mounting the Root Layout
// component."
import { Redirect } from 'expo-router';

export default function NotFoundScreen() {
  return <Redirect href="/" />;
}
