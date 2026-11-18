-- M-2 (2026-11-18; maps-and-markets migration step 2): needs_in_market — the COMPATIBILITY VIEW. One row
-- per need per LIVE market link, with exactly today's odi_needs columns in today's order; journey_key and
-- the per-market fields come from the link (the home link mirrors the need until M-4, so every value is
-- the same as odi_needs today), followed by the link's own id, market and source. While every need has
-- one live link (M-5 enables a second), the view returns exactly the rows odi_needs does.
--
-- security_invoker: the reader's own RLS on odi_needs and need_markets applies. A link is visible exactly
-- when its need is (the select policy below replaces M-1's), so the view can never show a need its table
-- would hide.

drop policy "Users can view company need_markets" on public.need_markets;
create policy "Users can view need_markets of a visible need" on public.need_markets for select
  using (exists (select 1 from public.odi_needs n where n.id = need_markets.need_id));

create view public.needs_in_market with (security_invoker = true) as
select n.id, n.company_id, n.user_id, n.tier, n.desired_outcome,
       l.journey_key, l.step_number, l.step_label, l.importance, l.satisfaction, l.opportunity_score, l.service_state,
       n.source_path, n.frameworks_used, n.created_at, n.sort_order, n.source_url, n.notes, n.social_extraction_json,
       n.dependency_state, l.validation_state, l.evidence_state, n.last_reviewed_at, n.stale_reason, n.stale_since_event_id,
       n.source_run_id, n.updated_at, l.canonical_statement as odi_canonical_statement, l.strategy_alignment,
       l.strategy_alignment_reason, n.strategy_alignment_evaluated_at, l.evidence_signal_ids as evidence_baseline_signal_ids,
       n.evidence_baseline_captured_at, n.provenance_type, n.confidence, n.content_identity, n.status, n.superseded_by_id,
       n.superseded_reason, n.last_confirmed_run_id, n.interview_record_id, n.holder, n.operator_edited_at, n.subject_id,
       n.evidence_voice, n.source_proposal_id,
       l.id as link_id, l.market_definition_id, l.tag_source as link_source
  from public.odi_needs n
  join public.need_markets l on l.need_id = n.id and l.retired_at is null;

-- read-only: the view is a join (not auto-updatable), and no client role holds a write grant on it
-- (grants-guard g8). Writes go to odi_needs and need_markets.
revoke all on public.needs_in_market from public, anon, authenticated;
grant select on public.needs_in_market to authenticated;
notify pgrst, 'reload schema';
