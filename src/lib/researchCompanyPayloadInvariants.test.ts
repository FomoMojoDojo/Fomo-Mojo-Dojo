// ── Q1 (ruling, signed 2026-11-06): research-company STAYS EXTERNAL, and these tests are why ────
//
// The P1 investigation found that research-company's OpenAI payload carries no client-provided
// material — but that it was true by ACCIDENT, not by rule. Five unrelated local decisions happened
// to hold the line: a hardcoded `""`, a `void` statement, one `.eq("source_type","public_baseline_run")`,
// an unused `.brief` field, and the fact that every review block is a draft the model itself just
// produced. Nothing asserted the conjunction, so any one of them could be undone by an edit that
// looked unrelated and no test would fail.
//
// ONE TEST PER BLOCK of the §2 payload table. Each one fails if its block starts loading stored or
// client-provided rows. They are SOURCE-SHAPE tests on purpose: the property being protected is
// "this variable is a draft, not a query result", which is a fact about the code, not about any run.
// The precedent is src/lib/externalNeedsGate.test.ts, which guards its three collectors the same way.
//
// WHAT WOULD MAKE THESE VACUOUS: a test that only asserted a string is present would pass against a
// file that also loaded stored rows. So each block asserts BOTH the shape that must hold AND the
// absence of the DB-read shape that would break it.
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const RC = "supabase/functions/research-company/index.ts";
const src = fs.readFileSync(path.join(ROOT, RC), "utf8");

/** The review payload's blocks, as passed to runAllDraftReviews at both call sites. */
const REVIEW_BLOCKS = [
  "baselineBrief",
  "strategicProblemBrief",
  "odiBrief",
  "inputs",
  "journeys",
  "opportunities",
  "routes",
  "knownTensions",
] as const;

