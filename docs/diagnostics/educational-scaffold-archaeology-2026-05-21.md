# ONB2 — Educational Scaffold Archaeology
**Date:** 2026-05-21  
**Branch:** strategic-object-graph  
**Scope:** Read-only. Documents what the three named admin-nav scaffolds actually contain, and what cross-cutting educational affordances exist elsewhere in the codebase.

---

## Summary (for scoping chat)

The three named scaffolds diverge from each other and from the brief's element #5. **Methodology Pages** is the most relevant: a CMS-backed authoring system with a 5-section structure per page ("What This Is," "The Process," "What You'll Get," "Why It Matters," "What Happens Next") that approximates the brief's two-part educational structure. But it requires operator authoring from scratch (no content exists unless seeded), surfaces only from MapView admin mode via a text button, and has no client access path. **Onboarding Map Editor** is the founder's self-management operating tool — a singleton "how we run our consulting practice" map — not a per-section educational layer. **Signal Map** is an experimental navigation-metaphor data visualization that reads live route data; it contains no authored educational content. The closest existing per-section educational pattern elsewhere in the codebase is `AiBoundaryNote` — a small contextual note component that already appears on 5 admin pages to explain AI provenance — but it has no toggle, no teaching mode, and no client visibility.

---

## 1. Orientation: Nav Structure

