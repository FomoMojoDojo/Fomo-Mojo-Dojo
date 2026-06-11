-- B2.0.1 — durable syndication verdict store (one content identity, one verdict).
-- Root cause (B2.1 trace): ledger items whose judged text matches no signals row had
-- nowhere to persist a band-judge verdict, so each judge re-resolved live and the
-- llama3:8b band judge flipped on the SAME item within one run. Verdicts are now keyed
-- by content identity (company + source_url + hash of normalized judged text), not by
-- signals-row match. First resolved verdict wins (insert-ignore); unresolved verdicts
-- (local model unavailable) are NEVER persisted — fail-safe stays exclusion.
create table if not exists public.syndication_verdicts (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  source_url text not null,
  text_hash text not null,
  syndicated boolean not null,
  syndication_score numeric not null,
  method text not null,
  created_at timestamptz not null default now(),
  unique (company_id, source_url, text_hash)
);

alter table public.syndication_verdicts enable row level security;

create policy "service role full access on syndication_verdicts"
  on public.syndication_verdicts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
