-- NEG-CACHE — claim_delta_rejections: the negative cache for MODEL-rejected
-- claim-delta candidate pairs (proposer- or judge-rejected). Before this table,
-- a rejection left no row, so every recompute re-rolled every rejected
-- candidate (~26s of model calls producing zero rows on FMD, re-paid per run)
-- and a re-roll could FLIP a verdict — the F1 flip (2026-07-11) turned a
-- twice-rejected pairing into a judge-confirmed echo the operator then ruled
-- substantively wrong and tombstoned.
--
-- FREEZE-ON-REJECT (operator-signed 2026-07-12): the first verdict binds,
-- keyed by content_identity ALONE — the same evidence law that freezes
-- positive verdicts in claim_deltas. No TTL. gen_model/judge_model are
-- PROVENANCE ONLY, never part of the key (a model upgrade re-rolls only via a
-- future deliberate operator affordance, not silently). The cache is
-- self-invalidating on real content change: statement text changes ⇒ the pair
-- identity changes ⇒ cache miss ⇒ fresh roll; the orphaned row is pruned by
-- the next finalize (the !scoped pass that owns silences + stale-sweep).
--
-- This table is DERIVED MODEL OUTPUT, not evidence: deletes cascade with their
-- claims (audited by the claim's own claim_removals row) and need no dedicated
-- delete-audit. It is DISTINCT from operator rejected_pairing tombstones
-- (claim_deltas.operator_disposition) — those are permanent, operator-only,
-- prune-exempt; nothing here may write through or be confused with them.
-- The client never reads this table: counts reach it via the plan manifest.

create table public.claim_delta_rejections (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  declared_claim_id  uuid not null references public.claims(id) on delete cascade,
  public_claim_id    uuid not null references public.claims(id) on delete cascade,
  content_identity   text not null,
  rejected_by        text not null check (rejected_by in ('proposer','judge')),
  gen_model          text not null,
  judge_model        text,
  reject_reason      text,
  computed_at        timestamptz not null default now(),
  -- a proposer rejection means the judge never ran; a judge rejection names it
  constraint claim_delta_rejections_judge_shape check (
    (rejected_by = 'proposer' and judge_model is null)
    or (rejected_by = 'judge' and judge_model is not null)
  ),
  unique (company_id, content_identity)
);

create index claim_delta_rejections_company_idx on public.claim_delta_rejections (company_id);
