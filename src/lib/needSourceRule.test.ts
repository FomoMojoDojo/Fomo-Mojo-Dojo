// B1 (operator ruling 2026-11-15, hold H4): a need is public only by the SOURCE of what it rests on.
//
// The upload dialog stamped needs from a third-party document `public_research`, and every need gate
// admitted them on the label alone, so a private upload's content could reach OpenAI through six
// click-started functions: propose-positioning-changes, propose-cascade-changes (row-shaped predicate,
// via the shared collector), propose-opportunity-changes, evaluate-opportunity-alignment,
// backfill-canonical-statements and assess-surface-drift (the subject gates).
//
// Every case below has a PLANTED row (marked public_research, resting on an upload) and a PUBLIC CONTROL
// (the same row with the source every live public need carries). The plant must be withheld and the
// control admitted — a rule that refused everything would fail the controls.
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  isExternalAdmissibleNeed, needRestsOnPrivateSource, NEED_SOURCE_COLUMNS,
} from "../../supabase/functions/_shared/externalProvenance.ts";
import {
  gateDriftSurfacesForExternal, gateSubjectForExternal, gateSubjectForLocal,
} from "../../supabase/functions/_shared/driftExternalGate.ts";
import { collectExternalNeeds } from "../../supabase/functions/_shared/externalNeeds.ts";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const PUBLIC_SOURCE = { source_path: "public_research", step_label: "", frameworks_used: [] as string[], interview_record_id: null, source_proposal_id: null };
const CONTROL = { id: "need-control", desired_outcome: "CONTROL public need", provenance_type: "public_research", operator_edited_at: null, journey_key: "customer", ...PUBLIC_SOURCE };
// The shape the upload dialog wrote: a third-party document's need, stamped public_research.
const PLANT = {
  ...CONTROL, id: "need-plant", desired_outcome: "PLANT upload-derived need",
  source_path: "3dbc2fad-0f11-4e3c-a9e7-ab02d88fefea/brand-narrative/report.pdf",
  step_label: "Upload-derived (Brand Narrative)", frameworks_used: ["JTBD", "Local Upload Analysis"],
};

describe("B1 — needRestsOnPrivateSource", () => {
  it("the public control rests on a public source", () => {
    expect(needRestsOnPrivateSource(CONTROL)).toBe(false);
  });
  it("the planted upload need rests on a private source", () => {
    expect(needRestsOnPrivateSource(PLANT)).toBe(true);
  });
  it("each private marker alone makes a public-pathed need private", () => {
    expect(needRestsOnPrivateSource({ ...CONTROL, source_path: "some/storage/path.pdf" })).toBe(true);
    expect(needRestsOnPrivateSource({ ...CONTROL, source_path: "interview" })).toBe(true);
    expect(needRestsOnPrivateSource({ ...CONTROL, source_path: "intake.quiz" })).toBe(true);
    expect(needRestsOnPrivateSource({ ...CONTROL, source_path: "" })).toBe(true);
    expect(needRestsOnPrivateSource({ ...CONTROL, source_path: null })).toBe(true);
    expect(needRestsOnPrivateSource({ ...CONTROL, interview_record_id: "rec-1" })).toBe(true);
    expect(needRestsOnPrivateSource({ ...CONTROL, source_proposal_id: "prop-1" })).toBe(true);
    expect(needRestsOnPrivateSource({ ...CONTROL, step_label: "Upload-derived (Customer)" })).toBe(true);
    expect(needRestsOnPrivateSource({ ...CONTROL, step_label: "Reanalyzed existing file (Customer)" })).toBe(true);
    expect(needRestsOnPrivateSource({ ...CONTROL, frameworks_used: ["Local Upload Analysis"] })).toBe(true);
    expect(needRestsOnPrivateSource({ ...CONTROL, frameworks_used: ["Existing File Reanalysis"] })).toBe(true);
  });
  it("the admin RE-RUN writer's needs are private too (source_path = the stored file, step_label 'Reanalyzed existing file')", () => {
    expect(needRestsOnPrivateSource({
      ...CONTROL, provenance_type: "manual", source_path: "co/area/file.pdf",
      step_label: "Reanalyzed existing file (Brand Narrative)", frameworks_used: ["Existing File Reanalysis"],
    })).toBe(true);
  });
  it("unselected source columns mean private (fail closed)", () => {
    for (const col of NEED_SOURCE_COLUMNS) {
      const row: Record<string, unknown> = { ...CONTROL };
      delete row[col];
      expect(needRestsOnPrivateSource(row), col).toBe(true);
    }
    expect(needRestsOnPrivateSource({ provenance_type: "public_research" })).toBe(true);
    expect(needRestsOnPrivateSource(null)).toBe(true);
    expect(needRestsOnPrivateSource(undefined)).toBe(true);
  });
});

describe("B1 — isExternalAdmissibleNeed tests the source first", () => {
  it("control admitted; plant withheld though stamped public_research", () => {
    expect(isExternalAdmissibleNeed(CONTROL)).toBe(true);
    expect(isExternalAdmissibleNeed(PLANT)).toBe(false);
  });
});

