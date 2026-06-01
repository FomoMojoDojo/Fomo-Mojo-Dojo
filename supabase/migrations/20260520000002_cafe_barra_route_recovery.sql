-- Cafe Barra Route Recovery — A5 data migration
-- Deprioritizes 9 consumer-facing routes from a pre-B2B-pivot research-company run
-- and inserts the 3 B2B strategic routes + 10 legs + 1 desired_outcome from the
-- A5 proposal (docs/migrations/cafe-barra-a5-route-proposal.md).
-- Baselines are captured inline via subquery (equivalent to captureBaseline utility).

DO $$
DECLARE
  v_company_id uuid := '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
  v_user_id    uuid := 'fd766480-d2ef-4794-a79a-b849a91df024';
  v_do_id      uuid;
  v_route_a_id uuid;
  v_route_b_id uuid;
  v_route_c_id uuid;
BEGIN

  -- ── 1. Deprioritize the 9 existing consumer-facing routes ─────────────────
  UPDATE public.routes
  SET relevance_state = 'deprioritized'
  WHERE company_id = v_company_id
    AND level = 'route'
    AND relevance_state = 'active';

  -- ── 2. Insert desired outcome (idempotent: skip if primary already exists) ─
  SELECT id INTO v_do_id
  FROM public.desired_outcomes
  WHERE company_id = v_company_id AND is_primary = true
  LIMIT 1;

  IF v_do_id IS NULL THEN
    INSERT INTO public.desired_outcomes
      (company_id, statement, importance_score, satisfaction_score, metric, is_primary)
    VALUES (
      v_company_id,
      'Earn recognition as the verifiable quality standard for craft-first cafe operators, building sustainable margin through selective partner relationships and a documented, transferable process.',
      9,
      2,
      '>=5 active partner accounts with documented renewal; >=2 referral-sourced accounts',
      true
    )
    RETURNING id INTO v_do_id;
  END IF;

  -- ── 3. Insert Route A: Earn the right to make the exceptional claim ────────
  INSERT INTO public.routes
    (company_id, user_id, level, parent_id, primary_desired_outcome_id,
     category, title, short_description,
     source, relevance_state, sort_order, effort, type, pts_value,
     rejected_alternatives, what_would_have_to_be_true)
  VALUES (
    v_company_id, v_user_id, 'route', NULL, v_do_id,
    'fix',
    'Earn the right to make the exceptional claim',
    'Before Cafe Barra can credibly position itself as an exceptional, verifiable partner, the internal operations must be reliable enough to back that claim without overpromising. This route builds the operational and process foundation that makes the exceptional positioning earned rather than asserted.',
    'manual_a5_recovery', 'active', 1, 'high', 'Fix', 8,
    '[{"alternative_title": "Hire for capacity before systematizing", "rejection_reason": "Preparation quality and financial clarity are currently manager-dependent. Scaling headcount before systematizing would scale the inconsistency, not resolve it."}, {"alternative_title": "Accept operational fragility as a startup reality and focus on partner acquisition", "rejection_reason": "The positioning as a high-trust verifiable quality partner requires operational reliability as evidence. A single high-profile quality failure could permanently damage early partner relationships."}]'::jsonb,
    '[{"condition": "A margin model can be built from existing POS and invoice data without external tooling investment", "satisfied_flag": false}, {"condition": "Supplier terms can be clarified through direct negotiation, not contract replacement", "satisfied_flag": false}, {"condition": "The POS system has enough inventory capability to support par-level alerting", "satisfied_flag": false}, {"condition": "Preparation quality variance is addressable through documentation, not hiring", "satisfied_flag": false}, {"condition": "These four operational improvements can be sequenced without each depending on the others completing first", "satisfied_flag": false}]'::jsonb
  )
  RETURNING id INTO v_route_a_id;

  -- ── 4. Insert Route B: Make the Barra Process visible and transferable ─────
  INSERT INTO public.routes
    (company_id, user_id, level, parent_id, primary_desired_outcome_id,
     category, title, short_description,
     source, relevance_state, sort_order, effort, type, pts_value,
     rejected_alternatives, what_would_have_to_be_true)
  VALUES (
    v_company_id, v_user_id, 'route', NULL, v_do_id,
    'improve',
    'Make the Barra Process visible and transferable',
    'The Barra Process — five roasting templates, seasonal origin adaptation, the 3-sample protocol — currently lives in instinct and careful notes. This route converts that expertise into something partners can observe, verify, and trust before commitment.',
    'manual_a5_recovery', 'active', 2, 'high', 'Improve', 9,
    '[{"alternative_title": "Build a brand/marketing campaign around the exceptional claim before it is verifiable", "rejection_reason": "The relevant buyers are sophisticated — they will compare, not defer. Marketing that gets ahead of verifiable proof would set expectations the process cannot yet meet for prospects who have not been through it."}, {"alternative_title": "License or acquire an established craft brand rather than building Barra''s own verifiable identity", "rejection_reason": "The Barra Process is the competitive moat. Acquiring a brand would replace Cafe Barra''s differentiated methodology with someone else''s — trading the most defensible asset for a shortcut that does not compound."}, {"alternative_title": "Delay proof-building until more partners are acquired", "rejection_reason": "The proof is what enables acquisition of the next partner. Waiting creates a catch-22; the seasonal consistency signal and comparison test are how the first selective partners get closed."}]'::jsonb,
    '[{"condition": "At least one Barra roasting template can be written in observable criteria without losing the quality ceiling", "satisfied_flag": false}, {"condition": "Partner cafes will value a documented consistency artifact — i.e., they care enough about quality verification to use it", "satisfied_flag": false}, {"condition": "The seasonal origin model is communicable in a one-page brief that a partner reads as intentional methodology, not supplier inconsistency", "satisfied_flag": false}, {"condition": "At least one prospective partner using Blue Bottle or Stumptown can be engaged for a blind comparison test", "satisfied_flag": false}, {"condition": "The exceptional vs really good distinction is perceptible to prospects — the taste difference survives direct side-by-side evaluation", "satisfied_flag": false}]'::jsonb
  )
  RETURNING id INTO v_route_b_id;

  -- ── 5. Insert Route C: Win the right partners through evidence, not pitch ──
  INSERT INTO public.routes
    (company_id, user_id, level, parent_id, primary_desired_outcome_id,
     category, title, short_description,
     source, relevance_state, sort_order, effort, type, pts_value,
     rejected_alternatives, what_would_have_to_be_true)
  VALUES (
    v_company_id, v_user_id, 'route', NULL, v_do_id,
    'create',
    'Win the right partners through evidence, not pitch',
    'The partner pipeline currently relies on a full structured interview as the only filter, and on assertion rather than demonstrated proof to convert prospects. This route makes the pipeline more selective at the top (pre-qualification) and more evidence-based at the bottom (proof changes repeat behavior).',
    'manual_a5_recovery', 'active', 3, 'medium', 'Create', 7,
    '[{"alternative_title": "Scale outbound partner prospecting before the proof artifacts are ready", "rejection_reason": "Outbound to prospects who cannot yet be converted by evidence wastes evaluation capacity and may generate accounts that are misaligned; the Partner Selection Framework explicitly requires relationship depth the existing process is designed to build."}]'::jsonb,
    '[{"condition": "Pre-qualification signals are observable enough to score before a full interview", "satisfied_flag": false}, {"condition": "The written async screen can correctly identify misaligned accounts before the interview stage", "satisfied_flag": false}, {"condition": "Documented operational proof is meaningful to prospective partners, not dismissed as self-reported marketing", "satisfied_flag": false}, {"condition": "The prospective partner who sees proof converts at a materially higher rate than one who receives only the positioning narrative", "satisfied_flag": false}]'::jsonb
  )
  RETURNING id INTO v_route_c_id;

  -- ── 6. Insert Legs A1-A4 (parent = Route A) ───────────────────────────────
  INSERT INTO public.routes
    (company_id, user_id, level, parent_id,
     category, title, short_description,
     source, relevance_state, sort_order, effort, type, pts_value)
  VALUES
    (v_company_id, v_user_id, 'leg', v_route_a_id,
     'fix', 'Make margin tradeoffs visible before pricing changes',
     'Financial reliability precondition — without a margin model, pricing is reactive and erodes partner trust.',
     'manual_a5_recovery', 'active', 1, 'medium', 'Fix', 6),
    (v_company_id, v_user_id, 'leg', v_route_a_id,
     'fix', 'Reduce reorder friction caused by unclear supplier terms',
     'Supply reliability is the operational promise Cafe Barra must keep — unclear terms create the exact stock-out risk that makes partners lose confidence.',
     'manual_a5_recovery', 'active', 2, 'medium', 'Fix', 6),
    (v_company_id, v_user_id, 'leg', v_route_a_id,
     'improve', 'Reduce stock-out risk before manual counts fail',
     'Direct manifestation of operational reliability. This is what failing on the partner promise looks like in practice.',
     'manual_a5_recovery', 'active', 3, 'medium', 'Improve', 5),
    (v_company_id, v_user_id, 'leg', v_route_a_id,
     'improve', 'Shift preparation quality from manager-dependent to system-supported',
     'Preparation quality consistency must hold system-wide, not just when the owner is present.',
     'manual_a5_recovery', 'active', 4, 'medium', 'Improve', 6);

  -- ── 7. Insert Legs B1-B4 (parent = Route B) ───────────────────────────────
  INSERT INTO public.routes
    (company_id, user_id, level, parent_id,
     category, title, short_description,
     source, relevance_state, sort_order, effort, type, pts_value)
  VALUES
    (v_company_id, v_user_id, 'leg', v_route_b_id,
     'improve', 'Externalize one Barra roasting template into observable, partner-communicable criteria',
     'Foundation leg — if the quality ceiling can be documented without losing precision, all subsequent proof artifacts become possible.',
     'manual_a5_recovery', 'active', 1, 'high', 'Improve', 8),
    (v_company_id, v_user_id, 'leg', v_route_b_id,
     'fix', 'Design the seasonal origin transition so partner cafes experience it as a methodology feature, not a supply disruption',
     'Partners must experience the seasonal model as intentional methodology, not supplier inconsistency. This communication design leg converts the Barra Process from internal philosophy to external proof.',
     'manual_a5_recovery', 'active', 2, 'medium', 'Fix', 6),
    (v_company_id, v_user_id, 'leg', v_route_b_id,
     'create', 'Build a seasonal consistency signal partner cafes can observe independently',
     'Creates the verifiable artifact that lets prospects evaluate quality before commitment — the trust-but-verify entry point for new partners.',
     'manual_a5_recovery', 'active', 3, 'medium', 'Create', 7),
    (v_company_id, v_user_id, 'leg', v_route_b_id,
     'create', 'Test whether the exceptional positioning holds under direct comparison with premium craft alternatives',
     'The positioning claim needs to survive direct comparison with Blue Bottle and Stumptown from a prospect who has already used them.',
     'manual_a5_recovery', 'active', 4, 'medium', 'Create', 7);

  -- ── 8. Insert Legs C1-C2 (parent = Route C) ───────────────────────────────
  INSERT INTO public.routes
    (company_id, user_id, level, parent_id,
     category, title, short_description,
     source, relevance_state, sort_order, effort, type, pts_value)
  VALUES
    (v_company_id, v_user_id, 'leg', v_route_c_id,
     'fix', 'Add a lightweight pre-qualification tier before the full partner interview',
     'The 8-criteria framework is currently used as a screen when it was designed as an evaluation instrument — pre-qualification protects it for the right accounts.',
     'manual_a5_recovery', 'active', 1, 'low', 'Fix', 5),
    (v_company_id, v_user_id, 'leg', v_route_c_id,
     'create', 'Test whether operational proof changes repeat purchasing confidence',
     'The hypothesis that documented operational proof changes partner behavior needs to be tested directly — this is a structured learning exercise, not an acquisition motion.',
     'manual_a5_recovery', 'active', 2, 'medium', 'Create', 6);

  -- ── 9. Capture baselines for all 13 new rows ──────────────────────────────
  -- Equivalent to captureBaseline(company_id, 'route', id) for each row.
  -- Uses the current active signal corpus (218 signals at time of migration).
  UPDATE public.routes
  SET
    evidence_baseline_signal_ids = to_jsonb(ARRAY(
      SELECT id FROM public.signals
      WHERE company_id = v_company_id
        AND relevance_state = 'active'
    )),
    evidence_baseline_captured_at = now()
  WHERE company_id = v_company_id
    AND source = 'manual_a5_recovery';

END $$;
