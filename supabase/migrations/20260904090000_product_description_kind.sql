-- OPTION B (operator ruling 2026-09-04): product_description becomes a REAL non-eligible own-words kind.
-- The extractor's deterministic product-description check (isProductDescription) and the RF channels
-- admission both name it; until now the CHECK constraints listed only the 11 judge kinds. Additive: the
-- two constraints gain one value. Nothing is rewritten. Applied with psql -f (repo convention).
alter table public.claims drop constraint claims_statement_kind_check;
alter table public.claims add constraint claims_statement_kind_check check (
  statement_kind is null or statement_kind in ('positioning','offer','audience','proof','instruction','slogan','location','policy','story','recruiting','other','product_description')
);
alter table public.own_words_candidates drop constraint own_words_candidates_judge_kind_check;
alter table public.own_words_candidates add constraint own_words_candidates_judge_kind_check check (
  judge_kind is null or judge_kind in ('positioning','offer','audience','proof','instruction','slogan','location','policy','story','recruiting','other','product_description')
);
