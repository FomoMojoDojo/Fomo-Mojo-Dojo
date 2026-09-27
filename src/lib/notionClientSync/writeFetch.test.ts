// B2b — R9's allow-list. Every refused shape, and the refusal happens before the network call.
import { describe, it, expect, vi } from "vitest";
import {
  createNotionWriteClient,
  assertStatusOnlyPayload,
  assertCreateParent,
  buildCreateBody,
  buildStatusBody,
  WriteRefusedError,
  WRITABLE_PROPERTY,
} from "./writeFetch";
import { createReadOnlyNotionClient, WriteAttemptedError } from "./readOnlyFetch";

const DS = "31af0a3f-6171-83a0-9da8-87337f0ffc6d";
const OTHER_DS = "ce841712-c5c7-4565-ba16-f37d450ec80f"; // Edgewood kickoff — segment truth
const PAGE = "3b2f0a3f-6171-807b-81e4-d3649ffbf0c3";
const EDITED = "2026-09-26T21:18:00.000Z";

/** A fake Notion: pages carry a parent and a last_edited_time; every call is recorded. */
function fakeNotion(pages: Record<string, { parent: unknown; last_edited_time: string }>) {
  const seen: Array<{ method: string; path: string; body: unknown }> = [];
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    seen.push({ method, path: url.pathname, body });
    if (method === "GET") {
      const id = url.pathname.split("/").pop() ?? "";
      const p = pages[id];
      if (!p) return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
      return new Response(JSON.stringify({ id, ...p }), { status: 200 });
    }
    if (method === "POST") return new Response(JSON.stringify({ id: "new-page-id" }), { status: 200 });
    return new Response(JSON.stringify({ id: url.pathname.split("/").pop() }), { status: 200 });
  });
  return { f, seen };
}

const client = (f: typeof fetch) => createNotionWriteClient({ token: "t", dataSourceId: DS, fetchImpl: f });

