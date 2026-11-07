// ── E4e (ruling, 2026-11-07): the Q1 invariant suite, extended to all NINE outside-calling functions
//
// Q1 pinned research-company's payload because its cleanliness was true by accident. The D3/P1b
// investigation then found the same accident unguarded in nine more places — and two real breaches:
//
//   1. FOUR functions sent a "Client-stated strategic problems" block built from
//      strategy_problem_statements + strategy_assumptions, the exact two tables research-company has
//      held out since Option B Phase 1. The same material cannot be withheld from one caller and
//      sent by another.
//   2. THREE functions selected route prose with neither provenance_type nor operator_edited_at and
//      passed it straight into the prompt — the only block in those functions that bypassed their own
//      gates. (D3 named two; refresh-positioning was the third, found here.)
//
// These tests are SOURCE-SHAPE tests, like externalNeedsGate.test.ts and
// researchCompanyPayloadInvariants.test.ts before them: the property is "this block cannot carry
// stored internal rows", which is a fact about the code. Each asserts BOTH the shape that must hold
// AND the absence of the shape that would break it, so neither can pass vacuously.
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (fn: string) => fs.readFileSync(path.join(ROOT, `supabase/functions/${fn}/index.ts`), "utf8");

/** Every function that makes an outside (OpenAI) call. research-company has its own suite. */
const THE_NINE = [
  "propose-positioning-changes",
  "propose-cascade-changes",
  "propose-route-changes",
  "propose-opportunity-changes",
  "assess-surface-drift",
  "council-review",
  "backfill-canonical-statements",
  "refresh-positioning",
  "refresh-cascade",
] as const;

/** The four that read strategy_problem_statements / strategy_assumptions. */
const PROBLEM_BRIEF_SENDERS = [
  "propose-positioning-changes",
  "propose-cascade-changes",
  "refresh-positioning",
  "refresh-cascade",
] as const;

/** The three whose route block reaches a prompt ungated before E4c. refresh-cascade already gated
 *  its own, so it is asserted separately below rather than exempted. */
const ROUTE_BLOCK_SENDERS = [
  "propose-positioning-changes",
  "propose-cascade-changes",
  "refresh-positioning",
] as const;

