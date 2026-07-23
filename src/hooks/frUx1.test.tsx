// FR-UX-1 — verdict toggle-off + sticky nav.
//
// Toggle-off is exercised through the REAL useFirstReadCapture + setVerdict against
// a stateful in-memory fake of first_read_responses (with the freeze trigger's
// behavior simulated), so the full chain (re-tap → delete → refetch → item.verdict
// null → tally decrement) is proven end-to-end. Stand-down of the note/lift and the
// contest-feed / nav concerns are covered by focused render/unit assertions.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act, render } from "@testing-library/react";

// ── Stateful fake supabase (first_read_responses + first_read_sessions) ──────
const h = vi.hoisted(() => {
  const store: { responses: Record<string, unknown>[]; status: string } = { responses: [], status: "open" };
  const frozen = () => store.status !== "open";
  function respBuilder() {
    // deno-lint-ignore no-explicit-any
    const st: any = { _f: {}, _mode: null, _payload: null };
    st.select = () => st;
    st.eq = (k: string, v: unknown) => { st._f[k] = v; return st; };
    st.upsert = (p: Record<string, unknown>) => { st._mode = "upsert"; st._payload = p; return st; };
    st.delete = () => { st._mode = "delete"; return st; };
    st.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      let out: unknown;
      if (st._mode === "upsert" || st._mode === "delete") {
        if (frozen()) {
          out = { error: { message: "first_read_responses is frozen: session is proposal_issued" } };
        } else if (st._mode === "upsert") {
          const p = st._payload;
          store.responses = store.responses.filter(
            (r) => !(r.session_id === p.session_id && r.item_identity === p.item_identity),
          );
          store.responses.push({ ...p, captured_at: "2026-07-23T00:00:00Z" });
          out = { error: null };
        } else {
          store.responses = store.responses.filter(
            (r) => !Object.entries(st._f).every(([k, v]) => r[k] === v),
          );
          out = { error: null };
        }
      } else {
        const rows = store.responses.filter((r) => Object.entries(st._f).every(([k, v]) => r[k] === v));
        out = { data: rows, error: null };
      }
      return Promise.resolve(out).then(res, rej);
    };
    return st;
  }
  function sessBuilder() {
    // deno-lint-ignore no-explicit-any
    const st: any = {};
    st.select = () => st;
    st.eq = () => st;
    st.maybeSingle = () => Promise.resolve({ data: { status: store.status }, error: null });
    return st;
  }
  return {
    store,
    supabase: { from: (t: string) => (t === "first_read_responses" ? respBuilder() : sessBuilder()) },
  };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: h.supabase }));
vi.mock("@/hooks/useStandingFindings", () => ({ useStandingFindings: () => ({ data: { findings: [] } }) }));
vi.mock("@/hooks/useMarketOptions", () => ({ useMarketOptions: () => ({ options: [] }) }));
vi.mock("@/hooks/usePositioningCanvas", () => ({ usePositioningCanvas: () => ({ item: null }) }));
vi.mock("@/lib/firstRead/checkItems", async (orig) => {
  const actual = await orig<typeof import("@/lib/firstRead/checkItems")>();
  return { ...actual, assembleCheckItems: () => [{ kind: "finding", ref: "r1", text: "Fixture finding" }] };
});

import { useFirstReadCapture, type CheckItem } from "./useFirstReadCapture";
import { contentIdentity } from "../../supabase/functions/_shared/contentIdentity";
import { deriveContests, type FeedResponse, type ObservedClaim } from "../../supabase/functions/_shared/contestFeed";
import CheckItemRow from "@/components/client-view/story/check/CheckItemRow";
import FirstReadNav from "@/views/FirstReadView/FirstReadNav";

let ID = "";
beforeEach(async () => {
  ID = await contentIdentity("Fixture finding");
  h.store.responses = [
    { session_id: "s1", company_id: "c1", item_identity: ID, verdict: "confirmed", correction_text: null, captured_at: "2026-07-23T00:00:00Z" },
  ];
  h.store.status = "open";
});

