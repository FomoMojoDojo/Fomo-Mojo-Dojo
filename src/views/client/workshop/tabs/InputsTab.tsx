import { useState, Fragment, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import { useCompanyFiles } from "@/hooks/useCompanyFiles";
import { useUpdateFileTags, useDeleteInputFile } from "@/hooks/useInputs";
import { useFileProposals, type FileProposalRow, type CandidateNeed } from "@/hooks/useFileProposals";
import SocialSignalsPanel from "./SocialSignalsPanel";
import { relativeTime } from "../helpers";
import { visibleFileTags, readAreaSupportTags, makeAreaSupportTag, isInternalFileTag } from "@/lib/fileTags";
import { mapInputToAreaKey, inferAreaHintsFromFileName } from "@/lib/areaMapping";
import FileUploadDialog from "@/components/FileUploadDialog";
import { supabase } from "@/integrations/supabase/client";

// ── Proposal accept payload types ────────────────────────────────────────────

type NeedAction =
  | { kind: "add";   need: CandidateNeed }
  | { kind: "merge"; need: CandidateNeed; targetId: string };

type GapAction =
  | { kind: "add";    gap: string }
  | { kind: "attach"; gap: string; targetId: string };

type RouteAction = { route: string };

type ProposalAcceptPayload = {
  areas:        FoundationArea[];
  needActions:  NeedAction[];
  gapActions:   GapAction[];
  routeActions: RouteAction[];
};

type BriefNeed = { id: string; desired_outcome: string; source_path: string };

// ── Foundation areas ───────────────────────────────────────────────────────────

type FoundationArea = "Positioning" | "Job Map" | "Opportunities" | "Model" | "Routes";

const FOUNDATION_AREAS: FoundationArea[] = [
  "Positioning", "Job Map", "Opportunities", "Model", "Routes",
];

// Reverse map: FoundationArea → __area:* key used by the analyze-file system.
const FOUNDATION_AREA_TO_AREA_KEY: Record<FoundationArea, string> = {
  Positioning:   "positioning",
  "Job Map":     "jobmap",
  Model:         "strategy",
  Opportunities: "odi",
  Routes:        "routes",
};

// Forward map: __area:* key → FoundationArea (for reading back).
const AREA_KEY_TO_FOUNDATION: Record<string, FoundationArea> = {
  positioning: "Positioning",
  strategy:    "Model",
  market:      "Opportunities",
  odi:         "Opportunities",
  jobmap:      "Job Map",
  job_map:     "Job Map",
  routes:      "Routes",
  competitive: "Positioning",
  brand:       "Positioning",
};

// Journey key labels for social signal classification.
const JOURNEY_KEY_OPTIONS: { key: string; label: string }[] = [
  { key: "customer",   label: "Customer experience" },
  { key: "revenue",    label: "Revenue growth" },
  { key: "operations", label: "Operational efficiency" },
];

function areasFromFileTags(tags: string[] | null, workshopTag: WorkshopTag | null): FoundationArea[] {
  const areas = new Set<FoundationArea>();
  for (const areaKey of readAreaSupportTags(tags)) {
    const mapped = AREA_KEY_TO_FOUNDATION[areaKey];
    if (mapped) areas.add(mapped);
  }
  // Fallback to workshop tag only when no AI area tags exist
  if (areas.size === 0 && workshopTag) {
    const mapped = WORKSHOP_TAG_TO_FOUNDATION[workshopTag];
    if (mapped) areas.add(mapped);
  }
  return [...areas];
}

function areasFromSocialNeed(need: OdiNeedRow): FoundationArea[] {
  const areas = new Set<FoundationArea>();
  if (need.journey_key) areas.add("Opportunities");
  if (need.step_label && need.step_number > 0) areas.add("Job Map");
  return [...areas];
}

// Replaces all __area:* tags in a file's tag array with new ones derived from
// the user's explicit area selection. Non-area tags (workshop tags, system tags)
// are preserved unchanged.
function applyAreaTags(existingTags: string[] | null | undefined, newAreas: FoundationArea[]): string[] {
  const stripped = (existingTags ?? []).filter((t) => !isInternalFileTag(t));
  const newAreaTags = newAreas
    .map((area) => makeAreaSupportTag(FOUNDATION_AREA_TO_AREA_KEY[area]))
    .filter(Boolean);
  return [...stripped, ...newAreaTags];
}

// ── Workshop tag system ────────────────────────────────────────────────────────

export const WORKSHOP_TAGS = [
  "Positioning", "Job Map", "Model", "Opportunities", "General",
] as const;
export type WorkshopTag = (typeof WORKSHOP_TAGS)[number];

const WORKSHOP_TAG_TO_FOUNDATION: Partial<Record<WorkshopTag, FoundationArea>> = {
  Positioning:   "Positioning",
  "Job Map":     "Job Map",
  Model:         "Model",
  Opportunities: "Opportunities",
};

const TAG_KEYWORDS: Record<Exclude<WorkshopTag, "General">, string[]> = {
  Positioning:   ["positioning", "position", "brand", "competitive", "differentiat", "value prop", "tagline"],
  "Job Map":     ["jobmap", "job-map", "job map", "journey", "jtbd", "jobs-to-be-done", "workflow", "process"],
  Model:         ["strategy", "strategic", "model", "cascade", "aspiration", "winning", "framework"],
  Opportunities: ["interview", "transcript", "survey", "research", "market", "customer", "odi", "opportunit", "insight"],
};

function suggestWorkshopTag(filename: string): WorkshopTag {
  const lower = filename.toLowerCase();
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS) as [Exclude<WorkshopTag, "General">, string[]][]) {
    if (keywords.some((kw) => lower.includes(kw))) return tag;
  }
  return "General";
}

function currentWorkshopTag(tags: string[] | null | undefined): WorkshopTag | null {
  for (const tag of tags ?? []) {
    if ((WORKSHOP_TAGS as readonly string[]).includes(tag)) return tag as WorkshopTag;
  }
  return null;
}

function applyWorkshopTag(existingTags: string[] | null | undefined, newTag: WorkshopTag): string[] {
  const stripped = (existingTags ?? []).filter((t) => !(WORKSHOP_TAGS as readonly string[]).includes(t));
  return [...stripped, newTag];
}

// ── Types ──────────────────────────────────────────────────────────────────────

type ProcessingStatus = "processed" | "uploading" | "uploaded";
type TypeFilter       = "all" | "social" | "interview" | "survey" | "file" | "note";
type FoundationFilter = "all" | "yes" | "no";

// Minimal input shape needed to call analyze-file and derive __area:* tags.
type MinimalInput = {
  id: string;
  input_key: string;
  input_label: string;
  sub_group: string;
  group_key: string;
};

