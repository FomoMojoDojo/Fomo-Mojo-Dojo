-- Scheduled MojoMap analysis — runs daily via pg_cron + pg_net.
--
-- One-time setup required on the Supabase project (Dashboard → SQL Editor):
--   ALTER DATABASE postgres SET app.service_role_key = '<your service role key>';
--   ALTER DATABASE postgres SET app.supabase_functions_url = 'https://<project-ref>.supabase.co/functions/v1';
--
-- For local dev the URL is: http://host.docker.internal:54321/functions/v1

CREATE OR REPLACE FUNCTION public.trigger_scheduled_mojo_analysis()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec          RECORD;
  service_key  TEXT;
  fn_url       TEXT;
BEGIN
  service_key := current_setting('app.service_role_key', true);
  fn_url       := current_setting('app.supabase_functions_url', true);

  IF service_key IS NULL OR service_key = '' THEN
    RAISE WARNING '[mojo-analysis] app.service_role_key not set — skipping scheduled run';
    RETURN;
  END IF;

  IF fn_url IS NULL OR fn_url = '' THEN
    RAISE WARNING '[mojo-analysis] app.supabase_functions_url not set — skipping scheduled run';
    RETURN;
  END IF;

  FOR rec IN
    SELECT id
    FROM public.companies
    WHERE engagement_phase IS NOT NULL
      AND engagement_phase NOT IN ('flow', 'validate_flow')
  LOOP
    PERFORM net.http_post(
      url     := fn_url || '/run-mojo-analysis',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || service_key
                 ),
      body    := jsonb_build_object(
                   'company_id',   rec.id::text,
                   'trigger_type', 'scheduled'
                 )::text
    );
  END LOOP;
END;
$$;

-- Schedule: daily at 06:00 UTC.
-- pg_cron is available on hosted Supabase; enable it in Dashboard → Database → Extensions if needed.
SELECT cron.schedule(
  'mojo-analysis-daily',
  '0 6 * * *',
  'SELECT public.trigger_scheduled_mojo_analysis()'
);
