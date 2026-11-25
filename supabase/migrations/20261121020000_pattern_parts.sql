-- ── SP-509: A PATTERN IS A CLAIM PLUS 1–3 SINGLE-PREDICATE PARTS ─────────────────────────────────
--
-- WHY. v2 and v2.2 failed in opposite directions for one reason: a pattern was ONE SENTENCE, and a
-- sentence can be compound. v2's generator split a rule into near-synonyms because nothing told it not
-- to; v2.2's judge then rejected almost every honest quote, because a particular never "states" a
-- compound generalisation. Measured 2026-11-20: the single-claim pattern "Customers are charged for
-- full month even when service is canceled mid-cycle" kept 8 of 10 honest quotes; the two-part
-- "…unhelpful AND dismissive" kept almost none; the four-part "Daily AND multi-hour outages occur
-- frequently, CAUSING significant disruptions" kept 1 of 31.
--
-- So the compound structure becomes explicit and the judge rules on a thing small enough to be true.
--
-- A TABLE, NOT JSONB. The rejected alternative was `need_patterns.parts jsonb` plus per-quote verdicts
-- in jsonb: fewer moving parts, but a part's verdict would then key on an ARRAY POSITION, so reordering
-- the parts silently reassigns verdicts — and nothing can foreign-key a part id inside jsonb, which
-- makes "a verdict for a part that does not exist" a guard's job instead of the database's. This slice
-- already rests on composite keys and unique indexes (need_patterns_one_representative,
-- need_pattern_quotes_one_row, need_evidence_one_label); the extra table is the cheaper mistake.
--
-- THE COMPOSITE KEYS need `unique (id, company_id)` on both existing tables first — the same shape
-- odi_needs and signals already carry (odi_needs_id_company), and the reason a cross-company citation
-- is unrepresentable rather than merely refused.

do $$ begin
  alter table public.need_patterns add constraint need_patterns_id_company unique (id, company_id);
exception when duplicate_table or duplicate_object then null; end $$;
do $$ begin
  alter table public.need_pattern_quotes add constraint need_pattern_quotes_id_company unique (id, company_id);
exception when duplicate_table or duplicate_object then null; end $$;

-- SP-506 (signed 2026-11-20): keyword_flag is dropped by the next migration that touches
-- need_pattern_quotes, and this is it. It was retired by SP-504 before it was ever useful — it fired on
-- about two thirds of calls over two full runs (125/189 and 74/123) and informed nothing. It never
-- vetoed a verdict, so no stored row ever depended on it.
alter table public.need_pattern_quotes drop column if exists keyword_flag;

create table if not exists public.need_pattern_parts (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  pattern_id  uuid not null,
  -- the order the generator gave. 1..3 is SP-502's bound, as a CONSTRAINT rather than a prompt.
  ordinal     smallint not null,
  -- SP-501: a PREDICATE — what happens. Never a subject: "customers" is not a part. The parse gate
  -- refuses a part that opens with a subject, and this is the column that holds what survived.
  predicate   text not null,
  created_at  timestamptz not null default now(),
  constraint need_pattern_parts_pattern_fk foreign key (pattern_id, company_id)
    references public.need_patterns (id, company_id) on delete cascade,
  constraint need_pattern_parts_one_per_ordinal unique (pattern_id, ordinal),
  constraint need_pattern_parts_ordinal_range check (ordinal between 1 and 3),
  constraint need_pattern_parts_predicate_len check (char_length(btrim(predicate)) between 1 and 80),
  -- its own composite key, so need_pattern_quote_parts can point at (part, company) and a verdict for
  -- another company's part is unrepresentable rather than merely refused.
  constraint need_pattern_parts_id_company unique (id, company_id)
);
create index if not exists need_pattern_parts_pattern on public.need_pattern_parts (pattern_id);
-- Idempotent on a table that already exists: the constraint is inside the CREATE above for a fresh
-- database, and added here for one that already has the table (this migration's own first, aborted run).
do $$ begin
  alter table public.need_pattern_parts add constraint need_pattern_parts_id_company unique (id, company_id);
exception when duplicate_table or duplicate_object then null; end $$;

create table if not exists public.need_pattern_quote_parts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  quote_row_id  uuid not null,
  part_id       uuid not null,
  -- does THIS quote state or show THIS part. `need_pattern_quotes.bears` is true only when every part
  -- of the pattern states, each with a verbatim span — computed by us, never read off the model.
  states        boolean not null,
  -- SP-494(1), now per PART: the verbatim span of the quote that states this part, verified in
  -- TypeScript with the E4 predicate (excerptBlanking.verbatimOn) before `states` may be true.
  states_span   text,
  reason        text,
  created_at    timestamptz not null default now(),
  constraint need_pattern_quote_parts_quote_fk foreign key (quote_row_id, company_id)
    references public.need_pattern_quotes (id, company_id) on delete cascade,
  constraint need_pattern_quote_parts_part_fk foreign key (part_id, company_id)
    references public.need_pattern_parts (id, company_id) on delete cascade,
  constraint need_pattern_quote_parts_one_row unique (quote_row_id, part_id)
);
create index if not exists need_pattern_quote_parts_quote on public.need_pattern_quote_parts (quote_row_id);
create index if not exists need_pattern_quote_parts_part  on public.need_pattern_quote_parts (part_id);

-- SP-493: the judge may reject a PATTERN whose claim belongs to another need. Stored on the pattern,
-- because it is a verdict about the pattern and not about any one quote.
alter table public.need_patterns add column if not exists belongs_to_need boolean;
comment on column public.need_patterns.belongs_to_need is
  'SP-493: false when the judge ruled the claim states another need''s problem. Such a pattern is not stored live; the column records a judged rejection when one is kept for the record.';

alter table public.need_pattern_parts       enable row level security;
alter table public.need_pattern_quote_parts enable row level security;

-- The policies are need_patterns'' own, value for value: admins write, admins and the company's members read.
drop policy if exists "members can read need_pattern_parts" on public.need_pattern_parts;
create policy "members can read need_pattern_parts" on public.need_pattern_parts for select
  using (public.has_role(auth.uid(), 'admin'::public.app_role) or exists (
    select 1 from public.company_members m where m.company_id = need_pattern_parts.company_id and m.user_id = auth.uid()));
drop policy if exists "admins write need_pattern_parts" on public.need_pattern_parts;
create policy "admins write need_pattern_parts" on public.need_pattern_parts for all
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "members can read need_pattern_quote_parts" on public.need_pattern_quote_parts;
create policy "members can read need_pattern_quote_parts" on public.need_pattern_quote_parts for select
  using (public.has_role(auth.uid(), 'admin'::public.app_role) or exists (
    select 1 from public.company_members m where m.company_id = need_pattern_quote_parts.company_id and m.user_id = auth.uid()));
drop policy if exists "admins write need_pattern_quote_parts" on public.need_pattern_quote_parts;
create policy "admins write need_pattern_quote_parts" on public.need_pattern_quote_parts for all
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

grant select on public.need_pattern_parts, public.need_pattern_quote_parts to authenticated;
grant all    on public.need_pattern_parts, public.need_pattern_quote_parts to service_role;
