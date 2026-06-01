# Storage Rehydration Index — Phase 78C
Date: 2026-05-13
Status: **COMPLETE** — 13 inputs rows, 32 storage.objects rows, 32 input_files rows inserted

## What This Document Is

After `supabase db reset --local` wiped the PostgreSQL database, 32 Cafe Barra file blobs
survived intact in the Docker volume `supabase_storage_dzlgyxcvuwiulgifbmew`. This document
records exactly what was rehydrated, which UUIDs were preserved, and how to verify.

The rehydration SQL is at: `sql/rehydrate_cafe_barra_storage.sql`

---

## Verification Query

```sql
SELECT i.input_key, COUNT(f.id) AS files, SUM((o.metadata->>'size')::int) AS total_bytes
FROM public.inputs i
JOIN public.input_files f ON f.input_id = i.id
JOIN storage.objects o ON o.name = f.file_path
WHERE i.company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
GROUP BY i.input_key ORDER BY i.input_key;
```

Expected output after rehydration:

| input_key | files | total_bytes |
|---|---|---|
| brand-narrative | 3 | 21382 |
| comp-alt | 12 | 1238228 |
| program-model | 3 | 351189 |
| referral-map | 6 | 201417 |
| target-aud | 6 | 588929 |
| unique-attr | 2 | 25310 |

---

## Key UUIDs

| Resource | UUID |
|---|---|
| Cafe Barra company | `58b2b15b-bada-4bcd-9c12-b7e66a37d0bc` |
| Admin user (inputs.user_id) | `5860c99a-e6f8-4feb-9997-992e3654f181` |
| Storage bucket | `input-files` |

---

## inputs Rows Created (13)

All rows: `user_id = '5860c99a-e6f8-4feb-9997-992e3654f181'`, `frameworks_used = ['recovered_storage_volume']`

| inputs.id | input_key | Upload session user | Contents |
|---|---|---|---|
| `95e68c60-ce4f-48e3-b086-efd81d3afae1` | comp-alt | 60e81868 (May 2026) | Cafe Barra Positioning.pdf |
| `957175c0-38d7-46a1-a76a-087ab0e46c58` | target-aud | 60e81868 (May 2026) | Strategic Framework Final + Updated |
| `d0e0890d-af86-430f-8241-41336b4653a2` | brand-narrative | 60e81868 (May 2026) | Brand Manifesto .extracted.txt |
| `eb24d09a-74f6-4d6b-a7f3-c617adc5e948` | brand-narrative | e196ce84 (Apr 2026) | B2B Sales Narrative + Brand Manifesto Implications |
| `a3a66ed8-8263-4c94-aae0-6ce03ad84c70` | referral-map | e196ce84 (Apr 2026) | barra partnerships.pdf |
| `b6216d54-b1b7-4e3d-b302-d3a5b9f05abf` | referral-map | e196ce84 (Apr 2026) | Partner Selection Framework |
| `f4fde1ad-c528-4808-a192-cca66b403556` | comp-alt | e196ce84 (Apr 2026) | Alternatives, B2B Strategy, B2B Arch, Reddit Research, Positioning Statement Mar 18 |
| `33275c89-f2e5-4462-a3df-04414c2d2c83` | program-model | e196ce84 (Apr 2026) | Cafe Barra Business Model |
| `d3c20f1d-dc68-4304-b10e-f6f63c98d4a3` | target-aud | e196ce84 (Apr 2026) | THE BARRA PROCESS or BARRA ROAST METHOD |
| `89c83094-f33f-473f-b721-9519eb6c78a5` | comp-alt | 9b91d265 (Mar–May 2026) | Alternatives Mar 18 + Reddit Research |
| `b2df86f8-6bec-4838-822c-eea882fdebb4` | program-model | 9b91d265 (Mar–May 2026) | B2B Strategy Document |
| `29af5694-f1a5-460f-975e-2a31ff0ff307` | referral-map | 9b91d265 (Mar–May 2026) | Partner Selection Framework + barra_partnerships |
| `7f103b04-b70f-456a-89f7-ecac352a3707` | unique-attr | 9b91d265 (Mar–May 2026) | THE BARRA PROCESS or BARRA ROAST METHOD |

---

## Priority Files (7) — storage.object IDs

These are the 7 canonical documents flagged as highest-priority for Dify re-analysis:

