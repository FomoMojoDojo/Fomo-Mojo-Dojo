-- MPD-1a — market portfolio discovery schema (design signed 2026-07-15,
-- MARKET_PORTFOLIO_DISCOVERY_DESIGN.md).
--
-- (1) odi_market_definitions gains the emergent relationship texture:
--     relationship_kind — the executor's relation to the company as read off
--     the evidence (recipient/buyer/funder/referrer/…). Deliberately NO CHECK
--     constraint: the taxonomy is EMERGENT per company, never imposed by us.
--     relationship_basis — the one-clause evidence basis that makes the label
--     arguable on the surface. NULL on both = legacy defs (pre-discovery).
--
-- (2) market_discovery_verdicts — the frozen judge-verdict store for
--     discovery, mirroring the signal_recurrence_verdicts evidence law:
--     insert-only, UNIQUE(company_id, pair_identity), judge_model is
--     PROVENANCE ONLY (never part of the key), verdicts never re-rolled.
--     Identity hashing lives in the TS contentIdentity helper (single
--     authority — no SQL reimplementation):
--       market identity        = sha256(normalizeForHash(executor + "|" + jtbd))
--       solution_agnostic key  = sha256("mktsolagn|" + normalizeForHash(executor + "|" + jtbd))
--       same_market key        = sha256("mktsame|" + min|max of the two market identities)
--     Verdict semantics per kind (the judge's literal answer):
--       solution_agnostic: accepted = the job IS free of the company's
--         product/solution (candidate survives the gate).
--       same_market: accepted = the pairing IS the same market merely
--         reworded (the candidate folds/drops) — mirrors the claim-delta
--         judge_confirmed pairing semantics.
--     Prune invariant (this store's OWN, run at discovery finalize): a verdict
--     is orphaned when its market identities match neither a current market
--     def nor a candidate of the current run. A pruned rejected-candidate
--     verdict that re-emerges verbatim in a later forced re-gen re-judges
--     once — accepted and documented.

alter table public.odi_market_definitions
  add column relationship_kind text,
  add column relationship_basis text;

create table public.market_discovery_verdicts (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  pair_identity      text not null,
  verdict_kind       text not null check (verdict_kind in ('solution_agnostic','same_market')),
  market_a_identity  text not null,
  market_b_identity  text,
  verdict            text not null check (verdict in ('accepted','rejected')),
  judge_model        text not null,
  judge_reason       text not null,
  created_at         timestamptz not null default now(),
  constraint market_discovery_verdicts_shape check (
    (verdict_kind = 'solution_agnostic' and market_b_identity is null)
    or (verdict_kind = 'same_market' and market_b_identity is not null)
  ),
  unique (company_id, pair_identity)
);

create index market_discovery_verdicts_company_idx
  on public.market_discovery_verdicts (company_id);
