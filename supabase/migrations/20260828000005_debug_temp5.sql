CREATE OR REPLACE FUNCTION public._debug_get_cron_secret()
RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public._debug_get_cron_secret() TO service_role;
