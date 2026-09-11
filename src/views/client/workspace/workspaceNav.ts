// WORKSPACE NAV + STRINGS — the one registry of the shell's pages and of every client-visible string
// the workspace files render (signed 2026-09-11; comp-port rulings 1–2). Nothing is rendered inline
// anywhere under src/views/client/workspace/: a page or frame imports from here or from an existing
// primitive. Strings marked "existing" also render elsewhere in client-refine (WorkshopSidebar,
// firstReadPreview/acts, CouncilPanel, InputsTab…); the rest are signed class-a labels or the 13 kept
// class-b lines (six launcher tile summaries, seven home card descriptions).
//
// Groups: Outputs and Base are the two arrow groups (←/→ cycles within a group, wrapping, never
// crossing); Tools pages (and the home) have no arrow siblings. Admin is a launcher disclosure only
// (ruling 9) — it has no route.
import {
  CLIENT_REFINE_PREVIEW_COMPANY_ROUTE,
  CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE,
  CLIENT_REFINE_PREVIEW_INBOX_ROUTE,
  CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE,
  clientRefineWorkspacePath,
} from "@/lib/clientRefinePreview";

export type WorkspaceGroup = "outputs" | "base" | "tools";
/** Colour tick on a launcher tile (S:7-15) — an fr token name, mapped in CSS. */
export type WorkspaceTone = "lime" | "electric" | "electric-sol" | "periwinkle";

export type WorkspacePage = {
  readonly key: string;
  /** URL segment under /workspace ("" = index). */
  readonly segment: string;
  readonly label: string;
  readonly group: WorkspaceGroup;
  /** Launcher tile numeral (S:7-15). */
  readonly index?: string;
  readonly tone?: WorkspaceTone;
  /** Kept class-b line: the launcher tile summary (S:7-15). */
  readonly summary?: string;
  /** Kept class-b line: the home card description (P:422). */
  readonly cardDescription?: string;
};

export const WORKSPACE_STRINGS = {
  // ── header ──
  /** Existing (the home's Header title). */
  title: "MojoMap",
  /** Existing operator string (the home's Header right slot) — operator context only. */
  scanAllSurfaces: "Scan all surfaces",
  /** Existing fallbacks and the DAY word from the home identity line. */
  companyFallback: "COMPANY",
  day: "DAY",
  dayFallback: "—",
  // ── cluster (aria) ──
  openMap: "Open workspace map",
  previous: "Previous",
  next: "Next",
  // ── launcher ──
  map: "Workspace map",
  navigation: "Workspace navigation",
  closeMap: "Close workspace map",
  outputs: "Outputs",
  base: "Base",
  here: "Here",
  addEvidence: "Add evidence",
  checkTheWork: "Check the work",
  workspaceControls: "Workspace controls",
  admin: "Admin",
  workspaceHome: "Workspace home",
  /** Existing (WorkshopSidebar). */
  firstRead: "First read",
  // ── frames ──
  workingSet: "Working set",
  /** Working-set unit words (signed, accepted fix 3): the box renders "<count> <unit>". */
  unitStages: "stages",
  unitMapped: "mapped",
  unitRoutes: "routes",
  strategyAnchor: "Strategy anchor",
  /** Existing (firstReadPreview/acts). */
  whereToPlay: "Where to play",
  howToWin: "How to win",
  // ── page eyebrows (section name only, ruling 3) and hero titles ──
  indexSection: "WORKSPACE",
  yourStrategy: "Your strategy",
  yourPositioning: "Your positioning",
  yourMarket: "Your market",
  routePlan: "Route plan",
  heroHome: "Strategy",
  heroHomeAccent: "Workspace",
  heroInputs: "Evidence",
  heroInputsAccent: "Lineage",
  heroCouncil: "Advisory",
  heroCouncilAccent: "Council",
  titleJobMap: "The customer job",
  titleOpportunities: "Customer opportunities",
  titleRoutes: "Routes under consideration",
  // ── Job Map body (P:159-204) ──
  /** Existing (ClientRefinePreviewWorkshopView). */
  marketHypothesis: "Market hypothesis",
  jobStages: "Job stages",
  /** Existing (JobMapOrgPanel stepPosture). */
  underPressure: "Under pressure",
  mappedOpportunities: "Mapped opportunities",
  // ── Opportunities body (P:362-389) ──
  filterAll: "All",
  filterHighValue: "High value",
  searchOpportunities: "Search opportunities",
  selectedOpportunity: "Selected opportunity",
  potential: "Potential",
  createRoute: "Create route",
  // ── Routes body (P:409-419) ──
  scoreNow: "Now",
  /** Existing (home / routes compass). */
  scoreReachable: "Reachable",
  scoreCeiling: "Ceiling",
  evidenceUnlock: "Evidence unlock",
  /** Existing (the home's raiser lift: "+N PTS"). */
  pts: "PTS",
  routeWorkbench: "Route workbench",
  /** Existing (ClientRefinePreviewRoutesView / ClientRefinePreviewWorkshopView). */
  regenerateConditions: "Regenerate conditions",
  draftTests: "Draft tests",
  testForThisRoute: "Test for this route",
  // ── council badge words — existing (CouncilPanel recBadgeLabel), byte-exact ──
  councilUnresolved: "Unresolved",
  councilSetAside: "Set aside",
  councilIntegrated: "Integrated",
  councilAccepted: "Accepted",
} as const;

