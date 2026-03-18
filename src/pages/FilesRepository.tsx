import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle, Clock, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import TopNav from "@/components/layout/TopNav";
import FileUploadDialog from "@/components/FileUploadDialog";
import AiBoundaryNote from "@/components/AiBoundaryNote";
import { useCompany } from "@/hooks/useCompany";
import { useAuth } from "@/hooks/useAuth";
import { useDeepDiveAnalyses, useGenerateDeepDive } from "@/hooks/useDeepDive";
import { FILE_CATEGORIES } from "@/lib/fileCategories";
import { getFileSignedUrl, useDeleteInputFile, useInputs, useUpdateFileTags } from "@/hooks/useInputs";
import type { InputFile } from "@/lib/types";

interface FileWithContext extends InputFile {
  inputKey: string;
  inputLabel: string;
  groupLabel: string;
  subGroup: string;
  groupKey: string;
}

type AwaitingAnalysisProgress = {
  running: boolean;
  total: number;
  completed: number;
  currentArea: string | null;
  succeeded: string[];
  failed: string[];
};

type FileAnalysisState = "analyzed" | "awaiting";

type FileAreaStatus = {
  state: FileAnalysisState;
  areaKey: AreaKey;
};

type AreaKey = "positioning" | "strategy" | "product" | "marketing" | "sales" | "cx";

const c = {
  bg: "#faf7f6",
  panel: "#ffffff",
  line: "#dde6d1",
  charcoal: "#233c4b",
  secondary: "#46606d",
  muted: "#6e847f",
  soft: "#f6f3ee",
};

const AREA_ANALYSIS_TIMEOUT_MS = 180_000;

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function timestampMs(value?: string) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const AREA_BY_INPUT_KEY: Record<string, AreaKey> = {
  "comp-alt": "positioning",
  "unique-attr": "positioning",
  "val-prop": "positioning",
  "target-aud": "positioning",
  "market-cat": "positioning",
  "outcome-data": "strategy",
  "program-model": "product",
  "brand-narrative": "marketing",
  "channel-strat": "marketing",
  "referral-map": "sales",
  "donor-retention": "sales",
  "grant-pipeline": "sales",
  "needs-assessment": "cx",
  "family-satisfaction": "cx",
};

const AREA_BY_GROUP_KEY: Record<string, AreaKey> = {
  foundation: "strategy",
  execution: "product",
  market_evidence: "cx",
};

function resolveAreaFromSubGroup(subGroup: string): AreaKey | null {
  const normalized = normalizeText(subGroup);
  if (!normalized) return null;

  if (
    normalized.includes("positioning") ||
    normalized.includes("competitive") ||
    normalized.includes("mental health providers") ||
    normalized.includes("providers")
  ) {
    return "positioning";
  }
  if (normalized.includes("strategy")) return "strategy";
  if (normalized.includes("service delivery") || normalized.includes("program model") || normalized.includes("program")) {
    return "product";
  }
  if (normalized.includes("awareness") || normalized.includes("marketing")) return "marketing";
  if (normalized.includes("referral") || normalized.includes("fundraising") || normalized.includes("sales")) {
    return "sales";
  }
  if (normalized.includes("family experience") || normalized.includes("family") || normalized.includes("cx")) {
    return "cx";
  }
  return null;
}

function resolveAreaForFile(file: Pick<FileWithContext, "inputKey" | "subGroup" | "groupKey">): AreaKey {
  const normalizedInputKey = normalizeText(String(file.inputKey || ""));
  const byInputKey = AREA_BY_INPUT_KEY[normalizedInputKey];
  if (byInputKey) return byInputKey;
  const bySubGroup = resolveAreaFromSubGroup(file.subGroup);
  if (bySubGroup) return bySubGroup;
  const normalizedGroupKey = normalizeText(String(file.groupKey || ""));
  const byGroupKey = AREA_BY_GROUP_KEY[normalizedGroupKey];
  if (byGroupKey) return byGroupKey;
  return "strategy";
}

