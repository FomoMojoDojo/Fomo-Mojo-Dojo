// (m) Inputs Tier 1 controls — proofs with NO real writes: every non-GET Supabase request (REST, storage,
// functions) is intercepted and answered synthetically; the spec asserts the request shape the
// workspace issues, which is the same shape the old tab issues through the same hooks / lifted
// functions. Reads pass through to the real fixture (Edgewood), with one exception noted per test.
import { expect, test, type Page, type Route } from "playwright/test";
import path from "node:path";
import { openWorkspace } from "./helpers";

type Captured = { method: string; url: string; body: unknown };
const SUPABASE = /\/(rest|storage|functions)\/v1\//;

/** Intercepts writes; keeps a stateful view of archived files so the lists move without a real write. */
async function guardWrites(page: Page, state: { archived: Set<string> }): Promise<Captured[]> {
  const captured: Captured[] = [];
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const url = req.url();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      // Present archived state to the two input_files reads (active list / archived list).
      if (/\/rest\/v1\/input_files\?/.test(url) && state.archived.size > 0) {
        const wantArchived = /archived_at=not\.is\.null/.test(url);
        // The archived list is filtered server-side; fetch it unfiltered so the mock-archived rows exist.
        const res = await route.fetch(wantArchived ? { url: url.replace(/&?archived_at=not\.is\.null/, "") } : undefined);
        let rows: Array<Record<string, unknown>> = [];
        try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
        const out = rows
          .map((r) => (state.archived.has(String(r.id)) ? { ...r, archived_at: "2026-09-11T00:00:00Z" } : r))
          .filter((r) => (wantArchived ? r.archived_at != null : r.archived_at == null));
        return route.fulfill({ response: res, body: JSON.stringify(out), headers: { ...res.headers(), "content-type": "application/json" } });
      }
      return route.continue();
    }
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    captured.push({ method, url, body });
    if (/\/rest\/v1\/input_files\?/.test(url) && method === "PATCH") {
      const b = body as Record<string, unknown>;
      const id = new URL(url).searchParams.get("id")?.replace(/^eq\./, "");
      if (id && "archived_at" in b) { if (b.archived_at) state.archived.add(id); else state.archived.delete(id); }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (/\/storage\/v1\/object\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "input-files/synthetic" }) });
    if (/\/functions\/v1\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    if (method === "POST" && /\/rest\/v1\//.test(url)) {
      const row = { id: "synthetic-row", ...(typeof body === "object" && body && !Array.isArray(body) ? (body as object) : {}) };
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(Array.isArray(body) ? [row] : row) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  return captured;
}

async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}

test("f. default render: no operator nodes and none of the Tier 1 controls", async ({ page }) => {
  await openWorkspace(page, "inputs");
  await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
  for (const id of ["inputs-upload", "inputs-filters", "inputs-run-analysis", "inputs-review-proposal", "inputs-archive", "inputs-archived"]) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
  await expect(page.getByText("Upload file")).toHaveCount(0);
});

