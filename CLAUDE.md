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
- Mint / run. **Source all three env files** — the RLS specs `test.skip` without
  `NONADMIN_*` / `MEMBER_*`, so the login-only invocation silently skips 14 of them:

  ```bash
  source backups/fr-login.env && source backups/fr-nonadmin.env && source backups/fr-member.env && npx playwright test --retries=0
  ```

  **Baseline: 500 passed / 4 skipped / 0 failed** (measured 2026-11-11, 28.5 min serial; was 364
  before the U6 landing specs landed). With only `fr-login.env` sourced 14 of them silently skip —
  `s2-interview-storage-rls`, `s3-first-read-marks-rls`, `v-tensions-rls`, `v-integrity-admin` and
  `v2-slots-swap` — which reads as passes lost, not gained. That login-only figure was 330/18/0
  against the 364 baseline and has NOT been re-measured since; expect 486/18/0 but do not treat it
  as measured.

- **SP-F32 filed (2026-11-13) — `g-home-parity` is pinned to a LIVE company's data.** Its fixture
  `tests/workspace/fixtures/home-dom-before_20260918.txt` is a byte-for-byte snapshot of the home DOM
  for Edgewood (`3dd2cfbb-0792-4bf1-9cd4-15db9646874b` — the `active_company_id` carried in
  `backups/fr-state.json`), so **any data act on that company turns the spec RED with no code change
  at all**. It has now been re-pinned for that reason three times, most recently on 2026-11-13 after
  SP-105's 13-row `signal_band` correction moved the team signal count `TEAM 42 → 55`. A RED here is
  read as a data change until proved otherwise: diff the one line, name the act, re-pin. The fix is to
  point the spec at a throwaway fixture company rather than a real one; filed, not fixed.

- **Known flakes (R35, restated BY MECHANISM 2026-11-13 under SP-252; first written 2026-10-19)** —
  a flake is recognised by its mechanism, never by a list of spec names. A list of names is a list of
  the specs that happened to flake first, and it reads a fourth instance of a known race as a
  regression.

  **The route-mock race.** A Playwright failure is read as this flake ONLY when ALL THREE hold:
  - **(a)** the error is `route.fulfill` on a **disposed response** — i.e.
    `route.fulfill: Fetch response has been disposed`, raised from a `route.fulfill({ response: res })`
    after `res` was already consumed by `await res.text()`;
  - **(b)** the commit under test changes **no file under `src/` or `tests/`**; and
  - **(c)** the spec **passes when re-run alone**.

  All three, measured, or it is a FAILURE — not a flake. No spec is pre-forgiven and none is excluded:
  **twelve** specs share the consumed-response pattern (`d-jobmap-stage`, `i-opportunities`,
  `m-inputs-actions`, `m4-inputs-completion`, `n-jobmap-actions`, `n2-jobmap-market-door`,
  `o-opportunities-actions`, `p-routes-actions`, `s-jobmap-interview-frame`, `x2-inputs-interview`,
  `x3-inputs-interview-controls`, `x4-inputs-interview-inference`), so any of them can raise it.
  Observed in `x4-inputs-interview-inference` (2026-10-19) and in `x2-inputs-interview.spec.ts:194`
  (2026-11-13, I-2 part A: failed in `[reduced]` while the SAME test passed in `[motion]`, no `src/`
  or `tests/` file in the commit, 8 passed on solo re-run — all three held).
  **SP-F42 filed: fix the class rather than name its instances** — fulfil from the parsed rows
  (`route.fulfill({ json: rows })`), never from the response already drained by `await res.text()`.
  Until that lands, the three conditions are the test.

  **Two other flakes, each with its own mechanism** — the three conditions above do NOT apply to
  them, because they are not that race:
  - `tests/workspace/c-arrows.spec.ts` (ArrowRight from /strategy cycles Base only) — keypress timing:
    one ArrowRight registers twice, so the visited-path list repeats a workspace route. Passes alone.
  - `scripts/guards/completion-sweep-guard.sh` (SP-136, 2026-11-12) — **a GUARD, not a spec, and flaky
    against the clock.** Its `posts` check counts rows landing in `net._http_response` inside its own
    window (`:61-62`) and expects exactly 3. `cron.job` jobid 2 is scheduled `* * * * *` running
    `SELECT public.sweep_file_proposal_completion()` — the function under test — so when the guard's
    window straddles a minute boundary it counts the scheduler's own sync as a fourth and fails with
    `expected 3 sync responses (A, C1, C2), saw 4`. Measured 2026-11-12: its own three responses shared
    one timestamp (…:28:59.781195) and the fourth landed at …:29:00.011419, on the tick. It passes
    standalone; a single failure of it in a sweep is read as this flake and the baseline stands.
    SP-F26 filed: the check should pin to its OWN request ids rather than counting a time window.

