// Gate E1 — pins are validated, audited, and self-clearing; the score records where its set came from.
//
// THE CASE: on 2026-07-28 an operator pinned 'dmk-families-and-caregivers-of-at-risk-youth' for
// Edgewood — a market-definition key that never had job steps. Nothing rejected it, nothing recorded
// who did it (chosen_by was NULL fleet-wide), and both resolvers treated it as "no choice" silently
// for six weeks. A choice is a decision moment: it must be about something real, and it must be
// recorded — including when it stops being valid.
import { describe, it, expect, vi, beforeEach } from "vitest";

// A fake supabase: records inserts/deletes, answers getUser.
const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const api: Record<string, unknown> = {
      insert: (row: unknown) => { calls.push({ table, op: "insert", payload: row }); return Promise.resolve({ error: null }); },
      delete: () => { calls.push({ table, op: "delete" }); return api; },
      eq: () => api,
      then: (res: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(res),
    };
    return api;
  };
  return {
    supabase: {
      from: builder,
      auth: { getUser: async () => ({ data: { user: { id: "u-1", email: "bob@fomomojodojo.com" } } }) },
    },
  };
});

import { resolveChosenSet, clearStalePin, currentActor, PIN_CLEARED_STALE_NOTE, DEFAULT_SEED_NOTE } from "./chosenJobStepSet";

beforeEach(() => { calls.length = 0; });

describe("resolveChosenSet — unchanged, the single authority", () => {
  it("a pin whose set exists is an operator choice", () => {
    expect(resolveChosenSet("customer", ["customer", "internal"])).toEqual({ chosenKey: "customer", source: "operator" });
  });
  it("Edgewood's pin — a set that does not exist — is NOT a choice, and never a heuristic", () => {
    expect(resolveChosenSet("dmk-families-and-caregivers-of-at-risk-youth", ["customer", "internal"]))
      .toEqual({ chosenKey: null, source: null });
  });
});

describe("stale pins clear with an audit row (Gate E1)", () => {
  // RED ON REVERT
  it("(gE1) clearStalePin writes action=cleared_stale naming the missing set, then deletes the pin", async () => {
    await clearStalePin("3dd2cfbb-0792-4bf1-9cd4-15db9646874b", "dmk-families-and-caregivers-of-at-risk-youth", "bob@fomomojodojo.com");
    const audit = calls.find((c) => c.table === "operator_primary_selection_audit" && c.op === "insert");
    expect(audit).toBeTruthy();
    expect(audit!.payload).toMatchObject({
      company_id: "3dd2cfbb-0792-4bf1-9cd4-15db9646874b",
      domain: "job_step_set",
      item_key: "dmk-families-and-caregivers-of-at-risk-youth",
      action: "cleared_stale",
      actor: "bob@fomomojodojo.com",
    });
    expect(String((audit!.payload as { reason: string }).reason)).toMatch(/no job steps/);
    // audit BEFORE delete — the record exists before the thing it records is gone
    const auditIdx = calls.indexOf(audit!);
    const delIdx = calls.findIndex((c) => c.table === "operator_primary_selection" && c.op === "delete");
    expect(delIdx).toBeGreaterThan(auditIdx);
  });

  // RED ON REVERT
  it("(gE1) the actor is the signed-in operator, never null when a session exists", async () => {
    expect(await currentActor()).toBe("bob@fomomojodojo.com");
  });

  it("(gE1) the signed strings", () => {
    expect(PIN_CLEARED_STALE_NOTE).toBe("The set you chose no longer exists — choose again");
    expect(DEFAULT_SEED_NOTE).toBe("Not chosen — showing the largest set");
  });
});
