CREATE TABLE IF NOT EXISTS public.pt_specialisations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.pt_specialisations (name, sort_order) VALUES
  ('Weight Loss',         1),
  ('Strength Training',   2),
  ('HIIT',                3),
  ('Yoga',                4),
  ('Pilates',             5),
  ('Boxing',              6),
  ('CrossFit',            7),
  ('Rehabilitation',      8),
  ('Nutrition',           9),
  ('Running',             10),
  ('Swimming',            11),
  ('Sports Performance',  12),
  ('Dance',               13),
  ('Functional Training', 14),
  ('Martial Arts',        15)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.pt_specialisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read pt_specialisations"
  ON public.pt_specialisations FOR SELECT USING (true);

CREATE POLICY "Admin manage pt_specialisations"
  ON public.pt_specialisations FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));
