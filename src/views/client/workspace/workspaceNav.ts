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

/** Statement scale (accepted fix, port 2b): text up to this many characters renders at the .fr-display
 *  statement scale; longer text at the lede scale. One constant, one helper (statementScaleClass). */
export const STATEMENT_DISPLAY_MAX_CHARS = 140;
export type StatementScale = "display" | "lede";
export function statementScale(text: string): StatementScale {
  return text.trim().length <= STATEMENT_DISPLAY_MAX_CHARS ? "display" : "lede";
}
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
  /** SP-442 (2026-11-19): the tile is rendered only with operator context. The ROUTE is already
   *  closed to a non-admin by AdminModeRoute + InternalViewOnlyRoute (App.tsx), so this flag hides
   *  the tile, it does not stand in for a route guard. */
  readonly operatorOnly?: boolean;
};

export const WORKSPACE_STRINGS = {
  // ── header ──
  /** Existing (the home's Header title), with the trademark mark as SP-445 signed (2026-11-19).
   *  The workspace shell is the only reader; the home carries its own literal. */
  title: "MojoMap™",
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
  /** No longer rendered — the working-page strategy-anchor rail came off 2026-09-16; kept in the register as signed. */
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
  // ── Job Map Tier 1 controls — existing strings (signed by use); vocabulary is choose / chosen, never pin ──
  /** Existing (JobMapOrgPanel MarketSwitcher). */
  showAllMarkets: "Show all markets",
  switchMarketViewingOnly: "Switch market — viewing only",
  /** Existing (OnStrategyPin — its one action string). */
  chooseSet: "Choose this as the on-strategy set",
  /** Existing (ClientRefinePreviewWorkshopView header buttons). */
  generateConditions: "Generate conditions",
  working: "Working…",
  /** Existing (JobMapOrgPanel EvidenceToggle titles). */
  showEvidence: "Show evidence",
  hideEvidence: "Hide evidence",
  /** Existing (JobMapOrgPanel need row). */
  reviewPending: "review pending",
  markReviewed: "Mark reviewed",
  // ── Job Map: market door (signed 2026-09-15, item 2, R2) — the ONLY new strings. The working state
  //    reuses `working` above; the empty state stays wordless (absent.tsx). ──
  /** The one operator-gated control on an unmapped market (signed 2026-09-15, item 2). */
  generateJobMap: "Generate job map",
  /** Switcher state word on an entry with no job_steps (signed 2026-09-15, item 2). */
  notMapped: "Not mapped",
  /** Failure note under the control — any 4xx/422, or nothing landed by the bound (signed 2026-09-15, item 2). */
  jobMapGenerationFailed: "Generation did not complete — no steps were written for this market.",
  // ── Opportunities body (P:362-389) ──
  filterAll: "All",
  filterHighValue: "High value",
  searchOpportunities: "Search opportunities",
  selectedOpportunity: "Selected opportunity",
  potential: "Potential",
  createRoute: "Create route",
  // ── Opportunities Tier 1 controls (signed 2026-09-12, inventory §6) — existing NeedsOrgPanel /
  //    WorkshopView strings rendered by the page itself. The moved components (opportunitiesShared,
  //    ProposeChangesButton, DriftBadge, DriftDetailPanel) carry their own, unchanged. ──
  human: "Human",
  canonical: "Canonical",
  checkForDrift: "Check for drift",
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
  // ── Routes Tier 1 controls (signed 2026-09-12, inventory §6) — existing HierarchyRouteSection /
  //    LegRow strings rendered by the page itself; LegTestPanel, DriftBadge and DriftDetailPanel carry
  //    their own, unchanged. ──
  chooseThisPath: "Choose this path →",
  deselect: "Deselect",
  chosenPath: "CHOSEN PATH",
  workingHypothesis: "Working hypothesis",
  legs: "legs",
  leg: "leg",
  proposeRouteChanges: "Propose route changes from current evidence",
  // ── Read-page bands (P:219-359) ──
  /** Existing (firstReadPreview/acts). */
  mustHaveCapabilities: "Must-have capabilities",
  managementSystems: "Management systems",
  whatHoldsItUp: "What holds it up",
  whoThisIsFor: "Who this is for",
  insteadOf: "Instead of",
  taglineShift: "Tagline shift",
  whatTheyAreHiringFor: "What they are hiring for",
  /** S-MKT-1 (signed 2026-11-14, SP-300) — shown under "What they are hiring for" in place of the canned
   *  jtbdFromJourneyTitle default-branch sentence, which rests on no evidence (SP-F46). */
  marketNotEnoughEvidence: "Not enough evidence yet to say what this market is hiring for.",
  /** S-POS-1 (signed 2026-11-13, BRIEF-17 SP-329) — heading of the separate positioning list that holds
   *  the attributes the judge found `contradicted`; they never render under "What makes you different". */
  positioningOutsideDisagree: "Where outside voices disagree",
  customerTensionsMapped: "Customer tensions mapped",
  // ── No public site (2026-09-16) — DRAFT pending the operator's signature at screenshot ──
  /** Add-Client checkbox label (given by the operator). */
  noPublicSiteLabel: "No public site",
  /** The company-surface state line, in place of any "baseline failed / not run" state. */
  noPublicSiteState: "No public site — the outside read runs on the name only.",
  /** Operator-facing plan tag on the signal basis when the last outside read was by name (gate B). Not a client string. */
  readByName: "read by name",
  /** SRCH-1 (signed 2026-09-17): the latest outside read could not reach search — nothing was checked, not a
   *  finding about the company and not a "failed" run. {date} = the run's date, same format as "Last run". */
  searchUnavailableState: "Search couldn't be reached — nothing was checked · {date}",
  // ── Inputs (P:71-106) ──
  signalBasis: "Signal basis",
  /** Existing (HomepageHierarchyFR signal chips: "PUBLIC n" / "TEAM n" / "CUSTOMERS n"). */
  signalPublic: "PUBLIC",
  signalTeam: "TEAM",
  signalCustomers: "CUSTOMERS",
  partiallyIntegrated: "Partially integrated",
  evidenceFiles: "Evidence files",
  directionalRoutes: "Directional routes",
  add: "ADD",
  input: "Input",
  /** Existing (InputsTab). */
  uploadFile: "Upload file",
  colTypeSnippet: "Type / snippet",
  colAreas: "Areas",
  colAnalysis: "Analysis",
  viewFile: "View file ↗",
  /** Existing (InputsTab status vocabulary). */
  analysisReady: "Analysis ready",
  reviewProposal: "Review proposal",
  runAnalysis: "Run analysis",
  /**
   * SP-178, corrected by SP-215 (2026-11-13): I-1 made analysis start by itself, so the control on a
   * FINISHED row is no longer "run" but "run again" — it re-queues the same file. SP-178 first wrote
   * "Analyse again"; SP-215 records that as the reviewer's slip and signs the AMERICAN spelling, which
   * matches "Analyzing…" and "Run analysis" beside it. SP-183 forbids a new string in this slice and
   * this is not one — it is the ruling's own word, respelled by the ruling that followed it.
   * "Run analysis" stays, as the fallback that creates the same queued row when nothing has yet
   * been analysed (SP-194).
   */
  analyzeAgain: "Analyze again",
  // ── Inputs Tier 1 controls — existing InputsTab strings (signed by use) ──
  analyzing: "Analyzing…",
  /** Existing (InputsTab failed-run control), signed 2026-09-12. The size refusal sentence lives in src/lib/fileTooLarge.ts. */
  analysisFailedRetry: "Analysis failed — retry →",
  /** Signed 2026-09-13: opens the status-aware panel (read mode) on an accepted row. */
  viewAnalysis: "View analysis →",
  /**
   * Signed 2026-09-13 (ruling 4): the processing-state badge for a running proposal — rendered on both surfaces
   * by fileProposalProcessingBadgeText (inputsShared), which is the single render site; this entry registers the
   * word in the vocabulary tests police. Queued / failed badge texts exist there too and are NOT signed here.
   */
  analyzingState: "Analyzing",
  filterAllTypes: "All types",
  filterFile: "File",
  filterIntake: "Intake",
  filterFoundationAll: "Foundation: all",
  filterFoundationYes: "Applied in foundation",
  filterFoundationNo: "Not yet applied",
  archiveTitle: "Archive file (recoverable)",
  restore: "Restore",
  /** "N archived files" — the count is live, the noun is the tab's. */
  archivedFilesSingular: "archived file",
  archivedFilesPlural: "archived files",
  // ── Proposed-needs review group on Inputs (SP-441 / SP-443; strings SP-446 B-10..B-14, 2026-11-19) ──
  /** B-11 — the outside-voice group's label. */
  proposedNeedsReview: "Proposed needs — review",
  /** B-12 — that group's count. {n} = pending outside-voice cards, and ONLY those (SP-453). */
  pendingOutsideVoice: "{n} pending · outside voice",
  /** SP-453 (signed 2026-11-19) — the file-analysis need cards get their own group. */
  proposedNeedsFromFiles: "Proposed needs — from file analyses",
  /** SP-455a (signed 2026-11-19): the file-analysis group's count is the bare number pending. */
  pendingFromFileAnalyses: "{n} pending",
  /** The card's kind and voice chips, as the signed mock prints them. These MIRROR the admin queue's
   *  own vocabulary (src/components/admin/CandidateReviewQueue.tsx TYPE_LABEL / VOICE_LABEL, which is
   *  not exported); workspaceStrings.parity.test.ts reads that file and fails if the two ever differ,
   *  so there is one vocabulary without changing an /admin file (SP-440). */
  cardKindNeed: "Need",
  voiceCompany: "Company says",
  voiceOutside: "Outside voices",
  voiceMixed: "Both voices",
  voiceUnlabeled: "Voice unlabeled",
  /** B-10 — the count control that opens a card's or a need's quotes. Both surfaces.
   *  SP-456 (signed 2026-11-19): the singular forms for n = 1. */
  countedQuotesSites: "{counted} counted quotes · {sites} sites",
  countedQuoteSingular: "{counted} counted quote",
  countedQuotesPlural: "{counted} counted quotes",
  siteSingular: "{sites} site",
  sitesPlural: "{sites} sites",
  /** B-13 — a quote whose page showed no date. */
  dateNotShown: "date not shown",
  /** SP-456 (signed 2026-11-19) — need_evidence's sentinel for a page that named no brand. The stored
   *  value is `brand_not_recorded`; no raw enum reaches a screen. */
  brandNotRecorded: "Brand not recorded",
  /** B-14, SUPERSEDED as a render by SP-455b: the remainder is now a CONTROL that reveals every
   *  remaining quote, using the First Read's own pair below. Kept in the register because it was
   *  signed; nothing renders it. Retire it when you are ready. */
  moreMasked: "+ {n} more · reviewer names masked",
  /** SP-455b — the First Read's existing reveal pair, byte-exact (firstReadPreview/acts.tsx:854).
   *  {n} is the TOTAL, as it is there. */
  showAll: "Show all {n}",
  showFewer: "Show fewer",
  /** Existing by use (CandidateReviewQueue, ProposalReviewPanel). */
  accept: "Accept",
  /** Signed 2026-11-19 (SP-446). Reject marks the proposal rejected and KEEPS the row (SP-444). */
  reject: "Reject",
  // ── Brief (SP-442 tile + title, SP-424 the draft mark, SP-445 fixes, SP-446 B-1..B-9, SP-449) ──
  /** SP-442 — the Tools tile label and the page's own name. */
  briefLabel: "Brief",
  /** SP-442 — the tile kicker, beside "Add evidence" and "Check the work". */
  briefKicker: "Prepare the conversation",
  /** SP-424 — until the sign step is built, the page says so. */
  briefDraftMark: "draft, not signed",
  /** B-1 — what the counts are, and what they are not. The one line on the page that carries meaning. */
  briefNote: "Every count below is where customers reported a problem, in their own public words. A high count means the problem is well evidenced — it is not a satisfaction rate, and a low count is not approval. Counting follows the merger rule: an undated Cox review, and any Cox review from before 20 August 2026, is shown but not counted.",
  /** B-2 */
  bandHotspots: "Hotspots",
  /** SP-449 (2026-11-19) — the needs whose counted quotes say the outcome IS being met. */
  bandWhatWorks: "What works",
  /** B-3 */
  bandThinSpots: "Thin spots",
  /** B-4, as SP-446 amended it. */
  bandQuestions: "Open questions from the outside read",
  /** B-5 — one colour on both surfaces (SP-445): the lime accent token. */
  atTheBar: "At the bar",
  /** SP-458, shortened by SP-476 (signed 2026-11-20): a need materialised from a card nobody has
   *  ruled on yet. It is in the Brief and in its counts; the tag says the need is still proposed. */
  proposedNeedMark: "Proposed",
  // ── The pattern layer (SP-465 / SP-428 / SP-459, 2026-11-20). NEW STRINGS, for signature. ──
  /** The group label inside a hotspot card, over the patterns the judge kept. */
  patternsLabel: "What keeps happening",
  /** SP-428's four strengths, as a screen reads them. The stored values ARE these four words in
   *  lower case (need_patterns_strength_check), and this map is the ONE place a strength becomes
   *  text — so no stored value can reach the screen by another route, the SP-456 rule. */
  strengthConfirmedRule: "Confirmed rule",
  strengthLikelyRule: "Likely rule",
  strengthPossibleFailure: "Possible failure",
  strengthTooThin: "Too thin",
  /** SP-508 + SP-512 (signed 2026-11-20): the strength is POLARITY-AWARE where its wording carries a
   *  polarity. "Possible failure" is the right words for a 'not working' pattern and the wrong words
   *  for the other two — a positive pattern resting on two quotes is not a failure of anything, and
   *  calling it one is the kind of quiet mislabelling SP-470 exists to prevent. 'confirmed rule' and
   *  'likely rule' need no variant: they name how well evidenced a pattern is, not what it says. */
  strengthPossibleStrength: "Possible strength",
  strengthPossibleTension: "Possible tension",
  /** SP-488 + SP-512: a pattern resting on ONE quote. `patternStrength` calls that 'too thin', which
   *  is accurate about the evidence and silent about what the reader is looking at; these are grouped
   *  under this label instead of listed as rows, so one mention cannot read like a rule. */
  strengthMentionedOnce: "Mentioned once",
  mentionedOnceCount: "{n} mentioned once",
  /** What a pattern rests on, singular-aware as SP-456 requires of every such line. */
  supportingQuoteSingular: "{n} supporting quote",
  supportingQuotesPlural: "{n} supporting quotes",
  /** SP-476 (signed 2026-11-20) — the coverage line, under each hotspot's pattern band, operator
   *  view. It exists because the band is a reading of PART of the evidence and the page used to give
   *  no sign of that: on N13 the first run put 16 of 44 counted quotes under a pattern and said so
   *  nowhere. Both numbers are derived at render (SP-463). */
  patternCoverage: "{n} of {m} counted quotes under a pattern",
  /** B-6, as SP-446 amended it. */
  belowTheBar: "Below the bar",
  /** SP-445 — the visible key for the per-brand counts. */
  polarityKey: "working / not working / mixed",
  /** B-7 — which floor a thin spot missed. */
  thinTooFewQuotes: "too few counted quotes",
  thinTooFewSites: "too few sites",
  thinTooFewBoth: "too few counted quotes and too few sites",
  /** B-8 — what the merger rule withheld from this need, and so what would have changed it. */
  withheldCox: "{undated} undated Cox and {pre} pre-merger Cox not counted",
  withheldNone: "nothing withheld by the merger rule",
  /** B-9 — the questions band's footer. */
  questionsFoot: "{live} live questions · {superseded} superseded not shown",
  // ── Council (P:391-397) ──
  /** Existing (CouncilPanel). */
  strategicPressure: "Strategic pressure",
  /** Existing (CouncilPanel: "{category} · {confidence}% confidence"). */
  confidence: "confidence",
  // ── council badge words — existing (CouncilPanel recBadgeLabel), byte-exact ──
  councilUnresolved: "Unresolved",
  councilSetAside: "Set aside",
  councilIntegrated: "Integrated",
  councilAccepted: "Accepted",
} as const;

