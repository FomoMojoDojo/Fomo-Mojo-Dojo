// Dispute-refresh (2026-08-26) — the five can-fail proofs for render-side liveness honoring of the
// status-conflict overlay. Each MUST fail if its rule is reverted.
import { describe, expect, it } from "vitest";
import {
  classifyCitation,
  foldByHostDate,
  refreshStatusConflictLiveness,
  type CitationLiveness,
  type RawStatusSource,
} from "./mapping";

// Real supersession shapes from the CB2 corpus.
const TERMINAL_FAB: CitationLiveness = { held_at: null, superseded_at: "2026-08-26", superseded_reason: "e4_fabricated_append" };
const TERMINAL_REDESIGN: CitationLiveness = { held_at: null, superseded_at: "2026-08-26", superseded_reason: "own_site_redesign_2026_08" };
const PROVISIONAL_RECRAWL: CitationLiveness = { held_at: null, superseded_at: "2026-08-26", superseded_reason: "held_source_unreachable_recrawl_pending" };
const PROVISIONAL_HELD: CitationLiveness = { held_at: "2026-08-26", superseded_at: null, superseded_reason: null };
const LIVE: CitationLiveness = { held_at: null, superseded_at: null, superseded_reason: null };

const src = (host: string, sid: string): RawStatusSource => ({ host, date: "2026-08-18", quote: `${host} quote`, signal_id: sid });

describe("classifyCitation — three-way liveness", () => {
  it("terminal / provisional / live", () => {
    expect(classifyCitation(TERMINAL_FAB)).toBe("terminal");
    expect(classifyCitation(TERMINAL_REDESIGN)).toBe("terminal");
    expect(classifyCitation(PROVISIONAL_RECRAWL)).toBe("provisional");
    expect(classifyCitation(PROVISIONAL_HELD)).toBe("provisional");
    expect(classifyCitation(LIVE)).toBe("live");
    expect(classifyCitation(null)).toBe("terminal"); // missing/untraceable → drop
  });
});

describe("dispute-refresh — five can-fail proofs", () => {
  const liveness = new Map<string, CitationLiveness>([
    ["fab", TERMINAL_FAB], ["redesign", TERMINAL_REDESIGN],
    ["recrawl", PROVISIONAL_RECRAWL], ["held", PROVISIONAL_HELD], ["live", LIVE],
  ]);
  const raw = {
    location: "Le French Rooster & Cafe Barra (2221 W Olive Ave, Burbank)",
    matchKey: "le french rooster",
    question: "Some sources say it is closed; others still list it open. Which is true?",
    closed: [src("corner.inc", "recrawl"), src("yelp.com", "live")],       // 1 provisional + 1 live
    open: [src("cafebarra.com", "fab"), src("lefrenchrooster.com", "live"), src("cafebarra.com", "redesign")],
  };

  it("PROOF 1 — a planted fabricated citation VANISHES from the panel", () => {
    const out = refreshStatusConflictLiveness(raw, liveness)!;
    expect(out).not.toBeNull();
    const hosts = [...out.closed, ...out.open].map((s) => s.quote);
    expect(hosts.some((q) => q.startsWith("cafebarra.com"))).toBe(false); // both cafebarra citations were terminal (fab + redesign)
    expect(out.open).toHaveLength(1); // only the live lefrenchrooster survives
  });

  it("PROOF 2 — a LIVE citation SURVIVES", () => {
    const out = refreshStatusConflictLiveness(raw, liveness)!;
    expect(out.closed.some((s) => s.host === "yelp.com" && !s.provisional)).toBe(true);
    expect(out.open.some((s) => s.host === "lefrenchrooster.com" && !s.provisional)).toBe(true);
  });

  it("PROOF 3 — a PROVISIONAL citation is MARKED, not counted live", () => {
    const out = refreshStatusConflictLiveness(raw, liveness)!;
    const recrawl = out.closed.find((s) => s.host === "corner.inc");
    expect(recrawl?.provisional).toBe(true);
  });

  it("PROOF 4 — a dispute whose closed side is entirely TERMINAL RETIRES (null)", () => {
    const allTerminalClosed = { ...raw, closed: [src("corner.inc", "fab"), src("yelp.com", "redesign")] };
    expect(refreshStatusConflictLiveness(allTerminalClosed, liveness)).toBeNull();
  });

  it("PROOF 5 — inertness: a company with no conflict rows yields no conflicts (Edgewood)", () => {
    const rows: typeof raw[] = [];
    const result = rows.map((r) => refreshStatusConflictLiveness(r, liveness)).filter((c) => c !== null);
    expect(result).toEqual([]);
    // and a provisional-only closed side is NOT retired (awaiting-evidence ≠ the-world-moved)
    const provisionalClosed = { ...raw, closed: [src("corner.inc", "recrawl"), src("yelp.com", "held")] };
    expect(refreshStatusConflictLiveness(provisionalClosed, liveness)).not.toBeNull();
  });
});

describe("fold marking — the provisional mark survives display folding", () => {
  it("live and provisional at the same host+date do NOT fold together", () => {
    const folded = foldByHostDate([
      { host: "corner.inc", date: "2026-08-18", provisional: true },
      { host: "corner.inc", date: "2026-08-18", provisional: false },
    ]);
    expect(folded).toHaveLength(2);
    expect(folded.find((g) => g.provisional)?.count).toBe(1);
  });
});
