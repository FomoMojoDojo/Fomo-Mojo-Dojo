// H3 (2026-09-09) — the companies query must survive a dropped connection, and a failed query must
// never substitute the sentinel company.
//
// WHAT BROKE: Kong logged the operator's companies request as HTTP 499 (client closed the connection,
// zero bytes). supabase-js surfaced `TypeError: Failed to fetch`. The hook's abort guard matches only
// "abort"/"aborted", so the dropped fetch fell into the hard-error branch, which set the banner AND
// installed PUBLIC_CAFE_BARRA_FALLBACK (id 00000000-0000-0000-0000-000000000001) and persisted that
// id to localStorage. First Read then linked to the sentinel and rendered "Company not found".
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  COMPANIES_BACKOFF_MS,
  COMPANIES_FETCH_ATTEMPTS,
  fetchWithTransientRetry,
  isTransientFetchError,
} from "@/lib/companies/companiesFetchRetry";

const SENTINEL = "00000000-0000-0000-0000-000000000001";

// ── the mock companies endpoint: a queue of per-attempt outcomes ─────────────────────────────────
type Outcome = { data: unknown[] | null; error: unknown };
const queue: Outcome[] = [];
let attemptCount = 0;
const ROWS = [{ id: "11111111-1111-4111-8111-111111111111", name: "Real Co", website: "https://real.co", created_by: "u1", created_at: "2026-01-01T00:00:00Z" }];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => {
          const thenable = {
            abortSignal: () => thenable,
            then: (resolve: (v: Outcome) => unknown) => {
              attemptCount++;
              const next = queue.shift() ?? { data: ROWS, error: null };
              return Promise.resolve(next).then(resolve);
            },
          };
          return thenable;
        },
      }),
    }),
  },
}));

// STABLE identity: a fresh object per render would change the useCallback deps and re-run the
// fetch effect forever (that loop is a test artefact, not a product defect).
const AUTH = Object.freeze({ user: Object.freeze({ id: "u1" }), isAdmin: true, loading: false });
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => AUTH }));

const FAILED_TO_FETCH = { message: "TypeError: Failed to fetch", name: "TypeError" };

import { CompanyProvider, useCompany } from "./useCompany";

function Probe() {
  const { companies, fetchError, loading, fetchAttempts } = useCompany();
  if (loading) return <p>loading</p>;
  return (
    <div>
      <p data-testid="names">{companies.map((c) => c.name).join(",")}</p>
      <p data-testid="ids">{companies.map((c) => c.id).join(",")}</p>
      <p data-testid="banner">{fetchError ? "Couldn't load companies — try reloading." : ""}</p>
      <p data-testid="retries">{String(fetchAttempts?.retries ?? -1)}</p>
    </div>
  );
}

// jsdom here exposes no localStorage; safeLocalStorage swallows that, so give the test a real one.
function installMemoryStorage() {
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => { map.clear(); },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
  Object.defineProperty(window, "localStorage", { value: store, configurable: true, writable: true });
  return store;
}

