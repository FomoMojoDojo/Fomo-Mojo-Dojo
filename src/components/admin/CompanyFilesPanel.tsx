import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, Upload, ExternalLink, Trash2, FolderDown } from "lucide-react";
import FileUploadDialog from "@/components/FileUploadDialog";
import { getFileSignedUrl, useDeleteInputFile, useInputs } from "@/hooks/useInputs";
import { useCompany } from "@/hooks/useCompany";
import { toast } from "sonner";
import type { InputFile } from "@/lib/types";
import { isInternalFileTag, sanitizeUserEditableTags, visibleFileTags } from "@/lib/fileTags";
import { supabase } from "@/integrations/supabase/client";

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

type AnalyzeInputArea = {
  id: string;
  input_key: string;
  group_key: string;
  input_label: string;
  sub_group: string;
};

type AnalyzeFileResult = {
  suggested_tags?: string[];
  suggested_input_id?: string | null;
  odi_needs_candidates?: Array<{
    desired_outcome?: string;
    importance?: number;
    satisfaction?: number;
  }>;
  error?: string;
};

const INPUT_KEYS_BY_AREA: Record<"positioning" | "strategy" | "market" | "odi", string[]> = {
  positioning: ["comp-alt", "unique-attr", "val-prop", "target-aud", "market-cat", "brand-narrative"],
  strategy: ["program-model", "needs-assessment", "outcome-data", "referral-map", "channel-strat"],
  market: ["market-cat", "target-aud", "comp-alt", "needs-assessment", "brand-narrative"],
  odi: ["outcome-data", "needs-assessment", "program-model"],
};

function areasForInputKeys(inputKeys: string[]) {
  const normalized = new Set(inputKeys.map((key) => String(key || "").trim()));
  const areas: Array<"positioning" | "strategy" | "market" | "odi"> = [];
  for (const [area, keys] of Object.entries(INPUT_KEYS_BY_AREA) as Array<[
    "positioning" | "strategy" | "market" | "odi",
    string[],
  ]>) {
    if (keys.some((key) => normalized.has(key))) areas.push(area);
  }
  return areas;
}

type LocalAlignmentInvokeResult = {
  error?: string;
  applied_score_update?: {
    applied?: boolean;
    previous_mojo?: number | null;
    updated_mojo?: number | null;
    reason?: string;
  };
};

type ResearchInvokeResult = {
  error?: string;
  message?: string;
  status?: string;
  stage?: string;
  started_at?: string;
  expires_at?: string;
  odi_needs_inserted?: number;
  odi_market_definitions_inserted?: number;
  research_result?: {
    error?: string;
    message?: string;
    status?: string;
    started_at?: string;
    expires_at?: string;
    odi_needs_inserted?: number;
    odi_market_definitions_inserted?: number;
  };
};

type FileSystemDirectoryHandleLike = {
  getDirectoryHandle: (name: string, options?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandleLike>;
};

async function describeInvokeError(error: unknown) {
  const maybeContext = (() => {
    if (!error || typeof error !== "object") return null;
    const candidate = (error as { context?: { text?: () => Promise<string> } }).context;
    if (!candidate || typeof candidate.text !== "function") return null;
    return candidate;
  })();

  if (maybeContext) {
    const payloadText = await maybeContext.text().catch(() => "");
    if (!payloadText) return error instanceof Error ? error.message : String(error);
    try {
      const payload = JSON.parse(payloadText) as { error?: string; message?: string };
      return String(payload.message || payload.error || payloadText);
    } catch {
      return payloadText;
    }
  }

  return error instanceof Error ? error.message : String(error);
}

class InvokeTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvokeTimeoutError";
  }
}

