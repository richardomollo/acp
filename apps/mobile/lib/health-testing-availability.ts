// Beta Feedback #019C — Health Testing geography & service availability.
//
// Health testing is a LOCATION-DEPENDENT capability that is SEPARATE from the
// #019 fitness marketplace. `availability.status === 'available'` (which
// derives from bookable gyms/classes) must NEVER be read as "health testing
// is available here". This resolver is capability-specific.
//
// USER LOCATION → CAPABILITY → CAPABILITY-SPECIFIC SUPPLY → verdict.
//
// MVP reality (inspection): Lana has NO structured health-testing provider /
// laboratory / market model in the database — the feature is globally
// "Booking is coming soon". The Nairobi/Mombasa/Kisumu line was hard-coded
// marketing copy, not inventory evidence (§7 — marketing copy is not
// evidence). So `HEALTH_TESTING_SUPPORTED_MARKETS` is empty and the resolver
// returns `coming_soon` everywhere a location is known. When a real testing
// geography exists, populate that list (or pass `supportedMarkets` in) and
// `available` / `no_local_inventory` fall out naturally with no screen change.

export type HealthTestingStatus =
  | 'available'
  | 'no_local_inventory'
  | 'coming_soon'
  | 'location_unknown'
  | 'error';

/** Testing-specific supply evidence. Empty for MVP — no provider model yet. */
export const HEALTH_TESTING_SUPPORTED_MARKETS: readonly string[] = [];

export interface HealthTestingAvailabilityInput {
  /** the #019 location label in effect (device reverse-geocode or manual city) */
  locationLabel: string | null;
  /** true when #019 has resolved SOME usable location (device or manual) */
  hasLocation: boolean;
  /** a genuine failure resolving location / a future testing query — NOT a
   *  "no inventory" signal (§10). */
  queryFailed?: boolean;
  /** override for tests / future real data; defaults to the (empty) MVP list */
  supportedMarkets?: readonly string[];
}

export interface HealthTestingAvailabilityResult {
  status: HealthTestingStatus;
  /** echoed back so the screen renders the same label it was given */
  locationLabel: string | null;
}

/** Case-insensitive, order-independent substring match (e.g. "Westlands,
 *  Nairobi" ↔ "Nairobi"). */
function labelMatchesMarket(label: string, market: string): boolean {
  const a = label.trim().toLowerCase();
  const b = market.trim().toLowerCase();
  return a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));
}

export function resolveHealthTestingAvailability(
  input: HealthTestingAvailabilityInput,
): HealthTestingAvailabilityResult {
  const locationLabel = input.locationLabel;

  // A real failure to resolve — never read as "no inventory" or "available".
  if (input.queryFailed) return { status: 'error', locationLabel };

  // No location at all → neutral, location-dependent state (§6). Not Kenya.
  if (!input.hasLocation) return { status: 'location_unknown', locationLabel };

  const supported = input.supportedMarkets ?? HEALTH_TESTING_SUPPORTED_MARKETS;

  // No structured testing supply anywhere → coming soon everywhere, incl.
  // Nairobi (§7). Fitness availability is deliberately not consulted (§2).
  if (supported.length === 0) return { status: 'coming_soon', locationLabel };

  if (locationLabel && supported.some(m => labelMatchesMarket(locationLabel, m))) {
    return { status: 'available', locationLabel };
  }
  return { status: 'no_local_inventory', locationLabel };
}

// ── Copy (§3/§6/§8 — location-truthful, no Kenyan cities, never "broken") ──

export const HEALTH_TESTING_COPY = {
  eyebrow: 'HEALTH TESTING',
  title: 'Comprehensive health insights through lab testing',
  /** the "booking isn't live yet" line, kept for every state where the
   *  feature exists but can't be booked. */
  comingSoonNotice: 'Booking is coming soon — check back shortly to schedule a test.',
} as const;

/** The body line for a given status + city. Never mentions a location the
 *  service isn't actually offered in. */
export function healthTestingBody(status: HealthTestingStatus, locationLabel: string | null): string {
  const city = locationLabel?.trim();
  switch (status) {
    case 'available':
      return city
        ? `Lab testing is available in ${city}. Hormone Panel and Nutritional Deficiency Tests are processed by certified laboratories.`
        : 'Lab testing is available in your area. Hormone Panel and Nutritional Deficiency Tests are processed by certified laboratories.';
    case 'coming_soon':
    case 'no_local_inventory':
      return city
        ? `Health testing isn't available in ${city} yet. We're working on bringing testing services to more locations.`
        : "Health testing isn't available in your area yet. We're working on bringing testing services to more locations.";
    case 'location_unknown':
      return 'Health testing availability depends on your location.';
    case 'error':
    default:
      return "We couldn't check health testing availability just now. This is a connection issue, not a coverage gap.";
  }
}
