-- Readable event URLs (mirrors communities.slug generation exactly).
ALTER TABLE public.community_events ADD COLUMN slug text UNIQUE;

CREATE OR REPLACE FUNCTION public.generate_community_event_slug()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  base_slug text;
  candidate text;
  counter   int := 0;
BEGIN
  base_slug := trim(both '-' from regexp_replace(lower(NEW.title), '[^a-z0-9]+', '-', 'g'));
  candidate := base_slug;
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.community_events WHERE slug = candidate AND id != NEW.id);
    counter   := counter + 1;
    candidate := base_slug || '-' || counter;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_community_event_slug
  BEFORE INSERT ON public.community_events
  FOR EACH ROW EXECUTE FUNCTION public.generate_community_event_slug();

-- Backfill any events created before this migration.
DO $$
DECLARE
  r record;
  base_slug text;
  candidate text;
  counter   int;
BEGIN
  FOR r IN SELECT id, title FROM public.community_events WHERE slug IS NULL LOOP
    base_slug := trim(both '-' from regexp_replace(lower(r.title), '[^a-z0-9]+', '-', 'g'));
    candidate := base_slug;
    counter := 0;
    LOOP
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.community_events WHERE slug = candidate AND id != r.id);
      counter := counter + 1;
      candidate := base_slug || '-' || counter;
    END LOOP;
    UPDATE public.community_events SET slug = candidate WHERE id = r.id;
  END LOOP;
END $$;