interface SourceRow {
  id:                string;
  type:              "social" | "interview" | "survey" | "file" | "note";
  title:             string;
  source:            string;
  date:              string;
  status:            "early signal" | "internal input";
  areas:             FoundationArea[];
  inFoundation:      boolean;
  rawTags?:          string[] | null;
  workshopTag?:      WorkshopTag | null;
  suggestedTag?:     WorkshopTag;
  processingStatus:  ProcessingStatus;
  linkedNeeds:       string[];
  filePath?:         string;
  fileType?:         string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const SOCIAL_SOURCE_LABELS: Record<string, string> = {
  social_reddit:   "Reddit",
  social_review:   "Review site",
  social_twitter:  "Twitter / X",
  social_linkedin: "LinkedIn",
  social_forum:    "Forum",
  social_youtube:  "YouTube",
  social_news:     "News / Press",
};

function socialSourceLabel(sp: string): string {
  return (
    SOCIAL_SOURCE_LABELS[sp] ??
    sp.replace("social_", "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

// Maps internal FoundationArea values to user-facing display labels.
// "Model" is the internal key (maps to __area:strategy); users see "Strategy".
function areaDisplayLabel(area: FoundationArea): string {
  return area === "Model" ? "Strategy" : area;
}

function fileProposalStatusLabel(proposal: FileProposalRow): string {
  switch (proposal.processing_state) {
    case "queued":
      return "Dify queued…";
    case "running":
      return "Dify processing…";
    case "failed":
      return "Dify failed — review";
    case "ready":
    default:
      return "Review proposal →";
  }
}

function isQueuedPlaceholderSummary(summary: string): boolean {
  return summary.trim() === "Dify analysis queued. Results will appear when processing finishes.";
}

// Derives processing status purely from tags — no DB column needed.
// __area:* tags are written by FileUploadDialog after AI routing; their presence
// means the analyze-file edge function ran and assigned at least one foundation area.
function deriveProcessingStatus(tags: string[] | null, uploadedAt: string): ProcessingStatus {
  if (readAreaSupportTags(tags).length > 0) return "processed";
  const ageMs = Date.now() - Date.parse(uploadedAt);
  if (Number.isFinite(ageMs) && ageMs < 2 * 60 * 1000) return "uploading";
  return "uploaded";
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "monospace" };

const LABEL_TINY: React.CSSProperties = {
  fontFamily: "monospace", fontSize: 9, letterSpacing: "0.1em",
  textTransform: "uppercase", color: "#999",
};

const TH: React.CSSProperties = {
  textAlign: "left", padding: "0 14px 10px 0", color: "#999",
  fontWeight: 600, fontSize: 9, letterSpacing: "0.09em",
  textTransform: "uppercase", whiteSpace: "nowrap",
};
const TD: React.CSSProperties = { padding: "9px 14px 9px 0", verticalAlign: "middle" };

// ── Sub-components ─────────────────────────────────────────────────────────────

function PrimaryAddBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{
      ...MONO, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 600,
      color: active ? "#fff" : "#333", background: active ? "#2d2d2d" : "#fff",
      border: `1px solid ${active ? "#2d2d2d" : "#c8c2ba"}`, borderRadius: 4, padding: "8px 18px", cursor: "pointer",
    }}>
      {active ? "↑ Cancel" : `+ ${label}`}
    </button>
  );
}

// "Applied in" cell — shows areas (with linked-need hover detail) for used rows,
// "Apply →" button for unused rows.
function UsedByCell({
  areas, linkedNeeds, onUseThis,
}: {
  areas: FoundationArea[]; linkedNeeds: string[]; onUseThis: () => void;
}) {
  if (areas.length === 0) {
    return (
      <button
        type="button"
        onClick={onUseThis}
        style={{
          ...MONO, fontSize: 10, letterSpacing: "0.04em",
          color: "#b0a898", background: "none", border: "none",
          padding: 0, cursor: "pointer", textDecoration: "underline",
          textDecorationStyle: "dashed",
          textUnderlineOffset: 3,
        }}
      >
        Apply →
      </button>
    );
  }
  const rest = areas.length - 1;
  const firstLabel = areaDisplayLabel(areas[0]);
  const tooltip = linkedNeeds.length > 0
    ? `Applied in ${firstLabel}:\n${linkedNeeds.slice(0, 5).map((n) => `• ${n}`).join("\n")}${linkedNeeds.length > 5 ? `\n…+${linkedNeeds.length - 5} more` : ""}`
    : areas.map(areaDisplayLabel).join(", ");
  return (
    <span title={tooltip} style={{ cursor: "help" }}>
      <span style={{ ...MONO, fontSize: 10, color: "#444" }}>{firstLabel}</span>
      {rest > 0 && <span style={{ ...MONO, fontSize: 9, color: "#aaa", marginLeft: 4 }}>+{rest}</span>}
    </span>
  );
}

// "Apply to" inline panel — renders as a table row below the input row.
function UseThisPanel({
  row,
  onClose,
  onSave,
}: {
  row: SourceRow;
  onClose: () => void;
  onSave: (args: { areas?: FoundationArea[]; journeyKey?: string }) => void;
}) {
  const [selectedAreas, setSelectedAreas] = useState<Set<FoundationArea>>(
    () => new Set(row.areas),
  );
  const [journeyKey, setJourneyKey] = useState("customer");

  function toggleArea(area: FoundationArea) {
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  }

  const isFile   = row.type === "file";
  const canSave  = isFile ? selectedAreas.size > 0 : !!journeyKey;

  function handleSave() {
    if (isFile) {
      onSave({ areas: [...selectedAreas] });
    } else {
      onSave({ journeyKey, areas: ["Opportunities"] });
    }
  }

  return (
    <div style={{
      background: "#f9f7f4", border: "1px solid #ede9e4", borderRadius: 4,
      padding: "16px 20px", margin: "2px 0 8px",
    }}>
      <div style={{ ...LABEL_TINY, marginBottom: 14 }}>Apply to</div>

      {isFile ? (
        // Area checkboxes — pre-populated from existing areas
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px", marginBottom: 16 }}>
          {FOUNDATION_AREAS.map((area) => (
            <label
              key={area}
              style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", userSelect: "none" }}
            >
              <input
                type="checkbox"
                checked={selectedAreas.has(area)}
                onChange={() => toggleArea(area)}
                style={{ cursor: "pointer", accentColor: "#2d2d2d" }}
              />
              <span style={{ ...MONO, fontSize: 11, color: selectedAreas.has(area) ? "#333" : "#888" }}>
                {areaDisplayLabel(area)}
              </span>
            </label>
          ))}
        </div>
      ) : (
        // Social signals: only Opportunities is writable; select journey sub-group
        <div style={{ marginBottom: 16 }}>
          <p style={{ ...MONO, fontSize: 11, color: "#888", margin: "0 0 10px" }}>
            Connect this signal to an opportunity group:
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {JOURNEY_KEY_OPTIONS.map(({ key, label }) => (
              <label
                key={key}
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
              >
                <input
                  type="radio"
                  name={`journey-${row.id}`}
                  checked={journeyKey === key}
                  onChange={() => setJourneyKey(key)}
                  style={{ cursor: "pointer", accentColor: "#2d2d2d" }}
                />
                <span style={{ ...MONO, fontSize: 11, color: journeyKey === key ? "#333" : "#888" }}>
                  {label}
                </span>
              </label>
            ))}
          </div>
          <p style={{ ...MONO, fontSize: 10, color: "#bbb", margin: "10px 0 0" }}>
            Job step linking requires step selection — coming next.
          </p>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          style={{
            ...MONO, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase",
            fontWeight: 600, color: canSave ? "#fff" : "#ccc",
            background: canSave ? "#2d2d2d" : "#eee",
            border: "none", borderRadius: 3, padding: "6px 16px",
            cursor: canSave ? "pointer" : "default",
          }}
        >
          Apply
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            ...MONO, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase",
            color: "#aaa", background: "none", border: "none", cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Inline confirmation panel for used files — never deletes foundation content.
function DeleteConfirmPanel({
  row,
  deleting,
  onClose,
  onConfirm,
}: {
  row: SourceRow;
  deleting: boolean;
  onClose: () => void;
  onConfirm: (mode: "file-only" | "file-and-unlink") => void;
}) {
  return (
    <div style={{
      background: "#fdf8f7", border: "1px solid #e8cfc7", borderRadius: 4,
      padding: "16px 20px", margin: "2px 0 8px",
    }}>
      <div style={{ ...LABEL_TINY, marginBottom: 10 }}>Remove file</div>
      <p style={{ ...MONO, fontSize: 11, color: "#555", margin: "0 0 8px", lineHeight: 1.5 }}>
        This file is applied in:
      </p>
      <ul style={{ margin: "0 0 12px", padding: "0 0 0 14px" }}>
        {row.areas.map((area) => (
          <li key={area} style={{ ...MONO, fontSize: 11, color: "#444", marginBottom: 3 }}>
            {areaDisplayLabel(area)}
          </li>
        ))}
      </ul>
      <p style={{ ...MONO, fontSize: 10, color: "#888", margin: "0 0 14px" }}>
        What would you like to do?
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button
          type="button"
          disabled={deleting}
          onClick={() => onConfirm("file-only")}
          style={{
            ...MONO, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
            fontWeight: 600, color: deleting ? "#ccc" : "#fff",
            background: deleting ? "#eee" : "#c0392b",
            border: "none", borderRadius: 3, padding: "6px 14px",
            cursor: deleting ? "default" : "pointer",
          }}
        >
          Remove file only
        </button>
        <button
          type="button"
          disabled={deleting}
          onClick={() => onConfirm("file-and-unlink")}
          style={{
            ...MONO, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
            color: deleting ? "#ccc" : "#c0392b",
            background: "#fdf8f7", border: "1px solid #e8cfc7",
            borderRadius: 3, padding: "6px 14px",
            cursor: deleting ? "default" : "pointer",
          }}
        >
          Remove file and unlink
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            ...MONO, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase",
            color: "#aaa", background: "none", border: "none", cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
      <p style={{ ...MONO, fontSize: 9, color: "#c8c2ba", margin: "12px 0 0", lineHeight: 1.5 }}>
        Foundation content — needs, routes, positioning, strategy — will not be deleted.
      </p>
    </div>
  );
}

// Dify proposal review panel — rendered as an inline table row expansion.
// Shows the full proposal output and lets the user selectively apply areas,
// insert needs/gaps, and create draft routes before accepting.
function ProposalReviewPanel({
  proposal,
  existingNeeds,
  onClose,
  onAccept,
  onReject,
}: {
  proposal: FileProposalRow;
  existingNeeds: BriefNeed[];
  onClose: () => void;
  onAccept: (payload: ProposalAcceptPayload) => void;
  onReject: () => void;
}) {
  const isProcessing = proposal.processing_state === "queued" || proposal.processing_state === "running";
  const isFailed = proposal.processing_state === "failed";
  const isReady = proposal.processing_state === "ready";
  const showSummary = Boolean(proposal.summary) && !(isProcessing && isQueuedPlaceholderSummary(proposal.summary));
  const initialAreas = proposal.suggested_areas
    .map((a) => AREA_KEY_TO_FOUNDATION[a])
    .filter((a): a is FoundationArea => !!a);

  const [selectedAreas, setSelectedAreas] = useState<Set<FoundationArea>>(
    () => new Set(initialAreas),
  );

  const needs  = proposal.candidate_needs   as CandidateNeed[];
  const gaps   = proposal.possible_gaps     as string[];
  const routes = proposal.possible_routes   as string[];
  const questions = proposal.questions_to_verify as string[];

  // Per-need: checked + optional merge target (empty string = "add new")
  const [needChecked,     setNeedChecked]     = useState<Set<number>>(() => new Set());
  const [needMergeTarget, setNeedMergeTarget] = useState<Map<number, string>>(() => new Map());

  // Per-gap: checked + optional attach target
  const [gapChecked,      setGapChecked]      = useState<Set<number>>(() => new Set());
  const [gapAttachTarget, setGapAttachTarget] = useState<Map<number, string>>(() => new Map());

  // Per-route: checked
  const [routeChecked, setRouteChecked] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    setSelectedAreas(new Set(initialAreas));
    setNeedChecked(new Set());
    setNeedMergeTarget(new Map());
    setGapChecked(new Set());
    setGapAttachTarget(new Map());
    setRouteChecked(new Set());
  }, [proposal.id, proposal.processing_state, proposal.suggested_areas]);

  function toggleArea(area: FoundationArea) {
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area); else next.add(area);
      return next;
    });
  }

