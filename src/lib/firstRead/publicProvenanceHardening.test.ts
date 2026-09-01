// GATE 6a hardening (2026-09-01) — the public-provenance allowlist must REJECT the literal
// 'market_read'. That string is what refresh-cascade stamps on an uploaded-augmented cascade (the
// filed provenance-lie); accepting it as "public" would let an uploaded-augmented row pass the
// public-read gate's ledger/citation invariants and route to the external model. The diagnostic
// found require_public() (generate-public-read/index.ts) accepting it via the shared allowlist.
// This module is the single hardened allowlist; index.ts require_public delegates to isPublicProvenance.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isPublicProvenance,
  PUBLIC_PROVENANCES,
} from "../../../supabase/functions/_shared/publicReadGuards.ts";

describe("require_public hardening — 'market_read' is NOT a public provenance", () => {
  it("rejects the literal 'market_read' (refresh-cascade provenance-lie string)", () => {
    expect(isPublicProvenance("market_read")).toBe(false);
    expect(PUBLIC_PROVENANCES.has("market_read")).toBe(false);
  });

  it("still accepts the genuinely-public provenances", () => {
    for (const p of ["public_observed", "public_inferred", "public_research", "publicly_declared"]) {
      expect(isPublicProvenance(p)).toBe(true);
    }
  });

  it("rejects internal / unknown / null / casing-variant values (explicit allowlist, fail-closed)", () => {
    for (const p of ["internal_declared", "client_attested", "analytic", "uploaded_file", "intake", "", "MARKET_READ", null, undefined]) {
      expect(isPublicProvenance(p as string | null | undefined)).toBe(false);
    }
  });

  it("source-level: require_public no longer treats 'market_read' as public (delegates to the shared allowlist)", () => {
    const src = readFileSync(
      resolve(process.cwd(), "supabase/functions/generate-public-read/index.ts"),
      "utf8",
    );
    // Isolate the require_public function body and assert the poisoned literal is absent from THAT
    // public-acceptance context. (The bare literal survives elsewhere only as the id-only
    // artifact_role='market_read' legacy-audit pointer — never a provenance-acceptance comparison.)
    const m = src.match(/function require_public\([^)]*\)\s*:\s*boolean\s*\{[\s\S]*?\n\}/);
    expect(m).not.toBeNull();
    expect(m![0].includes("market_read")).toBe(false);
    // And there is no public-acceptance equality against the poisoned string anywhere in the file.
    expect(/===\s*"market_read"|"market_read"\s*===|p\s*===\s*"market_read"/.test(src)).toBe(false);
  });
});
