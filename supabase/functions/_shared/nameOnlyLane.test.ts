// Name-only lane (ruling 2026-09-18). Scenarios drive the module the handler calls, with the lane stubbed:
//   name_only + searx dead + lane returns 8 hosts → completed lane_only, 8 sources, never search_unavailable
//   name_only + both empty                        → insufficient_public_evidence / no_results
//   name_only + searx dead + lane errors          → search_unavailable (the only case it may still say so)
//   domain plan                                   → prompt byte-identical to HEAD bd764f2c (snapshot), lane invoked
//                                                   at the same point as before (after the gate) — order guard
// Non-vacuity: with the gate taken BEFORE the lane (the pre-ruling order) the first scenario's evidence count is
// the searx count (0) → the resolver says search_unavailable → the assertion fails.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildBaselineQueryPlan } from "./baselineQueryPlan.ts";
import {
  buildNameOnlyBrief, claudeWebSearchPrompt, laneSourcesFromResult, laneStatusFromSources, resolveNameOnlyOutcome, searxVerdict,
  type LaneStatus,
} from "./nameOnlyLane.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const inferSourceType = (url: string) => (/glassdoor|indeed/.test(url) ? "employee_review" : /propublica|guidestar|candid|charitynavigator/.test(url) ? "third_party_profile" : "public_web");
const deadDiag = { queriesRun: 6, queriesWithResults: 0, totalRawResults: 0, unresponsive: new Map([["brave", "too many requests"], ["duckduckgo", "CAPTCHA"], ["google", "access denied"], ["startpage", "Suspended: CAPTCHA"]]) };
const emptyDiag = { queriesRun: 6, queriesWithResults: 0, totalRawResults: 0, unresponsive: new Map<string, string>() };

/** The lane's parsed result with N cited hosts (the shape callClaudeWebSearch returns). */
function laneResult(n: number) {
  const hosts = ["projects.propublica.org", "www.guidestar.org", "www.charitynavigator.org", "www.seattletimes.com", "www.linkedin.com", "www.causeiq.com", "www.philanthropynw.org", "www.instrumentl.com"].slice(0, n);
  const urls = hosts.map((h, i) => `https://${h}/p/${i}`);
  return {
    parsed: {
      evidence_ledger: urls.map((url, i) => ({ url, source_type: "third_party_profile", voice_class: "outside_voice_about_client", snippet: `fact ${i}`, bucket: "outside_voice_signal" })),
      outside_voice_signals: urls.slice(0, 2).map((url, i) => ({ url, signal: `signal ${i}`, voice_class: "outside_voice_about_client" })),
    },
    citationSourceTextByUrl: new Map(urls.map((u, i) => [u, `cited text ${i}`])),
  };
}

// The handler's sequencing for a name-only plan, with the lane and the pipeline stubbed. `order` is the thing under
// test: "lane_first" (the ruling) vs "gate_first" (the pre-ruling order the bypass restores).
async function simulateNameOnly(args: { searx: typeof deadDiag; outage: boolean; lane: () => Promise<ReturnType<typeof laneResult>>; order: "lane_first" | "gate_first" }) {
  const searxSources: string[] = []; // searx dead / empty in every scenario here
  let lane: LaneStatus | null = null;
  let laneSources: ReturnType<typeof laneSourcesFromResult> = [];
  const runLane = async () => {
    try { const out = await args.lane(); laneSources = laneSourcesFromResult(out.parsed, out.citationSourceTextByUrl, inferSourceType); lane = laneStatusFromSources(laneSources, null); }
    catch (e) { lane = laneStatusFromSources([], String((e as Error).message)); }
  };
  if (args.order === "lane_first") await runLane();
  // the pipeline: every source with text becomes evidence (fetch / fallback crawl stubbed as pass-through)
  const evidence = [...searxSources, ...laneSources.map((s) => s.url)];
  const outcome = resolveNameOnlyOutcome({ searx: searxVerdict(args.searx, args.outage), lane, evidenceCount: evidence.length });
  if (args.order === "gate_first") await runLane(); // too late — the gate already decided
  return { outcome, evidence, lane, laneSources };
}

Deno.test("name_only + searx dead + lane returns 8 hosts → completed lane_only, evidence 8, never search_unavailable", async () => {
  const r = await simulateNameOnly({ searx: deadDiag, outage: true, lane: () => Promise.resolve(laneResult(8)), order: "lane_first" });
  assertEquals(r.outcome, { status: "completed", search_status: "lane_only" });
  assertEquals(r.evidence.length, 8);
  assertEquals(r.lane, { fired: true, results: 8, hosts: ["causeiq.com", "charitynavigator.org", "guidestar.org", "instrumentl.com", "linkedin.com", "philanthropynw.org", "projects.propublica.org", "seattletimes.com"], error: null });
  assert(r.laneSources.every((s) => s.engine === "claude_web_search_lane"));
  assertEquals(r.laneSources.find((s) => /guidestar/.test(s.url))?.source_type, "third_party_profile"); // C1 classifies on ingest as today
});

Deno.test("name_only + both empty → insufficient_public_evidence / no_results (something looked; nothing found)", async () => {
  const r = await simulateNameOnly({ searx: emptyDiag, outage: false, lane: () => Promise.resolve(laneResult(0)), order: "lane_first" });
  assertEquals(r.outcome, { status: "insufficient_public_evidence", thin_reason: "no_results" });
  const dead = await simulateNameOnly({ searx: deadDiag, outage: true, lane: () => Promise.resolve(laneResult(0)), order: "lane_first" });
  assertEquals(dead.outcome, { status: "insufficient_public_evidence", thin_reason: "no_results" }, "searx dead but the lane FIRED and found nothing: thin, not an outage");
});