test("a. Upload file: the tab's dialog opens; a chosen file issues the storage upload + input_files insert", async ({ page }) => {
  const captured = await guardWrites(page, { archived: new Set() });
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  await page.getByTestId("inputs-upload-open").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("input[type=file]").setInputFiles(path.resolve("tests/workspace/fixtures/tier1-upload.txt"));
  await dialog.getByRole("button", { name: /^Upload/ }).click();
  await expect.poll(() => captured.some((c) => /\/storage\/v1\/object\//.test(c.url) && c.method === "POST"), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => captured.some((c) => /\/rest\/v1\/input_files/.test(c.url) && c.method === "POST")).toBe(true);
  const insert = captured.find((c) => /\/rest\/v1\/input_files/.test(c.url) && c.method === "POST")!.body as Record<string, unknown>;
  expect(String(insert.file_name)).toBe("tier1-upload.txt");
  expect(String(insert.file_path)).toMatch(/tier1-upload\.txt$/);
});

test("b. Run analysis: the click issues dify-analyze-file for that file id", async ({ page }) => {
  const captured = await guardWrites(page, { archived: new Set() });
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const btn = page.getByTestId("inputs-run-analysis").first();
  await expect(btn).toBeVisible();
  const fileId = await btn.locator("xpath=ancestor::tr").getAttribute("data-fr-file-id");
  await btn.click();
  await expect.poll(() => captured.some((c) => /\/functions\/v1\/dify-analyze-file/.test(c.url))).toBe(true);
  const call = captured.find((c) => /dify-analyze-file/.test(c.url))!.body as Record<string, unknown>;
  expect(call.fileId).toBe(fileId);
  expect(call.companyId).toBe("3dd2cfbb-0792-4bf1-9cd4-15db9646874b");
  expect(call.sourceType).toBe("uploaded_file");
  expect(typeof call.filePath).toBe("string");
});

test("c. Review proposal: the panel opens with the proposal's candidates; Accept issues the accept write", async ({ page }) => {
  const captured = await guardWrites(page, { archived: new Set() });
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const review = page.getByTestId("inputs-review-proposal").first();
  test.skip((await review.count()) === 0, "fixture has no ready + pending proposal");
  const fileId = await review.locator("xpath=ancestor::tr").getAttribute("data-fr-file-id");
  await review.click();
  const panel = page.getByTestId("inputs-review-panel");
  await expect(panel).toBeVisible();
  expect((await panel.innerText()).trim().length).toBeGreaterThan(40);
  await panel.getByRole("button", { name: /^Accept/ }).click();
  await expect.poll(() => captured.some((c) => /\/rest\/v1\/file_proposals\?/.test(c.url) && c.method === "PATCH")).toBe(true);
  const patch = captured.find((c) => /\/rest\/v1\/file_proposals\?/.test(c.url) && c.method === "PATCH")!;
  expect((patch.body as Record<string, unknown>).status).toBe("accepted");
  expect(new URL(patch.url).searchParams.get("id")).toMatch(/^eq\./);
  // Area tags (if any were selected) go to the file's input_files row — the same file.
  const tagPatch = captured.find((c) => /\/rest\/v1\/input_files\?/.test(c.url) && c.method === "PATCH");
  if (tagPatch) expect(new URL(tagPatch.url).searchParams.get("id")).toBe(`eq.${fileId}`);
});

test("d. filters narrow the table on a mixed-type response and restore on All", async ({ page }) => {
  // Plant: the first file carries the tab's 'Intake' discriminator tag (read rewritten in flight).
  await page.route(/\/rest\/v1\/input_files\?/, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch();
    let rows: Array<Record<string, unknown>> = [];
    try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
    if (rows.length > 1) rows = rows.map((r, i) => (i === 0 ? { ...r, tags: [...((r.tags as string[]) ?? []), "Intake"] } : r));
    await route.fulfill({ response: res, body: JSON.stringify(rows), headers: { ...res.headers(), "content-type": "application/json" } });
  });
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const rows = page.getByTestId("inputs-file-row");
  const all = await rows.count();
  test.skip(all < 2, "need at least two files");
  await page.getByTestId("inputs-type-filter").selectOption("intake");
  await expect(rows).toHaveCount(1);
  await page.getByTestId("inputs-type-filter").selectOption("file");
  await expect(rows).toHaveCount(all - 1);
  await page.getByTestId("inputs-type-filter").selectOption("all");
  await expect(rows).toHaveCount(all);
  const withAreas = await rows.evaluateAll((els) => els.filter((e) => (e.querySelector(".fr-ws-table-areas")?.textContent ?? "").trim().length > 0).length);
  await page.getByTestId("inputs-area-filter").selectOption("yes");
  await expect(rows).toHaveCount(withAreas);
  await page.getByTestId("inputs-area-filter").selectOption("no");
  await expect(rows).toHaveCount(all - withAreas);
  await page.getByTestId("inputs-area-filter").selectOption("all");
  await expect(rows).toHaveCount(all);
});

test("e. Archive → confirm → archive request; Restore → restore request; the row moves between lists", async ({ page }) => {
  const state = { archived: new Set<string>() };
  const captured = await guardWrites(page, state);
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const rows = page.getByTestId("inputs-file-row");
  const before = await rows.count();
  // A row with areas asks for the confirm; choose one.
  const target = rows.filter({ has: page.locator(".fr-ws-table-areas:not(:empty)") }).first();
  const fileId = await target.getAttribute("data-fr-file-id");
  const name = (await target.locator(".fr-ws-table-name").innerText()).trim();
  await target.getByTestId("inputs-archive").click();
  await expect(page.getByTestId("inputs-archive-confirm")).toBeVisible();
  await page.getByTestId("inputs-archive-confirm").getByRole("button", { name: "Remove file only" }).click();
  await expect.poll(() => captured.some((c) => c.method === "PATCH" && /\/rest\/v1\/input_files\?/.test(c.url) && new URL(c.url).searchParams.get("id") === `eq.${fileId}` && (c.body as Record<string, unknown>).archived_at)).toBe(true);
  const archivePatch = captured.find((c) => c.method === "PATCH" && /input_files\?/.test(c.url))!.body as Record<string, unknown>;
  expect(archivePatch.archive_reason).toBe("user_removed");
  expect(archivePatch.archive_source).toBe("ui");
  await expect(rows).toHaveCount(before - 1);
  await page.getByTestId("inputs-archived-toggle").click();
  const archivedRow = page.getByTestId("inputs-archived-row").filter({ hasText: name });
  await expect(archivedRow).toHaveCount(1);
  await archivedRow.getByTestId("inputs-restore").click();
  await expect.poll(() => captured.filter((c) => c.method === "PATCH" && /input_files\?/.test(c.url)).some((c) => (c.body as Record<string, unknown>).archived_at === null)).toBe(true);
  await expect(rows).toHaveCount(before);
});