export const WORKSPACE_PAGES: ReadonlyArray<WorkspacePage> = [
  { key: "index",         segment: "",              label: WORKSPACE_STRINGS.indexSection, group: "tools" },
  { key: "strategy",      segment: "strategy",      label: "Strategy",      group: "base",    index: "01", tone: "electric-sol", summary: "Where to play and how to win" },
  { key: "positioning",   segment: "positioning",   label: "Positioning",   group: "base",    index: "02", tone: "periwinkle",   summary: "The place you intend to own" },
  { key: "market",        segment: "market",        label: "Market",        group: "base",    index: "03", tone: "lime",         summary: "The people, needs and context" },
  { key: "job-map",       segment: "job-map",       label: "Job Map",       group: "outputs", index: "04", tone: "lime",         summary: "Structure the work customers do" },
  { key: "opportunities", segment: "opportunities", label: "Opportunities", group: "outputs", index: "05", tone: "electric",     summary: "Prioritize unmet outcomes" },
  { key: "routes",        segment: "routes",        label: "Routes",        group: "outputs", index: "06", tone: "electric-sol", summary: "Turn choices into action" },
  { key: "inputs",        segment: "inputs",        label: "Inputs",        group: "tools" },
  { key: "council",       segment: "council",       label: "Council",       group: "tools" },
  // SP-442: the third Tools tile, operators only. Tools pages have no arrow siblings
  // (arrowNeighbour returns null for the group), so prev/next is unchanged by it.
  { key: "brief",         segment: "brief",         label: WORKSPACE_STRINGS.briefLabel, group: "tools", operatorOnly: true },
] as const;

