-- CAFE BARRA STORAGE METADATA REHYDRATION
-- Phase 78C — 2026-05-13
--
-- Recreates storage.objects, inputs, and input_files rows for the 32 surviving
-- Cafe Barra blobs in the Docker storage volume after supabase db reset wiped
-- the PostgreSQL database. All physical files are intact at:
--   docker volume: supabase_storage_dzlgyxcvuwiulgifbmew
--
-- Safety:
--   - No data is deleted. All inserts use ON CONFLICT DO NOTHING.
--   - Original object UUIDs from the storage volume are preserved as storage.objects.id
--   - Original input_id UUIDs from storage paths are preserved as inputs.id
--   - inputs.user_id = admin user (required by FK; original user UUIDs not in auth.users)
--   - storage.objects.owner = original uploader UUID (no FK constraint on that column)
--   - All rows tagged: frameworks_used includes 'recovered_storage_volume'
--
-- Run AFTER verifying backup exists. Do NOT run during a reset.
-- Idempotent — safe to re-run.

BEGIN;

-- ─── CONSTANTS ────────────────────────────────────────────────────────────────
-- admin user (bob@fomomojodojo.com) — only user_id that satisfies inputs FK
-- original uploaders (kept in storage.objects.owner — no FK constraint)
-- cafe barra company UUID

-- ─── PART 1: inputs rows ──────────────────────────────────────────────────────
-- One row per unique input_id UUID found in the storage paths.
-- Multiple inputs per input_key are expected (each upload session created new rows).

INSERT INTO public.inputs (
  id, user_id, company_id, input_key, input_label,
  group_key, group_label, sub_group,
  completeness, status, score_impact, impact_tier,
  description, why_it_matters,
  frameworks_used,
  created_at, updated_at
) VALUES

-- ── From user 60e81868 (May 2026, most recent session) ──────────────────────

-- comp-alt: Cafe Barra Positioning.pdf uploaded here
(
  '95e68c60-ce4f-48e3-b086-efd81d3afae1',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'comp-alt', 'Competitive Landscape',
  'foundation', 'Foundation', 'Positioning',
  0, 'not_started', 0, 'high',
  'Recovered: Cafe Barra competitive alternatives and positioning documents.',
  'B2B specialty coffee — understanding competitive landscape and positioning.',
  ARRAY['recovered_storage_volume'],
  TO_TIMESTAMP(1778182312), TO_TIMESTAMP(1778182465)
),

-- target-aud: Strategic Framework Final + Updated uploaded here
(
  '957175c0-38d7-46a1-a76a-087ab0e46c58',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'target-aud', 'Target Audiences',
  'foundation', 'Foundation', 'Positioning',
  0, 'not_started', 0, 'high',
  'Recovered: Cafe Barra Strategic Framework documents defining B2B target cafe owners.',
  'Primary B2B research defining who Cafe Barra serves.',
  ARRAY['recovered_storage_volume'],
  TO_TIMESTAMP(1777575579), TO_TIMESTAMP(1777911289)
),

-- brand-narrative: Brand Manifesto extracted text
(
  'd0e0890d-af86-430f-8241-41336b4653a2',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'brand-narrative', 'Brand Narrative',
  'execution', 'Execution', 'Awareness',
  0, 'not_started', 0, 'med',
  'Recovered: Cafe Barra Brand Manifesto (extracted text).',
  'Brand narrative and voice for B2B specialty coffee positioning.',
  ARRAY['recovered_storage_volume'],
  TO_TIMESTAMP(1777575635), TO_TIMESTAMP(1777575637)
),

-- ── From user e196ce84 (April 2026) ─────────────────────────────────────────

-- brand-narrative: B2B Sales Narrative + Brand Manifesto Implications
(
  'eb24d09a-74f6-4d6b-a7f3-c617adc5e948',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'brand-narrative', 'Brand Narrative',
  'execution', 'Execution', 'Awareness',
  0, 'not_started', 0, 'med',
  'Recovered: B2B Sales Narrative and Brand Manifesto Implications for Cafe Barra.',
  'Core brand storytelling documents for B2B wholesale coffee approach.',
  ARRAY['recovered_storage_volume'],
  TO_TIMESTAMP(1773855082), TO_TIMESTAMP(1773855162)
),

-- referral-map: barra partnerships.pdf
(
  'a3a66ed8-8263-4c94-aae0-6ce03ad84c70',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'referral-map', 'Referral Source Mapping',
  'execution', 'Execution', 'Referral Pipeline',
  0, 'not_started', 0, 'high',
  'Recovered: Barra partnerships document mapping wholesale referral channels.',
  'B2B partnership and referral pipeline for cafe wholesale acquisition.',
  ARRAY['recovered_storage_volume'],
  TO_TIMESTAMP(1775068798), TO_TIMESTAMP(1775068799)
),

-- referral-map: Cafe Barra Partner Selection Framework
(
  'b6216d54-b1b7-4e3d-b302-d3a5b9f05abf',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'referral-map', 'Referral Source Mapping',
  'execution', 'Execution', 'Referral Pipeline',
  0, 'not_started', 0, 'high',
  'Recovered: Cafe Barra Partner Selection Framework for wholesale channel qualification.',
  'Framework for evaluating and selecting wholesale cafe partners.',
  ARRAY['recovered_storage_volume'],
  TO_TIMESTAMP(1773873078), TO_TIMESTAMP(1773873078)
),

