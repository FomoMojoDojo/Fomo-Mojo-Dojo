-- FLEET GRANT HARDENING — grants only, no policy and no RLS state change (2026-09-30).
--
-- WHY. Two census findings, both about the GRANT layer rather than the policy layer:
--   1. 118 of the 118 public tables (and both public views) grant TRUNCATE, REFERENCES and TRIGGER to
--      `anon` AND `authenticated`. TRUNCATE is NOT subject to row level security — no policy can stop
--      it, only the grant can — and it fires no row triggers, so a truncated table leaves no audit
--      trace of having been emptied. Every delete-audit trigger in this schema is bypassed by it.
--      REFERENCES and TRIGGER let a caller attach constraints or triggers to someone else's table.
--      No app role has business holding any of the three, on any table, RLS on or off.
--   2. 29 public tables still have RLS off, and on those the grant is the ONLY gate. `anon` — an
--      unauthenticated caller holding just the publishable key — reads all 29 over PostgREST:
--      40,435 rows across ~21 companies, with no tenant scoping. Verified read-only on 2026-09-30.
--
-- WHAT THIS IS AND IS NOT. Grants only, deliberately:
--   * F1 revokes TRUNCATE, REFERENCES, TRIGGER from anon and authenticated on every table in schema
--     public, and stops new tables granting them.
--   * F2 revokes EVERYTHING from anon on the 29 RLS-off tables. `authenticated` KEEPS
--     SELECT/INSERT/UPDATE/DELETE on them — narrowing that is each table's own RLS brief (F3), because
--     doing it here without a policy would break the writers that legitimately use those verbs.
--   * NO policy is created, altered or dropped. NO table changes RLS state. NO DML. Nothing about
--     service_role, which carries rolbypassrls and is unaffected by all of it.
--   * This does NOT make the 29 safe. After this migration `authenticated` still reads all 29
--     cross-tenant — any signed-in user of any company. It closes the anonymous hole and the
--     TRUNCATE hole; the tenant-scoping hole is F3, one table per brief.
--
-- KNOWN GAP, recorded rather than worked around: TWO roles hold default privileges for TABLES in
-- schema public — `postgres` and `supabase_admin`, each granting arwdDxtm to anon and authenticated.
-- Only the `postgres` one is altered below. `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` is
-- refused to postgres ("permission denied to change default privileges"): postgres is not a superuser
-- and is not a member of supabase_admin, and that role's password is not held here. In practice our
-- migrations run as postgres, so a table created by THIS repo picks up the postgres default and will
-- not grant the three; a table created by Supabase's own internal provisioning (as supabase_admin)
-- still would. Closing that needs supabase_admin credentials and is its own brief.
--
-- ALSO OBSERVED, not changed: the default ACLs additionally grant MAINTAIN (PG17 `m`) to anon and
-- authenticated. F1 names three privileges and this migration revokes exactly those three; MAINTAIN
-- is filed for a decision rather than swept in silently.

-- ── F1a. every table (and view) in schema public ──────────────────────────────────────────────────
-- "ALL TABLES" covers views too, which is wanted: both public views carry the same three grants.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- ── F1b. and for tables that do not exist yet ─────────────────────────────────────────────────────
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;

-- ── F2. anon holds NOTHING on the 29 RLS-off tables ───────────────────────────────────────────────
-- Listed by name, one statement each, so the set this migration acted on is legible forever rather
-- than being whatever the catalogue happened to return on the day. authenticated is untouched here.
REVOKE ALL ON TABLE public.check_outcome_removals FROM anon;
REVOKE ALL ON TABLE public.claim_contest_removals FROM anon;
REVOKE ALL ON TABLE public.claim_delta_looks FROM anon;
REVOKE ALL ON TABLE public.claim_delta_rejection_removals FROM anon;
REVOKE ALL ON TABLE public.claim_delta_rejections FROM anon;
REVOKE ALL ON TABLE public.claim_delta_relevance_override_removals FROM anon;
REVOKE ALL ON TABLE public.claim_deltas FROM anon;
REVOKE ALL ON TABLE public.claim_provenance_drift FROM anon;
REVOKE ALL ON TABLE public.claim_removals FROM anon;
REVOKE ALL ON TABLE public.doc_voice_verdicts FROM anon;
REVOKE ALL ON TABLE public.excerpt_verifications FROM anon;
REVOKE ALL ON TABLE public.finding_cluster_verdicts FROM anon;
REVOKE ALL ON TABLE public.finding_recurrence FROM anon;
REVOKE ALL ON TABLE public.first_read_fill_runs FROM anon;
REVOKE ALL ON TABLE public.first_read_proposals FROM anon;
REVOKE ALL ON TABLE public.market_discovery_verdicts FROM anon;
REVOKE ALL ON TABLE public.market_lens FROM anon;
REVOKE ALL ON TABLE public.market_lens_links FROM anon;
REVOKE ALL ON TABLE public.normative_industry_sources FROM anon;
REVOKE ALL ON TABLE public.normative_job_steps FROM anon;
REVOKE ALL ON TABLE public.normative_source_removals FROM anon;
REVOKE ALL ON TABLE public.normative_step_recurrence FROM anon;
REVOKE ALL ON TABLE public.normative_step_source_verdicts FROM anon;
REVOKE ALL ON TABLE public.outside_page_snapshots FROM anon;
REVOKE ALL ON TABLE public.provenance_remints FROM anon;
REVOKE ALL ON TABLE public.public_reads FROM anon;
REVOKE ALL ON TABLE public.route_lens_refs FROM anon;
REVOKE ALL ON TABLE public.signal_recurrence_verdicts FROM anon;
REVOKE ALL ON TABLE public.test_removals FROM anon;
