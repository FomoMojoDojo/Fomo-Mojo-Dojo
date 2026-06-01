# Codebase Audit — 2026-05-31

Read-only pass. No code was changed. Evidence: `tsc --noEmit` (clean), ESLint (3244 problems), Vitest (5 failures across 4 files), Explore agent analysis.

---

## Ranked Shortlist

### Quick wins (S effort, high leverage)

| # | Item | Why now |
|---|------|---------|
| QW1 | Fix 5 failing tests (Supabase auth / jsdom) | Masks real failures; every CI run is red |
| QW2 | `tailwind.config.ts` — remove `require()` call | Mix of ESM/CJS; `tsc` will flag this if strict module mode ever enabled |
| QW3 | `useStrategicDecisions.ts` — remove `supabase as any` cast | Bypasses all type safety on every DB call in that hook |
| QW4 | 8 empty catch blocks — add minimal re-throws or `console.error` | Silent failures are invisible in prod |
| QW5 | DB route count discrepancy (Cafe Barra: 11 DB vs 10 UI) | Correctness bug, may be hiding a route from the client |

### Larger refactors (M/L effort, meaningful but not urgent)

| # | Item | Why eventually |
|---|------|---------------|
| LR1 | Extract 7 near-identical "strategic*" hooks into one parameterized hook | ~70% duplication; each new strategic surface adds another copy |
| LR2 | Split 4 mega-files (4900 / 3460 / 3235 lines) | Editor performance, merge conflicts, cognitive load |
| LR3 | Systematic `any` → typed replacements (44 in src) | Type coverage is largely theater until these are real types |
| LR4 | Supabase jsdom test setup — add localStorage mock | Unblocks real unit testing of all hooks |

---

## Full Findings

### F01 — Test failures (Supabase auth / jsdom)
- **Category:** Correctness / test infra
- **Location:** 4 test files (identified by Vitest output); root cause in Supabase JS v2 auth client initializing with `localStorage` in jsdom
- **What it is:** Every test that imports a hook touching `supabase.auth` throws `storage.getItem is not a function` and fails. Currently 5 tests fail, 1343 pass — but the failing tests are in hooks that are widely reused.
- **Why it matters:** CI appears broken. Any real regression in auth-touching hooks is undetectable.
- **Fix direction:** Add a Vitest setup file that mocks `localStorage` before the Supabase client initializes (`vi.stubGlobal('localStorage', createLocalStorageMock())`), or configure Supabase client in test mode with `auth: { storage: new InMemoryStorage() }`.
- **Impact:** High — restores signal from test suite
- **Effort:** S
- **Risk:** Low — purely additive to test infra

---

### F02 — `supabase as any` in `useStrategicDecisions.ts`
- **Category:** Type safety
- **Location:** `src/hooks/useStrategicDecisions.ts`
- **What it is:** `const sb = supabase as any` then used for all DB calls in the hook. This suppresses every type error for that hook — wrong table names, wrong column names, wrong return shapes all pass silently.
- **Why it matters:** This hook is used on strategic decision paths. A silent column mismatch would return `undefined` data with no error.
- **Fix direction:** Identify the actual type mismatch (likely a generated type is out of date with the real table shape), fix the type or regenerate types with `supabase gen types typescript`.
- **Impact:** Medium
- **Effort:** S–M depending on how far the type mismatch goes
- **Risk:** Low — fixing a cast doesn't change runtime behavior

---

### F03 — 7 near-identical "strategic*" hooks
- **Category:** Duplication
- **Location:** `src/hooks/useStrategic*.ts` (7 files)
- **What it is:** Each hook fetches a single strategic surface (decisions, routes, opportunities, etc.) with nearly identical shape: `useEffect` → Supabase select → `setRows` → `setLoading`. Estimated 70%+ shared boilerplate.
- **Why it matters:** Every bug fix or pattern change (e.g., adding error handling, changing realtime subscription) must be applied 7 times. Each new surface becomes a copy-paste.
- **Fix direction:** Extract a `useSupabaseTable<T>(tableName, query, deps)` generic hook; each strategic hook becomes a 5-line wrapper that calls it with the right select string and filter.
- **Impact:** Medium — reduces ongoing maintenance cost
- **Effort:** M
- **Risk:** Medium — requires careful typing; test coverage thin

---

### F04 — 3 proposal handler variants
- **Category:** Duplication
- **Location:** `src/views/client/ClientRefinePreview*.tsx` (3 files)
- **What it is:** Propose / accept / reject cycle is implemented independently in each preview file with near-duplicate handler logic.
- **Why it matters:** Same as F03 — behavioral drift between surfaces over time.
- **Fix direction:** Extract a `useProposalHandlers(surfaceKey)` hook or a shared `ProposalActions` component.
- **Impact:** Low–Medium
- **Effort:** M
- **Risk:** Medium — touching proposal flow in multiple files

---

### F05 — 4 mega-files
- **Category:** Maintainability
- **Locations:**
  - `src/views/client/ClientRefinePreviewView.tsx` — 4903 lines
  - `src/views/JobSteps/index.tsx` — 3460 lines
  - `src/views/client/ClientRefinePreviewRoutesView.tsx` — 3235 lines
  - `src/views/client/ClientRefinePreviewWorkshopView.tsx` — 3242 lines