describe("the read client is still unable to write", () => {
  it("a write cannot be obtained by configuring the read client", async () => {
    const { f } = fakeNotion({});
    const r = createReadOnlyNotionClient({ token: "t", fetchImpl: f as unknown as typeof fetch });
    expect(Object.keys(r).sort()).toEqual(["calls", "get", "postRead"]);
    await expect(r.postRead("/v1/pages", buildCreateBody(DS, { name: "x", mojoMapId: "y", status: null })))
      .rejects.toThrow(WriteAttemptedError);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("the create gate — parent must be the one data source", () => {
  it("accepts the body the client itself builds", () => {
    expect(() => assertCreateParent(buildCreateBody(DS, { name: "Sonos", mojoMapId: "id", status: "Map Created" }), DS)).not.toThrow();
  });

  it("refuses a create with ANY other parent", () => {
    for (const parent of [
      { type: "data_source_id", data_source_id: OTHER_DS },
      { type: "page_id", page_id: PAGE },
      { type: "database_id", database_id: "75df0a3f-6171-82c6-beb1-01a61c145212" },
      { type: "workspace", workspace: true },
      { type: "block_id", block_id: PAGE },
    ]) {
      expect(() => assertCreateParent({ parent }, DS)).toThrow(WriteRefusedError);
    }
  });

  it("refuses a create with no parent at all, and one naming the database instead of the data source", () => {
    expect(() => assertCreateParent({}, DS)).toThrow(/must name a parent/);
    expect(() => assertCreateParent({ parent: { type: "database_id", database_id: DS } }, DS)).toThrow(/must be a data_source_id/);
  });

  it("refuses a create with no MojoMap ID — the only link between the two sides", async () => {
    const { f, seen } = fakeNotion({});
    await expect(client(f as unknown as typeof fetch).createRow({ name: "x", mojoMapId: "  ", status: null }))
      .rejects.toThrow(/MojoMap ID/);
    expect(seen.filter((s) => s.method === "POST")).toEqual([]);
  });

  it("a create sends exactly Name, MojoMap ID and Status, and the pinned parent", async () => {
    const { f, seen } = fakeNotion({});
    const c = client(f as unknown as typeof fetch);
    const { pageId } = await c.createRow({ name: "Sonos", mojoMapId: "e55ac325", status: "Map Created" });
    expect(pageId).toBe("new-page-id");
    const post = seen.find((s) => s.method === "POST")!;
    expect(post.path).toBe("/v1/pages");
    const body = post.body as { parent: { data_source_id: string }; properties: Record<string, unknown> };
    expect(body.parent.data_source_id).toBe(DS);
    expect(Object.keys(body.properties).sort()).toEqual(["MojoMap ID", "Name", "Status"]);
  });
});

describe("the patch gate — re-read the parent, then Status only", () => {
  it("patches when the re-read confirms the data source", async () => {
    const { f, seen } = fakeNotion({ [PAGE]: { parent: { type: "data_source_id", data_source_id: DS }, last_edited_time: EDITED } });
    await client(f as unknown as typeof fetch).patchStatus(PAGE, "On Hold");
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([`GET /v1/pages/${PAGE}`, `PATCH /v1/pages/${PAGE}`]);
    expect(seen[1].body).toEqual({ properties: { Status: { select: { name: "On Hold" } } } });
  });

  it("REFUSES a patch on a page whose re-read parent is not the data source — and never sends the PATCH", async () => {
    for (const parent of [
      { type: "data_source_id", data_source_id: OTHER_DS }, // a kickoff database row inside Edgewood
      { type: "page_id", page_id: PAGE },
      { type: "block_id", block_id: PAGE },
      { type: "workspace", workspace: true },
    ]) {
      const { f, seen } = fakeNotion({ [PAGE]: { parent, last_edited_time: EDITED } });
      await expect(client(f as unknown as typeof fetch).patchStatus(PAGE, "On Hold")).rejects.toThrow(WriteRefusedError);
      expect(seen.map((s) => s.method)).toEqual(["GET"]); // the re-read happened, the PATCH did not
    }
  });

  it("refuses a patch on a page that does not exist", async () => {
    const { f, seen } = fakeNotion({});
    await expect(client(f as unknown as typeof fetch).patchStatus(PAGE, "On Hold")).rejects.toThrow(/404/);
    expect(seen.map((s) => s.method)).toEqual(["GET"]);
  });

  it("refuses a patch when the page moved since it was read (the compare-and-set)", async () => {
    const { f, seen } = fakeNotion({ [PAGE]: { parent: { type: "data_source_id", data_source_id: DS }, last_edited_time: "2026-09-26T22:00:00.000Z" } });
    await expect(client(f as unknown as typeof fetch).patchStatus(PAGE, "On Hold", EDITED)).rejects.toThrow(/edited since it was read/);
    expect(seen.map((s) => s.method)).toEqual(["GET"]);
  });

  it("refuses a page id that is not an id, before any network call", async () => {
    const { f } = fakeNotion({});
    await expect(client(f as unknown as typeof fetch).patchStatus("../../data_sources/x", "On Hold")).rejects.toThrow(WriteRefusedError);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("the payload gate — only Status", () => {
  it("accepts the body the client builds, including a cleared Status", () => {
    expect(() => assertStatusOnlyPayload(buildStatusBody("Map Created"))).not.toThrow();
    expect(() => assertStatusOnlyPayload(buildStatusBody(null))).not.toThrow();
    expect(buildStatusBody(null)).toEqual({ properties: { Status: { select: null } } });
  });

  it("refuses a payload carrying ANY property other than Status", () => {
    for (const props of [
      { Name: { title: [] } },
      { "MojoMap ID": { rich_text: [] } },
      { Status: { select: null }, Name: { title: [] } }, // Status plus one more is still refused
      { "Contract Signed": { status: { name: "x" } } }, // the near-miss: Notion's native status type
      { Price: { number: 1 } },
      {},
    ]) {
      expect(() => assertStatusOnlyPayload({ properties: props })).toThrow(WriteRefusedError);
    }
  });

  it("refuses anything outside 'properties' — archiving, trashing, an icon, a parent move", () => {
    for (const body of [
      { properties: { Status: { select: null } }, archived: true },
      { properties: { Status: { select: null } }, in_trash: true },
      { properties: { Status: { select: null } }, icon: { emoji: "x" } },
      { properties: { Status: { select: null } }, parent: { type: "data_source_id", data_source_id: DS } },
      { archived: true },
      "not an object",
      null,
    ]) {
      expect(() => assertStatusOnlyPayload(body)).toThrow(WriteRefusedError);
    }
  });

  it("WRITABLE_PROPERTY is the single name the gate admits", () => {
    expect(WRITABLE_PROPERTY).toBe("Status");
  });
});

describe("what the write client can and cannot reach", () => {
  it("exposes only createRow, patchStatus and calls — no delete, no archive, no block write", () => {
    const { f } = fakeNotion({});
    const c = client(f as unknown as typeof fetch);
    expect(Object.keys(c).sort()).toEqual(["calls", "createRow", "patchStatus"]);
    for (const verb of ["delete", "archive", "trash", "patch", "post", "get", "appendBlocks", "updateDataSource"]) {
      expect((c as unknown as Record<string, unknown>)[verb]).toBeUndefined();
    }
  });

  it("records every call it made, for the run's own proof", async () => {
    const { f } = fakeNotion({ [PAGE]: { parent: { type: "data_source_id", data_source_id: DS }, last_edited_time: EDITED } });
    const c = client(f as unknown as typeof fetch);
    await c.createRow({ name: "Sonos", mojoMapId: "e55ac325", status: "Map Created" });
    await c.patchStatus(PAGE, "On Hold");
    expect(c.calls.map((x) => `${x.method} ${x.path}`)).toEqual([
      "POST /v1/pages",
      `GET /v1/pages/${PAGE}`,
      `PATCH /v1/pages/${PAGE}`,
    ]);
  });
});
