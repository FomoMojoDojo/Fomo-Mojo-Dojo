// Mints the admin storage state the specs run under (first-read-capture.mjs discipline: an admin
// session, never handled as credentials in the specs). If FR_STORAGE_STATE already exists it is
// reused; otherwise FR_LOGIN_EMAIL / FR_LOGIN_PASSWORD sign in through the app's DEV window.supabase
// and the state is written. The active company is pinned to FR_COMPANY_ID in localStorage.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { BASE_URL, COMPANY_ID, STORAGE_STATE } from "../../playwright.config";

export default async function globalSetup() {
  if (fs.existsSync(STORAGE_STATE)) return;
  const email = process.env.FR_LOGIN_EMAIL;
  const password = process.env.FR_LOGIN_PASSWORD;
  if (!email || !password) {
    throw new Error(`No storage state at ${STORAGE_STATE} and no FR_LOGIN_EMAIL / FR_LOGIN_PASSWORD to mint one.`);
  }
  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  const result = await page.evaluate(async ({ email, password }) => {
    const sb = (window as unknown as { supabase: { auth: { signInWithPassword: (c: { email: string; password: string }) => Promise<{ data?: { session?: unknown }; error?: { message: string } | null }> } } }).supabase;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    return { ok: Boolean(data?.session), error: error?.message ?? null };
  }, { email, password });
  if (!result.ok) {
    await browser.close();
    throw new Error(`Sign-in failed: ${result.error}`);
  }
  await page.evaluate((id) => localStorage.setItem("active_company_id", id), COMPANY_ID);
  await context.storageState({ path: STORAGE_STATE });
  await browser.close();
}
