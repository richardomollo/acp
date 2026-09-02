-- =============================================================
-- Wire up email notifications via the send-email Edge Function.
-- Replace the two placeholder values below before running.
-- =============================================================

-- =============================================================
-- 1. Partner + customer notification on every new booking
-- =============================================================
CREATE OR REPLACE FUNCTION public.send_booking_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url          text  := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-email';
  v_key          text  := 'YOUR_SERVICE_ROLE_KEY';
  v_headers      jsonb := jsonb_build_object(
                            'Content-Type', 'application/json',
                            'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
                          );
  v_session      record;
  v_gym          record;
  v_customer     record;
  v_partner_email text;
  v_partner_name  text;
BEGIN
  -- Fetch session + gym details
  SELECT s.name, s.date, s.time, g.id AS gym_id, g.name AS gym_name,
         g.location AS gym_location, g.contact_email
  INTO   v_session
  FROM   sessions s
  JOIN   gyms g ON g.id = s.gym_id
  WHERE  s.id = NEW.session_id;

  -- Fetch customer details
  SELECT email, COALESCE(name, 'there') AS name
  INTO   v_customer
  FROM   users
  WHERE  id = NEW.user_id;

  -- Partner email: prefer gyms.contact_email, fall back to partners table if it exists
  v_partner_email := v_session.contact_email;
  v_partner_name  := v_session.gym_name;

  -- ── Notify partner ──────────────────────────────────────────
  IF v_partner_email IS NOT NULL THEN
    PERFORM net.http_post(
      url     := v_url,
      headers := v_headers,
      body    := jsonb_build_object(
        'type', 'new_booking',
        'data', jsonb_build_object(
          'email',        v_partner_email,
          'businessName', v_partner_name,
          'customerName', v_customer.name,
          'sessionName',  v_session.name,
          'sessionDate',  v_session.date,
          'sessionTime',  v_session.time,
          'sessionId',    NEW.session_id
        )
      )
    );
  END IF;

  -- ── Notify customer (booking confirmation) ───────────────────
  IF v_customer.email IS NOT NULL THEN
    PERFORM net.http_post(
      url     := v_url,
      headers := v_headers,
      body    := jsonb_build_object(
        'type', 'booking_confirmation',
        'data', jsonb_build_object(
          'email',            v_customer.email,
          'customerName',     v_customer.name,
          'sessionName',      v_session.name,
          'sessionDate',      v_session.date,
          'sessionTime',      v_session.time,
          'venueName',        v_session.gym_name,
          'venueLocation',    v_session.gym_location,
          'confirmationCode', NEW.confirmation_code
        )
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Re-attach trigger (drop first to allow CREATE OR REPLACE on the function)
DROP TRIGGER IF EXISTS on_booking_created ON bookings;
CREATE TRIGGER on_booking_created
  AFTER INSERT ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.send_booking_email();


-- =============================================================
-- 2. Trial welcome email on user signup
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
  v_url         text        := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-email';
  v_key         text        := 'YOUR_SERVICE_ROLE_KEY';
BEGIN
  -- Create user profile
  INSERT INTO public.users (
    id, email, credits,
    subscription_tier, subscription_status,
    trial_start_date, trial_end_date,
    created_at, updated_at
  )
  VALUES (
    NEW.id, NEW.email, v_credits,
    'free_trial', 'trial',
    v_trial_start, v_trial_end,
    now(), now()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Record trial subscription
  INSERT INTO public.subscriptions (
    user_id, tier, credits_allocated, credits_used,
    price, start_date, end_date, status, auto_renew,
    created_at, updated_at
  )
  VALUES (
    NEW.id, 'free_trial', v_credits, 0,
    0, v_trial_start, v_trial_end, 'active', false,
    now(), now()
  );

  -- Log credit grant
  INSERT INTO public.credit_transactions (
    user_id, transaction_type, credits, balance_after, description, created_at
  )
  VALUES (
    NEW.id, 'credit', v_credits, v_credits,
    '14-day free trial — 50 credits to explore partner venues',
    now()
  );

  -- Send trial welcome email (non-fatal if it fails)
  BEGIN
    IF v_url IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' || v_key
                   ),
        body    := jsonb_build_object(
          'type', 'trial_welcome',
          'data', jsonb_build_object('email', NEW.email)
        )
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- don't block signup if email fails
  END;

  RETURN NEW;
END;
$$;

-- Trigger already exists from migration 000001; replace the function only
-- (DROP TRIGGER + CREATE TRIGGER if you need to reset it)
