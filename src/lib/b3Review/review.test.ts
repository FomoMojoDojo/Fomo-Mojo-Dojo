// b3 review path — the pure rules (R11, 2026-10-18).
import { describe, expect, it } from "vitest";
import {
  assertAllowedDatabase, assertAllowedDataSource, CLIENT_PORTALS_IDS, decideCompareAndSet, notionPageProperties, parsePlanTsv, personProfileRule, planBool, planDecisions, planExcludeOf, planRowsFor,
  PLAN_EXCLUDE_CLASSES, REVIEW_DB_PROPERTIES, VERDICT_OPTIONS,
} from "./review";

describe("R15: personal-profile URLs", () => {
  it("a member profile is a person page; a company page, a post, or another host is not", () => {
    expect(personProfileRule("https://www.linkedin.com/in/blechatellier/")).toMatch(/linkedin\.com\/in\//);
    expect(personProfileRule("https://linkedin.com/pub/jane-doe/1/2/3")).toMatch(/pub/);
    expect(personProfileRule("https://www.crunchbase.com/person/jane-doe")).toMatch(/crunchbase/);
    expect(personProfileRule("https://www.zoominfo.com/p/Jane-Doe/123")).toMatch(/zoominfo/);
    expect(personProfileRule("https://www.linkedin.com/company/edgewoodcenter")).toBeNull();
    expect(personProfileRule("https://www.linkedin.com/posts/acme_launch-activity-1")).toBeNull();
    expect(personProfileRule("https://www.crunchbase.com/organization/brand-ai")).toBeNull();
    expect(personProfileRule("https://brand.ai/in/")).toBeNull();
    expect(personProfileRule("not a url")).toBeNull();
    expect(PLAN_EXCLUDE_CLASSES).toContain("person_profile");
  });
});

const HDR = "company\turl\tsnapshot_id\tchars\tat_cap\thead160\tstarts_json\tjson_punct_ratio\tcode_marks\tsentences\tblanked_rows\tblanked_signal_ids\texclude\texclude_rule";
const TSV = [
  HDR,
  "Brand AI\thttps://a.test/\tsnap-a\t3223\tf\thead\tf\t0.01\t0\t22\t2\tsig-1,sig-2\t\thtml text",
  "Brand AI\thttps://b.test/\tsnap-b\t12000\tt\thead\tt\t0.14\t8\t0\t1\tsig-3\tjson\tclean_text starts with {",
  "Edgewood\thttps://c.test/\tsnap-c\t16\tf\thead\tf\t0\t0\t0\t6\tsig-4\tthin_shell\tno sentence",
].join("\n");

describe("plan file", () => {
  it("parses by header name, reads ids as a list, and treats a missing exclude column as in scope", () => {
    const rows = parsePlanTsv(TSV);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ company: "Brand AI", chars: 3223, at_cap: false, blanked_rows: 2, blanked_signal_ids: ["sig-1", "sig-2"], exclude: "" });
    expect(rows[1]).toMatchObject({ at_cap: true, exclude: "json" });
    const noExclude = parsePlanTsv(TSV.split("\n").map((l) => l.split("\t").slice(0, 12).join("\t")).join("\n"));
    expect(noExclude.every((r) => r.exclude === "")).toBe(true);
  });
  it("R20 columns: r20 reads t / true / 1 as in the set and f / false / 0 as out; a missing r20 column is null and leaves every row in scope", () => {
    const hdr = HDR + "\tovs_rows\tr20\texclude_r20";
    const row = (co: string, url: string, r20: string, why: string) => [co, url, "snap", "100", "f", "h", "f", "0", "0", "3", "1", "sig-1", "", "html text", "1", r20, why].join("\t");
    const rows = parsePlanTsv([hdr,
      row("Co", "https://a.example/", "t", ""), row("Co", "https://b.example/", "1", ""), row("Co", "https://c.example/", "true", ""),
      row("Co", "https://d.example/", "f", "R20:no_outside_voice_row"), row("Co", "https://e.example/", "0", ""), row("Co", "https://f.example/", "false", "R20:no_outside_voice_row"),
    ].join("\n"));
    expect(rows.map((r) => r.r20)).toEqual([true, true, true, false, false, false]);
    expect(planBool("T")).toBe(true); expect(planBool(" 1 ")).toBe(true); expect(planBool("")).toBe(false); expect(planBool("f")).toBe(false);
    const { kept, excluded } = planRowsFor(rows, "Co");
    expect(kept.map((r) => r.url)).toEqual(["https://a.example/", "https://b.example/", "https://c.example/"]);
    expect(excluded.map((r) => planExcludeOf(r))).toEqual(["R20:no_outside_voice_row", "R20:not_in_set", "R20:no_outside_voice_row"]);
    // the R10 class still comes first when both name the row
    expect(planExcludeOf({ exclude: "json", exclude_r20: "R20:no_outside_voice_row", r20: false })).toBe("json");
    // b3plan-r10.tsv has no r20 column: r20 is null and the R10 class alone decides
    const r10 = parsePlanTsv(TSV);
    expect(r10.every((r) => r.r20 === null && r.exclude_r20 === "")).toBe(true);
    expect(planRowsFor(r10, "Brand AI").excluded.map((r) => planExcludeOf(r))).toEqual(["json"]);
  });

  it("a company's run takes its own non-excluded rows only", () => {
    const { kept, excluded, other_companies } = planRowsFor(parsePlanTsv(TSV), "Brand AI");
    expect(kept.map((r) => r.url)).toEqual(["https://a.test/"]);
    expect(excluded.map((r) => r.exclude)).toEqual(["json"]);
    expect(other_companies).toBe(1);
  });
  it("refuses a file without the required columns", () => {
    expect(() => parsePlanTsv("company\turl\nx\ty")).toThrow(/missing column/);
  });
});

