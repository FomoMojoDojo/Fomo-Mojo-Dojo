import { useRef, useState } from 'react';
import type { InputItem } from '@/lib/types';
import { useUploadInputFile, useDeleteInputFile, getFileSignedUrl } from '@/hooks/useInputs';
import { useCompany } from '@/hooks/useCompany';
import { toast } from 'sonner';
import FileUploadDialog from '@/components/FileUploadDialog';
import { MetaBadge, ScoreChip, StateBadge, TierBadge } from '@/components/ui/semantic-badges';
import { visibleFileTags } from '@/lib/fileTags';

interface Props {
  input: InputItem;
  mojoScore: number;
  potentialScore: number;
  onClose: () => void;
}

const c = {
  bg: '#faf7f6',
  bgSub: '#ffffff',
  bgHover: '#f4efe8',
  line: '#dde6d1',
  lineFaint: '#ebe3d8',
  heading: '#233c4b',
  body: '#46606d',
  muted: '#6e847f',
  accent: '#233c4b',
};

const tierAccent: Record<string, string> = {
  high: '#e8c44a',
  med: '#d4804a',
  low: '#5aaa6a',
  done: '#5aaa6a',
};

const statusAccent: Record<string, string> = {
  complete: '#5aaa6a',
  partial: '#d4804a',
  gap: '#e85a4a',
  not_started: '#7a766e',
};

