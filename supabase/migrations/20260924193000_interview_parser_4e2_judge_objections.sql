-- Interview parser 4e (ruling N11, signed 2026-09-24) — THE TYPED OBJECTIONS ARE STORED.
--
-- N3 gave the judge a typed objection shape: {type, term}. The code then DROPS any added_* objection
-- whose term occurs in the passage — the judge asserting the words do not carry something the words
-- plainly do. Until now only the run's audit row counted the drops, so a reader of a single item could
-- see the reason the kept objections produced but never what had been thrown away on its behalf.
--
-- N11: the item carries both lists. `judge_objections` is NULL for an item that never reached a judge
-- (our own side, a kind with no converter, a guard refusal before the call) and an object for one that
-- did. The shape written at landing is:
--     { "kept": [ {"type": "...", "term": "..."} ], "dropped": [ {"type": "...", "term": "...", "why": "..."} ] }
-- Both arrays may be empty: an accepted item with nothing dropped stores {"kept":[],"dropped":[]},
-- which is a different statement from NULL and is meant to be.
--
-- It joins the immutability trigger's guarded columns for the same reason raw_words and pointer are
-- there: it is evidence of what the judge did at landing, not a field a later pass may edit.
alter table public.interview_items add column if not exists judge_objections jsonb;

comment on column public.interview_items.judge_objections is
  'N11 (2026-09-24): the typed objections for this item — {kept:[{type,term}], dropped:[{type,term,why}]}. NULL when no judge ran. Fixed at landing.';
