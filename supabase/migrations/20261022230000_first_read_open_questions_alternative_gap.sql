-- Operator rulings 20 + 49 (2026-10-22): an empty positioning alternatives field is an OPEN QUESTION for the room —
-- "When customers choose you, what are they choosing you over?" — routed with source_kind 'alternative_gap'.
-- Widens the source_kind CHECK only; every existing value stays admitted and no row changes.
alter table public.first_read_open_questions drop constraint if exists first_read_open_questions_source_kind_check;
alter table public.first_read_open_questions add constraint first_read_open_questions_source_kind_check
  check (source_kind = any (array['finding'::text, 'silent_delta'::text, 'status_conflict'::text, 'cascade_gap'::text, 'alternative_gap'::text]));
