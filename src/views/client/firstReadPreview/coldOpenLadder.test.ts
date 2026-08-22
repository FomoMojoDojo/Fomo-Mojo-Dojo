// GATE (2026-08-22): the beat-1 cold open is a deterministic ladder, FIRST MATCH WINS —
//   (1) active status conflict → the disputed-location line + STATUS DISPUTED chip;
//   (2) own-words statements exist → the echo-gap line (counts are beat 4's STATEMENT numbers);
//   (3) else the strongest-signal fallback, unchanged.
// These pins cover all three rungs, the echo-gap variants, precedence, and the two proof companies
// (CB2 → rung 1; Edgewood → rung 2 with the operator's expected "31 … echoes 1").
import { describe, it, expect } from "vitest";
import { coldOpenLadder, type ColdOpenLadderInput } from "./mapping";
import type { FRColdOpen } from "./types";

const FALLBACK: FRColdOpen = { text: "A strong outside signal.", sourceTag: { label: "example.com · June 2026" }, eventDate: "2026-06-01" };
const base = (o: Partial<ColdOpenLadderInput>): ColdOpenLadderInput => ({
  statusConflict: null, gap: null, deltasRunDate: null, fallback: FALLBACK, ...o,
});

describe("cold-open ladder", () => {
  it("rung 1 — status conflict wins: signed line, chip, count source tag, unquoted", () => {
    const c = coldOpenLadder(base({ statusConflict: { location: "Le French Rooster & Cafe Barra", closedCount: 5, openCount: 38 } }))!;
    expect(c.text).toBe("Some sources say Le French Rooster & Cafe Barra is closed. Others say it's open. Which is true today?");
    expect(c.statusDisputed).toBe(true);
    expect(c.quoted).toBe(false);
    expect(c.sourceTag).toEqual({ label: "5 reported closed · 38 still listed open" });
  });

  it("rung 1 beats rung 2 — a conflict wins even when gap statements exist", () => {
    const c = coldOpenLadder(base({
      statusConflict: { location: "The Shop", closedCount: 1, openCount: 2 },
      gap: { statements: 10, confirmed: 3, contradicted: 0 },
    }))!;
    expect(c.text).toContain("is closed. Others say it's open");
  });

  it("rung 2 — echo gap, default form (m>0): unquoted, Public-read source tag", () => {
    const c = coldOpenLadder(base({ gap: { statements: 31, confirmed: 1, contradicted: 0 }, deltasRunDate: "August 20, 2026" }))!;
    expect(c.text).toBe("You say 31 things about yourself. The public record echoes 1.");
    expect(c.quoted).toBe(false);
    expect(c.statusDisputed).toBe(false);
    expect(c.sourceTag).toEqual({ label: "Public read · August 20, 2026" });
  });

  it("rung 2 — variant m=0 → 'echoes none of them.'", () => {
    const c = coldOpenLadder(base({ gap: { statements: 7, confirmed: 0, contradicted: 0 } }))!;
    expect(c.text).toBe("You say 7 things about yourself. The public record echoes none of them.");
  });

  it("rung 2 — variant k>0 → '…echoes {m} and contradicts {k}.'", () => {
    const c = coldOpenLadder(base({ gap: { statements: 12, confirmed: 4, contradicted: 2 } }))!;
    expect(c.text).toBe("You say 12 things about yourself. The public record echoes 4 and contradicts 2.");
  });

  it("rung 2 — m=0 AND k>0 compose: 'echoes none of them and contradicts {k}.'", () => {
    const c = coldOpenLadder(base({ gap: { statements: 5, confirmed: 0, contradicted: 2 } }))!;
    expect(c.text).toBe("You say 5 things about yourself. The public record echoes none of them and contradicts 2.");
  });

  it("rung 3 — no conflict, no gap statements → the strongest-signal fallback, unchanged", () => {
    const c = coldOpenLadder(base({ gap: { statements: 0, confirmed: 0, contradicted: 0 } }));
    expect(c).toBe(FALLBACK);
    expect(coldOpenLadder(base({})).text).toBe("A strong outside signal.");
  });

  it("CB2 lands on rung 1; Edgewood lands on rung 2 with the expected 31 / echoes 1", () => {
    const cb2 = coldOpenLadder(base({
      statusConflict: { location: "Le French Rooster & Cafe Barra (2221 W Olive Ave, Burbank)", closedCount: 5, openCount: 38 },
      gap: { statements: 3, confirmed: 1, contradicted: 0 }, // CB2 has a gap too, but the conflict wins
    }))!;
    expect(cb2.text).toContain("Some sources say Le French Rooster");
    const edgewood = coldOpenLadder(base({ statusConflict: null, gap: { statements: 31, confirmed: 1, contradicted: 0 } }))!;
    expect(edgewood.text).toBe("You say 31 things about yourself. The public record echoes 1.");
  });
});
