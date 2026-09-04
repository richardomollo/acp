// Beta Feedback #019 — Marketplace geography & inventory availability.
//
// Lana is globally usable; its MARKETPLACE supply is geographically
// constrained. This module is the ONE canonical availability contract — the
// pure, deterministic core. A thin service (services/marketplace-availability-
// service.ts) does the Supabase query and hands the rows here.
//
// The rule (spec §2/§5):
//
//   user location
//     → find ACTIVE + BOOKABLE supply within MARKETPLACE_RADIUS_KM
//     → any? → 'available'   |   none? → 'no_local_inventory'
//     → no location at all?  → 'location_unknown'
//     → the query itself failed? → the caller keeps the previous state /
//       shows a retry; it must NEVER be reported as 'no_local_inventory'.
//
// It is NOT `if city === "Nairobi"`. Nairobi is simply the only supplied
// market today. Onboard valid active+bookable supply anywhere and that place
// becomes 'available' with no change to this file or any screen.

import { haversineKm, MARKETPLACE_RADIUS_KM } from './location.ts';

export { MARKETPLACE_RADIUS_KM };

export type MarketplaceAvailabilityStatus =
  | 'available'          // ≥1 geographically valid active+bookable item within radius
  | 'no_local_inventory' // a real user point, but nothing bookable within radius
  | 'location_unknown';  // no usable location (permission denied / not set / not resolved)

export interface MarketNearest {
  /** best-effort label for the closest supplied market ("Nairobi") */
  city: string;
  distanceKm: number;
}

export interface MarketplaceAvailability {
  status: MarketplaceAvailabilityStatus;
  /** the label of the location this verdict is about, when known */
  city?: string;
  /** count of geographically valid active+bookable items within radius */
  nearbyInventoryCount?: number;
  /** closest supplied market when the user's own point has none */
  nearestMarket?: MarketNearest;
  /** the radius the verdict used — surfaced so copy/telemetry never hard-code it */
  radiusKm: number;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * A gym as the availability check needs it. `latitude`/`longitude` are the
 * already-coalesced canonical coordinates (lib prefers `lat`/`lng`, older
 * rows only have `latitude`/`longitude` — the service coalesces before
 * calling in). `cityLabel` is best-effort display text (gyms have no real
 * city column — derived from `area`/`location`).
 */
export interface ActiveVenueRow {
  id: string;
  isActive: boolean;
  latitude: number | null;
  longitude: number | null;
  cityLabel?: string | null;
  /** true when this venue has ≥1 active, bookable, non-past offering
   *  (session / experience with spots). A bare active gym is itself bookable
   *  (drop-in / open gym), so this defaults to true at the service when the
   *  gym is active — it exists to let a caller pass `false` for a gym that is
   *  active but provably has nothing bookable. */
  hasBookableSupply?: boolean;
}

/** A gym establishes geographic availability only with valid coordinates AND
 *  active status AND bookable supply (spec §5/§6). A venue row without
 *  coordinates NEVER establishes availability, no matter how active. */
export function isVenueGeographicallyValid(v: ActiveVenueRow): boolean {
  return (
    v.isActive &&
    typeof v.latitude === 'number' && Number.isFinite(v.latitude) &&
    typeof v.longitude === 'number' && Number.isFinite(v.longitude) &&
    v.latitude >= -90 && v.latitude <= 90 &&
    v.longitude >= -180 && v.longitude <= 180 &&
    v.hasBookableSupply !== false
  );
}

export interface VenueWithDistance {
  venue: ActiveVenueRow;
  distanceKm: number;
}

/** Every geographically valid venue, with its distance from `point`, nearest first. */
export function venuesByDistance(point: GeoPoint, venues: ActiveVenueRow[]): VenueWithDistance[] {
  return venues
    .filter(isVenueGeographicallyValid)
    .map(venue => ({
      venue,
      distanceKm: haversineKm(point.latitude, point.longitude, venue.latitude as number, venue.longitude as number),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Valid venues within `radiusKm` of `point`. */
export function venuesInRadius(
  point: GeoPoint,
  venues: ActiveVenueRow[],
  radiusKm: number = MARKETPLACE_RADIUS_KM,
): VenueWithDistance[] {
  return venuesByDistance(point, venues).filter(v => v.distanceKm <= radiusKm);
}

export interface ComputeAvailabilityInput {
  /** the resolved marketplace point, or null when there is no usable location */
  point: GeoPoint | null;
  /** every active venue the service could see (already coalesced coords) */
  venues: ActiveVenueRow[];
  /** display label for `point` (the manually chosen city, or a reverse-geocode) */
  cityLabel?: string | null;
  radiusKm?: number;
}

/**
 * The verdict. Pure: same inputs → same output, no clock, no network.
 *
 *   • point == null                → 'location_unknown'
 *   • ≥1 valid venue within radius  → 'available'   (+ count)
 *   • otherwise                     → 'no_local_inventory' (+ nearest market if any)
 *
 * A query failure is NOT modelled here — the service represents that as a
 * separate error result and this function is simply not called (spec §22).
 */
export function computeMarketplaceAvailability(input: ComputeAvailabilityInput): MarketplaceAvailability {
  const radiusKm = input.radiusKm ?? MARKETPLACE_RADIUS_KM;

  if (!input.point) {
    return { status: 'location_unknown', radiusKm };
  }

  const ranked = venuesByDistance(input.point, input.venues);
  const within = ranked.filter(v => v.distanceKm <= radiusKm);

  if (within.length > 0) {
    return {
      status: 'available',
      city: input.cityLabel ?? undefined,
      nearbyInventoryCount: within.length,
      radiusKm,
    };
  }

  const nearest = ranked[0];
  return {
    status: 'no_local_inventory',
    city: input.cityLabel ?? undefined,
    nearbyInventoryCount: 0,
    nearestMarket: nearest
      ? {
          city: nearest.venue.cityLabel?.trim() || 'the nearest Lana market',
          distanceKm: Math.round(nearest.distanceKm),
        }
      : undefined,
    radiusKm,
  };
}
