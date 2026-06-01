import { chromium } from "playwright";

const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzgwMzMxMTQ3LCJpYXQiOjE3ODAyNDQ3NDcsImlzcyI6Imh0dHA6Ly8xMjcuMC4wLjE6NTQzMjEvYXV0aC92MSIsInN1YiI6IjU4NjBjOTlhLWU2ZjgtNGZlYi05OTk3LTk5MmUzNjU0ZjE4MSIsImVtYWlsIjoiYm9iQGZvbW9tb2pvZG9qby5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7fSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc4MDI0NDc0N31dLCJzZXNzaW9uX2lkIjoiZmFrZS1zZXNzaW9uLWlkLWZvci1kZXYiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.MJVfTwcFWKnN-fWq2kFolpQg5GWi-uktOMGERo-k1-8";

const SESSION = JSON.stringify({
  access_token: JWT,
  token_type: "bearer",
  expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400,
  refresh_token: "fake-refresh-token-for-dev",
  user: {
    id: "5860c99a-e6f8-4feb-9997-992e3654f181",
    aud: "authenticated",
    role: "authenticated",
    email: "bob@fomomojodojo.com",
    email_confirmed_at: "2024-01-01T00:00:00.000Z",
    phone: "",
    confirmed_at: "2024-01-01T00:00:00.000Z",
    last_sign_in_at: "2024-01-01T00:00:00.000Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    is_anonymous: false,
  },
});

const COMPANIES = [
  { name: "Cafe Barra", id: "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc" },
  { name: "Edgewood",   id: "3dd2cfbb-0792-4bf1-9cd4-15db9646874b" },
];

async function inject(page, companyId) {
  await page.addInitScript(
    ({ session, companyId, storageKey }) => {
      localStorage.setItem(storageKey, session);
      localStorage.setItem("active_company_id", companyId);
    },
    { session: SESSION, companyId, storageKey: "sb-127-auth-token" }
  );
}

async function checkRoutesSurface(page, company) {
  await page.context().clearCookies();
  await page.addInitScript(
    ({ session, companyId, storageKey }) => {
      localStorage.setItem(storageKey, session);
      localStorage.setItem("active_company_id", companyId);
      localStorage.removeItem("surface_teaching_mode");
    },
    { session: SESSION, companyId: company.id, storageKey: "sb-127-auth-token" }
  );

  await page.goto("http://127.0.0.1:5173/preview/client-refine/routes", {
    waitUntil: "networkidle",
    timeout: 30_000,
  });

  // Wait for content to load
  await page.waitForTimeout(2000);

  // Check trigger button renders
  const triggerVisible = await page.evaluate(() => {
    const btn = document.querySelector("[data-surface-education-trigger='routes']");
    return !!btn;
  });

  // Click trigger, wait for panel
  let panelText = null;
  let sectionAText = null;
  if (triggerVisible) {
    await page.click("[data-surface-education-trigger='routes']");
    await page.waitForTimeout(800);
    panelText = await page.evaluate(() => {
      const dialog = document.querySelector("[role='dialog']");
      return dialog ? dialog.textContent : null;
    });
    sectionAText = await page.evaluate(() => {
      const el = document.querySelector("[data-section='a']");
      return el ? el.textContent : null;
    });
  }

  // Check teaching toggle in sidebar
  const teachingToggleVisible = await page.evaluate(() => {
    return !!document.querySelector("[data-teaching-toggle]");
  });

  return { triggerVisible, panelText, sectionAText, teachingToggleVisible };
}

async function checkPositioningSurface(page, company) {
  await page.context().clearCookies();
  await page.addInitScript(
    ({ session, companyId, storageKey }) => {
      localStorage.setItem(storageKey, session);
      localStorage.setItem("active_company_id", companyId);
    },
    { session: SESSION, companyId: company.id, storageKey: "sb-127-auth-token" }
  );

  await page.goto("http://127.0.0.1:5173/preview/client-refine/workshop?tab=positioning", {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  await page.waitForTimeout(2000);

  const triggerVisible = await page.evaluate(() => {
    return !!document.querySelector("[data-surface-education-trigger='positioning']");
  });

  // For admin user: admin_only content should show
  let panelHasAdminContent = false;
  if (triggerVisible) {
    await page.click("[data-surface-education-trigger='positioning']");
    await page.waitForTimeout(800);
    panelHasAdminContent = await page.evaluate(() => {
      const dialog = document.querySelector("[role='dialog']");
      return dialog ? dialog.textContent?.includes("[PLACEHOLDER]") : false;
    });
  }

  return { triggerVisible, panelHasAdminContent };
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Silence console noise
  page.on("console", () => {});

  console.log("\n=== Educational Layer Verification ===\n");

  // Routes surface — two companies to verify slot interpolation differs
  for (const company of COMPANIES) {
    const r = await checkRoutesSurface(page, company);
    console.log(`=== ${company.name} — Routes Surface ===`);
    console.log(`  trigger visible:         ${r.triggerVisible}`);
    console.log(`  teaching toggle visible: ${r.teachingToggleVisible}`);
    if (r.sectionAText) {
      console.log(`  section A:               ${r.sectionAText.trim()}`);
    } else if (!r.triggerVisible) {
      console.log(`  section A:               (trigger not visible — check hasHierarchy)`);
    } else {
      console.log(`  section A:               (panel opened but no section A found)`);
    }
    console.log();
  }

  // Positioning surface — admin_only content check (admin user)
  const posResult = await checkPositioningSurface(page, COMPANIES[0]);
  console.log(`=== Positioning Surface (${COMPANIES[0].name}) ===`);
  console.log(`  trigger visible:        ${posResult.triggerVisible}`);
  console.log(`  admin_only content:     ${posResult.panelHasAdminContent}`);
  console.log();

  // Teaching mode toggle — enable and re-check routes
  const teachingPage = await context.newPage();
  await teachingPage.addInitScript(
    ({ session, companyId, storageKey }) => {
      localStorage.setItem(storageKey, session);
      localStorage.setItem("active_company_id", companyId);
      localStorage.setItem("surface_teaching_mode", "true");
    },
    { session: SESSION, companyId: COMPANIES[0].id, storageKey: "sb-127-auth-token" }
  );
  await teachingPage.goto("http://127.0.0.1:5173/preview/client-refine/routes", {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  await teachingPage.waitForTimeout(2500);
  const panelAutoOpen = await teachingPage.evaluate(() => {
    const dialog = document.querySelector("[role='dialog']");
    return !!dialog && dialog.style.transform !== "translateX(100%)";
  });
  console.log(`=== Teaching Mode Auto-Expand ===`);
  console.log(`  panel auto-opened:      ${panelAutoOpen}`);
  console.log();

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