export default function InputSidePanel({ input, mojoScore, potentialScore, onClose }: Props) {
  const { activeCompany } = useCompany();
  const tier = input.impact_tier;
  const afterScore = mojoScore + input.score_impact;
  const circumference = 2 * Math.PI * 22;
  const filled = (input.completeness / 100) * circumference;
  const color = statusAccent[input.status];
  const accent = tierAccent[tier];
  const doneCount = input.subitems.filter((s) => s.done).length;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadInputFile();
  const deleteMutation = useDeleteInputFile();
  const [uploading, setUploading] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const statusTone =
    input.status === 'complete'
      ? 'designed'
      : input.status === 'gap' || input.status === 'not_started'
        ? 'gap'
        : 'served';
  const tierTone =
    tier === 'high' ? 'focus' : tier === 'med' ? 'monitor' : 'defer';

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadMutation.mutateAsync({
        inputId: input.id,
        inputKey: input.input_key,
        companyName: activeCompany?.name ?? "",
        file,
      });
      toast.success(`Uploaded ${file.name}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleFileClick(fileUrl: string) {
    const newTab = window.open('about:blank', '_blank');
    if (!newTab) {
      toast.error('Pop-up blocked. Allow pop-ups for this site to open files.');
      return;
    }
    newTab.opener = null;

    try {
      const url = await getFileSignedUrl(fileUrl);
      newTab.location.href = url;
    } catch {
      newTab.close();
      toast.error('Could not open file');
    }
  }

  async function handleDeleteFile(id: string, filePath: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await deleteMutation.mutateAsync({ id, filePath });
      toast.success('File removed');
    } catch {
      toast.error('Could not delete file');
    }
  }

  return (
    <div className="h-full flex flex-col w-[380px]" style={{ background: c.bg }}>
      {/* Header */}
      <div className="px-6 py-[22px] pb-4 relative" style={{ borderBottom: `1px solid ${c.line}` }}>
        <h3 className="font-sans text-[18px] font-bold leading-[1.2] pr-8" style={{ color: c.heading }}>
          {input.input_label}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <MetaBadge>{input.sub_group}</MetaBadge>
          <StateBadge tone={statusTone}>{input.status.replace('_', ' ')}</StateBadge>
          <TierBadge tone={tierTone}>{tier === 'done' ? 'Done' : `${tier} impact`}</TierBadge>
        </div>
          <button
          onClick={onClose}
          className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center transition-colors cursor-pointer text-sm"
          style={{ border: `1px solid ${c.line}`, color: c.muted, background: '#ffffff' }}
        >
          ✕
        </button>
      </div>

      {/* Score impact */}
      <div className="px-6 py-4" style={{ borderBottom: `1px solid ${c.line}` }}>
        <div className="flex items-start gap-4">
          <div style={{ minWidth: 64 }}>
            <span className="font-sans text-[38px] font-black leading-none" style={{ color: accent }}>
              {tier === 'done' ? '✓' : `+${input.score_impact.toFixed(1)}`}
            </span>
            <p className="font-mono text-[10px] uppercase mt-1" style={{ color: c.muted }}>
              {tier === 'done' ? 'already counted' : 'pts to score'}
            </p>
          </div>
          <div className="flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] mb-2" style={{ color: accent }}>
              SCORE IMPACT IF COMPLETE
            </p>
            <div className="relative h-[5px] rounded-[3px]" style={{ background: c.lineFaint }}>
              <div
                className="absolute left-0 top-0 h-[5px] rounded-l-[3px]"
                style={{ width: `${mojoScore}%`, background: '#c7d6d1' }}
              />
              {tier !== 'done' && (
                <div
                  className="absolute top-0 h-[5px] opacity-50"
                  style={{
                    left: `${mojoScore}%`,
                    width: `${input.score_impact}%`,
                    background: accent,
                  }}
                />
              )}
              <div
                className="absolute top-[-4px] w-[2px] h-[14px] rounded-sm"
                style={{ left: `${mojoScore}%`, background: accent }}
              />
            </div>
            <div className="flex justify-between mt-2">
              <span className="font-mono text-[12px]" style={{ color: c.heading }}>{mojoScore} Now</span>
              <span style={{ color: c.muted }}>→</span>
              <span className="font-mono text-[12px] font-medium" style={{ color: accent }}>
                {afterScore.toFixed(1)} After
              </span>
              <span className="font-mono text-[12px]" style={{ color: '#5aaa6a' }}>{potentialScore} Max</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ScoreChip label="Now" value={mojoScore} />
              <ScoreChip label="After" value={afterScore} />
              <ScoreChip label="Max" value={potentialScore} />
            </div>
            <p className="font-sans text-[12px] leading-[1.65] mt-[10px]" style={{ color: c.body }}>
              {input.description}
            </p>
          </div>
        </div>
      </div>

      {/* Completeness ring */}
      <div className="px-6 py-[18px] flex gap-4" style={{ borderBottom: `1px solid ${c.line}` }}>
        <div className="w-[58px] h-[58px] shrink-0">
          <svg viewBox="0 0 58 58" className="w-full h-full">
            <circle cx="29" cy="29" r="22" fill="none" stroke={c.lineFaint} strokeWidth="5" />
            <circle cx="29" cy="29" r="22" fill="none" stroke={color} strokeWidth="5"
              strokeDasharray={`${filled} ${circumference}`} strokeLinecap="round" transform="rotate(-90 29 29)" />
            <text x="29" y="31" textAnchor="middle" className="font-mono text-[13px]" fill={color}>
              {input.completeness}%
            </text>
          </svg>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase" style={{ color: c.muted }}>COMPLETENESS</p>
          <p className="font-sans text-[13px] leading-[1.65] mt-1" style={{ color: c.body }}>
            {doneCount} of {input.subitems.length} sub-items complete.
            {input.status !== 'complete' && ` The missing items are holding back your ${input.sub_group} score.`}
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 dark-scrollbar">
        {/* Checklist */}
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] pb-2 mb-3" style={{ color: c.muted, borderBottom: `1px solid ${c.line}` }}>
          CHECKLIST
        </p>
        {input.subitems.map((item, i) => (
          <div key={item.id} className="flex gap-3 py-[9px]" style={{ borderBottom: i < input.subitems.length - 1 ? `1px solid ${c.lineFaint}` : undefined }}>
            <div className="w-5 h-5 rounded-[5px] border-2 flex items-center justify-center shrink-0 mt-0.5"
              style={{ borderColor: item.done ? '#5aaa6a' : c.line, color: '#5aaa6a' }}
            >
              {item.done && <span className="text-[11px]">✓</span>}
            </div>
            <span className="font-sans text-[13px] leading-[1.45]"
              style={{ color: item.done ? c.muted : c.heading, textDecoration: item.done ? 'line-through' : undefined, opacity: item.done ? 0.72 : 1 }}
            >
              {item.name}
            </span>
          </div>
        ))}

        {/* Files */}
        <div className="flex items-center justify-between pb-2 mb-3 mt-5" style={{ borderBottom: `1px solid ${c.line}` }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: c.muted }}>
            LINKED FILES
          </p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.png,.jpg,.jpeg"
          />
          <button
            onClick={() => setUploadDialogOpen(true)}
            disabled={uploading}
            className="font-mono text-[10px] transition-colors cursor-pointer disabled:opacity-50"
            style={{ color: c.accent }}
          >
            {uploading ? 'Uploading…' : '+ Upload'}
          </button>
        </div>
        {input.files.length > 0 ? (
          input.files.map((file) => (
            <div
              key={file.id}
              onClick={() => handleFileClick(file.file_url)}
              className="flex items-center gap-3 p-[10px] px-3 rounded-[7px] cursor-pointer transition-colors mb-[6px]"
              style={{ background: c.bgSub, border: `1px solid ${c.lineFaint}` }}
            >
              <div className="w-[30px] h-[30px] rounded-[5px] flex items-center justify-center text-sm" style={{ background: c.lineFaint }}>📄</div>
              <div className="flex-1 min-w-0">
                <p className="font-sans text-[13px] truncate" style={{ color: c.accent }}>{file.file_name}</p>
                <div className="flex gap-1 mt-0.5 flex-wrap">
                  {visibleFileTags(file.tags, file.uploaded_at).map((tag) => (
                    <MetaBadge key={tag}>{tag}</MetaBadge>
                  ))}
                </div>
                <div className="mt-1">
                  <MetaBadge>{file.file_type}</MetaBadge>
                </div>
              </div>
              <button
                onClick={(e) => handleDeleteFile(file.id, file.file_url, e)}
                className="text-[11px] hover:text-red-400 transition-colors"
                style={{ color: c.muted }}
                title="Remove file"
              >
                ✕
              </button>
              <span className="text-[11px]" style={{ color: c.muted }}>↗</span>
            </div>
          ))
        ) : (
          <p className="font-sans text-[13px] py-[6px]" style={{ color: c.muted }}>No files attached yet.</p>
        )}

        {/* Why this matters */}
        <div className="mt-5 p-[13px] px-4 rounded-lg border-l-[3px]" style={{ background: c.bgSub, borderLeftColor: color }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] mb-2" style={{ color }}>
            WHY THIS MATTERS
          </p>
          <p className="font-sans text-[13px] leading-[1.7]" style={{ color: c.body }}>{input.why_it_matters}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-[14px]" style={{ borderTop: `1px solid ${c.line}` }}>
        <button
          onClick={() => setUploadDialogOpen(true)}
          disabled={uploading}
          className="w-full rounded-[7px] py-3 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors cursor-pointer disabled:opacity-50"
          style={{ background: c.bgSub, border: `1px solid ${c.line}`, color: c.accent }}
        >
          {uploading ? 'Uploading…' : '+ Add or Update this Input'}
        </button>
      </div>

      <FileUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        defaultInputId={input.id}
        companyId={activeCompany?.id}
        companyName={activeCompany?.name}
      />
    </div>
  );
}
