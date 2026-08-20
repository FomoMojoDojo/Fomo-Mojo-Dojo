# Data act — mojo_scores admin read policy (2026-08-20)

Operator-ruled (S2, 2026-08-20). Restores the Mojo Score on the admin-gated First Read:
`mojo_scores` carried only an owner/member policy, so an admin who is not the company's
owner/member read 0 rows (RLS-filtered) and the always-shown score silently vanished.

- Backup BEFORE the write: `~/backups/pre-mojoscore-rls-20260820.sql` — 13 MB,
  md5 `396e361bf22d7a66a326866f745218d8`.
- Migration: `supabase/migrations/20260820200000_mojo_scores_admin_read.sql`
  (idempotent; stamped in `supabase_migrations.schema_migrations`).
- Change (additive, read-only privilege; owner/member policy untouched):
  ```sql
  CREATE POLICY "Admins can read all mojo_scores"
    ON public.mojo_scores FOR SELECT
    USING (has_role(auth.uid(), 'admin'::app_role));
  ```
  Mirrors the `has_role(...,'admin')` pattern already trusted on `claims` / `signals`.

## Verification

- Admin non-owner (throwaway-srctag-gate) reads CB2 outside score = **16** (was 0 rows).
- Owner/member access **unchanged** — `mojo_scores_owner_access` policy untouched.
- Anon reads **0** (`SET ROLE anon` → 0 rows; `has_role(NULL,'admin')` false, owner needs uid).
- CB1 (58b2b15b, FROZEN) mojo_scores **byte-identical**: 11 rows,
  md5(id||total_score||methodology) = `445b4fc5f7da82588c7815d28514dab9` before and after.

Read policy only — no row writes; the company freeze is unaffected.
