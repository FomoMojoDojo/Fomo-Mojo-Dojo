# Recovery Status — Post-Incident Data Inventory

Last updated: 2026-05-13

This document tracks what was lost in the May 2026 data-loss incident, what was reconstructed, what is confirmed, and what is still estimated or missing.

---

## Incident Summary

`supabase db reset --local` was run twice (once in Phase 76A, once in a later session). Both times it destroyed all local workspace data. Reconstruction happened in two passes:

- **Pass 1 (Phase 77A/B):** AI-regenerated data — introduced wrong B2C framing for Cafe Barra
- **Pass 2 (Phase 77D):** Screenshot-based reconstruction — corrected to B2B specialty coffee framing

---

## auth.users

| Status | Detail |
|--------|--------|
| Lost | All local auth accounts were deleted by `db reset` |
| Recoverable | Recreatable via Supabase dashboard or CLI |
| Action needed | Re-create login accounts before testing auth-gated views |

pg_dump does not capture `auth.users`. They must be recreated manually after any reset.

---

## Workspaces (Companies)

### FomoMojoDojo
| Table | Status | Confidence |
|-------|--------|-----------|
| `companies` row | Confirmed — survives seed | High |
| `positioning_canvases` | Confirmed | High |
| `strategy_cascades` | Confirmed | High |
| `odi_market_definitions` | Confirmed | High |
| `job_steps` | Confirmed — alignment script applied | High |
| `odi_needs` | Confirmed — alignment script applied | High |
| `routes` | Confirmed — alignment script applied | High |
| `managed_outcomes` | Confirmed — alignment script applied | High |
| `opportunities` | Confirmed — alignment script applied | High |

All FomoMojoDojo workspace data was updated by `sql/cleanup_fomomojodojo_alignment.sql` to align to Strategic Decision System language. The alignment script targets FomoMojoDojo by exact name match.

---

### Cafe Barra
| Table | Status | Confidence | Notes |
|-------|--------|-----------|-------|
| `companies` row | Confirmed | High | UUID: `58b2b15b-bada-4bcd-9c12-b7e66a37d0bc` (current DB — seed UUID was overwritten) |
| `positioning_canvases` | Reconstructed | High | B2B specialty coffee roaster framing confirmed from screenshots |
| `strategy_cascades` | Reconstructed | High | B2B framing, winning aspiration confirmed |
| `odi_market_definitions` | Reconstructed | High | job_executor confirmed verbatim from prior conversation |
| `job_steps` | Reconstructed | Medium | 6 steps confirmed from screenshots; evidence fields estimated |
| `odi_needs` | Reconstructed | Medium | 8 needs confirmed from screenshots; importance/satisfaction values estimated |
| `routes` | Reconstructed | Medium | 5 route titles confirmed; why_this_matters estimated for 4 of 5 |
| `opportunities` | Not yet present | Low | Not in reconstruction seed |
| `managed_outcomes` | Not yet present | Low | Not in reconstruction seed |

**What is known-confirmed for Cafe Barra:**
- Market definition: `job_executor = "Cafe owners trying to create a unique, high-quality coffee offering that sets their establishment apart."`
- 6 job steps in journey `primary` ("Creating a specialty coffee offering"), step labels verbatim from screenshots
- 8 ODI needs, all linked to step 3 ("Evaluate current offerings"), desired_outcome texts verbatim
- 5 route titles verbatim, route type confirmed

**What is estimated or reconstructed:**
- `evidence_status`, `evidence_basis`, `evidence_confidence` on job_steps — reasonable defaults, not original values
- `importance`, `satisfaction` on odi_needs — mid-range defaults (6/3), not original values
- `evidence_json`, `steps_json`, `why_this_matters_json` on routes — reconstructed from context; original values unknown
- `pts_value`, `effort` on routes — estimates only

All reconstructed rows are tagged `frameworks_used` includes `'reconstructed_prior'` and `source_path = 'reconstructed_from_prior_screenshots'` (in notes field).