  function toggleNeed(i: number) {
    setNeedChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) { next.delete(i); } else { next.add(i); }
      return next;
    });
  }

  function toggleGap(i: number) {
    setGapChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) { next.delete(i); } else { next.add(i); }
      return next;
    });
  }

  function toggleRoute(i: number) {
    setRouteChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) { next.delete(i); } else { next.add(i); }
      return next;
    });
  }

  const totalSelected =
    selectedAreas.size + needChecked.size + gapChecked.size + routeChecked.size;

  function buildPayload(): ProposalAcceptPayload {
    const needActions: NeedAction[] = [];
    needs.forEach((need, i) => {
      if (!needChecked.has(i)) return;
      const targetId = needMergeTarget.get(i) ?? "";
      if (targetId) {
        needActions.push({ kind: "merge", need, targetId });
      } else {
        needActions.push({ kind: "add", need });
      }
    });

    const gapActions: GapAction[] = [];
    gaps.forEach((gap, i) => {
      if (!gapChecked.has(i)) return;
      const targetId = gapAttachTarget.get(i) ?? "";
      if (targetId) {
        gapActions.push({ kind: "attach", gap, targetId });
      } else {
        gapActions.push({ kind: "add", gap });
      }
    });

    const routeActions: RouteAction[] = [];
    routes.forEach((route, i) => {
      if (routeChecked.has(i)) routeActions.push({ route });
    });

    return { areas: [...selectedAreas], needActions, gapActions, routeActions };
  }

  const confidenceColor =
    proposal.confidence === "high" ? "#1a8f5a"
    : proposal.confidence === "medium" ? "#c97700"
    : "#888";

  const SELECT_STYLE: React.CSSProperties = {
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontSize: 10, color: "#555",
    border: "1px solid #c8d8c8", borderRadius: 3,
    padding: "2px 4px", background: "#fff",
    maxWidth: 280, cursor: "pointer",
  };

  return (
    <div style={{
      background: "#f5faf7", border: "1px solid #b8d8c8", borderRadius: 4,
      padding: "16px 20px", margin: "2px 0 8px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ ...LABEL_TINY }}>Dify Analysis</div>
        <span style={{ ...MONO, fontSize: 9, color: confidenceColor, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 700 }}>
          {proposal.confidence} confidence
        </span>
      </div>

      {proposal.signal_type && (
        <p style={{ ...MONO, fontSize: 10, color: "#888", margin: "0 0 8px" }}>
          Detected as: <span style={{ color: "#555" }}>{proposal.signal_type}</span>
        </p>
      )}

      {showSummary && (
        <p style={{ ...MONO, fontSize: 11, color: "#444", margin: "0 0 14px", lineHeight: 1.6 }}>
          {proposal.summary}
        </p>
      )}

      {isProcessing && (
        <p style={{ ...MONO, fontSize: 10, color: "#888", margin: "0 0 14px", lineHeight: 1.6 }}>
          {proposal.processing_state === "queued"
            ? "Dify analysis is queued. This panel will refresh automatically when processing finishes."
            : "Dify analysis is running. This panel will refresh automatically when processing finishes."}
        </p>
      )}

      {isFailed && proposal.processing_error && (
        <p style={{ ...MONO, fontSize: 10, color: "#c0392b", margin: "0 0 14px", lineHeight: 1.6 }}>
          Dify failed: {proposal.processing_error}
        </p>
      )}

      {/* Foundation areas */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Foundation areas</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
          {FOUNDATION_AREAS.map((area) => {
            const isSuggested = initialAreas.includes(area);
            return (
              <label key={area} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none", opacity: isSuggested ? 1 : 0.4 }}>
                <input
                  type="checkbox"
                  checked={selectedAreas.has(area)}
                  onChange={() => toggleArea(area)}
                  disabled={!isReady}
                  style={{ cursor: "pointer", accentColor: "#2d8a60" }}
                />
                <span style={{ ...MONO, fontSize: 11, color: selectedAreas.has(area) ? "#333" : "#aaa" }}>
                  {areaDisplayLabel(area)}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Opportunities */}
      {needs.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Opportunities</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {needs.map((n, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={needChecked.has(i)}
                    onChange={() => toggleNeed(i)}
                    disabled={!isReady}
                    style={{ marginTop: 2, cursor: "pointer", accentColor: "#2d8a60" }}
                  />
                  <span style={{ ...MONO, fontSize: 10, color: "#444", lineHeight: 1.5, flex: 1 }}>
                    {n.desired_outcome}
                    {typeof n.importance === "number" && (
                      <span style={{ color: "#bbb", marginLeft: 6 }}>imp {n.importance}/10</span>
                    )}
                  </span>
                </label>
                {needChecked.has(i) && (
                  <div style={{ marginLeft: 22 }}>
                    <select
                      value={needMergeTarget.get(i) ?? ""}
                      disabled={!isReady}
                      onChange={(e) => setNeedMergeTarget((prev) => {
                        const next = new Map(prev);
                        if (e.target.value) next.set(i, e.target.value); else next.delete(i);
                        return next;
                      })}
                      style={SELECT_STYLE}
                    >
                      <option value="">Add as new opportunity</option>
                      {existingNeeds.map((en) => (
                        <option key={en.id} value={en.id}>
                          Merge with: {en.desired_outcome.slice(0, 55)}{en.desired_outcome.length > 55 ? "…" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gaps */}
      {gaps.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Gaps</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {gaps.map((g, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                  <input
                    type="checkbox"
                    checked={gapChecked.has(i)}
                    onChange={() => toggleGap(i)}
                    disabled={!isReady}
                    style={{ marginTop: 2, cursor: "pointer", accentColor: "#2d8a60" }}
                  />
                  <span style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5, flex: 1 }}>{g}</span>
                </label>
                {gapChecked.has(i) && (
                  <div style={{ marginLeft: 22 }}>
                    <select
                      value={gapAttachTarget.get(i) ?? ""}
                      disabled={!isReady}
                      onChange={(e) => setGapAttachTarget((prev) => {
                        const next = new Map(prev);
                        if (e.target.value) next.set(i, e.target.value); else next.delete(i);
                        return next;
                      })}
                      style={SELECT_STYLE}
                    >
                      <option value="">Add as standalone gap</option>
                      {existingNeeds.map((en) => (
                        <option key={en.id} value={en.id}>
                          Attach to: {en.desired_outcome.slice(0, 55)}{en.desired_outcome.length > 55 ? "…" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Routes */}
      {routes.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Routes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {routes.map((r, i) => (
              <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={routeChecked.has(i)}
                  onChange={() => toggleRoute(i)}
                  disabled={!isReady}
                  style={{ marginTop: 2, cursor: "pointer", accentColor: "#2d8a60" }}
                />
                <span style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5, flex: 1 }}>
                  {r}
                  <span style={{ color: "#bbb", marginLeft: 6 }}>→ draft route</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Questions to verify */}
      {questions.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 6 }}>Questions to verify</div>
          <ul style={{ margin: 0, padding: "0 0 0 12px" }}>
            {questions.slice(0, 4).map((q, i) => (
              <li key={i} style={{ ...MONO, fontSize: 10, color: "#888", marginBottom: 3, fontStyle: "italic", lineHeight: 1.4 }}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
        <button
          type="button"
          disabled={!isReady || totalSelected === 0}
          onClick={() => onAccept(buildPayload())}
          style={{
            ...MONO, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
            fontWeight: 600,
            color: !isReady || totalSelected === 0 ? "#ccc" : "#fff",
            background: !isReady || totalSelected === 0 ? "#eee" : "#2d8a60",
            border: "none", borderRadius: 3, padding: "6px 14px",
            cursor: !isReady || totalSelected === 0 ? "default" : "pointer",
          }}
        >
          Accept{totalSelected > 0 ? ` & apply ${totalSelected} selected` : ""}
        </button>
        <button
          type="button"
          disabled={isProcessing}
          onClick={onReject}
          style={{
            ...MONO, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
            color: isProcessing ? "#ccc" : "#c0392b",
            background: "#f5faf7", border: "1px solid #b8d8c8",
            borderRadius: 3, padding: "6px 14px", cursor: isProcessing ? "default" : "pointer",
          }}
        >
          Reject
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            ...MONO, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase",
            color: "#aaa", background: "none", border: "none", cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
      <p style={{ ...MONO, fontSize: 9, color: "#c8c2ba", margin: "12px 0 0", lineHeight: 1.5 }}>
        {isReady
          ? "Only checked items will be applied. Nothing is created without your selection."
          : isFailed
            ? "This proposal did not complete cleanly. Retry Dify analysis from the file row if needed."
            : "This proposal is not reviewable yet. Wait for Dify processing to finish before accepting or rejecting it."}
      </p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function InputsTab({
  companyId,
  companyName,
  socialNeeds,
  onAdded,
}: {
  companyId:    string | null;
  companyName?: string;
  socialNeeds:  OdiNeedRow[];
  onAdded:      () => void;
}) {
  const [showSocial,       setShowSocial]       = useState(false);
  const [typeFilter,       setTypeFilter]       = useState<TypeFilter>("all");
  const [foundationFilter, setFoundationFilter] = useState<FoundationFilter>("all");
  const [openUpload,       setOpenUpload]       = useState(false);
  const [useThisId,        setUseThisId]        = useState<string | null>(null);

  const { data: companyFiles = [], refetch: refetchFiles } = useCompanyFiles(companyId);
  const updateFileTags = useUpdateFileTags();

  // Lightweight fetch of all company needs to build source_path → desired_outcomes map
  // and to populate merge/attach dropdowns in ProposalReviewPanel.
  const { data: allNeeds = [] } = useQuery({
    queryKey: ['company-needs-brief', companyId],
    queryFn: async (): Promise<BriefNeed[]> => {
      if (!companyId) return [];
      const { data } = await supabase
        .from('odi_needs')
        .select('id, desired_outcome, source_path')
        .eq('company_id', companyId);
      return (data ?? []) as BriefNeed[];
    },
    enabled: !!companyId,
  });

  const linkedNeedsByFilePath = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const need of allNeeds) {
      if (!need.source_path) continue;
      const existing = map.get(need.source_path) ?? [];
      existing.push(need.desired_outcome);
      map.set(need.source_path, existing);
    }
    return map;
  }, [allNeeds]);

  // Minimal inputs list — needed to resolve cross_area_input_ids from analyze-file response.
  const { data: companyInputs = [] } = useQuery({
    queryKey: ['company-inputs-minimal', companyId],
    queryFn: async (): Promise<MinimalInput[]> => {
      if (!companyId) return [];
      const { data } = await supabase
        .from('inputs')
        .select('id, input_key, input_label, sub_group, group_key')
        .eq('company_id', companyId);
      return (data ?? []) as MinimalInput[];
    },
    enabled: !!companyId,
  });

  const [analyzingFileId,  setAnalyzingFileId]  = useState<string | null>(null);
  const [analyzeFailedIds, setAnalyzeFailedIds] = useState<ReadonlySet<string>>(new Set());

  const deleteFileMutation = useDeleteInputFile();
  const [deleteConfirmId,  setDeleteConfirmId]  = useState<string | null>(null);
  const [deletingFileId,   setDeletingFileId]   = useState<string | null>(null);

  async function handleDeleteFile(row: SourceRow, mode: "file-only" | "file-and-unlink") {
    setDeleteConfirmId(null);
    setDeletingFileId(row.id);
    try {
      await deleteFileMutation.mutateAsync({ id: row.id, filePath: row.filePath ?? "" });
      if (mode === "file-and-unlink" && row.filePath) {
        await supabase.from("odi_needs").update({ source_path: "" }).eq("source_path", row.filePath);
      }
      await refetchFiles();
    } catch {
      await refetchFiles();
    } finally {
      setDeletingFileId(null);
    }
  }

  // ── Dify proposal state ────────────────────────────────────────────────────

  const { data: fileProposals = [], refetch: refetchProposals } = useFileProposals(companyId);

  const proposalByFileId = useMemo(() => {
    const map = new Map<string, FileProposalRow>();
    for (const p of fileProposals) {
      if (!map.has(p.file_id)) map.set(p.file_id, p);
    }
    return map;
  }, [fileProposals]);

  const [proposalPanelId,     setProposalPanelId]     = useState<string | null>(null);
  const [difyAnalyzingFileId, setDifyAnalyzingFileId] = useState<string | null>(null);
  const [difyFailedIds,       setDifyFailedIds]       = useState<ReadonlySet<string>>(new Set());

  async function handleDifyAnalyze(row: SourceRow) {
    if (!row.filePath || !companyId) return;
    setDifyAnalyzingFileId(row.id);
    setDifyFailedIds((prev) => { const next = new Set(prev); next.delete(row.id); return next; });
    try {
      const { data, error } = await supabase.functions.invoke("dify-analyze-file", {
        body: {
          fileId:     row.id,
          filePath:   row.filePath,
          fileName:   row.title,
          fileType:   row.fileType ?? "",
          companyId,
          sourceType: row.type,
        },
      });
      if (error || (data as Record<string, unknown> | null)?.error) {
        throw new Error("Dify analysis failed");
      }
      await refetchProposals();
      setProposalPanelId(row.id);
    } catch {
      setDifyFailedIds((prev) => new Set([...prev, row.id]));
    } finally {
      setDifyAnalyzingFileId(null);
    }
  }

  async function handleAcceptProposal(row: SourceRow, proposal: FileProposalRow, payload: ProposalAcceptPayload) {
    setProposalPanelId(null);

    // 1. Apply area tags to the source file
    if (payload.areas.length > 0) {
      const newTags = applyAreaTags(row.rawTags, payload.areas);
      await supabase.from("input_files").update({ tags: newTags }).eq("id", row.id);
    }

    // 2. Get current user id for DB inserts
    const { data: { user } } = await supabase.auth.getUser();
    const userId = user?.id;

    // 3. Insert new needs / append to existing via notes
    for (const action of payload.needActions) {
      if (action.kind === "add" && userId && companyId) {
        const imp = Math.max(0, Math.min(10, action.need.importance ?? 0));
        const sat = Math.max(0, Math.min(10, action.need.satisfaction ?? 0));
        const oppScore = imp + Math.max(0, imp - sat);
        const serviceState = oppScore >= 10 ? "underserved" : sat > imp + 1 ? "overserved" : "served";
        await supabase.from("odi_needs").insert({
          company_id:        companyId,
          user_id:           userId,
          desired_outcome:   action.need.desired_outcome,
          importance:        imp,
          satisfaction:      sat,
          opportunity_score: oppScore,
          service_state:     serviceState,
          source_path:       row.filePath ?? "dify_analysis",
          frameworks_used:   ["dify_analysis"],
          tier:              "need",
          journey_key:       "customer",
          step_number:       0,
          step_label:        "",
        });
      } else if (action.kind === "merge") {
        const { data: existing } = await supabase
          .from("odi_needs").select("notes").eq("id", action.targetId).single();
        const appended = `${((existing?.notes as string | null) ?? "").trimEnd()}\n[Dify proposal] ${action.need.desired_outcome}`.trimStart();
        await supabase.from("odi_needs").update({ notes: appended }).eq("id", action.targetId);
      }
    }

    // 4. Insert gap needs / attach to existing via notes
    for (const action of payload.gapActions) {
      if (action.kind === "add" && userId && companyId) {
        await supabase.from("odi_needs").insert({
          company_id:        companyId,
          user_id:           userId,
          desired_outcome:   action.gap,
          importance:        0,
          satisfaction:      0,
          opportunity_score: 0,
          service_state:     "served",
          source_path:       row.filePath ?? "dify_analysis",
          frameworks_used:   ["dify_analysis"],
          tier:              "want",
          journey_key:       "customer",
          step_number:       0,
          step_label:        "Gap identified by Dify",
        });
      } else if (action.kind === "attach") {
        const { data: existing } = await supabase
          .from("odi_needs").select("notes").eq("id", action.targetId).single();
        const appended = `${((existing?.notes as string | null) ?? "").trimEnd()}\n[Gap] ${action.gap}`.trimStart();
        await supabase.from("odi_needs").update({ notes: appended }).eq("id", action.targetId);
      }
    }

    // 5. Insert draft routes
    if (userId && companyId) {
      for (const action of payload.routeActions) {
        await supabase.from("routes").insert({
          company_id:        companyId,
          user_id:           userId,
          title:             action.route,
          category:          "improve",
          type:              "Improve",
          short_description: "",
          pts_value:         0,
          effort:            "medium",
          sort_order:        1,
        });
      }
    }

    // 6. Mark proposal accepted
    await supabase.from("file_proposals").update({
      status:        "accepted",
      applied_areas: payload.areas.map((a) => FOUNDATION_AREA_TO_AREA_KEY[a]),
      reviewed_at:   new Date().toISOString(),
    }).eq("id", proposal.id);

    await refetchFiles();
    await refetchProposals();
  }

  async function handleRejectProposal(proposal: FileProposalRow) {
    setProposalPanelId(null);
    await supabase.from("file_proposals").update({
      status:      "rejected",
      reviewed_at: new Date().toISOString(),
    }).eq("id", proposal.id);
    await refetchProposals();
  }

  async function handleAnalyze(row: SourceRow) {
    if (!row.filePath) return;
    setAnalyzingFileId(row.id);
    setAnalyzeFailedIds((prev) => { const next = new Set(prev); next.delete(row.id); return next; });

    try {
      const inputAreas = companyInputs.map((i) => ({
        id: i.id,
        input_key: i.input_key,
        input_label: i.input_label,
        sub_group: i.sub_group,
        group_key: i.group_key,
      }));

      const { data, error } = await supabase.functions.invoke('analyze-file', {
        body: {
          fileName: row.title,
          filePath: row.filePath,
          fileType: row.fileType ?? '',
          inputAreas,
        },
      });

      if (error || (data as Record<string, unknown> | null)?.error) throw new Error('Analysis failed');

      // Resolve __area:* tags from the analysis result
      const inputById = new Map(companyInputs.map((i) => [i.id, i]));
      const suggestedInputId = typeof (data as Record<string, unknown>)?.suggested_input_id === 'string'
        ? String((data as Record<string, unknown>).suggested_input_id)
        : null;
      const crossAreaIds: string[] = Array.isArray((data as Record<string, unknown>)?.cross_area_input_ids)
        ? ((data as Record<string, unknown>).cross_area_input_ids as unknown[]).filter((v): v is string => typeof v === 'string')
        : [];
      const suggestedTagsRaw: string[] = Array.isArray((data as Record<string, unknown>)?.suggested_tags)
        ? ((data as Record<string, unknown>).suggested_tags as unknown[]).filter((v): v is string => typeof v === 'string')
        : [];

      const areaTagSet = new Set<string>();
      const primaryInput = suggestedInputId ? inputById.get(suggestedInputId) : null;
      if (primaryInput) areaTagSet.add(makeAreaSupportTag(mapInputToAreaKey(primaryInput)));
      for (const crossId of crossAreaIds) {
        const input = inputById.get(crossId);
        if (input) areaTagSet.add(makeAreaSupportTag(mapInputToAreaKey(input)));
      }
      // Fallback when no input could be matched: use filename-based area hints
      if (areaTagSet.size === 0) {
        for (const areaKey of inferAreaHintsFromFileName(row.title)) {
          areaTagSet.add(makeAreaSupportTag(areaKey));
        }
      }

      // Merge: strip old __area:* tags, write new ones, preserve other tags
      const existingNonAreaTags = (row.rawTags ?? []).filter((t) => !isInternalFileTag(t));
      const newTags = [...new Set([...existingNonAreaTags, ...suggestedTagsRaw, ...areaTagSet])];

      const { error: updateError } = await supabase
        .from('input_files')
        .update({ tags: newTags })
        .eq('id', row.id);
      if (updateError) throw updateError;

      await refetchFiles();
    } catch {
      setAnalyzeFailedIds((prev) => new Set([...prev, row.id]));
    } finally {
      setAnalyzingFileId(null);
    }
  }

  async function handleUseThis(row: SourceRow, { areas, journeyKey }: { areas?: FoundationArea[]; journeyKey?: string }) {
    setUseThisId(null);
    if (row.type === "file" && areas && areas.length > 0) {
      // Write __area:* tags so areasFromFileTags picks them up on next render
      updateFileTags.mutate({ id: row.id, tags: applyAreaTags(row.rawTags, areas) });
    } else if (row.type === "social" && journeyKey) {
      // Write journey_key so areasFromSocialNeed picks it up; parent re-fetches via onAdded
      const { error } = await supabase
        .from("odi_needs")
        .update({ journey_key: journeyKey })
        .eq("id", row.id);
      if (!error) onAdded();
    }
  }

  // ── Build source rows ──────────────────────────────────────────────────────

  const fileRows: SourceRow[] = companyFiles.map((f) => {
    const workshopTag = currentWorkshopTag(f.tags);
    const areas       = areasFromFileTags(f.tags, workshopTag);
    const userTags    = visibleFileTags(f.tags, f.uploaded_at)
      .filter((t) => !(WORKSHOP_TAGS as readonly string[]).includes(t));
    return {
      id:               f.id,
      type:             "file",
      title:            f.file_name,
      source:           userTags[0] ?? (f.file_type ? f.file_type.toUpperCase() : "—"),
      date:             relativeTime(f.uploaded_at),
      status:           "internal input",
      areas,
      inFoundation:     areas.length > 0,
      rawTags:          f.tags,
      workshopTag,
      suggestedTag:     suggestWorkshopTag(f.file_name),
      processingStatus: deriveProcessingStatus(f.tags, f.uploaded_at),
      linkedNeeds:      linkedNeedsByFilePath.get(f.file_path) ?? [],
      filePath:         f.file_path,
      fileType:         f.file_type,
    };
  });

  const socialRows: SourceRow[] = socialNeeds.map((n) => {
    const areas = areasFromSocialNeed(n);
    return {
      id:               n.id,
      type:             "social",
      title:            n.desired_outcome,
      source:           socialSourceLabel(n.source_path),
      date:             relativeTime(n.created_at),
      status:           "early signal",
      areas,
      inFoundation:     areas.length > 0,
      processingStatus: "processed" as ProcessingStatus,
      linkedNeeds:      [],
    };
  });

  const allRows: SourceRow[] = [...fileRows, ...socialRows];

  const filteredRows = allRows.filter((r) => {
    if (typeFilter !== "all" && r.type !== typeFilter) return false;
    if (foundationFilter === "yes" && !r.inFoundation) return false;
    if (foundationFilter === "no" && r.inFoundation) return false;
    return true;
  });

  // ── Summary counts ─────────────────────────────────────────────────────────

  const processedCount       = fileRows.filter((r) => r.processingStatus === "processed").length;
  const usedInFoundationCount = fileRows.filter((r) => r.areas.length > 0).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "8px 0 80px", maxWidth: 860 }}>

      {/* ── PAGE INTRO ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <span style={LABEL_TINY}>Inputs</span>
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>
          What you've added — and what it's shaping.
        </p>
      </div>

      {/* ── ADD INPUT ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ ...LABEL_TINY, marginBottom: 12 }}>Add Input</div>

        {/* Primary: file upload */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", marginBottom: 20 }}>
          <PrimaryAddBtn label="Upload file" active={false} onClick={() => setOpenUpload(true)} />
          <p style={{ ...MONO, fontSize: 10, color: "#aaa", margin: 0 }}>
            Upload documents, decks, notes, transcripts, or research files.
          </p>
        </div>

        {/* Secondary: social signal */}
        <div style={{ borderTop: "1px solid #f0ece8", paddingTop: 16 }}>
          <button
            type="button"
            onClick={() => setShowSocial((v) => !v)}
            style={{
              ...MONO, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
              color: showSocial ? "#555" : "#aaa", background: "none", border: "none",
              padding: 0, cursor: "pointer",
              textDecoration: showSocial ? "underline" : "none",
            }}
          >
            {showSocial ? "↑ cancel" : "+ Add social signal"}
          </button>

          {showSocial && (
            <div style={{ marginTop: 16 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ ...LABEL_TINY, marginBottom: 4 }}>Social Signal</div>
                <p style={{ ...MONO, fontSize: 10, color: "#aaa", margin: 0, lineHeight: 1.5 }}>
                  Paste Reddit posts, forum comments, reviews, or social conversations.
                  <br />
                  <span style={{ color: "#c8c2ba" }}>
                    This can help spot patterns, but still needs to be checked with real customers.
                  </span>
                </p>
              </div>
              <SocialSignalsPanel
                companyId={companyId}
                socialNeeds={socialNeeds}
                onAdded={() => { onAdded(); setShowSocial(false); }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── INPUTS LIBRARY ────────────────────────────────────────────────── */}
      <div>
        {/* File summary strip */}
        {fileRows.length > 0 && (
          <p style={{ ...MONO, fontSize: 10, color: "#aaa", marginBottom: 16, marginTop: 0 }}>
            Files: {fileRows.length} uploaded
            {" · "}{processedCount} processed
            {" · "}{usedInFoundationCount} used in foundation
          </p>
        )}

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
            <span style={LABEL_TINY}>Inputs Library</span>
            <div style={{ display: "flex", gap: 8 }}>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                style={{ ...MONO, fontSize: 10, color: "#666", border: "1px solid #d9d9d9", borderRadius: 3, padding: "3px 8px", background: "#fff", cursor: "pointer" }}
              >
                <option value="all">All types</option>
                <option value="file">File</option>
                <option value="social">Social</option>
                <option value="interview">Interview</option>
                <option value="survey">Survey</option>
                <option value="note">Note</option>
              </select>
              <select
                value={foundationFilter}
                onChange={(e) => setFoundationFilter(e.target.value as FoundationFilter)}
                style={{ ...MONO, fontSize: 10, color: "#666", border: "1px solid #d9d9d9", borderRadius: 3, padding: "3px 8px", background: "#fff", cursor: "pointer" }}
              >
                <option value="all">Foundation: all</option>
                <option value="yes">Applied in foundation</option>
                <option value="no">Not yet applied</option>
              </select>
            </div>
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <p style={{ ...MONO, fontSize: 11, color: "#ccc", margin: "16px 0" }}>
            {allRows.length === 0 ? "No inputs added yet." : "No inputs match this filter."}
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "monospace" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e8e4de" }}>
                  <th style={TH}>Type</th>
                  <th style={{ ...TH, width: "32%" }}>Title / Snippet</th>
                  <th style={TH}>Source</th>
                  <th style={TH}>Date</th>
                  <th style={TH}>Processing</th>
                  <th style={{ ...TH, paddingRight: 0 }}>Applied in</th>
                  <th style={{ ...TH, paddingRight: 0, width: 24 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const unused = row.areas.length === 0;
                  const panelOpen = useThisId === row.id;
                  const deleteConfirmOpen = deleteConfirmId === row.id;
                  const proposalPanelOpen = proposalPanelId === row.id;
                  const anyPanelOpen = panelOpen || deleteConfirmOpen || proposalPanelOpen;
                  return (
                    <Fragment key={row.id}>
                      <tr style={{
                        borderBottom: anyPanelOpen ? "none" : "1px solid #f5f2ee",
                        opacity: unused && !anyPanelOpen ? 0.55 : 1,
                        transition: "opacity 0.1s",
                      }}>
                        <td style={{ ...TD, color: "#888", whiteSpace: "nowrap", textTransform: "uppercase", fontSize: 9, letterSpacing: "0.06em", fontWeight: 600 }}>
                          {row.type}
                        </td>
                        <td style={{ ...TD, color: unused ? "#aaa" : "#333", maxWidth: 280 }}>
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }} title={row.title}>
                            {row.title || "—"}
                          </span>
                        </td>
                        <td style={{ ...TD, color: "#aaa", whiteSpace: "nowrap" }}>{row.source || "—"}</td>
                        <td style={{ ...TD, color: "#ccc", whiteSpace: "nowrap" }}>{row.date}</td>
                        <td style={{ ...TD, whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {/* Main processing status */}
                            {row.type !== "file" ? (
                              <span style={{ ...MONO, fontSize: 9, color: "#e0dcd8" }}>—</span>
                            ) : row.processingStatus === "processed" ? (
                              <span style={{ ...MONO, fontSize: 9, color: "#1a8f5a" }}>Processed</span>
                            ) : row.processingStatus === "uploading" ? (
                              <span style={{ ...MONO, fontSize: 9, color: "#c97700" }}>Processing…</span>
                            ) : analyzingFileId === row.id ? (
                              <span style={{ ...MONO, fontSize: 9, color: "#c97700" }}>Analyzing…</span>
                            ) : analyzeFailedIds.has(row.id) ? (
                              <button
                                type="button"
                                onClick={() => handleAnalyze(row)}
                                style={{
                                  ...MONO, fontSize: 9, color: "#c0392b", background: "none",
                                  border: "none", padding: 0, cursor: "pointer",
                                  textDecoration: "underline", textUnderlineOffset: 3,
                                }}
                              >
                                Analysis failed — retry
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAnalyze(row)}
                                style={{
                                  ...MONO, fontSize: 9, color: "#5a8a70", background: "none",
                                  border: "none", padding: 0, cursor: "pointer",
                                  textDecoration: "underline", textDecorationStyle: "dashed",
                                  textUnderlineOffset: 3,
                                }}
                              >
                                Analyze →
                              </button>
                            )}
                            {/* Dify proposal action — secondary, file rows only */}
                            {row.type === "file" && (() => {
                              const proposal = proposalByFileId.get(row.id);
                              if (proposal) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setProposalPanelId(proposalPanelOpen ? null : row.id);
                                      setUseThisId(null);
                                      setDeleteConfirmId(null);
                                    }}
                                    style={{
                                      ...MONO, fontSize: 9, color: proposal.processing_state === "failed" ? "#c0392b" : "#2d8a60", background: "none",
                                      border: "none", padding: 0, cursor: "pointer",
                                      textDecoration: "underline", textDecorationStyle: "dashed",
                                      textUnderlineOffset: 3,
                                    }}
                                  >
                                    {proposalPanelOpen ? "↑ Close review" : fileProposalStatusLabel(proposal)}
                                  </button>
                                );
                              }
                              if (difyAnalyzingFileId === row.id) {
                                return <span style={{ ...MONO, fontSize: 9, color: "#c97700" }}>Dify analyzing…</span>;
                              }
                              if (difyFailedIds.has(row.id)) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleDifyAnalyze(row)}
                                    style={{
                                      ...MONO, fontSize: 9, color: "#c0392b", background: "none",
                                      border: "none", padding: 0, cursor: "pointer",
                                      textDecoration: "underline", textUnderlineOffset: 3,
                                    }}
                                  >
                                    Dify failed — retry
                                  </button>
                                );
                              }
                              return (
                                <button
                                  type="button"
                                  onClick={() => handleDifyAnalyze(row)}
                                  style={{
                                    ...MONO, fontSize: 9, color: "#7a9e90", background: "none",
                                    border: "none", padding: 0, cursor: "pointer",
                                    textDecoration: "underline", textDecorationStyle: "dashed",
                                    textUnderlineOffset: 3,
                                  }}
                                >
                                  Analyze with Dify →
                                </button>
                              );
                            })()}
                          </div>
                        </td>
                        <td style={{ ...TD, paddingRight: 0 }}>
                          <UsedByCell
                            areas={row.areas}
                            linkedNeeds={row.linkedNeeds}
                            onUseThis={() => setUseThisId(panelOpen ? null : row.id)}
                          />
                        </td>
                        {row.type === "file" ? (
                          <td style={{ ...TD, paddingRight: 0, width: 24, textAlign: "center" }}>
                            <button
                              type="button"
                              onClick={() => {
                                if (row.areas.length === 0) {
                                  void handleDeleteFile(row, "file-only");
                                } else {
                                  setDeleteConfirmId(deleteConfirmOpen ? null : row.id);
                                  setUseThisId(null);
                                }
                              }}
                              title="Remove file"
                              style={{
                                ...MONO, fontSize: 13, color: "#c8c2ba",
                                background: "none", border: "none",
                                padding: "0 2px", cursor: "pointer",
                                lineHeight: 1,
                              }}
                            >
                              ×
                            </button>
                          </td>
                        ) : (
                          <td style={{ ...TD, width: 24 }}></td>
                        )}
                      </tr>

                      {panelOpen && (
                        <tr style={{ borderBottom: "1px solid #f5f2ee" }}>
                          <td colSpan={7} style={{ padding: "0 0 4px" }}>
                            <UseThisPanel
                              row={row}
                              onClose={() => setUseThisId(null)}
                              onSave={(args) => handleUseThis(row, args)}
                            />
                          </td>
                        </tr>
                      )}

                      {deleteConfirmOpen && (
                        <tr style={{ borderBottom: "1px solid #f5f2ee" }}>
                          <td colSpan={7} style={{ padding: "0 0 4px" }}>
                            <DeleteConfirmPanel
                              row={row}
                              deleting={deletingFileId === row.id}
                              onClose={() => setDeleteConfirmId(null)}
                              onConfirm={(mode) => handleDeleteFile(row, mode)}
                            />
                          </td>
                        </tr>
                      )}

                      {proposalPanelOpen && proposalByFileId.has(row.id) && (
                        <tr style={{ borderBottom: "1px solid #f5f2ee" }}>
                          <td colSpan={7} style={{ padding: "0 0 4px" }}>
                            <ProposalReviewPanel
                              proposal={proposalByFileId.get(row.id)!}
                              existingNeeds={allNeeds}
                              onClose={() => setProposalPanelId(null)}
                              onAccept={(payload) => handleAcceptProposal(row, proposalByFileId.get(row.id)!, payload)}
                              onReject={() => handleRejectProposal(proposalByFileId.get(row.id)!)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* File upload dialog */}
      <FileUploadDialog
        open={openUpload}
        onOpenChange={(o) => { setOpenUpload(o); if (!o) refetchFiles(); }}
        companyId={companyId ?? undefined}
        companyName={companyName}
      />
    </div>
  );
}
