import { expect, type Page } from "playwright/test";
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

export async function openWorkspace(page: Page, segment: string): Promise<void> {
  await open(page, wsPath(segment));
  await expect(page.getByTestId("workspace-root")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("workspace-stage")).toBeVisible();
}