async function invokeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new InvokeTimeoutError(`Request timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function formatLockTime(value?: string) {
  if (!value) return "soon";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

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

async function persistDerivedNeedsFromExistingFile(params: {
  companyId: string;
  userId: string | null;
  sourcePath: string;
  inputLabel: string;
  candidates: Array<{
    desired_outcome?: string;
    importance?: number;
    satisfaction?: number;
  }>;
}) {
  const { companyId, userId, sourcePath, inputLabel, candidates } = params;
  if (!userId || candidates.length === 0) return 0;

  const { data: existingRows, error: existingError } = await supabase
    .from("odi_needs")
    .select("desired_outcome")
    .eq("company_id", companyId)
    .limit(600);
  if (existingError) return 0;

  const existing = new Set(
    ((existingRows ?? []) as Array<{ desired_outcome?: string | null }>)
      .map((row) => String(row.desired_outcome || "").trim().toLowerCase())
      .filter(Boolean),
  );

  const toInsert = candidates
    .map((candidate) => {
      const desiredOutcome = String(candidate.desired_outcome || "").trim();
      if (!desiredOutcome) return null;
      const importance = Number.isFinite(Number(candidate.importance))
        ? Math.max(1, Math.min(10, Math.round(Number(candidate.importance))))
        : 7;
      const satisfaction = Number.isFinite(Number(candidate.satisfaction))
        ? Math.max(1, Math.min(10, Math.round(Number(candidate.satisfaction))))
        : 4;
      return {
        desired_outcome: desiredOutcome,
        importance,
        satisfaction,
      };
    })
    .filter((candidate): candidate is { desired_outcome: string; importance: number; satisfaction: number } => Boolean(candidate))
    .filter((candidate) => {
      const key = candidate.desired_outcome.toLowerCase();
      if (!key || existing.has(key)) return false;
      existing.add(key);
      return true;
    })
    .slice(0, 6)
    .map((candidate) => {
      const opportunityScore = Number(
        (candidate.importance + Math.max(0, candidate.importance - candidate.satisfaction)).toFixed(1),
      );
      return {
        company_id: companyId,
        user_id: userId,
        desired_outcome: candidate.desired_outcome,
        importance: candidate.importance,
        satisfaction: candidate.satisfaction,
        opportunity_score: opportunityScore,
        journey_key: "customer",
        step_number: 0,
        step_label: `Reanalyzed existing file (${inputLabel || "Unmapped input"})`,
        tier: "company",
        service_state: "monitor",
        source_path: sourcePath,
        frameworks_used: ["JTBD", "ODI", "Existing File Reanalysis"],
      };
    });

  if (toInsert.length === 0) return 0;
  const { error: insertError } = await supabase.from("odi_needs").insert(toInsert);
  if (insertError) return 0;
  return toInsert.length;
}

export default function CompanyFilesPanel({ companyId, companyName, mode = "preview" }: Props) {
  const { refetch: refetchCompanies } = useCompany();
  const { query } = useInputs(companyId);
  const deleteMutation = useDeleteInputFile();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [mirroring, setMirroring] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [reprocessing, setReprocessing] = useState(false);
  const inputs = useMemo(() => query.data ?? [], [query.data]);

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

  async function runReanalysisFromExistingFiles(filesToRun: FileWithContext[]) {
    if (filesToRun.length === 0) {
      toast.message("Select at least one file to re-run.");
      return;
    }

    setReprocessing(true);
    try {
      const { data: authRes } = await supabase.auth.getUser();
      const userId = authRes?.user?.id ?? null;
      const inputById = new Map(inputs.map((input) => [input.id, input]));
      const inputAreas: AnalyzeInputArea[] = inputs.map((input) => ({
        id: input.id,
        input_key: input.input_key,
        group_key: input.group_key,
        input_label: input.input_label,
        sub_group: input.sub_group,
      }));

      let succeeded = 0;
      let failed = 0;
      let insertedNeeds = 0;
      let alignmentSummary = "";
      const alignedInputKeys = new Set<string>();

      for (const file of filesToRun) {
        try {
          const { data, error } = await supabase.functions.invoke("analyze-file", {
            body: {
              fileName: file.file_name,
              filePath: file.file_url,
              fileType: file.file_type || "",
              extractionSource: "existing_file_rerun",
              inputAreas,
            },
          });
          if (error) throw error;

          const analysis = (data ?? {}) as AnalyzeFileResult;
          if (analysis.error) throw new Error(analysis.error);

          const suggestedInputId = String(analysis.suggested_input_id || "").trim();
          const targetInputId =
            suggestedInputId && inputById.has(suggestedInputId) ? suggestedInputId : file.inputId;
          const targetInput = inputById.get(targetInputId);
          const targetInputKey = String(targetInput?.input_key || file.inputKey || "").trim();
          if (targetInputKey) alignedInputKeys.add(targetInputKey);

          const crossAreaInputIds = Array.isArray((analysis as { cross_area_input_ids?: unknown[] }).cross_area_input_ids)
            ? (analysis as { cross_area_input_ids?: unknown[] }).cross_area_input_ids
            : [];
          for (const inputId of crossAreaInputIds) {
            const mapped = inputById.get(String(inputId || "").trim());
            const mappedKey = String(mapped?.input_key || "").trim();
            if (mappedKey) alignedInputKeys.add(mappedKey);
          }

          const preservedInternalTags = (file.tags ?? []).filter((tag) => isInternalFileTag(tag));
          const suggestedUserTags = Array.isArray(analysis.suggested_tags)
            ? analysis.suggested_tags.map((tag) => String(tag || "").trim()).filter(Boolean)
            : [];
          const fallbackUserTags = sanitizeUserEditableTags(file.tags ?? []);
          const userTags = suggestedUserTags.length > 0 ? [...new Set(suggestedUserTags)] : fallbackUserTags;
          const finalTags = [...new Set([...userTags, ...preservedInternalTags])];

          const { error: updateErr } = await supabase
            .from("input_files")
            .update({ input_id: targetInputId, tags: finalTags })
            .eq("id", file.id);
          if (updateErr) throw updateErr;

          insertedNeeds += await persistDerivedNeedsFromExistingFile({
            companyId,
            userId,
            sourcePath: file.file_url,
            inputLabel: targetInput?.input_label || file.inputLabel,
            candidates: Array.isArray(analysis.odi_needs_candidates) ? analysis.odi_needs_candidates : [],
          });

          succeeded += 1;
        } catch (error) {
          console.warn("Reanalysis failed for file", file.file_name, error);
          failed += 1;
        }
      }

      if (succeeded > 0) {
        await query.refetch();
        const rerunAreas = areasForInputKeys([...alignedInputKeys]);
        const areasToRun = rerunAreas.length > 0 ? rerunAreas : (["positioning", "market"] as Array<"positioning" | "market">);
        const { error: localAlignmentErr, data: localAlignmentData } = await supabase.functions.invoke("local-alignment", {
          body: {
            company_id: companyId,
            areas: areasToRun,
            trigger: "existing_file_rerun",
            apply_score_update: true,
            ignore_public_baseline: true,
          },
        });
        if (localAlignmentErr || (localAlignmentData as LocalAlignmentInvokeResult | null)?.error) {
          toast.error("Files re-ran, but local comparison refresh failed.");
        } else {
          const alignmentResult = (localAlignmentData ?? {}) as LocalAlignmentInvokeResult;
          const applied = alignmentResult.applied_score_update?.applied === true;
          const previous = alignmentResult.applied_score_update?.previous_mojo;
          const updated = alignmentResult.applied_score_update?.updated_mojo;
          if (applied && Number.isFinite(Number(previous)) && Number.isFinite(Number(updated))) {
            alignmentSummary = ` Mojo score ${Number(previous)}→${Number(updated)} (${areasToRun.join(", ")}).`;
          } else {
            alignmentSummary = ` Local comparison completed (${areasToRun.join(", ")}).`;
          }
          await refetchCompanies().catch(() => undefined);
        }

        try {
          const { data: activeLock } = await supabase
            .from("company_run_locks")
            .select("operation, started_at, expires_at")
            .eq("company_id", companyId)
            .maybeSingle();

          if (activeLock?.operation === "research") {
            alignmentSummary += ` Artifact regeneration already running (started ${formatLockTime(activeLock.started_at)}; lock expires ${formatLockTime(activeLock.expires_at)}).`;
          } else {
          const { data: companyRow, error: companyFetchErr } = await supabase
            .from("companies")
            .select("website")
            .eq("id", companyId)
            .maybeSingle();
          if (companyFetchErr) throw companyFetchErr;

          const { error: researchErr, data: researchData } = await invokeWithTimeout(
            () =>
              supabase.functions.invoke("run-agent-flow", {
                body: {
                  company_id: companyId,
                  company_name: companyName,
                  website: String((companyRow as { website?: unknown } | null)?.website || ""),
                  mode: "uploaded_only",
                  include_public_collection: false,
                  include_local_alignment: false,
                  apply_score_update: false,
                  trigger: "existing_file_rerun",
                  review_mode: "advisory",
                  allow_review_block_save: true,
                },
              }),
            95_000,
          );

          const researchResult =
            researchData && typeof researchData === "object"
              ? (researchData as ResearchInvokeResult)
              : null;
          const nestedResearch =
            researchResult?.research_result && typeof researchResult.research_result === "object"
              ? researchResult.research_result
              : null;
          const effectiveResearch = nestedResearch ?? researchResult;
          const companyLocked =
            effectiveResearch?.status === "company_locked" ||
            /already running|company_locked/i.test(String(effectiveResearch?.message || "")) ||
            /already running|company_locked/i.test(String(effectiveResearch?.error || ""));

          if (companyLocked) {
            alignmentSummary += ` Artifact regeneration already running (started ${formatLockTime(effectiveResearch?.started_at)}; lock expires ${formatLockTime(effectiveResearch?.expires_at)}).`;
          } else if (researchErr || effectiveResearch?.error) {
            const message = researchErr
              ? await describeInvokeError(researchErr)
              : String(effectiveResearch?.message || effectiveResearch?.error || "Research regeneration failed.");
            alignmentSummary += ` Artifact regeneration failed (${message}).`;
          } else {
            const researchNeeds = Number(effectiveResearch?.odi_needs_inserted ?? 0);
            const researchMarketDefs = Number(effectiveResearch?.odi_market_definitions_inserted ?? 0);
            alignmentSummary += " Regenerated map, opportunities, routes, ODI context, positioning, and strategy.";
            alignmentSummary += ` ODI: ${researchNeeds} need${researchNeeds === 1 ? "" : "s"}, ${researchMarketDefs} market context row${researchMarketDefs === 1 ? "" : "s"}.`;
            await query.refetch();
            await refetchCompanies().catch(() => undefined);
          }
          }
        } catch (error) {
          if (error instanceof InvokeTimeoutError) {
            const { data: lockAfterTimeout } = await supabase
              .from("company_run_locks")
              .select("operation, started_at, expires_at")
              .eq("company_id", companyId)
              .maybeSingle();
            if (lockAfterTimeout?.operation === "research") {
              alignmentSummary += ` Artifact regeneration is still running (started ${formatLockTime(lockAfterTimeout.started_at)}; lock expires ${formatLockTime(lockAfterTimeout.expires_at)}).`;
            } else {
              alignmentSummary += ` Artifact regeneration timed out (${error.message}).`;
            }
          } else {
            const message = await describeInvokeError(error);
            alignmentSummary += ` Artifact regeneration failed (${message}).`;
          }
        }
      }

      if (failed > 0) {
        toast.message(
          `Re-ran ${succeeded} file${succeeded === 1 ? "" : "s"} (${failed} failed). Added ${insertedNeeds} ODI need${insertedNeeds === 1 ? "" : "s"}.${alignmentSummary}`,
        );
      } else {
        toast.success(
          `Re-ran ${succeeded} file${succeeded === 1 ? "" : "s"} from existing uploads. Added ${insertedNeeds} ODI need${insertedNeeds === 1 ? "" : "s"}.${alignmentSummary}`,
        );
      }

      const completedIds = new Set(filesToRun.map((file) => file.id));
      setSelectedFileIds((current) => current.filter((id) => !completedIds.has(id)));
    } finally {
      setReprocessing(false);
    }
  }

  async function handleRerunSelected() {
    await runReanalysisFromExistingFiles(selectedFiles);
  }

  async function handleRerunSingle(file: FileWithContext) {
    await runReanalysisFromExistingFiles([file]);
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
          {mode === "full" ? (
            <>
              <button
                type="button"
                onClick={toggleVisibleSelection}
                disabled={visibleFiles.length === 0 || reprocessing}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors disabled:opacity-60"
                style={{ color: c.secondary, borderColor: c.line, background: c.paper }}
              >
                {selectedVisibleCount > 0 && selectedVisibleCount === visibleFiles.length ? "Clear Visible" : "Select Visible"}
              </button>
              <button
                type="button"
                onClick={handleRerunSelected}
                disabled={selectedFiles.length === 0 || reprocessing}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors disabled:opacity-60"
                style={{ color: c.charcoal, borderColor: c.line, background: c.paper }}
                title="Re-run analysis from selected existing files without uploading again"
              >
                {reprocessing ? "Re-running..." : `Re-run Selected (${selectedFiles.length})`}
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
                            disabled={reprocessing}
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
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {mode === "full" ? (
                          <button
                            type="button"
                            onClick={() => handleRerunSingle(file)}
                            disabled={reprocessing}
                            className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide disabled:opacity-60"
                            style={{ color: c.secondary, borderColor: c.line, background: c.paper }}
                            title="Re-run analysis from this stored file without uploading again"
                          >
                            {reprocessing ? "Re-running..." : "Re-run"}
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
                          disabled={deleteMutation.isPending || reprocessing}
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
    </section>
  );
}
