-- Known tensions: dedicated slot on the positioning canvas for acknowledge-and-scope
-- entries covering serious negatives in the outside voice (Observe/Name/Open shape:
-- title, what_we_see, what_it_is, what_it_isnt, resolution_condition).
-- Generated in the research-company routes stage, reviewed by the evidence/consistency
-- reviewers, persisted verbatim by refresh-positioning. Additive only.

alter table public.positioning_canvases
  add column if not exists known_tensions_json jsonb not null default '[]'::jsonb;
