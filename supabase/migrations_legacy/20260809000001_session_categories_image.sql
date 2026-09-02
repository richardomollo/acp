-- Adds an image field to session_categories so the admin portal can attach
-- a thumbnail per category, for the mobile "Top categories" browse grid.
-- Existing public-read / admin-write RLS policies already cover new columns.

ALTER TABLE public.session_categories ADD COLUMN IF NOT EXISTS image_url text;
