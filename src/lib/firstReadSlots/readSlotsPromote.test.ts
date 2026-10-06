// SLOT PROMOTE / SIGN / REJECT (R1, R6; signed 2026-10-05), over a FAKE client — the same technique
// _shared/publicReadPromote.ts was written for ("pure over a client shape so a fake client can
// exercise the whole promote path"). The rules under test:
//   * promote IS the signature: is_current, signed_at and signed_by are set together
//   * promote supersedes the prior current slot, stamping why
//   * STALE SOURCE REFUSAL: a slot staged against read X is never promoted once Y is current
//   * the refusal is decided BEFORE any write — nothing is flipped on a refused promote
import { describe, it, expect } from "vitest";
import {
  promoteStagedSlots, rejectStagedSlots, SlotPromoteRefused,
} from "../../../supabase/functions/_shared/readSlotsPromote";

type Row = Record<string, unknown>;
type Update = { table: string; patch: Row; id: string };

/** A fake PostgREST-ish client over two in-memory tables, recording every update in order. */
function fakeClient(tables: { first_read_slots: Row[]; public_reads: Row[] }) {
  const updates: Update[] = [];
  const build = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let isNullCol: string | null = null;
    let patch: Row | null = null;
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (c: string, v: unknown) => { filters.push([c, v]); return api; },
      is: (c: string, _v: null) => { isNullCol = c; return api; },
      order: () => api,
      limit: () => api,
      update: (p: Row) => { patch = p; return api; },
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (res: (v: { data: unknown; error: null }) => unknown) => {
        // an .update(...).eq(...) chain awaited directly
        if (patch) {
          for (const r of rows()) { Object.assign(r, patch); updates.push({ table, patch: patch!, id: String(r.id) }); }
        }
        return Promise.resolve({ data: null, error: null }).then(res);
      },
    };
    const rows = () => (tables as Record<string, Row[]>)[table].filter((r) =>
      filters.every(([c, v]) => r[c] === v) && (isNullCol === null || r[isNullCol] == null));
    return api;
  };
  return { client: { from: (t: string) => build(t) }, updates };
}

const SIGNER = "11111111-1111-4111-8111-111111111111";
const CO = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";

describe("promoteStagedSlots", () => {
  it("flips the staged slot current AND stamps the signature in one update", async () => {
    const staged = { id: "slot-new", company_id: CO, kind: "strategy", is_current: false, superseded_at: null, source_read_id: "read-cur" };
    const { client, updates } = fakeClient({
      first_read_slots: [staged],
      public_reads: [{ id: "read-cur", company_id: CO, kind: "strategy", is_current: true }],
    });
    const { promoted } = await promoteStagedSlots(client, CO, ["strategy"], SIGNER, "looks right");
    expect(promoted).toEqual([{ kind: "strategy", staged: "slot-new", superseded: null }]);
    const flip = updates.find((u) => u.id === "slot-new")!;
    expect(flip.patch.is_current).toBe(true);
    expect(flip.patch.signed_by).toBe(SIGNER);
    expect(typeof flip.patch.signed_at).toBe("string");
    expect(flip.patch.sign_note).toBe("looks right");
  });

  it("supersedes the prior current slot, stamping slot_promoted", async () => {
    const prior = { id: "slot-old", company_id: CO, kind: "strategy", is_current: true, superseded_at: null, source_read_id: "read-cur" };
    const staged = { id: "slot-new", company_id: CO, kind: "strategy", is_current: false, superseded_at: null, source_read_id: "read-cur" };
    const { client, updates } = fakeClient({
      first_read_slots: [staged, prior],
      public_reads: [{ id: "read-cur", company_id: CO, kind: "strategy", is_current: true }],
    });
    const { promoted } = await promoteStagedSlots(client, CO, ["strategy"], SIGNER);
    expect(promoted[0].superseded).toBe("slot-old");
    const sup = updates.find((u) => u.id === "slot-old")!;
    expect(sup.patch.is_current).toBe(false);
    expect(sup.patch.superseded_by).toBe("slot-new");
    expect(sup.patch.superseded_reason).toBe("slot_promoted");
  });

  it("REFUSES a slot whose source read is no longer current, and writes nothing", async () => {
    const staged = { id: "slot-stale", company_id: CO, kind: "strategy", is_current: false, superseded_at: null, source_read_id: "read-old" };
    const { client, updates } = fakeClient({
      first_read_slots: [staged],
      public_reads: [{ id: "read-new", company_id: CO, kind: "strategy", is_current: true }],
    });
    await expect(promoteStagedSlots(client, CO, ["strategy"], SIGNER)).rejects.toThrow(SlotPromoteRefused);
    expect(updates).toEqual([]);          // decided BEFORE any write
    expect(staged.is_current).toBe(false);
  });

  it("REFUSES a slot with no source read at all", async () => {
    const staged = { id: "slot-null", company_id: CO, kind: "strategy", is_current: false, superseded_at: null, source_read_id: null };
    const { client, updates } = fakeClient({
      first_read_slots: [staged],
      public_reads: [{ id: "read-new", company_id: CO, kind: "strategy", is_current: true }],
    });
    await expect(promoteStagedSlots(client, CO, ["strategy"], SIGNER)).rejects.toThrow(/staged against read \(none\)/);
    expect(updates).toEqual([]);
  });

  it("requires a signer — a current slot is always a signed slot", async () => {
    const { client } = fakeClient({ first_read_slots: [], public_reads: [] });
    await expect(promoteStagedSlots(client, CO, ["strategy"], "")).rejects.toThrow(/signedBy is required/);
  });

  it("is a no-op for a kind with nothing staged", async () => {
    const { client, updates } = fakeClient({
      first_read_slots: [],
      public_reads: [{ id: "read-cur", company_id: CO, kind: "strategy", is_current: true }],
    });
    const { promoted } = await promoteStagedSlots(client, CO, ["strategy"], SIGNER);
    expect(promoted).toEqual([{ kind: "strategy", staged: "", superseded: null }]);
    expect(updates).toEqual([]);
  });

  it("never considers an already-superseded staged row", async () => {
    const dead = { id: "slot-dead", company_id: CO, kind: "strategy", is_current: false, superseded_at: "2026-10-05T00:00:00Z", source_read_id: "read-cur" };
    const { client, updates } = fakeClient({
      first_read_slots: [dead],
      public_reads: [{ id: "read-cur", company_id: CO, kind: "strategy", is_current: true }],
    });
    const { promoted } = await promoteStagedSlots(client, CO, ["strategy"], SIGNER);
    expect(promoted[0].staged).toBe("");
    expect(updates).toEqual([]);
  });
});

describe("rejectStagedSlots", () => {
  it("marks the staged slot superseded without making it current", async () => {
    const staged = { id: "slot-new", company_id: CO, kind: "positioning", is_current: false, superseded_at: null, source_read_id: "read-cur" };
    const { client, updates } = fakeClient({ first_read_slots: [staged], public_reads: [] });
    const { rejected } = await rejectStagedSlots(client, CO, ["positioning"]);
    expect(rejected).toEqual([{ kind: "positioning", slot: "slot-new" }]);
    const u = updates.find((x) => x.id === "slot-new")!;
    expect(u.patch.superseded_reason).toBe("operator_rejected");
    expect(u.patch.is_current).toBeUndefined();   // never promoted by a reject
  });
});
