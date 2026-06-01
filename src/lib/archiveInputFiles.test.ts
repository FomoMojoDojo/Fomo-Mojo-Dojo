import { describe, it, expect } from "vitest";

// Unit tests for archive behavior logic.
// These test the filter rules and helper logic without hitting the database.
// Database behavior is covered by the rehydration SQL and bulk archive SQL verification.

interface FileRow {
  id: string;
  file_name: string;
  uploaded_at: string;
  archived_at: string | null;
  archive_reason: string | null;
  archive_source: string | null;
  restored_at: string | null;
  company_id?: string;
}

function isActive(f: FileRow) {
  return f.archived_at === null;
}

function archive(f: FileRow, reason: string, source: string): FileRow {
  return { ...f, archived_at: new Date().toISOString(), archive_reason: reason, archive_source: source, restored_at: null };
}

function restore(f: FileRow, restoredBy?: string): FileRow {
  return {
    ...f,
    archived_at: null,
    archived_by: undefined,
    archive_reason: null,
    archive_source: null,
    restored_at: new Date().toISOString(),
    ...(restoredBy ? { restored_by: restoredBy } : {}),
  };
}

function filterActive(files: FileRow[]) {
  return files.filter(isActive);
}

function filterArchived(files: FileRow[]) {
  return files.filter((f) => !isActive(f));
}

function archiveOlderThan(files: FileRow[], days: number, source: string, company_id: string): FileRow[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return files.map((f) => {
    if (f.company_id !== company_id) return f;
    if (f.archived_at !== null) return f;
    if (new Date(f.uploaded_at) < cutoff) {
      return archive(f, 'older_than_10_days', source);
    }
    return f;
  });
}

const CAFE_BARRA_ID = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
const OTHER_COMPANY_ID = "fda00001-face-4000-9000-fda000000001";

function makeFile(overrides: Partial<FileRow> = {}): FileRow {
  return {
    id: "file-1",
    file_name: "test.pdf",
    uploaded_at: new Date().toISOString(),
    archived_at: null,
    archive_reason: null,
    archive_source: null,
    restored_at: null,
    company_id: CAFE_BARRA_ID,
    ...overrides,
  };
}

describe("archive input files — filter logic", () => {
  it("active files have archived_at = null", () => {
    const f = makeFile();
    expect(isActive(f)).toBe(true);
  });

  it("archived files have archived_at set", () => {
    const f = archive(makeFile(), "user_removed", "ui");
    expect(isActive(f)).toBe(false);
    expect(f.archive_reason).toBe("user_removed");
    expect(f.archive_source).toBe("ui");
  });

  it("archive does not delete the file row — id preserved", () => {
    const original = makeFile({ id: "abc-123" });
    const archived = archive(original, "user_removed", "ui");
    expect(archived.id).toBe("abc-123");
    expect(archived.file_name).toBe(original.file_name);
  });

  it("filterActive excludes archived files", () => {
    const f1 = makeFile({ id: "f1" });
    const f2 = archive(makeFile({ id: "f2" }), "user_removed", "ui");
    const f3 = makeFile({ id: "f3" });
    const active = filterActive([f1, f2, f3]);
    expect(active.map((f) => f.id)).toEqual(["f1", "f3"]);
  });

  it("filterArchived returns only archived files", () => {
    const f1 = makeFile({ id: "f1" });
    const f2 = archive(makeFile({ id: "f2" }), "older_than_10_days", "phase_78d");
    const archived = filterArchived([f1, f2]);
    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe("f2");
  });

  it("restore brings archived file back to active", () => {
    const archived = archive(makeFile({ id: "r1" }), "user_removed", "ui");
    expect(isActive(archived)).toBe(false);
    const restored = restore(archived);
    expect(isActive(restored)).toBe(true);
    expect(restored.archived_at).toBeNull();
    expect(restored.archive_reason).toBeNull();
    expect(restored.restored_at).not.toBeNull();
  });

  it("restore sets restored_at timestamp", () => {
    const f = restore(archive(makeFile(), "user_removed", "ui"));
    expect(typeof f.restored_at).toBe("string");
    expect(new Date(f.restored_at!).getTime()).toBeGreaterThan(0);
  });
});

describe("bulk archive — older than N days", () => {
  const now = new Date();
  const dayMs = 86400 * 1000;

  const recent = makeFile({ id: "recent", uploaded_at: new Date(now.getTime() - 3 * dayMs).toISOString() });
  const old1 = makeFile({ id: "old1", uploaded_at: new Date(now.getTime() - 15 * dayMs).toISOString() });
  const old2 = makeFile({ id: "old2", uploaded_at: new Date(now.getTime() - 30 * dayMs).toISOString() });
  const otherCompany = makeFile({ id: "other", uploaded_at: new Date(now.getTime() - 20 * dayMs).toISOString(), company_id: OTHER_COMPANY_ID });

  it("archives files older than 10 days for the target company", () => {
    const result = archiveOlderThan([recent, old1, old2, otherCompany], 10, "phase_78d", CAFE_BARRA_ID);
    const activeIds = result.filter(isActive).map((f) => f.id);
    expect(activeIds).toContain("recent");
    expect(activeIds).not.toContain("old1");
    expect(activeIds).not.toContain("old2");
  });

  it("does not archive files from other companies", () => {
    const result = archiveOlderThan([recent, old1, otherCompany], 10, "phase_78d", CAFE_BARRA_ID);
    const otherResult = result.find((f) => f.id === "other")!;
    expect(isActive(otherResult)).toBe(true);
  });

  it("does not re-archive already-archived files", () => {
    const alreadyArchived = archive(makeFile({ id: "pre", uploaded_at: new Date(now.getTime() - 20 * dayMs).toISOString() }), "pre_existing", "ui");
    const result = archiveOlderThan([alreadyArchived], 10, "phase_78d", CAFE_BARRA_ID);
    expect(result[0].archive_reason).toBe("pre_existing");
  });

  it("sets correct archive_source on bulk archive", () => {
    const result = archiveOlderThan([old1], 10, "phase_78d_cafe_barra_cleanup", CAFE_BARRA_ID);
    expect(result[0].archive_source).toBe("phase_78d_cafe_barra_cleanup");
    expect(result[0].archive_reason).toBe("older_than_10_days");
  });

  it("recent file (within 10 days) stays active", () => {
    const result = archiveOlderThan([recent], 10, "phase_78d", CAFE_BARRA_ID);
    expect(isActive(result[0])).toBe(true);
  });
});

describe("regeneration source rule", () => {
  const files = [
    makeFile({ id: "a1", file_name: "Strategic_Framework.pdf" }),
    archive(makeFile({ id: "a2", file_name: "Old_Deck.pdf" }), "older_than_10_days", "phase_78d"),
    makeFile({ id: "a3", file_name: "Positioning.pdf" }),
  ];

  it("regeneration uses active files only by default", () => {
    const activeForRegen = filterActive(files);
    expect(activeForRegen.map((f) => f.id)).toEqual(["a1", "a3"]);
    expect(activeForRegen.find((f) => f.id === "a2")).toBeUndefined();
  });

  it("archived files excluded from regeneration source list", () => {
    const source = filterActive(files);
    expect(source.every(isActive)).toBe(true);
  });

  it("source note: active file count matches", () => {
    const activeFiles = filterActive(files);
    const sourceNote = `Using active evidence files only. (${activeFiles.length} file${activeFiles.length !== 1 ? "s" : ""})`;
    expect(sourceNote).toBe("Using active evidence files only. (2 files)");
  });
});
