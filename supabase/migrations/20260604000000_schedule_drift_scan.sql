-- Scheduled drift scan — runs daily via pg_cron + pg_net.
-- Calls assess-surface-drift per active company, scanning all 4 surface types.
--
-- One-time setup required on the Supabase project (Dashboard → SQL Editor):
--   ALTER DATABASE postgres SET app.service_role_key = '<your service role key>';
--   ALTER DATABASE postgres SET app.supabase_functions_url = 'https://<project-ref>.supabase.co/functions/v1';
--
-- For local dev the URL is: http://host.docker.internal:54321/functions/v1
-- pg_cron must be enabled in Dashboard → Database → Extensions on hosted Supabase.

CREATE OR REPLACE FUNCTION public.trigger_scheduled_drift_scan()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec         RECORD;
  service_key TEXT;
  fn_url      TEXT;
BEGIN
  service_key := current_setting('app.service_role_key', true);
  fn_url      := current_setting('app.supabase_functions_url', true);

  IF service_key IS NULL OR service_key = '' THEN
    RAISE WARNING '[drift-scan] app.service_role_key not set — skipping scheduled run';
    RETURN;
  END IF;

  IF fn_url IS NULL OR fn_url = '' THEN
    RAISE WARNING '[drift-scan] app.supabase_functions_url not set — skipping scheduled run';
    RETURN;
  END IF;

  -- Each company is a separate HTTP call so per-company errors are isolated.
  FOR rec IN
    SELECT id
    FROM public.companies
    WHERE program_phase IS NOT NULL
  LOOP
    PERFORM net.http_post(
      url     := fn_url || '/assess-surface-drift',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || service_key
                 ),
      body    := jsonb_build_object('company_id', rec.id::text)::text
    );
  END LOOP;
END;
$$;

-- Schedule: daily at 02:00 UTC (offset from mojo-analysis at 06:00 UTC).
-- Skipped gracefully if pg_cron is not installed (local dev without the extension).
-- On hosted Supabase, enable pg_cron in Dashboard → Database → Extensions.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
    PERFORM cron.schedule(
      'drift-scan-daily',
      '0 2 * * *',
      'SELECT public.trigger_scheduled_drift_scan()'
    );
  END IF;
END $$;
