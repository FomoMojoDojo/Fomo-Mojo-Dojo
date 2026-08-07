// HONEST IDENTITY-COMPUTE GATE — render mapping. The item area is hashed for identity via
// contentIdentity → crypto.subtle, which is UNDEFINED on insecure origins. The hook now records
// that as `identityError`; TheCheckAct routes the item area through <ActData> so the failure
// terminates into the signed ACT_DATA_ERROR instead of the eternal "Loading items…" string.
// (The hook-side catch/finally — the crux — is falsified in useFirstReadCapture.identity.test.tsx.)
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const cap = vi.hoisted(() => ({ ret: null as Record<string, unknown> | null }));
vi.mock("@/hooks/useFirstReadCapture", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useFirstReadCapture: () => cap.ret };
});

// ROLLUP Gate 2: TheCheckAct reads auth + featured pointers — stub both (non-admin, none featured).
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/useFeaturedItems", () => ({
  useFeaturedItems: () => ({ featured: {}, feature: async () => null, unfeature: async () => null, ratify: async () => null, ensureDefaults: async () => {}, loading: false, error: null, refetch: async () => {} }),
}));

import TheCheckAct from "./TheCheckAct";
import { ACT_DATA_ERROR } from "../ActData";

const LOADING_LINE = "Loading items…";
const base = (over: Record<string, unknown>) => ({
  items: [],
  tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 },
  loading: false,
  identityError: null,
  frozen: false,
  sessionStatus: null,
  setVerdict: async () => null,
  refetchResponses: async () => {},
  deltaState: { status: "ready", data: [] },
  ...over,
});

afterEach(() => { cap.ret = null; });

describe("TheCheckAct — identity-compute failure terminates into the signed error", () => {
  it("(a) identityError set (crypto.subtle undefined) → signed ACT_DATA_ERROR, NOT the loading string", () => {
    cap.ret = base({ identityError: "crypto.subtle is undefined", loading: false });
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(LOADING_LINE);
  });

  it("still loading, no error yet → the loading line, not the error", () => {
    cap.ret = base({ loading: true, identityError: null });
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).toContain(LOADING_LINE);
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });

  it("(b) normal path: identities computed → items render; no error, no loading line", () => {
    const item = { kind: "finding", ref: "f1", identity: "id-1", text: "We serve small independent cafes.", verdict: null, correctionText: null, capturedAt: null };
    cap.ret = base({ items: [item], loading: false, identityError: null });
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).toContain("We serve small independent cafes.");
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(LOADING_LINE);
  });
});
