import { useState, Fragment, useMemo, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import mammoth from "mammoth";
import { useQuery } from "@tanstack/react-query";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import { useCompanyFiles } from "@/hooks/useCompanyFiles";
import { useCapability } from "@/hooks/useCapability";
import { useUpdateFileTags, useArchiveInputFile, useRestoreInputFile, useArchivedInputFiles, getFileSignedUrl } from "@/hooks/useInputs";
import {
  useFileProposals,
  type FileProposalRow,
  type CandidateNeed,
  type CandidateJobStep,
  type CandidateOutcome,
  type CandidatePositioningUpdate,
  type ExperimentToRun,
  type FrameworkResult,
  type PossibleRoute,
  type ProposalContradiction,
} from "@/hooks/useFileProposals";
import SocialSignalsPanel from "./SocialSignalsPanel";
import { relativeTime } from "../helpers";
import { visibleFileTags, readAreaSupportTags, makeAreaSupportTag, isInternalFileTag } from "@/lib/fileTags";
import { mapInputToAreaKey, inferAreaHintsFromFileName } from "@/lib/areaMapping";
import FileUploadDialog from "@/components/FileUploadDialog";
import { supabase } from "@/integrations/supabase/client";
import { pollPublicBaselineTerminal } from "@/lib/pollPublicBaseline";

import { Eyebrow } from "@/components/design-system/Eyebrow";
import { D } from "@/components/design-system/tokens";
import { SignalBasisChip, type SignalBasis } from "@/components/design-system/SignalBasisChip";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// ── Proposal accept payload types ────────────────────────────────────────────

type ProposalAcceptPayload = {
  areas: FoundationArea[];
  selectedCounts: {
    positioningUpdates: number;
    jobSteps: number;
    needs: number;
    outcomes: number;
    gaps: number;
    routes: number;
    experiments: number;
  };
};

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

function fileProposalProcessingBadgeStyle(proposal: FileProposalRow): React.CSSProperties {
  switch (proposal.processing_state) {
    case "queued":
      return {
        ...MONO,
        fontSize: 8,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "#8b5e00",
        background: "#fff6db",
        border: "1px solid #edd48b",
        borderRadius: 999,
        padding: "2px 6px",
        display: "inline-flex",
        alignItems: "center",
        width: "fit-content",
      };
    case "running":
      return {
        ...MONO,
        fontSize: 8,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "#9a4f00",
        background: "#fff1e2",
        border: "1px solid #efc28f",
        borderRadius: 999,
        padding: "2px 6px",
        display: "inline-flex",
        alignItems: "center",
        width: "fit-content",
      };
    case "failed":
      return {
        ...MONO,
        fontSize: 8,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "#a5281f",
        background: "#fdeceb",
        border: "1px solid #efb6b1",
        borderRadius: 999,
        padding: "2px 6px",
        display: "inline-flex",
        alignItems: "center",
        width: "fit-content",
      };
    case "ready":
    default:
      return {
        ...MONO,
        fontSize: 8,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "#1a8f5a",
        background: "#ebf8f1",
        border: "1px solid #b8d8c8",
        borderRadius: 999,
        padding: "2px 6px",
        display: "inline-flex",
        alignItems: "center",
        width: "fit-content",
      };
  }
}

function fileProposalProcessingBadgeText(proposal: FileProposalRow): string {
  switch (proposal.processing_state) {
    case "queued":
      return "Analysis queued";
    case "running":
      return "Analyzing";
    case "failed":
      return "Analysis failed";
    case "ready":
    default:
      return "Analysis ready";
  }
}

function fileProposalReviewCountsText(proposal: FileProposalRow): string {
  const parts: string[] = [];
  const needCount = proposal.candidate_needs.length;
  const routeCount = proposal.possible_routes.length;
  const gapCount = proposal.possible_gaps.length;
  const frameworkCount = proposal.framework_results.reduce((sum, framework) => sum + framework.findings.length, 0);
  const experimentCount = proposal.experiments_to_run.length;

  if (needCount > 0) parts.push(`${needCount} opp${needCount === 1 ? "" : "s"}`);
  if (routeCount > 0) parts.push(`${routeCount} route${routeCount === 1 ? "" : "s"}`);
  if (gapCount > 0) parts.push(`${gapCount} gap${gapCount === 1 ? "" : "s"}`);
  if (frameworkCount > 0) parts.push(`${frameworkCount} finding${frameworkCount === 1 ? "" : "s"}`);
  if (experimentCount > 0) parts.push(`${experimentCount} experiment${experimentCount === 1 ? "" : "s"}`);

  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function isProposalStale(proposal: FileProposalRow): boolean {
  if (proposal.processing_state !== "queued" && proposal.processing_state !== "running") return false;
  const startedAt = proposal.processing_started_at ?? proposal.created_at;
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return false;
  return Date.now() - startedMs > 10 * 60 * 1000;
}

function isQueuedPlaceholderSummary(summary: string): boolean {
  const s = summary.trim();
  return s === "Dify analysis queued. Results will appear when processing finishes."
    || s === "Analysis queued. Results will appear when processing finishes.";
}

function proposalPriority(proposal: FileProposalRow): number {
  if (proposal.processing_state === "ready") return 4;
  if (proposal.processing_state === "failed") return 3;
  if (proposal.processing_state === "running") return 2;
  if (proposal.processing_state === "queued") return 1;
  return 0;
}

function inferSuggestedAreasFromProposal(proposal: FileProposalRow): FoundationArea[] {
  const areas = new Set<FoundationArea>();
  if (proposal.candidate_positioning_updates.length > 0) areas.add("Positioning");
  if (proposal.candidate_job_steps.length > 0) areas.add("Job Map");
  if (proposal.candidate_needs.length > 0) areas.add("Opportunities");
  if (proposal.candidate_outcomes.length > 0) areas.add("Model");
  if (proposal.possible_routes.length > 0 || proposal.experiments_to_run.length > 0) areas.add("Routes");
  return FOUNDATION_AREAS.filter((area) => areas.has(area));
}

function proposalProgressPercent(proposal: FileProposalRow): number {
  if (proposal.processing_state === "ready") return 100;
  if (proposal.processing_state === "failed") return 100;
  const startedAt = proposal.processing_started_at ?? proposal.created_at;
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) {
    return proposal.processing_state === "queued" ? 8 : 18;
  }
  const elapsedSeconds = Math.max(0, (Date.now() - startedMs) / 1000);
  if (proposal.processing_state === "queued") {
    return Math.min(20, 6 + elapsedSeconds * 0.5);
  }
  return Math.min(92, 18 + elapsedSeconds * 0.45);
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

function PrimaryAddBtn({ label, active, onClick, disabled = false, disabledReason }: { label: string; active: boolean; onClick: () => void; disabled?: boolean; disabledReason?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={disabled ? disabledReason : undefined} style={{
      ...MONO, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", fontWeight: 600,
      color: active ? "#fff" : "#333", background: active ? "#2d2d2d" : "#fff",
      border: `1px solid ${active ? "#2d2d2d" : "#c8c2ba"}`, borderRadius: 4, padding: "8px 18px",
      cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
    }}>
      {active ? "↑ Cancel" : `+ ${label}`}
    </button>
  );
}

// OC-2b — the operator's door to the First Read presenter rail. ALWAYS rendered for
// every company: the rail owns its own empty / dead-id states (terminating in the
// bounded honest state shipped at First Read Gate 5), so this control is deliberately
// NOT gated on hasHierarchy / spine / baseline — those company-state proxies are the
// known defect class this thread keeps rediscovering. `dark` only picks the theme to
// match the intro branch it renders under; it never decides whether to render. A hard
// link (not a router hook) so the target is a plain href and the router-less mount
// tests keep passing.
const OPEN_FIRST_READ_LABEL = "Open First Read →"; // operator-signed (OC-2b brief)
function OpenFirstReadControl({ companyId, dark }: { companyId: string | null; dark?: boolean }) {
  const disabled = !companyId;
  const href = companyId ? `/first-read/${companyId}` : undefined;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: dark ? 16 : 12, flexWrap: "wrap" }}>
      <a
        href={href}
        aria-disabled={disabled}
        style={{
          fontFamily: "monospace", fontSize: dark ? 9 : 10, letterSpacing: "0.06em",
          color: disabled ? (dark ? "rgba(246,246,244,0.25)" : "#bbb") : (dark ? "#7a9e90" : "#2f6b3a"),
          background: "none", padding: 0,
          textDecoration: "underline", textDecorationStyle: "dashed", textUnderlineOffset: 3,
          pointerEvents: disabled ? "none" : "auto", cursor: disabled ? "default" : "pointer",
        }}
      >
        {OPEN_FIRST_READ_LABEL}
      </a>
      {/* DRAFT sub-line — PENDING OPERATOR SIGNATURE (house pattern). */}
      <span style={{ fontFamily: "monospace", fontSize: dark ? 9 : 10, color: dark ? "rgba(246,246,244,0.35)" : "#aaa" }}>
        The presenter-led first-meeting walkthrough for this company.
      </span>
    </div>
  );
}

