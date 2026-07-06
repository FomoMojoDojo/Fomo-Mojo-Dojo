-- Market-lens layer M1 — additive tables ONLY (signed PROPOSE design §2 + §4).
-- The lens FORMALIZES the already-live (company_id, journey_key) pair: the lens is
-- the MARKET (customer + positioning + gaps), NOT the outcome — it ANCHORS one
-- outcome by reference (anchor_outcome_id), never equals it. Routes/legs/tests stay
-- single-instance in the company pool and are REFERENCED into lenses via
-- route_lens_refs (R2 keystone) — no single-parent lens_id on routes, ever.
-- No child-table columns, no rewrites. Rollback: DROP the three tables.

create table public.market_lens (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  journey_key      text not null,                 -- formalizes the live soft key
  title            text,                          -- display name (seeded from job_steps.journey_title)
  -- portfolio state (Act (a); also the billing line)
  portfolio_state  text not null default 'active'   check (portfolio_state in ('active','dormant')),
  portfolio_role   text not null default 'support'  check (portfolio_role in ('lead','support')),
  -- vertical coherence: how this lens ladders to the corporate core
  coherence_status text not null default 'unassessed' check (coherence_status in ('unassessed','coherent','tension','incoherent')),
  coherence_note   text,
  -- outcome ANCHOR (points at one; does not equal one). managed_outcomes.journey_key
  -- is hereby demoted to provenance (R-out); THIS column is the binding authority.
  anchor_outcome_id uuid references public.managed_outcomes(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (company_id, journey_key)
);

-- horizontal cross-lens links (reinforce/cannibalize) — company-scoped edge list
create table public.market_lens_links (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  from_lens_id uuid not null references public.market_lens(id) on delete cascade,
  to_lens_id   uuid not null references public.market_lens(id) on delete cascade,
  link_type    text not null check (link_type in ('reinforces','cannibalizes')),
  note         text,
  created_at   timestamptz not null default now(),
  unique (from_lens_id, to_lens_id, link_type),
  check (from_lens_id <> to_lens_id)
);

-- R2 keystone: routes stay single-instance (one leg tree, one test history),
-- referenced into N lenses. ref_state='excluded' = assessed-and-rejected,
-- distinct from never-assessed (no row).
create table public.route_lens_refs (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  route_id   uuid not null references public.routes(id) on delete cascade,
  lens_id    uuid not null references public.market_lens(id) on delete cascade,
  ref_state  text not null default 'referenced' check (ref_state in ('referenced','excluded')),
  created_at timestamptz not null default now(),
  unique (route_id, lens_id)
);
