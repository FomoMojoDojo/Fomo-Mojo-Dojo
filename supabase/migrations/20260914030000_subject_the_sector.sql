-- VOCABULARY RULING (2026-09-14): subject value the_market → the_sector.
-- In ODI a market is a group of people plus the job they are trying to get done — parents seeking
-- mental-health support for their child IS the client's market, so "the_market" on a non-client document
-- read as evidence about the client's customers, the very promotion this arc closes. "the_sector" carries
-- the intended meaning (about something other than this company). this_company is unchanged; no other
-- behaviour changes.
ALTER TABLE public.doc_voice_verdicts DROP CONSTRAINT IF EXISTS doc_voice_verdicts_subject_check;
UPDATE public.doc_voice_verdicts SET subject = 'the_sector' WHERE subject = 'the_market';
ALTER TABLE public.doc_voice_verdicts ADD CONSTRAINT doc_voice_verdicts_subject_check
  CHECK (subject IS NULL OR subject IN ('this_company', 'the_sector', 'uncertain'));
COMMENT ON COLUMN public.doc_voice_verdicts.subject IS 'this_company | the_sector | uncertain — what the document is about (ruling 4, 2026-09-13; the_market renamed the_sector 2026-09-14: a market is people + their job, and is the client''s); NULL on rows judged before the fact existed';
UPDATE public.signals SET raw_payload = jsonb_set(raw_payload, '{upload_origin,subject}', '"the_sector"') WHERE raw_payload->'upload_origin'->>'subject' = 'the_market';
UPDATE public.provenance_remints SET from_subject = 'the_sector' WHERE from_subject = 'the_market';
UPDATE public.provenance_remints SET to_subject = 'the_sector' WHERE to_subject = 'the_market';
