-- ── A5 Phase 3 — Route/Leg Hierarchy Data Migration ──────────────────────────
--
-- Purpose: Create 3 top-level routes, assign 10 existing legs, wire desired
--          outcome, populate WRAP fields, write claim_events.
--
-- Company: Cafe Barra (58b2b15b-bada-4bcd-9c12-b7e66a37d0bc)
-- Approved: 2026-05-15 ("Approved as written")
--
-- Leg assignments (proposal doc confirmed):
--   Route A — Earn the right to make the exceptional claim (state: diagnose)
--     A1 ecf0b2e3  Make margin tradeoffs visible before pricing changes
--     A2 f0fac021  Reduce reorder friction caused by unclear supplier terms
--     A3 6dacee4b  Reduce stock-out risk before manual counts fail
--     A4 111d3d7f  Shift preparation quality from manager-dependent to system-supported
--
--   Route B — Make the Barra Process visible and transferable (state: diagnose)
--     B1 e3000001  Externalize one Barra roasting template into observable criteria
--     B2 e4000001  Design the seasonal origin transition as a methodology feature
--     B3 e1000001  Build a seasonal consistency signal partner cafes can observe
--     B4 e5000001  Test whether exceptional positioning holds under direct comparison
--
--   Route C — Win the right partners through evidence, not pitch (state: outside_view)
--     C1 e2000001  Add a lightweight pre-qualification tier before the full interview
--     C2 49318645  Test whether operational proof changes repeat purchasing confidence
--
-- Idempotency: aborts if any route with level='route' already exists for this company.

BEGIN;

DO $$
DECLARE
  cafe_id   CONSTANT UUID := '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
  cafe_user CONSTANT UUID := 'fd766480-d2ef-4794-a79a-b849a91df024';

  -- Existing leg UUIDs
  leg_a1    CONSTANT UUID := 'ecf0b2e3-b5ec-4bb6-9327-e801071b110b';
  leg_a2    CONSTANT UUID := 'f0fac021-4944-4f9e-a296-3e9f8833486f';
  leg_a3    CONSTANT UUID := '6dacee4b-af44-415d-be93-7e8b430fd6ca';
  leg_a4    CONSTANT UUID := '111d3d7f-22b4-4fcb-9b8f-c5dd9219e670';
  leg_b1    CONSTANT UUID := 'e3000001-cafe-4bcd-9012-cafe79000001';
  leg_b2    CONSTANT UUID := 'e4000001-cafe-4bcd-9012-cafe79000001';
  leg_b3    CONSTANT UUID := 'e1000001-cafe-4bcd-9012-cafe79000001';
  leg_b4    CONSTANT UUID := 'e5000001-cafe-4bcd-9012-cafe79000001';
  leg_c1    CONSTANT UUID := 'e2000001-cafe-4bcd-9012-cafe79000001';
  leg_c2    CONSTANT UUID := '49318645-d804-4c83-b7fe-e5cbe01a607e';

  outcome_id  UUID;
  route_a_id  UUID;
  route_b_id  UUID;
  route_c_id  UUID;
  claim_a_id  UUID;
  claim_b_id  UUID;
  claim_c_id  UUID;

