-- Community members with upcoming events they haven't RSVP'd to, or active
-- challenges they haven't engaged with, get no nudge at all today. Recurring
-- (every 4 days, until there's nothing left to remind about) combined digest
-- via email + push. Same Vault-secured pg_cron -> net.http_post -> edge
-- function pattern as send-partner-setup-reminders.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS community_reminder_sent_at timestamptz;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'send-community-engagement-reminders',
      '0 8 * * *',
      $sql$
      SELECT net.http_post(
        url := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/send-community-engagement-reminders',
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
