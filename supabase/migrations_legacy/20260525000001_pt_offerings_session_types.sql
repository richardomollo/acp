-- Extend pt_offerings with session-type-specific fields
ALTER TABLE public.pt_offerings
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS location_details TEXT,
  ADD COLUMN IF NOT EXISTS meeting_link TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_hours INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS service_zones TEXT[] NOT NULL DEFAULT '{}';

-- Unique slug index (sparse – only enforced when slug is set)
CREATE UNIQUE INDEX IF NOT EXISTS pt_offerings_slug_unique
  ON public.pt_offerings (slug) WHERE slug IS NOT NULL;

-- Backfill slugs for any existing rows
UPDATE public.pt_offerings
SET slug = LOWER(REGEXP_REPLACE(title, '[^a-z0-9]+', '-', 'gi'))
        || '-' || SUBSTRING(MD5(id::TEXT), 1, 5)
WHERE slug IS NULL;

-- Extend pt_bookings with type-specific fields
ALTER TABLE public.pt_bookings
  ADD COLUMN IF NOT EXISTS client_address TEXT,
  ADD COLUMN IF NOT EXISTS meeting_link_sent BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.pt_offerings.slug IS 'URL-safe slug used in shareable booking links';
COMMENT ON COLUMN public.pt_offerings.location_details IS 'Fixed location for outdoor / drop-in / home-visit offering';
COMMENT ON COLUMN public.pt_offerings.meeting_link IS 'Video call URL for online sessions – shared after PT confirms booking';
COMMENT ON COLUMN public.pt_offerings.cancellation_hours IS 'Hours before session within which client may cancel';
COMMENT ON COLUMN public.pt_offerings.service_zones IS 'Areas covered by PT for home-visit sessions';
COMMENT ON COLUMN public.pt_bookings.client_address IS 'Client-provided address for home-visit bookings';