All three scaffolds are in the `adminToolingItems` section of TopNav ([src/components/layout/TopNav.tsx:109-120](src/components/layout/TopNav.tsx#L109)):

```typescript
const adminItems: NavItem[] = [
  { label: "Methodology Pages", path: "/admin", icon: Shield },
  { label: "Company Pages", path: "/admin/companies", icon: Building2 },
];

const adminToolingItems: NavItem[] = [
  { label: "Landing Page", path: "/landing-page", icon: Globe, adminOnly: true },
  { label: "Client View Audit", path: CLIENT_VIEW_VISIBILITY_AUDIT_ROUTE, icon: BarChart3, adminOnly: true },
  { label: "Client Onboarding MojoMap", path: CLIENT_ONBOARDING_MOJOMAP_ROUTE, icon: Compass, adminOnly: true },
  { label: "Onboarding Map Editor", path: CLIENT_ONBOARDING_MOJOMAP_EDITOR_ROUTE, icon: FilePenLine, adminOnly: true },
  { label: "Signal Map", path: "/map-signal-prototype", icon: Map, adminOnly: true },
};
```

**Note:** "Methodology Pages" is in `adminItems`, not `adminToolingItems`. "Client Onboarding MojoMap" (viewer) and "Onboarding Map Editor" are two entries for the same underlying artifact.

Route guards in App.tsx ([src/App.tsx:237-257](src/App.tsx#L237)):
- `/admin`, `/admin/new`, `/admin/edit/:id` → `AdminModeRoute`
- `/process/:slug` → `InternalViewOnlyRoute`
- `/resources/client-onboarding-mojomap` and `/edit` → `AdminGuard`
- `/map-signal-prototype` → `InternalViewOnlyRoute`

---

## 2. Methodology Pages

### File map

| File | Role |
|------|------|
| [src/pages/AdminDashboard.tsx](src/pages/AdminDashboard.tsx) | CMS list view — `/admin` |
| [src/pages/AdminPageEditor.tsx](src/pages/AdminPageEditor.tsx) | Create/edit page — `/admin/new`, `/admin/edit/:id` |
| [src/pages/MethodologyPage.tsx](src/pages/MethodologyPage.tsx) | Full-page read view — `/process/:slug` |
| [src/components/methodology/MethodologyContent.tsx](src/components/methodology/MethodologyContent.tsx) | Shared renderer (used by both full page and panel) |
| [src/components/methodology/MethodologyPanel.tsx](src/components/methodology/MethodologyPanel.tsx) | 560px slide-in panel, triggered from MapView admin mode |

### Data source

Table: `methodology_pages`

Full schema (from `src/integrations/supabase/types.ts:1319`):

```typescript
{
  id: string,
  slug: string,
  page_number: string,
  page_title: string,
  phase: string,               // "foundation" | "strategy" | "execution" | "ongoing"
  hero_subtitle: string,
  hero_description: string,
  impact_score: string,        // e.g. "+12" — displayed as Mojo Score Impact
  score_detail: string,
  process_steps: Json,         // Array<{ icon: string; label: string }>
  section1_title: string,
  section1_content: string,    // Rich HTML via RichTextEditor
  section2_title: string,
  section2_content: string,
  section3_title: string,
  section3_content: string,
  section4_title: string,
  section4_content: string,
  section5_title: string,
  section5_content: string,
  sort_order: number,
  is_published: boolean,
  created_at: string,
  updated_at: string,
}
```

### Default section titles (AdminPageEditor.tsx:42-53)

```typescript
const EMPTY: PageForm = {
  section1_title: 'What This Is',
  section2_title: 'The Process',
  section3_title: "What You'll Get",
  section4_title: 'Why It Matters',
  section5_title: 'What Happens Next',
  // ...
};
```

Sections only render in MethodologyContent when `content` is non-empty (`.filter(s => s.content)`, line 48).

### What MethodologyContent renders ([src/components/methodology/MethodologyContent.tsx](src/components/methodology/MethodologyContent.tsx))

1. **Hero card** — `page_title` (h1), `hero_subtitle` (eyebrow mono), `hero_description` (prose), `impact_score` (large coral numeral labeled "Mojo Score Impact"), `score_detail` (secondary prose block)
2. **Process steps** — horizontal icon+label grid (2-col compact, 4-col full)
3. **Content sections 01-05** — numbered amber circle + section title (h2) + rich HTML prose

### MethodologyPanel trigger and behavior

Triggered from MapView admin mode only — a small `"Methodology →"` text button at the bottom-right of MapView ([src/views/MapView/index.tsx:831](src/views/MapView/index.tsx#L831)):

```tsx
<button onClick={() => setProcessOpen(true)} ...>
  Methodology →
</button>
<MethodologyPanel open={processOpen} onClose={() => setProcessOpen(false)} />
```

Panel behavior:
- **Index view**: lists all published pages grouped by phase (foundation/strategy/execution/ongoing), each as a clickable button
- **Detail view**: renders `MethodologyContent` in `compact` mode (no large impact score, smaller text)
- ESC key: from detail view → back to index; from index → close panel
- Header shows "Our Process" on index, page title on detail

### Audience gating

- `/admin`, `/admin/new|edit` — `AdminModeRoute` — admin only
- `/process/:slug` — `InternalViewOnlyRoute` — admin + internal users (not client-mode)
- `MethodologyPanel` is only mounted on the admin-mode MapView — clients never see it
- The `is_published` flag is required for pages to appear in either the panel or `/process/:slug`

### Current content state

The system is a **blank CMS** — no methodology pages exist in the DB unless the operator has authored them. The `AdminDashboard` shows "No methodology pages yet." if the table is empty.

---

## 3. Onboarding Map Editor

### File map

| File | Role |
|------|------|
| [src/pages/ClientOnboardingMojoMapEditor.tsx](src/pages/ClientOnboardingMojoMapEditor.tsx) (1777 lines) | Full editor — `/resources/client-onboarding-mojomap/edit` |
| [src/pages/ClientOnboardingMojoMap.tsx](src/pages/ClientOnboardingMojoMap.tsx) (946 lines) | Read/view — `/resources/client-onboarding-mojomap` |
| [src/lib/clientOnboardingMojoMapConfig.ts](src/lib/clientOnboardingMojoMapConfig.ts) (715 lines) | Type definitions + default config + normalization |
| [src/lib/clientOnboardingMojoMapApi.ts](src/lib/clientOnboardingMojoMapApi.ts) | API client — calls `maps` edge function |
| [src/hooks/useClientOnboardingMojoMap.ts](src/hooks/useClientOnboardingMojoMap.ts) | React hook wrapping fetch/save |

### What this edits

A **singleton operator-level map** — NOT a per-company artifact. It represents the founder's own operating system for running client onboarding engagements. One map total, keyed `"client-onboarding-mojomap"`.

Persistence: `mojo_maps` table via `maps` edge function (`supabase/functions/maps/index.ts`):

```typescript
// mojo_maps table schema:
{
  id: string,           // e.g. "client-onboarding-mojomap"
  map_json: Json,       // operator-edited overrides
  seed_json: Json,      // base defaults for reset
  updated_at: string,
  updated_by: string | null,
}
```

The `maps` edge function supports `op: "get" | "put" | "reset"`. On `get`, it merges `seed_json` with `map_json` through the normalizer. On `reset`, it restores the seed.

### Default config (verbatim from `BASE_CLIENT_ONBOARDING_MOJOMAP_CONFIG`, lines 113-427)

```
name: "Client Onboarding MojoMap"
type: "internal-operating-map"
description: "Founder map for running client onboarding as a repeatable system"
purpose: "Founder map for running client onboarding as a repeatable system."
centerOutcome: "Take a client from we're stuck to a working MojoMap that drives real decisions within 6-8 weeks."

Layers (5):
  1. "What They Think Is Going On"
     purpose: "Understand how the client sees the problem."
     summary: "Capture what they think is wrong before validating what is actually true."
     content: ["What do they think is wrong?", "What outcome do they want?", "Where do they feel stuck?", "What decisions are hard right now?"]
     suggestedInputs: ["Pre-diagnosis survey", "First conversation", "Key stakeholder calls"]
     outputs: ["Initial problem framing"]
     risk: "Solving the wrong problem"
     status: in_progress

  2. "What's Actually Going On"
     purpose: "Replace assumptions with truth."
     summary: "Build a shared understanding of what is actually happening."
     content: ["Misalignment between leaders", "Lack of real customer evidence", "Too many priorities", "Broken decision patterns", "Hidden constraints"]
     suggestedInputs: ["Customer interviews (SDS / JTBD)", "Internal interviews", "Strategy + initiative review"]
     outputs: ["Shared reality"]
     status: in_progress

  3. "Where to Focus"
     purpose: "Turn reality into clear focus."
     summary: "Translate what is true into one clear problem to solve first."
     content: ["What to fix", "What to improve", "What to create", "What matters most"]
     outputs: ["One clear problem"]
     status: planned

  4. "What We're Going to Do"
     purpose: "Make clear decisions."
     summary: "Create one clear direction the team can execute."
     content: ["The problem we're solving", "What we're not doing", "The highest-leverage moves", "Trade-offs"]
     outputs: ["Clarity"]
     status: planned

  5. "Make It Move"
     purpose: "Turn clarity into momentum."
     summary: "Translate decisions into execution, ownership, and cadence."
     content: ["First moves", "Who owns what", "What success looks like", "How we track progress"]
     outputs: ["Momentum"]
     status: planned

Primary constraint:
  title: "The team does not have a shared, evidence-based view of what matters most"
  description: "The team does not yet have a shared and validated view of the primary problem and the highest-leverage path forward."
  role: "This is the bottleneck the onboarding system is built to resolve."
  whyItMatters: "If this is not solved, nothing else sticks."
  symptoms: ["Priorities keep changing", "Decisions take too long", "Teams aren't aligned", "Confidence is low"]
  severity: high, priority: highest

Continuous update cadence: "Quarterly, with weekly decision review"

Health score: 64 ("Emerging")
  Problem Clarity: 72
  Evidence Quality: 64
  Owner Alignment: 58
  Constraint Visibility: 70
  Activation Readiness: 62
  Repeatability: 55
  topLifts: ["Better pre-diagnosis inputs", "Faster constraint identification", "Clearer activation system"]

Action groups:
  Fix:
    - "Improve pre-diagnosis quality" (impact 8, now, customer_truth)
    - "Tighten first-call hypothesis" (impact 6, next, customer_truth)
    - "Reduce ambiguity in stated client problem" (impact 8, next, opportunity_landscape)
  Improve:
    - "Speed up constraint identification" (impact 8, now, reality)
    - "Standardize interview synthesis" (impact 6, next, reality)
    - "Improve workshop clarity" (impact 6, next, decision_system)
  Create:
    - "Productize onboarding templates" (impact 8, next, activation)
    - "Automate map scaffolding" (impact 6, later, activation)
    - "Add AI-assisted synthesis for inputs" (impact 8, later, reality)
```

### Editor structure ([src/pages/ClientOnboardingMojoMapEditor.tsx](src/pages/ClientOnboardingMojoMapEditor.tsx))

Seven tabs (line 51-59):

```typescript
const EDITOR_SECTIONS = [
  "metadata",    // name, description, status, ownership, purpose
  "outcome",     // centerOutcome, outcome.title/description/targetMetric/targetDate
  "layers",      // Accordion: one AccordionItem per layer, full layer CRUD
  "constraint",  // title, description, role, whyItMatters, symptoms, priority, severity, expectedLift
  "actions",     // Fix/Improve/Create groups; action CRUD
  "score",       // overallScore, statusLabel, subscores, topLifts
  "loop",        // continuousUpdate: title, content, cadence, outputLabel
] as const;
```

Autosave: 900ms debounce on any field change. Live preview in a `ClientOnboardingMojoMapView` embedded component (editor/preview split).

### View modes (ClientOnboardingMojoMap.tsx lines 196-226)

Two string-labeled views driven by `viewMode: "standard" | "founders"`:

| Label | Copy variant | Center text |
|---|---|---|
| "founders" | "Founders View", "Clarity Outcome", "Main Constraint" | "STUCK -> CLARITY / WORKING MAP IN 6-8 WEEKS" |
| "standard" | "Founder Operating Map", "North Star Outcome", "Current Bottleneck" | "WE'RE STUCK -> WORKING MAP / REAL DECISIONS IN 6-8 WEEKS" |

SVG radial layout: 5 rings at radii [120, 180, 240, 300, 348], angles [-90, -30, 20, 90, 156] degrees. Constraint node at {x:130, y:210}.

### Audience gating

Both routes protected by `AdminGuard`. Client users never see this. The map is labeled "internal-operating-map" and `foundersViewSupported` is true for that map type.

---

## 4. Signal Map

### File map

| File | Role |
|------|------|
| [src/pages/MapSignalPrototype.tsx](src/pages/MapSignalPrototype.tsx) (490 lines) | Full page — `/map-signal-prototype` |

### What it is

A self-labeled **"Prototype Option"** with header subtitle "GPS Signal Map." It renders the active company's strategic position as a GPS/navigation metaphor using live data. The header text explicitly says "signal-first navigation view."

### Data sources

- `useCompany()` → `activeCompany.mojo_score` (drives signal tone thresholds)
- `useRoutes(activeCompany.id)` → `RouteRow[]` (up to 12 routes sorted by `pts_value`)

If no routes exist: 4 hardcoded fallback routes appear (lines 123-158):

```
"Validate baseline assumptions" — 8pts, medium, fix
"Map alternatives in the active market" — 7pts, medium, fix
"Tighten channel and conversion path" — 6pts, medium, improve
"Prioritize one measurable outcome" — 5pts, low, improve
```

### Signal tone logic (lines 34-38)

```typescript
function toneFromValue(value: number): SignalTone {
  if (value >= 70) return "on-route";   // green
  if (value >= 45) return "watch";      // amber
  return "off-route";                   // coral
}
```

### View modes

**"Next Turn" mode** (default):
- Left panel: `SignalNode` — pulsing concentric rings (color = current tone), labeled "Current Reality"
- `NextLegPath` — animated SVG polyline from current to next signal state; shows "+N signal points"
- Right panel: top route title + summary + 3-step guidance text (hardcoded):
  ```
  1. Complete this route item first.
  2. Capture evidence that proves the change happened.
  3. Re-evaluate signal state and choose the next leg.
  ```

**"Zoomed Out" mode**:
- Single SVG polyline with up to 10 route dots
- Hover a dot to preview that route's title and summary in a detail card below

### Educational content

None authored. The 3-step "Next Turn" guidance is the only static explanatory text. Everything else is rendered from live data.

### Audience gating

- `adminOnly: true` in nav config
- `InternalViewOnlyRoute` on the route
- No client access

---

## 5. Cross-Cutting Educational / Teaching Patterns

### `AiBoundaryNote` ([src/components/AiBoundaryNote.tsx](src/components/AiBoundaryNote.tsx))

Small colored note card explaining AI provenance. Two tones: `public` (amber/warm) and `internal` (green).

```typescript
// Signature:
AiBoundaryNote({ label: string; detail: string; tone?: 'public' | 'internal'; className?: string })
```

Usage sites (all admin/internal, no client access):

| Location | Label | Detail |
|---|---|---|
| [src/views/JobSteps/index.tsx:3169](src/views/JobSteps/index.tsx#L3169) | "Public Research" | "Map suggestions are inferred from public baseline signals. No checkpoint map is generated until you explicitly choose or define it." |
| [src/pages/AdminCompanies.tsx:1116](src/pages/AdminCompanies.tsx#L1116) | "Public Research" | "Baseline, Research, and Baseline + Research prioritize company website + public web evidence. When public evidence is weak, research now falls back to uploaded company files." |
| [src/pages/AdminCompanyDetail.tsx:141](src/pages/AdminCompanyDetail.tsx#L141) | "Public Research" | (same as above) |
| [src/pages/AdminCompanyFiles.tsx:122](src/pages/AdminCompanyFiles.tsx#L122) | — | (not read, presumed similar) |
| [src/pages/FilesRepository.tsx:416](src/pages/FilesRepository.tsx#L416) | — | (not read, presumed similar) |

No toggle, no expandable, no client-facing instances.

### `MethodologyPanel` ([src/components/methodology/MethodologyPanel.tsx](src/components/methodology/MethodologyPanel.tsx))

560px slide-in panel from the right. Only triggered from admin MapView (`"Methodology →"` text button). Shows `methodology_pages` rows (published only) grouped by phase. Supports drill-in to page detail. No client access path.

### `SdsTerm` ([src/components/ui/sds-term.tsx](src/components/ui/sds-term.tsx))

Tooltip wrapping the "SDS" acronym with on-hover definition "Strategic Decision System." Used in `MojoScoreStrip` and `ScoreContextBar`. Admin-facing. The only in-situ jargon tooltip in the codebase.

### Tour/walkthrough libraries

**None.** The grep match of `HomepageHierarchy.tsx` was a false positive — the file uses the word "detour" (not a tour library). No `react-joyride`, `shepherd.js`, `intro.js`, or `driver.js` is installed.

---

## 6. Delta vs. Brief's Element #5

The brief's element #5 proposed: per-section expandable panel, possibly teaching-mode toggle, two-part structure ("what would be with their info" vs. "power of the section"), audience both operator and client, coverage every major surface.

| Brief criterion | Methodology Pages | Onboarding Map Editor | Signal Map |
|---|---|---|---|
| Per-section scope | No — pages are standalone, not tied to app sections | No — one map for operator self-use | No — one standalone page |
| Expandable panel affordance | `MethodologyPanel` is a slide-in — not expandable inline | None | None |
| Teaching-mode toggle | None | `viewMode` toggle (founders/standard) — but for data display, not teaching | "Zoomed Out / Next Turn" toggle — for data display |
| Two-part structure ("what would be" vs. "power") | Partial — section defaults approximate this (What This Is / Why It Matters) | No | No |
| Operator + client audience | Operator-only | Operator-only | Operator-only |
| Coverage of every major surface | No — `MethodologyPanel` only appears in MapView | No | No |
| Authored content exists | No — blank CMS, operator must author | Yes — hardcoded seed config | No authored content |
| Data-driven (auto-populates with company data) | No — static operator prose | Partially (health scores editable, not derived) | Yes — live from `mojo_score` + `routes` |

**Gaps vs. brief (all three scaffolds):**
- No client-facing access path in any of the three
- No per-section inline trigger (all are separate navigation destinations or top-level panels)
- No auto-population of educational content from company research data
- No teaching mode gated separately from data view
- No "what would be" / "power of section" duality in rendered UI (only partially in methodology_pages section labels)

**Closest existing foundation:** `MethodologyPanel` + `methodology_pages` CMS. The section title defaults ("What This Is," "Why It Matters," "What You'll Get") approximate the brief's two-part framing, and the panel/slide-in delivery mechanism exists. What's missing: client access, per-section trigger, and authored content.
