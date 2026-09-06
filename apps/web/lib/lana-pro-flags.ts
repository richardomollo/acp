// LANA PRO — front-door cutover switch.
//
// The partner/professional product surface is Lana Pro. These flags let the
// whole cutover be reverted from the environment without a code change — same
// "off ONLY for the exact string 'false'" convention as `lib/flags.ts`, but
// NEXT_PUBLIC_ so the client-side routing (`/partner-login`) reads them too.
//
//   NEXT_PUBLIC_LANA_PRO_ENABLED=false
//     → post-login routing, signup CTAs and the legacy-dashboard root
//       redirects all fall back to the classic `/pt-dashboard` /
//       `/partner-dashboard` / `/trainer-dashboard` behaviour. The legacy
//       dashboards are always reachable directly regardless of this flag.
//
//   NEXT_PUBLIC_LANA_PRO_VENUE_TEAMS_ENABLED=false
//     → the Team nav item is hidden from the Lana Pro workspace. Venue-team
//       data and routes are unaffected; team visibility is otherwise derived
//       from workspace capabilities.

function isOff(name: string): boolean {
  return process.env[name] === 'false';
}

export function isLanaProEnabled(): boolean {
  return !isOff('NEXT_PUBLIC_LANA_PRO_ENABLED');
}

export function isLanaProVenueTeamsEnabled(): boolean {
  return !isOff('NEXT_PUBLIC_LANA_PRO_VENUE_TEAMS_ENABLED');
}

/** Where a partner/professional account lands after login when the cutover is
 *  live. Kept here so every entry point agrees on the destination. */
export const LANA_PRO_HOME = '/lana-pro/home';

/** The Lana Pro onboarding flow — professional AND business branch. */
export const LANA_PRO_ONBOARDING = '/lana-pro/onboarding';

/** Where "Become a Partner" CTAs point. With the cutover on, straight into the
 *  Lana Pro onboarding (which has its own professional/business branch
 *  selector); with it off, the classic `/partners/signup` marketing page. */
export function partnerSignupEntry(): string {
  return isLanaProEnabled() ? LANA_PRO_ONBOARDING : '/partners/signup';
}
