// B2b — the Notion WRITE client. R9 (signed 2026-09-26).
//
// This is a SEPARATE client from readOnlyFetch.ts, not an option on it. The read client stays unable
// to write, so the dry-run path cannot acquire a write by configuration — you have to construct a
// different object, and that construction is the thing a reviewer looks for.
//
// R9's allow-list is not a list of paths. It is a list of paths PLUS what may be in the body:
//
//   POST  /v1/pages          only with parent { type: "data_source_id", data_source_id: <the one id> }
//   PATCH /v1/pages/{id}     only after a RE-READ confirms that page's parent is that same data
//                            source, and only with a Status-only `properties` payload
//
// Everything else is refused BEFORE the network call. The re-read is not decoration: a page id is an
// opaque uuid, and without it a wrong id — a stale row, a copy-paste, a page from one of the kickoff
// databases nested inside the Edgewood row — would be silently patched. The census of 2026-09-26
// showed 215 objects inside the shared tree that are NOT Client Portals rows; the re-read is what
// keeps them out of reach.
//
// KNOWN LIMIT, documented rather than hidden: the re-read closes the wrong-page hole, not the
// concurrent-edit hole. Notion has no conditional write, so between the re-read and the PATCH an
// operator could edit the page. `last_edited_time` is page-level and minute-granular, so two edits
// inside the same minute are indistinguishable; the re-read compares it and refuses on a change it
// can see, and cannot see one it cannot.
import { NOTION_API_VERSION, NOTION_BASE, type RecordedCall } from "./readOnlyFetch";

export class WriteRefusedError extends Error {
  constructor(why: string) {
    super(`notion write refused (R9): ${why}`);
    this.name = "WriteRefusedError";
  }
}

/** The single property the sync may ever write. */
export const WRITABLE_PROPERTY = "Status";

export type CreateRowInput = {
  /** The MojoMap company name — the page title. */
  name: string;
  /** The full company uuid, the only link between the two sides. */
  mojoMapId: string;
  status: string | null;
};

export type NotionWriteClient = {
  createRow: (input: CreateRowInput) => Promise<{ pageId: string }>;
  /**
   * Re-reads the page, refuses unless its parent is the configured data source, then PATCHes Status
   * and nothing else. `expectLastEditedTime` refuses when the page moved since the caller read it.
   */
  patchStatus: (pageId: string, status: string | null, expectLastEditedTime?: string) => Promise<void>;
  readonly calls: readonly RecordedCall[];
};

type PageShape = {
  id: string;
  last_edited_time: string;
  parent?: { type?: string; data_source_id?: string };
};

/** Exported for the guard and the tests: the body a create is allowed to send. */
export function buildCreateBody(dataSourceId: string, input: CreateRowInput): Record<string, unknown> {
  return {
    parent: { type: "data_source_id", data_source_id: dataSourceId },
    properties: {
      Name: { title: [{ text: { content: input.name } }] },
      "MojoMap ID": { rich_text: [{ text: { content: input.mojoMapId } }] },
      [WRITABLE_PROPERTY]: { select: input.status === null ? null : { name: input.status } },
    },
  };
}

/** Exported for the guard and the tests: the body a status patch is allowed to send. */
export function buildStatusBody(status: string | null): Record<string, unknown> {
  return { properties: { [WRITABLE_PROPERTY]: { select: status === null ? null : { name: status } } } };
}

/**
 * The payload gate, separate from the transport so it is testable without a fetch: a `properties`
 * object may name ONLY Status, and nothing outside `properties` may be sent at all (no archived, no
 * in_trash, no icon, no parent move).
 */
export function assertStatusOnlyPayload(body: unknown): void {
  if (body === null || typeof body !== "object") throw new WriteRefusedError("the patch body is not an object");
  const keys = Object.keys(body as Record<string, unknown>);
  const extra = keys.filter((k) => k !== "properties");
  if (extra.length > 0) throw new WriteRefusedError(`a patch may carry only 'properties', not ${JSON.stringify(extra)}`);
  const props = (body as { properties?: unknown }).properties;
  if (props === null || typeof props !== "object") throw new WriteRefusedError("the patch has no 'properties' object");
  const names = Object.keys(props as Record<string, unknown>);
  const notStatus = names.filter((n) => n !== WRITABLE_PROPERTY);
  if (notStatus.length > 0) {
    throw new WriteRefusedError(`only '${WRITABLE_PROPERTY}' may be written, not ${JSON.stringify(notStatus)}`);
  }
  if (names.length === 0) throw new WriteRefusedError("the patch names no property");
}

/** The create gate: the parent must be the one configured data source, spelled the one allowed way. */
export function assertCreateParent(body: unknown, dataSourceId: string): void {
  const parent = (body as { parent?: { type?: string; data_source_id?: string } } | null)?.parent;
  if (!parent) throw new WriteRefusedError("a create must name a parent");
  if (parent.type !== "data_source_id") {
    throw new WriteRefusedError(`a create's parent must be a data_source_id, not ${JSON.stringify(parent.type)}`);
  }
  if (parent.data_source_id !== dataSourceId) {
    throw new WriteRefusedError("a create's parent data_source_id is not the Client Portals data source");
  }
}

export function createNotionWriteClient(opts: {
  token: string;
  dataSourceId: string;
  fetchImpl?: typeof fetch;
  apiVersion?: string;
}): NotionWriteClient {
  const f = opts.fetchImpl ?? fetch;
  const version = opts.apiVersion ?? NOTION_API_VERSION;
  const calls: RecordedCall[] = [];

  async function send<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${opts.token}`,
      "Notion-Version": version,
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    let status: number | null = null;
    try {
      const res = await f(`${NOTION_BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      status = res.status;
      const text = await res.text();
      if (!res.ok) throw new Error(`Notion ${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
      return JSON.parse(text) as T;
    } finally {
      calls.push({ method, path: path.split("?")[0], status });
    }
  }

  return {
    createRow: async (input) => {
      const body = buildCreateBody(opts.dataSourceId, input);
      assertCreateParent(body, opts.dataSourceId); // belt and braces: the body we just built is checked too
      if (!input.mojoMapId || input.mojoMapId.trim() === "") {
        throw new WriteRefusedError("a create must carry a MojoMap ID — it is the only link between the two sides");
      }
      const page = await send<PageShape>("POST", "/v1/pages", body);
      return { pageId: page.id };
    },

    patchStatus: async (pageId, status, expectLastEditedTime) => {
      if (!/^[0-9a-fA-F-]{32,36}$/.test(pageId)) throw new WriteRefusedError(`'${pageId}' is not a page id`);
      // THE RE-READ, before any write: this page must belong to the configured data source.
      const page = await send<PageShape>("GET", `/v1/pages/${pageId}`);
      if (page.parent?.type !== "data_source_id" || page.parent.data_source_id !== opts.dataSourceId) {
        throw new WriteRefusedError(
          `page ${pageId} is not a row of the Client Portals data source (its parent is ${JSON.stringify(page.parent?.type)})`,
        );
      }
      if (expectLastEditedTime !== undefined && page.last_edited_time !== expectLastEditedTime) {
        throw new WriteRefusedError(
          `page ${pageId} was edited since it was read (${expectLastEditedTime} -> ${page.last_edited_time})`,
        );
      }
      const body = buildStatusBody(status);
      assertStatusOnlyPayload(body);
      await send<PageShape>("PATCH", `/v1/pages/${pageId}`, body);
    },

    get calls() {
      return calls;
    },
  };
}
