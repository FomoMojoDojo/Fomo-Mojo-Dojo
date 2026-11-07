-- operator_edited_at (rulings Q1–Q7, signed 2026-11-06; P1 of the Diagnose flow) — the OPERATOR-AUTHORSHIP flag.
--
-- WHY A NEW COLUMN AND NOT A provenance_type RESTAMP (ruling Q3, explicitly out of scope for a restamp):
-- an operator inline edit is text typed from private client knowledge, so the row must stop being admissible to an
-- outside model. saveManualEdit (src/lib/manualInlineEdit.ts) wrote `source='manual_inline'` / `source_path='manual_%'`
-- and left provenance_type alone, so four live Edgewood rows plus one FomoMojoDojo row sat stamped `public_research`
-- while carrying operator prose — and both external gates admitted them. Restamping provenance_type would ripple
-- through the local/external XOR partition (isSubjectLocalAdmissible = !isDriftSurfaceExternallyAdmissible) and every
-- other consumer of that column; this flag is ADDITIVE and the two external gates are its only readers.
--
-- THE LAW IT SERVES: client-provided material never reaches an outside model; public data may, even for a company
-- that also holds client material (Sep 18 wall correction) — the law follows the MATERIAL, not the company. A row
-- with operator_edited_at set is operator-authored material, so it is refused at the external boundary regardless of
-- its provenance label. NULL means "never operator-edited" and changes nothing.
--
-- THE FIVE TABLES are exactly the step-1 census: every table saveManualEdit writes to, plus every other writer that
-- stamps source / source_path 'manual_%'.
--   positioning_canvases   source       saveManualEdit; usePositioningCanvas.ts:226; WorkshopView.tsx:810
--   strategy_cascades      source       saveManualEdit; useStrategyCascade.ts:154;   WorkshopView.tsx:883
--   routes                 source       saveManualEdit; RoutesView.tsx:943
--   odi_needs              source_path  saveManualEdit; useOpportunityProposalHandlers.ts:55
--   odi_market_definitions source_path  JobSteps/index.tsx:2470, :2487 ('manual_context_edit')
-- odi_market_definitions is included because the census names it; NO external gate reads it today (reported at STOP 1).
--
-- NOT A BACKFILL. This migration adds the column only. The 26 already-edited rows are stamped by the Q3 backfill,
-- which is its own staged data act with its own audit rows — so applying this migration changes no row's behaviour.

alter table public.positioning_canvases   add column if not exists operator_edited_at timestamptz null;
alter table public.strategy_cascades      add column if not exists operator_edited_at timestamptz null;
alter table public.routes                 add column if not exists operator_edited_at timestamptz null;
alter table public.odi_needs              add column if not exists operator_edited_at timestamptz null;
alter table public.odi_market_definitions add column if not exists operator_edited_at timestamptz null;

comment on column public.positioning_canvases.operator_edited_at   is 'Set by saveManualEdit on every operator inline edit. Non-NULL ⇒ operator-authored; both external gates refuse the row (Q3, 2026-11-06). Never restamps provenance_type.';
comment on column public.strategy_cascades.operator_edited_at      is 'Set by saveManualEdit on every operator inline edit. Non-NULL ⇒ operator-authored; both external gates refuse the row (Q3, 2026-11-06). Never restamps provenance_type.';
comment on column public.routes.operator_edited_at                 is 'Set by saveManualEdit on every operator inline edit. Non-NULL ⇒ operator-authored; both external gates refuse the row (Q3, 2026-11-06). Never restamps provenance_type.';
comment on column public.odi_needs.operator_edited_at              is 'Set by saveManualEdit on every operator inline edit. Non-NULL ⇒ operator-authored; both external gates refuse the row (Q3, 2026-11-06). Never restamps provenance_type.';
comment on column public.odi_market_definitions.operator_edited_at is 'Operator-edit flag for parity with the other four manual_% tables. No external gate reads this table today (reported at STOP 1, 2026-11-06).';

-- Partial indexes: the gates ask "is this one row operator-edited?" by id, and the backfill/census ask
-- "which rows are stamped?". Partial on NOT NULL keeps them to the stamped minority (5 of 26 matter today).
create index if not exists positioning_canvases_operator_edited   on public.positioning_canvases   (company_id) where operator_edited_at is not null;
create index if not exists strategy_cascades_operator_edited      on public.strategy_cascades      (company_id) where operator_edited_at is not null;
create index if not exists routes_operator_edited                 on public.routes                 (company_id) where operator_edited_at is not null;
create index if not exists odi_needs_operator_edited              on public.odi_needs              (company_id) where operator_edited_at is not null;
create index if not exists odi_market_definitions_operator_edited on public.odi_market_definitions (company_id) where operator_edited_at is not null;
