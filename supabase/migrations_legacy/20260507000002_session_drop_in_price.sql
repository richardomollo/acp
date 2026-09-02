-- Add per-session drop-in price so credits can be computed from
-- session-level pricing rather than a single gym-wide floor amount.
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS drop_in_price NUMERIC(10,2);