### Guard fixtures — the two non-admin accounts (2026-09-27)

Guards that name a non-admin caller read their ids from gitignored env files, and abort with
`guard: FAIL <VAR> not set` rather than passing vacuously. **Source them before the run**:

- `backups/fr-nonadmin.env` → `NONADMIN_ID` (+ email / password). A non-admin with **no `user_roles`
  row and no `company_members` row** — the no-membership fixture. Needed by `interview-parser`,
  `first-read-marks`, `interview-segments`, `client-portal-audit`, `first-read-rls`. It must stay
  membership-less: several guards use it as the caller who belongs to nothing.
- `backups/fr-member.env` → `MEMBER_ID`, `MEMBER_COMPANY_ID` (+ email / password). A non-admin with
  **no `user_roles` row and exactly one `company_members` row**, on the throwaway company
  `66666666-6666-4666-8666-666666666601` and nowhere else. Needed by `first-read-rls`. That company
  also carries the kept first-read fixture rows (session `…a1`, response `…b1`), so no check ever
  writes a live company and only one check reads Edgewood — to assert it returns zero rows.
- Both were created via the service-role auth admin API; their passwords exist nowhere else. Never
  use the operator's own login. `first-read-rls` asserts the shape of both fixtures before it starts.

  ```bash
  source backups/fr-nonadmin.env && source backups/fr-member.env && bash scripts/guards/first-read-rls-guard.sh
  ```

---

## Probes — never a function that writes or calls a model (D4, 2026-11-07)

**A function that writes or calls a model is never used as a probe.** A probe is a read-only query or
an explicit dry run. **A function with no dry-run mode is not probed** — find another way to establish
the fact, or establish it from the stored record instead.

What this cost on 2026-11-07: `propose-positioning-changes` was invoked to show that a per-row gate
refused an operator-edited row, because unlike `evaluate-*` it carries no Option B door and so
exercises the gate alone. It did refuse the cascade — and then **admitted the company's other,
unstamped surface, called OpenAI, and inserted a `surface_proposals` row** on a live company
(FomoMojoDojo). The call was lawful (that surface is public and not operator-edited) but nobody asked
for the proposal, and `propose-*` writes no `model_calls` row, so the spend is unledgered and there is
no row to correct — only an annotation. Retired under D1 as `rejected`, never deleted.

The tell was there before the call: these functions end in a write. `grep` for the write and for
`callOpenAIJSON` **before** invoking anything to establish a fact:

```bash
grep -nE 'callOpenAIJSON|\.from\("[a-z_]+"\)\s*$|\.insert\(|\.update\(' supabase/functions/<fn>/index.ts
```

Read-only alternatives, in order of preference: query the stored gate decision
(`integrity_runs` already records every refusal with its reason), exercise the predicate directly in a
unit test, or use a function's own `dry_run` body flag where one exists (`restamp-aggregator-self-voice`,
`scripts/r52/plan.ts`). Note that a dry run is not automatically cheap — see the
`restamp-aggregator-self-voice` warning below.

---

## Baselines — the three that are easy to run wrong

- **tsc is `npx tsc -p tsconfig.app.json --noEmit` → 231 errors** (measured 2026-11-11; recorded as
  232 until then). The root `tsconfig.json` is solution-style (`"files": []` plus `references`), so a
  bare `npx tsc --noEmit` compiles **nothing** and reports a clean **0** — a false green that looks
  like a 231-error improvement. `tsconfig.node.json` is 0.
