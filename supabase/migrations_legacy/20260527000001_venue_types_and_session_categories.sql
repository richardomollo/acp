-- =====================================================
-- Venue types and session categories lookup tables
-- =====================================================

CREATE TABLE IF NOT EXISTS public.venue_types (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,
  emoji       text,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.venue_types (name, emoji, sort_order) VALUES
  ('gym',          '🏋️', 1),
  ('yoga',         '🧘', 2),
  ('pilates',      '🤸', 3),
  ('studio',       '🏟️', 4),
  ('crossfit',     '💪', 5),
  ('martial-arts', '🥊', 6),
  ('swimming',     '🏊', 7),
  ('spa',          '💆', 8),
  ('dance',        '🎭', 9),
  ('kids',         '👨‍👩‍👧', 10)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.venue_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read venue_types"
  ON public.venue_types FOR SELECT USING (true);

CREATE POLICY "Admin manage venue_types"
  ON public.venue_types FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

-- =====================================================

CREATE TABLE IF NOT EXISTS public.session_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,
  emoji       text,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.session_categories (name, emoji, sort_order) VALUES
  ('Yoga',             '🧘', 1),
  ('HIIT',             '🔥', 2),
  ('Pilates',          '🤸', 3),
  ('Boxing',           '🥊', 4),
  ('Swimming',         '🏊', 5),
  ('Spinning',         '🚴', 6),
  ('Dance',            '🎭', 7),
  ('CrossFit',         '💪', 8),
  ('Zumba',            '💃', 9),
  ('Martial Arts',     '🥋', 10),
  ('Strength Training','🏋️', 11),
  ('Meditation',       '🧘', 12),
  ('Kids Activities',  '👧', 13),
  ('Wellness',         '🌿', 14)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.session_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read session_categories"
  ON public.session_categories FOR SELECT USING (true);

CREATE POLICY "Admin manage session_categories"
  ON public.session_categories FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
