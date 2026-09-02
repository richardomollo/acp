-- The generate_pt_slug trigger function runs as the calling user (anon key
-- from the partner-signup form). RLS on personal_trainers prevents the
-- anon role from seeing existing rows, so the uniqueness loop always thinks
-- the base slug is free and re-uses it — causing a unique constraint
-- violation on the second signup with the same name.
-- Fix: run the function as the table owner (postgres) so it bypasses RLS.

CREATE OR REPLACE FUNCTION public.generate_pt_slug()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  counter   INT := 0;
BEGIN
  base_slug := regexp_replace(
    lower(coalesce(NEW.professional_name, NEW.full_name)),
    '[^a-z0-9]+', '-', 'g'
  );
  base_slug := trim(both '-' from base_slug);
  candidate := base_slug;

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.personal_trainers
      WHERE slug = candidate AND id != NEW.id
    );
    counter   := counter + 1;
    candidate := base_slug || '-' || counter;
  END LOOP;

  NEW.slug := candidate;
  RETURN NEW;
END;
$$;
