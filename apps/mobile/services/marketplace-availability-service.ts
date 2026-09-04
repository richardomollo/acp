// Beta Feedback #019 — the ONE service boundary for marketplace availability.
// Screens never query gyms/sessions for "is Lana here?" themselves — they
// call this. It runs a cheap, indexed bounding-box RPC and hands the rows to
// the pure contract (lib/supply/marketplace-availability.ts) for the verdict.
//
// A query failure is returned as `{ ok: false }` — NEVER as a false
// 'no_local_inventory'. Callers show a retry/neutral state for that (spec §22).

import { supabase } from '@/lib/supabase';
import { boundingBoxKm, MARKETPLACE_RADIUS_KM } from '@/lib/supply/location';
import {
  computeMarketplaceAvailability, venuesInRadius,
  type MarketplaceAvailability, type ActiveVenueRow, type GeoPoint,
} from '@/lib/supply/marketplace-availability';

export type { GeoPoint, MarketplaceAvailability };

export interface MarketplaceMarket {
  label: string;
  latitude: number;
  longitude: number;
  venueCount: number;
}

export type MarketplaceAvailabilityResult =
  | {
      ok: true;
      availability: MarketplaceAvailability;
      /** gym ids with geographically valid active+bookable supply within
       *  MARKETPLACE_RADIUS_KM — screens scope their own queries with
       *  `.in('gym_id', venueIdsInRadius)`. Empty for `location_unknown`. */
      venueIdsInRadius: string[];
    }
  | { ok: false; error: 'query_failed' };

async function fetchCandidates(point: GeoPoint): Promise<ActiveVenueRow[]> {
  const box = boundingBoxKm(point.latitude, point.longitude, MARKETPLACE_RADIUS_KM);
  const { data, error } = await supabase.rpc('marketplace_venue_candidates', {
    p_min_lat: box.minLat,
    p_max_lat: box.maxLat,
    p_min_lng: box.minLng,
    p_max_lng: box.maxLng,
  });
  if (error) throw error;
  return ((data as any[]) ?? []).map((r): ActiveVenueRow => ({
    id: String(r.id),
    isActive: true, // the RPC only ever returns is_active gyms
    latitude: r.latitude == null ? null : Number(r.latitude),
    longitude: r.longitude == null ? null : Number(r.longitude),
    cityLabel: r.city_label ?? null,
    hasBookableSupply: r.has_bookable === true,
  }));
}

/**
 * The verdict for a resolved marketplace point.
 *   • point == null                 → 'location_unknown' (no query run)
 *   • RPC ok                        → 'available' | 'no_local_inventory'
 *   • RPC threw                     → { ok: false, error: 'query_failed' }
 */
export async function getMarketplaceAvailability(
  point: GeoPoint | null,
  cityLabel?: string | null,
): Promise<MarketplaceAvailabilityResult> {
  if (!point) {
    return {
      ok: true,
      availability: computeMarketplaceAvailability({ point: null, venues: [] }),
      venueIdsInRadius: [],
    };
  }
  try {
    const venues = await fetchCandidates(point);
    return {
      ok: true,
      availability: computeMarketplaceAvailability({ point, venues, cityLabel }),
      venueIdsInRadius: venuesInRadius(point, venues).map(v => v.venue.id),
    };
  } catch {
    return { ok: false, error: 'query_failed' };
  }
}

/**
 * Just the venue ids with valid active+bookable supply within radius — for a
 * screen that already knows availability is 'available' and only needs to
 * scope its own inventory query. Returns [] on failure (the screen then shows
 * its normal empty/retry state rather than Nairobi-wide results).
 */
export async function getVenueIdsInRadius(point: GeoPoint | null): Promise<string[]> {
  if (!point) return [];
  try {
    const venues = await fetchCandidates(point);
    return venuesInRadius(point, venues).map(v => v.venue.id);
  } catch {
    return [];
  }
}

/** Places Lana currently has coordinate-bearing active supply — powers the
 *  "Explore another city" picker. Empty on failure. */
export async function getMarketplaceMarkets(): Promise<MarketplaceMarket[]> {
  try {
    const { data, error } = await supabase.rpc('marketplace_markets');
    if (error) throw error;
    return ((data as any[]) ?? [])
      .filter(r => r.latitude != null && r.longitude != null)
      .map((r): MarketplaceMarket => ({
        label: cleanMarketLabel(r.label),
        latitude: Number(r.latitude),
        longitude: Number(r.longitude),
        venueCount: Number(r.venue_count ?? 0),
      }));
  } catch {
    return [];
  }
}

/** "Westlands, Nairobi" / "Ngong Road" → a short place label. Best-effort;
 *  gyms have no real city column, so this is derived from free text. */
function cleanMarketLabel(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return 'Lana market';
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : parts[0];
}
