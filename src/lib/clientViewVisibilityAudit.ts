export const CLIENT_VIEW_VISIBILITY_AUDIT_ROUTE = "/resources/client-view-audit";

export type VisibilityItem = {
  label: string;
  note?: string;
};

export type VisibilityBucket = {
  title: string;
  clientView: VisibilityItem[];
  internalOnly: VisibilityItem[];
};

export const CLIENT_VIEW_VISIBILITY_AUDIT: VisibilityBucket[] = [
  {
    title: "Pages",
    clientView: [
      { label: "Map", note: "`/` (simplified client rendering)" },
      { label: "Focus", note: "`/opportunities` (top priorities)" },
      { label: "Score", note: "`/analytics` (interpreted score)" },
      { label: "Strategy", note: "`/strategy` (direction + trade-offs)" },
    ],
    internalOnly: [
      { label: "Inputs", note: "`/inputs`" },
      { label: "Artifacts / Files", note: "`/files`" },
      { label: "Job Steps", note: "`/job-steps`" },
      { label: "Routes", note: "`/routes`" },
      { label: "Positioning", note: "`/positioning`" },
      { label: "Signal Map Prototype", note: "`/map-signal-prototype`" },
      { label: "Methodology / Process Pages", note: "`/process/*`" },
      { label: "Admin Area", note: "`/admin*`" },
      { label: "Client Onboarding MojoMap (admin)", note: "`/resources/client-onboarding-mojomap`" },
      { label: "Onboarding Map Editor (admin)", note: "`/resources/client-onboarding-mojomap/edit`" },
    ],
  },
  {
    title: "Widgets",
    clientView: [
      { label: "Primary Constraint block", note: "prominent summary card" },
      { label: "Next Move block", note: "single recommended action" },
      { label: "What This Means block", note: "plain-language interpretation" },
      { label: "Ownership Summary", note: "shown when ownership gaps exist" },
      { label: "Top Action cards", note: "owner + status + category" },
      { label: "MojoScore + Ownership Strength chips", note: "headline score framing" },
    ],
    internalOnly: [
      { label: "Full evidence/source confidence context bar", note: "internal diagnostic context" },
      { label: "Expanded methodology controls", note: "framework-facing controls" },
      { label: "Admin/ops toggles (LLM trace, admin controls)" },
      { label: "Deep operating controls", note: "editing + backend operations" },
    ],
  },
  {
    title: "Sections",
    clientView: [
      { label: "Outcome (short, decision-oriented framing)" },
      { label: "Primary Constraint (what is holding progress back)" },
      { label: "Top 3-5 priorities", note: "Fix/Improve first" },
      { label: "Ownership visibility", note: "clear owner and unowned signals" },
      { label: "What This Means + Next Move", note: "interpretation + immediate action" },
    ],
    internalOnly: [
      { label: "Raw inputs and interview mechanics" },
      { label: "Job-step granularity and system scaffolding" },
      { label: "Framework-level decomposition", note: "internal strategy structures" },
      { label: "Detailed scoring internals", note: "weights/signals/mechanics" },
      { label: "Full operating-system depth", note: "internal execution model" },
    ],
  },
];
