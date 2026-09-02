-- Fix statement timeouts when saving recurring session series.
--
-- session_auto_slug() found a free slug via a WHILE EXISTS(...) loop that
-- restarts from suffix 1 for every row. Since every row in a recurring
-- series shares the same name (and therefore the same base slug), row N
-- of a same-named batch needs N sequential existence checks to find a
-- free slug -- an O(rows^2) blowup for a single INSERT statement. There
-- was also no index on sessions.slug, so each check was a full table
-- scan. Together these could exceed the 2 minute statement_timeout for
-- recurring series of a few hundred rows.
--
-- Fix: index slug for fast lookups, and compute the next free suffix in
-- a single aggregate query instead of looping.

CREATE INDEX IF NOT EXISTS idx_sessions_slug ON public.sessions (slug);

CREATE OR REPLACE FUNCTION public.session_auto_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  base_slug TEXT;
  next_suffix INT;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN RETURN NEW; END IF;
  base_slug := public.make_slug(COALESCE(NEW.name, 'session'));
  IF base_slug = '' THEN base_slug := 'session'; END IF;

  SELECT COALESCE(MAX(
    CASE WHEN slug = base_slug THEN 0
         ELSE substring(slug from ('^' || base_slug || '-([0-9]+)$'))::int
    END
  ), -1) + 1
  INTO next_suffix
  FROM public.sessions
  WHERE slug = base_slug OR slug ~ ('^' || base_slug || '-[0-9]+$');

  IF next_suffix = 0 THEN
    NEW.slug := base_slug;
  ELSE
    NEW.slug := base_slug || '-' || next_suffix;
  END IF;

  RETURN NEW;
END;
$function$;