describe("Notion page payload", () => {
  it("fills every schema property except the operator's two, with URL as the title", () => {
    const props = notionPageProperties({ company: "Brand AI", url: "https://a.test/", snapshot_id: "snap-a", chars: 3223, at_cap: false, blanked_rows: 2, review_row_id: "rr-1" });
    expect(Object.keys(props).sort()).toEqual(
      [REVIEW_DB_PROPERTIES.url, REVIEW_DB_PROPERTIES.company, REVIEW_DB_PROPERTIES.snapshot_id, REVIEW_DB_PROPERTIES.chars, REVIEW_DB_PROPERTIES.at_cap, REVIEW_DB_PROPERTIES.blanked_rows, REVIEW_DB_PROPERTIES.review_row_id].sort(),
    );
    expect(props[REVIEW_DB_PROPERTIES.url]).toEqual({ title: [{ text: { content: "https://a.test/" } }] });
    expect(props[REVIEW_DB_PROPERTIES.at_cap]).toEqual({ checkbox: false });
    expect(props).not.toHaveProperty(REVIEW_DB_PROPERTIES.verdict);
    expect(props).not.toHaveProperty(REVIEW_DB_PROPERTIES.comment);
    expect(VERDICT_OPTIONS).toEqual(["Approve", "Reject"]);
  });
});

describe("database allow-list", () => {
  const A = "b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3"; // synthetic — the real id lives only in backups/client-sync.env
  it("accepts the one allow-listed id, dashed or not", () => {
    expect(assertAllowedDatabase(A, A.replace(/-/g, ""))).toBe(A.replace(/-/g, ""));
  });
  it("refuses another id, an unset allow-list, and a missing request", () => {
    expect(() => assertAllowedDatabase("deadbeef".repeat(4), A)).toThrow(/not the allow-listed/);
    expect(() => assertAllowedDatabase(A, "")).toThrow(/unset/);
    expect(() => assertAllowedDatabase("", A)).toThrow(/no database id requested/);
  });
  it("refuses the Client Portals database and data source BY VALUE, whichever side names them, before any other check", () => {
    const portalsDb = "75df0a3f617182c6beb101a61c145212", portalsDs = "31af0a3f-6171-83a0-9da8-87337f0ffc6d";
    expect(CLIENT_PORTALS_IDS).toEqual([portalsDb, portalsDs.replace(/-/g, "")]);
    expect(() => assertAllowedDatabase(portalsDb, portalsDb)).toThrow(/Client Portals database/);   // env AND request agree — still refused
    expect(() => assertAllowedDatabase(A, portalsDb)).toThrow(/Client Portals database/);
    expect(() => assertAllowedDatabase(portalsDb, A)).toThrow(/Client Portals database/);
    expect(() => assertAllowedDataSource(portalsDs)).toThrow(/Client Portals data source/);
    expect(() => assertAllowedDataSource("")).toThrow(/B3_REVIEW_NOTION_DATA_SOURCE_ID is unset/);
    expect(assertAllowedDataSource("4f43371b-2ebb-4bf4-a532-2a30eb4bbf6f")).toBe("4f43371b2ebb4bf4a5322a30eb4bbf6f");
  });
});