// Areas cell — shows area chips for tagged rows, or untagged prompt for empty rows.
function UsedByCell({
  areas, linkedNeeds, onUseThis, rowType,
}: {
  areas: FoundationArea[]; linkedNeeds: string[]; onUseThis: () => void; rowType: "file" | "social" | string;
}) {
  if (areas.length === 0) {
    const untaggedLabel = rowType === "social" ? "Assign step →" : "Assign area →";
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {rowType !== "social" && (
          <span style={{ ...MONO, fontSize: 9, color: "#c8c2ba", letterSpacing: "0.04em" }}>Untagged</span>
        )}
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
          {untaggedLabel}
        </button>
      </div>
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

function ProposalReviewPanel({
  proposal,
  onClose,
  onAccept,
  onDismiss,
  onReject,
}: {
  proposal: FileProposalRow;
  onClose: () => void;
  onAccept: (payload: ProposalAcceptPayload) => void;
  onDismiss: () => void;
  onReject: () => void;
}) {
  const isProcessing = proposal.processing_state === "queued" || proposal.processing_state === "running";
  const isFailed = proposal.processing_state === "failed";
  const isReady = proposal.processing_state === "ready";
  const showSummary = Boolean(proposal.summary) && !(isProcessing && isQueuedPlaceholderSummary(proposal.summary));
  const initialAreas = inferSuggestedAreasFromProposal(proposal);

  const evidence = proposal.evidence;
  const frameworkResults = proposal.framework_results;
  const positioningUpdates = proposal.candidate_positioning_updates;
  const jobSteps = proposal.candidate_job_steps;
  const needs = proposal.candidate_needs;
  const outcomes = proposal.candidate_outcomes;
  const gaps = proposal.possible_gaps;
  const routes = proposal.possible_routes;
  const experiments = proposal.experiments_to_run;
  const contradictions = proposal.contradictions;
  const questions = proposal.questions_to_verify;

  const [selectedAreas, setSelectedAreas] = useState<Set<FoundationArea>>(() => new Set(initialAreas));
  const [positioningChecked, setPositioningChecked] = useState<Set<number>>(() => new Set(positioningUpdates.map((_, i) => i)));
  const [jobStepChecked, setJobStepChecked] = useState<Set<number>>(() => new Set(jobSteps.map((_, i) => i)));
  const [needChecked, setNeedChecked] = useState<Set<number>>(() => new Set(needs.map((_, i) => i)));
  const [outcomeChecked, setOutcomeChecked] = useState<Set<number>>(() => new Set(outcomes.map((_, i) => i)));
  const [gapChecked, setGapChecked] = useState<Set<number>>(() => new Set());
  const [routeChecked, setRouteChecked] = useState<Set<number>>(() => new Set(routes.map((_, i) => i)));
  const [experimentChecked, setExperimentChecked] = useState<Set<number>>(() => new Set(experiments.map((_, i) => i)));

  useEffect(() => {
    setSelectedAreas(new Set(initialAreas));
    setPositioningChecked(new Set(positioningUpdates.map((_, i) => i)));
    setJobStepChecked(new Set(jobSteps.map((_, i) => i)));
    setNeedChecked(new Set(needs.map((_, i) => i)));
    setOutcomeChecked(new Set(outcomes.map((_, i) => i)));
    setGapChecked(new Set());
    setRouteChecked(new Set(routes.map((_, i) => i)));
    setExperimentChecked(new Set(experiments.map((_, i) => i)));
  }, [proposal.id, proposal.processing_state, positioningUpdates, jobSteps, needs, outcomes, routes, experiments]);

  function toggleArea(area: FoundationArea) {
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  }

  function toggleChecked(index: number, setter: Dispatch<SetStateAction<Set<number>>>) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const totalSelected =
    selectedAreas.size +
    positioningChecked.size +
    jobStepChecked.size +
    needChecked.size +
    outcomeChecked.size +
    gapChecked.size +
    routeChecked.size +
    experimentChecked.size;

  function buildPayload(): ProposalAcceptPayload {
    return {
      areas: [...selectedAreas],
      selectedCounts: {
        positioningUpdates: positioningChecked.size,
        jobSteps: jobStepChecked.size,
        needs: needChecked.size,
        outcomes: outcomeChecked.size,
        gaps: gapChecked.size,
        routes: routeChecked.size,
        experiments: experimentChecked.size,
      },
    };
  }

  const confidenceColor =
    proposal.confidence === "high" ? "#1a8f5a"
    : proposal.confidence === "medium" ? "#c97700"
    : "#888";

  const CHECKBOX_STYLE: React.CSSProperties = {
    marginTop: 2,
    cursor: "pointer",
    accentColor: "#2d8a60",
  };

  return (
    <div style={{
      background: "#f5faf7", border: "1px solid #b8d8c8", borderRadius: 4,
      padding: "16px 20px", margin: "2px 0 8px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ ...LABEL_TINY }}>Evidence Analysis</div>
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

      {evidence.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 6 }}>Evidence from file</div>
          <ul style={{ margin: 0, padding: "0 0 0 14px" }}>
            {evidence.map((item, i) => (
              <li key={i} style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5, marginBottom: 4 }}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {frameworkResults.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Signal patterns</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {frameworkResults.map((framework, i) => (
              <div key={`${framework.framework}-${i}`}>
                <div style={{ ...MONO, fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  {framework.framework.replace(/_/g, " ")}
                </div>
                {framework.findings.length > 0 ? (
                  <ul style={{ margin: 0, padding: "0 0 0 14px" }}>
                    {framework.findings.map((finding, idx) => (
                      <li key={idx} style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5, marginBottom: 4 }}>
                        <span style={{ color: "#333" }}>{finding.claim}</span>
                        {finding.evidence && <span style={{ color: "#888" }}> — {finding.evidence}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ ...MONO, fontSize: 10, color: "#999", margin: 0 }}>No findings returned.</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isProcessing && (
        <div style={{ margin: "0 0 14px" }}>
          <p style={{ ...MONO, fontSize: 10, color: "#888", margin: "0 0 8px", lineHeight: 1.6 }}>
            {proposal.processing_state === "queued"
              ? "Analysis queued. This panel updates automatically."
              : "Analysis running. This panel updates automatically."}
          </p>
          <div style={{ height: 6, borderRadius: 999, background: "#dcebe3", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${proposalProgressPercent(proposal)}%`,
                background: "#2d8a60",
                transition: "width 0.6s ease",
              }}
            />
          </div>
        </div>
      )}

      {isFailed && proposal.processing_error && (
        <p style={{ ...MONO, fontSize: 10, color: "#c0392b", margin: "0 0 14px", lineHeight: 1.6 }}>
          Analysis failed: {proposal.processing_error}
        </p>
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Suggested foundation areas</div>
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
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 11, color: selectedAreas.has(area) ? "#333" : "#aaa" }}>
                  {areaDisplayLabel(area)}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {positioningUpdates.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Positioning updates</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {positioningUpdates.map((update, i) => (
              <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={positioningChecked.has(i)}
                  onChange={() => toggleChecked(i, setPositioningChecked)}
                  disabled={!isReady}
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5 }}>
                  <span style={{ color: "#333" }}>{update.field}</span>: {update.suggested_update}
                  {update.current_issue && <span style={{ color: "#888" }}> — {update.current_issue}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {jobSteps.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Job map updates</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {jobSteps.map((step, i) => (
              <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={jobStepChecked.has(i)}
                  onChange={() => toggleChecked(i, setJobStepChecked)}
                  disabled={!isReady}
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5 }}>
                  <span style={{ color: "#333" }}>{step.step_label}</span>
                  {step.step_description && <span style={{ color: "#888" }}> — {step.step_description}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {needs.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Opportunities / needs</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {needs.map((n, i) => (
              <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={needChecked.has(i)}
                  onChange={() => toggleChecked(i, setNeedChecked)}
                  disabled={!isReady}
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 10, color: "#444", lineHeight: 1.5 }}>
                  {n.desired_outcome}
                  {typeof n.importance === "number" && <span style={{ color: "#bbb", marginLeft: 6 }}>imp {n.importance}/10</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {outcomes.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Outcomes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {outcomes.map((outcome, i) => (
              <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={outcomeChecked.has(i)}
                  onChange={() => toggleChecked(i, setOutcomeChecked)}
                  disabled={!isReady}
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5 }}>
                  <span style={{ color: "#333" }}>{outcome.outcome}</span>
                  {outcome.related_opportunities.length > 0 && (
                    <span style={{ color: "#888" }}> — linked to {outcome.related_opportunities.join(", ")}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {routes.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Routes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {routes.map((route, i) => (
              <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={routeChecked.has(i)}
                  onChange={() => toggleChecked(i, setRouteChecked)}
                  disabled={!isReady}
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5 }}>
                  <span style={{ color: "#333" }}>{route.title}</span>
                  {route.why_this_could_matter && <span style={{ color: "#888" }}> — {route.why_this_could_matter}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {experiments.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Experiments to run</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {experiments.map((experiment, i) => (
              <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={experimentChecked.has(i)}
                  onChange={() => toggleChecked(i, setExperimentChecked)}
                  disabled={!isReady}
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5 }}>
                  <span style={{ color: "#333" }}>{experiment.experiment}</span>
                  {experiment.what_it_tests && <span style={{ color: "#888" }}> — tests {experiment.what_it_tests}</span>}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {gaps.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 8 }}>Gaps</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {gaps.map((gap, i) => (
              <label key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={gapChecked.has(i)}
                  onChange={() => toggleChecked(i, setGapChecked)}
                  disabled={!isReady}
                  style={CHECKBOX_STYLE}
                />
                <span style={{ ...MONO, fontSize: 10, color: "#555", lineHeight: 1.5 }}>{gap}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {contradictions.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 6 }}>Contradictions</div>
          <ul style={{ margin: 0, padding: "0 0 0 12px" }}>
            {contradictions.map((item, i) => (
              <li key={i} style={{ ...MONO, fontSize: 10, color: "#888", marginBottom: 3, lineHeight: 1.4 }}>
                <span style={{ color: "#555" }}>{item.claim}</span>
                {item.conflicts_with && <span> — conflicts with {item.conflicts_with}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {questions.length > 0 && (
        <div style={{ marginBottom: 16, borderTop: "1px solid #d4e8dc", paddingTop: 12 }}>
          <div style={{ ...LABEL_TINY, marginBottom: 6 }}>Questions to verify</div>
          <ul style={{ margin: 0, padding: "0 0 0 12px" }}>
            {questions.map((q, i) => (
              <li key={i} style={{ ...MONO, fontSize: 10, color: "#888", marginBottom: 3, fontStyle: "italic", lineHeight: 1.4 }}>{q}</li>
            ))}
          </ul>
        </div>
      )}

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
          Accept{totalSelected > 0 ? ` ${totalSelected} selected` : ""}
        </button>
        {isProcessing ? (
          <button
            type="button"
            onClick={onDismiss}
            style={{
              ...MONO, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
              color: "#c0392b",
              background: "#f5faf7", border: "1px solid #b8d8c8",
              borderRadius: 3, padding: "6px 14px", cursor: "pointer",
            }}
          >
            Dismiss run
          </button>
        ) : (
          <button
            type="button"
            onClick={onReject}
            style={{
              ...MONO, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
              color: "#c0392b",
              background: "#f5faf7", border: "1px solid #b8d8c8",
              borderRadius: 3, padding: "6px 14px", cursor: "pointer",
            }}
          >
            Reject
          </button>
        )}
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
          ? "Checked items are accepted for review. Only area tags are applied for now; structured items are not auto-created."
          : isFailed
            ? "This analysis did not complete cleanly. Retry from the file row if needed."
            : "This analysis is still processing. You can dismiss it if it is stuck, or wait for it to finish."}
      </p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function InputsTab({
  companyId,
  companyName,
  companyWebsite,
  socialNeeds,
  onAdded,
  hasHierarchy,
  signalBasis,
  companyHasSpine,
  birthRunning,
  onBirthSpine,
}: {
  companyId:      string | null;
  companyName?:   string;
  companyWebsite?: string;
  socialNeeds:    OdiNeedRow[];
  onAdded:        () => void;
  hasHierarchy?:  boolean;
  signalBasis?:   SignalBasis;
  /** BRT-1: server-predicate spine check (five tables), NOT hasHierarchy.
   *  null = not yet determined — never render "no spine" from an unknown. */
  companyHasSpine?: boolean | null;
  birthRunning?:  boolean;
  onBirthSpine?:  () => void;
}) {
  const [showSocial,       setShowSocial]       = useState(false);
  const [typeFilter,       setTypeFilter]       = useState<TypeFilter>("all");
  const [foundationFilter, setFoundationFilter] = useState<FoundationFilter>("all");
  const [openUpload,       setOpenUpload]       = useState(false);
  const [useThisId,        setUseThisId]        = useState<string | null>(null);
  // Operational caps (checkpoint 3b): evidence management + baseline refresh.
  const canEvidence = useCapability("evidence.manage", companyId);
  const canRefresh = useCapability("evidence.refreshBaseline", companyId);

  const { data: companyFiles = [], refetch: refetchFiles } = useCompanyFiles(companyId);
  const updateFileTags = useUpdateFileTags();

  // Evidence source status — shows reconstruction vs evidence-derived state.
  const { data: evidenceStatus } = useQuery({
    queryKey: ['evidence-source-status', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const [needsRes, routesRes, stepsRes] = await Promise.all([
        supabase.from('odi_needs').select('id, frameworks_used, source_path').eq('company_id', companyId),
        supabase.from('routes').select('id, frameworks_used').eq('company_id', companyId),
        supabase.from('job_steps').select('id, evidence_basis').eq('company_id', companyId),
      ]);
      const needs = needsRes.data ?? [];
      const routes = routesRes.data ?? [];
      const steps = stepsRes.data ?? [];
      const isReconstructed = (fw: string[] | null) =>
        Array.isArray(fw) &&
        fw.includes('reconstructed_prior') &&
        !fw.includes('superseded_by_evidence_78e') &&
        !fw.includes('evidence_derived_78e');
      const needsReconstructed = needs.filter((n) => isReconstructed(n.frameworks_used)).length;
      const routesReconstructed = routes.filter((r) => isReconstructed(r.frameworks_used)).length;
      return {
        needsTotal: needs.length,
        needsReconstructed,
        routesTotal: routes.length,
        routesReconstructed,
        stepsTotal: steps.length,
      };
    },
    enabled: !!companyId,
  });

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

  // ── Auth + public baseline ─────────────────────────────────────────────────
  const { isAdmin } = useAuth();
  const { run: baselineRun, loading: baselineLoading, refetch: refetchBaseline } = usePublicBaseline(companyId ?? undefined);

  const { data: runLock } = useQuery({
    queryKey: ['company-run-lock', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from('company_run_locks')
        .select('operation, expires_at')
        .eq('company_id', companyId)
        .eq('operation', 'public_baseline')
        .maybeSingle();
      return data ?? null;
    },
    refetchInterval: 5000,
    enabled: !!companyId,
  });
  const baselineRunning = !!runLock && new Date(runLock.expires_at) > new Date();

  const handleRefreshBaseline = useCallback(async () => {
    if (!companyId || !companyName) return;
    if (!canRefresh) return; // evidence.refreshBaseline
    if (!companyWebsite?.trim()) {
      toast.error("Add a website for this company before refreshing outside signals.");
      return;
    }
    toast.loading("Refreshing outside signals…", { id: "refresh-baseline" });
    const startedAt = new Date().toISOString();
    // DEF-1b: pollPublicBaselineTerminal can throw, which would exit past every
    // handled branch below and strand the duration:Infinity loading toast.
    try {
      const { error } = await supabase.functions.invoke("public-baseline", {
        body: { company_id: companyId, company_name: companyName, website: companyWebsite },
      });
      if (error) {
        // The 150s wall may have cut the browser after the isolate already succeeded.
        // Poll the durable run-status row instead of trusting the failed invoke.
        const terminal = await pollPublicBaselineTerminal({ companyId, sinceIso: startedAt });
        if (terminal === "completed") {
          toast.success("Outside signals updated.", { id: "refresh-baseline" });
          void refetchBaseline();
        } else if (terminal === "running") {
          toast.message("Outside signals still running in the background — refresh shortly.", { id: "refresh-baseline" });
        } else {
          toast.error(error.message || "Outside signal refresh failed.", { id: "refresh-baseline" });
        }
      } else {
        toast.success("Outside signals updated.", { id: "refresh-baseline" });
        void refetchBaseline();
      }
    } catch (err) {
      toast.error(`Outside signal refresh failed — ${err instanceof Error ? err.message : String(err)}`, { id: "refresh-baseline" });
    }
  }, [companyId, companyName, companyWebsite, canRefresh, refetchBaseline]);

  const archiveFileMutation = useArchiveInputFile();
  const restoreFileMutation = useRestoreInputFile();
  const { data: archivedFiles = [] } = useArchivedInputFiles(companyId);
  const [showArchived, setShowArchived] = useState(false);
  const [deleteConfirmId,  setDeleteConfirmId]  = useState<string | null>(null);
  const [deletingFileId,   setDeletingFileId]   = useState<string | null>(null);

  async function handleDeleteFile(row: SourceRow, mode: "file-only" | "file-and-unlink") {
    if (!canEvidence) return; // evidence.manage
    setDeleteConfirmId(null);
    setDeletingFileId(row.id);
    try {
      await archiveFileMutation.mutateAsync({ id: row.id, reason: 'user_removed', source: 'ui' });
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

  async function handleRestoreFile(id: string) {
    if (!canEvidence) return; // evidence.manage
    await restoreFileMutation.mutateAsync({ id });
    await refetchFiles();
  }

  // ── Dify proposal state ────────────────────────────────────────────────────

  const { data: fileProposals = [], refetch: refetchProposals } = useFileProposals(companyId);

  const proposalByFileId = useMemo(() => {
    const map = new Map<string, FileProposalRow>();
    for (const p of fileProposals) {
      const current = map.get(p.file_id);
      if (!current) {
        map.set(p.file_id, p);
        continue;
      }

      const currentPriority = proposalPriority(current);
      const nextPriority = proposalPriority(p);
      if (nextPriority > currentPriority) {
        map.set(p.file_id, p);
        continue;
      }
      if (nextPriority === currentPriority) {
        const currentCreatedAt = Date.parse(current.created_at);
        const nextCreatedAt = Date.parse(p.created_at);
        if (!Number.isFinite(currentCreatedAt) || (Number.isFinite(nextCreatedAt) && nextCreatedAt > currentCreatedAt)) {
          map.set(p.file_id, p);
        }
      }
    }
    return map;
  }, [fileProposals]);

  const [proposalPanelId,     setProposalPanelId]     = useState<string | null>(null);
  const [difyAnalyzingFileId, setDifyAnalyzingFileId] = useState<string | null>(null);
  const [difyFailedIds,       setDifyFailedIds]       = useState<ReadonlySet<string>>(new Set());
  const [openingFileId,       setOpeningFileId]       = useState<string | null>(null);
  const [syncingProposalId,   setSyncingProposalId]   = useState<string | null>(null);
  const lastProposalSyncAtRef = useRef<Record<string, number>>({});

  async function handleDifyAnalyze(row: SourceRow) {
    if (!canEvidence) return; // evidence.manage
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
          sourceType: row.type === "file" ? "uploaded_file" : row.type,
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

  async function handleOpenFile(row: SourceRow) {
    if (!row.filePath) return;
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) return;
    previewWindow.opener = null;
    previewWindow.document.write(
      `<!doctype html><html><head><title>${row.title}</title></head><body style="font-family: monospace; padding: 24px; color: #444;">Loading file preview…</body></html>`,
    );
    previewWindow.document.close();
    setOpeningFileId(row.id);
    try {
      const signedUrl = await getFileSignedUrl(row.filePath);
      const lowerPath = row.filePath.toLowerCase();
      const fileType = String(row.fileType || "").toLowerCase();
      const isDocx = fileType.includes("wordprocessingml") || lowerPath.endsWith(".docx");
      const isPdf = fileType.includes("pdf") || lowerPath.endsWith(".pdf");
      const isImage = fileType.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(lowerPath);
      const isText = fileType.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(lowerPath);

      if (!isDocx && !isPdf && !isImage && !isText) {
        previewWindow.location.href = signedUrl;
        return;
      }

      const response = await fetch(signedUrl);
      if (!response.ok) {
        throw new Error(`Could not fetch file preview (${response.status})`);
      }

      const blob = await response.blob();

      if (isDocx) {
        const arrayBuffer = await blob.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const html = `<!doctype html><html><head><title>${row.title}</title><style>body{font-family: Georgia, serif; max-width: 900px; margin: 40px auto; padding: 0 24px; color: #222; line-height: 1.6;} img{max-width: 100%; height: auto;} table{border-collapse: collapse;} td,th{border:1px solid #ddd; padding:6px 8px;} p{margin:0 0 1em;}</style></head><body>${result.value}</body></html>`;
        const htmlUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
        previewWindow.location.replace(htmlUrl);
        window.setTimeout(() => URL.revokeObjectURL(htmlUrl), 5 * 60 * 1000);
        return;
      }

      if (isText) {
        const text = await blob.text();
        const escapedText = text.replace(/[&<>]/g, (char) => {
          if (char === "&") return "&amp;";
          if (char === "<") return "&lt;";
          return "&gt;";
        });
        const html = `<!doctype html><html><head><title>${row.title}</title><style>body{margin:0;background:#faf8f4;color:#222;font-family:ui-monospace, SFMono-Regular, Menlo, monospace;} pre{white-space:pre-wrap; word-break:break-word; padding:24px; margin:0; line-height:1.5;}</style></head><body><pre>${escapedText}</pre></body></html>`;
        const htmlUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
        previewWindow.location.replace(htmlUrl);
        window.setTimeout(() => URL.revokeObjectURL(htmlUrl), 5 * 60 * 1000);
        return;
      }

      if (isPdf || isImage) {
        const objectUrl = URL.createObjectURL(blob);
        previewWindow.location.replace(objectUrl);
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60 * 1000);
        return;
      }

      previewWindow.location.href = signedUrl;
    } catch {
      previewWindow.document.open();
      previewWindow.document.write(
        `<!doctype html><html><head><title>${row.title}</title></head><body style="font-family: monospace; padding: 24px; color: #a33;">Could not preview this file in the browser window.</body></html>`,
      );
      previewWindow.document.close();
    } finally {
      setOpeningFileId(null);
    }
  }

  async function handleSyncProposal(proposal: FileProposalRow) {
    if (!canEvidence) return; // evidence.manage
    setSyncingProposalId(proposal.id);
    try {
      await supabase.functions.invoke("dify-analyze-file", {
        body: {
          mode: "sync",
          proposalId: proposal.id,
        },
      });
      await refetchProposals();
    } finally {
      setSyncingProposalId(null);
    }
  }

  useEffect(() => {
    const active = fileProposals.filter(
      (proposal) =>
        proposal.status !== "rejected" &&
        (proposal.processing_state === "queued" || proposal.processing_state === "running"),
    );
    if (active.length === 0) return;

    const now = Date.now();
    for (const proposal of active) {
      const lastSyncAt = lastProposalSyncAtRef.current[proposal.id] ?? 0;
      if (now - lastSyncAt < 5000) continue;
      lastProposalSyncAtRef.current[proposal.id] = now;
      void supabase.functions.invoke("dify-analyze-file", {
        body: {
          mode: "sync",
          proposalId: proposal.id,
        },
      }).then(() => {
        void refetchProposals();
      }).catch(() => {
        // Keep the row in running/failed state from the server; the normal
        // proposal poll loop will continue retrying.
      });
    }
  }, [fileProposals, refetchProposals]);

  async function handleAcceptProposal(row: SourceRow, proposal: FileProposalRow, payload: ProposalAcceptPayload) {
    if (!canEvidence) return; // evidence.manage
    setProposalPanelId(null);

    // Apply area tags to the source file. Structured proposal items remain
    // review-only until full apply flows exist for the expanded schema.
    if (payload.areas.length > 0) {
      const newTags = applyAreaTags(row.rawTags, payload.areas);
      await supabase.from("input_files").update({ tags: newTags }).eq("id", row.id);
    }
    await supabase.from("file_proposals").update({
      status:        "accepted",
      applied_areas: payload.areas.map((a) => FOUNDATION_AREA_TO_AREA_KEY[a]),
      reviewed_at:   new Date().toISOString(),
    }).eq("id", proposal.id);

    await refetchFiles();
    await refetchProposals();
  }

  async function handleRejectProposal(proposal: FileProposalRow) {
    if (!canEvidence) return; // evidence.manage
    if (proposal.processing_state === "queued" || proposal.processing_state === "running" || proposal.processing_state === "failed") {
      await handleDismissProposal(proposal);
      return;
    }

    setProposalPanelId(null);
    await supabase.from("file_proposals").update({
      status:      "rejected",
      reviewed_at: new Date().toISOString(),
    }).eq("id", proposal.id);
    await refetchProposals();
  }

  async function handleDismissProposal(proposal: FileProposalRow) {
    if (!canEvidence) return; // evidence.manage
    setProposalPanelId(null);
    if (proposal.processing_state === "queued" || proposal.processing_state === "running") {
      await supabase.from("file_proposals").update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        processing_state: "failed",
        processing_error: proposal.processing_error || "Dismissed after timeout/stale run.",
        processing_completed_at: new Date().toISOString(),
      }).eq("id", proposal.id);
    } else {
      await supabase.from("file_proposals").update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
      }).eq("id", proposal.id);
    }
    await refetchProposals();
  }

  async function handleAnalyze(row: SourceRow) {
    if (!canEvidence) return; // evidence.manage
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
    if (!canEvidence) return; // evidence.manage
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
      linkedNeeds:      [],
      filePath:         f.file_path,
      fileType:         f.file_type,
    };
  });

  const socialRows: SourceRow[] = socialNeeds.map((n) => {
    const areas = areasFromSocialNeed(n);
    return {
      id:               n.id,
      type:             "social",
      title:            n.desired_outcome ?? "",
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

  const processedCount        = fileRows.filter((r) => r.processingStatus === "processed").length;
  const usedInFoundationCount = fileRows.filter((r) => r.areas.length > 0).length;
  const analyzedCount         = fileRows.filter((r) => proposalByFileId.get(r.id)?.processing_state === "ready").length;
  const allApplied            = fileRows.length > 0 && usedInFoundationCount === fileRows.length;

  // BSL-1 — outside-signals trigger for the NO-HIERARCHY state. The existing control
  // lives inside the `hasHierarchy` branch, so companies that most need a baseline
  // (birth failed → no routes → no hierarchy) were exactly the ones with no button:
  // the affordance was inverted relative to need. Same handler, same capability, same
  // toast id — this un-hides the existing path for a state it never covered.
  //
  // DEF-3's lesson applies to the label: `baselineRun === null` means "no baseline"
  // AND "not fetched yet". Conflating them would flash "Run outside signals" at a
  // company that already has one, so the label waits for `baselineLoading` to clear
  // rather than guessing.
  const hasWebsiteForBaseline = Boolean(companyWebsite?.trim());
  const hasBaselineRun = !baselineLoading && !!baselineRun;
  const outsideSignalsLabel = baselineLoading
    ? "Checking…"
    : baselineRunning
      ? (hasBaselineRun ? "Refreshing…" : "Running…")
      : hasBaselineRun
        ? "Refresh outside signals →"
        : "Run outside signals →";
  const outsideSignalsBlockedReason = !canRefresh
    ? "Running outside signals requires the refresh-baseline capability"
    : !hasWebsiteForBaseline
      ? "Add a website for this company before running outside signals"
      : undefined;

  // BRT-1 — the birth trigger's state. Offered only when the outside read is banked
  // AND the spine is genuinely empty (research-company's cold-start guard refuses any
  // company that already has one, so offering it otherwise would promise a 409).
  // Blocked states RENDER disabled with the reason rather than hiding — a hidden
  // control is the defect class this whole thread keeps rediscovering.
  const spineKnown = companyHasSpine !== null && companyHasSpine !== undefined;
  const canBirthSpine = spineKnown && companyHasSpine === false && hasBaselineRun && hasWebsiteForBaseline && !!onBirthSpine;
  const birthBlockedReason = !spineKnown
    ? "Checking what this company already has…"
    : companyHasSpine
      ? "This company already has a spine — cold start only ever runs once, on an empty company."
      : !hasBaselineRun
        ? "Run outside signals first — the spine is built from that evidence."
        : !hasWebsiteForBaseline
          ? "Add a website for this company first"
          : undefined;
  const birthLabel = birthRunning
    ? "Building…"
    : !spineKnown
      ? "Checking…"
      : "Build company spine →";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={hasHierarchy
      ? { margin: -36, padding: "40px 48px 80px", background: D.canvas }
      : { padding: "8px 0 80px", maxWidth: 860 }
    }>

      {/* ── PAGE INTRO ────────────────────────────────────────────────────── */}
      {hasHierarchy ? (
        <div style={{ marginBottom: 40 }}>
          <Eyebrow segments={["Strategy", "Inputs"]} />
          <h1 style={{ fontFamily: D.sans, fontSize: 30, fontWeight: 700, color: D.ink, margin: "0 0 10px", lineHeight: 1.05, letterSpacing: "-0.022em", maxWidth: 720 }}>
            Evidence{" "}
            <span style={{ color: D.signal }}>Lineage</span>
          </h1>
          <p style={{ fontFamily: D.sans, fontSize: 13, color: "rgba(17,17,17,0.55)", margin: signalBasis ? "0 0 10px" : "0 0 20px", lineHeight: 1.55, maxWidth: 600 }}>
            What evidence is shaping the strategy — and where signals came from.
          </p>
          {signalBasis && <SignalBasisChip {...signalBasis} />}

          {/* Admin-only: outside signals refresh */}
          {isAdmin && (
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20, marginBottom: 4 }}>
              <span style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.12em", color: "rgba(246,246,244,0.35)" }}>
                Outside signals
              </span>
              {baselineRun?.created_at && (
                <span style={{ fontFamily: D.mono, fontSize: 9, color: "rgba(246,246,244,0.25)" }}>
                  Last run {new Date(baselineRun.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
              <button
                type="button"
                disabled={baselineRunning || !canRefresh}
                title={!canRefresh ? "Refreshing outside signals requires the refresh-baseline capability" : undefined}
                onClick={() => void handleRefreshBaseline()}
                style={{
                  fontFamily: D.mono, fontSize: 9, color: baselineRunning || !canRefresh ? "rgba(246,246,244,0.25)" : "#7a9e90",
                  background: "none", border: "none", padding: 0,
                  cursor: baselineRunning || !canRefresh ? "default" : "pointer",
                  textDecoration: "underline", textDecorationStyle: "dashed", textUnderlineOffset: 3,
                }}
              >
                {baselineRunning ? "Refreshing…" : "Refresh outside signals →"}
              </button>
            </div>
          )}

          {/* Dynamic integration status */}
          {!allApplied && fileRows.length > 0 && (() => {
            let eyebrow: string;
            let headline: string;
            let sub: string;
            if (analyzedCount === 0) {
              eyebrow = "Not yet analyzed";
              headline = `${fileRows.length} source${fileRows.length === 1 ? "" : "s"} uploaded — run analysis to extract signals.`;
              sub = "Use Run analysis → below on each file to begin deep extraction.";
            } else if (usedInFoundationCount === 0) {
              eyebrow = "Not yet integrated";
              headline = `${analyzedCount} of ${fileRows.length} source${fileRows.length === 1 ? "" : "s"} analyzed — none assigned to foundation areas yet.`;
              sub = "Assign foundation areas below to begin shaping strategy with your evidence.";
            } else {
              eyebrow = "Partially integrated";
              headline = `${usedInFoundationCount} of ${fileRows.length} source${fileRows.length === 1 ? "" : "s"} assigned to foundation areas.`;
              sub = `${fileRows.length - usedInFoundationCount} source${fileRows.length - usedInFoundationCount === 1 ? "" : "s"} still need area assignment.`;
            }
            return (
              <div style={{
                background: "#1a1a1a",
                borderLeft: `5px solid ${D.signal}`,
                borderRadius: 4,
                padding: "18px 22px",
                marginTop: 20,
                marginBottom: 8,
              }}>
                <p style={{ fontFamily: D.mono, fontSize: 10, textTransform: "uppercase" as const, letterSpacing: "0.14em", color: D.signal, margin: "0 0 8px" }}>
                  {eyebrow}
                </p>
                <p style={{ fontFamily: D.sans, fontSize: 17, fontWeight: 600, lineHeight: 1.4, color: "rgba(246,246,244,0.92)", margin: 0 }}>
                  {headline}
                </p>
                <p style={{ fontFamily: D.sans, fontSize: 13, color: "rgba(246,246,244,0.5)", margin: "8px 0 0", lineHeight: 1.5 }}>
                  {sub}
                </p>
              </div>
            );
          })()}
        </div>
      ) : (
        <div style={{ marginBottom: 28 }}>
          <span style={LABEL_TINY}>Evidence Lineage</span>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#aaa", fontFamily: "monospace" }}>
            What evidence is shaping the strategy — and where signals came from.
          </p>
          {/* BSL-1: the same admin-only trigger the hierarchy branch has, for the state
              that had none. Identical handler/capability/toast — no new invocation path.
              Rendered (not hidden) when blocked, with the reason in the title, because a
              hidden control is what caused this gap. DRAFT strings pending signature. */}
          {isAdmin && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={baselineLoading || baselineRunning || !canRefresh || !hasWebsiteForBaseline}
                title={outsideSignalsBlockedReason}
                onClick={() => void handleRefreshBaseline()}
                style={{
                  fontFamily: "monospace", fontSize: 10, letterSpacing: "0.06em",
                  color: baselineLoading || baselineRunning || !canRefresh || !hasWebsiteForBaseline ? "#bbb" : "#2f6b3a",
                  background: "none", border: "none", padding: 0,
                  cursor: baselineLoading || baselineRunning || !canRefresh || !hasWebsiteForBaseline ? "default" : "pointer",
                  textDecoration: "underline", textDecorationStyle: "dashed", textUnderlineOffset: 3,
                }}
              >
                {outsideSignalsLabel}
              </button>
              {!baselineLoading && !hasBaselineRun && (
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#aaa" }}>
                  No outside signals collected for this company yet.
                </span>
              )}
              {hasBaselineRun && baselineRun?.created_at && (
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#aaa" }}>
                  Last run {new Date(baselineRun.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
            </div>
          )}
          {/* BRT-1 — cold start for a company whose outside read is banked but whose
              spine was never built. Until now the only birth trigger on this surface
              lived inside company CREATION, so an existing company in this state had
              no path at all. Runs the same run-agent-flow invocation create-instance
              makes (shared coldStartBody, include_public_collection:false → consumes
              the banked signals rather than re-collecting). DRAFT strings pending
              operator signature. */}
          {isAdmin && (companyHasSpine === false || birthRunning) && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={!canBirthSpine || birthRunning}
                title={birthBlockedReason}
                onClick={() => onBirthSpine?.()}
                style={{
                  fontFamily: "monospace", fontSize: 10, letterSpacing: "0.06em",
                  color: !canBirthSpine || birthRunning ? "#bbb" : "#2f6b3a",
                  background: "none", border: "none", padding: 0,
                  cursor: !canBirthSpine || birthRunning ? "default" : "pointer",
                  textDecoration: "underline", textDecorationStyle: "dashed", textUnderlineOffset: 3,
                }}
              >
                {birthLabel}
              </button>
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "#aaa" }}>
                {birthBlockedReason ?? "Builds this company's routes, job map and market definition from the outside read. Takes a few minutes."}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── OC-2b: First Read entry point — always present, ungated by company-state ── */}
      {isAdmin && <OpenFirstReadControl companyId={companyId} dark={hasHierarchy} />}

      {/* ── EVIDENCE SOURCE STATUS ────────────────────────────────────────── */}
      {evidenceStatus && (
        <div style={{
          marginBottom: 28,
          padding: "12px 16px",
          background: evidenceStatus.needsReconstructed > 0 || evidenceStatus.routesReconstructed > 0
            ? "#fdf8f3" : "#f4faf7",
          border: `1px solid ${evidenceStatus.needsReconstructed > 0 || evidenceStatus.routesReconstructed > 0
            ? "#e8cfa8" : "#b8d8c8"}`,
          borderRadius: 4,
        }}>
          <div style={{ ...LABEL_TINY, marginBottom: 10 }}>Signal origin</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px" }}>
            <div style={{ ...MONO, fontSize: 10, color: "#666" }}>
              Evidence files
              <span style={{ float: "right", color: companyFiles.length > 0 ? "#1a8f5a" : "#c0392b" }}>
                {companyFiles.length}
              </span>
            </div>
            <div style={{ ...MONO, fontSize: 10, color: "#666" }}>
              Customer tensions mapped
              <span style={{ float: "right", color: "#555" }}>{evidenceStatus.needsTotal}</span>
            </div>
            <div style={{ ...MONO, fontSize: 10, color: "#666" }}>
              Directional routes
              <span style={{ float: "right", color: "#555" }}>{evidenceStatus.routesTotal}</span>
            </div>
            <div style={{ ...MONO, fontSize: 10, color: "#666" }}>
              Job steps defined
              <span style={{ float: "right", color: "#555" }}>{evidenceStatus.stepsTotal}</span>
            </div>
          </div>
          {(evidenceStatus.needsReconstructed > 0 || evidenceStatus.routesReconstructed > 0) && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e8cfa8" }}>
              <div style={{ ...MONO, fontSize: 10, color: "#b35c00" }}>
                Inferred from prior session (not file-verified):
              </div>
              <ul style={{ margin: "6px 0 0", padding: "0 0 0 14px" }}>
                {evidenceStatus.needsReconstructed > 0 && (
                  <li style={{ ...MONO, fontSize: 10, color: "#b35c00", lineHeight: 1.5 }}>
                    {evidenceStatus.needsReconstructed} of {evidenceStatus.needsTotal} customer tensions — inferred, not yet verified by uploaded evidence
                  </li>
                )}
                {evidenceStatus.routesReconstructed > 0 && (
                  <li style={{ ...MONO, fontSize: 10, color: "#b35c00", lineHeight: 1.5 }}>
                    {evidenceStatus.routesReconstructed} of {evidenceStatus.routesTotal} directional routes — inferred, not yet verified by uploaded evidence
                  </li>
                )}
              </ul>
              <p style={{ ...MONO, fontSize: 10, color: "#c8a060", margin: "8px 0 0", lineHeight: 1.5 }}>
                Upload evidence files and run analysis to strengthen signal confidence.
              </p>
            </div>
          )}
          {evidenceStatus.needsReconstructed === 0 && evidenceStatus.routesReconstructed === 0 && companyFiles.length > 0 && (
            <div style={{ marginTop: 8, ...MONO, fontSize: 10, color: "#1a8f5a" }}>
              Signals appear file-verified.
            </div>
          )}
          {evidenceStatus.needsReconstructed === 0 && evidenceStatus.routesReconstructed === 0 && companyFiles.length === 0 && evidenceStatus.needsTotal > 0 && (
            <div style={{ marginTop: 8, ...MONO, fontSize: 10, color: "#888" }}>
              Signal origin unclear — no uploaded evidence files found.
            </div>
          )}
        </div>
      )}

      {/* ── ADD INPUT ─────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ ...LABEL_TINY, marginBottom: 12 }}>Add Input</div>

        {/* Primary: file upload */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", marginBottom: 20 }}>
          <PrimaryAddBtn label="Upload file" active={false} onClick={() => setOpenUpload(true)} disabled={!canEvidence} disabledReason="Adding evidence requires the evidence-manage capability" />
          <p style={{ ...MONO, fontSize: 10, color: "#aaa", margin: 0 }}>
            Upload documents, decks, notes, transcripts, or research files.
          </p>
        </div>

        {/* Secondary: social signal */}
        <div style={{ borderTop: "1px solid #f0ece8", paddingTop: 16 }}>
          <button
            type="button"
            onClick={() => setShowSocial((v) => !v)}
            disabled={!canEvidence}
            title={!canEvidence ? "Adding evidence requires the evidence-manage capability" : undefined}
            style={{
              ...MONO, fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase",
              color: showSocial ? "#555" : "#aaa", background: "none", border: "none",
              padding: 0, cursor: canEvidence ? "pointer" : "default", opacity: canEvidence ? 1 : 0.5,
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

      {/* ── EVIDENCE SOURCES ────────────────────────────────────────────── */}
      <div>
        {/* Evidence impact lead */}
        {fileRows.length > 0 && (() => {
          const areasSet = new Set<string>();
          fileRows.forEach((r) => r.areas.forEach((a) => areasSet.add(areaDisplayLabel(a))));
          const areaList = [...areasSet];
          const coveredAreaKeys = new Set(
            fileRows.flatMap((r) => r.areas as FoundationArea[])
          );
          const unsupportedAreas = FOUNDATION_AREAS.filter((a) => !coveredAreaKeys.has(a)).map(areaDisplayLabel);
          const impactLine = usedInFoundationCount > 0
            ? `${usedInFoundationCount} source${usedInFoundationCount === 1 ? "" : "s"} reinforcing current direction — ${areaList.length > 0 ? areaList.join(", ").toLowerCase() : "foundation areas"}.`
            : `${fileRows.length} source${fileRows.length === 1 ? "" : "s"} uploaded — not yet integrated into foundation areas.`;
          const unsupportedLine = usedInFoundationCount > 0 && unsupportedAreas.length > 0
            ? `${unsupportedAreas.join(", ").toLowerCase()} — no evidence yet.`
            : null;
          return (
            <>
              <p style={{ fontSize: 13, color: "#2d4a3e", lineHeight: 1.55, marginBottom: unsupportedLine ? 4 : 20, marginTop: 0, fontWeight: 400 }}>
                {impactLine}
              </p>
              {unsupportedLine && (
                <p style={{ fontSize: 11, color: "#8a8a78", lineHeight: 1.5, marginBottom: 18, marginTop: 0, fontFamily: "monospace", letterSpacing: "0.01em" }}>
                  {unsupportedLine}
                </p>
              )}
            </>
          );
        })()}

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
            <span style={LABEL_TINY}>Evidence memory</span>
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
                  <th style={{ ...TH, paddingRight: 0 }}>Areas</th>
                  <th style={TH}>Analysis</th>
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
                          {row.type === "file" && row.filePath && (
                            <button
                              type="button"
                              onClick={() => handleOpenFile(row)}
                              disabled={openingFileId === row.id}
                              style={{
                                ...MONO, fontSize: 9, color: openingFileId === row.id ? "#aaa" : "#7a9e90",
                                background: "none", border: "none", padding: 0, marginTop: 4,
                                cursor: openingFileId === row.id ? "default" : "pointer",
                                textDecoration: "underline", textDecorationStyle: "dashed",
                                textUnderlineOffset: 3,
                              }}
                            >
                              {openingFileId === row.id ? "Opening file…" : "View file →"}
                            </button>
                          )}
                        </td>
                        <td style={{ ...TD, color: "#aaa", whiteSpace: "nowrap" }}>{row.source || "—"}</td>
                        <td style={{ ...TD, color: "#ccc", whiteSpace: "nowrap" }}>{row.date}</td>
                        {/* Areas column — area chips or assign prompt */}
                        <td style={{ ...TD, paddingRight: 0 }}>
                          <UsedByCell
                            areas={row.areas}
                            linkedNeeds={row.linkedNeeds}
                            onUseThis={() => setUseThisId(panelOpen ? null : row.id)}
                            rowType={row.type}
                          />
                        </td>
                        {/* Analysis column — Dify proposal state (file rows only) */}
                        <td style={{ ...TD, whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {row.type !== "file" ? (
                              <span style={{ ...MONO, fontSize: 9, color: "#e0dcd8" }}>—</span>
                            ) : (() => {
                              const proposal = proposalByFileId.get(row.id);
                              if (proposal) {
                                const isActiveProposal = proposal.processing_state === "queued" || proposal.processing_state === "running";
                                const isFailedProposal = proposal.processing_state === "failed";
                                return (
                                  <>
                                    <span style={fileProposalProcessingBadgeStyle(proposal)}>
                                      {fileProposalProcessingBadgeText(proposal)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setProposalPanelId(proposalPanelOpen ? null : row.id);
                                        setUseThisId(null);
                                        setDeleteConfirmId(null);
                                      }}
                                      style={{
                                        ...MONO, fontSize: 9, color: isFailedProposal ? "#c0392b" : "#2d8a60", background: "none",
                                        border: "none", padding: 0, cursor: "pointer",
                                        textDecoration: "underline", textDecorationStyle: "dashed",
                                        textUnderlineOffset: 3,
                                      }}
                                    >
                                      {proposalPanelOpen
                                        ? `↑ Close review${fileProposalReviewCountsText(proposal)}`
                                        : `Review proposal →${fileProposalReviewCountsText(proposal)}`}
                                    </button>
                                    {isActiveProposal ? (
                                      <span style={{ ...MONO, fontSize: 9, color: "#9aa79f" }}>
                                        Updating automatically…
                                      </span>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleDifyAnalyze(row)}
                                          disabled={difyAnalyzingFileId === row.id}
                                          style={{
                                            ...MONO, fontSize: 9, color: difyAnalyzingFileId === row.id ? "#aaa" : "#7a9e90", background: "none",
                                            border: "none", padding: 0, cursor: difyAnalyzingFileId === row.id ? "default" : "pointer",
                                            textDecoration: "underline", textDecorationStyle: "dashed",
                                            textUnderlineOffset: 3,
                                          }}
                                        >
                                          {difyAnalyzingFileId === row.id ? "Analyzing…" : "Re-run analysis →"}
                                        </button>
                                        {isFailedProposal && (
                                          <button
                                            type="button"
                                            onClick={() => handleDismissProposal(proposal)}
                                            style={{
                                              ...MONO, fontSize: 9, color: "#c0392b", background: "none",
                                              border: "none", padding: 0, cursor: "pointer",
                                              textDecoration: "underline", textUnderlineOffset: 3,
                                            }}
                                          >
                                            Dismiss failed run →
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </>
                                );
                              }
                              if (difyAnalyzingFileId === row.id) {
                                return <span style={{ ...MONO, fontSize: 9, color: "#c97700" }}>Analyzing…</span>;
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
                                    Analysis failed — retry →
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
                                  {difyAnalyzingFileId === row.id ? "Analyzing…" : "Run analysis →"}
                                </button>
                              );
                            })()}
                          </div>
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
                              title="Archive file (recoverable)"
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
                              onClose={() => setProposalPanelId(null)}
                              onAccept={(payload) => handleAcceptProposal(row, proposalByFileId.get(row.id)!, payload)}
                              onDismiss={() => handleDismissProposal(proposalByFileId.get(row.id)!)}
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

      {/* Archived files section */}
      {archivedFiles.length > 0 && (
        <div style={{ marginTop: 24, padding: "0 0 8px" }}>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 11, color: "#b8b0a8", padding: "4px 0",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <span style={{ fontFamily: "monospace" }}>{showArchived ? "▾" : "▸"}</span>
            {archivedFiles.length} archived file{archivedFiles.length !== 1 ? "s" : ""}
          </button>
          {showArchived && (
            <div style={{ marginTop: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #f0ece8" }}>
                    <th style={{ textAlign: "left", padding: "4px 8px", color: "#b8b0a8", fontWeight: 400 }}>Filename</th>
                    <th style={{ textAlign: "left", padding: "4px 8px", color: "#b8b0a8", fontWeight: 400 }}>Uploaded</th>
                    <th style={{ textAlign: "left", padding: "4px 8px", color: "#b8b0a8", fontWeight: 400 }}>Archived</th>
                    <th style={{ textAlign: "left", padding: "4px 8px", color: "#b8b0a8", fontWeight: 400 }}>Reason</th>
                    <th style={{ padding: "4px 8px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {archivedFiles.map((f) => (
                    <tr key={f.id} style={{ borderBottom: "1px solid #f8f6f4" }}>
                      <td style={{ padding: "4px 8px", color: "#b8b0a8", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          title={f.file_name}>{f.file_name}</td>
                      <td style={{ padding: "4px 8px", color: "#c8c2ba", whiteSpace: "nowrap" }}>
                        {f.uploaded_at ? new Date(f.uploaded_at).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ padding: "4px 8px", color: "#c8c2ba", whiteSpace: "nowrap" }}>
                        {f.archived_at ? new Date(f.archived_at).toLocaleDateString() : "—"}
                      </td>
                      <td style={{ padding: "4px 8px", color: "#c8c2ba" }}>
                        {f.archive_reason ?? "—"}
                      </td>
                      <td style={{ padding: "4px 8px" }}>
                        <button
                          type="button"
                          onClick={() => handleRestoreFile(f.id)}
                          style={{
                            fontSize: 10, color: "#8b7355",
                            background: "none", border: "1px solid #e8e2da",
                            borderRadius: 3, padding: "2px 6px", cursor: "pointer",
                          }}
                        >
                          Restore
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
