// C2 (2026-09-17) — register writers and the corpus rule for publicly_declared, plus a source guard on the
// deterministic claim-id namespace. (The claim mint itself is proven in src/lib/publiclyDeclaredParity.test.ts
// against the shared mapper; the DB immutability trigger is proven live — see the report.)
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { corpusRegisterFromFindings } from "./marketOptionSynthesis.ts";
import { marketCandidateDecided } from "./marketCandidateAccounted.ts";

Deno.test("corpus register (RG-2b, C2): publicly_declared is PUBLIC corpus — never taints; all-declared earns publicly_declared; a public mix stays public_inferred", () => {
  assertEquals(corpusRegisterFromFindings([]), null);
  assertEquals(corpusRegisterFromFindings([{ register: "public_inferred" }]), "public_inferred");
  assertEquals(corpusRegisterFromFindings([{ register: "publicly_declared" }, { register: "publicly_declared" }]), "publicly_declared");
  assertEquals(corpusRegisterFromFindings([{ register: "public_inferred" }, { register: "publicly_declared" }]), "public_inferred");
  assertEquals(corpusRegisterFromFindings([{ register: "public_inferred" }, { register: "internal_inferred" }]), "internal_inferred");
  assertEquals(corpusRegisterFromFindings([{ register: "publicly_declared" }, { register: null }]), "internal_inferred");
  // BYPASS shape (the pre-C2 rule: anything ≠ public_inferred taints): a declared corpus would read internal — the leak
  const preFix = (rows: Array<{ register: string | null }>) => rows.some((r) => r.register !== "public_inferred") ? "internal_inferred" : "public_inferred";
  assertEquals(preFix([{ register: "publicly_declared" }]), "internal_inferred");
});

Deno.test("marketCandidateAccounted: a def in EITHER public register (public_inferred | publicly_declared) accounts for the candidate", async () => {
  const seen: string[] = [];
  const existsFor = (register: string) => async (table: string, match: Record<string, unknown>) => {
    seen.push(`${table}:${match.market_register ?? match.market_a_identity ?? ""}`);
    return table === "odi_market_definitions" && match.market_register === register;
  };
  assert(await marketCandidateDecided({ exists: existsFor("publicly_declared"), companyId: "co", candidate: { job_executor: "Parents", jtbd: "get care" } }));
  assert(await marketCandidateDecided({ exists: existsFor("public_inferred"), companyId: "co", candidate: { job_executor: "Parents", jtbd: "get care" } }));
  assert(seen.includes("odi_market_definitions:publicly_declared"));
});

Deno.test("source guards: the mint's id namespace + the declared-side predicates name publicly_declared", async () => {
  const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
  assertStringIncludes(await read("./evidencePhase1.ts"), 'deterministicSignalClaimId(companyId, c.claim.statement, "publicly_declared")');
  assertStringIncludes(await read("./claimDeltaSynthesis.ts"), 'c.provenance === "publicly_declared"');
  assertStringIncludes(await read("../public-baseline/index.ts"), '"internal_declared", "client_attested", "publicly_declared"');
  assertStringIncludes(await read("../../../src/lib/evidenceMappers.ts"), 'if (backing.every((b) => b.evidenceClass === "filing")) return "publicly_declared";');
  assertStringIncludes(await read("../../../src/lib/evidenceMappers.ts"), "`declared-public::${baseKey}`");
});
