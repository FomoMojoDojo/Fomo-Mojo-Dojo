-- PHASE 78E: Update strategy cascade and positioning canvas with evidence-derived improvements
-- Merges evidence specificity into reconstructed frames (do not delete reconstructed rows)
-- Marks updated rows as evidence-verified by adding 'evidence_derived_78e' to frameworks_used
--
-- Company: Cafe Barra | ID: 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc
-- Evidence files: 8 active files — Strategic Framework, Positioning (×3), Barra Process,
--   Partner Selection Framework, Alternatives Analysis
-- Safe to re-run: WHERE conditions prevent double-application

BEGIN;

-- ─── Strategy Cascade ─────────────────────────────────────────────────────────
-- Remove hedge language ("confidence should stay provisional") — evidence supports the claims.
-- Add: LA geography (explicit in files), seasonal sourcing model, partner qualification discipline.

UPDATE public.strategy_cascades
SET
  winning_aspiration = 'Be the specialty roast development partner for independent cafe owners in LA who want their coffee to set them apart — providing seasonal sourcing, distinctive roast profiles, and the operational partnership support that commodity distributors and inconsistent artisan roasters cannot match.',
  where_to_play = 'Independent cafes and specialty retailers with 1-5 locations in Los Angeles who treat coffee as central to their brand identity and customer experience. Not commodity buyers or price-first accounts. Operators who actively manage quality, invest in staff training, and want a roaster that views the relationship as a genuine partnership — not a transaction.',
  how_to_win = 'Win by combining a documented roasting methodology (5 templates matched to origin and density) with seasonal sourcing discipline and systematic partner qualification. The Barra Process delivers consistent quality — not the same flavor every season, but exceptional quality across whatever origin is current. Partner selectivity (8-criteria scorecard, declining accounts that prioritize price over quality) creates a network of cafes where the partnership itself becomes a differentiator.',
  frameworks_used = array_append(frameworks_used, 'evidence_derived_78e'),
  updated_at = NOW()
WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
  AND NOT ('evidence_derived_78e' = ANY(frameworks_used));

DO $$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM public.strategy_cascades
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND 'evidence_derived_78e' = ANY(frameworks_used);
  RAISE NOTICE 'Strategy cascade updated: % rows now include evidence_derived_78e', n;
END $$;

-- ─── Positioning Canvas ───────────────────────────────────────────────────────
-- Add unique attributes missing from reconstructed version:
--   (1) The Barra Process / 5 roasting templates (unique-attr file)
--   (2) Partner qualification as unique attribute (referral-map file)
-- Add Specialty Stores segment to competitive alternatives (comp-alt file)
-- Keep reconstructed taglines — they match the evidence exactly

UPDATE public.positioning_canvases
SET
  competitive_alternatives_json = '[
    {"name": "Commodity wholesale distributors (e.g. Groundwork in LA)", "reason": "Easy, reliable, but quality ceiling is \"good enough\" — guarantees the cafe will never be memorable for its coffee"},
    {"name": "Local craft / artisan roasters", "reason": "Sometimes really good, but inconsistency across seasons and batches means quality varies by shift — not a brand you can build on"},
    {"name": "In-house roasting", "reason": "Maximum control aspiration but high capital, expertise, and attention cost — exceptional craft without the infrastructure investment"},
    {"name": "Known craft brands for specialty stores (Blue Bottle, Stumptown, Equator)", "reason": "Brand recognition for shelf retail, but dilutes the store''s own identity — carrying their story, not building yours"},
    {"name": "Rotating local roaster shelf (specialty stores)", "reason": "Supports local but produces no coherent brand narrative — a democracy of decent, not a statement of curation"}
  ]'::jsonb,
  unique_attributes_json = '[
    {"attribute": "The Barra Roast Method — 5 roasting templates matched to bean origin, density, and size characteristics; 3-sample test process to dial in each new season''s beans"},
    {"attribute": "Seasonal sourcing discipline — beans bought for a season, tested and adapted; consistency defined as consistent quality, not same flavor profile"},
    {"attribute": "Partner qualification scorecard — 8-criteria framework (Brand Intent, Quality Standards, Training Culture, Partnership Orientation, Operational Discipline, Volume, Communication, Strategic Alignment) to select accounts that want coffee to strengthen their identity"},
    {"attribute": "Science meets art meets commitment — documented methodology that can be communicated to cafe staff, not craft-only tribal knowledge"},
    {"attribute": "Decline criteria — Cafe Barra refuses accounts that prioritize price over quality, refuse staff training, or treat suppliers as interchangeable vendors"}
  ]'::jsonb,
  value_for_customer = 'For independent cafe owners who want their coffee to be the reason customers choose them and return: Cafe Barra delivers exceptional, seasonally-consistent roast quality and the operational partnership support to sustain it — without requiring the cafe to own roasting infrastructure or accept the inconsistency of commodity alternatives.',
  best_fit_customers = 'Cafe owners and specialty retailers in Los Angeles (1-5 locations) who treat coffee as central to their brand, actively manage quality standards, invest in barista training, and want a roaster who views the relationship as a long-term quality partnership — not a supply transaction. Score 24+ on the Barra Partner Fit Scorecard.',
  frameworks_used = array_append(frameworks_used, 'evidence_derived_78e'),
  updated_at = NOW()
WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
  AND NOT ('evidence_derived_78e' = ANY(frameworks_used));

DO $$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM public.positioning_canvases
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND 'evidence_derived_78e' = ANY(frameworks_used);
  RAISE NOTICE 'Positioning canvas updated: % rows now include evidence_derived_78e', n;
END $$;

-- ─── Routes — mark reconstructed routes as stale ──────────────────────────────
-- Mark existing reconstructed routes as stale (do not delete).
-- Evidence-derived routes should be generated via research-company after needs are in place.

UPDATE public.routes
SET
  frameworks_used = array_append(frameworks_used, 'superseded_by_evidence_78e'),
  updated_at = NOW()
WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
  AND 'reconstructed_prior' = ANY(frameworks_used)
  AND NOT ('superseded_by_evidence_78e' = ANY(frameworks_used));

DO $$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM public.routes
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND 'superseded_by_evidence_78e' = ANY(frameworks_used);
  RAISE NOTICE 'Routes marked as superseded: %', n;
END $$;

-- ─── Final summary ───────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== Phase 78E Artifact Update Complete ===';
  RAISE NOTICE '  Strategy cascade:    evidence_derived_78e tag applied';
  RAISE NOTICE '  Positioning canvas:  evidence_derived_78e tag applied + unique attrs updated';
  RAISE NOTICE '  ODI needs:           10 evidence-derived (see insert_evidence_derived_odi_needs.sql)';
  RAISE NOTICE '  Routes:              5 reconstructed routes marked superseded_by_evidence_78e';
END $$;

COMMIT;
