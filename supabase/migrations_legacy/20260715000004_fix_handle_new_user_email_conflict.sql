-- handle_new_user uses ON CONFLICT (id) DO NOTHING which only catches
-- primary key conflicts. If public.users has a unique constraint on email
-- and the same email already exists (e.g. leftover from a deleted auth user),
-- the trigger throws an unhandled exception → "Database error saving new user".
-- Fix: use ON CONFLICT DO NOTHING (no column specified) which catches ALL
-- unique/exclusion constraint violations on the table.

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
  ON CONFLICT DO NOTHING;  -- catches id AND email unique constraint conflicts

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
