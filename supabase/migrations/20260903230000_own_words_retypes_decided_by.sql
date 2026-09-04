-- OWN-WORDS RETYPE: who decided the kind (operator ruling 2026-09-03, "apply with edits").
-- An operator-edited row is recorded as an OPERATOR decision, never as a judge verdict. Additive.
alter table public.own_words_retypes
  add column decided_by text not null default 'judge'
  constraint own_words_retypes_decided_by_check check (decided_by in ('judge', 'operator'));
