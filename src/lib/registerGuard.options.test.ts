// RG-2b TRIPWIRE — a market_options card BLOCKS on Act A by its earned register.
//
// This is the assertion RG-1 could not make honestly: back then
// market_options.market_register was a NOT-NULL DEFAULT the generator never set,
// so every row read public_inferred by column default — a vacuous pass. RG-2b
// makes the generator EARN it from the finding corpus (fail-toward-internal) and
// drops the default, so an internal-register option genuinely exists as a
// possibility and MUST be filtered off Act A.
//
// The fixtures mirror the exact Act A filter in MarketAct.tsx:
//     rawOptions.filter((o) => admitForSurface(o, "outside"))
// so this tests the render boundary, not just the predicate.
//
// Falsification-validated (gate report): inverting admitForSurface admits the
// internal option onto Act A and the block assertion goes red naming the leaked
// register + surface. It can pass ONLY because the guard held — an option with
// no relationship_kind and no origin still blocks purely on register, so nothing
// incidental shields it.

import { describe, expect, it } from "vitest";
import { admitForSurface } from "./registerGuard";

// market_options-shaped rows: register lives on `market_register`.
type OptionRow = { id: string; executor_statement: string; market_register: string | null };

const PUBLIC_OPTION: OptionRow = { id: "o-pub", executor_statement: "Funders", market_register: "public_inferred" };
const INTERNAL_OPTION: OptionRow = { id: "o-int", executor_statement: "Nonprofit programme officers", market_register: "internal_inferred" };
const NULL_OPTION: OptionRow = { id: "o-null", executor_statement: "Unstamped", market_register: null };

// The exact Act A options filter.
const renderOnActA = (rows: OptionRow[]) => rows.filter((o) => admitForSurface(o, "outside"));

describe("RG-2b market_options register guard — Act A render boundary", () => {
  it("BLOCKS an internal_inferred option off Act A (the assertion RG-1 could not make)", () => {
    const rendered = renderOnActA([PUBLIC_OPTION, INTERNAL_OPTION]);
    const ids = rendered.map((o) => o.id);
    expect(
      ids,
      `LEAK: internal_inferred market option "${INTERNAL_OPTION.executor_statement}" rendered on Act A (client outside surface).`,
    ).not.toContain("o-int");
    expect(ids).toContain("o-pub"); // the public option still renders
  });

  it("BLOCKS a NULL-register option off Act A (a forgotten stamp must not leak)", () => {
    const rendered = renderOnActA([PUBLIC_OPTION, NULL_OPTION]);
    expect(
      rendered.map((o) => o.id),
      `LEAK: NULL-register option rendered on Act A — an unearned/forgotten stamp must not reach a client.`,
    ).toEqual(["o-pub"]);
  });

  it("admits an all-public option set unchanged (no over-block — Act A is byte-identical today)", () => {
    const all: OptionRow[] = [PUBLIC_OPTION, { id: "o-pub2", executor_statement: "Direct care staff", market_register: "public_inferred" }];
    expect(renderOnActA(all).map((o) => o.id)).toEqual(["o-pub", "o-pub2"]);
  });
});
