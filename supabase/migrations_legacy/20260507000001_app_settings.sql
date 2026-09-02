-- =============================================================
-- App-wide settings table for admin-configurable values
-- =============================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed defaults
INSERT INTO public.app_settings (key, value, description)
VALUES
  ('credit_unit_value', '99',  'Fixed KES value of one credit (KES 99 = 1 credit)'),
  ('target_margin',     '0.20', 'Platform margin on each session booking (e.g. 0.20 = 20%)')
ON CONFLICT (key) DO NOTHING;

-- Allow authenticated users to read settings (admin reads via service role)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read app_settings"
  ON public.app_settings FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage app_settings"
  ON public.app_settings FOR ALL
  USING (auth.role() = 'service_role');
