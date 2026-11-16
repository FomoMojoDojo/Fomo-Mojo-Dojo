import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, Upload, ExternalLink, Trash2, FolderDown, ClipboardPenLine } from "lucide-react";
import FileUploadDialog from "@/components/FileUploadDialog";
import { getFileSignedUrl, useDeleteInputFile, useInputs } from "@/hooks/useInputs";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import type { InputFile } from "@/lib/types";
import { visibleFileTags } from "@/lib/fileTags";
import { buildDefaultCheckpointSeed } from "@/lib/jtbdProcess";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import VoiceGatePanel from "@/components/admin/VoiceGatePanel";
import { useCompanyFiles } from "@/hooks/useCompanyFiles";
import { useFileProposals } from "@/hooks/useFileProposals";
import { useProposalSync } from "@/hooks/useProposalSync";
import { runDifyAnalyzeFile } from "@/hooks/useInputActions";
import { FileTooLargeError, fileTooLargeMessage, type FileTooLargeRefusal } from "@/lib/fileTooLarge";
import { FileAnalysisBadge, MONO, latestProposalByFile } from "@/views/client/workshop/inputsShared";
import { WORKSPACE_STRINGS } from "@/views/client/workspace/workspaceNav";

const c = {
  panel: "#FFFFFF",
  paper: "#FFFFFF",
  line: "#DDE6D1",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  warm: "#B67A45",
};

interface FileWithContext extends InputFile {
  inputId: string;
  inputKey: string;
  inputLabel: string;
  groupLabel: string;
  subGroup: string;
}

interface Props {
  companyId: string;
  companyName: string;
  mode?: "preview" | "full";
}

type QuizIntakePayload = {
  where_stuck?: string;
  where_stuck_other?: string;
  decision_slowdowns?: string[];
  customer_confidence?: string;
  last_customer_input?: string;
  momentum_drag?: string;
  momentum_drag_other?: string;
  explicit_strategic_problem?: string;
  desired_outcome?: string;
  desired_outcome_other?: string;
  success_definition?: string;
  company_name?: string;
  website_url?: string;
  industry?: string;
  notes?: string;
  run_initial_public_signal_pass?: boolean;
  submitted_at?: string;
  mojo_snapshot?: {
    starting_mode?: string;
    primary_friction?: string;
    customer_truth_signal?: string;
    top_focus_areas?: string[];
  };
};

const LOCAL_ODI_STEP_SEED = buildDefaultCheckpointSeed().map((checkpoint) => ({
  label: checkpoint.step_label,
  description: checkpoint.description,
})) as const;

function presentText(value?: string | null) {
  const trimmed = String(value || "").trim();
  return trimmed || "Not provided";
}

function normalizeWebsite(value?: string | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed;
  }
}

function buildQuizIntakeMarkdown(payload: QuizIntakePayload, companyName: string) {
  const website = normalizeWebsite(payload.website_url);
  const slowdowns = (payload.decision_slowdowns || []).filter(Boolean).join(", ") || "Not provided";
  const focusAreas = (payload.mojo_snapshot?.top_focus_areas || []).filter(Boolean);
  const submittedAt = payload.submitted_at || new Date().toISOString();

  return [
    "# Quiz Intake Brief",
    "",
    `- Company: ${companyName}`,
    `- Website: ${presentText(website)}`,
    `- Industry: ${presentText(payload.industry)}`,
    `- Submitted: ${submittedAt}`,
    "",
    "## Strategic Problem",
    presentText(payload.explicit_strategic_problem),
    "",
    "## Desired Outcome",
    `- Outcome: ${presentText(payload.desired_outcome)}${payload.desired_outcome_other ? ` (${payload.desired_outcome_other})` : ""}`,
    `- Success definition: ${presentText(payload.success_definition)}`,
    "",
    "## What The Client Shared",
    `- Where things feel stuck: ${presentText(payload.where_stuck)}${payload.where_stuck_other ? ` (${payload.where_stuck_other})` : ""}`,
    `- What slows decisions: ${slowdowns}`,
    `- Customer confidence: ${presentText(payload.customer_confidence)}`,
    `- Last customer input used: ${presentText(payload.last_customer_input)}`,
    `- Biggest drag on momentum: ${presentText(payload.momentum_drag)}${payload.momentum_drag_other ? ` (${payload.momentum_drag_other})` : ""}`,
    "",
    "## Mojo Snapshot",
    `- Starting mode: ${presentText(payload.mojo_snapshot?.starting_mode)}`,
    `- Primary friction: ${presentText(payload.mojo_snapshot?.primary_friction)}`,
    `- Customer truth signal: ${presentText(payload.mojo_snapshot?.customer_truth_signal)}`,
    `- Top focus areas: ${focusAreas.length ? focusAreas.join(", ") : "Not provided"}`,
    "",
    "## Additional Notes",
    presentText(payload.notes),
    "",
    `- Run initial public signal pass: ${payload.run_initial_public_signal_pass ? "Yes" : "No"}`,
  ].join("\n");
}

function buildQuizExtractedText(payload: QuizIntakePayload, companyName: string) {
  const website = normalizeWebsite(payload.website_url);
  const slowdowns = (payload.decision_slowdowns || []).filter(Boolean).join(", ") || "Not provided";
  const focusAreas = (payload.mojo_snapshot?.top_focus_areas || []).filter(Boolean).join(", ") || "Not provided";

  return [
    `Company: ${companyName}`,
    `Website: ${presentText(website)}`,
    `Industry: ${presentText(payload.industry)}`,
    `Strategic problem: ${presentText(payload.explicit_strategic_problem)}`,
    `Desired outcome: ${presentText(payload.desired_outcome)}${payload.desired_outcome_other ? ` (${payload.desired_outcome_other})` : ""}`,
    `Success definition: ${presentText(payload.success_definition)}`,
    `Where stuck: ${presentText(payload.where_stuck)}${payload.where_stuck_other ? ` (${payload.where_stuck_other})` : ""}`,
    `Decision slowdowns: ${slowdowns}`,
    `Customer confidence: ${presentText(payload.customer_confidence)}`,
    `Last customer input: ${presentText(payload.last_customer_input)}`,
    `Momentum drag: ${presentText(payload.momentum_drag)}${payload.momentum_drag_other ? ` (${payload.momentum_drag_other})` : ""}`,
    `Starting mode: ${presentText(payload.mojo_snapshot?.starting_mode)}`,
    `Primary friction: ${presentText(payload.mojo_snapshot?.primary_friction)}`,
    `Customer truth signal: ${presentText(payload.mojo_snapshot?.customer_truth_signal)}`,
    `Top focus areas: ${focusAreas}`,
    `Notes: ${presentText(payload.notes)}`,
  ].join("\n");
}

function toTitleCase(value: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function cleanSentence(value: string, maxLength = 160) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const withoutTerminal = normalized.replace(/[.?!]+$/, "");
  return withoutTerminal.length > maxLength ? `${withoutTerminal.slice(0, maxLength - 1).trim()}…` : withoutTerminal;
}

