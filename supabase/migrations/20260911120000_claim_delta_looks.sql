-- Gate 9a — claim_delta_looks: "we looked, and could not verify" is an INTEGRITY RECORD, never a rejection.
--
-- THE LIVELOCK. The delta write loop's span gate has two failure modes. A span that is a real
-- observed substring but too short is a substantive not-an-echo and is banked as a rejection. A span
-- that is NOT in the observed statement (or no span at all) is a MECHANICAL failure — the judge did
-- not answer the question — and, by design (2026-08), it was recorded NOWHERE: no rejection (that would
-- freeze a not-an-echo by content identity), no pair. The plan subtracts exactly three classes
-- (cached row, tombstone, banked rejection), so an unrecorded pair was fresh again on every re-plan,
-- packDeltaChunks re-packed it as chunks[0], and a deterministic judge (temp 0, seed 42) returned the
-- identical wrong span every pass. Edgewood 41322cd1 (2026-09-11): claim a6e52c6d × one public,
-- three passes, zero writes, `livelock: plan yields work write refuses`; the 2026-08-21 series burned
-- ~190 passes on one chunk before the guard existed.
--
-- THE RECORD. A look is what it says: this pair was judged under this span-gate criterion and the
-- answer could not be verified. It asserts neither echo nor no-echo. It is:
--   • written ONCE, inline, at the deterministic span-gate branch only (reasons below); chunk deaths
--     (judge error, wall-clock) are NOT looks — a retry is not pointless for those, so they stay fresh;
--   • subtracted by the plan as a FOURTH class at the current span_gate_version, and carried in the
--     manifest and run totals so it is visible, never silent;
--   • re-openable ONLY by a criterion change: span_gate_version bumps when the span rule or the judge
--     model changes (standing rule); the old rows stand as history under their version;
--   • never read by any reader of claim_delta_rejections or claim_deltas — a look is not a "not an
--     echo" and must never surface as a gap or a rejection. Silence rails are unchanged: the declared
--     claim stays publicly_silent, the public internally_silent, exactly as before.
-- judge_model and span_cited are provenance: what was asked and what it answered.
--
-- Same shape as claim_delta_rejections: service-role only (no RLS — the client never reads it;
-- counts reach surfaces via the plan manifest / integrity_runs), freeze-triggered.

create table public.claim_delta_looks (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  pairing_kind       text not null default 'internal_vs_public',
  content_identity   text not null,
  declared_claim_id  uuid not null references public.claims(id) on delete cascade,
  public_claim_id    uuid not null references public.claims(id) on delete cascade,
  reason             text not null check (reason in ('span_not_in_observed', 'span_missing')),
  judge_model        text,
  span_cited         text,
  span_gate_version  int  not null default 1,
  looked_at          timestamptz not null default now(),
  run_id             uuid references public.long_runner_runs(id) on delete set null,
  unique (company_id, content_identity, pairing_kind, span_gate_version)
);

create index claim_delta_looks_company_idx on public.claim_delta_looks (company_id, pairing_kind, span_gate_version);

-- The freeze boundary — not inherited; every company_id-bearing table attaches it itself.
create trigger enforce_company_freeze
  before insert or delete or update on public.claim_delta_looks
  for each row execute function enforce_company_freeze();
