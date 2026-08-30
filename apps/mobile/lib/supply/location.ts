// ACP Intelligence™ Day 7.3 — deterministic location fit.
//
// Inspection finding: no user or PT coordinates exist anywhere in the app
// today (no expo-location capture, fitness_profile.preferred_location and
// personal_trainers.service_areas are free text only). Gyms DO have real
// lat/lng. So in live practice this resolves to the neutral/text-match
// paths below, not the Haversine path — that's a genuine data gap, not a
// bug, and is reported as such in the Day 7.3 completion report. The
// Haversine path is implemented and tested so ranking is already correct
// the moment real user coordinates exist, with no further code change.
const EARTH_RADIUS_KM = 6371;

/** Deterministic great-circle distance — no external maps API (spec section 27). */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Simple bands, not a continuous decay curve — readable, not opaque
// ML-like weighting (spec section 29).
const NEAR_KM = 5;
const FAR_KM = 20;

export interface LocationInput {
  text?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Missing location means "unknown", never "far away" (spec section 28) — a
 * candidate is never penalised, only ever positively distinguished when
 * real signal exists. Coordinates take priority over text when both are
 * present; text match (case-insensitive substring against a free-text
 * location field, e.g. personal_trainers.service_areas) is the fallback for
 * supply types that only ever carry free text, like PTs.
 */
export function locationFit(user: LocationInput | undefined, candidate: LocationInput | undefined): { score: number; nearby: boolean } {
  if (user?.latitude != null && user?.longitude != null && candidate?.latitude != null && candidate?.longitude != null) {
    const km = haversineKm(user.latitude, user.longitude, candidate.latitude, candidate.longitude);
    if (km <= NEAR_KM) return { score: 1, nearby: true };
    if (km <= FAR_KM) return { score: 0.5, nearby: false };
    return { score: 0, nearby: false };
  }
  if (user?.text && candidate?.text) {
    const match = candidate.text.toLowerCase().includes(user.text.toLowerCase()) || user.text.toLowerCase().includes(candidate.text.toLowerCase());
    return match ? { score: 1, nearby: true } : { score: 0.5, nearby: false };
  }
  return { score: 0.5, nearby: false }; // unknown — neutral, never excluded (section 28)
}