beforeEach(() => {
  queue.length = 0;
  attemptCount = 0;
  installMemoryStorage();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => { vi.useRealTimers(); });

describe("H3 — a dropped connection is retried, not reported", () => {
  it("planted 'Failed to fetch' on attempt 1, success on attempt 2 → no banner, no fallback, picker populated", async () => {
    queue.push({ data: null, error: FAILED_TO_FETCH });   // attempt 1 drops
    queue.push({ data: ROWS, error: null });              // attempt 2 answers

    render(<CompanyProvider><Probe /></CompanyProvider>);
    await vi.advanceTimersByTimeAsync(COMPANIES_BACKOFF_MS[0] + 50);
    await waitFor(() => expect(screen.getByTestId("names")).toBeTruthy());

    expect(attemptCount).toBe(2);
    expect(screen.getByTestId("banner").textContent).toBe("");          // no banner
    expect(screen.getByTestId("names").textContent).toBe("Real Co");    // picker populated
    expect(screen.getByTestId("ids").textContent).not.toContain(SENTINEL); // no fallback
    expect(window.localStorage.getItem("active_company_id")).not.toBe(SENTINEL);
  });

  it("failure on all 3 → banner, NO fallback company, localStorage untouched", async () => {
    for (let i = 0; i < COMPANIES_FETCH_ATTEMPTS; i++) queue.push({ data: null, error: FAILED_TO_FETCH });

    render(<CompanyProvider><Probe /></CompanyProvider>);
    await vi.advanceTimersByTimeAsync(COMPANIES_BACKOFF_MS[0] + COMPANIES_BACKOFF_MS[1] + 100);
    await waitFor(() => expect(screen.getByTestId("banner").textContent).toContain("Couldn't load companies"));

    expect(attemptCount).toBe(COMPANIES_FETCH_ATTEMPTS);
    expect(screen.getByTestId("ids").textContent).not.toContain(SENTINEL); // the whole point
    expect(screen.getByTestId("names").textContent).not.toContain("Cafe Barra");
    expect(window.localStorage.getItem("active_company_id")).toBeNull();  // untouched
  });

  it("VACUOUS PROOF — remove the plant and the retry counter reads 0", async () => {
    // No plant: the first attempt answers, so nothing is retried. If this read anything but 0 the
    // test above would prove nothing about the retry.
    render(<CompanyProvider><Probe /></CompanyProvider>);
    await waitFor(() => expect(screen.getByTestId("names").textContent).toBe("Real Co"));

    expect(attemptCount).toBe(1);
    expect(screen.getByTestId("retries").textContent).toBe("0");
    expect(screen.getByTestId("banner").textContent).toBe("");
  });

  it("a stored sentinel id is cleared on load", async () => {
    window.localStorage.setItem("active_company_id", SENTINEL);
    render(<CompanyProvider><Probe /></CompanyProvider>);
    await waitFor(() => expect(screen.getByTestId("names").textContent).toBe("Real Co"));
    expect(window.localStorage.getItem("active_company_id")).not.toBe(SENTINEL);
  });
});

describe("H3 — transient classification", () => {
  it("classifies dropped connections and gateway codes as transient", () => {
    for (const e of [
      { message: "TypeError: Failed to fetch", name: "TypeError" },
      { message: "NetworkError when attempting to fetch resource." },
      { message: "Load failed" },
      { message: "fetch failed" },
      { status: 499 }, { status: 502 }, { status: 503 }, { status: 504 },
    ]) expect(isTransientFetchError(e)).toBe(true);
  });

  it("does NOT retry a real error — it fails fast, exactly as before", async () => {
    let calls = 0;
    const r = await fetchWithTransientRetry<unknown[]>({
      run: () => { calls++; return Promise.resolve({ data: null, error: { message: 'permission denied for table "companies"', code: "42501" } }); },
      sleep: () => Promise.resolve(),
    });
    expect(calls).toBe(1);
    expect(r.attempts).toBe(1);
    expect(r.retries).toBe(0);
    expect(r.error).not.toBeNull();
  });

  it("an abort is never transient (the caller's own cancellation wins)", () => {
    expect(isTransientFetchError({ message: "AbortError: The operation was aborted." })).toBe(false);
  });

  it("consumes the backoff schedule in order and stops after the last attempt", async () => {
    const waits: number[] = [];
    const r = await fetchWithTransientRetry<unknown[]>({
      run: () => Promise.resolve({ data: null, error: FAILED_TO_FETCH }),
      sleep: (ms) => { waits.push(ms); return Promise.resolve(); },
    });
    expect(r.attempts).toBe(3);
    expect(r.retries).toBe(2);
    expect(waits).toEqual([1000, 3000]); // no wait after the final attempt — nothing follows it
  });
});
