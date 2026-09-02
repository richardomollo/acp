-- =============================================================
-- Trial provisioning trigger
-- Fires after every INSERT into auth.users (i.e. on every signup).
-- Creates the users row, a subscriptions record, and the initial
-- credit_transactions entry — all as one atomic operation.
-- =============================================================

-- 1. Ensure the free_trial plan exists in subscription_plans
INSERT INTO public.subscription_plans (tier, name, credits, price, duration_days, description, is_active)
VALUES (
  'free_trial',
  'Free Trial',
  50,
  0,
  14,
  '14-day free trial with 50 credits. Visit each partner venue once.',
  true
)
ON CONFLICT (tier) DO UPDATE SET
  credits      = 50,
  price        = 0,
  duration_days = 14,
  is_active    = true;

-- =============================================================
-- 2. Provisioning function
-- =============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_start timestamptz := now();
  v_trial_end   timestamptz := now() + interval '14 days';
  v_credits     int         := 50;
BEGIN
  -- Create the user profile row
  INSERT INTO public.users (
    id,
    email,
    credits,
    subscription_tier,
    subscription_status,
    trial_start_date,
    trial_end_date,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_credits,
    'free_trial',
    'trial',
    v_trial_start,
    v_trial_end,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;  -- safe if the row already exists

  -- Record the trial subscription
  INSERT INTO public.subscriptions (
    user_id,
    tier,
    credits_allocated,
    credits_used,
    price,
    start_date,
    end_date,
    status,
    auto_renew,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    'free_trial',
    v_credits,
    0,
    0,
    v_trial_start,
    v_trial_end,
    'active',
    false,
    now(),
    now()
  );

  -- Log the initial credit grant
  INSERT INTO public.credit_transactions (
    user_id,
    transaction_type,
    credits,
    balance_after,
    description,
    created_at
  )
  VALUES (
    NEW.id,
    'credit',
    v_credits,
    v_credits,
    '14-day free trial — 50 credits to explore partner venues',
    now()
  );

  RETURN NEW;
END;
$$;

-- =============================================================
-- 3. Attach trigger to auth.users
-- =============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
