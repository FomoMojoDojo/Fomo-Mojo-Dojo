-- Claim State Machine: Phase 6 — derived_tensions_structural view
--
-- Postgres view covering the two SQL-expressible structural tension types.
-- Decision §5.3 Hybrid: this view handles deterministic structural tensions;
-- semantic (contradicting-claim) tensions remain client-side in tensionDerivation.ts.
--
-- Tension types covered:
--
--   under_evidenced_diagnose
--     A claim in 'diagnose' state has no qualifying org-band supporting signal.
--     This means it was promoted without meeting the gate requirement,
--     or its supporting signal was later withdrawn/contradicted.
--
--   under_evidenced_focus
--     A claim in 'focus' state has no customer-band supporting signal.
--     Same logic — either gate was bypassed or signal was later lost.
--
--   destabilized_commitment
--     A claim in 'flow' state whose linked route has gone stale
--     (stale_reason IS NOT NULL OR dependency_state = 'stale').
--     This is a Flow→Focus regression trigger that has not yet been acted on.
--
-- Usage: SELECT * FROM derived_tensions_structural WHERE company_id = $1
-- Returns one row per affected claim. Client joins on claim_id for full detail.
--
-- Note: this view does NOT replace the strategic_tensions table.
-- It is a live derivation; strategic_tensions stores cached/user-defined tensions.

CREATE OR REPLACE VIEW public.derived_tensions_structural AS

  -- Type 1a: under_evidenced_diagnose
  -- Claim is in 'diagnose' but lacks a qualifying org-band signal
  SELECT
    c.company_id,
    'under_evidenced_diagnose'::text  AS tension_type,
    c.id                               AS claim_id,
    c.statement,
    c.state,
    c.topic,
    c.claim_type,
    NULL::uuid                         AS route_id,
    NULL::text                         AS stale_reason
  FROM public.claims c
  WHERE c.state = 'diagnose'
    AND NOT EXISTS (
      SELECT 1
      FROM public.claim_signal_refs csr
      JOIN public.signals s ON s.id = csr.signal_id
      WHERE csr.claim_id = c.id
        AND csr.relationship = 'supports'
        AND s.signal_band = 'organization'
        AND s.directness IN ('direct', 'inferred')
        AND s.structure_level IN ('extracted', 'interpreted')
    )

UNION ALL

  -- Type 1b: under_evidenced_focus
  -- Claim is in 'focus' but lacks a customer-band supporting signal
  SELECT
    c.company_id,
    'under_evidenced_focus'::text      AS tension_type,
    c.id                               AS claim_id,
    c.statement,
    c.state,
    c.topic,
    c.claim_type,
    NULL::uuid                         AS route_id,
    NULL::text                         AS stale_reason
  FROM public.claims c
  WHERE c.state = 'focus'
    AND NOT EXISTS (
      SELECT 1
      FROM public.claim_signal_refs csr
      JOIN public.signals s ON s.id = csr.signal_id
      WHERE csr.claim_id = c.id
        AND csr.relationship = 'supports'
        AND s.signal_band = 'customer'
        AND s.validation_status != 'contradicted'
    )

UNION ALL

  -- Type 2: destabilized_commitment
  -- Flow-state claim whose linked route is stale
  SELECT
    c.company_id,
    'destabilized_commitment'::text    AS tension_type,
    c.id                               AS claim_id,
    c.statement,
    c.state,
    c.topic,
    c.claim_type,
    r.id                               AS route_id,
    COALESCE(r.stale_reason, 'dependency_state:stale') AS stale_reason
  FROM public.claims c
  JOIN public.routes r ON r.claim_id = c.id
  WHERE c.state = 'flow'
    AND (r.stale_reason IS NOT NULL OR r.dependency_state = 'stale');

COMMENT ON VIEW public.derived_tensions_structural IS
  'Live Postgres view returning structural tension signals derived from claim '
  'state vs. evidence requirements. Two categories: under-evidenced claims '
  '(claims in a state whose required evidence is missing) and destabilized '
  'commitments (flow claims whose route is stale). '
  'Semantic tensions (contradicting claims) are handled client-side in '
  'src/lib/tensionDerivation.ts. Query per company_id — do not full-scan.';
