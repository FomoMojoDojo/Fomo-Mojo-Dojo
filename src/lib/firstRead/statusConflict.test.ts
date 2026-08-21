// GATE S3 (2026-08-20): deterministic status-conflict detection. Imports the shared module.
import { describe, it, expect } from "vitest";
import { detectConflict, isAuthoritativeHost, type StatusSignal } from "../../../supabase/functions/_shared/statusConflict";

const sig = (o: Partial<StatusSignal>): StatusSignal => ({
  id: o.id ?? "s", host: o.host ?? "example.com", operatingStatus: o.operatingStatus ?? "unknown",
  asOf: o.asOf ?? null, date: o.date ?? null, quote: o.quote ?? "", referencesEntity: o.referencesEntity ?? true,
  operatingFramed: o.operatingFramed ?? false,
});

describe("S3 — authoritative host recognition", () => {
  it("yelp / google / apple / corner.inc / tripadvisor are authoritative; a random blog is not", () => {
    for (const h of ["yelp.com", "maps.google.com", "apple.com", "corner.inc", "tripadvisor.com"]) {
      expect(isAuthoritativeHost(h)).toBe(true);
    }
    expect(isAuthoritativeHost("joe.coffee")).toBe(false);
    expect(isAuthoritativeHost("somefoodblog.com")).toBe(false);
  });
});

describe("S3 — detectConflict falsification", () => {
  it("closed-authoritative + open-other → EXACTLY one conflict, both sets attached", () => {
    const r = detectConflict([
      sig({ id: "closed", host: "yelp.com", operatingStatus: "permanently_closed", asOf: "2026-07-01", date: "2026-07-01", quote: "CLOSED" }),
      sig({ id: "open", host: "ubereats.com", operatingFramed: true, date: "2026-08-01", quote: "delivery available" }),
    ]);
    expect(r.fires).toBe(true);
    expect(r.closed.map((c) => c.id)).toEqual(["closed"]);
    expect(r.open.map((o) => o.id)).toEqual(["open"]);
    expect(r.closureDate).toBe("2026-07-01");
  });

  it("closed-ONLY (no operating mention) → does NOT fire", () => {
    const r = detectConflict([
      sig({ id: "closed", host: "yelp.com", operatingStatus: "permanently_closed", asOf: "2026-07-01" }),
    ]);
    expect(r.fires).toBe(false);
  });

  it("closure OLDER than all operating mentions, authoritative host → STILL fires (dates attached)", () => {
    const r = detectConflict([
      sig({ id: "closed", host: "corner.inc", operatingStatus: "temporarily_closed", asOf: "2026-01-30", date: "2026-01-30" }),
      sig({ id: "open", host: "cafebarra.com", operatingFramed: true, date: "2026-08-01", quote: "teaming up" }),
    ]);
    expect(r.fires).toBe(true);
    expect(r.closureDate).toBe("2026-01-30");
    expect(r.open.map((o) => o.id)).toEqual(["open"]);
  });

  it("closed by a NON-authoritative host only → does NOT fire (joe.coffee alone)", () => {
    const r = detectConflict([
      sig({ id: "closed", host: "joe.coffee", operatingStatus: "temporarily_closed", asOf: "2026-01-30" }),
      sig({ id: "open", host: "ubereats.com", operatingFramed: true, date: "2026-08-01" }),
    ]);
    expect(r.fires).toBe(false);
  });

  it("operating mention BEFORE the closure (stale) → excluded; if it's the only one, no fire", () => {
    const r = detectConflict([
      sig({ id: "closed", host: "yelp.com", operatingStatus: "permanently_closed", asOf: "2026-07-01" }),
      sig({ id: "stale-open", host: "cafebarra.com", operatingFramed: true, date: "2026-01-01" }),
    ]);
    expect(r.fires).toBe(false); // the only open mention predates the closure → not a live conflict
  });
});
