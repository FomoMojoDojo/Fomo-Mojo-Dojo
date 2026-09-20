-- R9 (operator, 2026-09-19): interview_records.interviewed_at drops NOT NULL. The upload door
-- (record-interview-upload) stores NULL — the upload time is not the interview date and no fact is
-- invented. The quote path (record-interview-finding → record_interview_finding RPC) still supplies it,
-- unchanged. Non-destructive; nothing backfilled.
BEGIN;
ALTER TABLE public.interview_records ALTER COLUMN interviewed_at DROP NOT NULL;
COMMENT ON COLUMN public.interview_records.interviewed_at IS 'The interview date when known (the quote path supplies it). NULL for an upload record (R9, 2026-09-19): the upload time is not the interview date.';
COMMIT;
