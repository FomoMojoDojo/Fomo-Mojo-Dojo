// First Read ROLLUP (Gate 2) — per-theme featured-item render. Pointer set → lead + card; pointer
// absent → no lead/ghost + internal prompt (admin only); pointed-item vanished → nothing renders +
// internal MISSING flag (falsification: plant a pointer at an identity no item carries).
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const cap = vi.hoisted(() => ({ ret: null as Record<string, unknown> | null }));
const env = vi.hoisted(() => ({ isAdmin: false, featured: {} as Record<string, { itemIdentity: string; note: string | null }> }));

vi.mock("@/hooks/useFirstReadCapture", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useFirstReadCapture: () => cap.ret };
});
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: env.isAdmin }) }));
vi.mock("@/hooks/useFeaturedItems", () => ({
  useFeaturedItems: () => ({ featured: env.featured, feature: async () => null, unfeature: async () => null, loading: false, error: null, refetch: async () => {} }),
}));

import TheCheckAct from "./TheCheckAct";
import { theme2Lead, THEME_3_LEAD, NO_FEATURED_PROMPT, FEATURED_MISSING_PROMPT } from "@/lib/firstRead/themeCopy";

const finding = (id: string, text: string) => ({ kind: "finding", ref: id, identity: id, text, verdict: null, correctionText: null, capturedAt: null });
const iSilent = (id: string, see: string) => ({
  kind: "delta", ref: id, identity: id, text: see, verdict: null, correctionText: null, capturedAt: null,
  delta: { deltaType: "internally_silent", say: "", see, quote: null, quoteSourceText: null, eventDate: null },
});

const items = [
  iSilent("os-1", "City froze placements after 2019."),
  iSilent("os-2", "A second outside-raised item."),
  finding("find-1", "We serve small independent cafes."),
  finding("find-2", "A second finding here."),
];

const baseCap = {
  items,
  tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 },
  loading: false, identityError: null, frozen: false, sessionStatus: null,
  setVerdict: async () => null, refetchResponses: async () => {},
  deltaState: { status: "ready", data: [] },
};

afterEach(() => { cap.ret = null; env.isAdmin = false; env.featured = {}; });

describe("TheCheckAct — Gate 2 featured items", () => {
  it("pointer SET → lead line + featured card; the featured item drops out of the '…and N more' tail", () => {
    cap.ret = { ...baseCap };
    env.featured = { outside_raised: { itemIdentity: "os-1", note: null }, findings: { itemIdentity: "find-1", note: null } };
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    const text = container.textContent || "";
    // Theme 2 lead uses the TOTAL count (2 outside items); the featured card carries the statement.
    expect(text).toContain(theme2Lead(2));
    expect(text).toContain("City froze placements after 2019.");
    // Theme 3 lead + featured finding.
    expect(text).toContain(THEME_3_LEAD);
    expect(text).toContain("We serve small independent cafes.");
    // Featured cards exist; the tail shows the OTHER item collapsed.
    expect(container.querySelectorAll(".cvs-theme-featured").length).toBe(2);
    expect(text).toContain("…and 1 more like this"); // one remaining per theme
  });

  it("pointer ABSENT + admin → internal 'no featured' prompt, no lead, no card, no ghost", () => {
    cap.ret = { ...baseCap };
    env.isAdmin = true; env.featured = {};
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    const text = container.textContent || "";
    expect(text).toContain(NO_FEATURED_PROMPT);
    expect(container.querySelector(".cvs-theme-featured")).toBeNull();
    expect(text).not.toContain(theme2Lead(2));
  });

  it("pointer ABSENT + NON-admin (client) → no prompt, no lead, no card (Gate-1 state only)", () => {
    cap.ret = { ...baseCap };
    env.isAdmin = false; env.featured = {};
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    const text = container.textContent || "";
    expect(text).not.toContain(NO_FEATURED_PROMPT);
    expect(text).not.toContain(FEATURED_MISSING_PROMPT);
    expect(container.querySelector(".cvs-theme-featured")).toBeNull();
    expect(text).not.toContain(THEME_3_LEAD);
    // the items still render in the tail (Gate-1)
    expect(text).toContain("We serve small independent cafes.");
  });

  it("pointer set but item VANISHED → nothing featured, no ghost; admin sees the MISSING flag (falsification)", () => {
    cap.ret = { ...baseCap };
    env.isAdmin = true;
    // outside_raised points at a vanished item; findings points at a real one (so NO theme is in
    // the "absent" state — this isolates MISSING from ABSENT).
    env.featured = { outside_raised: { itemIdentity: "GHOST-does-not-exist", note: null }, findings: { itemIdentity: "find-1", note: null } };
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    const text = container.textContent || "";
    expect(text).toContain(FEATURED_MISSING_PROMPT);
    expect(text).not.toContain(NO_FEATURED_PROMPT);          // missing != absent (neither theme is absent)
    // No stale ghost: the ghost identity resolves to no card, and both outside items stay in the tail.
    expect(container.querySelector(".cvs-theme-featured-outside")).toBeNull();
    expect(text).toContain("City froze placements after 2019."); // still in the tail, not consumed
  });

  it("client (non-admin) NEVER sees the picker affordance", () => {
    cap.ret = { ...baseCap };
    env.isAdmin = false; env.featured = {};
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(container.querySelector(".cvs-feature-this")).toBeNull();
  });

  it("admin sees a 'Feature this' picker on each expanded item", () => {
    cap.ret = { ...baseCap };
    env.isAdmin = true; env.featured = {};
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(container.querySelectorAll(".cvs-feature-this").length).toBeGreaterThan(0);
  });
});

describe("Gate 2 lead strings — byte-exact", () => {
  it("theme2Lead + THEME_3_LEAD", () => {
    expect(theme2Lead(5)).toBe("The public record raised 5 things you haven't yet spoken to. This is the one worth starting with:");
    expect(theme2Lead(5)).not.toContain("{N}");
    expect(THEME_3_LEAD).toBe("From everything we read, this is what stood up. The one that matters most:");
  });
});
