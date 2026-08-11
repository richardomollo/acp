-- Automated booking reminders (email + WhatsApp), sent 3 days and 1 day
-- before a booking's date. Idempotency columns mirror the existing
-- one-time-action pattern used elsewhere (deposit_paid_at, check_in_time).

-- pg_cron wasn't previously enabled on this project (the pre-existing
-- 'mark-no-shows' cron.schedule call in 20260518000004_bookings_no_show.sql
-- silently no-op'd for the same reason). Enable it so the schedule below
-- actually takes effect.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reminder_3d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1d_sent_at timestamptz;

ALTER TABLE public.experience_bookings
  ADD COLUMN IF NOT EXISTS reminder_3d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1d_sent_at timestamptz;

ALTER TABLE public.pt_bookings
  ADD COLUMN IF NOT EXISTS reminder_3d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1d_sent_at timestamptz;

-- Store the cron secret in Vault (alongside the existing 'service_role_key'
-- secret) so the pg_cron job below can attach it as a header without ever
-- putting the value in migration source. The edge function itself checks
-- this same value via its own CRON_SECRET env var (set separately via
-- `supabase secrets set`).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    PERFORM vault.create_secret('a9c1cec445f1a4196d2df7180661ca851bc9393fe48522a5', 'cron_secret');
  END IF;
END $$;

-- Daily cron: calls the send-booking-reminders edge function, which finds
-- bookings/experience_bookings/pt_bookings 3 or 1 day(s) out and sends
-- email + WhatsApp reminders (deposit-balance reminder included where
-- applicable). 06:00 UTC = 09:00 EAT.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'send-booking-reminders',
      '0 6 * * *',
      $sql$
      SELECT net.http_post(
        url := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/send-booking-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
        ),
        body := '{}'::jsonb
      );
      $sql$
    );
  END IF;
END $$;