-- comp-alt: Alternatives, B2B Strategy, B2B Positioning Architecture, Reddit Research, Positioning Statement
(
  'f4fde1ad-c528-4808-a192-cca66b403556',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'comp-alt', 'Competitive Landscape',
  'foundation', 'Foundation', 'Positioning',
  0, 'not_started', 0, 'high',
  'Recovered: Cafe Barra competitive alternatives, B2B positioning, and Reddit research docs.',
  'Full competitive landscape documentation for B2B specialty coffee market.',
  ARRAY['recovered_storage_volume'],
  TO_TIMESTAMP(1773848532), TO_TIMESTAMP(1773875409)
),

-- program-model: Cafe Barra Business Model
(
  '33275c89-f2e5-4462-a3df-04414c2d2c83',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'program-model', 'Program Logic Models',
  'foundation', 'Foundation', 'Strategy',
  0, 'not_started', 0, 'med',
  'Recovered: Cafe Barra Business Model document.',
  'Roaster operating model and B2B program structure.',
  ARRAY['recovered_storage_volume'],
  TO_TIMESTAMP(1773873034), TO_TIMESTAMP(1773873034)
),

-- target-aud: THE BARRA PROCESS or BARRA ROAST METHOD
(
  'd3c20f1d-dc68-4304-b10e-f6f63c98d4a3',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'target-aud', 'Target Audiences',
  'foundation', 'Foundation', 'Positioning',
  0, 'not_started', 0, 'high',
  'Recovered: The Barra Process / Barra Roast Method — unique methodology document.',
  'Defines the proprietary roasting method as a B2B differentiator for target cafes.',
  ARRAY['recovered_storage_volume'],
  TO_TIMESTAMP(1775068639), TO_TIMESTAMP(1775068639)
),

-- ── From user 9b91d265 (March–May 2026) ─────────────────────────────────────

-- comp-alt: Cafe Barra Alternatives Mar 18 + Reddit Research
(
  '89c83094-f33f-473f-b721-9519eb6c78a5',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'comp-alt', 'Competitive Landscape',
  'foundation', 'Foundation', 'Positioning',
  0, 'not_started', 0, 'high',
  'Recovered: Cafe Barra Alternatives Mar 18 2026 and Cafe Owner Reddit Research.',
  'Primary competitive research for B2B specialty coffee market analysis.',
  ARRAY['recovered_storage_volume'],
  TO_TIMESTAMP(1776378029), TO_TIMESTAMP(1776378036)
),

-- program-model: B2B Strategy Document
(
  'b2df86f8-6bec-4838-822c-eea882fdebb4',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'program-model', 'Program Logic Models',
  'foundation', 'Foundation', 'Strategy',
  0, 'not_started', 0, 'med',
  'Recovered: B2B Strategy Document for Cafe Barra wholesale program.',
  'B2B strategic framework and program model for specialty coffee wholesale.',
  ARRAY['recovered_storage_volume'],
  TO_TIMESTAMP(1776378027), TO_TIMESTAMP(1776378027)
),

-- referral-map: Partner Selection Framework + barra_partnerships
(
  '29af5694-f1a5-460f-975e-2a31ff0ff307',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'referral-map', 'Referral Source Mapping',
  'execution', 'Execution', 'Referral Pipeline',
  0, 'not_started', 0, 'high',
  'Recovered: Partner Selection Framework and Barra Partnerships mapping.',
  'Wholesale channel qualification and partner pipeline documentation.',
  ARRAY['recovered_storage_volume'],
  TO_TIMESTAMP(1776378034), TO_TIMESTAMP(1776378039)
),

-- unique-attr: THE BARRA PROCESS or BARRA ROAST METHOD
(
  '7f103b04-b70f-456a-89f7-ecac352a3707',
  '5860c99a-e6f8-4feb-9997-992e3654f181',
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'unique-attr', 'Unique Differentiators',
  'foundation', 'Foundation', 'Positioning',
  0, 'not_started', 0, 'high',
  'Recovered: The Barra Process / Barra Roast Method — unique attribute document.',
  'Proprietary roasting methodology as a core B2B differentiator.',
  ARRAY['recovered_storage_volume'],
  TO_TIMESTAMP(1776378038), TO_TIMESTAMP(1776378038)
)

ON CONFLICT (id) DO NOTHING;


-- ─── PART 2: storage.objects rows ─────────────────────────────────────────────
-- Restores object metadata for all 32 cafe-barra blobs.
-- id = object UUID from Docker volume leaf filename (exact match required for serving)
-- name = bucket-relative path (user_id/company_slug/input_key/input_id/filename)
-- owner = original uploader UUID (no FK constraint — preserved for historical accuracy)

INSERT INTO storage.objects (
  id, bucket_id, name, owner, owner_id,
  created_at, updated_at, last_accessed_at,
  metadata, version
) VALUES

-- ── User 60e81868 blobs ──────────────────────────────────────────────────────