function deriveIntakeAudience(payload: QuizIntakePayload) {
  const corpus = [
    payload.explicit_strategic_problem,
    payload.desired_outcome,
    payload.success_definition,
    payload.where_stuck,
    payload.where_stuck_other,
    payload.notes,
  ]
    .map((item) => String(item || ""))
    .join(" ");

  const explicitMatch = corpus.match(
    /\b(first responders?|stakeholders?|partners?|customers?|members?|patients?|families|operators?|buyers?|claimants?|riders?|guests?|leaders?|teams?)\b/i,
  );
  if (explicitMatch?.[1]) return toTitleCase(explicitMatch[1]);

  const forMatch = corpus.match(/\bfor\s+([A-Za-z][A-Za-z\s&/-]{3,50})/i);
  if (forMatch?.[1]) {
    const candidate = cleanSentence(forMatch[1], 42).replace(/\b(to|who|with|when|so)\b.*$/i, "").trim();
    if (candidate) return toTitleCase(candidate);
  }

  return "Primary Job Performer";
}

function deriveJobMapTitle(payload: QuizIntakePayload) {
  const desiredOutcome = cleanSentence(payload.desired_outcome || "", 56);
  if (desiredOutcome) return `Checkpoint Map: ${toTitleCase(desiredOutcome)}`;
  const problem = cleanSentence(payload.explicit_strategic_problem || "", 56);
  if (problem) return `Checkpoint Map: ${toTitleCase(problem)}`;
  return `Checkpoint Map: ${deriveIntakeAudience(payload)}`;
}

function deriveJobMapSubtitle(payload: QuizIntakePayload) {
  const audience = deriveIntakeAudience(payload).toLowerCase();
  const desiredOutcome = cleanSentence(payload.desired_outcome || "", 80);
  if (desiredOutcome) {
    return `How ${audience} define, prepare, execute, monitor, and improve progress toward ${desiredOutcome.toLowerCase()}.`;
  }
  const problem = cleanSentence(payload.explicit_strategic_problem || "", 88);
  if (problem) {
    return `How ${audience} move through this job while dealing with ${problem.toLowerCase()}.`;
  }
  return `How ${audience} define, locate, prepare, execute, monitor, and conclude progress.`;
}

function deriveJtbdStatement(payload: QuizIntakePayload) {
  const audience = deriveIntakeAudience(payload).toLowerCase();
  const desiredOutcome = cleanSentence(payload.desired_outcome || "", 110);
  const problem = cleanSentence(payload.explicit_strategic_problem || "", 110);
  if (desiredOutcome) {
    return `When trying to ${desiredOutcome.toLowerCase()}, ${audience} want to understand their options, move with confidence, and see evidence that the path is working, so they can make progress with less uncertainty and rework.`;
  }
  if (problem) {
    return `When dealing with ${problem.toLowerCase()}, ${audience} want to understand what to do next, choose the right path, and move forward with confidence, so they can make progress without unnecessary delay or confusion.`;
  }
  return `When trying to complete this job, ${audience} want to understand options, act with confidence, and confirm progress, so they can reach the intended result with less delay and confusion.`;
}

function deriveChooser(payload: QuizIntakePayload) {
  const audience = deriveIntakeAudience(payload);
  if (/partner/i.test(audience)) return `${audience} or internal sponsor`;
  if (/leader|team/i.test(audience)) return `${audience} lead or sponsor`;
  return `${audience} or decision-maker`;
}

function deriveIntakeNeedCandidates(payload: QuizIntakePayload) {
  const corpus = [
    payload.explicit_strategic_problem,
    payload.desired_outcome,
    payload.success_definition,
    payload.where_stuck,
    payload.momentum_drag,
    payload.notes,
  ]
    .map((item) => String(item || "").toLowerCase())
    .join(" ");

  const needs: Array<{ desired_outcome: string; step_number: number; step_label: string; importance: number; satisfaction: number; service_state: string }> = [];
  const add = (desiredOutcome: string, stepNumber: number, importance = 8, satisfaction = 4, serviceState = "underserved") => {
    const normalized = cleanSentence(desiredOutcome, 180);
    if (!normalized) return;
    if (needs.some((item) => item.desired_outcome.toLowerCase() === normalized.toLowerCase())) return;
    const seed = LOCAL_ODI_STEP_SEED[Math.max(0, Math.min(LOCAL_ODI_STEP_SEED.length - 1, stepNumber - 1))];
    needs.push({
      desired_outcome: normalized,
      step_number: stepNumber,
      step_label: seed.label,
      importance,
      satisfaction,
      service_state: serviceState,
    });
  };

  if (/impact|measure|track|assess|prove|evidence/i.test(corpus)) {
    add("Minimize the time it takes to see whether the effort is making a meaningful difference", 5, 9, 4);
  }
  if (/eligib|qualif|clarity|understand|confus/i.test(corpus)) {
    add("Minimize the time it takes to understand whether this option applies in the current situation", 2, 8, 4);
  }
  if (/access|find|locate|channel|resource|support/i.test(corpus)) {
    add("Minimize the effort required to find the right resource or next step", 2, 8, 3);
  }
  if (/confidence|trust|prove|uncertain|guess/i.test(corpus)) {
    add("Increase confidence that the chosen path will lead to a reliable result", 5, 9, 4);
  }
  if (/consisten|repeatable|delivery|ownership|accountab/i.test(corpus)) {
    add("Minimize variation in how the experience is delivered across people, partners, or cases", 6, 8, 4);
  }
  if (/priority|decision|slow|stall|alignment/i.test(corpus)) {
    add("Minimize the time it takes to make the next decision without extra interpretation or debate", 3, 8, 4);
  }

  if (needs.length === 0) {
    const desiredOutcome = cleanSentence(payload.desired_outcome || "", 120);
    if (desiredOutcome) {
      add(`Increase confidence in making progress toward ${desiredOutcome.toLowerCase()}`, 5, 8, 4);
    }
  }

  return needs.slice(0, 4);
}

