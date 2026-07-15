-- CV-2d-2b (R1) — finding_cluster_verdicts: the judge-assisted SECOND join
-- path between findings and recurrence clusters (operator ruling 2026-07-14).
-- origin_signal_id remains the PRIMARY join; this store banks 70b verdicts on
-- (finding statement ↔ cluster-member signal statement) pairs so findings one
-- hop from their corroborating cluster still connect.
--
-- SIBLING to signal_recurrence_verdicts — deliberately NOT the same table:
-- the finalize prune invariant differs per side (finding-side identity is
-- checked against OPEN FINDINGS' statement identities; signal-side against
-- eligible outside signals), and signal_recurrence_verdicts' prune would
-- delete every row of this family as orphaned. Same evidence law otherwise:
-- insert-only, frozen forever by order-normalized pair_identity
-- (sha256("recur|" + min/max of normalizeForHash(statements)); the TS
-- contentIdentity helper is the single hashing authority), judge_model is
-- PROVENANCE ONLY and never part of the key, self-invalidating on statement
-- change (orphans pruned by the unscoped finalize). ids are provenance, no FK
-- (identity self-heals across re-ingests).

create table public.finding_cluster_verdicts (
  id                          uuid primary key default gen_random_uuid(),
  company_id                  uuid not null references public.companies(id) on delete cascade,
  pair_identity               text not null,
  finding_id                  uuid not null,
  signal_id                   uuid not null,
  finding_statement_identity  text not null,
  signal_statement_identity   text not null,
  verdict                     text not null check (verdict in ('accepted','rejected')),
  judge_model                 text not null,
  judge_reason                text not null,
  candidate_basis             text not null,
  created_at                  timestamptz not null default now(),
  unique (company_id, pair_identity)
);

create index finding_cluster_verdicts_company_idx
  on public.finding_cluster_verdicts (company_id);
