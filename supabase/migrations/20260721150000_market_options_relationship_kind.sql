-- MO-2c (1) — relationship_kind on market options, restoring the Act A chip.
--
-- The pre-MO-1 blended Act A cards rendered a chip from
-- odi_market_definitions.relationship_kind (MPD-3, 6eeabe8). MO-1's render swap
-- (2393874) stood those cards down and the chip went with them. market_options
-- has no equivalent: proof_tier is pinned to 'hypothesis' by CHECK (a constant,
-- so useless as a tag) and market_register is a different axis (provenance of the
-- claim, not relationship). So the kind needs its own column.
--
-- NEVER MODEL-ASSIGNED. The kind is derived by a deterministic UNAMBIGUOUS-TRACE
-- rule, here and at write time:
--
--   normalize both sides (lowercase, strip non-alphanumeric, collapse space,
--   tokenize, drop stopwords). An option TRACES to a def iff EVERY distinctive
--   token of option.executor_statement appears in that def's job_executor.
--   Collect the DISTINCT NON-NULL kinds across all matching defs:
--     exactly 1  -> assign it
--     0 matches / all-NULL / >=2 distinct kinds -> NULL
--
-- NULL means NO CHIP, silently — the pre-MO-1 behaviour. Display-honesty law: an
-- honest absent chip beats a guessed one, so there is no fuzzy borrow, no
-- nearest-neighbour and no threshold anywhere in the rule.
--
-- Signed evaluation over Edgewood's 17 live candidates:
--   referrer 7 · funder 1 · recipient 1 · NULL 8
-- The six-kind CHECK mirrors KNOWN_KINDS in MarketAct.tsx. A value outside it
-- would render with the existing signed note rather than being invented here.

ALTER TABLE public.market_options
  ADD COLUMN relationship_kind text;

ALTER TABLE public.market_options
  ADD CONSTRAINT market_options_relationship_kind_check
  CHECK (
    relationship_kind IS NULL
    OR relationship_kind = ANY (ARRAY[
      'recipient'::text, 'buyer'::text, 'user'::text,
      'referrer'::text, 'funder'::text, 'partner'::text
    ])
  );

-- ── BACKFILL: the same rule, in SQL ──────────────────────────────────────────
-- option tokens ⊆ def tokens (array containment); resolve on the DISTINCT
-- NON-NULL kind; anything that does not resolve to exactly one stays NULL.
-- Applied locally with this exact statement; verified against the signed
-- evaluation of Edgewood's 17 live candidates — referrer 7 · funder 1 ·
-- recipient 1 · NULL 8 — matching per-option, not merely in aggregate.
WITH d AS (
  SELECT company_id, relationship_kind k,
    (SELECT array_agg(t) FROM unnest(regexp_split_to_array(lower(regexp_replace(job_executor,'[^a-zA-Z0-9]+',' ','g')),'\s+')) t
      WHERE t <> '' AND t <> ALL (ARRAY['and','of','the','in','at','for','to','a','an','their','who','that','which','with','or'])) toks
  FROM odi_market_definitions
),
o AS (
  SELECT id, company_id,
    (SELECT array_agg(t) FROM unnest(regexp_split_to_array(lower(regexp_replace(executor_statement,'[^a-zA-Z0-9]+',' ','g')),'\s+')) t
      WHERE t <> '' AND t <> ALL (ARRAY['and','of','the','in','at','for','to','a','an','their','who','that','which','with','or'])) toks
  FROM market_options
),
m AS (
  SELECT o.id, array_agg(DISTINCT d.k) FILTER (WHERE d.k IS NOT NULL) kinds
  FROM o LEFT JOIN d ON o.company_id = d.company_id AND o.toks IS NOT NULL AND o.toks <@ d.toks
  GROUP BY o.id
)
UPDATE market_options mo SET relationship_kind = m.kinds[1]
FROM m WHERE mo.id = m.id AND array_length(m.kinds,1) = 1;
