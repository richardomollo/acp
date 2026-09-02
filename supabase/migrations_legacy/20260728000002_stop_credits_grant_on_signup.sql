-- Credits and subscription plans are being killed as a product concept in
-- favour of direct pay-per-booking. This stops new signups from being
-- granted a free-trial credits balance / subscriptions row / credit_transactions
-- entry, without dropping any existing columns or tables (those are left in
-- place, deprecated, for now — see 20260529000001_deprecate_credits_subscriptions.sql).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id, email, created_at, updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    now(),
    now()
  )
  ON CONFLICT DO NOTHING;  -- catches id AND email unique constraint conflicts

  RETURN NEW;
END;
$$;
