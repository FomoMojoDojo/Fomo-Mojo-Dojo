// ── Q7 plants P1(door), P3, P9, P10 — the Option B door (ruling Q4, 2026-11-06) ──────────────────
//
// The door is the company-level check in front of every outside call the three evaluate-* functions
// make. These plants prove all four of its behaviours, including the two that make it non-vacuous:
// a CLEAN company must still be allowed through (P10), and a refusal caused by a LOOKUP ERROR must be
// distinguishable in the audit row from one caused by a found row (P3).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { optionBDoor } from "./optionBDoor.ts";

const CO = "co-door";

type Recorded = Record<string, unknown>;

/** A fake client whose signals/interviews/etc. counts are scripted per table, recording integrity writes. */
function fakeDb(counts: Record<string, number | "error">) {
  const recorded: Recorded[] = [];
  const make = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      not: () => chain,
      // every count query resolves through the awaited builder
      then: (res: (v: unknown) => unknown) => {
        const c = counts[table];
        return Promise.resolve(
          c === "error"
            ? { count: null, error: { message: `permission denied for relation ${table}` } }
            : { count: c ?? 0, error: null },
        ).then(res);
      },
      insert: (row: Recorded) => { recorded.push(row); return Promise.resolve({ error: null }); },
    };
    return chain;
  };
  return { db: { from: (t: string) => make(t) }, recorded };
}

const doorArgs = (db: unknown) => ({
  supabase: db as never,
  companyId: CO,
  surfaceType: "route",
  surfaceId: "r-1",
  consumer: "evaluate-route-alignment",
});

Deno.test("P10 control: a CLEAN company is ALLOWED through and writes no audit row", async () => {
  // Without this the guard could 'pass' by refusing everything, which is the vacuous failure mode.
  const { db, recorded } = fakeDb({});
  const r = await optionBDoor(doorArgs(db));
  assertEquals(r.allowed, true, "a company with no client material must reach the outside call");
  assertEquals(r.verdict.has, false);
  assertEquals(r.verdict.errors, []);
  assertEquals(recorded.length, 0, "an ALLOWED call writes nothing — a row per permitted call would bury the refusals");
});

Deno.test("P9: a WALLED company is refused, with one audit row naming what was found", async () => {
  const { db, recorded } = fakeDb({ interview_records: 1 });
  const r = await optionBDoor(doorArgs(db));
  assertEquals(r.allowed, false, "a company holding an interview record makes no outside call");
  assertEquals(r.verdict.has, true);
  assert(r.verdict.found.some((f) => f.kind === "interview"), "the verdict must name the kind that fired");
  assertEquals(recorded.length, 1, "exactly one integrity_runs row per refused call");
  const row = recorded[0] as { component: string; surface_type: string; surface_id: string; admitted: number; excluded_by_rule: Record<string, unknown> };
  assertEquals(row.component, "option_b_door");
  assertEquals(row.surface_type, "route");
  assertEquals(row.surface_id, "r-1");
  assertEquals(row.admitted, 0);
  assertEquals(row.excluded_by_rule.client_material, true);
  assertEquals(row.excluded_by_rule.fail_closed_on_error, false, "this refusal came from a ROW, not an error");
});

Deno.test("P3: a LOOKUP ERROR refuses too — fail closed — and the audit row says so", async () => {
  // The predicate counts an error as "has material" and names it. The door must carry that
  // distinction into the row: an operator reading the audit must be able to tell a real finding from
  // a broken query, because the remedy for each is different.
  const { db, recorded } = fakeDb({ claims: "error" });
  const r = await optionBDoor(doorArgs(db));
  assertEquals(r.allowed, false, "an unprovable company must be treated as walled");
  assertEquals(r.verdict.has, true);
  assertEquals(r.verdict.found, [], "nothing was FOUND — the refusal is entirely an error");
  assert(r.verdict.errors.length > 0, "the error must be named");
  const row = recorded[0] as { excluded_by_rule: Record<string, unknown> };
  assertEquals(row.excluded_by_rule.fail_closed_on_error, true);
  assert(
    JSON.stringify(row.excluded_by_rule.errors).includes("permission denied"),
    "the underlying cause travels into the audit row",
  );
});

Deno.test("the door never inspects content — only the predicate's verdict decides", async () => {
  // Shape guard: optionBDoor takes no row text, so it cannot be made content-dependent by accident.
  // COMMENTS ARE STRIPPED FIRST: the property is about the CODE, and prose legitimately uses words
  // like "verbatim" when explaining what the audit row carries. Matching the comments too made this
  // test fail on its own documentation, which is a false positive, not a finding.
  const raw = await Deno.readTextFile(new URL("./optionBDoor.ts", import.meta.url));
  const code = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")   // block comments, including the /** doc blocks
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))   // line comments
    .join("\n");
  for (const col of ["claim_text", "desired_outcome", "verbatim", "evidence_excerpt", "short_description"]) {
    assert(!code.includes(col), `the door must not read the content column ${col}`);
  }
  assert(/companyHasClientProvidedMaterial/.test(code), "and it must delegate to the ONE predicate");
  // Non-vacuous: the stripper must not have eaten the whole file.
  assert(code.includes("export async function optionBDoor"), "the comment stripper left no code to check");
});
