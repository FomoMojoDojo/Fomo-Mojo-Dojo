-- CV-2e (tier A) — provably-verbatim quote + event date at signal capture.
--
-- Standing audit verdict: NOTHING stored today is provably verbatim — evidence_excerpt
-- is aliased model claim_text. This gate fixes capture GOING FORWARD. Tier B
-- (verifying/backfilling existing rows) is deferred (separate operator decision);
-- existing rows keep quote = NULL and render exactly as today.
--
-- STRUCTURAL SEPARATION + SUBSTITUTION GUARD (spirit of require_model): a `quote`
-- may exist ONLY as a VERBATIM SUBSTRING of retained fetched source text
-- (`quote_source_text`). Model output (claim_text / evidence_excerpt) can never
-- satisfy this by construction — a paraphrase is not a substring of its source — so
-- the generator/extraction path is structurally UNABLE to write a quote, and any
-- attempt to pass model text off as a quote FAILS LOUDLY at write time. Quotes are
-- optional (absence is honest); event_date is NULL when the source carries no
-- visible date (absence-isn't-a-verdict — never inferred).

alter table public.signals
  add column if not exists quote             text,
  add column if not exists quote_source_text text,   -- the retained fetched text the quote was lifted from
  add column if not exists event_date        date;   -- source's visible publication/event date; NULL if none

alter table public.signals
  add constraint signals_quote_verbatim check (
    quote is null
    or (
      quote_source_text is not null
      and length(btrim(quote)) > 0
      and position(quote in quote_source_text) > 0   -- byte-exact substring: the verbatim proof
    )
  );