- **What it is:** Single files containing multiple page-level components, sub-components, and business logic. `JobSteps/index.tsx` alone contains `OdiNeedsListSection`, `OdiMarketDefinitionSection`, `JobStepCard`, need scoring sliders, and more.
- **Why it matters:** Merge conflicts are near-certain when two people touch the same area. Editor symbol lookup is slow. The 4903-line file regularly causes context-window pressure in AI-assisted editing sessions.
- **Fix direction:** Phased extraction: start with clearly bounded sub-components (e.g., `OdiNeedsListSection` from JobSteps, `PositioningOrgPanel` from WorkshopView into their own files under a `tabs/` or `panels/` subfolder).
- **Impact:** Medium — developer velocity
- **Effort:** L (4 files × significant extraction)
- **Risk:** Medium — no behavior change, but lots of import reshuffling

---

### F06 — 44 `any` usages in `src/`
- **Category:** Type safety
- **Location:** Spread across src — concentrated in view files and hooks that interact with Supabase join results
- **What it is:** `any` annotations, mostly at Supabase query return boundaries where the generated types don't match the actual select shape (e.g., joined tables return nested objects that the flat generated type doesn't describe).
- **Why it matters:** Each `any` is a type-erasure hole. Downstream code that consumes those values has no type checking.
- **Fix direction:** For Supabase join results, define explicit local interfaces that match the actual select shape. Use `satisfies` to keep the inferred type honest. Do NOT do a bulk `// @ts-ignore` sweep.
- **Impact:** Medium — correctness catches over time
- **Effort:** L (44 instances, many context-dependent)
- **Risk:** Low per instance, Medium in aggregate (some `any` may be masking real errors)

---

### F07 — `tailwind.config.ts` uses `require()`
- **Category:** Code quality / module hygiene
- **Location:** `tailwind.config.ts` line 1 (approx)
- **What it is:** ESM file with a CommonJS `require()` call. Works today because Vite/Node resolves it, but will break if the project ever enables `"type": "module"` in package.json or upgrades to a stricter Tailwind v4 config.
- **Fix direction:** Replace `require('tailwindcss/colors')` (or equivalent) with the ESM import equivalent.
- **Impact:** Low now, Medium if/when module mode changes
- **Effort:** S
- **Risk:** Very low

---

### F08 — 8 empty catch blocks
- **Category:** Error observability
- **Location:** Spread across hooks and views (identified by Explore agent)
- **What it is:** `catch (e) {}` — errors swallowed silently.
- **Why it matters:** A network error, a Supabase permission error, or a parse failure disappears completely. No Sentry, no console, no user feedback.
- **Fix direction:** Add `console.error(e)` at minimum; for user-visible operations, surface a toast or set an error state.
- **Impact:** Medium — operational visibility
- **Effort:** S (can be done file-by-file)
- **Risk:** Very low

---

### F09 — DB route count discrepancy (Cafe Barra)
- **Category:** Correctness bug
- **Location:** `src/hooks/useRoutes.ts` (client-side filter) vs `routes` table
- **What it is:** Cafe Barra has 11 route rows in the DB (`level='route'`), but the UI shows 10. The `useRoutes` hook applies additional client-side filtering (possibly `status !== 'archived'` or `is_published = true`) that excludes one row.
- **Why it matters:** If a route is missing from the client view due to an inadvertent filter rather than a deliberate editorial decision, the client is seeing an incomplete strategy.
- **Fix direction:** Run `SELECT id, label, status, is_published FROM routes WHERE company_id = <cafe_barra_id>` and compare against what `useRoutes` returns. Identify the excluded row and decide: is its exclusion correct?
- **Impact:** High if the missing route is substantive; Low if it's a draft/archived row
- **Effort:** S to diagnose
- **Risk:** Very low (read-only investigation)

---

### F10 — `dangerouslySetInnerHTML` — 5 occurrences (documented safe)
- **Category:** Security (reviewed, not a finding)
- **Location:** `SurfaceEducationPanel.tsx` (section_b), plus 4 others
- **What it is:** All 5 uses render operator-controlled static HTML. No user input reaches any of these fields. The `section_b_content` field in particular is loaded by the operator from a controlled source file.
- **Status:** Safe as implemented. Flagged here only for awareness — any future path that allows user-submitted content to reach these fields must be sanitized.

---

## Looks Healthy

- **TypeScript compilation:** Clean exit 0. No suppressed errors in tsconfig. Good baseline.
- **No orphaned files detected:** All components appear reachable from at least one view.
- **26 `console.warn/error` calls:** Appropriate distribution — mostly in error handlers and dev-mode guards (e.g., `surfaceSlots` slot-miss warn). Not console-log spam.
- **Dependency choices:** React 18 + Vite 5 + TanStack Query v5 + Supabase JS v2 — all current, no abandoned libraries.
- **`supabase/types.ts`** (3344 lines): Generated file, not hand-maintained. Long but correct by construction. Leave it alone.
- **`dangerouslySetInnerHTML` in `SurfaceEducationPanel`:** Reviewed and safe (see F10).
- **`resolveSurfaceSlots` fallback:** Fixed in current session — returns `""` on slot-miss with dev-only warn. Correct.
- **Radix UI usage:** Appears used for Sheet, Dialog, Tooltip. No redundant UI library layering detected.
- **Framer Motion:** Used for animations in specific panels. Not imported globally; no perf concern flagged.
