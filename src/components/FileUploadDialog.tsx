import { type DragEvent, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCompany } from '@/hooks/useCompany';
import { useInputs, useUploadInputFile } from '@/hooks/useInputs';
import type { InputItem } from '@/lib/types';
import { FILE_CATEGORIES, type FileCategory } from '@/lib/fileCategories';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultInputId?: string;
  companyId?: string;
  companyName?: string;
}

type AnalysisResult = {
  suggestedInputId: string | null;
  suggestedTags: FileCategory[];
  reasoning: string;
};

type AssignmentSource = 'ai' | 'context' | 'filename' | 'fallback' | 'none';

type UploadSummary = {
  fileName: string;
  status: 'uploaded' | 'failed';
  inputLabel?: string;
  subGroup?: string;
  tags: string[];
  reasoning: string;
  source: AssignmentSource;
  error?: string;
};

type UploadProgress = {
  total: number;
  completed: number;
  currentFile: string | null;
  phase: 'analyzing' | 'uploading' | 'done';
  success: number;
  failed: number;
  startedAtMs: number;
  etaMs: number | null;
};

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const ANALYZE_TIMEOUT_MS = 20_000;
const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'csv', 'txt', 'md', 'json', 'xml', 'yaml', 'yml', 'toml',
  'png', 'jpg', 'jpeg', 'webp',
]);
const FILE_ACCEPT_ATTR = Array.from(SUPPORTED_EXTENSIONS)
  .map((ext) => `.${ext}`)
  .join(',');

const KEYWORDS_BY_INPUT_KEY: Array<{ key: string; terms: string[] }> = [
  { key: 'comp-alt', terms: ['competitor', 'competitive', 'alternative', 'compare'] },
  { key: 'unique-attr', terms: ['unique', 'attribute', 'differentiator'] },
  { key: 'val-prop', terms: ['value', 'proposition', 'promise'] },
  { key: 'target-aud', terms: ['audience', 'persona', 'segment', 'customer'] },
  { key: 'market-cat', terms: ['market', 'category', 'landscape'] },
  { key: 'program-model', terms: ['program', 'service', 'model', 'delivery'] },
  { key: 'needs-assessment', terms: ['need', 'odi', 'jtbd', 'interview', 'survey'] },
  { key: 'outcome-data', terms: ['outcome', 'impact', 'metric', 'kpi', 'result'] },
  { key: 'referral-map', terms: ['referral', 'partner', 'ecosystem'] },
  { key: 'brand-narrative', terms: ['brand', 'narrative', 'messaging', 'story'] },
  { key: 'channel-strat', terms: ['channel', 'campaign', 'reach', 'distribution'] },
  { key: 'donor-retention', terms: ['donor', 'retention', 'renewal'] },
  { key: 'grant-pipeline', terms: ['grant', 'funding', 'pipeline'] },
  { key: 'family-satisfaction', terms: ['family', 'satisfaction', 'feedback', 'experience'] },
];

const PROVENANCE_TAG_OPTIONS = ['Public', 'Company', 'Primary Evidence', 'Implemented & Tested'] as const;

function isInputNotApplicable(input: Pick<InputItem, 'input_label' | 'sub_group'>): boolean {
  const combined = `${input.input_label} ${input.sub_group}`.toLowerCase();
  return combined.includes('not applicable') || combined.includes('n/a') || combined.includes('not app');
}

async function readFileText(file: File): Promise<string | null> {
  const textTypes = ['text/', 'application/json', 'application/csv', 'text/csv'];
  if (textTypes.some((t) => file.type.startsWith(t)) || /\.(txt|csv|md|json|xml|yaml|toml)$/i.test(file.name)) {
    return file.text();
  }
  return null;
}

