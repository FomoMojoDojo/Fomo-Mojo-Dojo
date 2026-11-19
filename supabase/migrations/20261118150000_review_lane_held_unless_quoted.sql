-- A2 (2026-11-18, brief "measure need-to-quote matching"; ruling R1): a review-lane row counts only when its words are
-- on a page the lane fetched. A lane row the lane cannot quote from a fetched page (no `quote`) is saved HELD as a lead —
-- held_reason 'search summary, not checked against the page' — never live and unheld. The lane sets the hold at save
-- (buildReviewLaneRows) and writes one signal_hold_audit row per held row (mintFromCall); this constraint is the floor
-- under that code: no live (not superseded) lane row may be both quote-less and unheld. Superseded history rows are
-- exempt (they are never live). Validated against the stored rows before it was added: 0 violations.
alter table public.signals add constraint signals_lane_quote_or_held check (
  review_lane_call_id is null or quote is not null or held_at is not null or superseded_at is not null
);
