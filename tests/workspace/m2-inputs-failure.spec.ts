// (m2) Inputs — analysis failure and size refusal surfaced (2026-09-12). No real writes: every non-GET
// Supabase request is intercepted; dify-analyze-file / analyze-file are answered with PLANTED failure
// shapes — the real OOM shape (546 {code:"WORKER_LIMIT"}) and the size guard's 413 {error:"file_too_large"}.
//   d. planted WORKER_LIMIT ⇒ "Analysis failed — retry →" (the tab's failed-run control) in the analysis
//      cell; a second click re-invokes dify-analyze-file for the same file; colour is --fr-bad by selector
//   d2. planted 413 file_too_large ⇒ the signed refusal sentence with the real size and cap
//   e. upload dialog: an over-cap throwaway file is refused at selection with the signed sentence; an in-cap
//      file whose post-upload analyze-file answers 413 shows the sentence instead of the parser line
// Vacuity (recorded in the brief's report): removing the catch-add in InputsPage.analyze fails d; removing
// the refusal branch fails d2; removing the selection-time summary fails e.
import { expect, test, type Page, type Route } from "playwright/test";
import { openWorkspace } from "./helpers";

type Captured = { method: string; url: string; body: unknown };
const SUPABASE = /\/(rest|storage|functions)\/v1\//;
const CAP = 25 * 1024 * 1024;
const OVER = 26 * 1024 * 1024;
const SIGNED = "File too large to analyse — 26 MiB exceeds the 25 MiB limit";

type Plants = { dify?: "worker_limit" | "too_large"; analyzeFilePostUpload?: "too_large" };

async function guardWrites(page: Page, plants: Plants): Promise<Captured[]> {
  const captured: Captured[] = [];
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const url = req.url();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return route.continue();
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    captured.push({ method, url, body });
    if (/\/functions\/v1\/dify-analyze-file/.test(url)) {
      if (plants.dify === "worker_limit") return route.fulfill({ status: 546, contentType: "application/json", body: JSON.stringify({ code: "WORKER_LIMIT", message: "memory limit reached for the worker" }) });
      if (plants.dify === "too_large") return route.fulfill({ status: 413, contentType: "application/json", body: JSON.stringify({ error: "file_too_large", size: OVER, cap: CAP }) });
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    if (/\/functions\/v1\/analyze-file/.test(url)) {
      const b = body as Record<string, unknown> | null;
      if (plants.analyzeFilePostUpload === "too_large" && b && typeof b.filePath === "string" && b.filePath) {
        return route.fulfill({ status: 413, contentType: "application/json", body: JSON.stringify({ error: "file_too_large", size: OVER, cap: CAP }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suggested_input_id: null, suggested_tags: [], extraction_source: "none", parser_engine: "local_ollama", reasoning: "planted" }) });
    }
    if (/\/functions\/v1\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    if (/\/storage\/v1\/object\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "input-files/synthetic" }) });
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

test("d. planted WORKER_LIMIT: the tab's 'Analysis failed — retry →' renders; the retry re-invokes for the same file; --fr-bad", async ({ page }) => {
  const captured = await guardWrites(page, { dify: "worker_limit" });
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const btn = page.getByTestId("inputs-run-analysis").first();
  await expect(btn).toBeVisible();
  const fileId = await btn.locator("xpath=ancestor::tr").getAttribute("data-fr-file-id");
  await btn.click();
  const retry = page.locator(`tr[data-fr-file-id="${fileId}"]`).getByTestId("inputs-analysis-retry");
  await expect(retry).toBeVisible();
  await expect(retry).toHaveText("Analysis failed — retry →");
  expect(await retry.getAttribute("data-fr-operator")).toBe("run-analysis");
  // colour by selector on --fr-bad (ruling 4) — polled: the motion project transitions the control's colour
  await page.mouse.move(0, 0);
  await expect.poll(() => retry.evaluate((el) => {
    const probe = document.createElement("span");
    probe.style.color = "hsl(var(--fr-bad))";
    document.querySelector("[data-testid=workspace-root]")!.appendChild(probe);
    const out = `${getComputedStyle(el).color} == ${getComputedStyle(probe).color}`;
    probe.remove();
    return out;
  })).toMatch(/^(rgb\([^)]*\)) == \1$/);
  expect(captured.filter((c) => /dify-analyze-file/.test(c.url))).toHaveLength(1);
  await retry.click();
  await expect.poll(() => captured.filter((c) => /dify-analyze-file/.test(c.url)).length).toBe(2);
  const calls = captured.filter((c) => /dify-analyze-file/.test(c.url)).map((c) => (c.body as Record<string, unknown>).fileId);
  expect(calls).toEqual([fileId, fileId]);
  // still failed (the plant is constant) — the control is back, not the proposal
  await expect(page.locator(`tr[data-fr-file-id="${fileId}"]`).getByTestId("inputs-analysis-retry")).toBeVisible();
});

test("d2. planted 413 file_too_large: the signed refusal sentence renders with the size and cap", async ({ page }) => {
  await guardWrites(page, { dify: "too_large" });
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  const btn = page.getByTestId("inputs-run-analysis").first();
  const fileId = await btn.locator("xpath=ancestor::tr").getAttribute("data-fr-file-id");
  await btn.click();
  const row = page.locator(`tr[data-fr-file-id="${fileId}"]`);
  await expect(row.getByTestId("inputs-analysis-refused")).toHaveText(SIGNED);
  await expect(row.getByTestId("inputs-analysis-retry")).toHaveCount(0);
});

test("e. upload dialog: an over-cap throwaway file is refused at selection with the signed sentence", async ({ page }) => {
  await guardWrites(page, {});
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  await page.getByTestId("inputs-upload-open").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator("input[type=file]").setInputFiles({ name: "throwaway-26mib.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(OVER, 1) });
  await expect(dialog.getByTestId("upload-file-refused")).toHaveText(`Failed: ${SIGNED}`);
  await expect(dialog.getByRole("button", { name: /^Upload/ })).toBeDisabled(); // nothing was accepted
});

test("e2. upload dialog: analyze-file refuses post-upload ⇒ the sentence replaces the parser line", async ({ page }) => {
  const captured = await guardWrites(page, { analyzeFilePostUpload: "too_large" });
  await openWorkspace(page, "inputs");
  await operatorOn(page);
  await page.getByTestId("inputs-upload-open").click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input[type=file]").setInputFiles({ name: "throwaway-in-cap.txt", mimeType: "text/plain", buffer: Buffer.from("throwaway in-cap probe") });
  await dialog.getByRole("button", { name: /^Upload/ }).click();
  await expect(dialog.getByTestId("upload-analysis-refused")).toHaveText(SIGNED, { timeout: 60_000 });
  await expect(dialog.getByText(/text extraction: none/i)).toHaveCount(0);
  expect(captured.some((c) => /analyze-file/.test(c.url) && typeof (c.body as Record<string, unknown>).filePath === "string")).toBe(true);
});
