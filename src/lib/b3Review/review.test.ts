// b3 review path — the pure rules (R11, 2026-10-18).
import { describe, expect, it } from "vitest";
import {
  assertAllowedDatabase, assertAllowedDataSource, CLIENT_PORTALS_IDS, decideCompareAndSet, notionPageProperties, parsePlanTsv, personProfileRule, planDecisions, planRowsFor,
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
