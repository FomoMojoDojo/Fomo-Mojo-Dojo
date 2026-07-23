-- OC-2 capture — The Check gains a FOURTH client response: 'not_important'
-- ("True — but not important to us"). It is its OWN verdict value beside
-- confirmed / corrected / rejected — NOT an overload of reject — so the feed can
-- map it to contest_kind='immaterial' while reject maps to 'disputed'.
--
-- Only the verdict CHECK widens. corrected_requires_text is untouched: it gates
-- the 'corrected' verdict alone, and not_important carries no correction text.
-- The freeze/transition triggers, source CHECK, and unique key are unaffected.

alter table public.first_read_responses
  drop constraint first_read_responses_verdict_check;
alter table public.first_read_responses
  add constraint first_read_responses_verdict_check
  check (verdict in ('confirmed','corrected','rejected','not_important'));
