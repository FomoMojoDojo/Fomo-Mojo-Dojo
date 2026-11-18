-- THE COUNTED QUOTES (operator ruling R1, 2026-11-18). A review-lane row counts as evidence ONLY when its words are on
-- a page the lane fetched: a quote cut from web_fetch page text (quote_basis web_fetch_page_text, quote and its
-- quote_source_text stored). The search tool's cited_text alone does not count — such a row is held as a lead with
-- held_reason 'search summary, not checked against the page' (scripts/signal-holds.ts) and is excluded here.
--
-- Every corpus count, coverage count, polarity test set and verdict input made from the review lane reads THIS
-- selection and nothing else. review-lane-guard r10 runs this file and fails if any row it returns is not word for
-- word on a page fetched by its own call (or by the verify call named in raw_payload.verified_by_call_id).
-- One SELECT, no trailing semicolon: the guard wraps it.
select s.id, s.company_id, s.source_url, s.about_entity_id, s.about_entity_page, s.quote, s.quote_source_text,
       s.evidence_excerpt, s.event_date, s.event_date_precision, s.raw_payload->>'date_basis' as date_basis,
       s.raw_payload->>'review_body' as review_body, s.review_lane_call_id,
       s.raw_payload->>'verified_by_call_id' as verified_by_call_id, s.created_at
  from public.signals s
 where s.review_lane_call_id is not null
   and s.superseded_at is null
   and s.held_at is null
   and s.quote is not null
   and s.quote_source_text is not null
   and s.raw_payload->>'quote_basis' = 'web_fetch_page_text'
