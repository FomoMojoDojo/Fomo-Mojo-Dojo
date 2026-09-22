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

---

## Playwright login state

- The workspace specs (`tests/workspace/`, `playwright.config.ts`) run under an admin storage state at `backups/fr-state.json` (`backups/` is gitignored).
- `tests/workspace/global-setup.ts` mints it when missing: signs in through the dev server's DEV `window.supabase` with `FR_LOGIN_EMAIL` / `FR_LOGIN_PASSWORD`, pins `FR_COMPANY_ID`, writes the state. If the file exists it is reused as-is (no expiry check — delete it to re-mint).
- The local test credential lives in `backups/fr-login.env` (gitignored, local stack only). It is `bob2@fomomojodojo.com`, a CC-owned test account with a `user_roles` admin row; its password was set via the service-role auth admin API and exists nowhere else. Never use the operator's own login here.
- Mint / run:

  ```bash
  source backups/fr-login.env && npx playwright test --retries=0
  ```

---

## Session-open ritual — terminal boot list

Empty-body / `{}` POST with a service-role bearer to each; expect `400 company_id required` (or that
terminal's own 4xx), never `503 Module not found`. A NEW function directory or `_shared` file is not
served until the stack is recreated (`source supabase/functions/.env.local` → `supabase stop` →
`supabase start`; volumes kept, NEVER `db reset`) — an operator-approved step, reported first.

- public-baseline (pair proof: with `x-internal-call` → 400, without → 401)
- gateway-resume-step · local-jobmap-synthesis · dify-analyze-file / analyze-file
- generate-step-opportunities · generate-step-conditions · generate-market-hypothesis
- feed-first-read-corrections · record-check-outcome
- record-interview-finding (gate 2, 2026-09-16 — the one write path for interview findings)
- record-interview-upload (gate B 2a, 2026-09-19)

**Served code is not live on edit** (R46, 2026-09-21). The edge runtime's worker keeps the module it booted with:
an in-place edit of a served function (its `index.ts`/`handler.ts` or a `_shared` file it imports) is live only
after `docker restart supabase_edge_runtime_<project>` (no DB touch; volumes untouched) — or once the worker's
400 s wall clock recycles it, which is not a step to rely on. After the restart, the boot list above proves the
worker is up (400 on `{}`).

**Planted failures on served code** (R46): a plant in a served function counts as RED only when the run made
AFTER that `docker restart` shows it; restore the file (md5-identical), restart again, and the GREEN run is the
one after the second restart. A plant run without the restart proves nothing — it exercises the old module.

**Never probe `restamp-aggregator-self-voice` with `{}`** (2026-09-21). Its body is `{ dry_run: true (DEFAULT),
company_id? }`, so an empty body is a valid all-companies dry run: it loads every unfrozen company's outside-voice
rows and runs the local Ollama authorship judge (qwen2.5:14b-instruct) on each — no 400, no write, but the worker
runs to the 400 s wall clock and burns judge time (three probes on 2026-09-21 = 156 judged rows, 0 model_calls rows;
the judge is not ledgered). Exclude it from any fleet-wide boot sweep; its boot is proven by `deno check`.

### Search-health check (2026-09-18)

Before any outside read, one control query against the SearXNG the runner uses:

```bash
curl -s -m 40 "http://localhost:8888/search?q=<active company name>&format=json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const G=["google","duckduckgo","startpage","brave"];const r=(j.results||[]);console.log(JSON.stringify({results:r.length,general_results:r.filter(x=>G.includes(x.engine)).length,engines:[...new Set(r.map(x=>x.engine))],unresponsive_engines:j.unresponsive_engines}))})'
```

- **Pass:** at least one result from a GENERAL engine — google, duckduckgo, startpage or brave (check `results[].engine`).
  Results from wikipedia (or any other non-general engine) alone do NOT count: on 2026-09-21 the query returned
  `results: 1` from wikipedia while all four general engines were suspended — that is a FAIL.
- **Fail:** zero general-engine results and every general `unresponsive_engines` entry is a captcha / too-many-requests / access-denied
  (the egress is T-Mobile CGNAT; brave, duckduckgo, startpage and google captcha or 403 it — a per-engine cooldown
  that re-triggers on the first request after expiry, i.e. IP reputation, not self-healing). Print the engine table and
  the line **"SearXNG dead this session — name-only plans run on the web_search lane; domain plans unaffected"**.
  No per-company retries that session. Name-only plans (`no_public_site`) run the Anthropic web_search lane as
  discovery before the thin gate (ruling 2026-09-18; `_shared/nameOnlyLane.ts`); the run ledger carries
  `search: { searx, lane }` and `search_status: lane_only` when the lane carried it. Domain plans never depended on
  SearXNG for the lane (own-site crawl bootstraps the gate).
