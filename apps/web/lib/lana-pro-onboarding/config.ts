// LANA PRO onboarding — the single knob for location/country assumptions.
//
// Phase 1 does not render an address field, so this is only a parameterised
// placeholder: the full geography refactor (Google Places country restriction,
// neighbourhood lists, marketplace coordinate capture) is deferred. When that
// work happens, it should read from HERE rather than re-hardcoding "ke" /
// "Nairobi" the way the current partner-signup flow does.

/** ISO 3166-1 alpha-2. Overridable via env so a future multi-market rollout
 *  is a config change, not a code change. Defaults to Kenya (today's only
 *  supplied market — matching lib/supply/marketplace-availability's stance
 *  that Nairobi is "the only supplied market", not a hardcoded assumption). */
export const LANA_PRO_DEFAULT_COUNTRY = (
  process.env.NEXT_PUBLIC_LANA_PRO_COUNTRY || 'KE'
).toUpperCase();

/** Human label for the current default market, for copy that needs one.
 *  Empty string when we should not name a place at all. */
export const LANA_PRO_DEFAULT_MARKET_LABEL =
  process.env.NEXT_PUBLIC_LANA_PRO_MARKET_LABEL ?? '';

/** localStorage key for the resumable onboarding draft. Versioned so a future
 *  breaking change can co-exist with (or deliberately ignore) an old draft. */
export const ONBOARDING_DRAFT_STORAGE_KEY = 'lana-pro-onboarding:draft';
