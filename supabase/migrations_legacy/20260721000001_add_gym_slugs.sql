-- Add slug column to gyms
ALTER TABLE public.gyms ADD COLUMN IF NOT EXISTS slug TEXT;

-- Populate slugs from gym names (lowercase, spaces → hyphens, strip non-alphanum)
UPDATE public.gyms
SET slug = LOWER(
  TRIM(BOTH '-' FROM
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(name, '[^a-zA-Z0-9\s]', '', 'g'),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  )
)
WHERE slug IS NULL;

-- Suffix any duplicates with first 6 hex chars of their ID
WITH dup_ids AS (
  SELECT id, slug, COUNT(*) OVER (PARTITION BY slug) AS cnt
  FROM public.gyms
)
UPDATE public.gyms g
SET slug = d.slug || '-' || LOWER(SUBSTRING(REPLACE(g.id::TEXT, '-', ''), 1, 6))
FROM dup_ids d
WHERE g.id = d.id AND d.cnt > 1;

-- Unique index on slug
CREATE UNIQUE INDEX IF NOT EXISTS gyms_slug_idx ON public.gyms (slug) WHERE slug IS NOT NULL;

-- Auto-generate slug for new gyms (with collision avoidance)
CREATE OR REPLACE FUNCTION public.gym_auto_slug()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INT := 0;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
    RETURN NEW;
  END IF;
  base_slug := LOWER(TRIM(BOTH '-' FROM
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9\s]', '', 'g'),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  ));
  final_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.gyms WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  NEW.slug := final_slug;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gym_auto_slug ON public.gyms;
CREATE TRIGGER trg_gym_auto_slug
  BEFORE INSERT ON public.gyms
  FOR EACH ROW EXECUTE FUNCTION public.gym_auto_slug();
