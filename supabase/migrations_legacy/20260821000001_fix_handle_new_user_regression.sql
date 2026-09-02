-- 20260819000001 fixed name/phone capture on signup, but its template was
-- copied from a pre-20260728000002 version of handle_new_user() and
-- accidentally reintroduced the free-trial credits/subscriptions/
-- credit_transactions grant that 20260728000002_stop_credits_grant_on_signup
-- deliberately removed (credits/subscriptions were killed as a product
-- concept in favour of direct pay-per-booking). Restore the stripped-down
-- shape, keeping only the name/phone fix.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name  text := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name')), '');
  v_phone text := NULLIF(trim(NEW.raw_user_meta_data->>'phone'), '');
BEGIN
  INSERT INTO public.users (
    id, email, name, phone, created_at, updated_at
  )
  VALUES (
    NEW.id, NEW.email, v_name, v_phone, now(), now()
  )
  ON CONFLICT DO NOTHING;  -- catches id AND email unique constraint conflicts

  RETURN NEW;
END;
$$;