describe("Q1 — research-company's outside payload carries no stored or client-provided rows", () => {
  it("block: strategicProblemBrief is the empty string, and the builder is never called", () => {
    // The rows ARE read (for the local §9 score) — what must never happen is the brief being built
    // from them and handed to OpenAI.
    expect(src).toMatch(/const strategicProblemBrief = "";/);
    expect(src).toMatch(/void buildStrategicProblemBrief;/);
    // If this ever becomes a real call, the brief carries client-stated problems into the prompt.
    expect(src).not.toMatch(/strategicProblemBrief = buildStrategicProblemBrief\(/);
    expect(src).not.toMatch(/strategicProblemBrief: buildStrategicProblemBrief\(/);
  });

  // Each of these five is assigned from THIS RUN's OpenAI result, never from a select.
  const DRAFT_BLOCKS: Array<{ name: string; assignment: RegExp }> = [
    { name: "inputs", assignment: /let inputs: any\[\] = INPUT_KEYS\.map\(\(k\) => byKey\[k\]\)/ },
    { name: "journeys", assignment: /let journeys: any\[\] = Array\.isArray\(journeysResult\?\.journeys\)/ },
    { name: "opportunities", assignment: /let opportunities: any\[\] = Array\.isArray\(oppsResult\?\.opportunities\)/ },
    { name: "routes", assignment: /let routes: any\[\] = Array\.isArray\(routesResult\?\.routes\)/ },
    { name: "knownTensions", assignment: /let knownTensions: any\[\] = Array\.isArray\(routesResult\?\.known_tensions\)/ },
  ];
  for (const b of DRAFT_BLOCKS) {
    it(`block: ${b.name} is an in-run draft, not a stored row`, () => {
      expect(src).toMatch(b.assignment);
      // The draft must not be reassigned from a DB read before the reviewers see it.
      const reassignFromSelect = new RegExp(`${b.name}\\s*=\\s*\\(?\\s*(await\\s+)?(supabase|db)\\s*\\n?\\s*\\.from\\(`);
      expect(src).not.toMatch(reassignFromSelect);
      const reassignFromData = new RegExp(`${b.name}\\s*=\\s*\\(\\s*\\w*[Rr]ows\\s*\\?\\?`);
      expect(src).not.toMatch(reassignFromData);
    });
  }

  it("block: managed_outcomes is an in-run draft, and its repair stage is fed the draft", () => {
    expect(src).toMatch(/let managedOutcomes = Array\.isArray\(managedOutcomesResult\?\.outcomes\)/);
    // The repair stage receives the in-memory draft, NOT a re-read of the table.
    expect(src).toMatch(/outcomes: managedOutcomes,/);
    expect(src).not.toMatch(/managedOutcomes\s*=\s*\(?\s*(await\s+)?supabase\s*\n?\s*\.from\("managed_outcomes"\)/);
  });

  it("block: odiBrief is built from the public baseline's lens_card and the opportunities draft only", () => {
    // buildODIBrief's whole input surface, asserted at the definition.
    expect(src).toMatch(/function buildODIBrief\(args: \{\s*\n\s*baselineResultJson: unknown;\s*\n\s*customerJourneyTitle\?: string;\s*\n\s*opportunities: unknown;\s*\n\s*\}\)/);
    // It reads lens_card off the baseline and nothing else from storage — no supabase handle at all.
    const body = src.slice(src.indexOf("function buildODIBrief("));
    const bodyOnly = body.slice(0, body.indexOf("\nconst reviewSchema"));
    expect(bodyOnly).toMatch(/lens_card/);
    expect(bodyOnly).not.toMatch(/\.from\(/);
    expect(bodyOnly).not.toMatch(/await /);
    // And the call site passes only those three.
    expect(src).toMatch(/const odiBrief = buildODIBrief\(\{\s*\n\s*baselineResultJson: effectiveBaselineResultJson,\s*\n\s*customerJourneyTitle:[^\n]*\n\s*opportunities,\s*\n\s*\}\);/);
  });

  it("block: baselineBrief's store supplement admits public_baseline_run signals ONLY", () => {
    // The candidate query lives in the shared module; the restriction is the whole protection.
    const supp = fs.readFileSync(path.join(ROOT, "supabase/functions/_shared/storeSupplement.ts"), "utf8");
    expect(supp).toMatch(/\.eq\("source_type", "public_baseline_run"\)/);
    // Any widening of that allowlist — or its removal — would let an uploaded signal into the brief.
    expect(supp).not.toMatch(/\.in\("source_type",/);
    // And the brief is assembled from the baseline + that supplement, nothing else.
    expect(src).toMatch(/const baselineBrief = \[\s*\n\s*baselineContextIntro,\s*\n\s*buildBaselineBrief\(effectiveBaselineResultJson, claimProvenance\),\s*\n\s*buildStoreSupplementBrief\(storeSupplement\),\s*\n\s*\]/);
  });

  it("block: uploadedEvidenceContext.brief never enters a prompt", () => {
    // The context object is used for its COUNT only. `.brief` must appear nowhere outside a comment.
    const briefUses = src
      .split("\n")
      .filter((l) => /uploadedEvidenceContext\s*\.\s*brief/.test(l))
      .filter((l) => !l.trim().startsWith("//"));
    expect(briefUses).toEqual([]);
    expect(src).toMatch(/uploadedEvidenceContext\.fileCount/);
  });

  it("every review block named in the §2 table is still the set passed to the reviewers", () => {
    // If a block is ADDED to the payload, this fails — a new block has no invariant test yet, and
    // that is exactly when one is needed.
    const callSites = src.split("runAllDraftReviews({").slice(1);
    expect(callSites.length).toBe(2); // the first pass and the re-review after the finalizer
    for (const site of callSites) {
      const args = site.slice(0, site.indexOf("}));"));
      const named = REVIEW_BLOCKS.filter((b) => new RegExp(`(^|[\\s,{])${b}[,:]`, "m").test(args));
      expect(named.sort()).toEqual([...REVIEW_BLOCKS].sort());
      // No block may be introduced that this suite does not cover.
      const extras = [...args.matchAll(/^\s{6,8}(\w+)[,:]/gm)]
        .map((m) => m[1])
        .filter((k) => !["apiKey", "model", "companyName", "website", "onUsage", "positioning", "strategy"].includes(k))
        .filter((k) => !(REVIEW_BLOCKS as readonly string[]).includes(k));
      expect(extras).toEqual([]);
    }
  });
});

// ── Q7 plant P1 (as amended by the ruling) ──────────────────────────────────────────────────────
// research-company STAYS EXTERNAL for a walled company. The Option B door (Q4) is deliberately NOT
// fitted here: the payload carries no client-provided material (every block above), so the
// material-level law permits the call even for a company that also holds an upload. This test is
// what makes that a decision rather than an omission — it fails if a door is added without a ruling,
// and it fails if the payload composition that justifies the exemption is ever broken (the blocks
// above are its preconditions).
describe("Q7 P1 — research-company stays external, and the payload is why", () => {
  it("no Option B door is fitted to research-company", () => {
    expect(src).not.toMatch(/optionBDoor/);
    expect(src).not.toMatch(/companyHasClientProvidedMaterial/);
  });

  it("its OpenAI calls are ledgered, so 'stays external' is also 'stays accounted for' (Q5)", () => {
    // Q5: the function wrote zero model_calls rows before this ruling. Every stage that calls
    // OpenAI now reports its usage through the one writer.
    expect(src).toMatch(/import \{ recordModelCall, openaiRecord \} from "\.\.\/_shared\/recordModelCall\.ts"/);
    expect(src).toMatch(/const makeUsageLedger = \(stage: string\): UsageHook =>/);
    expect(src).toMatch(/callSite: `research-company:\$\{stage\}`/);
    // Each stage that reaches OpenAI passes a labelled ledger — an unlabelled call is an unattributable one.
    for (const stage of ["inputs", "journeys", "managed_outcomes", "opportunities", "routes", "draft_reviews"]) {
      expect(src).toMatch(new RegExp(`makeUsageLedger\\("${stage}"\\)`));
    }
    // The hook must fire on the response itself, not only on the happy parse.
    expect(src).toMatch(/await reportUsage\(activeModel, data\);/);
  });
});

describe("Q1 — the predicate is still the one authority (fail-closed)", () => {
  it("companyHasClientProvidedMaterial fails closed on a lookup error", async () => {
    const { companyHasClientProvidedMaterial } = await import(
      "../../supabase/functions/_shared/clientMaterial.ts"
    );
    // A client whose every query throws must read as "has material" — never as "clean".
    const broken = { from: () => { throw new Error("relation does not exist"); } };
    const v = await companyHasClientProvidedMaterial(broken as never, "co-1");
    expect(v.has).toBe(true);
    expect(v.errors.length).toBeGreaterThan(0);
    expect(v.found).toEqual([]);
  });

  it("a company with no client material reads clean — the suite is not vacuous", async () => {
    const { companyHasClientProvidedMaterial } = await import(
      "../../supabase/functions/_shared/clientMaterial.ts"
    );
    const empty = {
      from: () => ({
        select: () => ({
          eq: function () { return this; },
          in: function () { return this; },
          not: function () { return this; },
          then: (res: (v: unknown) => unknown) => res({ count: 0, error: null }),
        }),
      }),
    };
    const v = await companyHasClientProvidedMaterial(empty as never, "co-clean");
    expect(v.has).toBe(false);
    expect(v.errors).toEqual([]);
  });
});
