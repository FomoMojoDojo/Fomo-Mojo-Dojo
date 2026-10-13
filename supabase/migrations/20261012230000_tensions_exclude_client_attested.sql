-- ── R-A5 (operator ruling, 2026-10-12): an attestation IS evidence ──────────────────────────────
--
-- Act 1's correction claim (client_attested, state 'diagnose') appeared in
-- derived_tensions_structural as under_evidenced_diagnose, because the branch asks only "is there a
-- supporting organization signal?" and a correction the client spoke in a meeting has none. That
-- reads the wrong way round: the client telling us the record is wrong is not a claim waiting for
-- evidence, it IS the evidence. The tension was an artifact of the view's question, not a real gap.
--
-- So both under_evidenced branches now exclude client_attested. The 'flow'/stale branch is left
-- alone: staleness is about dependencies, not about how well evidenced a claim is.
--
-- NOTE ON POLARITY: this is an explicit exclusion of ONE provenance, not an allowlist, because the
-- view's other provenances (public_observed, internal_declared, analytic, publicly_declared) all do
-- want the under-evidenced question asked of them. A guard test fixes that intent
-- (clientAttestedTension.test.ts) and fails if a client_attested row ever reappears.
CREATE OR REPLACE VIEW public.derived_tensions_structural AS
 SELECT c.company_id,
    'under_evidenced_diagnose'::text AS tension_type,
    c.id AS claim_id,
    c.statement,
    c.state,
    c.topic,
    c.claim_type,
    NULL::uuid AS route_id,
    NULL::text AS stale_reason
   FROM claims c
  WHERE ((c.state = 'diagnose'::text) AND (c.provenance <> 'client_attested'::text) AND (NOT (EXISTS ( SELECT 1
           FROM (claim_signal_refs csr
             JOIN signals s ON ((s.id = csr.signal_id)))
          WHERE ((csr.claim_id = c.id) AND (csr.relationship = 'supports'::text) AND (s.signal_band = 'organization'::text) AND (s.directness = ANY (ARRAY['direct'::text, 'inferred'::text])) AND (s.structure_level = ANY (ARRAY['extracted'::text, 'interpreted'::text])))))))
UNION ALL
 SELECT c.company_id,
    'under_evidenced_focus'::text AS tension_type,
    c.id AS claim_id,
    c.statement,
    c.state,
    c.topic,
    c.claim_type,
    NULL::uuid AS route_id,
    NULL::text AS stale_reason
   FROM claims c
  WHERE ((c.state = 'focus'::text) AND (c.provenance <> 'client_attested'::text) AND (NOT (EXISTS ( SELECT 1
           FROM (claim_signal_refs csr
             JOIN signals s ON ((s.id = csr.signal_id)))
          WHERE ((csr.claim_id = c.id) AND (csr.relationship = 'supports'::text) AND (s.signal_band = 'customer'::text) AND (s.validation_status <> 'contradicted'::text))))))
UNION ALL
 SELECT c.company_id,
    'destabilized_commitment'::text AS tension_type,
    c.id AS claim_id,
    c.statement,
    c.state,
    c.topic,
    c.claim_type,
    r.id AS route_id,
    COALESCE(r.stale_reason, 'dependency_state:stale'::text) AS stale_reason
   FROM (claims c
     JOIN routes r ON ((r.claim_id = c.id)))
  WHERE ((c.state = 'flow'::text) AND ((r.stale_reason IS NOT NULL) OR (r.dependency_state = 'stale'::text)));

-- CREATE OR REPLACE VIEW DROPS reloptions, so it silently undid the V1 fix (migration
-- 20261005120000): security_invoker went missing and the view would have reverted to DEFINER
-- rights. Caught by reading pg_class.reloptions right after the replace, and re-set here so the
-- migration is self-contained. grants-guard g6 is the standing check.
alter view public.derived_tensions_structural set (security_invoker = true);

comment on view public.derived_tensions_structural is
  'Structural claim tensions. security_invoker: the caller''s grants and RLS on claims/claim_signal_refs decide what is visible. R-A5 (2026-10-12): a client_attested claim is never under_evidenced — the attestation is its evidence.';
