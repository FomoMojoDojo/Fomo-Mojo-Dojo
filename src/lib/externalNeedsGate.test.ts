// Gate 0 (operator ruling 2026-09-16) — no odi_needs row outside the external-admissible allowlist ever
// enters an OpenAI payload from propose-positioning-changes, propose-cascade-changes or council-review.
// The ONE predicate is isExternalAdmissibleNeed (_shared/externalProvenance.ts), applied at each
// function's need-collection point. This guard is non-vacuous on both sides: a planted fixture with one
// public_research need, one internal_declared need and one need carrying an unknown provenance string
// must yield a context that contains the public text and NEITHER of the other two; and each function's
// source must feed its context builder from the filtered set only and report needs_withheld_external.
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { EXTERNAL_ADMISSIBLE_PROVENANCE, isExternalAdmissibleNeed } from "../../supabase/functions/_shared/externalProvenance.ts";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const PUBLIC_TEXT = "Minimize the time to confirm a program fits the child (public)";
const DECLARED_TEXT = "Minimize the wait for a first appointment (declared, internal)";
const UNKNOWN_TEXT = "Minimize the effort to reach a clinician (unknown provenance)";
const FIXTURE = [
  { id: "n-public", desired_outcome: PUBLIC_TEXT, provenance_type: "public_research" },
  { id: "n-declared", desired_outcome: DECLARED_TEXT, provenance_type: "internal_declared" },
  { id: "n-unknown", desired_outcome: UNKNOWN_TEXT, provenance_type: "stakeholder_interview" }, // does not exist on the enum yet
  { id: "n-null", desired_outcome: "Minimize (null provenance)", provenance_type: null },
];

// The collection-point expression every function uses — the context builders receive ONLY this.
const collect = <T extends { provenance_type?: string | null }>(rows: T[]) => rows.filter(isExternalAdmissibleNeed);

describe("Gate 0 — the predicate", () => {
  it("allowlist is exactly the existing external-admissible set", () => {
    expect([...EXTERNAL_ADMISSIBLE_PROVENANCE].sort()).toEqual(["public_baseline", "public_research"]);
  });
  it("admits public_research; withholds internal_declared, an unknown string, NULL, and every other enum value", () => {
    expect(isExternalAdmissibleNeed({ provenance_type: "public_research" })).toBe(true);
    for (const p of ["internal_declared", "stakeholder_interview", "manual", "framework_adjudicated", "odi_survey", "internal_hypothesis", "", null, undefined]) {
      expect(isExternalAdmissibleNeed({ provenance_type: p }), String(p)).toBe(false);
    }
    expect(isExternalAdmissibleNeed(null)).toBe(false);
  });
});

describe("Gate 0 — the assembled external context (fixture)", () => {
  it("contains the public need's text and NEITHER the declared nor the unknown-provenance text", () => {
    const admitted = collect(FIXTURE);
    const context = admitted.map((r) => r.desired_outcome).join("\n");
    expect(context).toContain(PUBLIC_TEXT);
    expect(context).not.toContain(DECLARED_TEXT);
    expect(context).not.toContain(UNKNOWN_TEXT);
    expect(context).not.toContain("null provenance");
    expect(FIXTURE.length - admitted.length).toBe(3); // needs_withheld_external
  });
});

describe("Gate 0 — the three collectors (source guard)", () => {
  const cases: Array<{ file: string; builderCall: RegExp }> = [
    { file: "supabase/functions/propose-positioning-changes/index.ts", builderCall: /buildOpportunityBrief\(externalNeeds\)/ },
    { file: "supabase/functions/propose-cascade-changes/index.ts", builderCall: /buildOpportunityBrief\(externalNeeds\)/ },
    { file: "supabase/functions/council-review/index.ts", builderCall: /odi_needs:\s*externalNeeds\.map\(/ },
  ];
  for (const c of cases) {
    it(`${c.file}: filters at the collection point with the ONE predicate, feeds the builder from the filtered set, reports the withheld count`, () => {
      const src = read(c.file);
      expect(src).toMatch(/import \{[^}]*\bisExternalAdmissibleNeed\b[^}]*\} from "\.\.\/_shared\/externalProvenance\.ts"/);
      expect(src).toMatch(/const externalNeeds = [^\n]*\.filter\(isExternalAdmissibleNeed\)/);
      expect(src).toMatch(c.builderCall);
      expect(src).toMatch(/needs_withheld_external/);
      // the raw rows never reach the builder
      expect(src).not.toMatch(/buildOpportunityBrief\(opportunityRows/);
      expect(src).not.toMatch(/odi_needs:\s*odiNeeds\.map\(/);
    });
  }
  it("no other edge function builds an OpenAI payload from odi_needs without a gate (callers census)", () => {
    const dir = path.join(ROOT, "supabase/functions");
    const offenders: string[] = [];
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name, "index.ts");
      if (!fs.existsSync(p)) continue;
      const src = fs.readFileSync(p, "utf8");
      const external = /openaiClient\.ts|api\.openai\.com/.test(src);
      const readsNeeds = /from\("odi_needs"\)|"odi_needs",\s*companyId/.test(src);
      if (!external || !readsNeeds) continue;
      const gated = /isExternalAdmissibleNeed|gateSubjectForExternal|gateDriftSurfacesForExternal|non_public_provenance/.test(src);
      if (!gated) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });
});
