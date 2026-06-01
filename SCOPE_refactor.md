# SCOPE_refactor.md — Identity/Route-Language Refactor
**Generated:** 2026-06-01  
**Branch:** `strategic-object-graph`  
**Status:** Read-only investigation. No changes made.

---

## 1 — Working-Tree Inventory

### Provenance hints (not proof of intent)
- `git log --follow src/lib/identityNarrative.ts` and `src/lib/routeLanguage.ts` both return a single commit: `0eecc25 Build strategic narrative layers in Refine Preview`. **Neither file has been modified in any committed revision since introduction.** The working-tree changes are entirely uncommitted.
- `git stash list`: empty — nothing stashed.
- `git reflog -20`: 20 entries, all `commit` or `reset: moving to HEAD`. No `stash apply`, no `cherry-pick`, no `merge`. The branch has had clean linear commits. There is no evidence of a stash-apply or cross-branch pull.
- **Implication:** the working-tree changes were applied directly without intermediary stash/merge operations. No branch-provenance hints.

### Categorized file inventory

The working tree has **120 modified files** and **~90 untracked files/directories**. The table below covers only source + test files — launch-site Next.js build artifacts and `supabase/.temp/` are omitted as build noise.

#### (i) Identity/route-language refactor — directly modified

| File | Diff lines | Role in refactor |
|------|-----------|-----------------|
| `src/lib/identityNarrative.ts` | 153 ± | **Core** — removed keyword-matching, replaced with label-pass-through |
| `src/lib/identityNarrative.test.ts` | 74 ± | Test updated to new behavior |
| `src/lib/routeLanguage.ts` | 80 removed | **Core** — removed 10 domain-specific (nonprofit/donor) rewrite blocks |
| `src/lib/routeRationale.ts` | 90 ± | Wording changes + new exported `deriveWhyLeading` function |
| `src/lib/routeRationale.test.ts` | 6 ± | Partially updated (readiness strings updated; identity string stale) |
| `src/lib/refinePreviewConfidenceLandscape.ts` | 4 ± | Wording updates that consume the changed identityNarrative output |

`reconciliationNarrative.ts` is a consumer of `inferIdentityNarrative` but is **not modified** — its tests fail because the output it receives changed.

#### (ii) Section_b / educational-layer work

**None present in working tree.** All J9+ educational layer work (`SurfaceEducationPanel.tsx`, `useSurfaceEducation.ts`, `surfaceSlots.ts`, etc.) was committed in `909893a`. The working tree contains no section_b files.

#### (iii) Other / unexplained changes

This is a large set. Brief characterization:

