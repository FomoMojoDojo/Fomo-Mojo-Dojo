# Codebase Map

**Repo:** `FomoMojoDojo/Fomo-Mojo-Dojo`
**Active branch:** `lovable-frontend-only`
**Stack:** React 18 + TypeScript + Vite + Supabase + shadcn/ui + Tailwind (minimal — most styling is custom CSS)

---

## Routes (App.tsx)

| URL | View file |
|-----|-----------|
| `/` | `MapView/index.tsx` (mode-aware: admin → MapView, client → ClientMapView) |
| `/strategy` | `Strategy/index.tsx` (admin) or `ClientStrategyView.tsx` (client) |
| `/opportunities` | `Opportunities/index.tsx` (admin) or `ClientFocusView.tsx` (client) |
| `/positioning` | `Positioning/index.tsx` |
| `/routes` | `Routes/index.tsx` |
| `/job-steps` | `JobSteps/index.tsx` |
| `/inputs` | `Inputs/index.tsx` |
| `/analytics` | `Analytics/index.tsx` (admin) or `ClientScoreView.tsx` (client) |
| `/preview/client-refine` | `ClientRefinePreviewView.tsx` — admin-only preview of client home |
| `/preview/client-refine/routes` | `ClientRefinePreviewRoutesView.tsx` — Fix/Improve/Create route cards |
| `/preview/client-refine/workshop` | `ClientRefinePreviewWorkshopView.tsx` — Positioning/Strategy/JTBD/Needs/Council tabs |
| `/foundation` `/diagnosis` `/decision` `/execution` | `ClientPhaseAliasRoute` → maps to client views based on mode |

---

## Key view files

### Admin / internal views
| File | What it does |
|------|-------------|
| `views/MapView/index.tsx` | MojoMap — main strategy map, HeroSection, journey map, opportunities |
| `views/Strategy/index.tsx` | Strategy cascade (winning aspiration, where to play, how to win) |
| `views/Opportunities/index.tsx` | ODI opportunity landscape, kanban |
| `views/Positioning/index.tsx` | Positioning canvas editor |
| `views/Routes/index.tsx` | Fix/Improve/Create route cards with inspect panels |
| `views/Routes/RouteCard.tsx` | Individual route card (accordion, steps, evidence, inspect trigger) |
| `views/Routes/RouteInspectPanel.tsx` | Route inspect Sheet — provenance, evidence, WWHTBT |
| `views/JobSteps/index.tsx` | ODI job steps + needs list (4328 lines — largest file) |
| `views/Inputs/index.tsx` | Evidence input management |
| `views/DeepDive/DeepDivePanel.tsx` | Deep dive right panel (reference pattern for inspect panels) |

### Client-facing views
| File | What it does |
|------|-------------|
| `views/client/ClientDecisionSystemView.tsx` | **Decision Command Screen** — HeroScore, phase nav, priority cards, constraints |
| `views/client/ClientMapView.tsx` | Client map (read-only MojoMap) |
| `views/client/ClientStrategyView.tsx` | Client strategy view |
| `views/client/ClientFocusView.tsx` | Client focus / opportunities |
| `views/client/ClientScoreView.tsx` | Client score / analytics |
| `views/client/ClientDiagnosisView.tsx` | Client diagnosis |
| `views/client/ClientRefinePreviewView.tsx` | Admin preview: client home |
| `views/client/ClientRefinePreviewWorkshopView.tsx` | Admin preview: workshop (3242 lines — second largest) |
| `views/client/ClientRefinePreviewRoutesView.tsx` | Admin preview: routes |

### Decision Command Screen sub-components
All in `src/components/client-view/decision-path/`:
- `Hero.tsx` — score hero section
- `HeroDecisionHeader.tsx` — header with phase + score
- `PriorityCard.tsx` — priority item card
- `PriorityActionCard.tsx` — action card
- `PrimaryConstraintCard.tsx` — top constraint
- `ConstraintCard.tsx` — individual constraint
- `ConstraintTrustStrip.tsx` — evidence trust indicator
- `DriverRow.tsx` / `DriverChipRow.tsx` — score driver rows
- `DecisionPhaseNav.tsx` — phase navigation
- `Interpretation.tsx` — AI interpretation block
- `ScoreTrajectory.tsx` — score trend
- `TeamAgreementControl.tsx` — team alignment control

Other client-view shared components in `src/components/client-view/`:
- `ClientDecisionBar.tsx`, `ClientModeNav.tsx`, `ClientSignalBars.tsx`, `ClientSignalStateBanner.tsx`, `ClientActionCard.tsx`, `ClientNextMoveCenter.tsx`, `ClientRadialSystemMap.tsx`

---

## Styling

| File | Scope |
|------|-------|
| `src/styles/client-refine-preview.css` | All `.crpv-*` classes — Refine Preview + Workshop (4600+ lines) |
| `src/index.css` | Global base styles |
| Tailwind | Used minimally — most UI uses custom CSS or inline styles |

CSS custom properties (design tokens) are defined on `.crpv-page` and are **not available inside Radix portals** (Sheet, Tooltip, Dialog). Use inline styles or hardcoded hex values in portal-rendered content.

---

## Data layer

| Hook | Table | What it fetches |
|------|-------|----------------|
| `useCompany` | `companies` | Active company + area scores |
| `usePositioningCanvas` | `positioning_canvases` | Value prop, taglines, competitive alternatives |
| `useStrategyCascade` | `strategy_cascades` | Winning aspiration, where to play, how to win, capabilities |
| `useOdiNeeds` | `odi_needs`, `odi_market_definitions` | Customer needs, job executor, JTBD |
| `useRoutes` | `routes` (falls back to `opportunities`) | Fix/Improve/Create routes |
| `usePublicBaseline` | `public_baselines` | Outside research signals |
| `useSourceConfidence` | derived | Signal confidence per layer |
| `useSignalExclusion` | `signal_exclusions` | Excluded evidence signals |
| `useClientViewData` | `companies` + joins | Client-facing score + phase data |

---

## Large files to know about

These files are long — search within them rather than reading top-to-bottom:

- `views/JobSteps/index.tsx` — 4328 lines. Contains: `OdiNeedsListSection` (~line 2400), `OdiMarketDefinitionSection`, `JobStepCard`, need scoring sliders.
- `views/client/ClientRefinePreviewWorkshopView.tsx` — 3242 lines. Contains: `PositioningOrgPanel` (~line 1100), `StrategyOrgPanel` (~line 1450), `JTBDOrgPanel` (~line 1600), `NeedsOrgPanel` (~line 2000), `StatementField` (~line 260), `FieldBlock` (~line 180), `KanbanBoard` (~line 1240).
- `src/styles/client-refine-preview.css` — 4600+ lines. Statement field styles start at ~line 4587.

---

## Component patterns

- **Inspect panels:** Use shadcn `Sheet` (`side="right"`, 520px wide). See `RouteInspectPanel.tsx` as reference.
- **Save flash:** `useSaveFlash()` hook returns `{ savedField, flash }` — call `flash("fieldKey")` after save.
- **Gap badges:** `<GapBadge alignment={...} baselineValue={...} />` — shows drift between org signal and outside signal.
- **Evidence bands:** `src/lib/evidenceBands.ts` — `EvidenceBand` type, `BAND_LABELS`, `computeArtifactUnlockSummary`.
- **StatementField:** Prose-first editable field at 30px Inter. Click to edit, Enter to save, Shift+Enter for newline. Used in Positioning/Strategy/JTBD org panels.
- **FieldBlock:** Traditional label+textarea. Still used in compare tab and single-line/numeric fields.
