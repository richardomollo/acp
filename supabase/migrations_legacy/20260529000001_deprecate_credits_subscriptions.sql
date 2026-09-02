-- Deprecate subscriptions, subscription_plans, credit_transactions
-- Tables are kept for historical data; deprecated_at marks them as inactive

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS deprecated_at TIMESTAMPTZ DEFAULT NOW();
