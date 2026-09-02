-- ─── Helper: slugify text ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.make_slug(input TEXT) RETURNS TEXT
  LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s TEXT;
BEGIN
  s := LOWER(TRIM(input));
  s := REGEXP_REPLACE(s, '[^a-z0-9\s-]', '', 'g');
  s := REGEXP_REPLACE(s, '[\s]+', '-', 'g');
  s := REGEXP_REPLACE(s, '-+', '-', 'g');
  s := TRIM(s, '-');
  RETURN s;
END;
$$;

-- ─── sessions ─────────────────────────────────────────────────────────────────
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS slug TEXT;

DO $$
DECLARE
  r RECORD;
  base_slug TEXT;
  candidate TEXT;
  suffix INT;
BEGIN
  FOR r IN SELECT id, name FROM public.sessions WHERE slug IS NULL LOOP
    base_slug := public.make_slug(r.name);
    IF base_slug = '' THEN base_slug := 'session'; END IF;
    candidate := base_slug;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM public.sessions WHERE slug = candidate AND id <> r.id) LOOP
      candidate := base_slug || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;
    UPDATE public.sessions SET slug = candidate WHERE id = r.id;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_slug_idx ON public.sessions (slug);

CREATE OR REPLACE FUNCTION public.session_auto_slug() RETURNS TRIGGER
  LANGUAGE plpgsql AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix INT;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN RETURN NEW; END IF;
  base_slug := public.make_slug(COALESCE(NEW.name, 'session'));
  IF base_slug = '' THEN base_slug := 'session'; END IF;
  candidate := base_slug;
  suffix := 1;
  WHILE EXISTS (SELECT 1 FROM public.sessions WHERE slug = candidate) LOOP
    candidate := base_slug || '-' || suffix;
    suffix := suffix + 1;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_session_auto_slug ON public.sessions;
CREATE TRIGGER trg_session_auto_slug
  BEFORE INSERT ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.session_auto_slug();

-- ─── personal_trainers ────────────────────────────────────────────────────────
ALTER TABLE public.personal_trainers ADD COLUMN IF NOT EXISTS slug TEXT;

DO $$
DECLARE
  r RECORD;
  base_slug TEXT;
  candidate TEXT;
  suffix INT;
BEGIN
  FOR r IN SELECT id, full_name, professional_name FROM public.personal_trainers WHERE slug IS NULL LOOP
    base_slug := public.make_slug(COALESCE(r.professional_name, r.full_name));
    IF base_slug = '' THEN base_slug := 'trainer'; END IF;
    candidate := base_slug;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM public.personal_trainers WHERE slug = candidate AND id <> r.id) LOOP
      candidate := base_slug || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;
    UPDATE public.personal_trainers SET slug = candidate WHERE id = r.id;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS personal_trainers_slug_idx ON public.personal_trainers (slug);

CREATE OR REPLACE FUNCTION public.trainer_auto_slug() RETURNS TRIGGER
  LANGUAGE plpgsql AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix INT;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN RETURN NEW; END IF;
  base_slug := public.make_slug(COALESCE(NEW.professional_name, NEW.full_name, 'trainer'));
  IF base_slug = '' THEN base_slug := 'trainer'; END IF;
  candidate := base_slug;
  suffix := 1;
  WHILE EXISTS (SELECT 1 FROM public.personal_trainers WHERE slug = candidate) LOOP
    candidate := base_slug || '-' || suffix;
    suffix := suffix + 1;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trainer_auto_slug ON public.personal_trainers;
CREATE TRIGGER trg_trainer_auto_slug
  BEFORE INSERT ON public.personal_trainers
  FOR EACH ROW EXECUTE FUNCTION public.trainer_auto_slug();

-- ─── experiences ──────────────────────────────────────────────────────────────
ALTER TABLE public.experiences ADD COLUMN IF NOT EXISTS slug TEXT;

DO $$
DECLARE
  r RECORD;
  base_slug TEXT;
  candidate TEXT;
  suffix INT;
BEGIN
  FOR r IN SELECT id, name FROM public.experiences WHERE slug IS NULL LOOP
    base_slug := public.make_slug(r.name);
    IF base_slug = '' THEN base_slug := 'experience'; END IF;
    candidate := base_slug;
    suffix := 1;
    WHILE EXISTS (SELECT 1 FROM public.experiences WHERE slug = candidate AND id <> r.id) LOOP
      candidate := base_slug || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;
    UPDATE public.experiences SET slug = candidate WHERE id = r.id;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS experiences_slug_idx ON public.experiences (slug);

CREATE OR REPLACE FUNCTION public.experience_auto_slug() RETURNS TRIGGER
  LANGUAGE plpgsql AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix INT;
BEGIN
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN RETURN NEW; END IF;
  base_slug := public.make_slug(COALESCE(NEW.name, 'experience'));
  IF base_slug = '' THEN base_slug := 'experience'; END IF;
  candidate := base_slug;
  suffix := 1;
  WHILE EXISTS (SELECT 1 FROM public.experiences WHERE slug = candidate) LOOP
    candidate := base_slug || '-' || suffix;
    suffix := suffix + 1;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_experience_auto_slug ON public.experiences;
CREATE TRIGGER trg_experience_auto_slug
  BEFORE INSERT ON public.experiences
  FOR EACH ROW EXECUTE FUNCTION public.experience_auto_slug();
