// Source provenance types and builders for inspect panels.
// Pure TypeScript — no JSX. Each panel calls the appropriate build function
// and passes the result to <SourcesUsedSection>.

export type SourceKind =
  | "file"
  | "social"
  | "public"
  | "interview"
  | "survey"
  | "human_edit"
  | "pasted"
  | "evidence_ref";

export interface SourceLink {
  kind:        SourceKind;
  title:       string;
  date?:       string;      // formatted, e.g. "Mar 2026"
  snippet?:    string;      // short excerpt ≤ 100 chars
  provenance:  "direct" | "inferred";  // inferred → show "Possibly used" qualifier
  disclaimer?: string;      // optional note, e.g. "Early signal — not customer validation."
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return undefined;
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch {
    return undefined;
  }
}

const SOCIAL_LABELS: Record<string, string> = {
  social_reddit:   "Reddit",
  social_review:   "Review site",
  social_twitter:  "Twitter / X",
  social_linkedin: "LinkedIn",
  social_forum:    "Forum",
  social_youtube:  "YouTube",
  social_news:     "News / Press",
};

function socialLabel(sp: string): string {
  return (
    SOCIAL_LABELS[sp] ??
    sp.replace("social_", "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function evidenceKind(title: string): SourceKind {
  const t = title.toLowerCase();
  if (t.includes("interview")) return "interview";
  if (t.includes("survey"))    return "survey";
  if (t.includes("social"))    return "social";
  if (t.includes("upload") || t.includes(".pdf") || t.includes(".doc") || t.includes("file")) return "file";
  return "evidence_ref";
}

// ── Per-panel builders ────────────────────────────────────────────────────────

type NeedLike = {
  source_path:             string;
  notes?:                  string | null;
  social_extraction_json?: unknown;
  created_at:              string;
};

export function buildNeedSourceLinks(need: NeedLike): SourceLink[] {
  const sources: SourceLink[] = [];
  const date = fmtDate(need.created_at);

  const sp = String(need.source_path || "").trim();
  if (sp) {
    const lower = sp.toLowerCase();

    if (lower.startsWith("social_")) {
      sources.push({
        kind:        "social",
        title:       socialLabel(sp),
        date,
        provenance:  "direct",
        disclaimer:  "Early signal — not customer validation.",
      });
    } else if (lower.startsWith("public") || lower.includes("baseline") || lower.includes("benchmark")) {
      sources.push({
        kind:       "public",
        title:      "Public signals baseline",
        provenance: "direct",
      });
    } else if (lower.startsWith("interview")) {
      sources.push({
        kind:       "interview",
        title:      sp,
        date,
        provenance: "direct",
      });
    } else if (lower.startsWith("survey")) {
      sources.push({
        kind:       "survey",
        title:      sp,
        date,
        provenance: "direct",
      });
    } else if (sp.includes("/")) {
      // Looks like a storage file path — extract the filename
      const basename = sp.split("/").pop() || sp;
      sources.push({
        kind:       "file",
        title:      basename,
        date,
        provenance: "direct",
      });
    } else {
      // Short label, unclear origin — inferred connection
      sources.push({
        kind:       "pasted",
        title:      sp,
        provenance: "inferred",
      });
    }
  }

  if (need.notes && String(need.notes).trim()) {
    sources.push({
      kind:       "human_edit",
      title:      "Outcome notes",
      snippet:    String(need.notes).slice(0, 100),
      provenance: "direct",
    });
  }

  // Social extraction blob present and no social source already added
  if (
    need.social_extraction_json !== null &&
    need.social_extraction_json !== undefined &&
    !sources.some((s) => s.kind === "social")
  ) {
    sources.push({
      kind:        "social",
      title:       "Extracted social signal",
      provenance:  "direct",
      disclaimer:  "Early signal — not customer validation.",
    });
  }

  return sources;
}

type RouteLike = {
  evidence_json?: unknown;
  created_at?:    string;
};

export function buildRouteSourceLinks(route: RouteLike): SourceLink[] {
  const raw = route.evidence_json;
  if (!Array.isArray(raw)) return [];

  const supporting = (raw as Array<{ id: string; title: string; status: string }>).filter(
    (e) => e.status !== "missing",
  );

  return supporting.map((item, i) => ({
    kind:       evidenceKind(item.title),
    title:      item.title,
    date:       i === 0 ? fmtDate(route.created_at) : undefined,
    provenance: item.status === "complete" ? "direct" : ("inferred" as const),
  }));
}

type CascadeItemLike = {
  name:      string;
  status:    string;
  evidence?: string;
};

type CascadeAssumptionLike = {
  assumption: string;
  tested:     boolean;
  outcome?:   string;
};

type CascadeLike = {
  capabilities:       CascadeItemLike[];
  management_systems: CascadeItemLike[];
  assumptions:        CascadeAssumptionLike[];
};

export function buildStrategySources(cascade: CascadeLike): SourceLink[] {
  const sources: SourceLink[] = [];

  // Capabilities with explicit evidence text → user-written reference
  for (const cap of cascade.capabilities) {
    if (cap.evidence && String(cap.evidence).trim()) {
      sources.push({
        kind:       "human_edit",
        title:      cap.name,
        snippet:    String(cap.evidence).slice(0, 100),
        provenance: "direct",
      });
    }
  }

  // Tested assumptions → human validation
  for (const a of cascade.assumptions) {
    if (a.tested) {
      sources.push({
        kind:       "human_edit",
        title:      `Assumption verified: ${String(a.assumption).slice(0, 80)}`,
        snippet:    a.outcome ? String(a.outcome).slice(0, 80) : undefined,
        provenance: "direct",
      });
    }
  }

  // Strong capabilities without explicit evidence → inferred signal
  const strongWithoutEvidence = cascade.capabilities.filter(
    (c) => c.status === "strong" && !String(c.evidence || "").trim(),
  );
  for (const cap of strongWithoutEvidence.slice(0, 3)) {
    sources.push({
      kind:       "human_edit",
      title:      cap.name,
      snippet:    "Marked as strong capability",
      provenance: "inferred",
    });
  }

  return sources;
}

type PositioningItemLike = { name: string };

type CanvasLike = {
  market_category?:         string | null;
  best_fit_customers?:      string | null;
  value_for_customer?:      string | null;
  category_rationale?:      string | null;
  competitive_alternatives: PositioningItemLike[];
  unique_attributes:        PositioningItemLike[];
};

export function buildPositioningSources(canvas: CanvasLike): SourceLink[] {
  const sources: SourceLink[] = [];

  const fields: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Market category",    value: canvas.market_category },
    { label: "Best-fit customers", value: canvas.best_fit_customers },
    { label: "Value proposition",  value: canvas.value_for_customer },
    { label: "Category rationale", value: canvas.category_rationale },
  ];

  for (const f of fields) {
    if (f.value && String(f.value).trim()) {
      sources.push({
        kind:       "human_edit",
        title:      f.label,
        snippet:    String(f.value).slice(0, 80),
        provenance: "direct",
      });
    }
  }

  if (canvas.competitive_alternatives.length > 0) {
    sources.push({
      kind:       "human_edit",
      title:      `Competitive alternatives (${canvas.competitive_alternatives.length})`,
      snippet:    canvas.competitive_alternatives.slice(0, 2).map((a) => a.name).join(", "),
      provenance: "direct",
    });
  }

  if (canvas.unique_attributes.length > 0) {
    sources.push({
      kind:       "human_edit",
      title:      `Unique attributes (${canvas.unique_attributes.length})`,
      snippet:    canvas.unique_attributes.slice(0, 2).map((a) => a.name).join(", "),
      provenance: "direct",
    });
  }

  return sources;
}