- **The boot-sweep bearer is the LEGACY JWT service-role key**, from
  `npx supabase status --output env` (`SERVICE_ROLE_KEY=eyJ…`). The `sb_secret_…` value printed in
  `supabase status`'s Authentication Keys panel is **not** accepted by the functions gateway: every
  terminal answers `401 {"msg":"Error: Missing authorization header"}`, which reads like a dead stack
  rather than a wrong key.
- **The sweep has a runner: `bash scripts/guards-sweep.sh`** (SP-135, 2026-11-12). It excludes two
  files BY NAME — `interview-upload-path-guard.sh` (U6-38, by design) and `diagnose-data-check.sh` (a
  helper `diagnose-data-guard` invokes, never an independent member) — classifies on BOTH the exit
  code and the printed verdict, and puts `~/.deno/bin` on PATH, because `interview-parser-guard` runs
  `deno test` bare and reads RED without it for no code reason. Source the three env files first.
- **The guard sweep is 45 GREEN / 4 RED of 49, and the FOUR standing REDs are named** (re-measured
  2026-11-13 after Part B added `ingest-partial-honesty-guard`; was 44 / 4 of 48 with
  `caller-authz-guard` and 43 / 4 of 47 before either, all three env files sourced;
  `interview-upload-path-guard` is excluded from the session sweep by design (U6-38) and passes
  standalone):
  - `network-guard` — `(n4) cannot read pf state without a password`; needs the read-only sudo entry
    from `scripts/network/sudoers.mojomap-pf-readonly`.
  - `diagnose-data-guard` — `(i) the live read-only check FAILED`.
  - `excerpt-blanking-guard` — `step e6: plan ids ≠ SQL set: only_in_plan=0 only_in_sql=2`. The two
    rows are Spectrum signals of 2026-10-22 that fall between the planner's `normalizeForHash` match
    (`_shared/excerptBlanking.ts:183`) and the guard's cruder SQL `LIKE` (SP-F5).
  - `source-class-guard` — `(c1) 73 of 87 current read(s) carry NO classes map in input_ledger`,
    across 19 companies; the reads predate act 1a-4 and want regenerating.

- **SP-F33 filed (2026-11-13) — `supabase migration up` is BROKEN on this stack, and it predates
  Part B.** `supabase/migrations/20261112130000_drift_state_withheld.sql` is committed (in
  `07bbc30b`) and its SQL **is** applied — both constraints sit on `surface_drift_assessments` — but
  it carries no row in `supabase_migrations.schema_migrations`, so the CLI still thinks it is
  pending. `migration up` would re-apply it and fail on `add constraint check_withheld_has_no_score`,
  which already exists. Until that row is written, apply a new migration by hand and record it:

  ```bash
  docker exec -i supabase_db_dzlgyxcvuwiulgifbmew psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/<file>.sql
  docker exec supabase_db_dzlgyxcvuwiulgifbmew psql -U postgres \
    -c "insert into supabase_migrations.schema_migrations(version) values ('<version>') on conflict do nothing;"
  ```

  The remedy for the gap is that same insert with `'20261112130000'`. **Not done here** — it is
  outside Part B and belongs to whoever signs for that migration.
- **SP-F35 filed (2026-11-13) — a baseline on company B can start while a file analysis runs on
  company A.** Both are heavy local jobs, and nothing excludes that one pair. I-1 closes every case
  it controls: the file-analysis starter yields to any `company_run_locks` row anywhere, and a running
  analysis takes its own company's lock so a baseline or research run on THAT company is refused by
  the mechanism those functions already respect. What remains is cross-company, because
  `public-baseline` and `research-company` check only their own company's lock and
  `company_run_locks`' primary key is `(company_id)` alone. Closing it means a fleet-wide check inside
  `public-baseline`'s acquisition — **ruled OUT of I-1 by SP-188, which also forbids touching
  `public-baseline` for it.** Filed, not fixed.