describe("E4b — client-stated problems and assumptions never reach an external prompt", () => {
  for (const fn of PROBLEM_BRIEF_SENDERS) {
    it(`${fn}: the brief is "" and both builders are voided`, () => {
      const src = read(fn);
      // The holdout, in research-company's exact shape so one grep finds every instance.
      expect(src).toMatch(/const strategicProblemBrief = "";/);
      expect(src).toMatch(/void buildStrategicProblemBrief;\s*void buildStrategicAssumptionBrief;/);
      // The breach shape: a brief actually built from the normalized rows.
      expect(src).not.toMatch(/strategicProblemBrief = \[\s*\n\s*buildStrategicProblemBrief\(/);
      expect(src).not.toMatch(/strategicProblemBrief: buildStrategicProblemBrief\(/);
    });
  }

  it("no function outside research-company builds that brief into a prompt", () => {
    // Fleet-wide sweep, so a NEW function cannot reintroduce it unnoticed.
    const dir = path.join(ROOT, "supabase/functions");
    const offenders: string[] = [];
    for (const fn of fs.readdirSync(dir)) {
      const p = path.join(dir, fn, "index.ts");
      if (fn === "_shared" || fn === "research-company" || !fs.existsSync(p)) continue;
      const src = fs.readFileSync(p, "utf8");
      if (!src.includes("Client-stated strategic problems")) continue;
      // It may MENTION the heading only if the value it interpolates is the held-out "".
      if (!/const strategicProblemBrief = "";/.test(src)) offenders.push(fn);
    }
    expect(offenders).toEqual([]);
  });
});

describe("E4c — route prose reaching a prompt is gated on provenance AND operator authorship", () => {
  for (const fn of ROUTE_BLOCK_SENDERS) {
    it(`${fn}: selects both columns, filters through the ONE predicate, reports the withheld count`, () => {
      const src = read(fn);
      expect(src).toMatch(/import \{ isSubjectExternallyAdmissible \} from "\.\.\/_shared\/externalProvenance\.ts"/);
      expect(src).toMatch(/const externalRoutes = allRouteRows\.filter\(\(r\) =>\s*\n\s*isSubjectExternallyAdmissible\(/);
      expect(src).toMatch(/const routesWithheldExternal = allRouteRows\.length - externalRoutes\.length;/);
      expect(src).toMatch(/routes_withheld_external/);
      // The summary must be built from the FILTERED set — the whole point.
      expect(src).toMatch(/const routesSummary = externalRoutes\.slice\(/);
      // And the raw rows must not reach it any more.
      expect(src).not.toMatch(/const routesSummary = \(Array\.isArray\(routeRows\)/);
      expect(src).not.toMatch(/const routesSummary = routes\.slice\(/);
    });

    it(`${fn}: the routes select carries provenance_type and operator_edited_at`, () => {
      const src = read(fn);
      const m = /\.from\("routes"\)[\s\S]{0,160}?\.select\("([^"]*)"\)/.exec(src);
      expect(m, `${fn}: no routes select found`).not.toBeNull();
      expect(m![1]).toContain("provenance_type");
      expect(m![1]).toContain("operator_edited_at");
    });
  }

  it("refresh-cascade's route block was already gated and stays gated", () => {
    // The counter-example that proves the rule was reachable before E4c, not a new invention.
    const src = read("refresh-cascade");
    const m = /\.from\("routes"\)[\s\S]{0,200}?\.select\("([^"]*)"\)/.exec(src);
    expect(m![1]).toContain("provenance_type");
    expect(m![1]).toContain("operator_edited_at");
    expect(src).toMatch(/isDriftSurfaceExternallyAdmissible\(/);
  });
});

describe("E4d — every outside call is ledgered", () => {
  for (const fn of THE_NINE) {
    it(`${fn}: onUsage → recordModelCall with its own callSite`, () => {
      const src = read(fn);
      expect(src).toMatch(/import \{ recordModelCall, openaiRecord \} from "\.\.\/_shared\/recordModelCall\.ts"/);
      expect(src).toMatch(/onUsage: \(usedModel, usage\) =>/);
      expect(src).toMatch(/usage: openaiRecord\(usedModel, usage\),/);
      expect(src).toMatch(new RegExp(`callSite: "${fn}"`));
    });
  }

  it("every callOpenAIJSON call site in the nine passes onUsage — none is unledgered", () => {
    for (const fn of THE_NINE) {
      const src = read(fn);
      // Count real call sites (not the import, not a private definition's signature).
      const sites = [...src.matchAll(/(?:await |= )callOpenAIJSON\(\{/g)].length;
      const hooks = [...src.matchAll(/onUsage: \(usedModel, usage\) =>/g)].length;
      expect(hooks, `${fn}: ${sites} call site(s) but ${hooks} ledger hook(s)`).toBeGreaterThanOrEqual(sites);
    }
  });

  it("the two private OpenAI clients fire the hook BEFORE parsing", () => {
    // A call billed but unparseable must still appear in the ledger. research-company and
    // council-review each carry their own copy of the client.
    for (const p of ["supabase/functions/council-review/index.ts", "supabase/functions/research-company/index.ts"]) {
      const src = fs.readFileSync(path.join(ROOT, p), "utf8");
      expect(src, p).toMatch(/await reportUsage\((?:model|activeModel), (?:payload|data)\);/);
    }
  });
});

describe("E4f — the stale baseline label is gone", () => {
  it("no function claims its public baseline context is 'augmented with uploaded files'", () => {
    // The content was always the public baseline run; the LABEL invited the opposite conclusion.
    const dir = path.join(ROOT, "supabase/functions");
    const offenders: string[] = [];
    for (const fn of fs.readdirSync(dir)) {
      const p = path.join(dir, fn, "index.ts");
      if (!fs.existsSync(p)) continue;
      if (fs.readFileSync(p, "utf8").includes("augmented with uploaded files")) offenders.push(fn);
    }
    expect(offenders).toEqual([]);
  });
});
