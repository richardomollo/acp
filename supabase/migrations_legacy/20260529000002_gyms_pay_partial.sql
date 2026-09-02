-- Add Pay Partial configuration columns to gyms

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS deposit_pct          INTEGER NOT NULL DEFAULT 30 CHECK (deposit_pct BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS cancellation_cutoff_hours INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS no_show_grace_mins   INTEGER NOT NULL DEFAULT 15;
