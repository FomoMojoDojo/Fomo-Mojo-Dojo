// Router hardening (2026-09-01) — the model router's public-provenance allowlist must REJECT the
// literal 'market_read'. resolveModel is the gate that actually decides external (OpenAI) vs local: a
// 'market_read'-stamped input (refresh-cascade's uploaded-augmented provenance-lie) must NOT route an
// all-'market_read' call to the external API. The allowlist must be the SINGLE authority shared with
// the public-read gate (publicReadGuards.ts) — not a second, drifting list.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveModel, isPublicProvenance, PUBLIC_PROVENANCES } from "./resolveModel.ts";
import { PUBLIC_PROVENANCES as GUARD_PROVENANCES } from "../../../supabase/functions/_shared/publicReadGuards.ts";

describe("router hardening — 'market_read' is NOT public and never routes external", () => {
  it("isPublicProvenance('market_read') is false; the set does not contain it", () => {
    expect(isPublicProvenance("market_read")).toBe(false);
    expect(PUBLIC_PROVENANCES.has("market_read")).toBe(false);
  });

  it("an all-'market_read' input set routes LOCAL (fail-closed), never external", () => {
    expect(resolveModel({ role: "generator", inputs: [{ id: "a", provenance: "market_read" }] }).provider).toBe("local_ollama");
    expect(resolveModel({ role: "judge", inputs: [{ id: "a", provenance: "market_read" }, { id: "b", provenance: "public_observed" }] }).provider).toBe("local_ollama");
  });

  it("genuinely-public inputs still route external (no over-correction)", () => {
    expect(resolveModel({ role: "generator", inputs: [{ id: "a", provenance: "public_observed" }, { id: "b", provenance: "public_inferred" }] }).provider).toBe("external_openai");
  });

  it("the router allowlist IS the publicReadGuards authority (single source, not a second list)", () => {
    // Same Set identity when re-exported; at minimum, identical membership and no 'market_read'.
    expect([...PUBLIC_PROVENANCES].sort()).toEqual([...GUARD_PROVENANCES].sort());
    expect(PUBLIC_PROVENANCES.has("market_read")).toBe(false);
  });

  it("source-level: resolveModel.ts defines no second allowlist containing 'market_read'", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/modelRouter/resolveModel.ts"), "utf8");
    // The hardened module re-exports the allowlist from publicReadGuards; it must not re-introduce a
    // local Set literal that lists the poisoned string.
    expect(/new Set\([\s\S]*market_read[\s\S]*\)/.test(src)).toBe(false);
  });
});