// A minimal PostgREST stand-in: every filter method returns the builder; awaiting it yields the rows.
function fakeNeedsDb(rows: unknown[]) {
  const selects: string[] = [];
  const builder: Record<string, unknown> = {};
  for (const m of ["eq", "not", "neq", "order"]) builder[m] = () => builder;
  builder.limit = () => Promise.resolve({ data: rows, error: null });
  builder.select = (cols: string) => { selects.push(cols); return builder; };
  return { db: { from: (_t: string) => builder }, selects };
}

describe("B1 — propose-positioning-changes / propose-cascade-changes (shared collector; the functions always call OpenAI, so unit-level)", () => {
  it("collectExternalNeeds withholds the plant, admits the control, counts the withheld row", async () => {
    const { db, selects } = fakeNeedsDb([CONTROL, PLANT]);
    const out = await collectExternalNeeds(db, "co");
    expect(out.externalNeeds.map((r) => r.id)).toEqual(["need-control"]);
    expect(out.needsWithheldExternal).toBe(1);
    for (const col of NEED_SOURCE_COLUMNS) expect(selects[0], col).toContain(col);
  });
  it("both propose functions collect through the shared collector, and nothing else reads odi_needs there", () => {
    for (const f of ["supabase/functions/propose-positioning-changes/index.ts", "supabase/functions/propose-cascade-changes/index.ts"]) {
      const src = read(f);
      expect(src, f).toMatch(/await collectExternalNeeds\(/);
      expect(src, f).not.toMatch(/from\("odi_needs"\)/);
    }
  });
});

const nullDb = null;
const subject = (row: typeof CONTROL, consumer: string) => ({
  supabase: nullDb, companyId: "co", surfaceType: "opportunity", surfaceId: row.id,
  provenance: row.provenance_type, operatorEditedAt: row.operator_edited_at,
  privateSource: needRestsOnPrivateSource(row), consumer,
});

describe("B1 — the subject gate (propose-opportunity-changes, evaluate-opportunity-alignment, backfill-canonical-statements)", () => {
  for (const consumer of ["propose-opportunity-changes", "evaluate-opportunity-alignment", "backfill-canonical-statements"]) {
    it(`${consumer}: plant refused, control admitted`, async () => {
      expect((await gateSubjectForExternal(subject(PLANT, consumer))).admissible).toBe(false);
      expect((await gateSubjectForExternal(subject(CONTROL, consumer))).admissible).toBe(true);
    });
  }
  it("XOR holds: the local lane admits the plant the external lane refused, and declines the control", async () => {
    expect((await gateSubjectForLocal(subject(PLANT, "evaluate-opportunity-alignment"))).admissible).toBe(true);
    expect((await gateSubjectForLocal(subject(CONTROL, "evaluate-opportunity-alignment"))).admissible).toBe(false);
  });
});

describe("B1 — the drift gate (assess-surface-drift opportunities)", () => {
  it("plant skipped, control kept", async () => {
    const out = await gateDriftSurfacesForExternal({
      supabase: nullDb, companyId: "co", surfaceType: "opportunity", rows: [CONTROL, PLANT],
      privateSource: (r) => needRestsOnPrivateSource(r), consumer: "assess-surface-drift",
    });
    expect(out.admissible.map((r) => r.id)).toEqual(["need-control"]);
    expect(out.excludedCount).toBe(1);
  });
});

describe("B1 — every need select feeding a gate carries the source columns (a caller that omits them fails)", () => {
  const FILES = [
    "supabase/functions/_shared/externalNeeds.ts",
    "supabase/functions/propose-opportunity-changes/index.ts",
    "supabase/functions/evaluate-opportunity-alignment/index.ts",
    "supabase/functions/backfill-canonical-statements/index.ts",
    "supabase/functions/assess-surface-drift/index.ts",
  ] as const;
  let found = 0;
  for (const file of FILES) {
    it(`${file}: odi_needs selects with provenance_type also select ${NEED_SOURCE_COLUMNS.join(", ")}`, () => {
      const lines = read(file).split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!/\.from\("odi_needs"\)/.test(lines[i])) continue;
        const sel = /\.select\(\s*\n?\s*"([^"]*)"/.exec(lines.slice(i, i + 5).join("\n"));
        if (!sel || !sel[1].includes("provenance_type")) continue;
        found++;
        for (const col of NEED_SOURCE_COLUMNS) {
          expect(sel[1], `${file}:${i + 1} odi_needs select omits ${col} — the gate would read it as private, or a future rule would fail open`).toContain(col);
        }
      }
    });
  }
  it("the scan found the gated need selects (not vacuous)", () => {
    expect(found).toBeGreaterThanOrEqual(FILES.length);
  });
  it("every need-subject gate call passes privateSource from the row", () => {
    for (const file of FILES.slice(1)) {
      expect(read(file), file).toMatch(/needRestsOnPrivateSource\(/);
    }
  });
});
