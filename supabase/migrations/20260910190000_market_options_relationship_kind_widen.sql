-- Gate 2 — widen the market_options relationship_kind CHECK to the full known vocabulary.
--
-- 20260721150000 pinned this CHECK to six kinds (recipient/buyer/user/referrer/funder/partner) and
-- noted that it "mirrors KNOWN_KINDS in MarketAct.tsx". That mirror has now moved to ONE authority,
-- _shared/relationshipKinds.ts, and gained three members:
--   • investor  — the gap that made Riverlane's venture capitalists render as a charitable "DONOR":
--                 the generator had no equity-backer word anywhere it could see, so it wrote `funder`
--                 and the label map called that Donor. `funder` keeps its own, narrower meaning.
--   • observer  — signed as a served group (Riverlane's industry analysts); it was already being
--                 written to odi_market_definitions, which has no CHECK, and rendering unmarked.
--   • communicator — already carried a signed label ("Advocate") and a live row, but was never
--                 admitted here, so an options-path row of that kind could not be written at all.
--
-- SCOPE. odi_market_definitions.relationship_kind remains free text with NO CHECK, by the standing
-- law in 20260715120000: "the taxonomy is EMERGENT per company, never imposed by us." This CHECK
-- governs market_options ONLY, where the kind is not model-assigned at all — it is derived by the
-- deterministic UNAMBIGUOUS-TRACE rule from the defs, so widening it can only ever admit a kind a def
-- already carries. Kinds outside the set still render everywhere, with the signed emergent-kind note.
--
-- NO ROW IS RENAMED. The 5 existing market_options rows tagged `funder` stay `funder` and will now
-- read "Funder" instead of "Donor". Re-tagging is a separate, unsigned question.
--
-- SAFETY. Widening a CHECK is strictly permissive: every row that satisfied the old constraint
-- satisfies the new one, so the revalidation this triggers cannot fail. Verified before applying —
-- market_options holds funder 5, partner 7, recipient 9, referrer 25, NULL 22 and nothing else.

ALTER TABLE public.market_options
  DROP CONSTRAINT IF EXISTS market_options_relationship_kind_check;

ALTER TABLE public.market_options
  ADD CONSTRAINT market_options_relationship_kind_check
  CHECK (
    relationship_kind IS NULL
    OR relationship_kind = ANY (ARRAY[
      'recipient'::text, 'buyer'::text, 'user'::text,
      'referrer'::text, 'funder'::text, 'investor'::text,
      'partner'::text, 'observer'::text, 'communicator'::text
    ])
  );
