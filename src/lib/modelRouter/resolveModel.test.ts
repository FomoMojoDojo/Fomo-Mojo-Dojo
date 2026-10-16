// Model router (2026-08-22): selects provider by the provenance of EVERY input row. All-public →
// external OpenAI; any non-public/unknown/NULL → local. Reads provenance only.
import { describe, it, expect } from "vitest";
import {
  resolveModel, isPublicProvenance, signalProvenance, modelStamp,
  EXTERNAL_MODEL, EXTERNAL_GENERATOR, EXTERNAL_JUDGE, LOCAL_GENERATOR, LOCAL_JUDGE,
} from "./resolveModel";

const pub = (id: string) => ({ id, provenance: "public_observed" });

describe("resolveModel — route by provenance of every input", () => {
  // MODEL TRIAL (operator ruling, 2026-10-15): the external branch now splits by ROLE, exactly as
  // the local branch below always has. It used to return one model for both roles and carry the role
  // only as a label, which is why neither role's model could be changed without changing the other.
  // The generator is gpt-4.1; the judge stays gpt-4.1-mini. What is asserted is the SPLIT, not just
  // the two ids: a change that collapses both roles onto one model fails here however it is spelled.
  it("ALL inputs public → external OpenAI, each role its own external model", () => {
    const gen = resolveModel({ role: "generator", inputs: [pub("a"), pub("b")] });
    const jdg = resolveModel({ role: "judge", inputs: [pub("a"), { id: "b", provenance: "public_inferred" }] });
    expect(gen).toEqual({ provider: "external_openai", model: EXTERNAL_GENERATOR, role: "generator" });
    expect(jdg).toEqual({ provider: "external_openai", model: EXTERNAL_JUDGE, role: "judge" });
    expect(gen.model).not.toBe(jdg.model);
    expect(EXTERNAL_GENERATOR).toBe("gpt-4.1");
    expect(EXTERNAL_JUDGE).toBe("gpt-4.1-mini");
    // the old name still resolves, and is the role whose model did NOT change
    expect(EXTERNAL_MODEL).toBe(EXTERNAL_JUDGE);
  });

  it("ONE internal input → local (the whole call), each role its local model", () => {
    const inputs = [pub("a"), { id: "b", provenance: "internal_declared" }, pub("c")];
    expect(resolveModel({ role: "generator", inputs })).toEqual({ provider: "local_ollama", model: LOCAL_GENERATOR, role: "generator" });
    expect(resolveModel({ role: "judge", inputs })).toEqual({ provider: "local_ollama", model: LOCAL_JUDGE, role: "judge" });
  });

  it("a NULL / unknown provenance → local (fail-closed)", () => {
    expect(resolveModel({ role: "judge", inputs: [pub("a"), { id: "b", provenance: null }] }).provider).toBe("local_ollama");
    expect(resolveModel({ role: "judge", inputs: [pub("a"), { id: "b", provenance: "analytic" }] }).provider).toBe("local_ollama");
    expect(resolveModel({ role: "judge", inputs: [pub("a"), { id: "b", provenance: "client_attested" }] }).provider).toBe("local_ollama");
  });

  it("EMPTY input set → local (never send an unqualified call external)", () => {
    expect(resolveModel({ role: "judge", inputs: [] }).provider).toBe("local_ollama");
  });

  it("isPublicProvenance: public values true; internal/analytic/null false", () => {
    for (const p of ["public_observed", "public_inferred", "public_research", "publicly_declared"]) expect(isPublicProvenance(p)).toBe(true);
    // HARDENED (2026-09-01): 'market_read' (refresh-cascade provenance-lie) is now NON-public — see
    // resolveModelHardening.test.ts. It joins the internal/unknown values that force local.
    for (const p of ["market_read", "internal_declared", "analytic", "client_attested", null, undefined, "unknown"]) expect(isPublicProvenance(p)).toBe(false);
  });

  it("signalProvenance: outside-band public voices → public_observed; analysis/NULL/non-outside → null (local)", () => {
    expect(signalProvenance("outside", "outside_voice_about_client")).toBe("public_observed");
    expect(signalProvenance("outside", "client_voice")).toBe("public_observed");
    expect(signalProvenance("outside", "market_context")).toBe("public_observed");
    expect(signalProvenance("outside", "analysis")).toBeNull(); // our synthesis → local
    expect(signalProvenance("outside", null)).toBeNull(); // unknown voice → local
    expect(signalProvenance("organization", null)).toBeNull(); // internal band → local
    // a recurrence pair where one side is analysis routes local
    expect(resolveModel({ role: "judge", inputs: [
      { id: "s1", provenance: signalProvenance("outside", "outside_voice_about_client") },
      { id: "s2", provenance: signalProvenance("outside", "analysis") },
    ] }).provider).toBe("local_ollama");
  });

  it("modelStamp shapes the persisted columns", () => {
    expect(modelStamp(resolveModel({ role: "judge", inputs: [pub("a")] }))).toEqual({ model_provider: "external_openai", model_name: EXTERNAL_MODEL });
    expect(modelStamp(resolveModel({ role: "judge", inputs: [{ id: "x", provenance: null }] }))).toEqual({ model_provider: "local_ollama", model_name: LOCAL_JUDGE });
  });
});