| File(s) | Assessment |
|---------|-----------|
| `src/lib/strategicObject.ts`, `src/lib/strategicHypothesisDomain.ts`, `src/lib/types.ts`, `src/lib/evidenceDomain.ts`, `src/lib/nextBestMove.ts` | Core domain model expansion — appear related to strategic objects/decisions system (new untracked modules: `strategicObjects.ts`, `tensionDerivation.ts`, `decisionSystem.ts`, etc.) |
| `src/lib/refinePreviewPhaseOrchestration.ts` (112 ±), `src/lib/refinePreviewMovement.ts` | Orchestration refactor within Refine Preview |
| `src/lib/jtbdProcess.ts`, `src/lib/jtbdProcess.test.ts` (65 added) | JTBD process expansion |
| `src/lib/routeHypothesisLinking.ts`, `src/lib/routeHypothesisLinking.test.ts` | Route hypothesis linking additions |
| `src/lib/areaMapping.ts`, `src/lib/clientRefinePreview.ts`, `src/lib/scoring/inputImpact.ts`, `src/lib/scoring/mojoScore.ts` | Score/area mapping updates |
| `src/lib/humanizeOdiStatement.ts` + test | **DELETED** — removed from committed state |
| `src/views/Positioning/index.tsx` (543 ±), `src/views/Strategy/index.tsx` (545 ±), `src/views/Routes/index.tsx` (283 ±), `src/views/Inputs/index.tsx` (269 ±) | Large view rewrites — not explained by the identity refactor alone |
| `src/views/client/workshop/tabs/CouncilPanel.tsx` (522 ±), `InputsTab.tsx` (532 ±), `StrategyOrgPanel.tsx` (539 ±) | Workshop tab expansions |
| `src/hooks/useInputs.ts` (177 ±), `useStrategicChangeSummary.ts` (113 ±), `usePositioningCanvas.ts` (64 ±), `useStrategyCascade.ts` (33 ±)` | Hook expansions |
| `src/components/layout/PageContextStatus.tsx` (190 ±), `src/components/score/ScoreContextBar.tsx` (174 ±), `src/components/journey/StrategyPhaseStrip.tsx` (246 ±) | UI component rewrites |
| `supabase/functions/*` | Edge function updates including `run-framework-diagnosis`, `public-baseline`, `local-jobmap-synthesis`, `propose-positioning-changes`, etc. |
| `src/App.tsx` (36 ±), `src/index.css` (11 +), `src/styles/client-refine-preview.css` (73 +) | Routing and styling additions |
| `package.json` (6 ±), `supabase/config.toml` (6 +) | Config updates |
| `.tmp_*`, `debug-*.cjs`, `probe-fiber.cjs` (untracked) | Debug/investigation scripts — temporary |
| `docs/` (untracked, multiple files) | Documentation added outside of commits |

**Verdict on (iii):** The vast majority of the working tree represents a separate, much larger in-progress body of work (strategic objects, decisions, tensions, new MojoScore system, view rewrites, edge function updates). It is significantly larger than the identity/route-language refactor. None of it appears related to either the identity refactor or the section_b work.

---

## 2 — Refactor Behavior

### 2a — `identityNarrative.ts` — Full behavior change

**Old behavior:** `inferPublicIdentity(text, center)` matched the raw narrative text of hypothesis claims against keyword patterns:
- Any text containing `specialty coffee`, `craft`, `roast`, `roaster`, `artisanal`, `small-batch` → returned `"A craft-focused specialty coffee roaster"` (hardcoded)
- Any text containing `first responder`, `donor`, `fundraising`, `endowment`, `wellness` → returned `"A premium responder-support organization"` (hardcoded)
- Any text containing `counterintuitive`, `guidance`, `path selection` → returned `"A strategic guidance system"` (hardcoded)
- Fallback: pattern-matched `center.publicContextLabel` against known phrases and returned a hardcoded mapping

`inferStrategicIdentity(organizationText, center)` worked identically — scanned org-band claim text for operator/reliability keywords and returned hardcoded strings like `"An operational partner for cafe operators, centered on reliability and lower operator burden"`.

**New behavior:** Both functions take only `center: StrategicCenter | null`:
- `inferPublicIdentity(center)` → `"A company publicly known for ${center.publicContextLabel}"` if non-null, else `null`
- `inferStrategicIdentity(center)` → `"A company increasingly centered on ${center.label}"` if non-null, else `null`
- `publicDescriptor` and `strategicDescriptor` are now just raw `center.publicContextLabel` and `center.label` (no keyword-to-descriptor mapping)
- `inferCustomerIdentity` retained but slightly narrowed (removed `"operator burden"` and `"support"` from reliability keywords; narrowed craft check)
- `routeNarrativeText` function removed — route seeds no longer contribute to identity derivation

**New comments in source:** `// Derives public identity from the company's own public-context label. // Never emits a canned reference-company identity string.` — explicitly documents the intent.

**Degradation when `publicContextLabel` is null/empty:**
```
inferPublicIdentity(null or empty center) → null
```
`describePublicPerspective` in `reconciliationNarrative.ts` then falls through in order to:
1. `publicLabel` (from `center.publicContextLabel || conflict.outsideLabel || formatThemeLabels(...)`)
2. `publicCandidate.statement`
3. `"A company whose public story is still too thin to read clearly"`
No broken output — degrades through multiple fallback layers.

**Callers and ripple analysis:**

| Caller | How it uses identity | Impact of new behavior |
|--------|---------------------|----------------------|
| `reconciliationNarrative.ts:279` | Passes `publicIdentity` and `strategicIdentity` to `describePublicPerspective` / `describeStrategicDirection` | Changed output text. Functions fall through to `publicLabel` if identity is null — still works. |
| `routeRationale.ts:662,807,818` | Uses `identityNarrative.publicIdentity` for `"Outside perception reads as X"` sentence | Changed text. `|| strategicCenter.publicContextLabel` fallback is in place. |
| `refinePreviewConfidenceLandscape.ts:246` | Uses `publicIdentity` for alignment narrative in `strategicAlignment()` | Changed text. `|| center.publicContextLabel` fallback is in place. |
| `ClientRefinePreviewView.tsx:1102,1548,3052` | `useMemo` calls `inferIdentityNarrative`; renders `"Outside perception reads as ${lowerFirst(identityNarrative.publicIdentity)}"` | Changed UI text. Conditional render guards against null (`identityNarrative.publicIdentity ?`). |

No caller is broken — all have fallbacks or null-guards. The change is behavioral (text changes), not structural.

---

### 2b — `routeLanguage.ts` — Behavior change

**Removed:** 10 regex-pattern rewrite blocks for nonprofit/donor-specific route language:
- `grant application | application requirements` → "Reduce responder delay caused by unclear grant requirements"
- `data-driven allocation | allocation insights | future funding priorities` → "Make future funding decisions easier to defend"
- `usage and impact | impact tracking | monitoring systems | funded equipment` → "Make funded impact visible before donor confidence drifts"
- `fund distribution | allocation records | distribution transparency` → "Protect donor trust with clearer fund allocation proof"
- `funding review | review and approve | county chiefs | support delivery` → "Shorten the gap between responder need and funding response"
- `first responder engagement | resource utilization | mental wellness programs` → "Reduce drop-off between funded support and responder use"
- `rapid needs communication | urgent equipment | urgent.*needs` → "Shorten the gap between urgent need and visible response"
- `feedback frequency | changing support needs | agencies` → "Keep support priorities aligned with changing responder needs"
- `funding cycle reporting | donors and stakeholders | long-term impact` (or `governance | community participation | donor willingness` in hypothesis) → "Reduce donor uncertainty around long-term impact visibility"
- `mental wellness impact metrics | effectiveness of mental health support` → "Make mental wellness impact visible enough to sustain support"

**Retained:** All coffee/cafe-oriented patterns (repeat-purchase, POS, supplier agreements, pricing, staff prep) and generic marketing/brand patterns remain.

**What a nonprofit/donor route renders as now vs before:**

| Input title | Before (rewrite) | After (pass-through) |
|------------|-----------------|---------------------|
| "Strengthen Funding Cycle Reporting" | "Reduce donor uncertainty around long-term impact visibility" | "Strengthen Funding Cycle Reporting" *(original, unchanged)* |
| "Improve Grant Application Clarity" | "Reduce responder delay caused by unclear grant requirements" | "Improve Grant Application Clarity" *(original, unchanged)* |

There is **no general replacement** for the removed patterns. Routes that previously matched these domain-specific blocks now fall through `buildTemplate` entirely (returns `null`), and `rewriteRouteLanguage` then uses `fallbackDescription` (based on `opportunityOutcome`) or preserves the original title unchanged.

**Runtime callers:**

| Caller | Location | Impact |
|--------|----------|--------|
| `research-company` edge function | `supabase/functions/research-company/index.ts:7059` | Imports directly from `../../../src/lib/routeLanguage.ts`. **Uses the same on-disk file.** When this edge function processes a nonprofit company, routes will now get their original AI-generated titles instead of the removed domain-specific rewrites. |
| `scripts/backfill-route-language.mjs:250` | Untracked script | Also imports from the same source file. Same impact. |
| React app | None | `rewriteRouteLanguage` has no direct runtime callers in the React app itself. |

---

## 3 — Test Consistency (Full Set)

Anchors searched: `"craft-focused specialty coffee roaster"`, `"cafe operators"`, `"Reduce donor uncertainty around long-term impact visibility"`, `"funding cycle reporting"`, `"donors and stakeholders"`, `"long-term impact"`.

### Full table

| Test name | File:line | Current state | Assertions on old behavior | Failing now? |
|-----------|----------|--------------|--------------------------|-------------|
| "derives public and strategic identity from the company's own center data" | `identityNarrative.test.ts:100` | **Updated to new** | `.toBe("A company publicly known for craft quality and specialty coffee")`, `.not.toContain("cafe operators")` (×3) | No — passes |
| "returns null identities when no center data is available" | `identityNarrative.test.ts:140` | **New test** | `.toBeNull()` for all four fields | No — passes |
| "does not emit reference-company strings when text contains trigger words from other companies" | `identityNarrative.test.ts:160` | **New test** | `.not.toContain("cafe operators")`, `.not.toContain("specialty coffee roaster")`, `.not.toContain("responder")` | No — passes |
| "surfaces public versus strategic divergence in diagnose" | `reconciliationNarrative.test.ts:147` | **Old behavior** | Line 149: `.toBe("A craft-focused specialty coffee roaster")` **[FAILS]**; Line 150: `.toContain("operational partner for cafe operators")` **[LATENT — masked by 149 failure]** | **Yes (line 149)** |
| "renders when strategic emphasis differs even without a hard contradiction" | `reconciliationNarrative.test.ts:272` | **Old behavior** | Line 283: `.toBe("A craft-focused specialty coffee roaster")` **[FAILS]**; Line 284: `.toContain("operational partner for cafe operators")` **[LATENT — masked by 283 failure]** | **Yes (line 283)** |
| "preserves recognizable public identity language when alignment is diverging" | `refinePreviewConfidenceLandscape.test.ts:249` | **Old behavior** | Line 259: `.toContain("publicly the company still reads as a craft-focused specialty coffee roaster")` **[FAILS]** | **Yes** |
| "rewrites donor-impact routes into trust and visibility language" | `routeLanguage.test.ts:39` | **Old behavior** | Line 55: `.toBe("Reduce donor uncertainty around long-term impact visibility")` **[FAILS]**; Line 56: `.toContain("future support depends less on trust alone")` **[LATENT — masked by 55 failure]** | **Yes (line 55)** |
| "lets diagnose favor strategic direction over public descriptors when both exist" | `routeRationale.test.ts:254` | **Partially updated** | Line 284 (whyThisRouteExists): correct new wording ✓; Line 287: `.toContain("Outside perception reads as a craft-focused specialty coffee roaster")` **[FAILS — wording updated but identity string stale]** | **Yes (line 287)** |
| "basic rationale is built from route and hypotheses" | `routeRationale.test.ts:95` | **Updated to new** | `.toBe("Confidence has built enough to validate. Not yet safe to commit.")` (new readiness string) | No — passes |
| "readiness Investigate" | `routeRationale.test.ts:~440` | **Updated to new** | `.toBe("Worth examining further. Not enough has formed yet to narrow direction.")` (new readiness string) | No — passes |
| jtbdProcess tests mentioning "cafe operators" | `jtbdProcess.test.ts:59,73,89` | **Not affected** | These are input *fixture* strings (job executor descriptions), not assertions about identity output | No — passes |

### Latent failures (currently passing, would surface if their masked predecessors were fixed)

| Masked assertion | File:line | What it asserts | Why it's currently hidden |
|-----------------|----------|----------------|--------------------------|
| `strategicDirection.toLowerCase().toContain("operational partner for cafe operators")` | `reconciliationNarrative.test.ts:150` | Old strategic identity string | Test stops at line 149 failure |
| `strategicDirection.toLowerCase().toContain("operational partner for cafe operators")` | `reconciliationNarrative.test.ts:284` | Old strategic identity string | Test stops at line 283 failure |
| `shortDescription.toContain("future support depends less on trust alone")` | `routeLanguage.test.ts:56` | Old rewrite shortDescription | Test stops at line 55 failure |

**Total assertions on old behavior:** 5 active failures + 3 latent failures = **8 assertions to update** (across 5 tests in 4 files).

---

## 4 — Correctness Checks

### 4a — `identityNarrative.ts`: degradation when `publicContextLabel` is null or thin

**Trace when `center` is null or `center.publicContextLabel` is null/empty:**

```
inferPublicIdentity(null)
  publicLabel = clean(null || null) = ""
  → returns null

describePublicPerspective({ publicIdentity: null, publicLabel, publicCandidate })
  └─ falls to: const phrase = clean(publicLabel || formatThemeLabels(publicCandidate?.themeLabels ?? []))
     └─ if phrase: returns "A company still publicly associated with {phrase}"
     └─ elif publicCandidate.statement: returns "A company still publicly read through {statement}"
     └─ else: returns "A company whose public story is still too thin to read clearly"
```

**Verdict:** Degrades gracefully through three fallback levels. No null/undefined passed to UI. No broken output.

**Edge case — `publicContextLabel` is a very thin label (e.g., just "coffee"):**
```
inferPublicIdentity(center with publicContextLabel="coffee")
  → returns "A company publicly known for coffee"
```
Grammatically valid; slightly thin but not broken. The old keyword-match would have returned `"A craft-focused specialty coffee roaster"` for the same input (text contained "coffee"). The new output is less specific.

### 4b — `routeLanguage.ts`: what a nonprofit/donor route now produces

**Input (test fixture from `routeLanguage.test.ts:39`):**
```
category: "improve"
title: "Strengthen Funding Cycle Reporting"
shortDescription: "Improve clarity and completeness of funding cycle reports shared with donors and stakeholders..."
whyThisMatters: [same string]
linkedHypotheses: [{ statement: "Donor willingness may depend on visible governance and community participation." }]
```

**Before (removed pattern matched):**
```
buildTemplate → matched /funding cycle reporting|donors and stakeholders|long-term impact/
→ title: "Reduce donor uncertainty around long-term impact visibility"
→ shortDescription: "Make ongoing impact easier to see so future support depends less on trust alone."
→ whyHint: "This route matters if donor confidence depends on seeing impact clearly over time, not just hearing about it."
```

**After (no pattern matches):**
```
buildTemplate → no pattern matches → returns null
rewriteRouteLanguage → template is null
  → qualityAfter = classifyRouteQuality(input)
  → shortDescription = fallbackDescription(input) 
       = "This path is worth testing if it changes [opportunityOutcome]"
       (opportunityOutcome is undefined in this case → returns "")
  → falls to: clean(input.shortDescription) 
       = "Improve clarity and completeness of funding cycle reports..."
  → title: input.title = "Strengthen Funding Cycle Reporting" (unchanged)
```

**There is no general replacement.** Nonprofit/donor route titles now pass through unchanged. The `research-company` edge function (which imports `routeLanguage.ts` directly) will produce unmodified AI-generated titles for nonprofit companies where it previously produced the specific rewritten versions.

---

## 5 — Is This Refactor Complete?

**Short answer: No.** The source changes are internally consistent but 4 test files were not updated to match.

### Source changes — complete as-is

The following are internally consistent and require no additional source edits to be self-consistent:
- `identityNarrative.ts` — fully replaced, no dead code, comment documents intent
- `routeLanguage.ts` — cleanly removed 10 blocks, no partial removal
- `routeRationale.ts` — wording changes and new `deriveWhyLeading` function are complete
- `refinePreviewConfidenceLandscape.ts` — 4-line wording change is complete

### Test changes required to finish the refactor cleanly

**File 1: `src/lib/reconciliationNarrative.test.ts`** (4 assertions)

| Line | Old assertion | What to update to |
|------|-------------|-----------------|
| 149 | `.toBe("A craft-focused specialty coffee roaster")` | New: `"A company publicly known for craft quality and specialty coffee"` (derived from `publicLabelForTheme("craft_quality")` = `"craft quality and specialty coffee"` → wrapped as `"A company publicly known for [label]"`) |
| 150 | `.toContain("operational partner for cafe operators")` | New: `describeStrategicDirection` now returns `strategicIdentity = "A company increasingly centered on [center.label]"`. The `center.label` for org claim text about "partner operational outcomes" would be `"partner operational outcomes"`. So the assertion becomes `.toContain("partner operational outcomes")` |
| 283 | Same as 149 | Same update |
| 284 | Same as 150 | Same update |

**File 2: `src/lib/refinePreviewConfidenceLandscape.test.ts`** (1 assertion)

| Line | Old assertion | What to update to |
|------|-------------|-----------------|
| 259 | `.toContain("publicly the company still reads as a craft-focused specialty coffee roaster")` | New: `"publicly the company still reads as a company publicly known for craft quality and specialty coffee"` (the `toLowerCase()` of the new `publicIdentity` string is lowercased after the first character by the regex substitution in `refinePreviewConfidenceLandscape.ts:273`) |

**File 3: `src/lib/routeLanguage.test.ts`** (2 assertions in 1 test)

| Lines | Old test | What to update to |
|-------|---------|-----------------|
| 39–56 | "rewrites donor-impact routes into trust and visibility language" | The rewrite no longer exists. Options: (a) Remove the test entirely, or (b) replace with a test documenting the pass-through behavior: `expect(rewritten.title).toBe("Strengthen Funding Cycle Reporting")` (original preserved unchanged) |

**File 4: `src/lib/routeRationale.test.ts`** (1 assertion)

| Line | Old assertion | What to update to |
|------|-------------|-----------------|
| 287 | `.toContain("Outside perception reads as a craft-focused specialty coffee roaster")` | New: `.toContain("Outside perception reads as a company publicly known for craft quality and specialty coffee")` (the `lowerFirst()` applied to `"A company publicly known for..."` gives `"a company publicly known for craft quality and specialty coffee"`) |

### Total finishing work
- 4 test files
- 8 assertions (7 updates, 1 test to rewrite or remove)
- 0 source files require changes

### Open question flagged for your decision
`supabase/functions/research-company/index.ts` imports `routeLanguage.ts` directly. With the donor-route patterns removed, any nonprofit company processed by that edge function will now receive unmodified AI-generated route titles. Whether that is the intended behavior for the edge function is not determinable from static analysis.
