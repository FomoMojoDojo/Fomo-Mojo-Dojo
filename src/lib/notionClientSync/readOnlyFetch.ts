// B2a — the Notion HTTP client for the dry run. IT CANNOT WRITE.
//
// The awkward fact this module exists for: Notion's READ endpoints are not all GETs. Querying rows
// and searching are POSTs (POST /v1/data_sources/{id}/query, POST /v1/search), while every write is
// also a POST or a PATCH (POST /v1/pages creates, PATCH /v1/pages/{id} updates). So "refuse writes"
// cannot be spelled as "refuse POST": it has to be an ALLOW-LIST of the exact read endpoints, and
// anything not on it is refused by method AND path together.
//
// Notion API version 2026-03-11 (the latest; https://developers.notion.com/reference/versioning).
// Since version 2025-09-03 a database is a container of one or more DATA SOURCES and rows are
// queried from the data source, not the database: GET /v1/databases/{id} returns a `data_sources`
// array, and rows come from POST /v1/data_sources/{id}/query
// (https://developers.notion.com/reference/query-a-data-source, and the upgrade guide at
// https://developers.notion.com/docs/upgrade-guide-2025-09-03). The legacy
// POST /v1/databases/{id}/query is allow-listed too, as a read, for older tokens.
//
// Every call is recorded so the dry run can PROVE afterwards what it sent.
export const NOTION_API_VERSION = "2026-03-11";
export const NOTION_BASE = "https://api.notion.com";

export type RecordedCall = { method: string; path: string; status: number | null };

export class WriteAttemptedError extends Error {
  constructor(method: string, path: string) {
    super(
      `B2a is a dry run and holds no write path: ${method} ${path} is not one of Notion's read endpoints. ` +
        `Allowed: any GET, POST /v1/search, POST /v1/data_sources/{id}/query, POST /v1/databases/{id}/query.`,
    );
    this.name = "WriteAttemptedError";
  }
}

const QUERY_PATHS = [
  /^\/v1\/data_sources\/[A-Za-z0-9-]+\/query$/,
  /^\/v1\/databases\/[A-Za-z0-9-]+\/query$/, // legacy pre-2025-09-03 shape, still a read
];

/**
 * True only for Notion's read endpoints. A path is compared without its query string, and `..` is
 * refused outright so a crafted path cannot climb out of an allow-listed prefix.
 */
export function isReadOnlyRequest(method: string, path: string): boolean {
  const m = method.toUpperCase();
  const clean = path.split("?")[0].split("#")[0];
  if (clean.includes("..")) return false;
  if (m === "GET") return true;
  if (m !== "POST") return false;
  if (clean === "/v1/search") return true;
  return QUERY_PATHS.some((re) => re.test(clean));
}

export function assertReadOnly(method: string, path: string): void {
  if (!isReadOnlyRequest(method, path)) throw new WriteAttemptedError(method.toUpperCase(), path);
}

export type ReadOnlyNotionClient = {
  get: <T = unknown>(path: string) => Promise<T>;
  /** POST, but only to an allow-listed read endpoint. */
  postRead: <T = unknown>(path: string, body: unknown) => Promise<T>;
  /** Every call this client made, in order, for the dry run's own proof. */
  readonly calls: readonly RecordedCall[];
};

/**
 * The token is held in the closure and put on the Authorization header. It is never returned, never
 * logged, and never placed in a path or query string.
 */
export function createReadOnlyNotionClient(opts: {
  token: string;
  fetchImpl?: typeof fetch;
  apiVersion?: string;
}): ReadOnlyNotionClient {
  const f = opts.fetchImpl ?? fetch;
  const version = opts.apiVersion ?? NOTION_API_VERSION;
  const calls: RecordedCall[] = [];

  async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
    assertReadOnly(method, path); // BEFORE any network call, so a refused write never leaves the process
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
      if (!res.ok) {
        // The body of a Notion error carries no secret, but the request headers do — never echo them.
        throw new Error(`Notion ${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
      }
      return JSON.parse(text) as T;
    } finally {
      calls.push({ method: method.toUpperCase(), path: path.split("?")[0], status });
    }
  }

  return {
    get: (path) => send("GET", path),
    postRead: (path, body) => send("POST", path, body),
    get calls() {
      return calls;
    },
  };
}

/** For the dry run's section 6: every recorded call must be an allow-listed read. */
export function allCallsWereReads(calls: readonly RecordedCall[]): boolean {
  return calls.every((c) => isReadOnlyRequest(c.method, c.path));
}
