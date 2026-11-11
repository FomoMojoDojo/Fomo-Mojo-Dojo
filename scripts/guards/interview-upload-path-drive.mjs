// The browser half of interview-upload-path-guard.sh. Drives the PRODUCT's own controls as the
// admin: the Inputs page upload dialog, the interview switch, the stakeholder speaker, the Upload
// button, then the row's Withdraw control. Nothing is inserted on the guard's behalf.
//
// Speaker = STAKEHOLDER on purpose: a market_participant upload fires startInterviewMarketInference,
// which calls a model. The stakeholder door calls none (record-interview-upload/handler.ts: "No
// model."), which is what keeps the guard on the local lane and its ledger assertion meaningful.
//
// It writes two files the shell half reads:
//   $POSTS_OUT  every non-GET the page made — the evidence that no POST /rest/v1/interview_records
//               ever happened, i.e. that the record came from the function's service-role client
//   $STEPS_OUT  one key=value line per step, so a browser failure is legible in the guard output
//
// PLANT=norecord makes record-interview-upload never run: its request is fulfilled locally with a
// success body. The dialog reports "saved" and no record is created, which must turn check (c) red.
import { chromium } from "playwright";
import fs from "node:fs";

const CO = process.env.CO;
const FILE = process.env.TRANSCRIPT;
const SHOTS = process.env.SHOTS_DIR || "";
const BASE = process.env.BASE_URL || "http://localhost:8080";
const PLANT = process.env.PLANT || "";

const steps = [];
const say = (k, v) => { steps.push(`${k}=${v}`); console.log(`   ${k}=${v}`); };
const shot = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true }); };

// The tier-1 controls (upload, withdraw) are operator-gated. The switch is per-view, so it is
// re-asserted after every reload rather than assumed to persist.
async function ensureOperator(p) {
  const sw = p.locator("[data-fr-operator-switch]");
  await sw.waitFor({ timeout: 30000 });
  if ((await sw.getAttribute("data-fr-operator-switch")) !== "on") { await sw.click(); await p.waitForTimeout(600); }
  return sw.getAttribute("data-fr-operator-switch");
}

const b = await chromium.launch();
const ctx = await b.newContext({ storageState: "backups/fr-state.json", viewport: { width: 1440, height: 1100 } });
const p = await ctx.newPage();

const posts = [];
p.on("request", (r) => {
  if (r.method() === "GET") return;
  const u = r.url();
  if (u.includes("/rest/v1/") || u.includes("/functions/v1/") || u.includes("/storage/v1/"))
    posts.push(`${r.method()} ${u.replace(/^https?:\/\/[^/]+/, "")}`);
});

if (PLANT === "norecord") {
  await ctx.route("**/functions/v1/record-interview-upload", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, market_state: "per_item", record_id: null }) }));
}

try {
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await p.evaluate((id) => localStorage.setItem("active_company_id", id), CO);
  await p.goto(BASE + "/preview/client-refine/workspace/inputs", { waitUntil: "networkidle", timeout: 120000 });
  await p.waitForTimeout(2500);
  say("operator", await ensureOperator(p));
  await shot(p, "iup-01-inputs-before-upload");

  await p.locator("[data-testid=inputs-upload-open]").click();
  await p.waitForTimeout(800);
  // order matters: the interview switch only renders once a file is staged (files.length > 0)
  await p.locator("input[type=file]").setInputFiles(FILE);
  await p.waitForTimeout(800);
  await p.locator("[data-testid=upload-interview-switch]").check();
  await p.waitForTimeout(400);
  await p.locator("[data-testid=upload-interview-stakeholder]").check({ force: true });
  await p.waitForTimeout(400);
  await shot(p, "iup-02-upload-dialog-interview-stakeholder");

  await p.getByRole("button", { name: /upload/i }).last().click();
  await p.locator("[data-testid=upload-interview-saved]").first().waitFor({ timeout: 120000 });
  say("dialog_result", (await p.locator("[data-testid=upload-interview-saved]").first().innerText()).trim().replace(/\s+/g, " "));
  await shot(p, "iup-03-upload-result-saved-not-parsed");

  await p.keyboard.press("Escape");
  await p.waitForTimeout(3000);
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  await ensureOperator(p);
  const row = p.locator("[data-testid=inputs-file-row]").filter({ has: p.locator("[data-testid=inputs-interview]") }).first();
  // PLANT=norecord gets no row at all, which is the point; the shell's (c) is the one that must speak.
  const listed = await row.count().then((n) => n > 0);
  say("row_listed", listed);
  if (listed) {
    await shot(p, "iup-04-inputs-record-listed");
    await row.locator("[data-testid=inputs-withdraw]").click();
    await p.waitForTimeout(500);
    await shot(p, "iup-05-withdraw-confirm");
    await p.locator("[data-testid=inputs-withdraw-go]").click();
    await p.waitForTimeout(4000);
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForTimeout(2500);
    await ensureOperator(p);
    await shot(p, "iup-06-after-withdraw");
    say("interview_rows_after_withdraw", await p.locator("[data-testid=inputs-interview]").count());
  }
  say("browser", "ok");
} catch (err) {
  say("browser", "failed:" + String(err?.message ?? err).split("\n")[0].slice(0, 120));
} finally {
  if (process.env.POSTS_OUT) fs.writeFileSync(process.env.POSTS_OUT, posts.join("\n") + "\n");
  if (process.env.STEPS_OUT) fs.writeFileSync(process.env.STEPS_OUT, steps.join("\n") + "\n");
  await b.close();
}
