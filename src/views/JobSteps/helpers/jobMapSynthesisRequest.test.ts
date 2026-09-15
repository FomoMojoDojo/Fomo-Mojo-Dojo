// Item 2 Gate 2 (signed 2026-09-15, R4) — the old JobSteps surface's local-jobmap-synthesis request.
// The body ALWAYS carries selected_maps_only:true + require_model:true; add-map sends the NEW key only
// (never customer as "support" — under selected_maps_only every listed key is regenerated); the
// save-context re-synthesis is scoped to keys that hold a live market definition, and an empty scope
// is a refusal, not a run.
import { describe, expect, it } from "vitest";
import { buildLocalJobMapSynthesisBody, scopeMapsToLiveDefinitions } from "./jobMapSynthesisRequest";
import { readLiveDefinitionKeys } from "@/lib/liveDefinitionKeys";

const map = (key: string) => ({ journey_key: key, journey_title: `Title ${key}`, journey_subtitle: `Sub ${key}` });

describe("buildLocalJobMapSynthesisBody", () => {
  it("one key + both flags + trigger, and nothing else", () => {
    const body = buildLocalJobMapSynthesisBody({ companyId: "co", selectedJobMaps: [map("pmk-x")], trigger: "jobsteps_add_map:pmk-x" });
    expect(Object.keys(body).sort()).toEqual(["company_id", "require_model", "selected_job_maps", "selected_maps_only", "trigger"]);
    expect(body).toEqual({ company_id: "co", selected_job_maps: [map("pmk-x")], selected_maps_only: true, require_model: true, trigger: "jobsteps_add_map:pmk-x" });
  });
  it("refuses an empty map set (a run over nothing is never sent)", () => {
    expect(() => buildLocalJobMapSynthesisBody({ companyId: "co", selectedJobMaps: [], trigger: "t" })).toThrow(/live market definition/);
  });
});

describe("scopeMapsToLiveDefinitions", () => {
  it("Edgewood-shaped: customer + internal selected, only customer defined → customer only", () => {
    expect(scopeMapsToLiveDefinitions([map("customer"), map("internal")], ["customer", "pmk-new-clinicians"])).toEqual([map("customer")]);
  });
  it("nothing defined → empty (the caller refuses through the existing toast path)", () => {
    expect(scopeMapsToLiveDefinitions([map("customer"), map("internal")], [])).toEqual([]);
  });
});

describe("readLiveDefinitionKeys (the Gate 1 read, reused)", () => {
  it("reads odi_market_definitions by company with retracted_at IS NULL", async () => {
    const calls: Array<[string, unknown]> = [];
    const b: Record<string, unknown> = {};
    b.select = (c: string) => { calls.push(["select", c]); return b; };
    b.eq = (c: string, v: unknown) => { calls.push(["eq", `${c}=${v}`]); return b; };
    b.is = (c: string, v: unknown) => { calls.push(["is", `${c}=${v}`]); return b; };
    b.then = (res: (v: unknown) => void) => res({ data: [{ journey_key: "customer" }, { journey_key: "pmk-x" }, { journey_key: null }], error: null });
    const keys = await readLiveDefinitionKeys({ from: (t: string) => { calls.push(["from", t]); return b; } }, "co");
    expect(keys).toEqual(["customer", "pmk-x"]);
    expect(calls).toEqual([["from", "odi_market_definitions"], ["select", "journey_key"], ["eq", "company_id=co"], ["is", "retracted_at=null"]]);
  });
});
