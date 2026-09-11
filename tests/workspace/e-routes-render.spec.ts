// (e) Each of the ten routes renders inside .first-read with the fr-shell-header present.
import { expect, test } from "playwright/test";
import { WS_PAGES, openWorkspace } from "./helpers";

for (const seg of WS_PAGES) {
  test(`renders /${seg || "(index)"} inside .first-read with the shell header`, async ({ page }) => {
    await openWorkspace(page, seg);
    const root = page.getByTestId("workspace-root");
    await expect(root).toHaveClass(/\bfirst-read\b/);
    await expect(root.locator("header.fr-shell-header")).toHaveCount(1);
    await expect(root.locator(".fr-shell-title")).toHaveText("MojoMap");
    await expect(page.getByTestId("workspace-identity")).toContainText("DAY");
  });
}
