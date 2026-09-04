-- Beta Feedback #019 — Marketplace geography & inventory availability.
--
-- Lana is globally usable; marketplace SUPPLY is geographically constrained.
-- This migration is fully ADDITIVE: two partial indexes + two read-only,
-- SECURITY INVOKER helper functions. No column, no table, no data change, no
-- RLS change. There is NO "market activation" flag — availability is derived
-- purely from active, bookable, coordinate-bearing supply, so onboarding the
-- first Amsterdam gym makes Amsterdam available with zero further changes.
--
-- The exact radius test and the availability verdict live in the app
-- (apps/mobile/lib/supply/marketplace-availability.ts) so the contract stays
-- in one unit-tested place; these functions only do the cheap, indexed
-- bounding-box narrowing PostgREST can't express directly.
--
-- Coordinate columns: the app writes `lat`/`lng` (added 20260528000001);
-- some older rows only have `latitude`/`longitude`. COALESCE(lat, latitude)
-- is the canonical read everywhere below.

-- ── Indexes for the bounding-box pre-filter ─────────────────────────────
CREATE INDEX IF NOT EXISTS gyms_active_coords_idx
  ON public.gyms (lat, lng)
  WHERE is_active = true AND lat IS NOT NULL AND lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS gyms_active_legacy_coords_idx
  ON public.gyms (latitude, longitude)
  WHERE is_active = true AND latitude IS NOT NULL AND longitude IS NOT NULL;

-- ── marketplace_venue_candidates ───────────────────────────────────────
-- Active gyms whose coalesced coordinates fall inside a lat/lng box, each
-- flagged with whether it has genuinely BOOKABLE supply (spec §5/§12): a
-- drop-in price, OR ≥1 active future session with room, OR ≥1 active future
-- experience with room. A bare active gym row with no bookable anything does
-- NOT count. A gym with no coordinates is never returned (spec §6).
CREATE OR REPLACE FUNCTION public.marketplace_venue_candidates(
  p_min_lat double precision,
  p_max_lat double precision,
  p_min_lng double precision,
  p_max_lng double precision
)
RETURNS TABLE (
  id           uuid,
  latitude     double precision,
  longitude    double precision,
  city_label   text,
  has_bookable boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    g.id,
    COALESCE(g.lat, g.latitude)  AS latitude,
    COALESCE(g.lng, g.longitude) AS longitude,
    NULLIF(btrim(COALESCE(g.area, g.location, '')), '') AS city_label,
    (
      g.drop_in_price IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.sessions s
        WHERE s.gym_id = g.id AND s.is_active = true
          AND s.date >= (now() AT TIME ZONE 'utc')::date
          AND (s.spots_left IS NULL OR s.spots_left > 0)
      )
      OR EXISTS (
        SELECT 1 FROM public.experiences e
        WHERE e.gym_id = g.id AND e.is_active = true
          AND e.date >= (now() AT TIME ZONE 'utc')::date
          AND (e.spots_left IS NULL OR e.spots_left > 0)
      )
    ) AS has_bookable
  FROM public.gyms g
  WHERE g.is_active = true
    AND COALESCE(g.lat, g.latitude)  IS NOT NULL
    AND COALESCE(g.lng, g.longitude) IS NOT NULL
    AND COALESCE(g.lat, g.latitude)  BETWEEN p_min_lat AND p_max_lat
    AND COALESCE(g.lng, g.longitude) BETWEEN p_min_lng AND p_max_lng;
$$;

GRANT EXECUTE ON FUNCTION public.marketplace_venue_candidates(double precision, double precision, double precision, double precision)
  TO anon, authenticated;

-- ── marketplace_markets ────────────────────────────────────────────────
-- The set of places where Lana currently has coordinate-bearing active
-- supply, clustered to ~11 km (1 decimal degree) so a metro collapses to one
-- row. Powers the "Explore another city" picker. Today it returns Nairobi;
-- onboard Amsterdam supply and an Amsterdam row appears automatically — no
-- app release, no hard-coded city list.
CREATE OR REPLACE FUNCTION public.marketplace_markets()
RETURNS TABLE (
  label       text,
  latitude    double precision,
  longitude   double precision,
  venue_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH v AS (
    SELECT
      COALESCE(g.lat, g.latitude)  AS lat,
      COALESCE(g.lng, g.longitude) AS lng,
      NULLIF(btrim(COALESCE(g.location, g.area, '')), '') AS area_label
    FROM public.gyms g
    WHERE g.is_active = true
      AND COALESCE(g.lat, g.latitude)  IS NOT NULL
      AND COALESCE(g.lng, g.longitude) IS NOT NULL
  )
  SELECT
    (array_agg(v.area_label ORDER BY v.area_label NULLS LAST))[1] AS label,
    round(avg(v.lat)::numeric, 4)::double precision AS latitude,
    round(avg(v.lng)::numeric, 4)::double precision AS longitude,
    count(*) AS venue_count
  FROM v
  GROUP BY round(v.lat::numeric, 1), round(v.lng::numeric, 1)
  HAVING count(*) > 0
  ORDER BY count(*) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.marketplace_markets() TO anon, authenticated;
