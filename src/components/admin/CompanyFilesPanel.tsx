import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, Upload, ExternalLink, Trash2, FolderDown } from "lucide-react";
import FileUploadDialog from "@/components/FileUploadDialog";
import { getFileSignedUrl, useDeleteInputFile, useInputs } from "@/hooks/useInputs";
import { toast } from "sonner";
import type { InputFile } from "@/lib/types";

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
  const { query } = useInputs(companyId);
  const deleteMutation = useDeleteInputFile();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [mirroring, setMirroring] = useState(false);
  const inputs = query.data ?? [];

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
      file.tags.forEach((tag) => tags.add(tag));
      if (file.subGroup) groups.add(file.subGroup);
    });
    return [...tags, ...groups].sort((a, b) => a.localeCompare(b));
  }, [allFiles]);

  const filteredFiles = useMemo(() => {
    if (!activeFilter) return allFiles;
    return allFiles.filter(
      (file) => file.tags.includes(activeFilter) || file.subGroup === activeFilter || file.groupLabel === activeFilter,
    );
  }, [activeFilter, allFiles]);

  const visibleFiles = mode === "preview" ? filteredFiles.slice(0, 8) : filteredFiles;
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
                          {file.tags.map((tag) => (
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

                      <div className="flex items-center gap-2">
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
                          disabled={deleteMutation.isPending}
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
