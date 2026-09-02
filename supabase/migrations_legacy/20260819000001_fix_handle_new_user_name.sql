-- handle_new_user() inserted public.users rows without `name`, even when
-- auth.signUp({ options: { data: { name, phone } } }) had already put those
-- values into raw_user_meta_data. Client code then tried a follow-up
-- `insert` of name/phone into the row the trigger had just created, which
-- always failed on the id primary key (silently swallowed in one call site,
-- thrown as a scary "signup failed" error in another) — so names never made
-- it into public.users at all. Populate name/phone directly from
-- raw_user_meta_data here so every signup path is correct from the start.
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
  v_name        text        := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name')), '');
  v_phone       text        := NULLIF(trim(NEW.raw_user_meta_data->>'phone'), '');
BEGIN
  INSERT INTO public.users (
    id, email, name, phone, credits,
    subscription_tier, subscription_status,
    trial_start_date, trial_end_date,
    created_at, updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_name,
    v_phone,
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

-- One-time backfill: recover names for existing users whose public.users.name
-- is NULL but whose auth signup metadata actually had a name/full_name that
-- the old buggy trigger dropped on the floor.
UPDATE public.users u
SET name = NULLIF(trim(COALESCE(au.raw_user_meta_data->>'name', au.raw_user_meta_data->>'full_name')), '')
FROM auth.users au
WHERE au.id = u.id
  AND u.name IS NULL
  AND NULLIF(trim(COALESCE(au.raw_user_meta_data->>'name', au.raw_user_meta_data->>'full_name')), '') IS NOT NULL;
