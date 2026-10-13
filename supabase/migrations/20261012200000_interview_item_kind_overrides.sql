-- ── R-A1 (operator ruling, signed 2026-10-12): reclassification is an OVERRIDE, not an edit ─────
--
-- Act 1 needed item 61dac18a to be a 'correction' and could not get there: interview_items_immutable
-- fixes `kind` (and content_identity) at landing, and that is right — the identity hashes the kind,
-- so mutating either would make a re-parse insert a duplicate instead of no-op'ing.
--
-- So the operator's reclassification gets its OWN record. The parser's row is never touched: its
-- kind and its content_identity stay exactly as landed, a re-parse still no-ops, and the override
-- sits beside it keyed on the identity it was decided against (item id + content_identity). If a
-- re-parse ever changes that identity, the override no longer matches and silently stops applying —
-- which is the correct failure: a decision made about one landing does not carry to a different one.
--
-- APPEND-ONLY. No UPDATE, no DELETE (interview_item_kind_overrides_append_only). A mistaken override
-- is corrected by APPENDING a newer one, never by mutating — so the resolver is latest-decided-wins,
-- not single-row. The only DELETE permitted is the company cascade, the same exception
-- interview_items_immutable makes, so deleting a company does not fail on this table.
--
-- CONSEQUENCE, stated plainly: because DELETE is blocked, an override row's audit entry cannot carry
-- a working DELETE as its reversal. Reversing one needs an operator ruling — either to_kind 'ask'
-- becomes allowed (then reversal is an append) or a one-off runs with the trigger disabled inside a
-- transaction. The audit row for 7a says exactly this rather than carrying SQL that would fail.
--
-- ONE RESOLVER. effectiveItemKind() in _shared/interviewItems.ts is the only place the rule lives.
-- There is deliberately NO SQL view or function doing the same thing: two authorities on one rule is
-- how a rule rots (the same reasoning that deleted classOkFromVerdict in publicReadGuards.ts).
create table if not exists public.interview_item_kind_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  -- the identity this decision was made against: the row AND the landing it was
  interview_item_id uuid not null references public.interview_items(id),
  content_identity text not null,
  from_kind text not null,
  to_kind text not null,
  reason text not null,
  decided_by text not null,
  decided_at timestamptz not null default now(),
  constraint interview_item_kind_overrides_identity_check check (length(btrim(content_identity)) = 64),
  constraint interview_item_kind_overrides_reason_check check (length(btrim(reason)) > 0),
  constraint interview_item_kind_overrides_decided_by_check check (length(btrim(decided_by)) > 0),
  constraint interview_item_kind_overrides_kinds_differ check (from_kind <> to_kind),
  -- R-A1: the allowed destination, for now. Widening this is an operator ruling, not a refactor.
  constraint interview_item_kind_overrides_to_kind_check check (to_kind = any (array['correction'::text]))
);

create index if not exists interview_item_kind_overrides_item_idx
  on public.interview_item_kind_overrides (interview_item_id, content_identity, decided_at desc);
create index if not exists interview_item_kind_overrides_company_idx
  on public.interview_item_kind_overrides (company_id);

-- ── APPEND-ONLY ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.interview_item_kind_overrides_append_only()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if tg_op = 'DELETE' then
    -- the company cascade, the same exception interview_items_immutable makes
    if not exists (select 1 from public.companies where id = old.company_id) then
      return old;
    end if;
    raise exception 'interview_item_kind_overrides is append-only — an override is superseded by a newer one, never deleted (override %)', old.id;
  end if;
  raise exception 'interview_item_kind_overrides is append-only — an override is never updated; append a newer decision instead (override %)', old.id;
end;
$fn$;

drop trigger if exists interview_item_kind_overrides_append_only on public.interview_item_kind_overrides;
create trigger interview_item_kind_overrides_append_only
  before update or delete on public.interview_item_kind_overrides
  for each row execute function public.interview_item_kind_overrides_append_only();

-- ── RLS, consistent with interview_items (admin-only), with anon holding nothing ────────────────
alter table public.interview_item_kind_overrides enable row level security;

drop policy if exists "Admins can manage all interview_item_kind_overrides" on public.interview_item_kind_overrides;
create policy "Admins can manage all interview_item_kind_overrides"
  on public.interview_item_kind_overrides
  for all
  using (has_role(auth.uid(), 'admin'::app_role));

revoke all on public.interview_item_kind_overrides from anon;
grant select, insert on public.interview_item_kind_overrides to authenticated;
grant all on public.interview_item_kind_overrides to service_role;

comment on table public.interview_item_kind_overrides is
  'R-A1 (2026-10-12): the operator''s reclassification of a parsed interview item, as its own append-only record. The parser row is never edited — its kind and content_identity are fixed at landing. Keyed on (interview_item_id, content_identity): an override stops applying if a re-parse changes the identity it was decided against. Latest decided_at wins. The ONE resolver is effectiveItemKind() in _shared/interviewItems.ts; there is no SQL copy of the rule on purpose.';