function sanitizeQuizPayload(value: unknown): QuizIntakePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Paste the full quiz JSON object.");
  }

  const source = value as Record<string, unknown>;
  const mojoSnapshotRaw =
    source.mojo_snapshot && typeof source.mojo_snapshot === "object" && !Array.isArray(source.mojo_snapshot)
      ? (source.mojo_snapshot as Record<string, unknown>)
      : {};

  const cleanString = (input: unknown) => {
    const text = typeof input === "string" ? input.trim() : "";
    return text;
  };

  return {
    where_stuck: cleanString(source.where_stuck),
    where_stuck_other: cleanString(source.where_stuck_other),
    decision_slowdowns: Array.isArray(source.decision_slowdowns)
      ? source.decision_slowdowns.map((item) => cleanString(item)).filter(Boolean)
      : [],
    customer_confidence: cleanString(source.customer_confidence),
    last_customer_input: cleanString(source.last_customer_input),
    momentum_drag: cleanString(source.momentum_drag),
    momentum_drag_other: cleanString(source.momentum_drag_other),
    explicit_strategic_problem: cleanString(source.explicit_strategic_problem),
    desired_outcome: cleanString(source.desired_outcome),
    desired_outcome_other: cleanString(source.desired_outcome_other),
    success_definition: cleanString(source.success_definition),
    company_name: cleanString(source.company_name),
    website_url: cleanString(source.website_url),
    industry: cleanString(source.industry),
    notes: cleanString(source.notes),
    run_initial_public_signal_pass: source.run_initial_public_signal_pass !== false,
    submitted_at: cleanString(source.submitted_at),
    mojo_snapshot: {
      starting_mode: cleanString(mojoSnapshotRaw.starting_mode),
      primary_friction: cleanString(mojoSnapshotRaw.primary_friction),
      customer_truth_signal: cleanString(mojoSnapshotRaw.customer_truth_signal),
      top_focus_areas: Array.isArray(mojoSnapshotRaw.top_focus_areas)
        ? mojoSnapshotRaw.top_focus_areas.map((item) => cleanString(item)).filter(Boolean)
        : [],
    },
  };
}