function TagEditor({ file, onClose }: { file: FileWithContext; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>(file.tags ?? []);
  const updateTags = useUpdateFileTags();

  function toggle(tag: string) {
    setSelected((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function save() {
    try {
      await updateTags.mutateAsync({ id: file.id, tags: selected });
      toast.success("Tags updated");
      onClose();
    } catch {
      toast.error("Failed to update tags");
    }
  }

  return (
    <div className="mt-2 rounded-xl border p-3" style={{ background: c.panel, borderColor: c.line }} onClick={(event) => event.stopPropagation()}>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
        Select tags
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILE_CATEGORIES.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className="cursor-pointer rounded-full border px-2.5 py-[3px] font-mono text-[10px] transition-colors"
            style={
              selected.includes(tag)
                ? { background: c.charcoal, color: c.panel, borderColor: c.charcoal }
                : { borderColor: c.line, color: c.secondary, background: c.panel }
            }
          >
            {tag}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={updateTags.isPending}
          className="cursor-pointer rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors disabled:opacity-50"
          style={{ background: c.charcoal, color: c.panel, border: `1px solid ${c.charcoal}` }}
        >
          {updateTags.isPending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors"
          style={{ color: c.secondary }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function FilesRepository() {
  const { query } = useInputs();
  const inputs = query.data ?? [];
  const deleteMutation = useDeleteInputFile();
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { data: dbAnalyses } = useDeepDiveAnalyses();
  const generateDeepDive = useGenerateDeepDive();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<AwaitingAnalysisProgress | null>(null);

  const areaLabelByKey: Record<string, string> = {
    positioning: "Positioning",
    strategy: "Strategy",
    product: "Service Delivery",
    marketing: "Awareness",
    sales: "Referral/Fundraising",
    cx: "Family Experience",
  };

  const analyzedAreas = useMemo(() => {
    const rows = dbAnalyses ?? {};
    return new Set(
      Object.entries(rows)
        .filter(([, analysis]) => !!analysis)
        .map(([areaKey]) => areaKey),
    );
  }, [dbAnalyses]);

  const allFiles = useMemo<FileWithContext[]>(
    () =>
      inputs.flatMap((input) =>
        input.files.map((file) => ({
          ...file,
          inputKey: input.input_key,
          inputLabel: input.input_label,
          groupLabel: input.group_label,
          subGroup: input.sub_group,
          groupKey: input.group_key,
        })),
      ),
    [inputs],
  );

  const usedTags = useMemo(() => {
    const tagSet = new Set<string>();
    allFiles.forEach((file) => file.tags.forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [allFiles]);

  const filtered = useMemo(() => {
    if (!activeFilter) return allFiles;
    return allFiles.filter(
      (file) =>
        file.tags.includes(activeFilter) ||
        file.groupLabel === activeFilter ||
        file.subGroup === activeFilter,
    );
  }, [activeFilter, allFiles]);

  const fileAreaStatusById = useMemo(() => {
    const statuses = new Map<string, FileAreaStatus>();

    for (const file of allFiles) {
      const areaKey = resolveAreaForFile(file);

      const areaAnalysis = dbAnalyses?.[areaKey];
      if (!areaAnalysis) {
        statuses.set(file.id, { state: "awaiting", areaKey });
        continue;
      }

      const analysisAt = timestampMs(areaAnalysis.generated_at ?? areaAnalysis.updated_at ?? undefined);
      const fileAt = timestampMs(file.uploaded_at);
      if (analysisAt != null && fileAt != null && fileAt > analysisAt) {
        statuses.set(file.id, { state: "awaiting", areaKey });
        continue;
      }

      statuses.set(file.id, { state: "analyzed", areaKey });
    }

    return statuses;
  }, [allFiles, dbAnalyses]);

  const pendingAreaKeys = useMemo(() => {
    const pending = new Set<string>();
    for (const file of allFiles) {
      const status = fileAreaStatusById.get(file.id);
      if (!status || status.state !== "awaiting" || !status.areaKey) continue;
      pending.add(status.areaKey);
    }
    return [...pending];
  }, [allFiles, fileAreaStatusById]);

  const pendingFileCount = useMemo(
    () =>
      allFiles.filter((file) => fileAreaStatusById.get(file.id)?.state === "awaiting").length,
    [allFiles, fileAreaStatusById],
  );

  const isAwaitingAnalysisRunning = analysisProgress?.running ?? false;
  const hasAwaitingAreas = pendingAreaKeys.length > 0;
  const canAnalyzeAwaiting = !!user && hasAwaitingAreas;
  const progressPercent =
    analysisProgress && analysisProgress.total > 0
      ? Math.round((analysisProgress.completed / analysisProgress.total) * 100)
      : 0;

  async function handleAnalyzeAwaiting() {
    if (!user) {
      toast.error("Sign in to run local analysis");
      return;
    }
    if (pendingAreaKeys.length === 0) {
      toast.message("No files are awaiting analysis");
      return;
    }

    const runAreas = [...pendingAreaKeys];
    const succeededAreas: string[] = [];
    const failedAreas: string[] = [];

    setAnalysisProgress({
      running: true,
      total: runAreas.length,
      completed: 0,
      currentArea: null,
      succeeded: [],
      failed: [],
    });

    for (const areaKey of runAreas) {
      setAnalysisProgress((current) =>
        current
          ? { ...current, currentArea: areaKey }
          : current,
      );

      try {
        await Promise.race([
          generateDeepDive.mutateAsync(areaKey),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("analysis_timeout")), AREA_ANALYSIS_TIMEOUT_MS);
          }),
        ]);
        succeededAreas.push(areaKey);
      } catch {
        failedAreas.push(areaKey);
      } finally {
        setAnalysisProgress((current) =>
          current
            ? {
                ...current,
                completed: current.completed + 1,
                succeeded: [...succeededAreas],
                failed: [...failedAreas],
              }
            : current,
        );
      }
    }

    setAnalysisProgress({
      running: false,
      total: runAreas.length,
      completed: runAreas.length,
      currentArea: null,
      succeeded: [...succeededAreas],
      failed: [...failedAreas],
    });

    const finalSucceeded = succeededAreas.length;
    const finalFailed = failedAreas.length;

    if (finalFailed > 0) {
      toast.message(`Analyzed ${finalSucceeded} area${finalSucceeded === 1 ? "" : "s"} (${finalFailed} failed)`);
    } else {
      toast.success(`Analyzed ${finalSucceeded} area${finalSucceeded === 1 ? "" : "s"} from awaiting files`);
    }
  }

  async function handleOpen(filePath: string) {
    const newTab = window.open("about:blank", "_blank");
    if (!newTab) {
      toast.error("Pop-up blocked. Allow pop-ups for this site to open files.");
      return;
    }
    newTab.opener = null;

    try {
      const signedUrl = await getFileSignedUrl(filePath);
      newTab.location.href = signedUrl;
    } catch {
      newTab.close();
      toast.error("Could not open file");
    }
  }

  async function handleDelete(id: string, filePath: string) {
    try {
      await deleteMutation.mutateAsync({ id, filePath });
      toast.success("File removed");
    } catch {
      toast.error("Could not delete file");
    }
  }

  return (
    <div className="min-h-screen" style={{ background: c.bg }}>
      <TopNav />
      <div className="mx-auto max-w-6xl px-6 pb-12 pt-7">
        <section className="rounded-2xl border p-5 shadow-sm" style={{ background: c.panel, borderColor: c.line }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-sans text-[28px] font-semibold tracking-tight" style={{ color: c.charcoal }}>
                File Repository
              </h1>
              <p className="mt-2 max-w-[760px] font-sans text-[14px] leading-relaxed" style={{ color: c.secondary }}>
                {activeCompany?.name
                  ? `Uploaded files for ${activeCompany.name}, mapped to input areas with optional source tags.`
                  : "Uploaded files mapped to input areas with optional source tags."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="rounded-full border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.1em]"
              style={{ background: c.charcoal, borderColor: c.charcoal, color: c.panel }}
            >
              + Upload File
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.secondary, borderColor: c.line, background: c.panel }}>
              {allFiles.length} file{allFiles.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.secondary, borderColor: c.line, background: c.panel }}>
              {usedTags.length} tag{usedTags.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.secondary, borderColor: c.line, background: c.panel }}>
              {analyzedAreas.size} deep-dive area{analyzedAreas.size === 1 ? "" : "s"} analyzed
            </span>
          </div>
        </section>

        <div className="mt-6">
          <AiBoundaryNote
            label="Client-Local Analysis"
            tone="internal"
            detail="Files stay scoped to the selected client. File suggestions and deep-dive analysis use the local internal AI path, separate from the public web research flow."
          />
        </div>

        <section className="mt-6 rounded-2xl border p-4" style={{ background: c.panel, borderColor: c.line }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-sans text-[13px] leading-relaxed" style={{ color: c.secondary }}>
                “Awaiting analysis” means the file uploaded successfully, but local deep-dive analysis has not been run for that area yet.
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                {pendingFileCount} file{pendingFileCount === 1 ? "" : "s"} awaiting across {pendingAreaKeys.length} area{pendingAreaKeys.length === 1 ? "" : "s"}
              </p>
              {!user ? (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: "#915e46" }}>
                  Sign in required to run local analysis.
                </p>
              ) : null}
              {user && !hasAwaitingAreas ? (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                  No pending analysis areas right now.
                </p>
              ) : null}
              {isAwaitingAnalysisRunning ? (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: "#915e46" }}>
                  If an area stalls, it auto-times out after 3 minutes.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAnalyzeAwaiting}
                disabled={isAwaitingAnalysisRunning || !canAnalyzeAwaiting}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  color: canAnalyzeAwaiting ? c.panel : c.secondary,
                  borderColor: canAnalyzeAwaiting ? c.charcoal : c.line,
                  background: canAnalyzeAwaiting ? c.charcoal : c.panel,
                }}
              >
                {isAwaitingAnalysisRunning
                  ? `Analyzing ${analysisProgress?.completed ?? 0}/${analysisProgress?.total ?? 0}...`
                  : canAnalyzeAwaiting
                    ? "Analyze Awaiting Files"
                    : !user
                      ? "Sign In to Analyze"
                      : "No Awaiting Files"}
              </button>
              <Link
                to="/admin/companies"
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{ color: c.secondary, borderColor: c.line, background: c.panel }}
              >
                Open Companies
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
          {analysisProgress ? (
            <div className="mt-3 rounded-xl border p-3" style={{ background: c.soft, borderColor: c.line }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                  {analysisProgress.running ? "Local analysis running" : "Local analysis complete"}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
                  {analysisProgress.completed}/{analysisProgress.total} areas
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "#e7ede2" }}>
                <div
                  className="h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${progressPercent}%`,
                    background: analysisProgress.running ? "#5f9b8c" : "#233c4b",
                  }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
                  Success: {analysisProgress.succeeded.length}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: "#915e46" }}>
                  Failed: {analysisProgress.failed.length}
                </span>
                {analysisProgress.currentArea ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                    Current: {areaLabelByKey[analysisProgress.currentArea] ?? analysisProgress.currentArea}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-6 rounded-2xl border p-5 shadow-sm" style={{ background: c.panel, borderColor: c.line }}>
          {usedTags.length > 0 ? (
            <div className="mb-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveFilter(null)}
                className="cursor-pointer rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{
                  color: activeFilter ? c.secondary : c.panel,
                  borderColor: activeFilter ? c.line : c.charcoal,
                  background: activeFilter ? c.panel : c.charcoal,
                }}
              >
                All
              </button>
              {usedTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setActiveFilter((current) => (current === tag ? null : tag))}
                  className="cursor-pointer rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                  style={{
                    color: activeFilter === tag ? c.panel : c.secondary,
                    borderColor: activeFilter === tag ? c.charcoal : c.line,
                    background: activeFilter === tag ? c.charcoal : c.panel,
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          ) : null}

          {allFiles.length === 0 ? (
            <div className="rounded-xl border p-10 text-center" style={{ borderColor: c.line, background: c.soft }}>
              <div className="mb-3 text-[36px]">📁</div>
              <p className="font-sans text-[16px] font-semibold" style={{ color: c.charcoal }}>No files uploaded yet.</p>
              <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
                Upload files from this page or from any input panel.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="rounded-xl border px-4 py-5 font-sans text-[14px]" style={{ color: c.secondary, borderColor: c.line, background: c.soft }}>
              No files match the active filter.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: c.line, background: c.panel }}>
              <div className="grid grid-cols-[1fr_190px_170px_220px_90px] gap-3 border-b px-4 py-2.5" style={{ background: c.soft, borderColor: c.line }}>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>File</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>Input Area</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>Deep Dive</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>Tags</span>
                <span className="text-right font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>Actions</span>
              </div>

              {filtered.map((file) => (
                <div key={file.id}>
                  <div className="grid grid-cols-[1fr_190px_170px_220px_90px] items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-[#fdfcfa]" style={{ borderColor: c.line }}>
                    <button type="button" onClick={() => handleOpen(file.file_url)} className="flex min-w-0 items-center gap-3 text-left">
                      <span className="shrink-0 text-base">📄</span>
                      <div className="min-w-0">
                        <p className="truncate font-sans text-[13px] font-medium" style={{ color: c.charcoal }}>
                          {file.file_name}
                        </p>
                        <p className="font-mono text-[9px] uppercase" style={{ color: c.muted }}>{file.file_type}</p>
                      </div>
                    </button>

                    <div className="min-w-0">
                      <p className="truncate font-sans text-[12px]" style={{ color: c.charcoal }}>{file.inputLabel}</p>
                      <p className="font-mono text-[9px]" style={{ color: c.muted }}>{file.subGroup}</p>
                    </div>

                    {(() => {
                      const status = fileAreaStatusById.get(file.id) ?? { state: "awaiting", areaKey: "strategy" as AreaKey };

                      if (!user) {
                        return (
                          <div className="flex items-center gap-1.5">
                            <Clock size={13} style={{ color: c.muted }} />
                            <span className="font-mono text-[10px] uppercase" style={{ color: c.muted }}>Signed out</span>
                          </div>
                        );
                      }

                      if (status.state === "analyzed") {
                        return (
                          <div className="flex items-center gap-1.5" title="Included in latest Deep Dive analysis for this area">
                            <CheckCircle size={13} className="text-forest" />
                            <span className="font-mono text-[10px] uppercase text-forest">Analyzed</span>
                          </div>
                        );
                      }

                      return (
                        <div className="flex items-center gap-1.5" title="Use Analyze Awaiting Files above to run local deep-dive analysis for this area.">
                          <AlertCircle size={13} style={{ color: "#b67a45" }} />
                          <span className="font-mono text-[10px] uppercase" style={{ color: "#b67a45" }}>Awaiting analysis</span>
                        </div>
                      );
                    })()}

                    <div className="flex flex-wrap items-center gap-1">
                      {file.tags.length > 0 ? (
                        <>
                          {file.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border px-2 py-[1px] font-mono text-[9px] uppercase tracking-[0.08em]"
                              style={{ borderColor: c.line, color: c.secondary, background: c.panel }}
                            >
                              {tag}
                            </span>
                          ))}
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditingFileId((current) => (current === file.id ? null : file.id));
                            }}
                            className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.08em]"
                            style={{ color: c.muted }}
                          >
                            Edit
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditingFileId((current) => (current === file.id ? null : file.id));
                          }}
                          className="cursor-pointer rounded-full border px-2 py-[2px] font-mono text-[9px] uppercase tracking-[0.08em]"
                          style={{ borderColor: c.line, color: c.secondary, background: c.panel }}
                        >
                          + Add tags
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpen(file.file_url)}
                        className="cursor-pointer rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                        style={{ borderColor: c.line, color: c.secondary, background: c.panel }}
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(file.id, file.file_url);
                        }}
                        className="cursor-pointer rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                        style={{ borderColor: "#e6cfc2", color: "#915e46", background: "#fff8f5" }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {editingFileId === file.id ? (
                    <div className="border-b px-4 pb-3" style={{ borderColor: c.line, background: "#fdfcfa" }}>
                      <TagEditor file={file} onClose={() => setEditingFileId(null)} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <FileUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        companyId={activeCompany?.id}
        companyName={activeCompany?.name}
      />
    </div>
  );
}