export const WORKSPACE_PAGES: ReadonlyArray<WorkspacePage> = [
  { key: "index",         segment: "",              label: WORKSPACE_STRINGS.indexSection, group: "tools" },
  { key: "strategy",      segment: "strategy",      label: "Strategy",      group: "base",    index: "01", tone: "electric-sol", summary: "Where to play and how to win",   cardDescription: "Follow the strategy cascade." },
  { key: "positioning",   segment: "positioning",   label: "Positioning",   group: "base",    index: "02", tone: "periwinkle",   summary: "The place you intend to own",     cardDescription: "Review the declared market position." },
  { key: "market",        segment: "market",        label: "Market",        group: "base",    index: "03", tone: "lime",         summary: "The people, needs and context" },
  { key: "job-map",       segment: "job-map",       label: "Job Map",       group: "outputs", index: "04", tone: "lime",         summary: "Structure the work customers do", cardDescription: "See the customer job and desired outcomes." },
  { key: "opportunities", segment: "opportunities", label: "Opportunities", group: "outputs", index: "05", tone: "electric",     summary: "Prioritize unmet outcomes",       cardDescription: "Compare all 28 customer opportunities." },
  { key: "routes",        segment: "routes",        label: "Routes",        group: "outputs", index: "06", tone: "electric-sol", summary: "Turn choices into action",        cardDescription: "Evaluate routes under consideration." },
  { key: "inputs",        segment: "inputs",        label: "Inputs",        group: "tools",   cardDescription: "Trace the evidence shaping the strategy." },
  { key: "council",       segment: "council",       label: "Council",       group: "tools",   cardDescription: "Read the advisory recommendations." },
] as const;

/** The Admin disclosure: existing routes, existing labels (WorkshopSidebar). Operator-gated. */
export const WORKSPACE_ADMIN_LINKS: ReadonlyArray<{ readonly label: string; readonly to: string }> = [
  { label: "Inbox",        to: CLIENT_REFINE_PREVIEW_INBOX_ROUTE },
  { label: "Company",      to: CLIENT_REFINE_PREVIEW_COMPANY_ROUTE },
  { label: "Member roles", to: CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE },
  { label: "Extracts",     to: CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE },
];

/** Tools-strip sub-eyebrow per tools page (S:169-178). */
export const WORKSPACE_TOOL_EYEBROWS: Readonly<Record<string, string>> = {
  inputs: WORKSPACE_STRINGS.addEvidence,
  council: WORKSPACE_STRINGS.checkTheWork,
};

/** A page's signed label by key (page eyebrows carry the section name only, ruling 3). */
export function pageLabel(key: string): string {
  return WORKSPACE_PAGES.find((p) => p.key === key)?.label ?? "";
}

export function workspacePagePath(page: WorkspacePage): string {
  return clientRefineWorkspacePath(page.segment || undefined);
}

export function workspacePageForPathname(pathname: string): WorkspacePage {
  const base = clientRefineWorkspacePath();
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\/+|\/+$/g, "") : "";
  return WORKSPACE_PAGES.find((p) => p.segment === rest) ?? WORKSPACE_PAGES[0];
}

export function groupPages(group: WorkspaceGroup): ReadonlyArray<WorkspacePage> {
  return WORKSPACE_PAGES.filter((p) => p.group === group);
}

/** The arrow neighbour within the page's own group, wrapping. null on Tools pages and the home. */
export function arrowNeighbour(page: WorkspacePage, dir: "prev" | "next"): WorkspacePage | null {
  if (page.group === "tools") return null;
  const siblings = groupPages(page.group);
  const i = siblings.findIndex((p) => p.key === page.key);
  if (i < 0) return null;
  const n = siblings.length;
  return siblings[(i + (dir === "next" ? 1 : n - 1)) % n];
}
