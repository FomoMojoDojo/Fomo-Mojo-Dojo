-- ── SP-465 / SP-463 / SP-459: THE PATTERN LAYER UNDER A NEED ─────────────────────────────────────
--
-- A need says what a customer is trying to get done. A pattern says, under that need, the particular
-- thing that keeps happening — "the app logs you out and makes you sign in again each time you watch"
-- — carrying the quotes whose own words state it.
--
-- NOTHING DERIVED IS STORED (the accepted proposal, and SP-463 for the counts). No supporting count,
-- no site count, no "supporting ÷ total" ratio (SP-428 struck that formula). The counts render from
-- need_pattern_quotes every time, so a changed ruling or a recovered date needs no backfill and a
-- stored number can never drift from the rule that produced it. This is need_evidence's own discipline.
--
-- IDENTITY AND VERSIONING, as need_evidence carries them:
--   pattern_identity   computed in TypeScript only (PCT-1), never in SQL
--   rubric_version     + rubric_md5 — the rubric that produced it, by value
--   superseded_at      a re-run supersedes; nothing is deleted (D1)
--   signed_at          NULL until a person signs. SP-459: a pattern RENDERS as soon as it passes the
--                      judge, marked draft; signing is optional and only removes the mark. So the
--                      column is not a gate — it is the record of a decision that may never be made.
--
-- THE COMPOSITE FOREIGN KEYS are the point of the shape: need_patterns_need_fk is
-- (need_id, company_id) → odi_needs, and the quote keys are (signal_id, company_id) → signals, so a
-- pattern of one company cannot cite another company's need or another company's quote. That is not a
-- rule a reader has to remember; it is unrepresentable.
--
-- THE REPRESENTATIVE QUOTE IS A FOREIGN KEY, never text. A pattern must not become a second home for
-- a quote's words — the one verified quote lives in signals.quote (SP-452) and is read through
-- displayQuote, masked, on every surface that shows it.

create table if not exists public.need_patterns (
  id                        uuid primary key default gen_random_uuid(),
  company_id                uuid not null references public.companies(id) on delete cascade,
  need_id                   uuid not null,
  -- SP-463: at most 90 characters. The bound is a column constraint, not a prompt instruction, because
  -- a prompt instruction is a request and a constraint is an answer.
  name                      text not null,
  -- SP-428's four strengths, and only those four.
  strength                  text not null,
  judge_reason              text,
  representative_signal_id  uuid,
  pattern_identity          text not null,
  rubric_version            text not null,
  rubric_md5                text not null,
  model_provider            text not null,
  model_name                text not null,
  judge_provider            text,
  judge_model               text,
  generated_at              timestamptz not null default now(),
  judged_at                 timestamptz,
  signed_at                 timestamptz,
  signed_by                 uuid,
  superseded_at             timestamptz,
  superseded_by_id          uuid references public.need_patterns(id) on delete set null,
  run_ref                   text,
  constraint need_patterns_need_fk foreign key (need_id, company_id)
    references public.odi_needs(id, company_id) on delete restrict,
  constraint need_patterns_rep_fk foreign key (representative_signal_id, company_id)
    references public.signals(id, company_id) on delete restrict,
  constraint need_patterns_name_len check (char_length(btrim(name)) between 1 and 90),
  constraint need_patterns_strength_check check (strength = any (array[
    'confirmed rule'::text, 'likely rule'::text, 'possible failure'::text, 'too thin'::text])),
  constraint need_patterns_signed_pair check ((signed_at is null) = (signed_by is null))
);

create index if not exists need_patterns_company_need on public.need_patterns (company_id, need_id);
-- One live pattern per identity per need. A re-run supersedes the old row and inserts the new one.
create unique index if not exists need_patterns_live_identity
  on public.need_patterns (company_id, need_id, pattern_identity) where superseded_at is null;

create table if not exists public.need_pattern_quotes (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  pattern_id   uuid not null references public.need_patterns(id) on delete cascade,
  signal_id    uuid not null,
  -- the judge's verdict on THIS quote under THIS pattern. A pattern with no surviving supporting
  -- quote is not stored at all (SP-463), so a row with bears=false is a quote the generator cited and
  -- the judge threw out — kept, because what the judge refused is the evidence that it worked.
  bears        boolean not null,
  judge_reason text,
  created_at   timestamptz not null default now(),
  constraint need_pattern_quotes_signal_fk foreign key (signal_id, company_id)
    references public.signals(id, company_id) on delete restrict,
  constraint need_pattern_quotes_one_row unique (pattern_id, signal_id)
);

create index if not exists need_pattern_quotes_pattern on public.need_pattern_quotes (pattern_id);

alter table public.need_patterns       enable row level security;
alter table public.need_pattern_quotes enable row level security;

-- The policies are need_evidence's, value for value: admins write, admins and the company's members read.
drop policy if exists "members can read need_patterns" on public.need_patterns;
create policy "members can read need_patterns" on public.need_patterns for select
  using (public.has_role(auth.uid(), 'admin'::public.app_role) or exists (
    select 1 from public.company_members m where m.company_id = need_patterns.company_id and m.user_id = auth.uid()));
drop policy if exists "admins insert need_patterns" on public.need_patterns;
create policy "admins insert need_patterns" on public.need_patterns for insert
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));
drop policy if exists "admins update need_patterns" on public.need_patterns;
create policy "admins update need_patterns" on public.need_patterns for update
  using (public.has_role(auth.uid(), 'admin'::public.app_role));
drop policy if exists "admins delete need_patterns" on public.need_patterns;
create policy "admins delete need_patterns" on public.need_patterns for delete
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "members can read need_pattern_quotes" on public.need_pattern_quotes;
create policy "members can read need_pattern_quotes" on public.need_pattern_quotes for select
  using (public.has_role(auth.uid(), 'admin'::public.app_role) or exists (
    select 1 from public.company_members m where m.company_id = need_pattern_quotes.company_id and m.user_id = auth.uid()));
drop policy if exists "admins insert need_pattern_quotes" on public.need_pattern_quotes;
create policy "admins insert need_pattern_quotes" on public.need_pattern_quotes for insert
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));
drop policy if exists "admins update need_pattern_quotes" on public.need_pattern_quotes;
create policy "admins update need_pattern_quotes" on public.need_pattern_quotes for update
  using (public.has_role(auth.uid(), 'admin'::public.app_role));
drop policy if exists "admins delete need_pattern_quotes" on public.need_pattern_quotes;
create policy "admins delete need_pattern_quotes" on public.need_pattern_quotes for delete
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

grant select on public.need_patterns, public.need_pattern_quotes to authenticated;
grant all    on public.need_patterns, public.need_pattern_quotes to service_role;
