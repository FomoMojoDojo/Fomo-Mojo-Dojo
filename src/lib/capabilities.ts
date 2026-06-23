// Capability registry + role bundles — the single permission registry.
//
// Architecture (operator-decided): code CAPABILITIES, bundle ROLES. A capability
// is the atomic permission unit; a role is a NAMED BUNDLE of capabilities; the one
// `useCapability(cap, companyId?)` hook (src/hooks/useCapability.ts) is the only
// check authority. RLS will key on capability, not role-name (later checkpoint).
//
// SCOPE LAW — the catalog is a REGISTRY, not a build list. Every capability the
// operator listed is registered here. Each row is tagged:
//   status:'enforce'  → gates a REAL surface/handler that exists in the product
//                       today (cited in `surface`).
//   status:'register' → destination-only: no consumer exists yet (billing, decision
//                       publish/override, initiatives, custom frameworks, voting,
//                       surveys, comments, reporting export/share, member mgmt).
//                       Registered so the name is reserved; never scaffolded here.
//
// CHECKPOINT 1 (DARK): this file is pure data + a pure resolver. It is wired to
// nothing, gates nothing, and changes no behavior. Consumption (gating handlers /
// controls) is checkpoint 3; the company_members.role CHECK/default reconcile is
// checkpoint 2; has_capability() RLS is checkpoint 4.
//
// Single-source pattern (cf. normalizeForHash / resolveChosenSet /
// gateSubjectForExternal): role→capability resolution lives ONLY in this file's
// pure functions; no other module maps roles→caps inline.

export type CapabilityStatus = "enforce" | "register";

interface CapabilityMeta {
  /** 'enforce' = a live surface exists today; 'register' = reserved, no consumer. */
  status: CapabilityStatus;
  /** One-line description of the permission. */
  summary: string;
  /** For enforce-now caps: the live handler/surface this gates (audit trail). */
  surface?: string;
}

