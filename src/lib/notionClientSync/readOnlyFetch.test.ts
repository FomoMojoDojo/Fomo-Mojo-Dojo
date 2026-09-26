// B2a — the client cannot write. This is the test the brief asks for: every Notion write shape is
// refused, and refused BEFORE any network call is made.
import { describe, it, expect, vi } from "vitest";
import {
  createReadOnlyNotionClient,
  isReadOnlyRequest,
  assertReadOnly,
  allCallsWereReads,
  WriteAttemptedError,
  NOTION_API_VERSION,
} from "./readOnlyFetch";

const DS = "31af0a3f-6171-83a0-9da8-87337f0ffc6d";
const PAGE = "3b2f0a3f-6171-807b-81e4-d3649ffbf0c3";

// Parameters are declared so mock.calls is a typed 2-tuple and the assertions below can index it.
const okFetch = () =>
  vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify({ ok: true }), { status: 200 }));

describe("the read allow-list", () => {
  it("allows every GET, and the two reads Notion spells as POST", () => {
    expect(isReadOnlyRequest("GET", "/v1/users/me")).toBe(true);
    expect(isReadOnlyRequest("GET", `/v1/databases/${DS}`)).toBe(true);
    expect(isReadOnlyRequest("GET", `/v1/data_sources/${DS}`)).toBe(true);
    expect(isReadOnlyRequest("GET", `/v1/pages/${PAGE}`)).toBe(true);
    expect(isReadOnlyRequest("POST", "/v1/search")).toBe(true);
    expect(isReadOnlyRequest("POST", `/v1/data_sources/${DS}/query`)).toBe(true);
    expect(isReadOnlyRequest("POST", `/v1/databases/${DS}/query`)).toBe(true); // legacy read
  });

  it("refuses every Notion WRITE shape — which is why this is an allow-list and not 'no POST'", () => {
    // creates
    expect(isReadOnlyRequest("POST", "/v1/pages")).toBe(false);
    expect(isReadOnlyRequest("POST", "/v1/databases")).toBe(false);
    expect(isReadOnlyRequest("POST", "/v1/data_sources")).toBe(false);
    expect(isReadOnlyRequest("POST", "/v1/comments")).toBe(false);
    // updates
    expect(isReadOnlyRequest("PATCH", `/v1/pages/${PAGE}`)).toBe(false);
    expect(isReadOnlyRequest("PATCH", `/v1/pages/${PAGE}/properties/Status`)).toBe(false);
    expect(isReadOnlyRequest("PATCH", `/v1/data_sources/${DS}`)).toBe(false);
    expect(isReadOnlyRequest("PATCH", `/v1/blocks/${PAGE}/children`)).toBe(false);
    expect(isReadOnlyRequest("PUT", `/v1/pages/${PAGE}`)).toBe(false);
    expect(isReadOnlyRequest("DELETE", `/v1/blocks/${PAGE}`)).toBe(false);
  });

  it("refuses a path crafted to look like a query", () => {
    expect(isReadOnlyRequest("POST", "/v1/pages/../data_sources/x/query")).toBe(false);
    expect(isReadOnlyRequest("POST", `/v1/data_sources/${DS}/query/../../pages`)).toBe(false);
    expect(isReadOnlyRequest("POST", `/v1/data_sources/${DS}/queryx`)).toBe(false);
    expect(isReadOnlyRequest("POST", `/v1/pages?x=/v1/search`)).toBe(false);
    // ...but a real query with a query string is still a read
    expect(isReadOnlyRequest("GET", `/v1/data_sources/${DS}?start_cursor=abc`)).toBe(true);
  });

  it("assertReadOnly throws WriteAttemptedError naming the method and path", () => {
    expect(() => assertReadOnly("PATCH", `/v1/pages/${PAGE}`)).toThrow(WriteAttemptedError);
    expect(() => assertReadOnly("PATCH", `/v1/pages/${PAGE}`)).toThrow(/PATCH \/v1\/pages/);
    expect(() => assertReadOnly("GET", "/v1/users/me")).not.toThrow();
  });
});

describe("the client", () => {
  it("has no method that could write — only get and postRead", () => {
    const c = createReadOnlyNotionClient({ token: "t", fetchImpl: okFetch() });
    expect(Object.keys(c).sort()).toEqual(["calls", "get", "postRead"]);
    for (const verb of ["patch", "put", "delete", "post", "create", "update"]) {
      expect((c as unknown as Record<string, unknown>)[verb]).toBeUndefined();
    }
  });

  it("refuses a write BEFORE any network call — fetch is never reached", async () => {
    const f = okFetch();
    const c = createReadOnlyNotionClient({ token: "t", fetchImpl: f });
    await expect(c.postRead(`/v1/pages`, { parent: {} })).rejects.toThrow(WriteAttemptedError);
    expect(f).not.toHaveBeenCalled();
    // and the refusal is not recorded as a call, because no call was made
    expect(c.calls).toEqual([]);
  });

  it("sends the pinned API version and a bearer header, and records each call", async () => {
    const f = okFetch();
    const c = createReadOnlyNotionClient({ token: "shhh", fetchImpl: f });
    await c.get("/v1/users/me");
    await c.postRead(`/v1/data_sources/${DS}/query`, { page_size: 100 });

    expect(f).toHaveBeenCalledTimes(2);
    const [, init] = f.mock.calls[0];
    expect(init?.method).toBe("GET");
    const h = init?.headers as Record<string, string>;
    expect(h["Notion-Version"]).toBe(NOTION_API_VERSION);
    expect(h.Authorization).toBe("Bearer shhh");

    expect(c.calls.map((x) => `${x.method} ${x.path}`)).toEqual([
      "GET /v1/users/me",
      `POST /v1/data_sources/${DS}/query`,
    ]);
    expect(allCallsWereReads(c.calls)).toBe(true);
  });

  it("never puts the token in the URL", async () => {
    const f = okFetch();
    const c = createReadOnlyNotionClient({ token: "SECRET-TOKEN", fetchImpl: f });
    await c.get("/v1/users/me");
    expect(String(f.mock.calls[0][0])).not.toContain("SECRET-TOKEN");
  });

  it("records a failed read with its status and still reports reads-only", async () => {
    const f = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("nope", { status: 404 }));
    const c = createReadOnlyNotionClient({ token: "t", fetchImpl: f });
    await expect(c.get("/v1/databases/missing")).rejects.toThrow(/404/);
    expect(c.calls).toEqual([{ method: "GET", path: "/v1/databases/missing", status: 404 }]);
    expect(allCallsWereReads(c.calls)).toBe(true);
  });

  it("allCallsWereReads is false if a write ever appears in the log", () => {
    expect(allCallsWereReads([{ method: "PATCH", path: `/v1/pages/${PAGE}`, status: 200 }])).toBe(false);
  });
});
