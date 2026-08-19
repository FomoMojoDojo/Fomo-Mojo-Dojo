-- Proof-category typing on claims (proof-guard gate, ruling 2026-08-19).
--
-- Provenance and proof are orthogonal axes: a claim's origin says nothing about
-- what CLASS of evidence can answer it. 'research_required' marks claims that sit
-- on the proof ladder — only research-grade evidence (e.g. an ODI survey) can
-- answer them; public-site material can never echo them. The delta compute reads
-- this to exclude such claims from pairing (they fall to publicly_silent, the
-- true statement). NULL = untyped: flows exactly as before (fail-direction law —
-- mistyping must cause normal flow, never a wrong silence).
--
-- Additive only: one nullable column + CHECK + a single minimal bootstrap rule.
-- Taxonomy expands only by operator ruling, never here.

alter table public.claims
  add column if not exists proof_category text
  check (proof_category in ('research_required', 'public_answerable'));

comment on column public.claims.proof_category is
  'Proof-ladder class: research_required = answerable only by research-grade evidence (excluded from public pairing); public_answerable = public material can speak to it; NULL = untyped (flows as before). Orthogonal to provenance.';

-- Bootstrap (the ONLY typing rule in this gate): an internally-declared unmet
-- need is a research question by construction. Frozen companies excluded — their
-- corpus is stale by law and byte-untouchable.
update public.claims c
set proof_category = 'research_required'
where c.claim_type = 'unmet_need'
  and c.provenance = 'internal_declared'
  and c.proof_category is null
  and not exists (select 1 from public.companies co where co.id = c.company_id and co.frozen);