describe("decide: compare-and-set", () => {
  const undecided = { id: "r1", operator_decision: null, decided_by: null };
  const approved = { id: "r2", operator_decision: "approve", decided_by: "operator", notion_page_id: "pg-2" };
  it("an undecided row takes the verdict; an empty verdict is a no-op", () => {
    expect(decideCompareAndSet(undecided, { page_id: "pg-1", review_row_id: "r1", verdict: "Reject" })).toMatchObject({ action: "write", decision: "reject" });
    expect(decideCompareAndSet(undecided, { page_id: "pg-1", review_row_id: "r1", verdict: null })).toMatchObject({ action: "noop" });
    expect(decideCompareAndSet(undecided, { page_id: "pg-1", review_row_id: "r1", verdict: "Maybe" })).toMatchObject({ action: "noop" });
  });
  it("a row decided the same way is a no-op; decided DIFFERENTLY is refused, never overwritten", () => {
    expect(decideCompareAndSet(approved, { page_id: "pg-2", review_row_id: "r2", verdict: "Approve" })).toMatchObject({ action: "noop" });
    expect(decideCompareAndSet(approved, { page_id: "pg-2", review_row_id: "r2", verdict: "Reject" })).toMatchObject({ action: "refuse", reason: expect.stringMatching(/changed decision is refused/) });
  });
  it("a different page claiming an already-decided row is refused; an unknown row id is refused", () => {
    expect(decideCompareAndSet(approved, { page_id: "pg-9", review_row_id: "r2", verdict: "Approve" })).toMatchObject({ action: "refuse", reason: expect.stringMatching(/different Notion page/) });
    expect(decideCompareAndSet(null, { page_id: "pg-1", review_row_id: "nope", verdict: "Approve" })).toMatchObject({ action: "refuse" });
  });
  it("plans a batch against the rows by id", () => {
    const plan = planDecisions(
      [{ page_id: "a", review_row_id: "r1", verdict: "Approve" }, { page_id: "b", review_row_id: "r2", verdict: "Reject" }, { page_id: "c", review_row_id: "zz", verdict: "Approve" }],
      new Map([["r1", undecided], ["r2", approved]]),
    );
    expect(plan.map((p) => p.action)).toEqual(["write", "refuse", "refuse"]);
  });
});

// ── R18: the system decides by rule; an operator decision is an override ──────────────────────────
import { applyPrecedence, contentShape, isSystemDecider, RULES_VERSION, SYSTEM_DECIDER, systemRule } from "./review";

