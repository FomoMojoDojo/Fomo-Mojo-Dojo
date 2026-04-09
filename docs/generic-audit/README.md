# Generic Audit Company

This fixture creates a company named `Generic Audit - Fallback Diagnostics`.

Purpose:
- Surface where fallback/generic content appears.
- Make area-level derivation visible for scoring/readout tuning.

Seed behaviors intentionally demonstrated:
- Input completeness seeding from heuristics (`inferPublicSeed`).
- Area mapping fallback from `group_key` / substring rules.
- Constraint explanation templating from foundation minimum score.
- Route derivation from opportunities when routes are absent.
- Primary evidence confidence from source-path markers.
- Positioning and map readout fallback copy when first-class artifacts are missing.

Files:
- `docs/generic-audit/generic_fill_inventory.csv`
- `sql/seed_generic_audit_company.sql`

Run locally:
```bash
docker exec -i supabase_db_dzlgyxcvuwiulgifbmew psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /dev/stdin < sql/seed_generic_audit_company.sql
```
