// Home view shared substrate — relocated verbatim from ClientRefinePreviewView (strand 3b batch 1).
export type LayerState = "command" | "map" | "narrative" | "drawer";
export type CommitState = "idle" | "committing" | "committed" | "next-revealed" | "waiting";
export type DrawerKey = "why" | "blocking" | "signals" | "progress";
export type RouteCategory = "Fix" | "Improve" | "Create";
export type TweakTab = "evidence" | "claims" | "foundation" | "assumptions" | "rerun" | "access";

export type AccessModes = {
  pills: boolean;
  inline: boolean;
  edge: boolean;
  footer: boolean;
};

export type DrawerRow = {
  key: string;
  value: string;
};

export type DrawerSection = {
  title: string;
  headline: string;
  big?: string;
  rows: DrawerRow[];
  compact?: boolean;
};

export const MODE_STORAGE_KEY = "phase5-modes";

export const DEFAULT_ACCESS_MODES: AccessModes = {
  pills: true,
  inline: true,
  edge: true,
  footer: false,
};

export const EDGE_DRAWERS: Array<{ key: DrawerKey; label: string }> = [
  { key: "why", label: "Why" },
  { key: "blocking", label: "Blocking" },
  { key: "signals", label: "Signals" },
  { key: "progress", label: "Progress" },
];


export const ROUTE_ORDER: RouteCategory[] = ["Fix", "Improve", "Create"];

export const ROUTE_DISPLAY_LABEL: Record<RouteCategory, string> = {
  Fix:     "Under Pressure",
  Improve: "Under Validation",
  Create:  "Directional",
};

export const ROUTE_FALLBACK_HEADLINE: Record<RouteCategory, string> = {
  Fix:     "Strongest friction signal — resolution most urgent.",
  Improve: "Evidence suggests pressure in this area — validation needed.",
  Create:  "New direction — no existing path covers this signal.",
};

export const MAP_ROUTE_CURVES: Record<RouteCategory, string> = {
  Fix: "M 880 300 C 960 300, 1050 288, 1140 264 S 1300 220, 1378 186",
  Improve: "M 880 300 C 962 270, 1048 226, 1138 192 S 1294 142, 1378 118",
  Create: "M 880 300 C 955 336, 1044 382, 1136 424 S 1298 498, 1378 540",
};

export const MAP_ROUTE_BADGES: Record<RouteCategory, { x: number; y: number }> = {
  Fix: { x: 1146, y: 258 },
  Improve: { x: 1146, y: 176 },
  Create: { x: 1146, y: 410 },
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function toSentence(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function lowerFirst(value: string | null | undefined) {
  const text = toSentence(value);
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : "";
}

export function stripTerminalPunctuation(value: string | null | undefined) {
  return toSentence(value).replace(/[.?!]+$/g, "");
}

export function formatHHmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function buildCenterHeroSupport(args: {
  publicIdentity: string | null;
}) {
  // Only surface public identity context here. Customer proof status is already
  // addressed in the center headline (strategy_outrunning_proof / customer_validation_converging)
  // — emitting it here creates within-hero duplication or contradiction.
  if (args.publicIdentity) {
    return `Outside perception reads as ${lowerFirst(args.publicIdentity)}.`;
  }
  return null;
}

export function shorten(value: string, max = 72) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

// Extracts the actor noun phrase from a job_executor string for use in conversational templates.
// "Independent cafe operators sourcing a specialty coffee offering." → "independent cafe operators"
// Falls back to null if the result would be too long (>40 chars) to fit a template slot cleanly.
export function deriveAudienceShort(jobExecutor: string | null | undefined): string | null {
  if (!jobExecutor) return null;
  const text = jobExecutor.replace(/\.$/, "").trim();
  // Truncate before the first gerund or prepositional phrase that extends the NP
  const match = text.match(/^(.+?)\s+(?:sourcing|seeking|looking|providing|selling|serving|for\s|who\s|that\s|to\s)/i);
  const noun = match ? match[1].trim() : text;
  const lower = noun.charAt(0).toLowerCase() + noun.slice(1);
  return lower.length <= 40 ? lower : null;
}

export function normalizeCompare(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function uniqueSentences(values: Array<string | null | undefined>, limit = 4) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const item = toSentence(value);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= limit) break;
  }
  return output;
}

export function hypothesisSourceMixSummary(row: {
  supportingClaims: Array<{
    supportShape: { outside: number; organization: number; customer: number };
  }>;
}) {
  const sourceMix = row.supportingClaims.reduce(
    (acc, claim) => {
      acc.outside += claim.supportShape.outside;
      acc.organization += claim.supportShape.organization;
      acc.customer += claim.supportShape.customer;
      return acc;
    },
    { outside: 0, organization: 0, customer: 0 },
  );

  const hasOutside = sourceMix.outside > 0;
  const hasOrganization = sourceMix.organization > 0;
  const hasCustomer = sourceMix.customer > 0;

  if (hasCustomer) {
    return "Customer evidence is starting to support this, but the pattern still needs more confirmation.";
  }
  if (hasOutside && hasOrganization) {
    return "Public and internal evidence point in this direction, but customer proof is still missing.";
  }
  if (hasOutside) {
    return "This is showing up in public signals, but we have not confirmed this with the team or customers yet.";
  }
  if (hasOrganization) {
    return "This is surfacing in internal evidence, but we have not confirmed this with customers yet.";
  }
  return "This is an early read from the evidence we have so far.";
}

export function parseAccessModes(raw: string | null): AccessModes {
  if (!raw) return DEFAULT_ACCESS_MODES;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      pills: Boolean(parsed["mode-pills"]),
      inline: Boolean(parsed["mode-inline"]),
      edge: Boolean(parsed["mode-edge"]),
      footer: Boolean(parsed["mode-footer"]),
    };
  } catch {
    return DEFAULT_ACCESS_MODES;
  }
}

export function confidenceBase(level: "Low" | "Medium" | "High") {
  if (level === "High") return 68;
  if (level === "Medium") return 52;
  return 38;
}

export function statusLabel(value: string) {
  if (value === "in_progress") return "In progress";
  if (value === "planned") return "Planned";
  if (value === "parked") return "Parked";
  if (value === "done") return "Done";
  return "Planned";
}

export function stateLabel(layer: LayerState) {
  if (layer === "map") return "Map";
  if (layer === "narrative") return "Narrative";
  if (layer === "drawer") return "Context drawer";
  return "Command";
}
