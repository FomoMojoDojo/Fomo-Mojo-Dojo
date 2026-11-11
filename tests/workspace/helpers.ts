import { expect, type Page } from "playwright/test";
import { execFileSync } from "node:child_process";
import { COMPANY_ID } from "../../playwright.config";

export const WS = "/preview/client-refine/workspace";
export const WS_PAGES = ["", "inputs", "job-map", "positioning", "strategy", "market", "opportunities", "routes", "council"] as const;

export function wsPath(segment: string): string {
  return segment ? `${WS}/${segment}` : WS;
}

/** Hard reload (first-read-capture discipline): goto + networkidle, active company pinned. */
export async function open(page: Page, path: string): Promise<void> {
  await page.addInitScript((id) => { try { localStorage.setItem("active_company_id", id); } catch { /* no storage */ } }, COMPANY_ID);
  await page.goto(path, { waitUntil: "networkidle", timeout: 120_000 });
}

/** `search` (e.g. "?view=customer") opens the page on an explicit view (FLIP, 2026-09-19). */
export async function openWorkspace(page: Page, segment: string, search = ""): Promise<void> {
  await open(page, `${wsPath(segment)}${search}`);
  await expect(page.getByTestId("workspace-root")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("workspace-stage")).toBeVisible();
}

// ── U6-35: owner-side fixture planting for interview_records ─────────────────────────────────────
// U6-26 and U6-30 revoked INSERT and DELETE on interview_records from `authenticated`, and a signed-in
// admin in the browser IS `authenticated`. That is the point of the revoke: the ONLY write path for an
// interview record is record-interview-upload, which holds a service-role client
// (interview-upload-path-guard.sh proves the product door still opens end to end).
//
// A spec that planted its fixture record through window.supabase was therefore writing by a path the
// product does not use, and it stopped working the moment the revoke landed. Planting as the TABLE
// OWNER is the honest replacement: it says "this row is a fixture, placed outside the product" instead
// of pretending the browser could have made it. Everything else in these specs still goes through the
// browser as the admin, so the surface under test is unchanged.
//
// Not a way around the revoke for product code: `postgres` is the owner and bypasses both the grant
// and RLS, which is exactly why this helper lives in tests/ and nowhere else.

const PGC = process.env.PGC || "supabase_db_dzlgyxcvuwiulgifbmew";

/** Run one statement as the table owner. Returns the first output line (a `returning` value, usually). */
export function psql(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", PGC, "psql", "-U", "postgres", "-d", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  ).trim().split("\n")[0];
}

type SqlValue = string | number | boolean | null | undefined | Record<string, unknown> | unknown[];

/** Postgres literal for a fixture value. Objects and arrays become jsonb; undefined is dropped by the caller. */
function literal(v: SqlValue): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * Plant one interview_records row as the owner and return its id.
 * Pass exactly the columns the fixture needs; anything `undefined` is left to the column default.
 */
export function plantInterviewRecord(columns: Record<string, SqlValue>): string {
  const entries = Object.entries(columns).filter(([, v]) => v !== undefined);
  const names = entries.map(([k]) => `"${k}"`).join(", ");
  const values = entries.map(([, v]) => literal(v)).join(", ");
  const id = psql(`insert into interview_records (${names}) values (${values}) returning id`);
  expect(id, `plantInterviewRecord returned no id for ${names}`).toMatch(/^[0-9a-f-]{36}$/);
  return id;
}