describe("FR-UX-1 GOAL 1 — verdict toggle-off (open session)", () => {
  it("re-tapping the stored verdict DELETES the row: finding unanswered, tally decrements", async () => {
    const { result } = renderHook(() => useFirstReadCapture("c1", "s1"));
    await waitFor(() => expect(result.current.items[0]?.verdict).toBe("confirmed"));
    expect(result.current.tally.confirmed).toBe(1);

    await act(async () => { await result.current.setVerdict(result.current.items[0], "confirmed"); });

    await waitFor(() => expect(result.current.items[0]?.verdict).toBeNull());
    expect(result.current.tally.confirmed).toBe(0);
    expect(h.store.responses).toHaveLength(0); // the row is gone, not just re-written

    // FALSIFICATION: a DIFFERENT verdict does NOT delete — it replaces in place (1 row).
    h.store.responses = [
      { session_id: "s1", company_id: "c1", item_identity: ID, verdict: "confirmed", correction_text: null, captured_at: "x" },
    ];
    const { result: r2 } = renderHook(() => useFirstReadCapture("c1", "s1"));
    await waitFor(() => expect(r2.current.items[0]?.verdict).toBe("confirmed"));
    await act(async () => { await r2.current.setVerdict(r2.current.items[0], "rejected"); });
    await waitFor(() => expect(r2.current.items[0]?.verdict).toBe("rejected"));
    expect(h.store.responses).toHaveLength(1); // replaced, not a second row, not deleted
  });

  it("issued session REFUSES toggle-off — locked message, row untouched", async () => {
    h.store.status = "proposal_issued";
    const { result } = renderHook(() => useFirstReadCapture("c1", "s1"));
    await waitFor(() => expect(result.current.items[0]?.verdict).toBe("confirmed"));
    let msg: string | null = "";
    await act(async () => { msg = await result.current.setVerdict(result.current.items[0], "confirmed"); });
    expect(msg).toMatch(/locked/i);
    expect(h.store.responses).toHaveLength(1); // freeze governs — nothing deleted
  });
});

describe("FR-UX-1 GOAL 1 — note + lift stand down when the verdict clears", () => {
  const base: CheckItem = { kind: "finding", ref: "r1", text: "A finding", identity: "id-1", verdict: null, correctionText: null, capturedAt: null };

  it("a confirmed finding shows the evidenced lift; cleared → no lift, no note", () => {
    const confirmed = render(<CheckItemRow item={{ ...base, verdict: "confirmed", capturedAt: "2026-07-23T00:00:00Z" }} onSet={() => {}} />);
    expect(confirmed.container.querySelector(".cvs-check-lift")).toBeTruthy();

    const cleared = render(<CheckItemRow item={base} onSet={() => {}} />);
    expect(cleared.container.querySelector(".cvs-check-lift")).toBeNull();
    expect(cleared.container.querySelector(".cvs-check-notimportant-note")).toBeNull();
    expect(cleared.container.querySelector(".cvs-check-rejected-note")).toBeNull();
  });

  it("a set-aside note disappears when the verdict clears", () => {
    const setAside = render(<CheckItemRow item={{ ...base, verdict: "not_important", capturedAt: "2026-07-23T00:00:00Z" }} onSet={() => {}} />);
    expect(setAside.container.querySelector(".cvs-check-notimportant-note")).toBeTruthy();
    const cleared = render(<CheckItemRow item={base} onSet={() => {}} />);
    expect(cleared.container.querySelector(".cvs-check-notimportant-note")).toBeNull();
  });
});

describe("FR-UX-1 GOAL 1b — deleted row births no contest", () => {
  const CLAIM: ObservedClaim = { id: "claim-1", identity: "id-1" };
  it("a toggled-off (absent) reject is not considered by the feed", () => {
    // after toggle-off the row is gone → it is simply absent from the feed's input
    const afterToggle: FeedResponse[] = [];
    expect(deriveContests({ responses: afterToggle, publicByIdentity: new Map([[CLAIM.identity, CLAIM]]), existingClaimIds: [] }).births).toHaveLength(0);
    // FALSIFICATION: had the reject survived, it WOULD birth
    const surviving: FeedResponse[] = [{ id: "resp-1", verdict: "rejected", item_identity: "id-1" }];
    expect(deriveContests({ responses: surviving, publicByIdentity: new Map([[CLAIM.identity, CLAIM]]), existingClaimIds: [] }).births).toHaveLength(1);
  });
});

describe("FR-UX-1 GOAL 2 — sticky nav", () => {
  const navbar = (c: HTMLElement) => c.querySelector(".cvs-fr-navbar") as HTMLElement | null;
  const hasNext = (c: HTMLElement) => Array.from(c.querySelectorAll("button")).some((b) => (b.textContent || "").includes("Next"));

  it("nav is fixed to the viewport bottom; last-act Next still absent", () => {
    const last = render(<FirstReadNav step={4} total={5} onBack={() => {}} onNext={() => {}} />);
    const bar = navbar(last.container);
    expect(bar).toBeTruthy();
    expect(bar!.style.position).toBe("fixed");
    expect(bar!.style.bottom).toBe("0px");
    expect(hasNext(last.container)).toBe(false); // last act: no Next

    const mid = render(<FirstReadNav step={2} total={5} onBack={() => {}} onNext={() => {}} />);
    expect(navbar(mid.container)!.style.position).toBe("fixed");
    expect(hasNext(mid.container)).toBe(true); // non-last: Next present
  });
});