describe("R18 system rule", () => {
  const html = "About us. The roastery opened in 2011 on Magnolia Boulevard. Reviewers call it the neighbourhood favourite. It roasts every bean in Burbank.";
  const base = { disposition: "b3_from_snapshot", url: "https://reviews.example/acme", basis_is_newest_ok: true, snapshot_text: html, plan_exclude: "" as string | null };
  it("stamps the rules version into the decider name", () => {
    expect(SYSTEM_DECIDER).toBe(`system:${RULES_VERSION}`);
    expect(isSystemDecider("system:b3-rules-1")).toBe(true);
    expect(isSystemDecider("system:b3-rules-7")).toBe(true);
    expect(isSystemDecider("operator")).toBe(false);
    expect(isSystemDecider(null)).toBe(false);
  });
  it("approves an html-text row on the newest ok snapshot, with the rule named", () => {
    expect(systemRule(base)).toMatchObject({ decision: "approve", rule: "html_text:newest_ok" });
  });
  it("rejects, naming the first rule that fires: scope, R15 person profile, R10 plan class, basis, shape", () => {
    expect(systemRule({ ...base, disposition: "unchanged" })).toMatchObject({ decision: "reject", rule: "scope:disposition" });
    expect(systemRule({ ...base, url: "https://www.linkedin.com/in/someone/" })).toMatchObject({ decision: "reject", rule: "R15:person_profile" });
    expect(systemRule({ ...base, plan_exclude: "json" })).toMatchObject({ decision: "reject", rule: "R10:json" });
    expect(systemRule({ ...base, plan_exclude: "R20:no_outside_voice_row" })).toMatchObject({ decision: "reject", rule: "R20:no_outside_voice_row" });
    expect(systemRule({ ...base, basis_is_newest_ok: false })).toMatchObject({ decision: "reject", rule: "basis:not_newest_ok" });
    expect(systemRule({ ...base, snapshot_text: "" })).toMatchObject({ decision: "reject", rule: "basis:no_snapshot_text" });
    expect(systemRule({ ...base, snapshot_text: "Instagram" })).toMatchObject({ decision: "reject", rule: "R10:thin_shell" });
    expect(systemRule({ ...base, snapshot_text: '{"bg_color":"#001936","type":"desktop","color":"#ffffff"}' })).toMatchObject({ decision: "reject", rule: "R10:json" });
    expect(systemRule({ ...base, plan_exclude: null })).toMatchObject({ decision: "approve" });
  });
  it("contentShape mirrors the plan file's classes", () => {
    expect(contentShape(html).shape).toBe("html_text");
    expect(contentShape("Spotify – Web Player").shape).toBe("thin_shell");
    expect(contentShape("[1,2,3]").shape).toBe("json");
    expect(contentShape("window.a = 1; window.b = 2; window.c = 3; document.x = 1; document.y = 2; var a; var b; const z = () => 1").shape).toBe("script_shell");
  });
});

describe("R18 precedence", () => {
  const undecided = { operator_decision: null, decided_by: null };
  const bySystem = { operator_decision: "approve", decided_by: "system:b3-rules-1" };
  const byOperator = { operator_decision: "reject", decided_by: "operator" };
  it("an undecided row takes either decider's decision, stamped with who decided", () => {
    expect(applyPrecedence(undecided, { decision: "approve", by: "system" })).toMatchObject({ action: "write", decided_by: "system:b3-rules-1" });
    expect(applyPrecedence(undecided, { decision: "reject", by: "operator" })).toMatchObject({ action: "write", decided_by: "operator" });
  });
  it("the system never overwrites an operator decision, nor its own earlier decision", () => {
    expect(applyPrecedence(byOperator, { decision: "approve", by: "system" })).toMatchObject({ action: "noop", reason: expect.stringMatching(/never overwrites/) });
    expect(applyPrecedence(bySystem, { decision: "approve", by: "system" })).toMatchObject({ action: "noop" });
    expect(applyPrecedence(bySystem, { decision: "reject", by: "system" })).toMatchObject({ action: "noop", reason: expect.stringMatching(/needs an operator/) });
  });
  it("an operator override of a system decision is allowed and carries the audit (from, to, by)", () => {
    expect(applyPrecedence(bySystem, { decision: "reject", by: "operator" })).toEqual({ action: "override", decision: "reject", decided_by: "operator", from: { decision: "approve", by: "system:b3-rules-1" }, reason: "operator overrides the system's approve" });
    expect(applyPrecedence(bySystem, { decision: "approve", by: "operator" })).toMatchObject({ action: "noop" });
  });
  it("an operator changing an operator decision is still refused", () => {
    expect(applyPrecedence(byOperator, { decision: "approve", by: "operator" })).toMatchObject({ action: "refuse" });
    expect(applyPrecedence(byOperator, { decision: "reject", by: "operator" })).toMatchObject({ action: "noop" });
  });
});
