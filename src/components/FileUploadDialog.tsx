import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
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
}

type AnalysisResult = {
  suggestedInputId: string | null;
  suggestedTags: FileCategory[];
  reasoning: string;
};

type AssignmentSource = 'ai' | 'context' | 'filename' | 'fallback' | 'none';

type UploadSummary = {
  fileName: string;
  inputLabel: string;
  subGroup: string;
  tags: string[];
  reasoning: string;
  source: AssignmentSource;
};

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
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

export default function FileUploadDialog({ open, onOpenChange, defaultInputId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [selectedProvenanceTags, setSelectedProvenanceTags] = useState<string[]>([]);
  const uploadMutation = useUploadInputFile();
  const { activeCompany } = useCompany();
  const { query } = useInputs();
  const inputs = useMemo(() => query.data ?? [], [query.data]);
  const hasInputs = inputs.length > 0;

  const assigned = useMemo(
    () =>
      resolveAssignedInput({
        inputs,
        suggestedInputId: analysis?.suggestedInputId ?? null,
        defaultInputId,
        fileName: file?.name,
      }),
    [analysis?.suggestedInputId, defaultInputId, file?.name, inputs],
  );

  useEffect(() => {
    if (!file || !hasInputs) return;
    let cancelled = false;
    const currentFile = file;

    async function analyze() {
      setAnalyzing(true);
      setAnalysis(null);
      try {
        const fileContent = await readFileText(currentFile);
        const inputAreas = inputs.map((input) => ({
          id: input.id,
          input_label: input.input_label,
          sub_group: input.sub_group,
          group_key: input.group_key,
        }));

        const { data, error } = await supabase.functions.invoke('analyze-file', {
          body: { fileName: currentFile.name, fileContent, inputAreas },
        });

        if (cancelled) return;

        if (error) {
          setAnalysis({
            suggestedInputId: null,
            suggestedTags: [],
            reasoning:
              error.message ||
              'Local analysis is unavailable right now. The file can still upload with automatic default mapping.',
          });
          return;
        }

        if (data?.error) {
          setAnalysis({
            suggestedInputId: null,
            suggestedTags: [],
            reasoning: String(data.error),
          });
          return;
        }

        const suggestedInputId =
          typeof data?.suggested_input_id === 'string' && data.suggested_input_id.trim().length > 0
            ? data.suggested_input_id
            : null;

        setAnalysis({
          suggestedInputId,
          suggestedTags: normalizeSuggestedTags(data?.suggested_tags),
          reasoning:
            typeof data?.reasoning === 'string' && data.reasoning.trim().length > 0
              ? data.reasoning
              : 'Analysis complete.',
        });
      } catch (error) {
        if (!cancelled) {
          setAnalysis({
            suggestedInputId: null,
            suggestedTags: [],
            reasoning: 'Local analysis failed. The file can still upload with automatic default mapping.',
          });
        }
      } finally {
        if (!cancelled) setAnalyzing(false);
      }
    }

    analyze();
    return () => {
      cancelled = true;
    };
  }, [file, hasInputs, inputs]);

  function clearNativeInputValue() {
    if (fileRef.current) fileRef.current.value = '';
  }

  function resetDialogState() {
    setFile(null);
    setUploading(false);
    setAnalyzing(false);
    setAnalysis(null);
    setIsDraggingFile(false);
    setUploadSummary(null);
    setSelectedProvenanceTags([]);
    clearNativeInputValue();
  }

  function handleFilePicked(nextFile: File | null) {
    if (!nextFile) {
      setFile(null);
      setAnalysis(null);
      return;
    }

    const ext = getFileExtension(nextFile.name);
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      toast.error('Unsupported file type');
      return;
    }

    if (nextFile.size > MAX_FILE_SIZE_BYTES) {
      toast.error('File is too large (max 25MB)');
      return;
    }

    setFile(nextFile);
    setAnalysis(null);
    setUploadSummary(null);
    setSelectedProvenanceTags([]);
  }

  function toggleProvenanceTag(tag: string) {
    setSelectedProvenanceTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    );
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDraggingFile(false);
    const dropped = event.dataTransfer.files?.[0] ?? null;
    handleFilePicked(dropped);
  }

  async function handleUpload() {
    if (!file || !assigned.input || !hasInputs) return;
    setUploading(true);
    try {
      const mergedTags = new Set<string>([...(analysis?.suggestedTags ?? []), ...selectedProvenanceTags]);
      const uploadTags = [...mergedTags];
      await uploadMutation.mutateAsync({
        inputId: assigned.input.id,
        file,
        tags: uploadTags,
      });

      setUploadSummary({
        fileName: file.name,
        inputLabel: assigned.input.input_label,
        subGroup: assigned.input.sub_group,
        tags: uploadTags,
        reasoning: analysis?.reasoning ?? 'Analysis unavailable',
        source: assigned.source,
      });

      toast.success(`Uploaded ${file.name}`);
      setFile(null);
      setAnalysis(null);
      setSelectedProvenanceTags([]);
      clearNativeInputValue();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetDialogState();
    onOpenChange(nextOpen);
  }

  const canUpload = !!file && !!assigned.input && hasInputs && !uploading && !analyzing;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[560px] border-[#dde6d1] bg-[#faf7f6] text-[#233c4b] shadow-[0_20px_60px_rgba(35,60,75,0.16)]">
        <DialogHeader>
          <DialogTitle className="font-sans text-[22px] font-semibold text-[#233c4b]">Upload Client File</DialogTitle>
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
                Auto Mapping On
              </span>
            </div>
            <p className="mt-1 font-sans text-[13px]" style={{ color: '#233c4b' }}>
              {activeCompany?.name ?? 'No company selected'}
            </p>
          </div>

          <div>
            <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.12em] text-[#6e847f]">
              File
            </label>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(event) => {
                const nextFile = event.target.files?.[0] ?? null;
                handleFilePicked(nextFile);
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
              {file ? (
                <span className="font-sans text-[15px] font-medium" style={{ color: '#233c4b' }}>
                  {file.name}
                </span>
              ) : (
                <span className="font-sans text-[15px]" style={{ color: '#46606d' }}>
                  Click or drop a file here
                </span>
              )}
            </button>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] text-[#6e847f]">
                PDF, DOCX, XLSX, PPTX, CSV, TXT, PNG, JPG (max 25MB)
              </p>
              {file ? (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setAnalysis(null);
                    clearNativeInputValue();
                  }}
                  className="rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                  style={{ borderColor: '#dde6d1', color: '#46606d', background: '#ffffff' }}
                >
                  Clear
                </button>
              ) : null}
            </div>
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

          {analyzing ? (
            <div className="flex items-center gap-2 rounded-[16px] border px-3 py-2" style={{ background: '#fffdf7', borderColor: '#e4d8ac' }}>
              <div className="h-3 w-3 animate-spin rounded-full border-2" style={{ borderColor: '#c89b2b', borderTopColor: 'transparent' }} />
              <span className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: '#8a6b12' }}>
                Analyzing locally…
              </span>
            </div>
          ) : null}

          {file && !analyzing && assigned.input ? (
            <div className="rounded-[16px] border px-3 py-3" style={{ background: '#ffffff', borderColor: '#dde6d1' }}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: '#6e847f' }}>
                  Analysis Summary
                </span>
                <span
                  className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em]"
                  style={{ color: '#46606d', borderColor: '#dde6d1', background: '#ffffff' }}
                >
                  {sourceLabel(assigned.source)}
                </span>
              </div>
              <p className="font-sans text-[13px] leading-relaxed" style={{ color: '#46606d' }}>
                This file will be uploaded to <strong>{assigned.input.input_label}</strong> ({assigned.input.sub_group}).
              </p>
              {analysis?.reasoning ? (
                <p className="mt-2 font-sans text-[13px] leading-relaxed" style={{ color: '#46606d' }}>
                  {analysis.reasoning}
                </p>
              ) : null}
            </div>
          ) : null}

          {file && !analyzing ? (
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
                These tags help clarify evidence source across pages.
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
            {uploading ? 'Uploading…' : hasInputs ? 'Upload & Save Summary' : 'Seed Inputs First'}
          </button>

          {uploadSummary ? (
            <div className="rounded-[16px] border px-3 py-3" style={{ background: '#f6fbfa', borderColor: '#cde1da' }}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: '#4c7f73' }}>
                  Uploaded
                </span>
                <span
                  className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em]"
                  style={{ color: '#4c7f73', borderColor: '#b9d7cc', background: '#ffffff' }}
                >
                  {sourceLabel(uploadSummary.source)}
                </span>
              </div>
              <p className="font-sans text-[13px]" style={{ color: '#233c4b' }}>
                <strong>{uploadSummary.fileName}</strong> was uploaded to <strong>{uploadSummary.inputLabel}</strong> ({uploadSummary.subGroup}).
              </p>
              <p className="mt-2 font-sans text-[13px] leading-relaxed" style={{ color: '#46606d' }}>
                {uploadSummary.reasoning}
              </p>
              {uploadSummary.tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {uploadSummary.tags.map((tag) => (
                    <span
                      key={`${uploadSummary.fileName}-${tag}`}
                      className="rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
                      style={{ color: '#46606d', borderColor: '#d4e5df', background: '#ffffff' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="text-center font-mono text-[10px] text-[#6e847f]">
            Input area and tags are now assigned automatically from local analysis.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