- **SP-F34 filed (2026-11-13) — `src/integrations/supabase/types.ts` is ~1275 lines STALE.** A fresh
  `npx supabase gen types typescript --local` produces 8685 lines against the committed 7410, because
  tables added over recent slices (`claim_delta_rule_refusal_audit` among them) were never
  regenerated into it. So a column is added to that file BY HAND, as Part B added
  `file_proposals.pages_read / pages_total / chars_total`; a wholesale regeneration is a large,
  separate act that would bury any slice it rode along with. Do not run it as a side effect.

  **Read the printed verdict, not only the exit code.** Until 2026-11-11 `source-class-guard` printed
  `guard: RED` and exited **0** — its verdict line was the file's last line, with no following status
  line — so every exit-code sweep counted it GREEN and the baseline was recorded as 44 GREEN / 3 RED.
  Fixed (SP-59); a sweep that keys on either signal now agrees. A guard that cannot go red in the
  sweep is not a guard, so a sweep script should classify on BOTH: a zero exit **and** `GUARD OK` or
  `guard: PASS` in the output.

---

## OPEN BEFORE THE FIRST OUTSIDE LOGIN (SP-163, SP-165 — 2026-11-12)

**53 of the 93 edge functions still have no caller check.** Slice A gated 32 (the eleven of SP-143
plus `research-company` plus Group 4's 20), I-1 added `dify-analyze-file` (SP-179 — the browser no
longer starts an analysis, so it is admin + trusted-internal only), and 7 were already authorised
in-function
(`council-review`, `import-intake-submissions`, `infer-interview-market`, `interview-parser`, `maps`,
`generate-deep-dive`, `publish-release-note`). The remaining 54 are Groups 1, 2 and 3 and the
class-B functions — deferred to slices B and C, **not cancelled**. The guard's expected counts are
33 gated / 53 not-yet-gated; they move together with this paragraph.

Until those land, two things stay as they are:
- **no account for anyone outside FMD** (SP-121), and
- **the function gateway is not exposed beyond the tailnet** (SP-148).

That is load-bearing, because the gateway IS already served to every tailnet member at
`https://mojomap.tail7b863b.ts.net:8443/functions/v1`, and the publishable anon key reaches an
ungated handler. Measured 2026-11-12: `public-companies` returned 200 and the full company list to
the anon key alone, on localhost and over the tailnet.

Where to look:
- `bash scripts/guards/caller-authz-guard.sh` — prints `gated / not-yet-gated / unaccounted` on
  every run and names each deferred function with its group. It does **not** fail because the list
  is non-empty (SP-164); it fails if a function is on neither set, so a NEW function cannot be added
  without either a caller check or a named deferral.
- `~/dev/_diagnose-shots/2026-11-12/ingest/authz-census.md` Part 2 — the verdict for all 93, the
  proposed rule per group, and the measured gateway reachability.

- **SP-F31 filed (2026-11-13) — `public.has_capability()` grants neither `structure.route.generate`
  nor `structure.opportunity.generate`.** Those two strings live only in `src/lib/capabilities.ts`
  (`CLIENT_BUNDLES`, where Decision-Owner holds them); the SECURITY DEFINER function knows five caps
  and neither is among them. So the member arm of `propose-route-changes` and
  `propose-opportunity-changes` refuses a Decision-Owner today, and both are admin-only in practice.
  Slice A reused `has_capability` per SP-142 rather than changing the grant or duplicating the client
  mapping into the edge runtime. `caller-authz-guard` check (d4) pins the present answer (`f`) and
  goes RED on purpose if the grant is ever extended. Filed, not fixed.

---

## Network boundary — the ritual runs network-guard.sh

`bash scripts/guards/network-guard.sh` joins the session-open ritual (needs no DB login; n4 needs the
read-only sudo entry from `scripts/network/sudoers.mojomap-pf-readonly`). It asserts: no non-loopback
listener outside the Apple/Tailscale allowlist or the pf-blocked port set; Vite (8080), the local parser
(8789) and launch-site (3010) on 127.0.0.1 only; zero `nc` listeners; pf enabled with our anchor's
loaded rules matching `scripts/network/pf.anchor`; and both Tailscale serve URLs answering.

**Partners reach MojoMap ONLY through Tailscale serve** — `https://mojomap.tail7b863b.ts.net` (app) and
`:8443` (API). Taylor (taylorstandlee@gmail.com) and Jim (jimcmagill@gmail.com) are full members of the
`tail7b863b.ts.net` tailnet. Serve listens on **no host port**: nothing binds 443 or 8443; the Tailscale
system extension terminates TLS in its own process and dials the service over loopback. That is why our
servers can bind 127.0.0.1 and why pf rules on `utun*` never touch the partner path — and why check n5
exists: it is the standing proof that the boundary did not cut them off. Never point a partner at a LAN
or tailnet address with a port; that path is closed on purpose.