/** The Admin disclosure: existing routes, existing labels (WorkshopSidebar). Operator-gated. */
export const WORKSPACE_ADMIN_LINKS: ReadonlyArray<{ readonly label: string; readonly to: string }> = [
  { label: "Inbox",        to: CLIENT_REFINE_PREVIEW_INBOX_ROUTE },
  { label: "Company",      to: CLIENT_REFINE_PREVIEW_COMPANY_ROUTE },
  { label: "Member roles", to: CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE },
  { label: "Extracts",     to: CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE },
];

/** InputsTab's read-back map (__area:* key → foundation area label), byte-exact — existing labels. */
export const WORKSPACE_AREA_LABELS: Readonly<Record<string, string>> = {
  positioning: "Positioning", strategy: "Model", market: "Opportunities", odi: "Opportunities",
  jobmap: "Job Map", job_map: "Job Map", routes: "Routes", competitive: "Positioning", brand: "Positioning",
};

/** Tools-strip sub-eyebrow per tools page (S:169-178). */
export const WORKSPACE_TOOL_EYEBROWS: Readonly<Record<string, string>> = {
  inputs: WORKSPACE_STRINGS.addEvidence,
  council: WORKSPACE_STRINGS.checkTheWork,
  brief: WORKSPACE_STRINGS.briefKicker,
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

/** SP-440: the page's document title. One shape for every workspace page. */
export function workspaceDocumentTitle(label: string, companyName: string | null | undefined): string {
  const company = String(companyName ?? "").trim();
  return company ? `${label} — ${company}` : label;
}

/** B-10, with SP-456's singular forms: "1 counted quote · 1 site", "3 counted quotes · 2 sites". */
export function countedQuotesSitesLine(counted: number, sites: number): string {
  const q = (counted === 1 ? WORKSPACE_STRINGS.countedQuoteSingular : WORKSPACE_STRINGS.countedQuotesPlural)
    .replace("{counted}", String(counted));
  const s = (sites === 1 ? WORKSPACE_STRINGS.siteSingular : WORKSPACE_STRINGS.sitesPlural)
    .replace("{sites}", String(sites));
  return `${q} \u00b7 ${s}`;
}

/** SP-476 — the coverage line. Not singular-aware: "1 of 44" and "16 of 44" read the same way, and
 *  the noun is pluralised by {m}, which is never 1 for a need that meets the bar (the bar is 3). */
export function patternCoverageLine(assigned: number, counted: number): string {
  return WORKSPACE_STRINGS.patternCoverage.replace("{n}", String(assigned)).replace("{m}", String(counted));
}

/** SP-428's strength, as a screen reads it, and SP-508: polarity-aware where the wording carries a
 *  polarity. An unrecognised stored value is returned unchanged rather than blanked — a value the
 *  check constraint should have refused must be VISIBLE, not hidden behind a label map.
 *
 *  The polarity argument is OPTIONAL and an absent or unrecognised one reads as the negative wording,
 *  because that is what every pre-SP-470 row is: a v1 pattern carries no polarity and every one of
 *  them was a complaint. */
export function strengthLabel(stored: string | null | undefined, polarity?: string | null): string {
  const v = String(stored ?? "").trim();
  const pol = String(polarity ?? "").trim().toLowerCase();
  if (v === "confirmed rule") return WORKSPACE_STRINGS.strengthConfirmedRule;
  if (v === "likely rule") return WORKSPACE_STRINGS.strengthLikelyRule;
  if (v === "possible failure") {
    if (pol === "working") return WORKSPACE_STRINGS.strengthPossibleStrength;
    if (pol === "mixed") return WORKSPACE_STRINGS.strengthPossibleTension;
    return WORKSPACE_STRINGS.strengthPossibleFailure;
  }
  // SP-488: one quote is a MENTION, whatever its polarity. The evidence word ('too thin') stays in the
  // table and in patternStrength; this is what a reader sees.
  if (v === "too thin") return WORKSPACE_STRINGS.strengthMentionedOnce;
  return v;
}

/** SP-488 — the group footer: how many patterns under this need rest on a single quote. Not
 *  singular-aware by design: the string says "mentioned once", so "1 mentioned once" is the sentence,
 *  and a plural noun would have to invent a noun the signed string does not contain. */
export function mentionedOnceLine(n: number): string {
  return WORKSPACE_STRINGS.mentionedOnceCount.replace("{n}", String(n));
}

/** What a pattern rests on: "1 supporting quote · 1 site", "7 supporting quotes · 3 sites". */
export function patternSupportLine(supporting: number, sites: number): string {
  const q = (supporting === 1 ? WORKSPACE_STRINGS.supportingQuoteSingular : WORKSPACE_STRINGS.supportingQuotesPlural)
    .replace("{n}", String(supporting));
  const s = (sites === 1 ? WORKSPACE_STRINGS.siteSingular : WORKSPACE_STRINGS.sitesPlural)
    .replace("{sites}", String(sites));
  return `${q} \u00b7 ${s}`;
}

/** SP-456 — the brand as a screen reads it. A stored sentinel gets its signed label; a brand name is
 *  the stored value, which is the company's own word for it and is never an underscore-cased enum.
 *  This is the ONE place a brand becomes text, so no raw enum can reach a screen by another route. */
export function brandLabel(stored: string | null | undefined): string {
  const v = String(stored ?? "").trim();
  if (v === "brand_not_recorded") return WORKSPACE_STRINGS.brandNotRecorded;
  return v;
}
/** B-12 — "{n} pending · outside voice". */
export function pendingOutsideVoiceLine(n: number): string {
  return WORKSPACE_STRINGS.pendingOutsideVoice.replace("{n}", String(n));
}
/** SP-455a — "{n} pending". */
export function pendingFromFilesLine(n: number): string {
  return WORKSPACE_STRINGS.pendingFromFileAnalyses.replace("{n}", String(n));
}
/** The voice chip for a card's stored evidence_voice, in the admin queue's own words. */
export function voiceLabel(voice: string | null | undefined): string {
  switch (String(voice ?? "").trim()) {
    case "company": return WORKSPACE_STRINGS.voiceCompany;
    case "outside": return WORKSPACE_STRINGS.voiceOutside;
    case "mixed": return WORKSPACE_STRINGS.voiceMixed;
    default: return WORKSPACE_STRINGS.voiceUnlabeled;
  }
}
/** B-14 — "+ {n} more · reviewer names masked". Kept with the string it fills; nothing renders it
 *  since SP-455b. */
export function moreMaskedLine(n: number): string {
  return WORKSPACE_STRINGS.moreMasked.replace("{n}", String(n));
}
/** SP-455b — "Show all {n}", the First Read's own string with the total filled. */
export function showAllLine(total: number): string {
  return WORKSPACE_STRINGS.showAll.replace("{n}", String(total));
}
/** B-8 — what the merger rule withheld from this need. `undated` + `pre` both zero ⇒ the
 *  "nothing withheld" line, so a thin spot never implies a withholding that did not happen. */
export function withheldLine(undated: number, pre: number): string {
  if (undated === 0 && pre === 0) return WORKSPACE_STRINGS.withheldNone;
  return WORKSPACE_STRINGS.withheldCox.replace("{undated}", String(undated)).replace("{pre}", String(pre));
}
/** B-9 — "{live} live questions · {superseded} superseded not shown". */
export function questionsFootLine(live: number, superseded: number): string {
  return WORKSPACE_STRINGS.questionsFoot.replace("{live}", String(live)).replace("{superseded}", String(superseded));
}

/** The SRCH-1 lineage line for a run dated `iso` — the signed template with its date filled (en-US short date,
 *  the same format the "Last run" line uses). */
export function searchUnavailableLine(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : null;
  const date = d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  return WORKSPACE_STRINGS.searchUnavailableState.replace("{date}", date).replace(/\s·\s$/, "");
}