function getFileExtension(name: string): string {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function normalizeSuggestedTags(raw: unknown): FileCategory[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<FileCategory>(FILE_CATEGORIES);
  return raw
    .filter((tag): tag is string => typeof tag === 'string')
    .filter((tag): tag is FileCategory => allowed.has(tag as FileCategory))
    .slice(0, 6);
}

function tryFilenameMatch(fileName: string, inputs: InputItem[]): InputItem | null {
  const normalized = fileName.toLowerCase();
  for (const matcher of KEYWORDS_BY_INPUT_KEY) {
    if (matcher.terms.some((term) => normalized.includes(term))) {
      const found = inputs.find((input) => input.input_key === matcher.key);
      if (found) return found;
    }
  }
  return null;
}

function resolveAssignedInput(params: {
  inputs: InputItem[];
  suggestedInputId: string | null;
  defaultInputId?: string;
  fileName?: string;
}): { input: InputItem | null; source: AssignmentSource } {
  const { inputs, suggestedInputId, defaultInputId, fileName } = params;
  if (inputs.length === 0) return { input: null, source: 'none' };

  if (suggestedInputId) {
    const byAi = inputs.find((input) => input.id === suggestedInputId);
    if (byAi) return { input: byAi, source: 'ai' };
  }

  if (defaultInputId) {
    const byContext = inputs.find((input) => input.id === defaultInputId);
    if (byContext) return { input: byContext, source: 'context' };
  }

  if (fileName) {
    const byFilename = tryFilenameMatch(fileName, inputs);
    if (byFilename) return { input: byFilename, source: 'filename' };
  }

  return { input: inputs[0] ?? null, source: 'fallback' };
}

function sourceLabel(source: AssignmentSource): string {
  if (source === 'ai') return 'AI mapped';
  if (source === 'context') return 'Context mapped';
  if (source === 'filename') return 'Filename mapped';
  if (source === 'fallback') return 'Default mapped';
  return 'Unmapped';
}

function fileFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function formatDurationShort(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function computeReliableEtaMs(completedDurationsMs: number[], total: number, completed: number): number | null {
  const remaining = Math.max(0, total - completed);
  if (remaining <= 0) return 0;
  if (completedDurationsMs.length < 4) return null;

  const mean =
    completedDurationsMs.reduce((sum, value) => sum + value, 0) / completedDurationsMs.length;
  if (!Number.isFinite(mean) || mean <= 0) return null;

  const variance =
    completedDurationsMs.reduce((sum, value) => sum + (value - mean) ** 2, 0) / completedDurationsMs.length;
  const stdDev = Math.sqrt(Math.max(0, variance));
  const coefficientOfVariation = stdDev / mean;

  // Strict threshold so we only display ETA when pace is genuinely stable.
  if (coefficientOfVariation > 0.2) return null;

  return Math.round(mean * remaining);
}

async function analyzeFileForRouting(file: File, inputAreas: InputItem[]): Promise<AnalysisResult | null> {
  try {
    const fileContent = await readFileText(file);
    const payloadInputAreas = inputAreas.map((input) => ({
      id: input.id,
      input_label: input.input_label,
      sub_group: input.sub_group,
      group_key: input.group_key,
    }));

    const { data, error } = await supabase.functions.invoke('analyze-file', {
      body: { fileName: file.name, fileContent, inputAreas: payloadInputAreas },
    });

    if (error || data?.error) return null;

    const suggestedInputId =
      typeof data?.suggested_input_id === 'string' && data.suggested_input_id.trim().length > 0
        ? data.suggested_input_id
        : null;

    return {
      suggestedInputId,
      suggestedTags: normalizeSuggestedTags(data?.suggested_tags),
      reasoning:
        typeof data?.reasoning === 'string' && data.reasoning.trim().length > 0
          ? data.reasoning
          : 'Analysis complete.',
    };
  } catch {
    return null;
  }
}

async function analyzeFileWithTimeout(file: File, inputAreas: InputItem[]): Promise<AnalysisResult | null> {
  return Promise.race([
    analyzeFileForRouting(file, inputAreas),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ANALYZE_TIMEOUT_MS);
    }),
  ]);
}

