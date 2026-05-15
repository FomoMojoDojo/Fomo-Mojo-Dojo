-- ── A4 Claim Backfill: claim_signal_refs + strict gate re-evaluation ─────────
--
-- Purpose: Backfill claim_signal_refs from source-path provenance for all
--          Cafe Barra claims, then re-run state machine with strict gates.
--
-- Company: Cafe Barra (58b2b15b-bada-4bcd-9c12-b7e66a37d0bc)
-- Pre-A4 distribution: outside_view=4, diagnose=24, focus=10, flow=0
-- Expected post-A4:    outside_view=4, diagnose=34, focus=0, flow=0
--   Rationale: 10 route_candidate focus claims demote because route evidence_json
--   is org-band only; no customer-band signals exist for any route claim.
--
-- Idempotency guard: checks for existing signals with raw_payload->>'a4_backfill'='true'
--
-- Matching approach for odi_needs:
--   source_path 'evidence_derived_78e'                → signal_band='organization', source_type='internal_derived'
--   source_path 'reconstructed_from_prior_screenshots' → signal_band='organization', source_type='internal_authored'
--   Neither maps to customer band — these are org-internal derivations, not primary research.
--
-- Gate logic applied (spec §2 regression detectors from gates.ts):
--   shouldRegressFocusToDiagnose: 0 active customer-band supporting signals → demote
--   shouldRegressDiagnoseToOutsideView: 0 active org-band supporting signals
--                                       with directness!='weak' and validation_status!='contradicted' → demote

BEGIN;

DO $$
DECLARE
  cafe_id      CONSTANT UUID := '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
  v_need       RECORD;
  v_route      RECORD;
  v_claim      RECORD;
  v_signal_id  UUID;
  v_item_row   RECORD;
  v_item       JSONB;
  source_type_val TEXT;
  org_count    INT;
  cust_count   INT;
  signals_created      INT := 0;
  refs_created         INT := 0;
  demotions_focus      INT := 0;
  demotions_diagnose   INT := 0;
