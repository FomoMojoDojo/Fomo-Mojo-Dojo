-- Follow-up 6 (intake gate 2026-09-25) — the optional contact the quiz now collects.
--
-- The launch-site quiz collects an optional name and work email (R1, relay commit c7455ea3).
-- They ride into the hosted mailbox inside intake_submissions.payload (jsonb) and are dropped
-- by the importer, whose IntakeRequest type never carried them. These two nullable columns give
-- them a structured home.
--
-- WHY intake_responses AND NOT companies: a company can submit more than once, and each
-- submission carries its own contact. intake_responses already holds one row per submission
-- (UNIQUE (company_id, submission_key)), so a later submission ADDS a contact rather than
-- overwriting the earlier one — by construction, with no clobber guard to write or forget.
-- A column on companies would be single-valued and would overwrite on every re-submission.
--
-- NO CHECK CONSTRAINT on contact_email (operator ruling C3): the quiz's email test is a
-- client-side SHAPE check only, and the relay deliberately KEEPS a malformed address and marks
-- it "(unverified)" rather than rejecting the submission. A CHECK here would fail the import on
-- exactly the submission most worth keeping.
--
-- NOT in the .extracted.txt sidecar (operator ruling C2): the markdown is the human artifact,
-- the sidecar is the model-facing one. research-company builds an uploaded-evidence brief from
-- the first 210 characters of every sidecar; it is not consumed today, but a person's email is
-- not evidence about the business and has no reason to sit in that window.
--
-- RLS: nothing to add. Policies are table-level and already exist (20260812210000): RLS enabled,
-- "Admins can manage all intake responses" (ALL) + "Users can view own intake responses"
-- (SELECT, auth.uid() = user_id). New columns inherit them.
--
-- Additive only. No existing row changes. No backfill: submissions imported before R1 never
-- carried a contact, and NULL is the honest record of that.

BEGIN;

ALTER TABLE public.intake_responses
  ADD COLUMN IF NOT EXISTS contact_name  text,
  ADD COLUMN IF NOT EXISTS contact_email text;

COMMENT ON COLUMN public.intake_responses.contact_name IS
  'Optional name from the launch-site quiz. Never required; may be NULL.';

COMMENT ON COLUMN public.intake_responses.contact_email IS
  'Optional work email from the launch-site quiz. Shape-checked client-side only; may be malformed or NULL. Operator contact detail — never sent to an external model.';

COMMIT;
