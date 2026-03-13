import { useState, useMemo } from 'react';
import TopNav from '@/components/layout/TopNav';
import { useInputs, getFileSignedUrl, useDeleteInputFile, useUpdateFileTags } from '@/hooks/useInputs';
import { FILE_CATEGORIES, type FileCategory } from '@/lib/fileCategories';
import FileUploadDialog from '@/components/FileUploadDialog';
import AiBoundaryNote from '@/components/AiBoundaryNote';
import { useDeepDiveAnalyses } from '@/hooks/useDeepDive';
import { useAuth } from '@/hooks/useAuth';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import { CheckCircle, Clock, AlertCircle } from 'lucide-react';
import type { InputFile } from '@/lib/types';

interface FileWithContext extends InputFile {
  inputLabel: string;
  groupLabel: string;
  subGroup: string;
  groupKey: string;
}

function TagEditor({ file, onClose }: { file: FileWithContext; onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>(file.tags ?? []);
  const updateTags = useUpdateFileTags();

  function toggle(tag: string) {
    setSelected((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  async function save() {
    try {
      await updateTags.mutateAsync({ id: file.id, tags: selected });
      toast.success('Tags updated');
      onClose();
    } catch {
      toast.error('Failed to update tags');
    }
  }

  return (
    <div className="mt-2 p-3 bg-cream border border-cream-dark rounded-lg" onClick={(e) => e.stopPropagation()}>
      <p className="font-mono text-[10px] text-t-faint uppercase tracking-[0.1em] mb-2">Select tags</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {FILE_CATEGORIES.map((tag) => (
          <button
            key={tag}
            onClick={() => toggle(tag)}
            className={`font-mono text-[10px] px-2.5 py-[3px] rounded-full border transition-colors cursor-pointer ${
              selected.includes(tag)
                ? 'bg-ink text-gold border-ink'
                : 'border-cream-dark text-t-muted hover:border-ink'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={updateTags.isPending}
          className="font-mono text-[10px] bg-ink text-gold px-3 py-1 rounded cursor-pointer hover:bg-ink-2 transition-colors disabled:opacity-50">
          {updateTags.isPending ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onClose} className="font-mono text-[10px] text-t-muted px-3 py-1 cursor-pointer hover:text-t-primary transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function FilesRepository() {
  const { query } = useInputs();
  const inputs = query.data;
  const deleteMutation = useDeleteInputFile();
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { data: dbAnalyses } = useDeepDiveAnalyses();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);

  // Map sub_group → area_key for analysis status
  const subGroupToArea: Record<string, string> = {
    'Positioning': 'positioning',
    'Strategy': 'strategy',
    'Service Delivery': 'product',
    'Awareness': 'marketing',
    'Referral Pipeline': 'sales',
    'Fundraising': 'sales',
    'Family Experience': 'cx',
  };

  const analyzedAreas = useMemo(() => {
    if (!dbAnalyses) return new Set<string>();
    return new Set(Object.keys(dbAnalyses));
  }, [dbAnalyses]);

  const allFiles = useMemo<FileWithContext[]>(() => {
    return (inputs ?? []).flatMap((input) =>
      input.files.map((f) => ({
        ...f,
        inputLabel: input.input_label,
        groupLabel: input.group_label,
        subGroup: input.sub_group,
        groupKey: input.group_key,
      }))
    );
  }, [inputs]);

  const usedTags = useMemo(() => {
    const set = new Set<string>();
    allFiles.forEach((f) => f.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [allFiles]);

  const filtered = activeFilter
    ? allFiles.filter((f) => f.tags.includes(activeFilter) || f.groupLabel === activeFilter || f.subGroup === activeFilter)
    : allFiles;

  const grouped = useMemo(() => {
    const map = new Map<string, FileWithContext[]>();
    filtered.forEach((f) => {
      const key = f.inputLabel;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    });
    return Array.from(map.entries());
  }, [filtered]);

  async function handleOpen(fileUrl: string) {
    try {
      const url = await getFileSignedUrl(fileUrl);
      window.open(url, '_blank');
    } catch {
      toast.error('Could not open file');
    }
  }

  async function handleDelete(id: string, filePath: string) {
    try {
      await deleteMutation.mutateAsync({ id, filePath });
      toast.success('File removed');
    } catch {
      toast.error('Could not delete file');
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: '#eae5db',
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='6' height='6' viewBox='0 0 6 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000' fill-opacity='0.025'%3E%3Cpath d='M5 0h1L0 5V4zM6 5v1H5z'/%3E%3C/g%3E%3C/svg%3E")`,
      }}
    >
      <TopNav />
      <div className="max-w-content mx-auto px-9 pt-7 pb-12">

        <div className="flex items-center justify-between mb-2">
          <h1 className="font-sans text-[28px] font-bold text-t-primary tracking-tight">
            File Repository
          </h1>
          <button
            onClick={() => setUploadOpen(true)}
            className="px-5 py-[9px] rounded-md bg-ink text-gold-light font-mono text-[11px] uppercase cursor-pointer hover:bg-ink-2 transition-colors"
          >
            + Upload File
          </button>
        </div>
        <p className="font-sans text-[14px] text-t-tertiary leading-[1.75] max-w-[580px] mb-6">
          {activeCompany?.name
            ? `All uploaded evidence files for ${activeCompany.name}, organized by input area and category.`
            : 'All uploaded evidence files organized by input area and category.'}
          {allFiles.length > 0 && ` ${allFiles.length} file${allFiles.length !== 1 ? 's' : ''} total.`}
        </p>

        <AiBoundaryNote
          label="Client-Local Analysis"
          tone="internal"
          className="mb-6 max-w-[720px]"
          detail="Files stay scoped to the selected client. File suggestions and deep-dive analysis use the local internal AI path, separate from the public web research flow."
        />

        {/* Recessed field */}
        <div
          className="rounded-2xl p-5 sm:p-6"
          style={{
            background: '#ddd8cd',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.07), inset 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >

        {/* Filter chips */}
        {usedTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setActiveFilter(null)}
              className={`font-mono text-[11px] px-3 py-1 rounded-full border transition-colors cursor-pointer ${
                !activeFilter ? 'bg-ink text-gold border-ink' : 'border-cream-dark text-t-muted hover:border-ink'
              }`}
            >
              All
            </button>
            {usedTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveFilter(tag === activeFilter ? null : tag)}
                className={`font-mono text-[11px] px-3 py-1 rounded-full border transition-colors cursor-pointer ${
                  activeFilter === tag ? 'bg-ink text-gold border-ink' : 'border-cream-dark text-t-muted hover:border-ink'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Files list */}
        {allFiles.length === 0 ? (
          <div className="bg-white/80 border border-[#ebe7e0] rounded-xl p-10 text-center shadow-sm">
            <div className="text-[40px] mb-3">📁</div>
            <p className="font-sans text-[15px] text-t-secondary font-semibold">No files uploaded yet.</p>
            <p className="font-sans text-[13px] text-t-muted mt-1">
              Upload files from any input panel or use the button above.
            </p>
          </div>
        ) : grouped.length === 0 ? (
          <p className="font-sans text-[14px] text-t-muted italic">No files match this filter.</p>
        ) : (
          <div className="border border-[#ebe7e0] rounded-lg overflow-hidden bg-white/80 shadow-sm">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_160px_120px_200px_80px] gap-3 px-4 py-2.5 bg-[#f0ede8] border-b border-[#ebe7e0]">
              <span className="font-mono text-[10px] text-t-faint uppercase tracking-[0.1em]">File</span>
              <span className="font-mono text-[10px] text-t-faint uppercase tracking-[0.1em]">Input Area</span>
              <span className="font-mono text-[10px] text-t-faint uppercase tracking-[0.1em]">Analysis</span>
              <span className="font-mono text-[10px] text-t-faint uppercase tracking-[0.1em]">Tags</span>
              <span className="font-mono text-[10px] text-t-faint uppercase tracking-[0.1em] text-right">Actions</span>
            </div>

            {/* Rows */}
            {filtered.map((file) => (
              <div key={file.id}>
                <div
                  className="grid grid-cols-[1fr_160px_120px_200px_80px] gap-3 px-4 py-3 border-b border-[#ebe7e0]/60 hover:bg-[#faf9f6] transition-colors group items-center"
                >
                  {/* File name */}
                  <div
                    className="flex items-center gap-3 min-w-0 cursor-pointer"
                    onClick={() => handleOpen(file.file_url)}
                  >
                    <span className="text-base shrink-0">📄</span>
                    <div className="min-w-0">
                      <p className="font-sans text-[13px] text-t-primary truncate group-hover:text-gold-dark transition-colors">
                        {file.file_name}
                      </p>
                      <p className="font-mono text-[9px] text-t-faint uppercase">{file.file_type}</p>
                    </div>
                  </div>

                  {/* Input area */}
                  <div className="min-w-0">
                    <p className="font-sans text-[12px] text-t-secondary truncate">{file.inputLabel}</p>
                    <p className="font-mono text-[9px] text-t-faint">{file.subGroup}</p>
                  </div>

                  {/* Analysis status */}
                  {(() => {
                    const areaKey = subGroupToArea[file.subGroup];
                    const isAnalyzed = areaKey && analyzedAreas.has(areaKey);
                    const isLoggedIn = !!user;
                    if (!isLoggedIn) return (
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} className="text-t-faint" />
                        <span className="font-mono text-[10px] text-t-faint">—</span>
                      </div>
                    );
                    if (isAnalyzed) return (
                      <div className="flex items-center gap-1.5" title="Included in AI analysis">
                        <CheckCircle size={13} className="text-forest" />
                        <span className="font-mono text-[10px] text-forest">Analyzed</span>
                      </div>
                    );
                    return (
                      <div className="flex items-center gap-1.5" title="Not yet included in AI analysis — run 'Analyze with AI' in the deep dive panel">
                        <AlertCircle size={13} className="text-gold-dark" />
                        <span className="font-mono text-[10px] text-gold-dark">Pending</span>
                      </div>
                    );
                  })()}

                  {/* Tags */}
                  <div className="flex gap-1 flex-wrap items-center">
                    {file.tags.length > 0 ? (
                      <>
                        {file.tags.map((tag) => (
                          <span key={tag} className="font-mono text-[9px] bg-[#ebe7e0] text-t-muted px-[6px] py-[1px] rounded-full">
                            {tag}
                          </span>
                        ))}
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingFileId(editingFileId === file.id ? null : file.id); }}
                          className="font-mono text-[9px] text-t-faint hover:text-gold-dark transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                        >
                          ✎
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingFileId(editingFileId === file.id ? null : file.id); }}
                        className="font-mono text-[10px] text-gold-dark hover:text-gold transition-colors cursor-pointer border border-dashed border-[#ebe7e0] px-2 py-[2px] rounded"
                      >
                        + Add tags
                      </button>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpen(file.file_url)}
                      className="font-mono text-[10px] text-t-faint hover:text-gold-dark transition-colors cursor-pointer"
                      title="Open"
                    >
                      ↗
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(file.id, file.file_url); }}
                      className="font-mono text-[10px] text-t-faint hover:text-danger transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Inline tag editor */}
                {editingFileId === file.id && (
                  <div className="px-4 pb-3 border-b border-[#ebe7e0]/60 bg-[#f0ede8]/50">
                    <TagEditor file={file} onClose={() => setEditingFileId(null)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        </div>{/* close recessed field */}
      </div>

      <FileUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </div>
  );
}
