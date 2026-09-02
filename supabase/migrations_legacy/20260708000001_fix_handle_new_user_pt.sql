-- Fix handle_new_user() to skip subscription/credits provisioning for
-- partner and personal_trainer signups. They are B2B users and should not
-- receive a free-trial subscription row. Previously the trigger inserted
-- into subscriptions/credit_transactions unconditionally, causing an
-- unhandled exception for PT signups and making auth.signUp fail with
-- "database error saving new user".
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role        text        := NEW.raw_user_meta_data->>'role';
  v_trial_start timestamptz := now();
  v_trial_end   timestamptz := now() + interval '14 days';
  v_credits     int         := 50;
BEGIN
  -- Create the public.users row for every signup type.
  -- Partners and PTs get 0 credits and no trial dates.
  INSERT INTO public.users (
    id, email, credits,
    subscription_tier, subscription_status,
    trial_start_date, trial_end_date,
    created_at, updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    CASE WHEN v_role IN ('personal_trainer', 'partner') THEN 0 ELSE v_credits END,
    CASE WHEN v_role IN ('personal_trainer', 'partner') THEN NULL ELSE 'free_trial' END,
    CASE WHEN v_role IN ('personal_trainer', 'partner') THEN NULL ELSE 'trial' END,
    CASE WHEN v_role IN ('personal_trainer', 'partner') THEN NULL ELSE v_trial_start END,
    CASE WHEN v_role IN ('personal_trainer', 'partner') THEN NULL ELSE v_trial_end END,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Only provision trial subscription for regular customer accounts.
  IF v_role NOT IN ('personal_trainer', 'partner') THEN
    INSERT INTO public.subscriptions (
      user_id, tier, credits_allocated, credits_used,
      price, start_date, end_date, status, auto_renew,
      created_at, updated_at
    )
    VALUES (
      NEW.id, 'free_trial', v_credits, 0,
      0, v_trial_start, v_trial_end, 'active', false,
      now(), now()
    )
    ON CONFLICT DO NOTHING;

    INSERT INTO public.credit_transactions (
      user_id, transaction_type, credits, balance_after, description, created_at
    )
    VALUES (
      NEW.id, 'credit', v_credits, v_credits,
      '14-day free trial — 50 credits to explore partner venues',
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