// ── The registry ──────────────────────────────────────────────────────────────
// Every capability name, tagged. ENFORCE rows cite the live surface from the
// surface-reality audit; REGISTER rows are destination-only (no consumer).
export const CAPABILITIES = {
  // workspace ───────────────────────────────────────────────────────────────
  "workspace.client.create": {
    status: "enforce",
    summary: "Create a new client / company workspace.",
    surface: "handleCreateClient — ClientRefinePreviewWorkshopView.tsx:1435",
  },
  "workspace.member.invite": {
    status: "register",
    summary: "Invite a user to a company workspace.",
  },
  "workspace.member.assignRole": {
    status: "register",
    summary: "Assign / change a member's company role.",
  },
  "workspace.billing.manage": {
    status: "register",
    summary: "Manage subscription / billing for the workspace.",
  },

  // structure (strategic objects) ─────────────────────────────────────────────
  "structure.opportunity.generate": {
    status: "enforce",
    summary: "Agent-generate an opportunity (need) proposal.",
    surface: "handleGenerateOpportunityProposal — useOpportunityProposalHandlers.ts:21",
  },
  "structure.cascade.generate": {
    status: "enforce",
    summary: "Agent-generate a strategy-cascade proposal.",
    surface: "handleGenerateCascadeProposal — useCascadeProposal.ts",
  },
  "structure.route.generate": {
    status: "enforce",
    summary: "Agent-generate a route proposal.",
    surface: "handleGenerateRouteProposal — useRouteProposals.ts",
  },
  "structure.positioning.generate": {
    status: "enforce",
    summary: "Agent-generate a positioning proposal.",
    surface: "handleGenerateProposal — usePositioningProposal.ts",
  },
  "structure.cascade.inlineEdit": {
    status: "enforce",
    summary: "Inline-edit cascade narrative fields (no-LLM manual edit).",
    surface: "saveManualEdit — StrategyOrgPanel.tsx",
  },
  "structure.positioning.inlineEdit": {
    status: "enforce",
    summary: "Inline-edit positioning fields (no-LLM manual edit).",
    surface: "saveManualEdit — PositioningOrgPanel.tsx",
  },
  "structure.initiative.manage": {
    status: "register",
    summary: "Create / manage execution initiatives.",
  },
  "structure.framework.custom": {
    status: "register",
    summary: "Define a custom strategy framework.",
  },

  // evidence ──────────────────────────────────────────────────────────────────
  "evidence.manage": {
    status: "enforce",
    summary: "Add / edit / delete evidence inputs.",
    surface: "InputsTab.tsx (insert/update/delete)",
  },
  "evidence.refreshBaseline": {
    status: "enforce",
    summary: "Refresh the public baseline for the company.",
    surface: "handleRefreshBaseline — InputsTab.tsx:1206",
  },

  // participation ─────────────────────────────────────────────────────────────
  "participation.suggest": {
    status: "enforce",
    summary: "Stage a no-LLM authored proposal (suggest an edit).",
    surface: "handleAuthorOpportunityProposal — NeedsOrgPanel.tsx:1156 (opportunity only; other surfaces reserved/net-new)",
  },
  "participation.comment": {
    status: "register",
    summary: "Comment / discuss on a surface.",
  },
  "participation.survey": {
    status: "register",
    summary: "Submit a participation survey / vote on alignment.",
  },

  // governance ────────────────────────────────────────────────────────────────
  "governance.proposal.apply": {
    status: "enforce",
    summary: "Apply / accept a surface proposal (the one apply-write).",
    surface: "handleAccept{Opportunity,Cascade,Route,Proposal} — surface_proposals → status accepted",
  },
  "governance.proposal.reject": {
    status: "enforce",
    summary: "Reject a surface proposal.",
    surface: "handleReject{Opportunity,Cascade,Route,Proposal}",
  },
  "governance.drift.scan": {
    status: "enforce",
    summary: "Trigger a drift scan across surfaces.",
    surface: "handleScanAllSurfaces / handleCheckSurfaceDrift — useDriftScan.ts",
  },
  "governance.drift.review": {
    status: "enforce",
    summary: "Review drift items (mark-reviewed / send-back).",
    surface: "handleMarkReviewed / handleSendBackToReview — DriftInboxView.tsx",
  },
  "governance.decision.publish": {
    status: "register",
    summary: "Publish a decision to the client surface.",
  },
  "governance.decision.override": {
    status: "register",
    summary: "Override a system decision / recommendation.",
  },
  "governance.vote": {
    status: "register",
    summary: "Cast a governance vote.",
  },

  // reporting ─────────────────────────────────────────────────────────────────
  "reporting.export": {
    status: "register",
    summary: "Export a report / artifact.",
  },
  "reporting.share": {
    status: "register",
    summary: "Share a report externally.",
  },
} as const satisfies Record<string, CapabilityMeta>;

/** Every registered capability name (literal union). */
export type Capability = keyof typeof CAPABILITIES;

/** All enforce-now capabilities, derived so Steward always equals "all live caps". */
export const ENFORCE_CAPABILITIES: readonly Capability[] = (
  Object.keys(CAPABILITIES) as Capability[]
).filter((c) => CAPABILITIES[c].status === "enforce");

export function isEnforceable(cap: Capability): boolean {
  return CAPABILITIES[cap].status === "enforce";
}

// ── Role families ───────────────────────────────────────────────────────────
// Platform roles live on user_roles (global). Client roles live on
// company_members.role (per-company). Existing user_roles.'admin' === Steward.
export const PLATFORM_ROLES = ["Steward", "Strategist", "Facilitator", "Analyst"] as const;
export const CLIENT_ROLES = ["Sponsor", "Decision-Owner", "Contributor", "Participant", "Observer"] as const;

export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export type ClientRole = (typeof CLIENT_ROLES)[number];
export type RoleName = PlatformRole | ClientRole;