(
  '5d37005a-8450-4159-a746-6db881dada38', 'input-files',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/brand-narrative/d0e0890d-af86-430f-8241-41336b4653a2/1777575635644-Cafe_Barra_Brand_Manifesto.pdf.extracted.txt',
  '60e81868-2fec-4013-8566-9c5a94c33d9a', '60e81868-2fec-4013-8566-9c5a94c33d9a',
  TO_TIMESTAMP(1777575637), TO_TIMESTAMP(1777575637), TO_TIMESTAMP(1777575637),
  '{"size": 6668, "mimetype": "text/plain", "cacheControl": "max-age=3600", "contentLength": 6668, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  '37c60919-35f6-449a-827d-b732d3454ffc', 'input-files',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/comp-alt/95e68c60-ce4f-48e3-b086-efd81d3afae1/1778182312150-Cafe Barra Positioning May 1.pdf.extracted.txt',
  '60e81868-2fec-4013-8566-9c5a94c33d9a', '60e81868-2fec-4013-8566-9c5a94c33d9a',
  TO_TIMESTAMP(1778182313), TO_TIMESTAMP(1778182313), TO_TIMESTAMP(1778182313),
  '{"size": 5498, "mimetype": "text/plain", "cacheControl": "max-age=3600", "contentLength": 5498, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  'a6ebe5b1-a06f-4a81-b218-353969173f08', 'input-files',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/comp-alt/95e68c60-ce4f-48e3-b086-efd81d3afae1/1778182464534-Cafe_Barra_Positioning.pdf.extracted.txt',
  '60e81868-2fec-4013-8566-9c5a94c33d9a', '60e81868-2fec-4013-8566-9c5a94c33d9a',
  TO_TIMESTAMP(1778182467), TO_TIMESTAMP(1778182467), TO_TIMESTAMP(1778182467),
  '{"size": 7063, "mimetype": "text/plain", "cacheControl": "max-age=3600", "contentLength": 7063, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  'ccdab50e-9f90-4099-8375-bb98cb3d2614', 'input-files',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/comp-alt/95e68c60-ce4f-48e3-b086-efd81d3afae1/1778182464534-Cafe_Barra_Positioning.pdf',
  '60e81868-2fec-4013-8566-9c5a94c33d9a', '60e81868-2fec-4013-8566-9c5a94c33d9a',
  TO_TIMESTAMP(1778182465), TO_TIMESTAMP(1778182465), TO_TIMESTAMP(1778182465),
  '{"size": 233917, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 233917, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  '9542a1c2-8571-4793-9772-0dc426c108b3', 'input-files',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/target-aud/957175c0-38d7-46a1-a76a-087ab0e46c58/1777575579112-Cafe_Barra_Strategic_Framework_Updated.pdf.extracted.txt',
  '60e81868-2fec-4013-8566-9c5a94c33d9a', '60e81868-2fec-4013-8566-9c5a94c33d9a',
  TO_TIMESTAMP(1777575581), TO_TIMESTAMP(1777575581), TO_TIMESTAMP(1777575581),
  '{"size": 30016, "mimetype": "text/plain", "cacheControl": "max-age=3600", "contentLength": 30016, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  '9bd73892-6f89-471e-847d-bf9599ec7364', 'input-files',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/target-aud/957175c0-38d7-46a1-a76a-087ab0e46c58/1777662135576-Cafe_Barra_Strategic_Framework_Final.pdf.extracted.txt',
  '60e81868-2fec-4013-8566-9c5a94c33d9a', '60e81868-2fec-4013-8566-9c5a94c33d9a',
  TO_TIMESTAMP(1777662137), TO_TIMESTAMP(1777662137), TO_TIMESTAMP(1777662137),
  '{"size": 22052, "mimetype": "text/plain", "cacheControl": "max-age=3600", "contentLength": 22052, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  'b42a2160-8e5e-4610-a1fe-d52cecb61ff3', 'input-files',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/target-aud/957175c0-38d7-46a1-a76a-087ab0e46c58/1777911289721-Cafe_Barra_Strategic_Framework_Final.pdf.extracted.txt',
  '60e81868-2fec-4013-8566-9c5a94c33d9a', '60e81868-2fec-4013-8566-9c5a94c33d9a',
  TO_TIMESTAMP(1777911291), TO_TIMESTAMP(1777911291), TO_TIMESTAMP(1777911291),
  '{"size": 27307, "mimetype": "text/plain", "cacheControl": "max-age=3600", "contentLength": 27307, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

-- ★ PRIORITY: Cafe_Barra_Strategic_Framework_Final.pdf (484KB)
(
  '2b6bca3b-177a-4f81-b1d5-4e94ca20d030', 'input-files',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/target-aud/957175c0-38d7-46a1-a76a-087ab0e46c58/1777911289721-Cafe_Barra_Strategic_Framework_Final.pdf',
  '60e81868-2fec-4013-8566-9c5a94c33d9a', '60e81868-2fec-4013-8566-9c5a94c33d9a',
  TO_TIMESTAMP(1777911289), TO_TIMESTAMP(1777911289), TO_TIMESTAMP(1777911289),
  '{"size": 484224, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 484224, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

-- ── User 9b91d265 blobs ──────────────────────────────────────────────────────

(
  '356ffd09-bab1-4c74-aa33-64221b7b7533', 'input-files',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/comp-alt/89c83094-f33f-473f-b721-9519eb6c78a5/Cafe_Barra_Alternatives_Mar_18_2026-c2306562.pdf.extracted.txt',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a', '9b91d265-2f7c-45fe-ac00-1b41d2a7883a',
  TO_TIMESTAMP(1778184604), TO_TIMESTAMP(1778184604), TO_TIMESTAMP(1778184604),
  '{"size": 4324, "mimetype": "text/plain", "cacheControl": "max-age=3600", "contentLength": 4324, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  '8ace443b-9e53-46b9-a820-9478d4bc4012', 'input-files',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/comp-alt/89c83094-f33f-473f-b721-9519eb6c78a5/Cafe_Barra_Alternatives_Mar_18_2026-c2306562.pdf',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a', '9b91d265-2f7c-45fe-ac00-1b41d2a7883a',
  TO_TIMESTAMP(1776378029), TO_TIMESTAMP(1776378029), TO_TIMESTAMP(1776378029),
  '{"size": 95773, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 95773, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  '477e40a9-0815-485d-8e03-b94cb14bb8cc', 'input-files',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/comp-alt/89c83094-f33f-473f-b721-9519eb6c78a5/Cafe_Owner_Research_Reddit_March_2026-6fcff09c.pdf',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a', '9b91d265-2f7c-45fe-ac00-1b41d2a7883a',
  TO_TIMESTAMP(1776378036), TO_TIMESTAMP(1776378036), TO_TIMESTAMP(1776378036),
  '{"size": 378428, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 378428, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  'bdaf948c-e0ae-4ad3-a166-13e251dc113f', 'input-files',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/program-model/b2df86f8-6bec-4838-822c-eea882fdebb4/B2B_Strategy_Document-f34d8dc4.pdf.extracted.txt',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a', '9b91d265-2f7c-45fe-ac00-1b41d2a7883a',
  TO_TIMESTAMP(1777680553), TO_TIMESTAMP(1777680553), TO_TIMESTAMP(1777680553),
  '{"size": 4782, "mimetype": "text/plain", "cacheControl": "max-age=3600", "contentLength": 4782, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  '9771b59f-97fc-4e6d-8674-2e37ecb2ce61', 'input-files',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/program-model/b2df86f8-6bec-4838-822c-eea882fdebb4/B2B_Strategy_Document-f34d8dc4.pdf',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a', '9b91d265-2f7c-45fe-ac00-1b41d2a7883a',
  TO_TIMESTAMP(1776378027), TO_TIMESTAMP(1776378027), TO_TIMESTAMP(1776378027),
  '{"size": 7524, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 7524, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  '138be291-2bcd-403a-894e-f9e932542dda', 'input-files',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/referral-map/29af5694-f1a5-460f-975e-2a31ff0ff307/Cafe_Barra_Partner_Selection_Framework-ab80c256.pdf.extracted.txt',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a', '9b91d265-2f7c-45fe-ac00-1b41d2a7883a',
  TO_TIMESTAMP(1778184541), TO_TIMESTAMP(1778184541), TO_TIMESTAMP(1778184541),
  '{"size": 6106, "mimetype": "text/plain", "cacheControl": "max-age=3600", "contentLength": 6106, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

-- ★ PRIORITY: Cafe Barra Partner Selection Framework (72KB)
(
  'c428ef02-5edf-48e6-a186-fb2eaf949089', 'input-files',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/referral-map/29af5694-f1a5-460f-975e-2a31ff0ff307/Cafe_Barra_Partner_Selection_Framework-ab80c256.pdf',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a', '9b91d265-2f7c-45fe-ac00-1b41d2a7883a',
  TO_TIMESTAMP(1776378034), TO_TIMESTAMP(1776378034), TO_TIMESTAMP(1776378034),
  '{"size": 72141, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 72141, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

-- ★ PRIORITY: barra_partnerships (24KB)
(
  '5a5203f7-6c62-458b-864c-6bb927340c30', 'input-files',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/referral-map/29af5694-f1a5-460f-975e-2a31ff0ff307/barra_partnerships-080d0031.pdf',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a', '9b91d265-2f7c-45fe-ac00-1b41d2a7883a',
  TO_TIMESTAMP(1776378039), TO_TIMESTAMP(1776378039), TO_TIMESTAMP(1776378039),
  '{"size": 24590, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 24590, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  'ee1307f3-d7f9-4c82-aa30-186d2634f9e9', 'input-files',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/unique-attr/7f103b04-b70f-456a-89f7-ecac352a3707/THE_BARRA_PROCESS_or_BARRA_ROAST_METHOD-0c2e4e7d.pdf.extracted.txt',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a', '9b91d265-2f7c-45fe-ac00-1b41d2a7883a',
  TO_TIMESTAMP(1778184537), TO_TIMESTAMP(1778184537), TO_TIMESTAMP(1778184537),
  '{"size": 1385, "mimetype": "text/plain", "cacheControl": "max-age=3600", "contentLength": 1385, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  '671f8a71-83cc-466e-bd5b-6dd7a705e875', 'input-files',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/unique-attr/7f103b04-b70f-456a-89f7-ecac352a3707/THE_BARRA_PROCESS_or_BARRA_ROAST_METHOD-0c2e4e7d.pdf',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a', '9b91d265-2f7c-45fe-ac00-1b41d2a7883a',
  TO_TIMESTAMP(1776378038), TO_TIMESTAMP(1776378038), TO_TIMESTAMP(1776378038),
  '{"size": 23925, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 23925, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

-- ── User e196ce84 blobs ──────────────────────────────────────────────────────

-- ★ PRIORITY: B2B_Sales_Narrative.pdf
(
  '38206a6e-c45b-4ac7-b15d-57adafe3b020', 'input-files',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/brand-narrative/eb24d09a-74f6-4d6b-a7f3-c617adc5e948/1773855082902-B2B_Sales_Narrative.pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95', 'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95',
  TO_TIMESTAMP(1773855083), TO_TIMESTAMP(1773855083), TO_TIMESTAMP(1773855083),
  '{"size": 7623, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 7623, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

-- ★ PRIORITY: B2B_Brand_Manifesto_Implications.pdf
(
  'f5b9be74-613a-46ef-a20e-5cb7f6eabe48', 'input-files',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/brand-narrative/eb24d09a-74f6-4d6b-a7f3-c617adc5e948/1773855161353-B2B_Brand_Manifesto_Implications.pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95', 'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95',
  TO_TIMESTAMP(1773855162), TO_TIMESTAMP(1773855162), TO_TIMESTAMP(1773855162),
  '{"size": 7091, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 7091, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  'a014cbf1-53cd-4e2c-8567-9739cd89ef2b', 'input-files',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/comp-alt/f4fde1ad-c528-4808-a192-cca66b403556/1773848532824-Cafe Barra Alternatives Mar 18 2026.pdf.extracted.txt',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95', 'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95',
  TO_TIMESTAMP(1774479735), TO_TIMESTAMP(1774479735), TO_TIMESTAMP(1774479735),
  '{"size": 4435, "mimetype": "text/plain", "cacheControl": "max-age=3600", "contentLength": 4435, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  'ee3366d1-217a-401f-bc7c-70e1ee06fae4', 'input-files',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/comp-alt/f4fde1ad-c528-4808-a192-cca66b403556/1773848532824-Cafe Barra Alternatives Mar 18 2026.pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95', 'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95',
  TO_TIMESTAMP(1773848533), TO_TIMESTAMP(1773848533), TO_TIMESTAMP(1773848533),
  '{"size": 95773, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 95773, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  '4d23f9dd-2e24-4e24-a594-3e5588c6370d', 'input-files',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/comp-alt/f4fde1ad-c528-4808-a192-cca66b403556/1773854374966-B2B_Strategy_Document.pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95', 'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95',
  TO_TIMESTAMP(1773854375), TO_TIMESTAMP(1773854375), TO_TIMESTAMP(1773854375),
  '{"size": 7524, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 7524, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  'a552a213-732e-454c-a738-71c9fd5bd10d', 'input-files',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/comp-alt/f4fde1ad-c528-4808-a192-cca66b403556/1773854805387-B2B_Positioning_Architecture.pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95', 'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95',
  TO_TIMESTAMP(1773854806), TO_TIMESTAMP(1773854806), TO_TIMESTAMP(1773854806),
  '{"size": 7053, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 7053, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  'e30517f8-e79b-4dea-b37a-81ffa597569c', 'input-files',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/comp-alt/f4fde1ad-c528-4808-a192-cca66b403556/1773858343165-Cafe Owner Research Reddit March 2026.pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95', 'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95',
  TO_TIMESTAMP(1773858344), TO_TIMESTAMP(1773858344), TO_TIMESTAMP(1773858344),
  '{"size": 378428, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 378428, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  '5e7c652e-fb36-4b70-8b08-914dc1309ab7', 'input-files',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/comp-alt/f4fde1ad-c528-4808-a192-cca66b403556/1773875409098-Cafe Barra Positioning Statement March 18.pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95', 'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95',
  TO_TIMESTAMP(1773875409), TO_TIMESTAMP(1773875409), TO_TIMESTAMP(1773875409),
  '{"size": 20012, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 20012, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  '23392ea5-57f2-4fd1-8f6e-1c90cc0eb02d', 'input-files',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/program-model/33275c89-f2e5-4462-a3df-04414c2d2c83/1773873034803-Cafe Barra Business Model.pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95', 'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95',
  TO_TIMESTAMP(1773873034), TO_TIMESTAMP(1773873034), TO_TIMESTAMP(1773873034),
  '{"size": 338883, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 338883, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  'e87a9c1c-4a45-45e3-b3a9-f2e86096656a', 'input-files',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/referral-map/a3a66ed8-8263-4c94-aae0-6ce03ad84c70/1775068798775-barra partnerships.pdf.extracted.txt',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95', 'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95',
  TO_TIMESTAMP(1775068801), TO_TIMESTAMP(1775068801), TO_TIMESTAMP(1775068801),
  '{"size": 1849, "mimetype": "text/plain", "cacheControl": "max-age=3600", "contentLength": 1849, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

-- ★ PRIORITY: barra partnerships.pdf (24KB)
(
  '1889544c-2a76-4128-862c-c4eb249b9321', 'input-files',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/referral-map/a3a66ed8-8263-4c94-aae0-6ce03ad84c70/1775068798775-barra partnerships.pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95', 'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95',
  TO_TIMESTAMP(1775068799), TO_TIMESTAMP(1775068799), TO_TIMESTAMP(1775068799),
  '{"size": 24590, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 24590, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

-- ★ PRIORITY: Cafe Barra Partner Selection Framework (72KB)
(
  'ac401334-1284-4cd1-a8c4-b373b9b1567d', 'input-files',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/referral-map/b6216d54-b1b7-4e3d-b302-d3a5b9f05abf/1773873078699-Cafe Barra Partner Selection Framework .pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95', 'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95',
  TO_TIMESTAMP(1773873078), TO_TIMESTAMP(1773873078), TO_TIMESTAMP(1773873078),
  '{"size": 72141, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 72141, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  '8feaf71c-92af-4266-9129-37e0019d4f6e', 'input-files',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/target-aud/d3c20f1d-dc68-4304-b10e-f6f63c98d4a3/1775068639213-THE BARRA PROCESS or BARRA ROAST METHOD .pdf.extracted.txt',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95', 'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95',
  TO_TIMESTAMP(1775068640), TO_TIMESTAMP(1775068640), TO_TIMESTAMP(1775068640),
  '{"size": 1405, "mimetype": "text/plain", "cacheControl": "max-age=3600", "contentLength": 1405, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
),

(
  'c28e1ba4-cf13-4f72-81c7-ed1ed378381c', 'input-files',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/target-aud/d3c20f1d-dc68-4304-b10e-f6f63c98d4a3/1775068639213-THE BARRA PROCESS or BARRA ROAST METHOD .pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95', 'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95',
  TO_TIMESTAMP(1775068639), TO_TIMESTAMP(1775068639), TO_TIMESTAMP(1775068639),
  '{"size": 23925, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "contentLength": 23925, "httpStatusCode": 200, "recovery_source": "storage_volume_rehydration", "restored_after_reset": true}'::jsonb,
  '1'
)

ON CONFLICT (id) DO NOTHING;


-- ─── PART 3: input_files rows ─────────────────────────────────────────────────
-- Links each storage object to its parent inputs record.
-- file_path MUST equal storage.objects.name for the RLS join to resolve.

INSERT INTO public.input_files (
  id, input_id, file_name, file_type, file_path, uploaded_at
) VALUES

-- ── input_id: d0e0890d (brand-narrative, user 60e81868) ─────────────────────
(
  gen_random_uuid(),
  'd0e0890d-af86-430f-8241-41336b4653a2',
  'Cafe_Barra_Brand_Manifesto.pdf.extracted.txt', 'text/plain',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/brand-narrative/d0e0890d-af86-430f-8241-41336b4653a2/1777575635644-Cafe_Barra_Brand_Manifesto.pdf.extracted.txt',
  TO_TIMESTAMP(1777575637)
),

-- ── input_id: 95e68c60 (comp-alt, user 60e81868) ────────────────────────────
(
  gen_random_uuid(),
  '95e68c60-ce4f-48e3-b086-efd81d3afae1',
  'Cafe Barra Positioning May 1.pdf.extracted.txt', 'text/plain',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/comp-alt/95e68c60-ce4f-48e3-b086-efd81d3afae1/1778182312150-Cafe Barra Positioning May 1.pdf.extracted.txt',
  TO_TIMESTAMP(1778182313)
),
(
  gen_random_uuid(),
  '95e68c60-ce4f-48e3-b086-efd81d3afae1',
  'Cafe_Barra_Positioning.pdf.extracted.txt', 'text/plain',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/comp-alt/95e68c60-ce4f-48e3-b086-efd81d3afae1/1778182464534-Cafe_Barra_Positioning.pdf.extracted.txt',
  TO_TIMESTAMP(1778182467)
),
-- ★ PRIORITY: Cafe_Barra_Positioning.pdf (234KB)
(
  gen_random_uuid(),
  '95e68c60-ce4f-48e3-b086-efd81d3afae1',
  'Cafe_Barra_Positioning.pdf', 'application/pdf',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/comp-alt/95e68c60-ce4f-48e3-b086-efd81d3afae1/1778182464534-Cafe_Barra_Positioning.pdf',
  TO_TIMESTAMP(1778182465)
),

-- ── input_id: 957175c0 (target-aud, user 60e81868) ──────────────────────────
(
  gen_random_uuid(),
  '957175c0-38d7-46a1-a76a-087ab0e46c58',
  'Cafe_Barra_Strategic_Framework_Updated.pdf.extracted.txt', 'text/plain',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/target-aud/957175c0-38d7-46a1-a76a-087ab0e46c58/1777575579112-Cafe_Barra_Strategic_Framework_Updated.pdf.extracted.txt',
  TO_TIMESTAMP(1777575581)
),
(
  gen_random_uuid(),
  '957175c0-38d7-46a1-a76a-087ab0e46c58',
  'Cafe_Barra_Strategic_Framework_Final.pdf.extracted.txt', 'text/plain',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/target-aud/957175c0-38d7-46a1-a76a-087ab0e46c58/1777662135576-Cafe_Barra_Strategic_Framework_Final.pdf.extracted.txt',
  TO_TIMESTAMP(1777662137)
),
(
  gen_random_uuid(),
  '957175c0-38d7-46a1-a76a-087ab0e46c58',
  'Cafe_Barra_Strategic_Framework_Final.pdf.extracted.txt', 'text/plain',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/target-aud/957175c0-38d7-46a1-a76a-087ab0e46c58/1777911289721-Cafe_Barra_Strategic_Framework_Final.pdf.extracted.txt',
  TO_TIMESTAMP(1777911291)
),
-- ★ PRIORITY: Cafe_Barra_Strategic_Framework_Final.pdf (484KB)
(
  gen_random_uuid(),
  '957175c0-38d7-46a1-a76a-087ab0e46c58',
  'Cafe_Barra_Strategic_Framework_Final.pdf', 'application/pdf',
  '60e81868-2fec-4013-8566-9c5a94c33d9a/cafe-barra/target-aud/957175c0-38d7-46a1-a76a-087ab0e46c58/1777911289721-Cafe_Barra_Strategic_Framework_Final.pdf',
  TO_TIMESTAMP(1777911289)
),

-- ── input_id: 89c83094 (comp-alt, user 9b91d265) ────────────────────────────
(
  gen_random_uuid(),
  '89c83094-f33f-473f-b721-9519eb6c78a5',
  'Cafe_Barra_Alternatives_Mar_18_2026-c2306562.pdf.extracted.txt', 'text/plain',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/comp-alt/89c83094-f33f-473f-b721-9519eb6c78a5/Cafe_Barra_Alternatives_Mar_18_2026-c2306562.pdf.extracted.txt',
  TO_TIMESTAMP(1778184604)
),
(
  gen_random_uuid(),
  '89c83094-f33f-473f-b721-9519eb6c78a5',
  'Cafe_Barra_Alternatives_Mar_18_2026-c2306562.pdf', 'application/pdf',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/comp-alt/89c83094-f33f-473f-b721-9519eb6c78a5/Cafe_Barra_Alternatives_Mar_18_2026-c2306562.pdf',
  TO_TIMESTAMP(1776378029)
),
(
  gen_random_uuid(),
  '89c83094-f33f-473f-b721-9519eb6c78a5',
  'Cafe_Owner_Research_Reddit_March_2026-6fcff09c.pdf', 'application/pdf',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/comp-alt/89c83094-f33f-473f-b721-9519eb6c78a5/Cafe_Owner_Research_Reddit_March_2026-6fcff09c.pdf',
  TO_TIMESTAMP(1776378036)
),

-- ── input_id: b2df86f8 (program-model, user 9b91d265) ───────────────────────
(
  gen_random_uuid(),
  'b2df86f8-6bec-4838-822c-eea882fdebb4',
  'B2B_Strategy_Document-f34d8dc4.pdf.extracted.txt', 'text/plain',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/program-model/b2df86f8-6bec-4838-822c-eea882fdebb4/B2B_Strategy_Document-f34d8dc4.pdf.extracted.txt',
  TO_TIMESTAMP(1777680553)
),
(
  gen_random_uuid(),
  'b2df86f8-6bec-4838-822c-eea882fdebb4',
  'B2B_Strategy_Document-f34d8dc4.pdf', 'application/pdf',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/program-model/b2df86f8-6bec-4838-822c-eea882fdebb4/B2B_Strategy_Document-f34d8dc4.pdf',
  TO_TIMESTAMP(1776378027)
),

-- ── input_id: 29af5694 (referral-map, user 9b91d265) ────────────────────────
(
  gen_random_uuid(),
  '29af5694-f1a5-460f-975e-2a31ff0ff307',
  'Cafe_Barra_Partner_Selection_Framework-ab80c256.pdf.extracted.txt', 'text/plain',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/referral-map/29af5694-f1a5-460f-975e-2a31ff0ff307/Cafe_Barra_Partner_Selection_Framework-ab80c256.pdf.extracted.txt',
  TO_TIMESTAMP(1778184541)
),
-- ★ PRIORITY: Cafe Barra Partner Selection Framework (72KB)
(
  gen_random_uuid(),
  '29af5694-f1a5-460f-975e-2a31ff0ff307',
  'Cafe_Barra_Partner_Selection_Framework-ab80c256.pdf', 'application/pdf',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/referral-map/29af5694-f1a5-460f-975e-2a31ff0ff307/Cafe_Barra_Partner_Selection_Framework-ab80c256.pdf',
  TO_TIMESTAMP(1776378034)
),
-- ★ PRIORITY: barra_partnerships (24KB)
(
  gen_random_uuid(),
  '29af5694-f1a5-460f-975e-2a31ff0ff307',
  'barra_partnerships-080d0031.pdf', 'application/pdf',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/referral-map/29af5694-f1a5-460f-975e-2a31ff0ff307/barra_partnerships-080d0031.pdf',
  TO_TIMESTAMP(1776378039)
),

-- ── input_id: 7f103b04 (unique-attr, user 9b91d265) ─────────────────────────
(
  gen_random_uuid(),
  '7f103b04-b70f-456a-89f7-ecac352a3707',
  'THE_BARRA_PROCESS_or_BARRA_ROAST_METHOD-0c2e4e7d.pdf.extracted.txt', 'text/plain',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/unique-attr/7f103b04-b70f-456a-89f7-ecac352a3707/THE_BARRA_PROCESS_or_BARRA_ROAST_METHOD-0c2e4e7d.pdf.extracted.txt',
  TO_TIMESTAMP(1778184537)
),
(
  gen_random_uuid(),
  '7f103b04-b70f-456a-89f7-ecac352a3707',
  'THE_BARRA_PROCESS_or_BARRA_ROAST_METHOD-0c2e4e7d.pdf', 'application/pdf',
  '9b91d265-2f7c-45fe-ac00-1b41d2a7883a/cafe-barra/unique-attr/7f103b04-b70f-456a-89f7-ecac352a3707/THE_BARRA_PROCESS_or_BARRA_ROAST_METHOD-0c2e4e7d.pdf',
  TO_TIMESTAMP(1776378038)
),

-- ── input_id: eb24d09a (brand-narrative, user e196ce84) ─────────────────────
-- ★ PRIORITY: B2B_Sales_Narrative.pdf
(
  gen_random_uuid(),
  'eb24d09a-74f6-4d6b-a7f3-c617adc5e948',
  'B2B_Sales_Narrative.pdf', 'application/pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/brand-narrative/eb24d09a-74f6-4d6b-a7f3-c617adc5e948/1773855082902-B2B_Sales_Narrative.pdf',
  TO_TIMESTAMP(1773855083)
),
-- ★ PRIORITY: B2B_Brand_Manifesto_Implications.pdf
(
  gen_random_uuid(),
  'eb24d09a-74f6-4d6b-a7f3-c617adc5e948',
  'B2B_Brand_Manifesto_Implications.pdf', 'application/pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/brand-narrative/eb24d09a-74f6-4d6b-a7f3-c617adc5e948/1773855161353-B2B_Brand_Manifesto_Implications.pdf',
  TO_TIMESTAMP(1773855162)
),

-- ── input_id: f4fde1ad (comp-alt, user e196ce84) ────────────────────────────
(
  gen_random_uuid(),
  'f4fde1ad-c528-4808-a192-cca66b403556',
  'Cafe Barra Alternatives Mar 18 2026.pdf.extracted.txt', 'text/plain',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/comp-alt/f4fde1ad-c528-4808-a192-cca66b403556/1773848532824-Cafe Barra Alternatives Mar 18 2026.pdf.extracted.txt',
  TO_TIMESTAMP(1774479735)
),
(
  gen_random_uuid(),
  'f4fde1ad-c528-4808-a192-cca66b403556',
  'Cafe Barra Alternatives Mar 18 2026.pdf', 'application/pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/comp-alt/f4fde1ad-c528-4808-a192-cca66b403556/1773848532824-Cafe Barra Alternatives Mar 18 2026.pdf',
  TO_TIMESTAMP(1773848533)
),
(
  gen_random_uuid(),
  'f4fde1ad-c528-4808-a192-cca66b403556',
  'B2B_Strategy_Document.pdf', 'application/pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/comp-alt/f4fde1ad-c528-4808-a192-cca66b403556/1773854374966-B2B_Strategy_Document.pdf',
  TO_TIMESTAMP(1773854375)
),
(
  gen_random_uuid(),
  'f4fde1ad-c528-4808-a192-cca66b403556',
  'B2B_Positioning_Architecture.pdf', 'application/pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/comp-alt/f4fde1ad-c528-4808-a192-cca66b403556/1773854805387-B2B_Positioning_Architecture.pdf',
  TO_TIMESTAMP(1773854806)
),
(
  gen_random_uuid(),
  'f4fde1ad-c528-4808-a192-cca66b403556',
  'Cafe Owner Research Reddit March 2026.pdf', 'application/pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/comp-alt/f4fde1ad-c528-4808-a192-cca66b403556/1773858343165-Cafe Owner Research Reddit March 2026.pdf',
  TO_TIMESTAMP(1773858344)
),
(
  gen_random_uuid(),
  'f4fde1ad-c528-4808-a192-cca66b403556',
  'Cafe Barra Positioning Statement March 18.pdf', 'application/pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/comp-alt/f4fde1ad-c528-4808-a192-cca66b403556/1773875409098-Cafe Barra Positioning Statement March 18.pdf',
  TO_TIMESTAMP(1773875409)
),

-- ── input_id: 33275c89 (program-model, user e196ce84) ───────────────────────
(
  gen_random_uuid(),
  '33275c89-f2e5-4462-a3df-04414c2d2c83',
  'Cafe Barra Business Model.pdf', 'application/pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/program-model/33275c89-f2e5-4462-a3df-04414c2d2c83/1773873034803-Cafe Barra Business Model.pdf',
  TO_TIMESTAMP(1773873034)
),

-- ── input_id: a3a66ed8 (referral-map, user e196ce84) ────────────────────────
(
  gen_random_uuid(),
  'a3a66ed8-8263-4c94-aae0-6ce03ad84c70',
  'barra partnerships.pdf.extracted.txt', 'text/plain',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/referral-map/a3a66ed8-8263-4c94-aae0-6ce03ad84c70/1775068798775-barra partnerships.pdf.extracted.txt',
  TO_TIMESTAMP(1775068801)
),
-- ★ PRIORITY: barra partnerships.pdf (24KB)
(
  gen_random_uuid(),
  'a3a66ed8-8263-4c94-aae0-6ce03ad84c70',
  'barra partnerships.pdf', 'application/pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/referral-map/a3a66ed8-8263-4c94-aae0-6ce03ad84c70/1775068798775-barra partnerships.pdf',
  TO_TIMESTAMP(1775068799)
),

-- ── input_id: b6216d54 (referral-map, user e196ce84) ────────────────────────
-- ★ PRIORITY: Cafe Barra Partner Selection Framework (72KB)
(
  gen_random_uuid(),
  'b6216d54-b1b7-4e3d-b302-d3a5b9f05abf',
  'Cafe Barra Partner Selection Framework .pdf', 'application/pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/referral-map/b6216d54-b1b7-4e3d-b302-d3a5b9f05abf/1773873078699-Cafe Barra Partner Selection Framework .pdf',
  TO_TIMESTAMP(1773873078)
),

-- ── input_id: d3c20f1d (target-aud, user e196ce84) ──────────────────────────
(
  gen_random_uuid(),
  'd3c20f1d-dc68-4304-b10e-f6f63c98d4a3',
  'THE BARRA PROCESS or BARRA ROAST METHOD .pdf.extracted.txt', 'text/plain',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/target-aud/d3c20f1d-dc68-4304-b10e-f6f63c98d4a3/1775068639213-THE BARRA PROCESS or BARRA ROAST METHOD .pdf.extracted.txt',
  TO_TIMESTAMP(1775068640)
),
(
  gen_random_uuid(),
  'd3c20f1d-dc68-4304-b10e-f6f63c98d4a3',
  'THE BARRA PROCESS or BARRA ROAST METHOD .pdf', 'application/pdf',
  'e196ce84-5f57-4f3b-a4ff-6d67d0a69b95/cafe-barra/target-aud/d3c20f1d-dc68-4304-b10e-f6f63c98d4a3/1775068639213-THE BARRA PROCESS or BARRA ROAST METHOD .pdf',
  TO_TIMESTAMP(1775068639)
);

-- No ON CONFLICT on input_files (no unique constraint) — re-running will create duplicates.
-- To make this fully idempotent: DELETE FROM public.input_files WHERE input_id IN (<list>) first.


-- ─── PART 4: verify row counts ────────────────────────────────────────────────
DO $$
DECLARE
  n_inputs INTEGER;
  n_objects INTEGER;
  n_files INTEGER;
BEGIN
  SELECT COUNT(*) INTO n_inputs FROM public.inputs WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';
  SELECT COUNT(*) INTO n_objects FROM storage.objects WHERE bucket_id = 'input-files' AND name LIKE '%cafe-barra%';
  SELECT COUNT(*) INTO n_files FROM public.input_files f
    JOIN public.inputs i ON i.id = f.input_id
    WHERE i.company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';

  RAISE NOTICE 'Cafe Barra inputs: % rows', n_inputs;
  RAISE NOTICE 'storage.objects (cafe-barra): % rows', n_objects;
  RAISE NOTICE 'input_files (cafe-barra): % rows', n_files;
END $$;

COMMIT;
