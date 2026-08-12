-- Approved venue partners who never upload a photo or add any sessions/
-- experiences sit there looking broken to customers, with no nudge to
-- finish setup. Recurring (every 14 days, until complete) reminder email,
-- same Vault-secured pg_cron -> net.http_post -> edge function pattern as
-- send-booking-reminders (20260811000001_booking_reminders.sql).

ALTER TABLE public.gyms
  ADD COLUMN IF NOT EXISTS setup_reminder_sent_at timestamptz;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'send-partner-setup-reminders',
      '0 7 * * *',
      $sql$
      SELECT net.http_post(
        url := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/send-partner-setup-reminders',
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
