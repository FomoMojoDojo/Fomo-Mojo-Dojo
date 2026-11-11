-- odi_needs.service_state — the vocabulary, enforced going forward (SP-15, SP-20, SP-37, SP-38;
-- operator rulings 2026-11-11).
--
-- WHY. The column has carried four spellings of three meanings plus one value no reader knows, with
-- nothing stopping a fifth. Measured before this migration: 186 'underserved', 81 'served',
-- 4 'under_served', 2 'appropriately_served' — 273 rows over 21 companies.
--
-- THE FOUR VALUES (SP-37). 'underserved', 'served', 'overserved', 'monitor'.
--   * 'overserved' is live and intended, not a legacy spelling: odiServiceState computes it at
--     research-company/index.ts:2931 (importance - satisfaction <= -2) and the score slider at
--     useOdiNeeds.ts:224 (satisfaction > importance + 1). Ten readers render it.
--   * 'monitor' is ADMITTED, not rewritten. CompanyFilesPanel.tsx:786 and FileUploadDialog.tsx:437
--     write it on needs that were never scored. No reader recognises it, so serviceVerdictWord
--     (surveyVerdict.ts:157-164) returns null and the verdict is SUPPRESSED. Rewriting those two
--     call sites to 'served' would newly render "Served" on an unscored need — a display-honesty
--     change, not a cleanup. Admitting the value preserves today's behaviour exactly.
--
-- WHY `NOT VALID`, AND WHY `VALIDATE` CAN NEVER RUN (SP-38).
--   NOT VALID enforces on every INSERT and UPDATE and never scans existing rows. It is required
--   here, not merely convenient: the six non-conforming rows ('under_served' x4,
--   'appropriately_served' x2) all sit on company 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc, which has
--   companies.frozen = true. The trigger enforce_company_freeze on odi_needs refuses every write to
--   a frozen company's rows ("This is a frozen reference company - its record is preserved and is
--   not modified."), so those six values CANNOT be normalised, and VALIDATE CONSTRAINT - which
--   requires every existing row to pass - can never succeed while they stand. That is a permanent,
--   intended state, not an unfinished migration. It is also why the six rows can never drift into a
--   violation: they are unwritable.
--
-- NO READER CHANGES IN THIS SLICE (SP-38). Two consequences are FILED, not fixed:
--   * SP-F1 - five equality readers compare the snake-case spellings and so never match a row the
--     live writers produce: tensionDerivation.ts:137,334 and JobSteps/index.tsx:1284,1285,1374.
--   * SP-F2 - NeedsOrgPanel.tsx:375 interpolates the raw value into a class name and only
--     .crpv-ws-state-underserved exists in client-refine-preview.css, so three of the four values
--     render an unstyled badge.
--
-- The column is already NOT NULL DEFAULT 'served' (20260312103000), so the CHECK carries no
-- "service_state is null" arm: adding one would imply a NULL is reachable here, and it is not.

alter table public.odi_needs
  add constraint odi_needs_service_state_check
  check (service_state in ('underserved', 'served', 'overserved', 'monitor'))
  not valid;

comment on constraint odi_needs_service_state_check on public.odi_needs is
  'SP-37: the four admitted values. NOT VALID permanently - the six legacy-spelling rows on the frozen company 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc cannot be rewritten (enforce_company_freeze), so VALIDATE CONSTRAINT can never succeed. Enforced on every INSERT and UPDATE regardless.';
