-- GATE B-1 COMPLETION (discovered during B-2 execution, 2026-08-20): the pairing_kind
-- split (20260820180000) scoped every query, the negative cache, and the stale-sweep by
-- kind, but left the UNIQUE(company_id, content_identity) constraint KIND-BLIND. Because
-- content_identity hashes only the statement text (pairIdentity / silenceIdentity, no
-- pairing_kind), the two reads legitimately share identities on the SAME market publics:
-- an unpaired market public is `internally_silent|<publicStmt>` in BOTH the internal read
-- (declared = founding claims) and the public read (declared = client-voice public claims).
-- The internal read banked 43 such rows; the public finalize then collided on the kind-blind
-- constraint ("duplicate key value violates claim_deltas_company_id_content_identity_key"),
-- threw, wrote a status=failed gap-pairs integrity row, and produced ZERO public
-- internally_silent rows.
--
-- Fix: make the uniqueness kind-aware — the same content_identity may coexist once per
-- pairing_kind, which is exactly the access pattern every query already assumes. This is a
-- CONSTRAINT swap only: it changes no existing row and no content_identity value, so the
-- internal_vs_public rows stay byte-identical and the rejected_pairing tombstone keeps its
-- identity. CB1 (frozen) has zero claim_deltas rows; its enforce_company_freeze trigger
-- never fires. Idempotent.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claim_deltas_company_id_content_identity_key') THEN
    ALTER TABLE public.claim_deltas DROP CONSTRAINT claim_deltas_company_id_content_identity_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claim_deltas_company_id_content_identity_pairing_kind_key') THEN
    ALTER TABLE public.claim_deltas
      ADD CONSTRAINT claim_deltas_company_id_content_identity_pairing_kind_key
      UNIQUE (company_id, content_identity, pairing_kind);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claim_delta_rejections_company_id_content_identity_key') THEN
    ALTER TABLE public.claim_delta_rejections DROP CONSTRAINT claim_delta_rejections_company_id_content_identity_key;
  END IF;
  -- Name kept <= 63 chars so Postgres does not truncate it (which would break this
  -- guard's idempotency on re-apply).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claim_delta_rejections_company_id_content_identity_pairing_kind') THEN
    ALTER TABLE public.claim_delta_rejections
      ADD CONSTRAINT claim_delta_rejections_company_id_content_identity_pairing_kind
      UNIQUE (company_id, content_identity, pairing_kind);
  END IF;
END $$;