**The Mac cannot test its own boundary.** macOS routes traffic addressed to any of the host's own
addresses over `lo0`, and the pf rule exempts `lo0`, so `nc 192.168.12.191 54321` from this Mac connects
even when the boundary is working. The LAN and tailnet addresses are only testable from another device —
that is why the runbook's before/after checks are done from the operator's phone.

**A Docker Desktop restart leaves the edge runtime down.** `supabase_edge_runtime` carries
`RestartPolicy: no`, so after any Docker restart it stays exited and Kong answers
`503 {"message":"name resolution failed"}` on all twelve function terminals. Fix before the boot sweep:

```bash
docker start supabase_edge_runtime_dzlgyxcvuwiulgifbmew
```

Do not restart Kong first — the 503 is the missing upstream, not a stale Kong.

**A guard never leaves a listener running.** 60 orphaned `nc -l` processes from a superseded
client-sync-schedule design sat on every interface for four days before anyone noticed. Any guard that
opens a socket restores it in an EXIT trap and re-verifies afterwards; check n3 fails on a single stray
`nc`.

**Docker Desktop publishes on every interface regardless of the daemon `ip` key.** Verified: dockerd
inside the VM honours `"ip": "127.0.0.1"` (binds `127.0.0.1:<port>` there), but Desktop's host-side proxy
re-publishes on `0.0.0.0`. Only an explicit per-port HostIp binds loopback, and the Supabase CLI has no
option for it — hence pf as the boundary, not the bind.

## Session-open ritual — terminal boot list

Empty-body / `{}` POST with a service-role bearer to each (the legacy JWT one — see Baselines above);
expect `400 company_id required` (or that terminal's own 4xx), never `503 Module not found`. A NEW function directory or `_shared` file is not
served until the stack is recreated (`source supabase/functions/.env.local` → `supabase stop` →
`supabase start`; volumes kept, NEVER `db reset`) — an operator-approved step, reported first.

- public-baseline (pair proof: with `x-internal-call` → 400, without → 401)
- gateway-resume-step · local-jobmap-synthesis · dify-analyze-file / analyze-file
- generate-step-opportunities · generate-step-conditions · generate-market-hypothesis
- feed-first-read-corrections · record-check-outcome
- record-interview-finding (gate 2, 2026-09-16 — the one write path for interview findings)
- record-interview-upload (gate B 2a, 2026-09-19)
- interview-parser (parser commit 3, 2026-09-22 — 400 `record_id required` on `{}`)

**Served code is not live on edit** (R46, 2026-09-21). The edge runtime's worker keeps the module it booted with:
an in-place edit of a served function (its `index.ts`/`handler.ts` or a `_shared` file it imports) is live only
after `docker restart supabase_edge_runtime_<project>` (no DB touch; volumes untouched) — or once the worker's
400 s wall clock recycles it, which is not a step to rely on. After the restart, the boot list above proves the
worker is up (400 on `{}`).

**Planted failures on served code** (R46): a plant in a served function counts as RED only when the run made
AFTER that `docker restart` shows it; restore the file (md5-identical), restart again, and the GREEN run is the
one after the second restart. A plant run without the restart proves nothing — it exercises the old module.

**The LOCAL PARSER obeys the same rule** (2026-11-13). `scripts/local-parser-server.mjs` runs as a plain
node process on 127.0.0.1:8789, so it too keeps the module it booted with: an edit is live only after the
process is restarted (`pkill -f local-parser-server` then `nohup node scripts/local-parser-server.mjs &`).
`ingest-partial-honesty-guard` check (p2) exists for this — it compares the SERVED `versions.server`
against the constant in the file and goes RED on a stale worker rather than quietly testing the old one.
Two further traps, both met on 2026-11-13: `scripts/plant.sh restore` REMOVES its saved copy, so a second
plant on the same file needs its own `save` first (otherwise `restore` answers `no saved copy` and the
plant stays in the tree); and because that `restore` failure short-circuits an `&&` chain, the old parser
is left listening and the replacement dies on `EADDRINUSE` — check the restart's log line, not just that
the command was issued.

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
