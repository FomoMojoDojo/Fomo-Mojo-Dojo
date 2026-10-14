// ── H2 (operator ruling, 2026-10-14) ────────────────────────────────────────────────────────────
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { predecessorOf, type PairableRead } from "../continuityPairing.ts";

// the real Edgewood positioning rows, as public_reads holds them after the 2026-10-14 promote
const CO = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";
const r = (id: string, created_at: string, superseded_by: string | null): PairableRead =>
  ({ id, company_id: CO, kind: "positioning", created_at, superseded_by });
const CUR = r("cc5f64e3", "2026-10-14T05:27:47Z", null);          // promoted; it superseded 5efba9ef
const OLD = r("5efba9ef", "2026-10-08T21:54:05Z", "cc5f64e3");    // the read it replaced
const HELD = r("f09e5199", "2026-10-14T00:11:20Z", "5efba9ef");   // staged, held, discarded — never current
const ROWS = [OLD, HELD, CUR];

Deno.test("H2. cc5f64e3 pairs with 5efba9ef — the read it replaced, not the later discarded one", () => {
  assertEquals(predecessorOf(CUR, ROWS)?.id, "5efba9ef");
  // the trap: f09e5199 is NEWER than 5efba9ef and older than cc5f64e3, so date-order picks it
  const byDate = ROWS.filter((x) => x.created_at < CUR.created_at).at(-1);
  assertEquals(byDate?.id, "f09e5199", "date order really does pick the wrong row here");
  assert(predecessorOf(CUR, ROWS)?.id !== byDate?.id, "H2 must not agree with date order on this case");
});

Deno.test("H2. the date fallback still applies when nothing names a predecessor", () => {
  // rows promoted before superseded_by was being set: no row's superseded_by names the current one
  const a = r("aaaaaaaa", "2026-09-01T00:00:00Z", null);
  const b = r("bbbbbbbb", "2026-09-10T00:00:00Z", null);
  const c = r("cccccccc", "2026-09-20T00:00:00Z", null);
  assertEquals(predecessorOf(c, [a, b, c])?.id, "bbbbbbbb");
  assertEquals(predecessorOf(a, [a, b, c]), undefined, "the oldest has no predecessor");
});

Deno.test("H2. the named predecessor wins even when it is not the nearest by date", () => {
  assertEquals(predecessorOf(CUR, [CUR, HELD, OLD])?.id, "5efba9ef", "order of the input does not matter");
});

Deno.test("H2. a company's reads never pair across companies or kinds in the fallback", () => {
  const mine = r("mine0000", "2026-09-20T00:00:00Z", null);
  const other: PairableRead = { id: "other000", company_id: "zzz", kind: "positioning", created_at: "2026-09-19T00:00:00Z", superseded_by: null };
  const wrongKind: PairableRead = { ...other, id: "kind0000", company_id: CO, kind: "strategy" };
  assertEquals(predecessorOf(mine, [other, wrongKind, mine]), undefined);
});
