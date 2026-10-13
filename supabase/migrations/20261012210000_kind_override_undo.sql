-- ── R-A4 (operator ruling, 2026-10-12): an override can be UNDONE by appending ──────────────────
--
-- interview_item_kind_overrides is append-only, so the first cut of it had no undo: to_kind was
-- constrained to 'correction', and a mistaken override stood forever. Its audit row (9487) had to
-- carry a prose note where reversal SQL belongs, which is the tell that the design was incomplete.
--
-- R-A4 closes it without weakening append-only: to_kind may now be NULL, and NULL means "no
-- override — the parser's kind stands". So the reversal of an override is the APPEND of a NULL row,
-- which is a decision in its own right and leaves the whole history readable. Nothing is ever
-- updated or deleted.
--
-- The resolver (effectiveItemKind, _shared/interviewItems.ts) reads latest-decided-wins and maps a
-- NULL to_kind back to the parser's kind. Still no SQL copy of that rule.
-- to_kind was declared NOT NULL by the first cut, so the CHECK alone would not have allowed an undo:
-- the rolled-back reversal proof hit the not-null constraint before it ever reached the CHECK.
alter table public.interview_item_kind_overrides
  alter column to_kind drop not null;

alter table public.interview_item_kind_overrides
  drop constraint if exists interview_item_kind_overrides_to_kind_check;
alter table public.interview_item_kind_overrides
  add constraint interview_item_kind_overrides_to_kind_check
  check (to_kind is null or to_kind = any (array['correction'::text]));

-- from_kind <> to_kind was written for two non-null kinds; a NULL undo must not trip it.
-- (NULL <> 'ask' is NULL, which a CHECK treats as passing, but the intent is written out so the
--  next reader does not have to re-derive three-valued logic to know an undo is allowed.)
alter table public.interview_item_kind_overrides
  drop constraint if exists interview_item_kind_overrides_kinds_differ;
alter table public.interview_item_kind_overrides
  add constraint interview_item_kind_overrides_kinds_differ
  check (to_kind is null or from_kind <> to_kind);

comment on column public.interview_item_kind_overrides.to_kind is
  'The kind the operator put in force for this landing. NULL (R-A4, 2026-10-12) means NO override — the parser''s kind stands — and is how an earlier override is undone: append a NULL row rather than edit or delete, so the decision history stays complete. Resolved by effectiveItemKind() in _shared/interviewItems.ts (latest decided_at wins).';