| File | storage.objects.id | Size | input_key |
|---|---|---|---|
| ★ Cafe_Barra_Strategic_Framework_Final.pdf | `2b6bca3b-177a-4f81-b1d5-4e94ca20d030` | 484 KB | target-aud |
| ★ Cafe_Barra_Positioning.pdf | `ccdab50e-9f90-4099-8375-bb98cb3d2614` | 234 KB | comp-alt |
| ★ Cafe Barra Business Model.pdf | `23392ea5-57f2-4fd1-8f6e-1c90cc0eb02d` | 339 KB | program-model |
| ★ Cafe Owner Research Reddit March 2026.pdf | `e30517f8-e79b-4dea-b37a-81ffa597569c` | 378 KB | comp-alt |
| ★ B2B_Sales_Narrative.pdf | `38206a6e-c45b-4ac7-b15d-57adafe3b020` | 7.6 KB | brand-narrative |
| ★ B2B_Brand_Manifesto_Implications.pdf | `f5b9be74-613a-46ef-a20e-5cb7f6eabe48` | 7.1 KB | brand-narrative |
| ★ Cafe Barra Partner Selection Framework.pdf | `ac401334-1284-4cd1-a8c4-b373b9b1567d` | 72 KB | referral-map |

---

## All 32 storage.objects Rows

| storage.objects.id | Filename | Size (bytes) | input_key | Uploader |
|---|---|---|---|---|
| `5d37005a-8450-4159-a746-6db881dada38` | Cafe_Barra_Brand_Manifesto.pdf.extracted.txt | 6668 | brand-narrative | 60e81868 |
| `37c60919-35f6-449a-827d-b732d3454ffc` | Cafe Barra Positioning May 1.pdf.extracted.txt | 5498 | comp-alt | 60e81868 |
| `a6ebe5b1-a06f-4a81-b218-353969173f08` | Cafe_Barra_Positioning.pdf.extracted.txt | 7063 | comp-alt | 60e81868 |
| `ccdab50e-9f90-4099-8375-bb98cb3d2614` | **Cafe_Barra_Positioning.pdf** | 233917 | comp-alt | 60e81868 |
| `9542a1c2-8571-4793-9772-0dc426c108b3` | Cafe_Barra_Strategic_Framework_Updated.pdf.extracted.txt | 30016 | target-aud | 60e81868 |
| `9bd73892-6f89-471e-847d-bf9599ec7364` | Cafe_Barra_Strategic_Framework_Final.pdf.extracted.txt | 22052 | target-aud | 60e81868 |
| `b42a2160-8e5e-4610-a1fe-d52cecb61ff3` | Cafe_Barra_Strategic_Framework_Final.pdf.extracted.txt | 27307 | target-aud | 60e81868 |
| `2b6bca3b-177a-4f81-b1d5-4e94ca20d030` | **Cafe_Barra_Strategic_Framework_Final.pdf** | 484224 | target-aud | 60e81868 |
| `356ffd09-bab1-4c74-aa33-64221b7b7533` | Cafe_Barra_Alternatives_Mar_18_2026.pdf.extracted.txt | 4324 | comp-alt | 9b91d265 |
| `8ace443b-9e53-46b9-a820-9478d4bc4012` | Cafe_Barra_Alternatives_Mar_18_2026.pdf | 95773 | comp-alt | 9b91d265 |
| `477e40a9-0815-485d-8e03-b94cb14bb8cc` | Cafe_Owner_Research_Reddit_March_2026.pdf | 378428 | comp-alt | 9b91d265 |
| `bdaf948c-e0ae-4ad3-a166-13e251dc113f` | B2B_Strategy_Document.pdf.extracted.txt | 4782 | program-model | 9b91d265 |
| `9771b59f-97fc-4e6d-8674-2e37ecb2ce61` | B2B_Strategy_Document.pdf | 7524 | program-model | 9b91d265 |
| `138be291-2bcd-403a-894e-f9e932542dda` | Cafe_Barra_Partner_Selection_Framework.pdf.extracted.txt | 6106 | referral-map | 9b91d265 |
| `c428ef02-5edf-48e6-a186-fb2eaf949089` | Cafe_Barra_Partner_Selection_Framework.pdf | 72141 | referral-map | 9b91d265 |
| `5a5203f7-6c62-458b-864c-6bb927340c30` | barra_partnerships.pdf | 24590 | referral-map | 9b91d265 |
| `ee1307f3-d7f9-4c82-aa30-186d2634f9e9` | THE_BARRA_PROCESS_or_BARRA_ROAST_METHOD.pdf.extracted.txt | 1385 | unique-attr | 9b91d265 |
| `671f8a71-83cc-466e-bd5b-6dd7a705e875` | THE_BARRA_PROCESS_or_BARRA_ROAST_METHOD.pdf | 23925 | unique-attr | 9b91d265 |
| `38206a6e-c45b-4ac7-b15d-57adafe3b020` | **B2B_Sales_Narrative.pdf** | 7623 | brand-narrative | e196ce84 |
| `f5b9be74-613a-46ef-a20e-5cb7f6eabe48` | **B2B_Brand_Manifesto_Implications.pdf** | 7091 | brand-narrative | e196ce84 |
| `a014cbf1-53cd-4e2c-8567-9739cd89ef2b` | Cafe Barra Alternatives Mar 18 2026.pdf.extracted.txt | 4435 | comp-alt | e196ce84 |
| `ee3366d1-217a-401f-bc7c-70e1ee06fae4` | Cafe Barra Alternatives Mar 18 2026.pdf | 95773 | comp-alt | e196ce84 |
| `4d23f9dd-2e24-4e24-a594-3e5588c6370d` | B2B_Strategy_Document.pdf | 7524 | comp-alt | e196ce84 |
| `a552a213-732e-454c-a738-71c9fd5bd10d` | B2B_Positioning_Architecture.pdf | 7053 | comp-alt | e196ce84 |
| `e30517f8-e79b-4dea-b37a-81ffa597569c` | **Cafe Owner Research Reddit March 2026.pdf** | 378428 | comp-alt | e196ce84 |
| `5e7c652e-fb36-4b70-8b08-914dc1309ab7` | Cafe Barra Positioning Statement March 18.pdf | 20012 | comp-alt | e196ce84 |
| `23392ea5-57f2-4fd1-8f6e-1c90cc0eb02d` | **Cafe Barra Business Model.pdf** | 338883 | program-model | e196ce84 |
| `e87a9c1c-4a45-45e3-b3a9-f2e86096656a` | barra partnerships.pdf.extracted.txt | 1849 | referral-map | e196ce84 |
| `1889544c-2a76-4128-862c-c4eb249b9321` | barra partnerships.pdf | 24590 | referral-map | e196ce84 |
| `ac401334-1284-4cd1-a8c4-b373b9b1567d` | **Cafe Barra Partner Selection Framework.pdf** | 72141 | referral-map | e196ce84 |
| `8feaf71c-92af-4266-9129-37e0019d4f6e` | THE BARRA PROCESS or BARRA ROAST METHOD.pdf.extracted.txt | 1405 | target-aud | e196ce84 |
| `c28e1ba4-cf13-4f72-81c7-ed1ed378381c` | THE BARRA PROCESS or BARRA ROAST METHOD.pdf | 23925 | target-aud | e196ce84 |

