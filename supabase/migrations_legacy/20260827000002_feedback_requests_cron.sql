-- Hourly (not daily, like the other reminder crons) so a feedback request
-- goes out a few hours after an event ends rather than up to a day later.
-- Same Vault-secured pg_cron -> net.http_post -> edge function pattern as
-- send-booking-reminders / send-community-engagement-reminders.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'send-feedback-requests',
      '0 * * * *',
      $sql$
      SELECT net.http_post(
        url := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/send-feedback-requests',
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
