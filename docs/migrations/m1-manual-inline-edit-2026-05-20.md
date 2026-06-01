# M1 — Manual Inline Editing
**Date:** 2026-05-20  
**Branch:** strategic-object-graph

---

## What Was Built

Field-level inline editing across all 4 workshop surfaces without triggering LLM regeneration.

---

## Phase 1 — Field Inventory

### In-Scope (text fields, this build)

| Surface | Table | Fields | Editor |
|---------|-------|--------|--------|
| Positioning | `positioning_canvases` | `value_for_customer`, `category_rationale`, `best_fit_customers` | InlineTextareaEdit |
| Positioning | `positioning_canvases` | `market_category`, `current_tagline`, `proposed_tagline` | InlineTextEdit |
| Cascade | `strategy_cascades` | `winning_aspiration`, `where_to_play`, `how_to_win` | InlineTextareaEdit |
| Routes/Legs | `routes` | `title` | InlineTextEdit |
| Routes/Legs | `routes` | `short_description` | InlineTextareaEdit |
| Opportunities | `odi_needs` | `desired_outcome` | InlineTextEdit |

### Deferred to M1.5 (array-of-objects)

- `competitive_alternatives_json`, `unique_attributes_json` (Positioning)
- `capabilities_json`, `management_systems_json` (Cascade)
- `rejected_alternatives`, `what_would_have_to_be_true` (Routes)
- `odi_canonical_statement` (Opportunities) — best handled via proposal/accept flow

---

## Phase 2 — Components

**`src/components/inline-edit/InlineTextEdit.tsx`**
- Single-line text input
- Pencil icon (✎) appears on hover
- Enter to save, Escape to cancel, blur to save
- Passes `opts?: { isManualInline?: boolean }` pattern via `onSave` callback

**`src/components/inline-edit/InlineTextareaEdit.tsx`**
- Multi-line textarea (default 4 rows, configurable)
- Pencil icon appears on hover (absolute top-right)
- Enter to save, Shift+Enter for newline, Escape to cancel, blur to save
- Hint text shown during edit: "Enter to save · Shift+Enter for newline · Esc to cancel"

Both components:
- Accept `style` prop (wraps the display state) and `inputStyle`/`textareaStyle` (the edit state element)
- Accept `disabled` prop — hides pencil affordance when false
- Restore static display on save/cancel

---

## Phase 3 — Save Utility

**`src/lib/manualInlineEdit.ts`**

```typescript
saveManualEdit(surfaceType, surfaceId, companyId, fieldName, newValue)
```

- Maps surfaceType → table (`positioning_canvases`, `strategy_cascades`, `routes`, `odi_needs`)
- Sets `source = 'manual_inline'` for surfaces with the `source` column (positioning, cascade, route)
- Calls `captureBaseline(companyId, surfaceType, surfaceId)` after the UPDATE

---

## Phase 4 — A35 Preservation

No code change needed. `refresh-cascade` and `refresh-positioning` already use `.like("source", "manual_%")` — `manual_inline` is automatically covered.

---

## Phase 5 — Hook Extensions

**`src/hooks/usePositioningCanvas.ts`**
- Added `canvasId` state (tracked from fetch + update)
- Extended `updateTextField(field, value, opts?: { isManualInline? })`:
  - When `isManualInline: true`: adds `source: 'manual_inline'` to patch, calls `captureBaseline` with returned canvas ID
- Added `canvasId` to return value

**`src/hooks/useStrategyCascade.ts`**
- Extended `updateNarrativeField(field, value, opts?: { isManualInline? })`:
  - When `isManualInline: true`: adds `source: 'manual_inline'` to patch, calls `captureBaseline` with existing `cascadeId`

---

## Phase 6 — UI Wiring

### Positioning (`PositioningOrgPanel.tsx` — hierarchy layout)
- § 03 keystone stripe: `value_for_customer` → InlineTextareaEdit (dark bg, white text override)
- § 03 stripe: `category_rationale` → InlineTextareaEdit
- § 04: `best_fit_customers` → InlineTextareaEdit
- § 05: `market_category` → InlineTextEdit; `category_rationale` → InlineTextareaEdit
- § 06: `current_tagline` → InlineTextEdit; `proposed_tagline` → InlineTextEdit

### Cascade (`StrategyOrgPanel.tsx` — hierarchy layout)
- § 01: `winning_aspiration` → InlineTextareaEdit
- § 02: `where_to_play` → InlineTextareaEdit
- § 03: `how_to_win` → InlineTextareaEdit

### Routes/Legs (`ClientRefinePreviewRoutesView.tsx`)
- `HierarchyRouteSection`: route `title` → InlineTextEdit; `short_description` → InlineTextareaEdit
- `LegRow`: leg `title` → InlineTextEdit; leg `short_description` → InlineTextareaEdit
- `handleSaveRouteField(routeOrLegId, field, value)` implemented with `saveManualEdit` + `setRoutesRefreshKey((k) => k + 1)` for refetch

### Opportunities (`NeedsOrgPanel.tsx`)
- `NeedRow`: `desired_outcome` → InlineTextEdit (when `onSaveNeedField` prop present and titleMode='human')
- `handleSaveNeedField(needId, field, value)` implemented in `ClientRefinePreviewWorkshopView.tsx` with `saveManualEdit`

---

## Verification

- `tsc --noEmit`: **clean**
- A35 preservation: confirmed covered by `LIKE 'manual_%'` — no code change needed
- Save flow: UPDATE + source='manual_inline' + captureBaseline on all 4 surfaces

---

## Caveats

1. **Opportunities (odi_needs) local state not updated** after `saveManualEdit` — the need row won't reflect the new value until the next reload/refetch. The `desired_outcome` field is read from `initialNeeds` prop and managed by `localNeeds` state in `NeedsOrgPanel`. A full refetch could be wired by adding a `needsRefreshKey` to `useOdiNeeds` (deferred to M1.5).

2. **Dark bg keystone stripe**: `value_for_customer` edit state uses semi-transparent white background in the keystone stripe (dark). Works but is distinct from the rest of the edit pattern.

3. **`category_rationale` appears in both § 03 and § 05** in the hierarchy layout. Both InlineTextareaEdit instances are wired to the same field — saving from either location updates the same value.