---

## Not Rehydrated

**MOJOMAP raw uploads (7 copies)** — user e196ce84, slug `c42097ee` (unstructured, no input_key context):
These 7 copies of `MOJOMAP_Cafe_Barra_Strategic_Framework_Final.pdf` (325KB each) were uploaded
before the input system was structured. They have no `input_key` in their path and duplicate
content already available via `957175c0` (target-aud). Not rehydrated to avoid confusion.

**Other client companies** (indebted, one805, lightwell, edgewood, fomomojodojo) — 57 blobs:
Not rehydrated in this phase. Their `inputs` records and company linkage are unknown.

---

## RLS Access

Rehydrated inputs are visible to:
- `bob@fomomojodojo.com` directly (user_id = admin user)
- Any user who is a `company_members` member of Cafe Barra `58b2b15b-bada-4bcd-9c12-b7e66a37d0bc`
- Any admin (via `has_role(auth.uid(), 'admin')` policy)

Storage objects are accessible via the `input_files.file_path = storage.objects.name` RLS join.
The `(storage.foldername(name))[1]` direct-user path won't work since original uploaders
(60e81868, 9b91d265, e196ce84) are not in `auth.users`, but the join path works.

---

## Next Steps

1. Open Inputs tab for Cafe Barra — should show 6 input areas with files listed
2. Run Dify analysis on the 7 priority files (use run-analysis button per file)
3. Accept proposals to replace reconstructed content with evidence-derived content
4. Remove `reconstructed_prior` from `frameworks_used` on replaced needs/routes
