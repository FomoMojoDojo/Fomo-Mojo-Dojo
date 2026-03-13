import { useRef, useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useInputs, useUploadInputFile } from '@/hooks/useInputs';
import { FILE_CATEGORIES, type FileCategory } from '@/lib/fileCategories';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultInputId?: string;
}

async function readFileText(file: File): Promise<string | null> {
  const textTypes = ['text/', 'application/json', 'application/csv', 'text/csv'];
  if (textTypes.some((t) => file.type.startsWith(t)) || /\.(txt|csv|md|json|xml|yaml|toml)$/i.test(file.name)) {
    return file.text();
  }
  return null;
}

export default function FileUploadDialog({ open, onOpenChange, defaultInputId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [inputId, setInputId] = useState(defaultInputId ?? '');
  const [selectedTags, setSelectedTags] = useState<FileCategory[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);
  const uploadMutation = useUploadInputFile();
  const { query } = useInputs();
  const inputs = useMemo(() => query.data ?? [], [query.data]);
  const groupedInputs = useMemo(
    () =>
      ['foundation', 'execution', 'market_evidence'].map((groupKey) => ({
        groupKey,
        items: inputs.filter((input) => input.group_key === groupKey),
      })),
    [inputs]
  );

  // When a file is selected, call AI to analyze it
  useEffect(() => {
    if (!file || inputs.length === 0) return;
    let cancelled = false;
    const currentFile = file;

    async function analyze() {
      setAnalyzing(true);
      setAiReasoning(null);
      try {
        const fileContent = await readFileText(currentFile);
        const inputAreas = inputs.map((i) => ({
          id: i.id,
          input_label: i.input_label,
          sub_group: i.sub_group,
          group_key: i.group_key,
        }));

        const { data, error } = await supabase.functions.invoke('analyze-file', {
          body: { fileName: currentFile.name, fileContent, inputAreas },
        });

        if (cancelled) return;

        if (error) {
          console.warn('AI analysis failed:', error);
          setAiReasoning(
            error.message || 'AI file analysis is unavailable. Upload still works, but you need to choose the input area and tags manually.'
          );
          return;
        }

        if (data?.error) {
          setAiReasoning(data.error);
          return;
        }

        if (data?.suggested_tags?.length) {
          setSelectedTags((prev) => {
            const merged = new Set([...prev, ...data.suggested_tags]);
            return [...merged] as FileCategory[];
          });
        }

        if (data?.suggested_input_id && !inputId && inputs.some((input) => input.id === data.suggested_input_id)) {
          setInputId(data.suggested_input_id);
        }

        if (data?.reasoning) {
          setAiReasoning(data.reasoning);
        }
      } catch (err) {
        console.warn('AI analysis error:', err);
      } finally {
        if (!cancelled) setAnalyzing(false);
      }
    }

    analyze();
    return () => { cancelled = true; };
  }, [file, inputId, inputs]);

  // Suggest tags based on the selected input's group/sub_group
  const suggestedTags = useMemo(() => {
    const input = inputs.find((i) => i.id === inputId);
    if (!input) return [];
    const suggestions: FileCategory[] = [];
    if (input.sub_group.toLowerCase().includes('positioning')) suggestions.push('Positioning');
    if (input.sub_group.toLowerCase().includes('strategy')) suggestions.push('Strategy');
    if (input.sub_group.toLowerCase().includes('awareness')) suggestions.push('Brand', 'Marketing');
    if (input.group_key === 'market_evidence') suggestions.push('Customer Data', 'Research');
    if (input.input_key.includes('comp')) suggestions.push('Competitive');
    if (input.input_key.includes('financial') || input.input_key.includes('donor')) suggestions.push('Financial');
    return [...new Set(suggestions)];
  }, [inputId, inputs]);

  function toggleTag(tag: FileCategory) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function handleUpload() {
    if (!file || !inputId) return;
    setUploading(true);
    try {
      await uploadMutation.mutateAsync({ inputId, file, tags: selectedTags });
      toast.success(`Uploaded ${file.name}`);
      onOpenChange(false);
      setFile(null);
      setInputId(defaultInputId ?? '');
      setSelectedTags([]);
      setAiReasoning(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleOpenChange(v: boolean) {
    if (v && defaultInputId) setInputId(defaultInputId);
    if (!v) {
      setFile(null);
      setInputId(defaultInputId ?? '');
      setSelectedTags([]);
      setAiReasoning(null);
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[520px] border-[#dde6d1] bg-[#faf7f6] text-[#233c4b] shadow-[0_20px_60px_rgba(35,60,75,0.16)]">
        <DialogHeader>
          <DialogTitle className="font-serif text-[22px] text-[#233c4b]">Upload File</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* File picker */}
          <div>
            <label className="font-mono text-[10px] text-[#6e847f] uppercase tracking-[0.12em] block mb-2">
              FILE
            </label>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg" />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-[18px] border border-dashed py-4 text-center transition-colors cursor-pointer"
              style={{ borderColor: '#cfdace', background: '#ffffff' }}
            >
              {file ? (
                <span className="font-serif text-[15px]" style={{ color: '#233c4b' }}>{file.name}</span>
              ) : (
                <span className="font-serif text-[15px]" style={{ color: '#46606d' }}>Click to choose a file</span>
              )}
            </button>
          </div>

          {/* AI analysis status */}
          {analyzing && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-[16px] border" style={{ background: '#fffdf7', borderColor: '#e4d8ac' }}>
              <div className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor: '#c89b2b', borderTopColor: 'transparent' }} />
              <span className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: '#8a6b12' }}>Analyzing file content…</span>
            </div>
          )}

          {/* AI reasoning */}
          {aiReasoning && !analyzing && (
            <div className="px-3 py-3 rounded-[16px] border" style={{ background: '#ffffff', borderColor: '#dde6d1' }}>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: '#6e847f' }}>AI SUGGESTION</span>
              <p className="font-serif text-[13px] mt-1 leading-relaxed" style={{ color: '#46606d' }}>{aiReasoning}</p>
            </div>
          )}

          {/* Area picker */}
          <div>
            <label className="font-mono text-[10px] text-[#6e847f] uppercase tracking-[0.12em] block mb-2">
              BELONGS TO INPUT
            </label>
            <select
              value={inputId}
              onChange={(e) => setInputId(e.target.value)}
              className="w-full rounded-[16px] px-3 py-2.5 font-serif text-[14px] appearance-none cursor-pointer"
              style={{ background: '#ffffff', border: '1px solid #dde6d1', color: '#233c4b' }}
            >
              <option value="">Select an input area…</option>
              {groupedInputs.map(({ groupKey, items }) => {
                const group = items;
                if (!group.length) return null;
                return (
                  <optgroup key={groupKey} label={group[0].group_label}>
                    {group.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.input_label} — {i.sub_group}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          {/* Suggested tags */}
          {suggestedTags.length > 0 && (
            <div>
              <label className="font-mono text-[10px] text-[#6e847f] uppercase tracking-[0.12em] block mb-2">
                SUGGESTED TAGS
              </label>
              <div className="flex flex-wrap gap-2">
                {suggestedTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className="font-mono text-[11px] px-3 py-1 rounded-full border transition-colors cursor-pointer"
                    style={
                      selectedTags.includes(tag)
                        ? { background: '#233c4b', color: '#faf7f6', borderColor: '#233c4b' }
                        : { borderColor: '#dde6d1', color: '#46606d', background: '#ffffff' }
                    }
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* All tags */}
          <div>
            <label className="font-mono text-[10px] text-[#6e847f] uppercase tracking-[0.12em] block mb-2">
              TAGS
            </label>
            <div className="flex flex-wrap gap-2">
              {FILE_CATEGORIES.filter((t) => !suggestedTags.includes(t)).map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className="font-mono text-[11px] px-3 py-1 rounded-full border transition-colors cursor-pointer"
                  style={
                    selectedTags.includes(tag)
                      ? { background: '#233c4b', color: '#faf7f6', borderColor: '#233c4b' }
                      : { borderColor: '#dde6d1', color: '#46606d', background: '#ffffff' }
                  }
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Upload button */}
          <button
            onClick={handleUpload}
            disabled={!file || !inputId || uploading || analyzing}
            className="w-full rounded-[16px] py-3 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#233c4b', border: '1px solid #233c4b', color: '#faf7f6' }}
          >
            {uploading ? 'Uploading…' : analyzing ? 'Analyzing…' : 'Upload & Update Map'}
          </button>

          <p className="font-mono text-[10px] text-center -mt-1" style={{ color: '#6e847f' }}>
            Uploading evidence updates your scores and strategy map
          </p>
          <p className="font-mono text-[10px] text-center" style={{ color: '#6e847f' }}>
            File suggestions run on your local internal AI path, not the public research path.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