function parseListValue(value: string) {
  return String(value || "")
    .split(/[;\n]/g)
    .map((item) => item.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getFirstNonEmpty(values: Array<string | undefined>) {
  for (const value of values) {
    const trimmed = String(value || "").trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function extractLabeledValue(raw: string, label: string) {
  const patterns = [
    new RegExp(`(?:^|\\n)${escapeRegExp(label)}:?\\s*([^\\n]+)`, "i"),
    new RegExp(`(?:^|\\n)${escapeRegExp(label)}\\s*\\n\\s*([^\\n]+)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return "";
}

function extractSectionBlock(raw: string, sectionLabel: string, nextSectionLabels: string[]) {
  const startPattern = new RegExp(`(?:^|\\n)${escapeRegExp(sectionLabel)}:?\\s*(?:\\n|$)`, "i");
  const startMatch = startPattern.exec(raw);
  if (!startMatch) return "";

  const startIndex = startMatch.index + startMatch[0].length;
  const remainder = raw.slice(startIndex);
  let endIndex = remainder.length;

  for (const nextLabel of nextSectionLabels) {
    const nextPattern = new RegExp(`(?:^|\\n)${escapeRegExp(nextLabel)}:?\\s*(?:\\n|$)`, "i");
    const nextMatch = nextPattern.exec(remainder);
    if (nextMatch && nextMatch.index < endIndex) {
      endIndex = nextMatch.index;
    }
  }

  return remainder.slice(0, endIndex).trim();
}

function parseEmailIntakePayload(raw: string): QuizIntakePayload {
  const normalized = String(raw || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const extractOptionAndOther = (value: string) => {
    const trimmed = String(value || "").trim();
    const match = trimmed.match(/^(.*?)\s*\((.*?)\)\s*$/);
    if (!match) return { primary: trimmed, other: "" };
    return {
      primary: match[1].trim(),
      other: match[2].trim(),
    };
  };

  const company = extractLabeledValue(normalized, "Company");
  const website = getFirstNonEmpty([
    extractLabeledValue(normalized, "Website"),
    normalized.match(/\bhttps?:\/\/[^\s<>"')]+/i)?.[0],
    normalized.match(/\b(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>"')]*)?/i)?.[0],
  ]);
  const industry = extractLabeledValue(normalized, "Industry");
  const strategicProblem = getFirstNonEmpty([
    extractSectionBlock(normalized, "MAIN STRATEGIC PROBLEM", [
      "DESIRED OUTCOME",
      "Desired outcome",
      "QUIZ INPUTS",
      "Inputs",
      "MOJOMAP™",
      "MOJOMAP",
      "ADDITIONAL CONTEXT",
      "Notes",
    ]),
    extractSectionBlock(normalized, "Main strategic problem", [
      "DESIRED OUTCOME",
      "Desired outcome",
      "QUIZ INPUTS",
      "Inputs",
      "MOJOMAP™",
      "MOJOMAP",
      "ADDITIONAL CONTEXT",
      "Notes",
    ]),
    extractLabeledValue(normalized, "Main strategic problem"),
    extractLabeledValue(normalized, "Strategic problem"),
  ]);
  const outcomeValue = getFirstNonEmpty([
    extractLabeledValue(normalized, "Outcome"),
    extractLabeledValue(normalized, "Desired outcome"),
  ]);
  const successDefinition = extractLabeledValue(normalized, "Success definition");
  const whereStuck = extractOptionAndOther(extractLabeledValue(normalized, "Where stuck"));
  const desiredOutcome = extractOptionAndOther(outcomeValue);
  const biggestDrag = extractOptionAndOther(
    getFirstNonEmpty([
      extractLabeledValue(normalized, "Biggest drag"),
      extractLabeledValue(normalized, "Momentum drag"),
    ]),
  );
  const decisionSlowdowns = parseListValue(
    getFirstNonEmpty([
      extractLabeledValue(normalized, "Decision slowdowns"),
      extractLabeledValue(normalized, "What slows decisions"),
    ]),
  );
  const customerConfidence = extractLabeledValue(normalized, "Customer confidence");
  const lastCustomerInput = extractLabeledValue(normalized, "Last customer input");
  const startingMode = extractLabeledValue(normalized, "Starting mode");
  const primaryFriction = extractLabeledValue(normalized, "Primary friction");
  const customerTruthSignal = extractLabeledValue(normalized, "Customer truth signal");
  const notes = extractLabeledValue(normalized, "Notes");
  const submittedAt = getFirstNonEmpty([
    extractLabeledValue(normalized, "Submitted at"),
    extractLabeledValue(normalized, "Timestamp"),
  ]);
  const runInitialPassRaw = getFirstNonEmpty([
    extractLabeledValue(normalized, "Run initial public-information pass"),
    extractLabeledValue(normalized, "Run initial public signal pass"),
    extractLabeledValue(normalized, "Run public-information pass"),
  ]);

  const focusAreasBlock = getFirstNonEmpty([
    extractSectionBlock(normalized, "Top focus areas", [
      "ADDITIONAL CONTEXT",
      "Notes",
      "Run initial public-information pass",
      "Run initial public signal pass",
      "Run public-information pass",
      "Submitted at",
      "Timestamp",
    ]),
    extractSectionBlock(normalized, "- Top focus areas", [
      "ADDITIONAL CONTEXT",
      "Notes",
      "Run initial public-information pass",
      "Run initial public signal pass",
      "Run public-information pass",
      "Submitted at",
      "Timestamp",
    ]),
  ]);
  const focusAreas = focusAreasBlock ? parseListValue(focusAreasBlock) : [];

  const payload: QuizIntakePayload = {
    company_name: company,
    website_url: website,
    industry,
    explicit_strategic_problem: strategicProblem,
    desired_outcome: desiredOutcome.primary,
    desired_outcome_other: desiredOutcome.other,
    success_definition: successDefinition,
    where_stuck: whereStuck.primary,
    where_stuck_other: whereStuck.other,
    decision_slowdowns: decisionSlowdowns,
    customer_confidence: customerConfidence,
    last_customer_input: lastCustomerInput,
    momentum_drag: biggestDrag.primary,
    momentum_drag_other: biggestDrag.other,
    notes,
    run_initial_public_signal_pass: /^yes$/i.test(runInitialPassRaw),
    submitted_at: submittedAt,
    mojo_snapshot: {
      starting_mode: startingMode,
      primary_friction: primaryFriction,
      customer_truth_signal: customerTruthSignal,
      top_focus_areas: focusAreas,
    },
  };

  const hasMeaningfulContent = [
    payload.company_name,
    payload.website_url,
    payload.explicit_strategic_problem,
    payload.where_stuck,
    payload.desired_outcome,
    payload.mojo_snapshot?.starting_mode,
  ].some((value) => String(value || "").trim());

  if (!hasMeaningfulContent) {
    throw new Error("This doesn’t look like the MojoMap intake email or quiz JSON.");
  }

  return payload;
}

type FileSystemDirectoryHandleLike = {
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandleLike>;
};

type FileSystemFileHandleLike = {
  createWritable: () => Promise<{ write: (data: Blob | BufferSource | string) => Promise<void>; close: () => Promise<void> }>;
};

function safeFileName(name: string) {
  return name.replace(/[/:*?"<>|]/g, "_");
}

function safeDirSegment(value: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/[/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ");
  return normalized || "General";
}

function splitName(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { base: name, ext: "" };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

async function writeBlobUnique(dirHandle: FileSystemDirectoryHandleLike, desiredName: string, blob: Blob) {
  const cleanName = safeFileName(desiredName);
  const { base, ext } = splitName(cleanName);
  let attempt = 0;

  while (attempt < 200) {
    const candidate = attempt === 0 ? cleanName : `${base}-${attempt + 1}${ext}`;
    try {
      await dirHandle.getFileHandle(candidate, { create: false });
      attempt += 1;
      continue;
    } catch {
      const fileHandle = await dirHandle.getFileHandle(candidate, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return candidate;
    }
  }

  throw new Error(`Could not create unique local filename for ${desiredName}`);
}

export default function CompanyFilesPanel({ companyId, companyName, mode = "preview" }: Props) {
  const { refetch: refetchCompanies } = useCompany();
  const { query } = useInputs(companyId);
  const deleteMutation = useDeleteInputFile();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [quizJson, setQuizJson] = useState("");
  const [importingQuiz, setImportingQuiz] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [mirroring, setMirroring] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [analyzingIds, setAnalyzingIds] = useState<ReadonlySet<string>>(new Set());
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set());
  const [refusedById, setRefusedById] = useState<ReadonlyMap<string, FileTooLargeRefusal>>(new Map());
  const busy = analyzingIds.size > 0;
  // P1 (2026-11-16): the Inputs page's analysis state on this page — the same proposals, the same pick,
  // the same sync poll while a run is queued or running (full mode only, as the button is).
  const proposals = useFileProposals(companyId);
  const proposalByFile = useMemo(() => latestProposalByFile(proposals.data), [proposals.data]);
  useProposalSync(proposals.data, mode === "full", proposals.refetch);
  const companyFiles = useCompanyFiles(companyId);
  // An interview transcript is never analysed here — the fence refuses it server-side (Gate B).
  const interviewFileIds = useMemo(
    () => new Set((companyFiles.data ?? []).filter((f) => f.is_interview === true).map((f) => f.id)),
    [companyFiles.data],
  );
  const inputs = useMemo(() => query.data ?? [], [query.data]);
  const quizImportPreview = useMemo(() => {
    const raw = quizJson.trim();
    if (!raw) {
      return {
        payload: null as QuizIntakePayload | null,
        error: "",
      };
    }

    try {
      const parsed = raw.startsWith("{") ? (JSON.parse(raw) as unknown) : parseEmailIntakePayload(raw);
      return {
        payload: raw.startsWith("{") ? sanitizeQuizPayload(parsed) : parsed,
        error: "",
      };
    } catch {
      return {
        payload: null,
        error: "Paste the full quiz JSON or the intake email body.",
      };
    }
  }, [quizJson]);

  const allFiles = useMemo<FileWithContext[]>(() => {
    return inputs.flatMap((input) =>
      input.files.map((file) => ({
        ...file,
        inputId: input.id,
        inputKey: input.input_key,
        inputLabel: input.input_label,
        groupLabel: input.group_label,
        subGroup: input.sub_group,
      })),
    );
  }, [inputs]);

  const availableFilters = useMemo(() => {
    const tags = new Set<string>();
    const groups = new Set<string>();
    allFiles.forEach((file) => {
      visibleFileTags(file.tags, file.uploaded_at).forEach((tag) => tags.add(tag));
      if (file.subGroup) groups.add(file.subGroup);
    });
    return [...tags, ...groups].sort((a, b) => a.localeCompare(b));
  }, [allFiles]);

  const filteredFiles = useMemo(() => {
    if (!activeFilter) return allFiles;
    return allFiles.filter(
      (file) =>
        visibleFileTags(file.tags, file.uploaded_at).includes(activeFilter) ||
        file.subGroup === activeFilter ||
        file.groupLabel === activeFilter,
    );
  }, [activeFilter, allFiles]);

  const visibleFiles = mode === "preview" ? filteredFiles.slice(0, 8) : filteredFiles;
  const visibleFileIdSet = useMemo(() => new Set(visibleFiles.map((file) => file.id)), [visibleFiles]);
  const selectedVisibleCount = useMemo(
    () => selectedFileIds.filter((id) => visibleFileIdSet.has(id)).length,
    [selectedFileIds, visibleFileIdSet],
  );
  const selectedFiles = useMemo(
    () => allFiles.filter((file) => selectedFileIds.includes(file.id)),
    [allFiles, selectedFileIds],
  );

  useEffect(() => {
    setSelectedFileIds((current) => current.filter((id) => allFiles.some((file) => file.id === id)));
  }, [allFiles]);

  function toggleSelected(fileId: string) {
    setSelectedFileIds((current) =>
      current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId],
    );
  }

  function toggleVisibleSelection() {
    const visibleIds = visibleFiles.map((file) => file.id);
    setSelectedFileIds((current) => {
      const allVisibleAlreadySelected = visibleIds.every((id) => current.includes(id));
      if (allVisibleAlreadySelected) {
        return current.filter((id) => !visibleFileIdSet.has(id));
      }
      const merged = new Set([...current, ...visibleIds]);
      return [...merged];
    });
  }
  const groupedFiles = useMemo(() => {
    const grouped = new Map<string, FileWithContext[]>();
    visibleFiles.forEach((file) => {
      const key = `${file.inputId}::${file.inputLabel}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(file);
    });
    return Array.from(grouped.entries());
  }, [visibleFiles]);

  async function handleOpen(filePath: string) {
    const newTab = window.open("about:blank", "_blank");
    if (!newTab) {
      toast.error("Pop-up blocked. Allow pop-ups for this site to open files.");
      return;
    }
    newTab.opener = null;

    try {
      const url = await getFileSignedUrl(filePath);
      newTab.location.href = url;
    } catch {
      newTab.close();
      toast.error("Could not open file");
    }
  }

  async function handleDelete(fileId: string, filePath: string) {
    try {
      await deleteMutation.mutateAsync({ id: fileId, filePath });
      toast.success("File removed");
    } catch {
      toast.error("Could not delete file");
    }
  }

  // Any queued or running proposal for the file, not only the one the badge shows: the badge's pick
  // ranks an older ready analysis above a newer run, and a second start must not slip past that.
  function isAnalysisActive(fileId: string) {
    return (proposals.data ?? []).some(
      (p) => p.file_id === fileId && (p.processing_state === "queued" || p.processing_state === "running"),
    );
  }

  function canAnalyze(file: FileWithContext) {
    return !interviewFileIds.has(file.id) && !isAnalysisActive(file.id);
  }

  // P1 (2026-11-16): "Analyze again" is the Inputs page's call and nothing else — runDifyAnalyzeFile
  // queues a file_proposals row and the server starts it. The old Re-run chain (analyze-file, a needs
  // insert, a local-alignment score rewrite, run-agent-flow research) cannot be started from here.
  async function analyzeFile(file: FileWithContext) {
    setAnalyzingIds((prev) => new Set([...prev, file.id]));
    setFailedIds((prev) => { if (!prev.has(file.id)) return prev; const next = new Set(prev); next.delete(file.id); return next; });
    setRefusedById((prev) => { if (!prev.has(file.id)) return prev; const next = new Map(prev); next.delete(file.id); return next; });
    try {
      await runDifyAnalyzeFile({
        fileId: file.id,
        filePath: file.file_url,
        fileName: file.file_name,
        fileType: file.file_type ?? "",
        companyId,
        sourceType: (file.tags ?? []).includes("Intake") ? "intake" : "uploaded_file",
      });
    } catch (err) {
      if (err instanceof FileTooLargeError) setRefusedById((prev) => new Map(prev).set(file.id, err.refusal));
      else setFailedIds((prev) => new Set([...prev, file.id]));
    } finally {
      setAnalyzingIds((prev) => { const next = new Set(prev); next.delete(file.id); return next; });
      await proposals.refetch();
    }
  }

  async function handleAnalyzeSelected() {
    for (const file of selectedFiles.filter(canAnalyze)) await analyzeFile(file);
    setSelectedFileIds([]);
  }

  async function handleMirrorToLocal() {
    if (allFiles.length === 0) {
      toast.message("No files to mirror yet");
      return;
    }

    const picker = (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandleLike> }).showDirectoryPicker;
    if (typeof picker !== "function") {
      const command = `npm run files:pull-local -- --company "${companyName}" --root "Client_Files/${companyName}" --apply`;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command);
        toast.error("This browser cannot write local folders directly. Pull command copied to clipboard.");
      } else {
        toast.error("This browser cannot write local folders directly. Use the terminal pull command.");
      }
      return;
    }

    setMirroring(true);
    try {
      const pickedRoot = await picker();
      const companyDir = await pickedRoot.getDirectoryHandle(companyName, { create: true });

      let written = 0;
      let failed = 0;

      for (const file of allFiles) {
        try {
          const signedUrl = await getFileSignedUrl(file.file_url);
          const response = await fetch(signedUrl);
          if (!response.ok) throw new Error(`Download failed: ${response.status}`);
          const blob = await response.blob();

          const groupDir = await companyDir.getDirectoryHandle(
            safeDirSegment(file.groupLabel || "General"),
            { create: true },
          );
          const subGroupDir = await groupDir.getDirectoryHandle(
            safeDirSegment(file.subGroup || "General"),
            { create: true },
          );
          const inputDir = await subGroupDir.getDirectoryHandle(
            safeDirSegment(file.inputLabel || file.inputKey || "Input"),
            { create: true },
          );
          await writeBlobUnique(inputDir, file.file_name, blob);
          written += 1;
        } catch (error) {
          console.warn("Mirror failed for file:", file.file_name, error);
          failed += 1;
        }
      }

      if (failed > 0) {
        toast.message(`Mirrored ${written} file${written === 1 ? "" : "s"} (${failed} failed)`);
      } else {
        toast.success(`Mirrored ${written} file${written === 1 ? "" : "s"} locally`);
      }
    } catch (error: unknown) {
      const isAbort = error && typeof error === "object" && "name" in error && (error as { name?: string }).name === "AbortError";
      if (isAbort) {
        toast.message("Mirror canceled");
      } else {
        console.warn("Local mirror failed", error);
        toast.error("Could not mirror files locally");
      }
    } finally {
      setMirroring(false);
    }
  }

  async function ensureQuizIntakeInput(userId: string) {
    const { data: existing, error: existingError } = await supabase
      .from("inputs")
      .select("id")
      .eq("company_id", companyId)
      .eq("input_key", "customer-research")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message || "Could not check for an intake input.");
    if (existing?.id) return String(existing.id);

    const { data, error } = await supabase
      .from("inputs")
      .insert({
        user_id: userId,
        company_id: companyId,
        input_key: "customer-research",
        input_label: "Client Intake Brief",
        group_key: "market_evidence",
        group_label: "Market Evidence",
        sub_group: "Manual Quiz Intake",
        description: "Structured intake imported from the public quiz.",
        why_it_matters: "Captures the client-stated problem framing before deeper research and diagnosis.",
        completeness: 15,
        status: "partial",
        score_impact: 6,
        impact_tier: "med",
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new Error(error?.message || "Failed to create the intake input.");
    }

    const { error: subitemError } = await supabase.from("input_subitems").insert({
      input_id: data.id,
      name: "Review imported quiz intake brief",
      done: false,
      sort_order: 0,
    });
    if (subitemError) {
      throw new Error(subitemError.message || "Failed to create intake checklist item.");
    }

    return String(data.id);
  }

  async function maybeSaveStrategicProblem(userId: string, statement: string) {
    const trimmed = String(statement || "").trim();
    if (!trimmed) return false;

    const { data: existing, error: existingError } = await supabase
      .from("strategy_problem_statements")
      .select("id")
      .eq("company_id", companyId)
      .eq("source", "intake")
      .eq("statement", trimmed)
      .limit(1)
      .maybeSingle();
    if (existingError) {
      throw new Error(existingError.message || "Could not check for an existing strategic problem.");
    }
    if (existing?.id) return false;

    const { error } = await supabase.from("strategy_problem_statements").insert({
      company_id: companyId,
      user_id: userId,
      statement: trimmed,
      source: "intake",
      status: "open",
    });
    if (error) {
      throw new Error(error.message || "Failed to save the strategic problem.");
    }

    return true;
  }

  async function maybeCreateIntakeDraftJobMap(userId: string, payload: QuizIntakePayload) {
    const { data: existingRows, error: existingError } = await supabase
      .from("job_steps")
      .select("id")
      .eq("company_id", companyId)
      .eq("journey_key", "customer")
      .limit(1);
    if (existingError) {
      throw new Error(existingError.message || "Could not check for an existing customer checkpoint map.");
    }
    if ((existingRows ?? []).length > 0) {
      return { createdMap: false, createdNeeds: 0, createdMarketDefinition: false };
    }

    const journeyTitle = deriveJobMapTitle(payload);
    const journeySubtitle = deriveJobMapSubtitle(payload);
    const evidenceBasis = "Intake-derived draft generated from quiz submission before research validation.";
    const gapNote = "Awaiting evidence-backed research and validation.";

    const rows = LOCAL_ODI_STEP_SEED.map((seed, index) => ({
      company_id: companyId,
      user_id: userId,
      // Phase 2 Gate 1: intake-quiz seed maps are operator-submitted content —
      // inadmissible to external prompt framing (council decision 3).
      provenance_type: "operator_authored",
      journey_key: "customer",
      journey_title: journeyTitle,
      journey_subtitle: journeySubtitle,
      step_number: index + 1,
      step_label: seed.label,
      description: seed.description,
      designed: false,
      has_gap: true,
      evidence_status: "unclear",
      evidence_basis: evidenceBasis,
      evidence_confidence: 25,
      gap_note: gapNote,
    }));

    const { error: insertErr } = await supabase.from("job_steps").insert(rows);
    if (insertErr) {
      throw new Error(insertErr.message || "Failed to create the intake-derived checkpoint map.");
    }

    let createdMarketDefinition = false;
    const { data: existingMarketDefinition, error: marketCheckError } = await supabase
      .from("odi_market_definitions")
      .select("id")
      .eq("company_id", companyId)
      .maybeSingle();
    if (marketCheckError) {
      throw new Error(marketCheckError.message || "Could not check Strategic Decision System market definition.");
    }

    if (!existingMarketDefinition?.id) {
      const { error: marketInsertError } = await supabase.from("odi_market_definitions").insert({
        company_id: companyId,
        user_id: userId,
        job_executor: deriveIntakeAudience(payload),
        chooser: deriveChooser(payload),
        jtbd: deriveJtbdStatement(payload),
        source_path: "intake.quiz",
        frameworks_used: ["Quiz Intake", "JTBD", "Strategic Decision System"],
        // OOD-1 register birth-stamp: executor/JTBD are HEURISTIC template
        // synthesis (regex + template sentences) over the intake-quiz corpus —
        // our reading, NOT the client's verbatim words → internal_inferred.
        // (Stamping declared here would falsely render it as "you've told us".)
        market_register: "internal_inferred",
      });
      if (marketInsertError) {
        throw new Error(marketInsertError.message || "Failed to create Strategic Decision System market definition.");
      }
      createdMarketDefinition = true;
    }

    let createdNeeds = 0;
    const { data: existingNeeds, error: existingNeedsError } = await supabase
      .from("odi_needs")
      .select("id")
      .eq("company_id", companyId)
      .eq("journey_key", "customer")
      .limit(1);
    if (existingNeedsError) {
      throw new Error(existingNeedsError.message || "Could not check existing Strategic Decision System needs.");
    }

    if ((existingNeeds ?? []).length === 0) {
      const needsPayload = deriveIntakeNeedCandidates(payload).map((candidate, index) => ({
        company_id: companyId,
        user_id: userId,
        tier: "need",
        desired_outcome: candidate.desired_outcome,
        journey_key: "customer",
        step_number: candidate.step_number,
        step_label: candidate.step_label,
        importance: candidate.importance,
        satisfaction: candidate.satisfaction,
        opportunity_score: Math.round(candidate.importance + Math.max(0, candidate.importance - candidate.satisfaction)),
        service_state: candidate.service_state,
        source_path: "intake.quiz",
        frameworks_used: ["Quiz Intake", "JTBD", "Strategic Decision System"],
        sort_order: index + 1,
      }));

      if (needsPayload.length > 0) {
        const { error: needsInsertError } = await supabase.from("odi_needs").insert(needsPayload);
        if (needsInsertError) {
          throw new Error(needsInsertError.message || "Failed to create intake-derived Strategic Decision System needs.");
        }
        createdNeeds = needsPayload.length;
      }
    }

    return { createdMap: true, createdNeeds, createdMarketDefinition };
  }

  async function handleImportQuizIntake() {
    if (!quizImportPreview.payload) {
      toast.error(quizImportPreview.error || "Paste the full quiz JSON first.");
      return;
    }

    setImportingQuiz(true);
    try {
      const payload = quizImportPreview.payload;
      const { data: authData, error: authError } = await supabase.auth.getUser();
      const userId = authData?.user?.id ?? null;
      if (authError || !userId) {
        throw new Error("You must be signed in to import quiz intake.");
      }

      const website = normalizeWebsite(payload.website_url);
      if (website) {
        const { data: companyRow, error: companyError } = await supabase
          .from("companies")
          .select("website")
          .eq("id", companyId)
          .maybeSingle();
        if (companyError) {
          throw new Error(companyError.message || "Could not check company website.");
        }
        if (!String(companyRow?.website || "").trim()) {
          const { error: updateError } = await supabase.from("companies").update({ website }).eq("id", companyId);
          if (updateError) {
            throw new Error(updateError.message || "Could not save the company website.");
          }
        }
      }

      const inputId = await ensureQuizIntakeInput(userId);
      const safeCompany = safeDirSegment(companyName).toLowerCase().replace(/\s+/g, "-");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `${timestamp}-manual-quiz-intake.md`;
      const filePath = `${userId}/${safeCompany}/customer-research/${inputId}/${fileName}`;
      const markdown = buildQuizIntakeMarkdown(payload, companyName);
      const extractedText = buildQuizExtractedText(payload, companyName);

      const { error: uploadError } = await supabase.storage
        .from("input-files")
        .upload(filePath, new Blob([markdown], { type: "text/markdown; charset=utf-8" }), {
          upsert: true,
          contentType: "text/markdown; charset=utf-8",
        });
      if (uploadError) {
        throw new Error(uploadError.message || "Failed to upload the intake brief.");
      }

      const { error: sidecarError } = await supabase.storage
        .from("input-files")
        .upload(`${filePath}.extracted.txt`, new Blob([extractedText], { type: "text/plain; charset=utf-8" }), {
          upsert: true,
          contentType: "text/plain; charset=utf-8",
        });
      if (sidecarError) {
        throw new Error(sidecarError.message || "Failed to upload the intake text extract.");
      }

      const { error: fileRowError } = await supabase.from("input_files").insert({
        input_id: inputId,
        file_name: fileName,
        file_type: "text/markdown",
        file_path: filePath,
        tags: ["Company", "Strategy", "Intake", "Quiz"],
      });
      if (fileRowError) {
        throw new Error(fileRowError.message || "Failed to register the intake brief.");
      }

      const strategicProblemSaved = await maybeSaveStrategicProblem(userId, payload.explicit_strategic_problem || "");
      const draftJobMap = await maybeCreateIntakeDraftJobMap(userId, payload);
      await query.refetch();
      await refetchCompanies().catch(() => undefined);
      setQuizJson("");
      setImportOpen(false);
      const successParts = ["Quiz intake imported into the map."];
      if (strategicProblemSaved) successParts.push("Strategic problem captured.");
      if (draftJobMap.createdMap) successParts.push("Draft customer checkpoint map created.");
      if (draftJobMap.createdNeeds > 0) successParts.push(`${draftJobMap.createdNeeds} provisional Strategic Decision System needs added.`);
      toast.success(successParts.join(" "));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import quiz intake.");
    } finally {
      setImportingQuiz(false);
    }
  }

  return (
    <section className="rounded-2xl p-5 shadow-sm" style={{ background: c.panel, border: `1px solid ${c.line}` }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-sans text-[20px] font-semibold" style={{ color: c.charcoal }}>
            Uploaded Files
          </div>
          <div className="mt-2 max-w-[720px] font-sans text-[14px] leading-relaxed" style={{ color: c.secondary }}>
            Client-local files uploaded for {companyName}. These stay attached to this company and support internal analysis.
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors"
            style={{ color: c.secondary, borderColor: c.line, background: c.paper }}
            title="Paste quiz JSON and save it as a company-linked intake brief for the map"
          >
            <ClipboardPenLine className="w-3 h-3" />
            Import Quiz Intake
          </button>
          {mode === "full" ? (
            <>
              <button
                type="button"
                onClick={toggleVisibleSelection}
                disabled={visibleFiles.length === 0 || busy}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors disabled:opacity-60"
                style={{ color: c.secondary, borderColor: c.line, background: c.paper }}
              >
                {selectedVisibleCount > 0 && selectedVisibleCount === visibleFiles.length ? "Clear Visible" : "Select Visible"}
              </button>
              <button
                type="button"
                onClick={() => { void handleAnalyzeSelected(); }}
                disabled={selectedFiles.filter(canAnalyze).length === 0 || busy}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors disabled:opacity-60"
                style={{ color: c.charcoal, borderColor: c.line, background: c.paper }}
                data-testid="files-analyze-selected"
              >
                {busy ? WORKSPACE_STRINGS.analyzing : `${WORKSPACE_STRINGS.analyzeAgain} (${selectedFiles.filter(canAnalyze).length})`}
              </button>
            </>
          ) : null}
          {mode === "full" ? (
            <button
              type="button"
              onClick={handleMirrorToLocal}
              disabled={mirroring || allFiles.length === 0}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors disabled:opacity-60"
              style={{ color: c.secondary, borderColor: c.line, background: c.paper }}
              title="Pick a local folder, then mirror files into <chosen-folder>/<company>/<group>/<sub-group>/<input-label>/..."
            >
              <FolderDown className="w-3 h-3" />
              {mirroring ? "Mirroring..." : "Mirror to Local"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors"
            style={{ color: c.charcoal, borderColor: c.line, background: c.paper }}
          >
            <Upload className="w-3 h-3" />
            Upload File
          </button>
          {mode === "preview" ? (
            <Link
              to={`/admin/companies/${companyId}/files`}
              className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors"
              style={{ color: c.secondary, borderColor: c.line, background: c.paper }}
            >
              View Full Page
              <ArrowRight className="w-3 h-3" />
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.secondary, borderColor: c.line, background: c.paper }}>
          {allFiles.length} file{allFiles.length === 1 ? "" : "s"}
        </div>
        <div className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.secondary, borderColor: c.line, background: c.paper }}>
          {inputs.filter((input) => input.files.length > 0).length} inputs with files
        </div>
        {mode === "full" ? (
          <div className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.secondary, borderColor: c.line, background: c.paper }}>
            {selectedFiles.length} selected
          </div>
        ) : null}
      </div>

      {availableFilters.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveFilter(null)}
            className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors"
            style={{
              color: activeFilter ? c.secondary : c.panel,
              borderColor: activeFilter ? c.line : c.charcoal,
              background: activeFilter ? c.paper : c.charcoal,
            }}
          >
            All
          </button>
          {availableFilters.slice(0, mode === "preview" ? 8 : availableFilters.length).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setActiveFilter((current) => (current === filter ? null : filter))}
              className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors"
              style={{
                color: activeFilter === filter ? c.panel : c.secondary,
                borderColor: activeFilter === filter ? c.charcoal : c.line,
                background: activeFilter === filter ? c.charcoal : c.paper,
              }}
            >
              {filter}
            </button>
          ))}
        </div>
      ) : null}

      {mode === "full" && allFiles.length > 0 ? (
        <div className="mt-5">
          <VoiceGatePanel companyId={companyId} />
        </div>
      ) : null}

      {allFiles.length === 0 ? (
        <div className="mt-5 rounded-2xl border p-8 text-center" style={{ borderColor: c.line, background: "#FBFAF7" }}>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: c.paper, border: `1px solid ${c.line}` }}>
            <FileText className="h-5 w-5" style={{ color: c.secondary }} />
          </div>
          <div className="mt-4 font-sans text-[16px] font-semibold" style={{ color: c.charcoal }}>
            No uploaded files yet
          </div>
          <div className="mt-2 font-sans text-[14px]" style={{ color: c.secondary }}>
            Upload files from this page to preserve company-specific source material and internal evidence.
          </div>
        </div>
      ) : groupedFiles.length === 0 ? (
        <div className="mt-5 rounded-2xl border p-6 font-sans text-[14px]" style={{ borderColor: c.line, background: "#FBFAF7", color: c.secondary }}>
          No files match the current filter.
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {groupedFiles.map(([key, files]) => {
            const [, inputLabel] = key.split("::");
            const first = files[0];
            return (
              <div key={key} className="overflow-hidden rounded-2xl border" style={{ borderColor: c.line, background: "#FBFAF7" }}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: c.line, background: "#F6F3EE" }}>
                  <div>
                    <div className="font-sans text-[15px] font-semibold" style={{ color: c.charcoal }}>
                      {inputLabel}
                    </div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                      {first.groupLabel} · {first.subGroup}
                    </div>
                  </div>
                  <div className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.secondary, borderColor: c.line, background: c.paper }}>
                    {files.length} file{files.length === 1 ? "" : "s"}
                  </div>
                </div>

                <div className="divide-y" style={{ borderColor: c.line }}>
                  {files.map((file) => (
                    <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 flex flex-1 items-start gap-2">
                        {mode === "full" ? (
                          <input
                            type="checkbox"
                            checked={selectedFileIds.includes(file.id)}
                            onChange={() => toggleSelected(file.id)}
                            disabled={busy}
                            className="mt-1 h-4 w-4 cursor-pointer rounded border"
                            style={{ borderColor: c.line }}
                            aria-label={`Select ${file.file_name}`}
                          />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => handleOpen(file.file_url)}
                            className="inline-flex max-w-full items-center gap-2 text-left"
                          >
                            <span className="truncate font-sans text-[14px] font-medium" style={{ color: c.charcoal }}>
                              {file.file_name}
                            </span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0" style={{ color: c.secondary }} />
                          </button>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                              {file.file_type || "file"}
                            </span>
                            {visibleFileTags(file.tags, file.uploaded_at).map((tag) => (
                              <span
                                key={`${file.id}-${tag}`}
                                className="rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide"
                                style={{ color: c.warm, borderColor: "#E4C7AF", background: "#FFF8F2" }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          {proposalByFile.get(file.id) || refusedById.has(file.id) ? (
                            <div className="mt-1 flex flex-wrap items-center gap-2" data-testid="files-analysis" data-fr-file-id={file.id}>
                              {proposalByFile.get(file.id) ? <FileAnalysisBadge proposal={proposalByFile.get(file.id)!} testIdPrefix="files" /> : null}
                              {refusedById.has(file.id) ? (
                                <span style={{ ...MONO, fontSize: 9, color: "#8a6d3b" }} data-testid="files-analysis-refused">
                                  {fileTooLargeMessage(refusedById.get(file.id)!)}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {mode === "full" && !interviewFileIds.has(file.id) ? (
                          <button
                            type="button"
                            onClick={() => { void analyzeFile(file); }}
                            disabled={busy || isAnalysisActive(file.id)}
                            className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide disabled:opacity-60"
                            style={{ color: c.secondary, borderColor: c.line, background: c.paper }}
                            data-testid="files-analyze-again"
                          >
                            {analyzingIds.has(file.id) || isAnalysisActive(file.id)
                              ? WORKSPACE_STRINGS.analyzing
                              : failedIds.has(file.id)
                                ? WORKSPACE_STRINGS.analysisFailedRetry
                                : proposalByFile.get(file.id) ? WORKSPACE_STRINGS.analyzeAgain : WORKSPACE_STRINGS.runAnalysis}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleOpen(file.file_url)}
                          className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide"
                          style={{ color: c.secondary, borderColor: c.line, background: c.paper }}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(file.id, file.file_url)}
                          disabled={deleteMutation.isPending || busy}
                          className="inline-flex items-center gap-1 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide disabled:opacity-60"
                          style={{ color: "#915E46", borderColor: "#E6CFC2", background: "#FFF8F5" }}
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {mode === "preview" && allFiles.length > visibleFiles.length ? (
        <div className="mt-4">
          <Link
            to={`/admin/companies/${companyId}/files`}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide"
            style={{ color: c.secondary }}
          >
            See all {allFiles.length} files
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      ) : null}

      <FileUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        companyId={companyId}
        companyName={companyName}
      />
      <Sheet open={importOpen} onOpenChange={setImportOpen}>
        <SheetContent side="right" className="w-full max-w-[720px] overflow-y-auto border-[#1d2333] bg-[#0f1018] text-white sm:max-w-[720px]">
          <SheetHeader>
            <SheetTitle className="text-[22px] font-light tracking-[-0.02em] text-white">
              Import Quiz Intake
            </SheetTitle>
            <SheetDescription className="max-w-[560px] text-[14px] leading-relaxed text-white/68">
              Paste either the full quiz submission JSON or the intake email body and we’ll save it as a company-linked
              intake brief for the map. If the strategic problem is included, we’ll capture that too.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#ffbf38]">
                Paste Quiz JSON Or Intake Email
              </div>
              <textarea
                value={quizJson}
                onChange={(event) => setQuizJson(event.target.value)}
                rows={14}
                placeholder={'{"company_name":"...", "website_url":"...", "explicit_strategic_problem":"..."}\n\nor paste the email body that starts with:\nNew MojoMap Pre-Diagnosis — ...'}
                className="mt-3 w-full resize-y rounded-[16px] border border-white/10 bg-black/15 px-4 py-3 font-mono text-[12px] leading-6 text-white outline-none placeholder:text-white/30"
              />
              {quizImportPreview.error ? (
                <div className="mt-3 text-[13px] text-[#ff9f73]">{quizImportPreview.error}</div>
              ) : null}
            </div>

            {quizImportPreview.payload ? (
              <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#ffbf38]">
                  Import Preview
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/42">Company</div>
                    <div className="mt-1 text-[16px] text-white">{companyName}</div>
                    {quizImportPreview.payload.company_name &&
                    quizImportPreview.payload.company_name.trim().toLowerCase() !== companyName.trim().toLowerCase() ? (
                      <div className="mt-2 text-[13px] leading-6 text-[#ffcd73]">
                        Quiz says “{quizImportPreview.payload.company_name}”. This import will save into {companyName}.
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/42">Website</div>
                    <div className="mt-1 text-[16px] break-all text-white">
                      {presentText(normalizeWebsite(quizImportPreview.payload.website_url))}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/42">Strategic Problem</div>
                    <div className="mt-1 text-[16px] leading-7 text-white/86">
                      {presentText(quizImportPreview.payload.explicit_strategic_problem)}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/42">Desired Outcome</div>
                    <div className="mt-1 text-[16px] leading-7 text-white/86">
                      {presentText(quizImportPreview.payload.desired_outcome)}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/42">Decision Slowdowns</div>
                    <div className="mt-1 text-[15px] leading-7 text-white/74">
                      {quizImportPreview.payload.decision_slowdowns?.length
                        ? quizImportPreview.payload.decision_slowdowns.join(", ")
                        : "Not provided"}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/42">Top Focus Areas</div>
                    <div className="mt-1 text-[15px] leading-7 text-white/74">
                      {quizImportPreview.payload.mojo_snapshot?.top_focus_areas?.length
                        ? quizImportPreview.payload.mojo_snapshot.top_focus_areas.join(", ")
                        : "Not provided"}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleImportQuizIntake}
                disabled={!quizImportPreview.payload || importingQuiz}
                className="rounded-full border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors disabled:opacity-50"
                style={{ color: "#0f1018", borderColor: "#ffbf38", background: "#ffbf38" }}
              >
                {importingQuiz ? "Importing..." : "Save to Map Inputs"}
              </button>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="rounded-full border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "rgba(255,255,255,0.72)", borderColor: "rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.02)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