BEGIN

  -- ── Idempotency guard ──────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM signals
    WHERE company_id = cafe_id
      AND (raw_payload->>'a4_backfill')::boolean IS TRUE
    LIMIT 1
  ) THEN
    RAISE NOTICE 'A4 already run — signals with a4_backfill marker present, skipping';
    RETURN;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PHASE 2A — odi_needs (customer_outcome claims)
  --
  -- Each odi_need gets one org-band signal derived from its source_path.
  -- source_path → signal_band mapping documented in header comment above.
  -- One signal per need: triangulation_state='single_source' after this pass.
  -- ══════════════════════════════════════════════════════════════════════════

  FOR v_need IN
    SELECT n.id AS need_id,
           n.desired_outcome,
           n.source_path,
           c.id    AS claim_id,
           c.state AS claim_state
    FROM odi_needs n
    JOIN claims c ON c.id = n.id AND c.company_id = cafe_id
    WHERE n.company_id = cafe_id
  LOOP
    source_type_val := CASE v_need.source_path
      WHEN 'evidence_derived_78e'                THEN 'internal_derived'
      WHEN 'reconstructed_from_prior_screenshots' THEN 'internal_authored'
      ELSE 'internal_authored'
    END;

    INSERT INTO signals (
      company_id, source_type, signal_band, evidence_type,
      claim_text, evidence_excerpt,
      directness, framing_fit, structure_level, validation_status, confidence_to_use,
      topic, raw_payload
    ) VALUES (
      cafe_id,
      source_type_val,
      'organization',
      'internal_data',
      LEFT(v_need.desired_outcome, 500),
      LEFT(v_need.desired_outcome, 200),
      'inferred',
      'partial',
      'interpreted',
      'directional',
      'medium',
      'customer_need',
      jsonb_build_object(
        'a4_backfill', true,
        'phase',       '2a_odi_needs',
        'source_path', v_need.source_path,
        'odi_need_id', v_need.need_id::text
      )
    )
    RETURNING id INTO v_signal_id;

    signals_created := signals_created + 1;

    INSERT INTO claim_signal_refs (company_id, claim_id, signal_id, relationship)
    VALUES (cafe_id, v_need.claim_id, v_signal_id, 'supports');
    refs_created := refs_created + 1;

    UPDATE claims
    SET organization_support_count = organization_support_count + 1,
        triangulation_state        = 'single_source'
    WHERE id = v_need.claim_id;

    INSERT INTO claim_events (
      company_id, claim_id, from_state, to_state,
      triggered_by_event, evidence_delta
    ) VALUES (
      cafe_id, v_need.claim_id, v_need.claim_state, v_need.claim_state,
      'a4_evidence_backfill',
      jsonb_build_object(
        'signal_id',   v_signal_id::text,
        'signal_band', 'organization',
        'source_type', source_type_val,
        'source_path', v_need.source_path,
        'relationship','supports'
      )
    );
  END LOOP;

  RAISE NOTICE 'Phase 2A complete: % odi_need signals created', signals_created;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PHASE 2B — routes (route_candidate claims)
  --
  -- For each non-missing entry in evidence_json: create an org-band signal.
  -- complete items → validation_status='validated'
  -- in_progress    → validation_status='directional'
  -- missing items are skipped (no evidence to represent).
  -- ══════════════════════════════════════════════════════════════════════════

  FOR v_route IN
    SELECT r.id          AS route_id,
           r.title,
           r.claim_id,
           r.evidence_json,
           c.state       AS claim_state
    FROM routes r
    JOIN claims c ON c.id = r.claim_id AND c.company_id = cafe_id
    WHERE r.company_id   = cafe_id
      AND r.claim_id     IS NOT NULL
      AND r.evidence_json IS NOT NULL
      AND jsonb_typeof(r.evidence_json) = 'array'
  LOOP
    FOR v_item_row IN
      SELECT e AS item
      FROM jsonb_array_elements(v_route.evidence_json) e
    LOOP
      v_item := v_item_row.item;

      -- Skip missing items — they have no evidence to represent
      CONTINUE WHEN (v_item->>'status') = 'missing'
                 OR (v_item->>'status') IS NULL;

      INSERT INTO signals (
        company_id, source_type, signal_band, evidence_type,
        claim_text, evidence_excerpt,
        directness, framing_fit, structure_level, validation_status, confidence_to_use,
        topic, raw_payload
      ) VALUES (
        cafe_id,
        'internal_authored',
        'organization',
        'internal_data',
        COALESCE(v_item->>'title', 'Route evidence item'),
        COALESCE(LEFT(v_item->>'title', 200), ''),
        'inferred',
        'partial',
        'interpreted',
        CASE WHEN v_item->>'status' = 'complete' THEN 'validated' ELSE 'directional' END,
        'medium',
        'route_execution',
        jsonb_build_object(
          'a4_backfill',     true,
          'phase',           '2b_routes',
          'route_id',        v_route.route_id::text,
          'evidence_status', v_item->>'status',
          'evidence_title',  v_item->>'title'
        )
      )
      RETURNING id INTO v_signal_id;

      signals_created := signals_created + 1;

      INSERT INTO claim_signal_refs (company_id, claim_id, signal_id, relationship)
      VALUES (cafe_id, v_route.claim_id, v_signal_id, 'supports');
      refs_created := refs_created + 1;

      UPDATE claims
      SET organization_support_count = organization_support_count + 1
      WHERE id = v_route.claim_id;

      INSERT INTO claim_events (
        company_id, claim_id, from_state, to_state,
        triggered_by_event, evidence_delta
      ) VALUES (
        cafe_id, v_route.claim_id, v_route.claim_state, v_route.claim_state,
        'a4_evidence_backfill',
        jsonb_build_object(
          'signal_id',       v_signal_id::text,
          'signal_band',     'organization',
          'source_type',     'internal_authored',
          'route_id',        v_route.route_id::text,
          'evidence_status', v_item->>'status',
          'evidence_title',  v_item->>'title',
          'relationship',    'supports'
        )
      );
    END LOOP;
  END LOOP;

  -- Refresh triangulation_state for route_candidate claims based on final ref count
  UPDATE claims c
  SET triangulation_state = (
    SELECT CASE
      WHEN COUNT(*) = 0 THEN 'untested'
      WHEN COUNT(*) = 1 THEN 'single_source'
      ELSE 'multi_source'
    END
    FROM claim_signal_refs csr
    WHERE csr.claim_id = c.id AND csr.relationship = 'supports'
  )
  WHERE c.company_id = cafe_id
    AND c.claim_type = 'route_candidate';

  RAISE NOTICE 'Phase 2B complete: % total signals so far', signals_created;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PHASE 2C — strategic_belief claims (positioning_canvases / strategy_cascades)
  --
  -- Each strategic_belief claim gets one synthetic org signal representing
  -- internal authorship. These were authored inside the engagement, which
  -- satisfies the Diagnose org-evidence requirement (spec §4.1).
  -- ══════════════════════════════════════════════════════════════════════════

  FOR v_claim IN
    SELECT id, statement, topic, state
    FROM claims
    WHERE company_id = cafe_id
      AND claim_type = 'strategic_belief'
  LOOP
    INSERT INTO signals (
      company_id, source_type, signal_band, evidence_type,
      claim_text, evidence_excerpt,
      directness, framing_fit, structure_level, validation_status, confidence_to_use,
      topic, raw_payload
    ) VALUES (
      cafe_id,
      'internal_authored',
      'organization',
      'internal_data',
      LEFT(v_claim.statement, 500),
      LEFT(v_claim.statement, 200),
      'inferred',
      'partial',
      'interpreted',
      'directional',
      'medium',
      COALESCE(v_claim.topic, 'strategy'),
      jsonb_build_object(
        'a4_backfill', true,
        'phase',       '2c_strategic_belief',
        'claim_id',    v_claim.id::text
      )
    )
    RETURNING id INTO v_signal_id;

    signals_created := signals_created + 1;

    INSERT INTO claim_signal_refs (company_id, claim_id, signal_id, relationship)
    VALUES (cafe_id, v_claim.id, v_signal_id, 'supports');
    refs_created := refs_created + 1;

    UPDATE claims
    SET organization_support_count = organization_support_count + 1,
        triangulation_state        = 'single_source'
    WHERE id = v_claim.id;

    INSERT INTO claim_events (
      company_id, claim_id, from_state, to_state,
      triggered_by_event, evidence_delta
    ) VALUES (
      cafe_id, v_claim.id, v_claim.state, v_claim.state,
      'a4_evidence_backfill',
      jsonb_build_object(
        'signal_id',   v_signal_id::text,
        'signal_band', 'organization',
        'source_type', 'internal_authored',
        'relationship','supports'
      )
    );
  END LOOP;

  RAISE NOTICE 'Phase 2C complete: % total signals, % refs', signals_created, refs_created;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PHASE 3A — Strict gate: Focus → Diagnose
  --
  -- shouldRegressFocusToDiagnose (gates.ts):
  --   Returns true when 0 active customer-band supporting signals.
  --   Route evidence_json is org-band only → all 10 route_candidate claims
  --   demote to diagnose. This is the expected and correct outcome.
  -- ══════════════════════════════════════════════════════════════════════════

  FOR v_claim IN
    SELECT id FROM claims
    WHERE company_id = cafe_id AND state = 'focus'
  LOOP
    SELECT COUNT(*) INTO cust_count
    FROM claim_signal_refs csr
    JOIN signals s ON s.id = csr.signal_id
    WHERE csr.claim_id          = v_claim.id
      AND csr.relationship      = 'supports'
      AND s.signal_band         = 'customer'
      AND s.validation_status  != 'contradicted';

    IF cust_count = 0 THEN
      UPDATE claims SET state = 'diagnose' WHERE id = v_claim.id;
      demotions_focus := demotions_focus + 1;

      INSERT INTO claim_events (
        company_id, claim_id, from_state, to_state,
        triggered_by_event, evidence_delta
      ) VALUES (
        cafe_id, v_claim.id, 'focus', 'diagnose',
        'a4_strict_gate_demotion',
        jsonb_build_object(
          'gate_failed',            'shouldRegressFocusToDiagnose',
          'reason',                 'No active customer-band signals — route evidence_json is org-band only (internal_authored)',
          'customer_support_count', cust_count
        )
      );
    END IF;
  END LOOP;

  RAISE NOTICE 'Phase 3A complete: % focus→diagnose demotions', demotions_focus;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PHASE 3B — Strict gate: Diagnose → Outside View
  --
  -- shouldRegressDiagnoseToOutsideView (gates.ts):
  --   Returns true when 0 active org-band signals with directness!='weak'
  --   and validation_status!='contradicted'.
  --   All diagnose claims received org signals in Phases 2A/2B/2C
  --   with directness='inferred' → none should regress here.
  --   This loop is the safety check.
  -- ══════════════════════════════════════════════════════════════════════════

  FOR v_claim IN
    SELECT id FROM claims
    WHERE company_id = cafe_id AND state = 'diagnose'
  LOOP
    SELECT COUNT(*) INTO org_count
    FROM claim_signal_refs csr
    JOIN signals s ON s.id = csr.signal_id
    WHERE csr.claim_id         = v_claim.id
      AND csr.relationship     = 'supports'
      AND s.signal_band        = 'organization'
      AND s.directness        != 'weak'
      AND s.validation_status != 'contradicted';

    IF org_count = 0 THEN
      UPDATE claims SET state = 'outside_view' WHERE id = v_claim.id;
      demotions_diagnose := demotions_diagnose + 1;

      INSERT INTO claim_events (
        company_id, claim_id, from_state, to_state,
        triggered_by_event, evidence_delta
      ) VALUES (
        cafe_id, v_claim.id, 'diagnose', 'outside_view',
        'a4_strict_gate_demotion',
        jsonb_build_object(
          'gate_failed',      'shouldRegressDiagnoseToOutsideView',
          'reason',           'No qualifying org-band signals after backfill',
          'org_support_count', org_count
        )
      );
    END IF;
  END LOOP;

  RAISE NOTICE 'Phase 3B complete: % diagnose→outside_view demotions', demotions_diagnose;

  -- ══════════════════════════════════════════════════════════════════════════
  -- PHASE 4 — Update claim_state_distribution in area_scores_json
  -- ══════════════════════════════════════════════════════════════════════════

  UPDATE companies
  SET area_scores_json = jsonb_set(
    COALESCE(area_scores_json, '{}'),
    '{claim_state_distribution}',
    (
      SELECT jsonb_build_object(
        'outside_view', COUNT(*) FILTER (WHERE state = 'outside_view'),
        'diagnose',     COUNT(*) FILTER (WHERE state = 'diagnose'),
        'focus',        COUNT(*) FILTER (WHERE state = 'focus'),
        'flow',         COUNT(*) FILTER (WHERE state = 'flow'),
        'total',        COUNT(*),
        'computed_at',  to_jsonb(now())
      )
      FROM claims WHERE company_id = cafe_id
    )
  )
  WHERE id = cafe_id;

  RAISE NOTICE 'A4 complete — signals=% refs=% focus→diagnose=% diagnose→outside_view=%',
    signals_created, refs_created, demotions_focus, demotions_diagnose;

END $$;

COMMIT;