export default function FileUploadDialog({
  open,
  onOpenChange,
  defaultInputId,
  companyId,
  companyName,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploadSummaries, setUploadSummaries] = useState<UploadSummary[]>([]);
  const [selectedProvenanceTags, setSelectedProvenanceTags] = useState<string[]>([]);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [alignmentRunning, setAlignmentRunning] = useState(false);
  const queryClient = useQueryClient();
  const uploadMutation = useUploadInputFile();
  const { activeCompany } = useCompany();
  const { query } = useInputs(companyId);
  const inputs = useMemo(() => query.data ?? [], [query.data]);
  const eligibleInputs = useMemo(() => {
    const filtered = inputs.filter((input) => !isInputNotApplicable(input));
    return filtered.length > 0 ? filtered : inputs;
  }, [inputs]);
  const hasInputs = eligibleInputs.length > 0;
  const effectiveCompanyName = companyName || activeCompany?.name || 'No company selected';
  const progressPercent = progress && progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;
  const elapsedLabel = progress ? formatDurationShort(Date.now() - progress.startedAtMs) : null;
  const etaLabel = progress && progress.etaMs != null && progress.etaMs > 0
    ? formatDurationShort(progress.etaMs)
    : null;

  function clearNativeInputValue() {
    if (fileRef.current) fileRef.current.value = '';
  }

  function resetDialogState() {
    setFiles([]);
    setUploading(false);
    setIsDraggingFile(false);
    setUploadSummaries([]);
    setSelectedProvenanceTags([]);
    setProgress(null);
    setAlignmentRunning(false);
    clearNativeInputValue();
  }

  function appendFiles(nextFiles: File[]) {
    if (nextFiles.length === 0) return;

    const accepted: File[] = [];
    let invalidType = 0;
    let invalidSize = 0;

    for (const nextFile of nextFiles) {
      const ext = getFileExtension(nextFile.name);
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        invalidType += 1;
        continue;
      }
      if (nextFile.size > MAX_FILE_SIZE_BYTES) {
        invalidSize += 1;
        continue;
      }
      accepted.push(nextFile);
    }

    if (invalidType > 0) toast.error(`${invalidType} file${invalidType === 1 ? '' : 's'} had unsupported type`);
    if (invalidSize > 0) toast.error(`${invalidSize} file${invalidSize === 1 ? '' : 's'} exceeded 25MB`);
    if (accepted.length === 0) return;

    setFiles((current) => {
      const seen = new Set(current.map((file) => fileFingerprint(file)));
      const deduped = [...current];
      for (const item of accepted) {
        const key = fileFingerprint(item);
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
      }
      return deduped;
    });

    setUploadSummaries([]);
    if (selectedProvenanceTags.length === 0) {
      setSelectedProvenanceTags(['Company']);
    }
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDraggingFile(false);
    appendFiles(Array.from(event.dataTransfer.files || []));
  }

  function toggleProvenanceTag(tag: string) {
    setSelectedProvenanceTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    );
  }

  async function handleUpload() {
    if (!hasInputs || files.length === 0 || uploading) return;

    const queue = [...files];
    const localSummaries: UploadSummary[] = [];
    const failedFiles: File[] = [];
    const completedDurationsMs: number[] = [];
    const uploadStartedAtMs = Date.now();
    let successCount = 0;
    let failureCount = 0;

    setUploading(true);
    setProgress({
      total: queue.length,
      completed: 0,
      currentFile: queue[0]?.name ?? null,
      phase: 'analyzing',
      success: 0,
      failed: 0,
      startedAtMs: uploadStartedAtMs,
      etaMs: null,
    });

    for (let index = 0; index < queue.length; index += 1) {
      const file = queue[index];
      const fileStartedAtMs = Date.now();

      setProgress((current) =>
        current
          ? {
              ...current,
              currentFile: file.name,
              phase: 'analyzing',
              etaMs: computeReliableEtaMs(completedDurationsMs, queue.length, current.completed),
            }
          : current,
      );

      const analysis = await analyzeFileWithTimeout(file, eligibleInputs);
      const assigned = resolveAssignedInput({
        inputs: eligibleInputs,
        suggestedInputId: analysis?.suggestedInputId ?? null,
        defaultInputId,
        fileName: file.name,
      });

      if (!assigned.input) {
        failureCount += 1;
        failedFiles.push(file);
        localSummaries.push({
          fileName: file.name,
          status: 'failed',
          tags: [],
          reasoning: analysis?.reasoning ?? 'Could not map this file to an input area.',
          source: assigned.source,
          error: 'No matching input area.',
        });
        completedDurationsMs.push(Date.now() - fileStartedAtMs);
        setProgress((current) =>
          current
            ? {
                ...current,
                completed: index + 1,
                currentFile: file.name,
                phase: index + 1 === queue.length ? 'done' : 'analyzing',
                success: successCount,
                failed: failureCount,
                etaMs: computeReliableEtaMs(completedDurationsMs, queue.length, index + 1),
              }
            : current,
        );
        continue;
      }

      setProgress((current) =>
        current
          ? {
              ...current,
              currentFile: file.name,
              phase: 'uploading',
              etaMs: computeReliableEtaMs(completedDurationsMs, queue.length, current.completed),
            }
          : current,
      );

      try {
        const mergedTags = new Set<string>([...(analysis?.suggestedTags ?? []), ...selectedProvenanceTags]);
        const uploadTags = [...mergedTags];

        await uploadMutation.mutateAsync({
          inputId: assigned.input.id,
          inputKey: assigned.input.input_key,
          companyName: companyName ?? activeCompany?.name ?? '',
          file,
          tags: uploadTags,
        });

        successCount += 1;
        localSummaries.push({
          fileName: file.name,
          status: 'uploaded',
          inputLabel: assigned.input.input_label,
          subGroup: assigned.input.sub_group,
          tags: uploadTags,
          reasoning: analysis?.reasoning ?? 'Uploaded with automatic mapping.',
          source: assigned.source,
        });
      } catch (error: unknown) {
        failureCount += 1;
        failedFiles.push(file);
        localSummaries.push({
          fileName: file.name,
          status: 'failed',
          inputLabel: assigned.input.input_label,
          subGroup: assigned.input.sub_group,
          tags: [],
          reasoning: analysis?.reasoning ?? 'Upload failed before save.',
          source: assigned.source,
          error: error instanceof Error ? error.message : 'Upload failed',
        });
      }

      completedDurationsMs.push(Date.now() - fileStartedAtMs);

      setProgress((current) =>
        current
          ? {
              ...current,
              completed: index + 1,
              phase: index + 1 === queue.length ? 'done' : 'analyzing',
              success: successCount,
              failed: failureCount,
              etaMs: computeReliableEtaMs(completedDurationsMs, queue.length, index + 1),
            }
          : current,
      );
    }

    setUploadSummaries(localSummaries);
    setFiles(failedFiles);
    if (failedFiles.length === 0) clearNativeInputValue();
    setUploading(false);

    if (failureCount > 0) {
      toast.message(`Uploaded ${successCount} of ${queue.length}. ${failureCount} failed and remain selected.`);
    } else {
      toast.success(`Uploaded ${successCount} file${successCount === 1 ? '' : 's'}.`);
    }

    const selectedCompanyId = companyId || activeCompany?.id;
    if (successCount > 0 && selectedCompanyId) {
      setAlignmentRunning(true);
      void supabase.functions
        .invoke("local-alignment", {
          body: {
            company_id: selectedCompanyId,
            areas: ["positioning", "strategy"],
            trigger: "upload_batch",
          },
        })
        .then(({ error, data }) => {
          if (error || data?.error) {
            toast.error("Local strategy/positioning comparison failed. Uploads were saved.");
            return;
          }
          void queryClient.invalidateQueries({ queryKey: ["local-alignment", selectedCompanyId] });
          toast.success("Local strategy/positioning comparison updated.");
        })
        .catch(() => {
          toast.error("Local strategy/positioning comparison failed. Uploads were saved.");
        })
        .finally(() => {
          setAlignmentRunning(false);
        });
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetDialogState();
    onOpenChange(nextOpen);
  }

  const canUpload = files.length > 0 && hasInputs && !uploading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[560px] border-[#dde6d1] bg-[#faf7f6] text-[#233c4b] shadow-[0_20px_60px_rgba(35,60,75,0.16)]">
        <DialogHeader>
          <DialogTitle className="font-sans text-[22px] font-semibold text-[#233c4b]">Upload Client Files</DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <div className="rounded-[14px] border px-3 py-2.5" style={{ background: '#ffffff', borderColor: '#dde6d1' }}>
            <div className="flex items-center justify-between gap-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: '#6e847f' }}>
                Company
              </div>
              <span
                className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em]"
                style={{ color: '#46606d', borderColor: '#dde6d1', background: '#ffffff' }}
              >
                Queue Upload
              </span>
            </div>
            <p className="mt-1 font-sans text-[13px]" style={{ color: '#233c4b' }}>
              {effectiveCompanyName}
            </p>
          </div>

          <div>
            <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-[#6e847f]">
              Files
            </label>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                appendFiles(Array.from(event.target.files || []));
                event.currentTarget.value = '';
              }}
              accept={FILE_ACCEPT_ATTR}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={handleDrop}
              className="w-full rounded-[16px] border border-dashed py-5 text-center transition-colors"
              style={{
                borderColor: isDraggingFile ? '#5f9b8c' : '#cfdace',
                background: isDraggingFile ? '#f6fbfa' : '#ffffff',
              }}
            >
              {files.length > 0 ? (
                <span className="font-sans text-[15px] font-medium" style={{ color: '#233c4b' }}>
                  {files.length} file{files.length === 1 ? '' : 's'} selected
                </span>
              ) : (
                <span className="font-sans text-[15px]" style={{ color: '#46606d' }}>
                  Click or drop files here
                </span>
              )}
            </button>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] text-[#6e847f]">
                PDF, DOCX, XLSX, PPTX, CSV, TXT, PNG, JPG (max 25MB each)
              </p>
              {files.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setFiles([]);
                    setUploadSummaries([]);
                    clearNativeInputValue();
                  }}
                  className="rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                  style={{ borderColor: '#dde6d1', color: '#46606d', background: '#ffffff' }}
                >
                  Clear
                </button>
              ) : null}
            </div>
            {files.length > 0 ? (
              <div className="mt-2 rounded-[12px] border px-3 py-2" style={{ borderColor: '#dde6d1', background: '#ffffff' }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: '#6e847f' }}>
                  Selected
                </p>
                <div className="mt-1 space-y-1">
                  {files.slice(0, 6).map((file) => (
                    <p key={fileFingerprint(file)} className="truncate font-sans text-[12px]" style={{ color: '#46606d' }}>
                      {file.name}
                    </p>
                  ))}
                  {files.length > 6 ? (
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: '#6e847f' }}>
                      +{files.length - 6} more
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {!hasInputs ? (
            <div className="rounded-[16px] border px-3 py-3" style={{ background: '#fff8f5', borderColor: '#e6cfc2' }}>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: '#915e46' }}>
                Missing Inputs
              </div>
              <p className="mt-1 font-sans text-[13px] leading-relaxed" style={{ color: '#6c4638' }}>
                This company has no input rows yet. Run AI research first, then upload files.
              </p>
            </div>
          ) : null}

          {files.length > 0 ? (
            <div className="rounded-[16px] border px-3 py-3" style={{ background: '#ffffff', borderColor: '#dde6d1' }}>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: '#6e847f' }}>
                Source Tags (Optional)
              </div>
              <div className="flex flex-wrap gap-2">
                {PROVENANCE_TAG_OPTIONS.map((tag) => {
                  const active = selectedProvenanceTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleProvenanceTag(tag)}
                      className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors"
                      style={
                        active
                          ? { background: '#233c4b', color: '#faf7f6', borderColor: '#233c4b' }
                          : { background: '#ffffff', color: '#46606d', borderColor: '#dde6d1' }
                      }
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 font-sans text-[12px]" style={{ color: '#6e847f' }}>
                Files upload first. Area mapping uses fast fallback + local analysis per file with timeout.
              </p>
            </div>
          ) : null}

          {progress ? (
            <div className="rounded-[16px] border px-3 py-3" style={{ background: '#f6fbfa', borderColor: '#cde1da' }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: '#4c7f73' }}>
                  {uploading ? 'Upload in progress' : 'Upload complete'}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: '#46606d' }}>
                  {progress.completed}/{progress.total}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: '#d7ebe4' }}>
                <div
                  className="h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%`, background: '#5f9b8c' }}
                />
              </div>
              {progress.currentFile ? (
                <p className="mt-2 truncate font-sans text-[12px]" style={{ color: '#46606d' }}>
                  {progress.phase === 'analyzing' ? 'Analyzing' : progress.phase === 'uploading' ? 'Uploading' : 'Done'}: {progress.currentFile}
                </p>
              ) : null}
              <div className="mt-1 flex flex-wrap gap-3">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: '#4c7f73' }}>
                  Success: {progress.success}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: '#915e46' }}>
                  Failed: {progress.failed}
                </span>
                {elapsedLabel ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: '#46606d' }}>
                    Elapsed: {elapsedLabel}
                  </span>
                ) : null}
                {uploading && etaLabel ? (
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: '#46606d' }}>
                    ETA: {etaLabel}
                  </span>
                ) : null}
              </div>
              {uploading && !etaLabel ? (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: '#6e847f' }}>
                  ETA appears only when pace is stable enough to be reliable.
                </p>
              ) : null}
            </div>
          ) : null}

          {alignmentRunning ? (
            <div className="rounded-[16px] border px-3 py-2" style={{ background: '#fffdf7', borderColor: '#e4d8ac' }}>
              <p className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: '#8a6b12' }}>
                Running local strategy/positioning comparison…
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleUpload}
            disabled={!canUpload}
            className="w-full rounded-[16px] py-3 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: '#233c4b', border: '1px solid #233c4b', color: '#faf7f6' }}
          >
            {uploading
              ? `Uploading ${progress?.completed ?? 0}/${progress?.total ?? files.length}...`
              : hasInputs
                ? files.length > 0
                  ? `Upload ${files.length} File${files.length === 1 ? '' : 's'}`
                  : 'Upload Files'
                : 'Seed Inputs First'}
          </button>

          {uploadSummaries.length > 0 ? (
            <div className="rounded-[16px] border px-3 py-3" style={{ background: '#ffffff', borderColor: '#dde6d1' }}>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: '#6e847f' }}>
                Upload Results
              </div>
              <div className="space-y-2">
                {uploadSummaries.slice(0, 8).map((summary) => (
                  <div
                    key={`${summary.fileName}-${summary.status}-${summary.inputLabel ?? 'none'}`}
                    className="rounded-[10px] border px-2.5 py-2"
                    style={{
                      borderColor: summary.status === 'uploaded' ? '#cde1da' : '#e6cfc2',
                      background: summary.status === 'uploaded' ? '#f6fbfa' : '#fff8f5',
                    }}
                  >
                    <p className="truncate font-sans text-[12px] font-medium" style={{ color: '#233c4b' }}>
                      {summary.fileName}
                    </p>
                    {summary.status === 'uploaded' ? (
                      <p className="mt-0.5 font-sans text-[12px]" style={{ color: '#46606d' }}>
                        {summary.inputLabel} ({summary.subGroup}) • {sourceLabel(summary.source)}
                      </p>
                    ) : (
                      <p className="mt-0.5 font-sans text-[12px]" style={{ color: '#915e46' }}>
                        Failed: {summary.error ?? 'Upload failed'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <p className="text-center font-mono text-[10px] text-[#6e847f]">
            Queue mode uploads all selected files and shows exact progress.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
