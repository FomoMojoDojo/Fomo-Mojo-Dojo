-- CV-2d-1 — CONSISTENT compute: recurrence of the same fact across independent
-- outside sources (design signed 2026-07-14, CV2D_CONSISTENT_COMPUTE_DESIGN.md).
--
-- Two layers:
--   signal_recurrence_verdicts — the EVIDENCE layer. One row per judged
--     candidate pair (accepted|rejected), frozen by order-normalized
--     pair_identity (sha256("recur|" + min/max of normalizeForHash(claim_text));
--     the TS contentIdentity helper is the single hashing authority — no SQL
--     reimplementation). Insert-only; never re-rolled (freeze-on-verdict, the
--     claim_delta_rejections evidence law, applied to BOTH verdict directions
--     because here the accept IS the product). judge_model is PROVENANCE ONLY,
--     never part of the key. Self-invalidating: statement text change ⇒ pair
--     identity change ⇒ cache miss ⇒ fresh judgment; orphaned rows are pruned
--     by the unscoped finalize.
--   finding_recurrence — the DERIVED render layer. Clusters = union-find over
--     accepted verdicts, computed at finalize; a finding joins via its
--     origin_signal_id. Reconciled in place (update-on-change / insert / delete)
--     so a no-change rerun leaves rows byte-identical INCLUDING computed_at.
--     Rebuilding this table is allowed because the verdicts are the evidence.
--
-- Independence (design Q3): distinct registrable domain; own-domain excluded;
-- signals.syndicated_from_client = true excluded; same host twice counts once;
-- mirror detection out of scope. Signal ids are provenance (no FK — signals may
-- be cleaned up without destroying the judged evidence; identity self-heals).

create table public.signal_recurrence_verdicts (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  pair_identity         text not null,
  signal_a_id           uuid not null,
  signal_b_id           uuid not null,
  statement_a_identity  text not null,
  statement_b_identity  text not null,
  verdict               text not null check (verdict in ('accepted','rejected')),
  judge_model           text not null,
  judge_reason          text not null,
  candidate_basis       text not null,
  created_at            timestamptz not null default now(),
  unique (company_id, pair_identity)
);

create index signal_recurrence_verdicts_company_idx
  on public.signal_recurrence_verdicts (company_id);

create table public.finding_recurrence (
  finding_id           uuid primary key references public.findings(id) on delete cascade,
  company_id           uuid not null references public.companies(id) on delete cascade,
  cluster_signal_ids   jsonb not null,
  distinct_host_count  integer not null,
  host_list            jsonb not null,
  verdict_count        integer not null,
  computed_at          timestamptz not null default now()
);

create index finding_recurrence_company_idx
  on public.finding_recurrence (company_id);