---

### Generic Audit Company ("Generic Audit - Fallback Diagnostics")
| Status | Detail |
|--------|--------|
| Restored | `sql/seed_generic_audit_company.sql` recreates this company idempotently |
| Confidence | High — seed is authoritative, not reconstructed |

This is an internal diagnostic company used to expose fallback derivation paths. It is safe to re-run its seed at any time.

---

## Uploaded Files — FORENSIC RECOVERY FINDING (2026-05-13)

**Phase 78C COMPLETE — storage metadata rehydrated directly from Docker volume.**

`supabase db reset --local` only resets the PostgreSQL database. It does NOT wipe Docker volumes. The `supabase_storage_dzlgyxcvuwiulgifbmew` volume survived all resets intact.

| Status | Detail |
|--------|--------|
| Docker storage volume | **89 physical blobs fully intact** — all Cafe Barra, FomoMojoDojo, and other client files |
| `storage.objects` table | **32 Cafe Barra rows rehydrated** by `sql/rehydrate_cafe_barra_storage.sql` |
| `input_files` table | **32 Cafe Barra rows rehydrated** — join via `file_path = storage.objects.name` verified |
| `inputs` table | **13 Cafe Barra input area rows rehydrated** (6 input keys, 13 unique session UUIDs) |
| Cafe Barra blobs | **32 blobs** covering ~17 unique source documents — all accessible via Inputs UI |
| FomoMojoDojo blobs | 27 blobs — not yet rehydrated |
| Local mirror in `Client_Files/Cafe Barra/` | **239 PDFs** — complete local copies |

All Cafe Barra files are now visible in the Inputs tab. See `docs/STORAGE_REHYDRATION_INDEX.md` for the full blob inventory and verification query.

**Recommended next action:** Run Dify analysis on the 7 priority files (Strategic Framework Final, Positioning, Business Model, Reddit Research, B2B Sales Narrative, Brand Manifesto, Partner Selection Framework) → accept proposals to replace reconstructed content with evidence-derived content.

---

## Seeds Status

| Seed file | Safe to re-run? | Notes |
|-----------|----------------|-------|
| `supabase/seeds/cafe_barra_full_workspace.sql` | Yes | Idempotent; deletes by UUID then re-inserts base company data. Does NOT insert job_steps (those are AI-generated). |
| `supabase/seeds/cafe_barra_reconstructed_workspace.sql` | Yes | Idempotent; restores reconstructed workspace from known prior state. Run after `cafe_barra_full_workspace.sql`. |
| `sql/seed_generic_audit_company.sql` | Yes | Idempotent; targets company by exact name. |
| `sql/cleanup_fomomojodojo_alignment.sql` | Yes (carefully) | Updates FomoMojoDojo rows by UUID and name. Marker: `-- destructive-ok`. Run-once alignment; safe to re-run since it only UPDATEs to known values. |

---

## What Is Still Missing

1. **auth.users** — must be recreated manually after any `db reset`
2. **Cafe Barra opportunities table** — not in reconstruction seed
3. **Cafe Barra managed_outcomes** — not in reconstruction seed
4. **Original ODI need importance/satisfaction values** — estimated, not original
5. **Original route evidence and step JSON blobs** — estimated, not original
6. **Any other client companies** that existed before the incident — not recoverable without a prior backup

---

## Verification Checklist

After restoring from backup or re-seeding:

- [ ] FomoMojoDojo company appears in company switcher
- [ ] Cafe Barra company appears in company switcher
- [ ] Generic Audit company appears (run `sql/seed_generic_audit_company.sql` if missing)
- [ ] Cafe Barra routes view shows 5 routes with correct B2B titles
- [ ] Cafe Barra job steps view shows 6 steps in "Creating a specialty coffee offering" journey
- [ ] FomoMojoDojo positioning shows Strategic Decision System language
- [ ] Login works (auth.users recreated)
