-- Reminder idempotency columns, same pattern as bookings/experience_bookings/
-- pt_bookings in 20260811000001_booking_reminders.sql.
ALTER TABLE public.community_event_attendees
  ADD COLUMN IF NOT EXISTS reminder_3d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1d_sent_at timestamptz;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'send-community-event-reminders',
      '15 6 * * *',
      $sql$
      SELECT net.http_post(
        url := 'https://kdmhmkwzanqnwehcddvr.supabase.co/functions/v1/send-community-event-reminders',
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
