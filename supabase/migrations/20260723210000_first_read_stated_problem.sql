-- V2-2 — Act 1 "What You Say": the client's publicly stated problem, distilled from
-- their OWN-DOMAIN public content (client_voice declared register) — never from
-- internal uploads, the company-creation form, or outside voices.
--
-- REGISTER LOCK: register is 'client_voice' ONLY (a CHECK) — Act 1 is the declared
-- own-voice read; it can never silently blend the internal-register form content.
-- VERBATIM QUOTE: optional own-domain lift (CV-2e), byte-exact substring of the
-- retained crawl snippet it came from — same guard shape as signals.quote.

create table public.first_read_stated_problem (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  statement          text not null,                 -- the distilled stated problem (generated substance)
  statement_identity text not null,                 -- contentIdentity(statement)
  register           text not null default 'client_voice',
  quote              text,                           -- verbatim own-domain line (optional)
  quote_source_text  text,                           -- retained crawl snippet the quote was lifted from
  gen_model          text not null,
  judge_model        text,
  generated_at       timestamptz not null default now(),
  unique (company_id),                               -- one stated problem per company (upsert)
  constraint fr_stated_problem_register_check check (register = 'client_voice'),
  constraint fr_stated_problem_quote_verbatim check (
    quote is null
    or (quote_source_text is not null and length(btrim(quote)) > 0 and position(quote in quote_source_text) > 0)
  )
);

create index first_read_stated_problem_company_idx on public.first_read_stated_problem (company_id);

alter table public.first_read_stated_problem enable row level security;

create policy "Users can view company first_read_stated_problem"
  on public.first_read_stated_problem for select
  to authenticated
  using (
    exists (select 1 from public.company_members cm
            where cm.company_id = first_read_stated_problem.company_id and cm.user_id = auth.uid())
    or public.has_role(auth.uid(), 'admin')
  );

create policy "Admins can manage all first_read_stated_problem"
  on public.first_read_stated_problem for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
