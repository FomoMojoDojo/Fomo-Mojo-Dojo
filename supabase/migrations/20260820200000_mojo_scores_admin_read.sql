-- S2 ruling (2026-08-20): the Mojo Score is always shown on the admin-gated First Read,
-- but mojo_scores carried only an owner/member policy — an admin who is not the company
-- owner/member read 0 rows (RLS-filtered), so the score silently vanished on the preview.
-- Fix: one SELECT-only admin read policy, mirroring the has_role pattern already trusted on
-- claims/signals. Additive (owner/member policy untouched), read-only privilege, no row writes.
-- CB1 (frozen) is unaffected — this is a read policy, not a data change. Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'mojo_scores'
      AND policyname = 'Admins can read all mojo_scores'
  ) THEN
    CREATE POLICY "Admins can read all mojo_scores"
      ON public.mojo_scores FOR SELECT
      USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;