BEGIN

  -- ── Idempotency guard ────────────────────────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM routes
    WHERE company_id = cafe_id AND level = 'route'
    LIMIT 1
  ) THEN
    RAISE NOTICE 'A5 Phase 3 already applied — top-level routes found, aborting';
    RETURN;
  END IF;

  -- ── 1. Desired outcome ───────────────────────────────────────────────────────
  INSERT INTO desired_outcomes (
    company_id,
    statement,
    importance_score,
    satisfaction_score,
    metric,
    is_primary
  ) VALUES (
    cafe_id,
    'Earn recognition as the verifiable quality standard for craft-first cafe operators, building sustainable margin through selective partner relationships and a documented, transferable process.',
    9,
    2,
    '≥5 active partner accounts with documented renewal; ≥2 referral-sourced accounts',
    true
  )
  RETURNING id INTO outcome_id;

  RAISE NOTICE 'Step 1 — desired_outcome created: %', outcome_id;

  -- ── 2. Claim rows for the three new routes ───────────────────────────────────
  INSERT INTO claims (company_id, claim_type, state, topic, statement)
  VALUES (
    cafe_id,
    'route_candidate',
    'diagnose',
    'operational_reliability',
    'Earn the right to make the exceptional claim'
  )
  RETURNING id INTO claim_a_id;

  INSERT INTO claims (company_id, claim_type, state, topic, statement)
  VALUES (
    cafe_id,
    'route_candidate',
    'diagnose',
    'process_externalization',
    'Make the Barra Process visible and transferable'
  )
  RETURNING id INTO claim_b_id;

  INSERT INTO claims (company_id, claim_type, state, topic, statement)
  VALUES (
    cafe_id,
    'route_candidate',
    'outside_view',
    'partner_pipeline',
    'Win the right partners through evidence, not pitch'
  )
  RETURNING id INTO claim_c_id;

  RAISE NOTICE 'Step 2 — claims created: A=%, B=%, C=%', claim_a_id, claim_b_id, claim_c_id;

  -- ── 3. Top-level route rows ──────────────────────────────────────────────────
  INSERT INTO routes (
    company_id, user_id, level, title, category, short_description, sort_order,
    primary_desired_outcome_id, claim_id,
    rejected_alternatives, what_would_have_to_be_true
  ) VALUES (
    cafe_id,
    cafe_user,
    'route',
    'Earn the right to make the exceptional claim',
    'fix',
    'Before Cafe Barra can credibly position itself as an exceptional, verifiable partner, the internal operations must be reliable enough to back that claim without overpromising. This route builds the operational and process foundation that makes the exceptional positioning earned rather than asserted.',
    1,
    outcome_id,
    claim_a_id,
    '[
      {
        "alternative_title": "Hire for capacity before systematizing",
        "rejection_reason": "Preparation quality and financial clarity are currently manager-dependent. Scaling headcount before systematizing would scale the inconsistency, not resolve it. Premature growth would require a painful reset and would damage partner relationships in the interim.",
        "considered_at": "2026-05-15"
      },
      {
        "alternative_title": "Accept operational fragility as a startup reality and focus on partner acquisition",
        "rejection_reason": "The positioning as a high-trust, verifiable quality partner requires operational reliability as evidence. A single high-profile stock-out or quality failure with an early partner could permanently damage the relationship and the referral chain that early partners represent.",
        "considered_at": "2026-05-15"
      }
    ]'::jsonb,
    '[
      {"condition": "A margin model can be built from existing POS and invoice data without external tooling investment", "satisfied_flag": false, "evidence_refs": []},
      {"condition": "Supplier terms can be clarified through direct negotiation, not contract replacement", "satisfied_flag": false, "evidence_refs": []},
      {"condition": "The POS system has enough inventory capability to support par-level alerting", "satisfied_flag": false, "evidence_refs": []},
      {"condition": "Preparation quality variance is addressable through documentation, not hiring", "satisfied_flag": false, "evidence_refs": []},
      {"condition": "These four operational improvements can be sequenced without each depending on the others completing first", "satisfied_flag": false, "evidence_refs": []}
    ]'::jsonb
  )
  RETURNING id INTO route_a_id;

  INSERT INTO routes (
    company_id, user_id, level, title, category, short_description, sort_order,
    primary_desired_outcome_id, claim_id,
    rejected_alternatives, what_would_have_to_be_true
  ) VALUES (
    cafe_id,
    cafe_user,
    'route',
    'Make the Barra Process visible and transferable',
    'improve',
    'The Barra Process — five roasting templates, seasonal origin adaptation, the 3-sample protocol — currently lives in instinct and careful notes. This route converts that expertise into something partners can observe, verify, and trust before commitment. It is also the route that validates whether the "exceptional vs really good" positioning claim holds under direct comparison.',
    2,
    outcome_id,
    claim_b_id,
    '[
      {
        "alternative_title": "Build a brand/marketing campaign around the exceptional claim before it is verifiable",
        "rejection_reason": "The relevant buyers (specialty store owners) are sophisticated — they will compare, not defer. Marketing that gets ahead of verifiable proof would set expectations the process cannot yet meet for prospects who have not been through it. Proof first, then amplification.",
        "considered_at": "2026-05-15"
      },
      {
        "alternative_title": "License or acquire an established craft brand rather than building the Barra verifiable identity",
        "rejection_reason": "The Barra Process is the competitive moat. Acquiring a brand would replace Cafe Barra differentiated methodology with someone else — trading the most defensible asset for a shortcut that does not compound.",
        "considered_at": "2026-05-15"
      },
      {
        "alternative_title": "Delay proof-building until more partners are acquired",
        "rejection_reason": "The proof is what enables acquisition of the next partner. Waiting for more partners to build proof creates a catch-22; the seasonal consistency signal and comparison test are how the first selective partners get closed.",
        "considered_at": "2026-05-15"
      }
    ]'::jsonb,
    '[
      {"condition": "At least one Barra roasting template can be written in observable, non-instinct criteria without losing the quality ceiling", "satisfied_flag": false, "evidence_refs": []},
      {"condition": "Partner cafes will value a documented consistency artifact — they care enough about quality verification to use it", "satisfied_flag": false, "evidence_refs": []},
      {"condition": "The seasonal origin model is communicable in a one-page brief that a partner reads as intentional methodology, not supplier inconsistency", "satisfied_flag": false, "evidence_refs": []},
      {"condition": "At least one prospective partner using Blue Bottle or Stumptown can be engaged for a blind comparison test", "satisfied_flag": false, "evidence_refs": []},
      {"condition": "The exceptional vs really good distinction is perceptible to prospects, not just to Cafe Barra — the taste difference survives direct side-by-side evaluation", "satisfied_flag": false, "evidence_refs": []}
    ]'::jsonb
  )
  RETURNING id INTO route_b_id;

  INSERT INTO routes (
    company_id, user_id, level, title, category, short_description, sort_order,
    primary_desired_outcome_id, claim_id,
    rejected_alternatives, what_would_have_to_be_true
  ) VALUES (
    cafe_id,
    cafe_user,
    'route',
    'Win the right partners through evidence, not pitch',
    'create',
    'The partner pipeline currently relies on a full structured interview as the only filter, and on assertion rather than demonstrated proof to convert prospects. This route makes the pipeline more selective at the top (pre-qualification) and more evidence-based at the bottom (proof changes repeat behavior). Intentionally thin at this stage — new legs should be added as evidence accumulates about what actually moves selective partners.',
    3,
    outcome_id,
    claim_c_id,
    '[
      {
        "alternative_title": "Scale outbound partner prospecting before the proof artifacts are ready",
        "rejection_reason": "Outbound to prospects who cannot yet be converted by evidence wastes evaluation capacity and may generate accounts that are misaligned; the Partner Selection Framework explicitly requires relationship depth the existing process is designed to build.",
        "considered_at": "2026-05-15"
      }
    ]'::jsonb,
    '[
      {"condition": "Pre-qualification signals (how an inquiry arrives, what it leads with) are observable enough to score before a full interview", "satisfied_flag": false, "evidence_refs": []},
      {"condition": "The written async screen can correctly identify misaligned accounts before the interview stage", "satisfied_flag": false, "evidence_refs": []},
      {"condition": "Documented operational proof (case evidence from existing partners) is meaningful to prospective partners, not dismissed as self-reported marketing", "satisfied_flag": false, "evidence_refs": []},
      {"condition": "The prospective partner who sees proof converts at a materially higher rate than one who receives only the positioning narrative", "satisfied_flag": false, "evidence_refs": []}
    ]'::jsonb
  )
  RETURNING id INTO route_c_id;

  RAISE NOTICE 'Step 3 — routes created: A=%, B=%, C=%', route_a_id, route_b_id, route_c_id;

  -- ── 4. Assign legs to parents, set sort_order within route ───────────────────
  -- Route A
  UPDATE routes SET level = 'leg', parent_id = route_a_id, sort_order = 1,
    primary_desired_outcome_id = outcome_id
  WHERE id = leg_a1 AND company_id = cafe_id;

  UPDATE routes SET level = 'leg', parent_id = route_a_id, sort_order = 2,
    primary_desired_outcome_id = outcome_id
  WHERE id = leg_a2 AND company_id = cafe_id;

  UPDATE routes SET level = 'leg', parent_id = route_a_id, sort_order = 3,
    primary_desired_outcome_id = outcome_id
  WHERE id = leg_a3 AND company_id = cafe_id;

  UPDATE routes SET level = 'leg', parent_id = route_a_id, sort_order = 4,
    primary_desired_outcome_id = outcome_id
  WHERE id = leg_a4 AND company_id = cafe_id;

  -- Route B
  UPDATE routes SET level = 'leg', parent_id = route_b_id, sort_order = 1,
    primary_desired_outcome_id = outcome_id
  WHERE id = leg_b1 AND company_id = cafe_id;

  UPDATE routes SET level = 'leg', parent_id = route_b_id, sort_order = 2,
    primary_desired_outcome_id = outcome_id
  WHERE id = leg_b2 AND company_id = cafe_id;

  UPDATE routes SET level = 'leg', parent_id = route_b_id, sort_order = 3,
    primary_desired_outcome_id = outcome_id
  WHERE id = leg_b3 AND company_id = cafe_id;

  UPDATE routes SET level = 'leg', parent_id = route_b_id, sort_order = 4,
    primary_desired_outcome_id = outcome_id
  WHERE id = leg_b4 AND company_id = cafe_id;

  -- Route C
  UPDATE routes SET level = 'leg', parent_id = route_c_id, sort_order = 1,
    primary_desired_outcome_id = outcome_id
  WHERE id = leg_c1 AND company_id = cafe_id;

  UPDATE routes SET level = 'leg', parent_id = route_c_id, sort_order = 2,
    primary_desired_outcome_id = outcome_id
  WHERE id = leg_c2 AND company_id = cafe_id;

  RAISE NOTICE 'Step 4 — all 10 legs assigned to parent routes';

  -- ── 5. Claim events — creation records for the three new route claims ─────────
  INSERT INTO claim_events (
    company_id, claim_id, from_state, to_state, triggered_by_event, evidence_delta
  ) VALUES
    (
      cafe_id, claim_a_id,
      'diagnose', 'diagnose',
      'a5_route_hierarchy_migration',
      '{"note": "Route A claim created at diagnose — operational floor must be built before positioning is credible", "route_id_pending": true}'::jsonb
    ),
    (
      cafe_id, claim_b_id,
      'diagnose', 'diagnose',
      'a5_route_hierarchy_migration',
      '{"note": "Route B claim created at diagnose — process externalization path has internal documentation but no external validation yet", "route_id_pending": true}'::jsonb
    ),
    (
      cafe_id, claim_c_id,
      'outside_view', 'outside_view',
      'a5_route_hierarchy_migration',
      '{"note": "Route C claim created at outside_view — partner acquisition direction is a hypothesis; legs are structured tests with no evidence yet", "route_id_pending": true}'::jsonb
    );

  -- Leg restructuring events — write for legs that have claim_id set
  INSERT INTO claim_events (
    company_id, claim_id, from_state, to_state, triggered_by_event, evidence_delta
  )
  SELECT
    cafe_id,
    r.claim_id,
    c.state,
    c.state,
    'a5_leg_parent_assigned',
    jsonb_build_object(
      'parent_route_id', r.parent_id::text,
      'leg_sort_order', r.sort_order,
      'note', 'Leg assigned to parent route in A5 hierarchy migration; claim state unchanged'
    )
  FROM routes r
  JOIN claims c ON c.id = r.claim_id
  WHERE r.company_id = cafe_id
    AND r.level = 'leg'
    AND r.parent_id IS NOT NULL
    AND r.claim_id IS NOT NULL;

  RAISE NOTICE 'Step 5 — claim_events written';

  -- ── 6. Back-fill route_id into the new route claim events ────────────────────
  -- Now that routes exist, patch the route_id into evidence_delta for accuracy.
  UPDATE claim_events
  SET evidence_delta = evidence_delta
    || jsonb_build_object('route_a_id', route_a_id::text)
    || '{"route_id_pending": false}'::jsonb
  WHERE claim_id = claim_a_id AND triggered_by_event = 'a5_route_hierarchy_migration';

  UPDATE claim_events
  SET evidence_delta = evidence_delta
    || jsonb_build_object('route_b_id', route_b_id::text)
    || '{"route_id_pending": false}'::jsonb
  WHERE claim_id = claim_b_id AND triggered_by_event = 'a5_route_hierarchy_migration';

  UPDATE claim_events
  SET evidence_delta = evidence_delta
    || jsonb_build_object('route_c_id', route_c_id::text)
    || '{"route_id_pending": false}'::jsonb
  WHERE claim_id = claim_c_id AND triggered_by_event = 'a5_route_hierarchy_migration';

  -- ── 7. Recompute claim_state_distribution ────────────────────────────────────
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

  RAISE NOTICE 'Step 7 — claim_state_distribution recomputed';
  RAISE NOTICE 'A5 Phase 3 complete — outcome=%, A=%, B=%, C=%',
    outcome_id, route_a_id, route_b_id, route_c_id;

END $$;

COMMIT;