Deno.test("name_only + searx dead + lane errors → search_unavailable (nothing was checked)", async () => {
  const r = await simulateNameOnly({ searx: deadDiag, outage: true, lane: () => Promise.reject(new Error("anthropic 529 overloaded")), order: "lane_first" });
  assertEquals(r.outcome, { status: "search_unavailable", thin_reason: null });
  assertEquals(r.lane?.fired, false); assertStringIncludes(r.lane?.error ?? "", "529");
  // searx merely empty + lane errored: thin (searx answered; nothing to blame on an outage)
  const e = await simulateNameOnly({ searx: emptyDiag, outage: false, lane: () => Promise.reject(new Error("x")), order: "lane_first" });
  assertEquals(e.outcome.status, "insufficient_public_evidence");
});

Deno.test("NON-VACUITY: the pre-ruling order (gate before lane) turns the first scenario into search_unavailable", async () => {
  const r = await simulateNameOnly({ searx: deadDiag, outage: true, lane: () => Promise.resolve(laneResult(8)), order: "gate_first" });
  assertEquals(r.outcome, { status: "search_unavailable", thin_reason: null }); // the lane's evidence never reached the gate
});

Deno.test("brief: the six name-only passes joined as search intents — the name, nothing else", () => {
  const plan = buildBaselineQueryPlan({ planKind: "name_only", companyName: "The John C Mithun Foundation", domain: "", stem: "", variants: [], spaced: "The John C Mithun Foundation" });
  const brief = buildNameOnlyBrief(plan);
  assertEquals(brief.split("\n").length, 6);
  assert(brief.split("\n").every((l, i) => l.startsWith(`${i + 1}. `)));
  assertStringIncludes(brief, '"The John C Mithun Foundation"');
  assert(!/site:|\.org|\.com/.test(brief.replace(/mithun/gi, "")), "no domain terms on a name-only brief");
});

Deno.test("domain plan: the prompt is byte-identical to HEAD bd764f2c (snapshot, with and without a category)", async () => {
  const src = await read("../public-baseline/index.ts");
  const schemaHint = src.slice(src.indexOf("  const schemaHint =\n") + "  const schemaHint =\n".length, src.indexOf("`}`;", src.indexOf("  const schemaHint =\n")) + 3);
  // eslint-disable-next-line no-new-func
  const hint = new Function("return " + schemaHint.trim().replace(/;$/, ""))() as string;
  const withCat = claudeWebSearchPrompt({ companyName: "Edgewood", website: "https://edgewood.org", domain: "edgewood.org", resolvedCategory: "youth mental health nonprofit", schemaHint: hint });
  assertEquals(withCat + "\n", await read("./fixtures/lane/domain_prompt_HEAD_bd764f2c.txt"));
  const noCat = claudeWebSearchPrompt({ companyName: "Edgewood", website: "https://edgewood.org", domain: "edgewood.org", schemaHint: hint });
  assertEquals(noCat + "\n", await read("./fixtures/lane/domain_prompt_nocategory_HEAD_bd764f2c.txt"));
  // the name-only form differs ONLY where the ruling says: the two domain-anchored sentences
  const nameOnly = claudeWebSearchPrompt({ companyName: "Mithun", website: "", domain: "", schemaHint: hint, nameOnlyBrief: "1. \"Mithun\" (about OR company)" });
  assertStringIncludes(nameOnly, "It has NO public website of its own — read it BY NAME.");
  assertStringIncludes(nameOnly, "1. \"Mithun\" (about OR company)");
  assert(!nameOnly.includes("from its own site"));
  assert(!nameOnly.includes("the domain ("));
});

Deno.test("order guard: on name-only the lane call precedes the thin gate; the domain lane call stays after it; sources merge; ledger fields", async () => {
  const src = await read("../public-baseline/index.ts");
  const laneCall = src.indexOf("nameOnlyLaneOut = await callClaudeWebSearch({");
  const gate = src.indexOf("if (evidence.length < 2 && !hasBootstrapEvidence)");
  const domainLane = src.indexOf("} else if (synthesis_engine === \"claude_websearch\") {\n      const claudeOut = await callClaudeWebSearch({");
  assert(laneCall > 0 && gate > 0 && domainLane > 0);
  assert(laneCall < gate, "name-only: lane before the gate");
  assert(gate < domainLane, "domain: lane after the gate, as before");
  assertStringIncludes(src, 'if (planKind === "name_only" && synthesis_engine === "claude_websearch") {');
  assertStringIncludes(src, "mergeUnique(mergeUnique(rawSearchSources, laneSources), socialCandidatesFromSite)");
  assertStringIncludes(src, "runLedger.search = searchLedger;");
  // the lane's cited text reaches the gate as evidence (as the domain plan's citations do); lane URLs are candidates
  assertStringIncludes(src, "...evidenceFromSearch, ...laneEvidence]");
  assertStringIncludes(src, "? Math.max(60, m.score)"); // lane URLs are medium-floor candidates
  assertStringIncludes(src, 'runLedger.search_status = searchLedger.searx === "ok" ? "searx_and_lane" : "lane_only";');
  // the gate on name-only is the resolver's verdict; searx alone never says search_unavailable there
  assertStringIncludes(src, "const searchOutage = nameOnlyOutcome ? nameOnlyOutcome.status === \"search_unavailable\" : isUnambiguousSearchOutage(searchDiag);");
  // the domain path still refuses on searx's verdict exactly as before (unchanged branch)
  assertStringIncludes(src, ": isUnambiguousSearchOutage(searchDiag);");
});
