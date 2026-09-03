-- outside_score_inputs — the AUTHORITATIVE server-side input assembly for the outside Mojo Score
-- (computeOutsideScore, outside-v1.1.0). Predicates are byte-for-byte the ones the proven 08-21/22 batch
-- (scripts/compute-outside-scores.ts) used, so the edge producer scores on exactly the same rows:
--   signals:   signal_band='outside' AND voice_class='outside_voice_about_client'
--              AND superseded_at IS NULL AND evidence_excerpt non-empty
--   strength:  recurrence_confirmed = the signal participates in an ACCEPTED signal_recurrence_verdict
--   deltas:    pairing_kind='public_vs_public' AND delta_type IN (echoed,divergent,internally_silent),
--              minus struck declared claims and uploaded-file-derived declared sides (shared-provenance
--              rule). declared_topic rides the claims join.
-- SECURITY DEFINER so the edge fn (service role) reads through one authoritative gate; the function
-- READS ONLY — it never writes, and CB1 is excluded by the caller (frozen guard) before it is reached.
-- No score formula lives here — only the row selection; the anchor + micro-moves stay ONCE in
-- src/lib/outsideScore/computeOutsideScore.ts.

CREATE OR REPLACE FUNCTION public.outside_score_inputs(p_company uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH accepted AS (
    SELECT signal_a_id AS sid FROM public.signal_recurrence_verdicts WHERE company_id = p_company AND verdict = 'accepted'
    UNION
    SELECT signal_b_id       FROM public.signal_recurrence_verdicts WHERE company_id = p_company AND verdict = 'accepted'
  ),
  sig AS (
    SELECT jsonb_agg(jsonb_build_object(
             'id', s.id,
             'source_type', s.source_type,
             'source_url', s.source_url,
             'event_date', s.event_date,
             'confidence', s.confidence_to_use,
             'recurrence_confirmed', EXISTS (SELECT 1 FROM accepted a WHERE a.sid = s.id)
           )) AS arr
    FROM public.signals s
    WHERE s.company_id = p_company
      AND s.signal_band = 'outside'
      AND s.voice_class = 'outside_voice_about_client'
      AND s.superseded_at IS NULL
      AND length(trim(coalesce(s.evidence_excerpt, ''))) > 0
  ),
  del AS (
    SELECT jsonb_agg(jsonb_build_object(
             'id', d.id,
             'delta_type', d.delta_type,
             'declared_claim_id', d.declared_claim_id,
             'declared_topic', dc.topic
           )) AS arr
    FROM public.claim_deltas d
    LEFT JOIN public.claims dc ON dc.id = d.declared_claim_id
    WHERE d.company_id = p_company
      AND d.pairing_kind = 'public_vs_public'
      AND d.delta_type IN ('echoed', 'divergent', 'internally_silent')
      AND coalesce(dc.status, '') <> 'struck'
      AND NOT EXISTS (
        SELECT 1 FROM public.claim_signal_refs r
        JOIN public.signals s2 ON s2.id = r.signal_id
        WHERE r.claim_id = d.declared_claim_id AND s2.source_type = 'uploaded_file'
      )
  )
  SELECT jsonb_build_object(
           'signals', coalesce((SELECT arr FROM sig), '[]'::jsonb),
           'deltas',  coalesce((SELECT arr FROM del), '[]'::jsonb)
         );
$$;