// ── Role bundles ──────────────────────────────────────────────────────────────
// A role grants the capabilities listed in its bundle. This checkpoint wires LIVE
// only: Steward (= admin, all enforce caps) and the client bundles per operator
// rulings. The non-Steward PLATFORM roles are registered by NAME with empty live
// bundles — the hook resolves ONLY Steward for the platform family this checkpoint,
// so they are provably inert. Their approved forward-design caps are recorded in
// PLATFORM_BUNDLE_INTENT below (documentation, NOT consumed).
export const ROLE_BUNDLES: Record<RoleName, readonly Capability[]> = {
  // platform (user_roles) — only Steward is live.
  Steward: ENFORCE_CAPABILITIES,
  Strategist: [],
  Facilitator: [],
  Analyst: [],

  // client (company_members.role).
  Sponsor: ["governance.proposal.apply", "governance.proposal.reject"],
  "Decision-Owner": [
    "governance.proposal.apply",
    "governance.proposal.reject",
    "structure.opportunity.generate",
    "structure.cascade.generate",
    "structure.route.generate",
    "structure.positioning.generate",
  ],
  Contributor: ["participation.suggest", "evidence.manage"],
  Participant: ["participation.suggest"],
  Observer: [],
};

// Forward-design intent for the non-Steward platform roles. NOT consumed by
// useCapability this checkpoint (the platform family resolves ONLY Steward via
// isAdmin). Recorded so later wiring has the approved shape; several distinguishing
// caps remain register-only until their surfaces exist.
export const PLATFORM_BUNDLE_INTENT: Record<Exclude<PlatformRole, "Steward">, readonly Capability[]> = {
  Strategist: [
    "structure.opportunity.generate",
    "structure.cascade.generate",
    "structure.route.generate",
    "structure.positioning.generate",
    "governance.proposal.apply",
    "governance.proposal.reject",
    "evidence.manage",
  ],
  Facilitator: ["governance.drift.review", "governance.drift.scan", "participation.suggest"],
  Analyst: ["evidence.refreshBaseline"],
};

// ── Pure resolver (the single role→capability authority) ──────────────────────

/**
 * Map a raw company_members.role string to a client bundle key.
 * Operator rulings: default 'member' → Participant; unknown / null → no role.
 * ('Decision-Owner' accepts both hyphen and snake_case storage forms.)
 * The CHECK/default reconcile that narrows the stored values is checkpoint 2.
 */
export function clientRoleToBundle(role: string | null | undefined): ClientRole | null {
  switch ((role ?? "").trim().toLowerCase()) {
    case "sponsor":
      return "Sponsor";
    case "decision-owner":
    case "decision_owner":
      return "Decision-Owner";
    case "contributor":
      return "Contributor";
    case "participant":
    case "member": // current table default — reconciles to Participant in checkpoint 2
      return "Participant";
    case "observer":
      return "Observer";
    default:
      return null;
  }
}

export interface CapabilityInput {
  /** From useAuth().isAdmin — true grants the global Steward bundle. */
  isAdmin: boolean;
  /** Raw company_members.role for the active (company, user); null when none. */
  clientRole?: string | null;
}

/** Resolve the full capability set for a principal. Pure; the single authority. */
export function resolveCapabilities(input: CapabilityInput): Set<Capability> {
  const caps = new Set<Capability>();
  if (input.isAdmin) {
    for (const c of ROLE_BUNDLES.Steward) caps.add(c);
  }
  const clientBundle = clientRoleToBundle(input.clientRole);
  if (clientBundle) {
    for (const c of ROLE_BUNDLES[clientBundle]) caps.add(c);
  }
  return caps;
}

/** Does this principal hold `cap`? Pure; wraps resolveCapabilities. */
export function hasCapability(cap: Capability, input: CapabilityInput): boolean {
  return resolveCapabilities(input).has(cap);
}
