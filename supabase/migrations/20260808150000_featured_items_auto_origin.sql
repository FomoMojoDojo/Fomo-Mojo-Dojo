-- First Read ROLLUP (Gate 2.5) — auto-default featured items.
--
-- The system PROPOSES a default featured item per theme; the operator swaps or ratifies. The
-- LABEL HONESTY hinges on the `origin` flag: an auto default renders under a NEUTRAL line
-- ("Where we'd start:") and NEVER the operator-choice leads until it is ratified (origin flips to
-- 'operator'). A model-judged default (theme 2) is honestly flagged 'auto_judged'.
--
-- RE-RUN INVARIANT: the auto-writer only ever writes a theme with NO live pointer (the live-unique
-- index makes a second live insert impossible), and any recompute is scoped WHERE origin <> 'operator'
-- — so it is structurally incapable of moving an operator's choice.

alter table public.first_read_featured_items
  add column if not exists origin text not null default 'operator'
    check (origin in ('auto', 'operator', 'auto_judged')),
  -- theme 2's judged default records the model's one-line reason (operator-facing only).
  add column if not exists judge_reason text;

-- Theme 1 (say-vs-see) gains a featured-pointer FALLBACK when no live curated tension exists
-- (curated tension still wins when present). Extend the allowed themes.
alter table public.first_read_featured_items
  drop constraint if exists first_read_featured_items_theme_key_check;
alter table public.first_read_featured_items
  add constraint first_read_featured_items_theme_key_check
    check (theme_key in ('say_vs_see', 'outside_raised', 'findings'));
