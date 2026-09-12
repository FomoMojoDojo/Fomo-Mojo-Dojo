// (o) Opportunities Tier 1 controls — proofs with NO real writes: every non-GET Supabase request (REST,
// storage, functions) is intercepted and answered synthetically; the spec asserts the request shape the
// workspace issues, which is the same shape the Workshop Opportunities tab issues through the same
// hooks (useOpportunityProposalHandlers, useDriftScan, useDriftAssessment) and the same moved
// components (opportunitiesShared). Reads pass through to the real fixture (Edgewood: 14 public_research
// + 14 internal_declared needs, 0 pending opportunity proposals, 0 opportunity drift assessments,
// program_phase diagnose), except the reads a proof must control — each a PLANT the vacuity tests show
// is load-bearing:
//   proposals   surface_proposals GET → one pending row for a chosen need (Apply / Dismiss are otherwise absent)
//   drift       surface_drift_assessments GET → one slight_drift row (Propose changes is otherwise disabled;
//               the badge otherwise absent)
//   phase       companies GET program_phase → flow (DriftBadge's phase matrix hides drift in diagnose)
// Capability-false negatives are NOT drivable here: local dev resolves every capability true through the
// admin bypass (useAuth.isLocalAdminBypassEnabled) — they are proven at component level in
// NeedsOrgPanel.lift.test.tsx and DriftDetailPanel.gate.test.tsx against the same gates.
import { expect, test, type Page, type Route } from "playwright/test";
import { COMPANY_ID } from "../../playwright.config";
import { openWorkspace } from "./helpers";

type Captured = { method: string; url: string; body: unknown };
type NeedRow = { id: string; desired_outcome: string; odi_canonical_statement?: string | null; provenance_type?: string | null };
const SUPABASE = /\/(rest|storage|functions)\/v1\//;

type Plants = {
  /** Plant a pending proposal on this need id (resolved lazily from the needs read by provenance). */
  proposalOn?: "declared" | "public";
  /** Plant a slight_drift assessment on this need id (same lazy resolution). */
  driftOn?: "declared" | "public";
  /** Answer the surface_proposals INSERT with 500 (ruling 2 failure state). */
  failInsert?: boolean;
  /** Plant program_phase flow on the companies read (the DriftBadge phase matrix). */
  phaseFlow?: boolean;
};

type Guard = {
  captured: Captured[];
  needs: () => NeedRow[];
  pick: (which: "declared" | "public") => NeedRow;
  proposalId: string;
  assessmentId: string;
  /** The pending row the guard serves after a successful author POST (the page's re-read sees it). */
  staged: () => Record<string, unknown> | null;
};

const PROPOSAL_ID = "11111111-1111-4111-8111-111111111111";
const ASSESSMENT_ID = "22222222-2222-4222-8222-222222222222";

async function guardWrites(page: Page, plants: Plants = {}): Promise<Guard> {
  const captured: Captured[] = [];
  let needs: NeedRow[] = [];
  // The proposals / assessments reads can fire before the page's needs read (useOpportunityProposals
  // keys on the company; useOdiNeeds waits for the viewed set). A plant that names a need resolves the
  // fixture's needs itself — a GET with the intercepted request's own apikey / bearer (same session).
  let needsFetch: Promise<void> | null = null;
  const awaitNeeds = (from: { url: string; headers: Record<string, string> }) => {
    if (needs.length) return Promise.resolve();
    needsFetch ??= (async () => {
      const origin = new URL(from.url).origin;
      const res = await page.request.get(`${origin}/rest/v1/odi_needs?select=id,desired_outcome,odi_canonical_statement,provenance_type&company_id=eq.${COMPANY_ID}&order=tier.asc,sort_order.asc.nullslast,opportunity_score.desc`, {
        headers: { apikey: from.headers.apikey ?? "", authorization: from.headers.authorization ?? "" },
      });
      const rows = (await res.json()) as NeedRow[];
      if (Array.isArray(rows) && rows.length && !needs.length) needs = rows;
    })();
    return needsFetch;
  };
  let staged: Record<string, unknown> | null = null;
  let plantReviewed = false; // the planted proposal left pending (accepted / rejected)
  let acceptedAt: string | null = null;
  // The plant target is pinned on first resolution: the guard's direct read and the page's own read
  // can order the rows differently, and a plant served on one row must be the row the test selects.
  const pinned: Partial<Record<"declared" | "public", NeedRow>> = {};
  const pick = (which: "declared" | "public") => {
    if (pinned[which]) return pinned[which]!;
    const row = needs.find((n) => n.provenance_type === (which === "declared" ? "internal_declared" : "public_research"));
    if (!row) throw new Error(`fixture has no ${which} need`);
    pinned[which] = row;
    return row;
  };
  const proposalFor = (need: NeedRow) => ({
    id: PROPOSAL_ID, surface_id: need.id, company_id: COMPANY_ID, status: "pending", reason: "Planted for the proof.", created_at: "2026-09-01T00:00:00Z",
    current_state: { desired_outcome: need.desired_outcome, odi_canonical_statement: need.odi_canonical_statement ?? "" },
    proposed_state: { desired_outcome: need.desired_outcome, odi_canonical_statement: `${need.odi_canonical_statement ?? need.desired_outcome} — planted rewrite` },
  });
  const assessmentFor = (need: NeedRow) => ({
    id: ASSESSMENT_ID, company_id: COMPANY_ID, surface_type: "opportunity", surface_id: need.id, drift_state: "slight_drift", drift_score: 0.42,
    assessment_basis: { new_signals: [] }, last_assessed_at: "2026-09-01T00:00:00Z", operator_seen_at: "2026-09-01T00:00:00Z", accepted_as_aligned_at: acceptedAt,
  });
  await page.route(SUPABASE, async (route: Route) => {
    const req = route.request();
    const method = req.method();
    const url = req.url();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      if (/\/rest\/v1\/odi_needs\?/.test(url) && /select=\*/.test(url)) {
        const res = await route.fetch();
        let rows: NeedRow[] = [];
        try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
        if (rows.length) needs = rows;
        return route.fulfill({ response: res, body: JSON.stringify(rows), headers: { ...res.headers(), "content-type": "application/json" } });
      }
      if (/\/rest\/v1\/surface_proposals\?/.test(url) && /surface_type=eq\.opportunity/.test(url) && /status=eq\.pending/.test(url)) {
        const rows: unknown[] = [];
        if (plants.proposalOn) await awaitNeeds({ url, headers: req.headers() });
        if (staged) rows.push(staged);
        else if (plants.proposalOn && !plantReviewed && needs.length) rows.push(proposalFor(pick(plants.proposalOn)));
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
      }
      if (/\/rest\/v1\/surface_drift_assessments\?/.test(url)) {
        const sid = new URL(url).searchParams.get("surface_id")?.replace(/^eq\./, "");
        const single = /object/.test(req.headers()["accept"] ?? "");
        if (plants.driftOn) await awaitNeeds({ url, headers: req.headers() });
        const target = plants.driftOn && needs.length ? pick(plants.driftOn) : null;
        const rows = target && sid === target.id ? [assessmentFor(target)] : [];
        if (single) return rows.length ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows[0]) }) : route.fulfill({ status: 406, contentType: "application/json", body: JSON.stringify({ message: "no rows" }) });
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
      }
      if (plants.phaseFlow && /\/rest\/v1\/companies\?/.test(url)) {
        const res = await route.fetch();
        let rows: unknown;
        try { rows = JSON.parse(await res.text()); } catch { return route.fulfill({ response: res }); }
        const patch = (r: Record<string, unknown>) => (r.id === COMPANY_ID ? { ...r, program_phase: "flow" } : r);
        const out = Array.isArray(rows) ? rows.map((r) => patch(r as Record<string, unknown>)) : patch(rows as Record<string, unknown>);
        return route.fulfill({ response: res, body: JSON.stringify(out), headers: { ...res.headers(), "content-type": "application/json" } });
      }
      return route.continue();
    }
    let body: unknown = null;
    try { body = req.postDataJSON(); } catch { body = req.postData(); }
    captured.push({ method, url, body });
    if (/\/rest\/v1\/surface_proposals$/.test(url.split("?")[0]) && method === "POST") {
      if (plants.failInsert) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "PLANTED", message: "planted insert failure", details: null, hint: null }) });
      staged = { id: PROPOSAL_ID, created_at: new Date().toISOString(), ...(body as Record<string, unknown>) };
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([staged]) });
    }
    if (/\/rest\/v1\/surface_proposals\?/.test(url) && method === "PATCH") {
      // A reviewed proposal leaves the pending read (accepted / rejected / superseded).
      const b = body as Record<string, unknown>;
      if (b && b.status !== "pending") { staged = null; if (new URL(url).searchParams.get("id") === `eq.${PROPOSAL_ID}`) plantReviewed = true; }
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (/\/rest\/v1\/surface_drift_assessments\?/.test(url) && method === "PATCH") {
      const b = body as Record<string, unknown>;
      if (typeof b?.accepted_as_aligned_at === "string") acceptedAt = b.accepted_as_aligned_at;
      const row = plants.driftOn ? { ...assessmentFor(pick(plants.driftOn)), ...b } : b;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row) });
    }
    if (/\/functions\/v1\/assess-surface-drift/.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ assessed: 1, aligned: 1, slight_drift: 0, material_drift: 0 }) });
    if (/\/functions\/v1\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    if (method === "PATCH" && /\/rest\/v1\//.test(url)) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    if (method === "POST" && /\/rest\/v1\//.test(url)) {
      const row = { id: "synthetic-row", ...(typeof body === "object" && body && !Array.isArray(body) ? (body as object) : {}) };
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(Array.isArray(body) ? [row] : row) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  return { captured, needs: () => needs, pick, proposalId: PROPOSAL_ID, assessmentId: ASSESSMENT_ID, staged: () => staged };
}

async function operatorOn(page: Page) {
  await page.locator("[data-fr-operator-switch]").click();
  await expect(page.locator("[data-fr-operator-switch]")).toHaveAttribute("data-fr-operator-switch", "on");
}
async function selectRow(page: Page, need: NeedRow) {
  await page.locator(`[data-testid=opps-row][data-fr-need-id="${need.id}"]`).click();
  await expect(page.getByTestId("opps-aside")).toHaveAttribute("data-fr-need-id", need.id);
}
const q = (c: Captured) => new URL(c.url).searchParams;
const CONTROL_IDS = ["opps-title-mode", "opps-actions", "opps-check-drift", "opps-drift-badge", "opps-propose-changes", "opps-suggest-edit", "opps-review-proposal"];

test("e. default render: zero operator nodes and none of the controls", async ({ page }) => {
  const g = await guardWrites(page, { proposalOn: "declared", driftOn: "public", phaseFlow: true });
  await openWorkspace(page, "opportunities");
  await expect(page.getByTestId("opps-row").first()).toBeVisible();
  await expect(page.locator("[data-fr-operator]")).toHaveCount(0);
  for (const id of CONTROL_IDS) await expect(page.getByTestId(id)).toHaveCount(0);
  expect(g.captured).toHaveLength(0);
});

test("h. Human | Canonical is view state: the aside title follows the toggle; nothing leaves the page", async ({ page }) => {
  const g = await guardWrites(page);
  await openWorkspace(page, "opportunities");
  await operatorOn(page);
  const declared = g.pick("declared");
  await selectRow(page, declared);
  await expect(page.getByTestId("opps-aside-title")).toHaveText(declared.desired_outcome);
  await page.getByTestId("opps-title-mode").getByRole("button", { name: "Canonical" }).click();
  await expect(page.getByTestId("opps-aside-title")).toHaveText(declared.odi_canonical_statement ?? declared.desired_outcome);
  await page.getByTestId("opps-title-mode").getByRole("button", { name: "Human" }).click();
  await expect(page.getByTestId("opps-aside-title")).toHaveText(declared.desired_outcome);
  expect(g.captured).toHaveLength(0);
});

test("a. Suggest an edit: the supersede PATCH then the pending INSERT carry the row's id and the typed text; the aside flips to Apply / Dismiss on the re-read", async ({ page }) => {
  const g = await guardWrites(page);
  await openWorkspace(page, "opportunities");
  await operatorOn(page);
  const declared = g.pick("declared");
  await selectRow(page, declared);
  await expect(page.getByTestId("opps-review-proposal")).toHaveCount(0);
  await page.getByTestId("opps-suggest-edit").getByRole("button", { name: "Suggest an edit" }).click();
  const ta = page.getByTestId("opps-suggest-edit").locator("textarea");
  await expect(ta).toHaveValue(declared.odi_canonical_statement ?? declared.desired_outcome);
  await ta.fill("Maximize clarity of the presenting problem at first contact");
  await page.getByTestId("opps-suggest-edit").getByRole("button", { name: "Submit edit" }).click();
  await expect.poll(() => g.captured.filter((c) => /\/rest\/v1\/surface_proposals/.test(c.url)).length).toBe(2);
  const [supersede, insert] = g.captured.filter((c) => /\/rest\/v1\/surface_proposals/.test(c.url));
  expect(supersede.method).toBe("PATCH");
  expect(q(supersede).get("surface_type")).toBe("eq.opportunity");
  expect(q(supersede).get("surface_id")).toBe(`eq.${declared.id}`);
  expect(q(supersede).get("status")).toBe("eq.pending");
  expect(supersede.body).toMatchObject({ status: "superseded" });
  expect(insert.method).toBe("POST");
  expect(insert.body).toMatchObject({
    company_id: COMPANY_ID, surface_type: "opportunity", surface_id: declared.id, status: "pending", reason: "Manual edit",
    current_state: { desired_outcome: declared.desired_outcome, odi_canonical_statement: declared.odi_canonical_statement ?? "" },
    proposed_state: { desired_outcome: declared.desired_outcome, odi_canonical_statement: "Maximize clarity of the presenting problem at first contact" },
  });
  // No other write left the page (no odi_needs touch, no function call).
  expect(g.captured.filter((c) => !/\/rest\/v1\/surface_proposals/.test(c.url))).toHaveLength(0);
  // The staged row comes back on the re-read: the lane gives way to the review section.
  await expect(page.getByTestId("opps-review-proposal")).toBeVisible();
  await expect(page.getByTestId("opps-suggest-edit")).toHaveCount(0);
  await expect(page.getByTestId("opps-review-proposal").getByRole("button", { name: "Apply 1 of 1 change" })).toBeVisible();
});

test("a2. Suggest an edit, INSERT refused (planted 500): the failure renders — toast.error with the message, no success toast, the lane stays open with the draft", async ({ page }) => {
  const g = await guardWrites(page, { failInsert: true });
  await openWorkspace(page, "opportunities");
  await operatorOn(page);
  const declared = g.pick("declared");
  await selectRow(page, declared);
  await page.getByTestId("opps-suggest-edit").getByRole("button", { name: "Suggest an edit" }).click();
  const ta = page.getByTestId("opps-suggest-edit").locator("textarea");
  await ta.fill("A draft the server refuses");
  await page.getByTestId("opps-suggest-edit").getByRole("button", { name: "Submit edit" }).click();
  await expect.poll(() => g.captured.filter((c) => /\/rest\/v1\/surface_proposals/.test(c.url) && c.method === "POST").length).toBe(1);
  await expect(page.getByText("planted insert failure")).toBeVisible();
  await expect(page.getByText("Edit staged for review")).toHaveCount(0);
  await expect(ta).toHaveValue("A draft the server refuses");
  await expect(page.getByTestId("opps-suggest-edit").getByRole("button", { name: "Submit edit" })).toBeEnabled();
  await expect(page.getByTestId("opps-review-proposal")).toHaveCount(0);
});

test("b1. Apply on a declared need: odi_needs PATCH (outcome + canonical + source_path), the baseline capture, the accepted PATCH with raw_payload — and NO alignment invoke", async ({ page }) => {
  const g = await guardWrites(page, { proposalOn: "declared" });
  await openWorkspace(page, "opportunities");
  await operatorOn(page);
  const declared = g.pick("declared");
  await selectRow(page, declared);
  await expect(page.getByTestId("opps-suggest-edit")).toHaveCount(0); // pending ⇒ no human lane
  const apply = page.getByTestId("opps-review-proposal").getByRole("button", { name: "Apply 1 of 1 change" });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect.poll(() => g.captured.filter((c) => /\/rest\/v1\/surface_proposals\?/.test(c.url) && c.method === "PATCH").length).toBe(1);
  const needPatches = g.captured.filter((c) => /\/rest\/v1\/odi_needs\?/.test(c.url) && c.method === "PATCH");
  expect(needPatches).toHaveLength(2);
  expect(q(needPatches[0]).get("id")).toBe(`eq.${declared.id}`);
  expect(needPatches[0].body).toEqual({
    source_path: `manual_${g.proposalId}`,
    desired_outcome: declared.desired_outcome,
    odi_canonical_statement: `${declared.odi_canonical_statement ?? declared.desired_outcome} — planted rewrite`,
  });
  // captureBaseline: the active-signal snapshot onto the same row.
  expect(q(needPatches[1]).get("id")).toBe(`eq.${declared.id}`);
  expect(Object.keys(needPatches[1].body as object).sort()).toEqual(["evidence_baseline_captured_at", "evidence_baseline_signal_ids"]);
  expect(Array.isArray((needPatches[1].body as { evidence_baseline_signal_ids: unknown }).evidence_baseline_signal_ids)).toBe(true);
  const accepted = g.captured.find((c) => /\/rest\/v1\/surface_proposals\?/.test(c.url) && c.method === "PATCH")!;
  expect(q(accepted).get("id")).toBe(`eq.${g.proposalId}`);
  expect(accepted.body).toMatchObject({ status: "accepted", raw_payload: { accepted_fields: ["outcome_statement"], skipped_fields: [] } });
  expect(typeof (accepted.body as { reviewed_at: unknown }).reviewed_at).toBe("string");
  expect(g.captured.filter((c) => /\/functions\/v1\/evaluate-opportunity-alignment/.test(c.url))).toHaveLength(0);
  // The accepted proposal leaves the pending read: the review section is gone, the human lane returns.
  await expect(page.getByTestId("opps-review-proposal")).toHaveCount(0);
  await expect(page.getByTestId("opps-suggest-edit")).toBeVisible();
});

test("b2. Apply on a public need: the same writes plus the evaluate-opportunity-alignment invoke", async ({ page }) => {
  const g = await guardWrites(page, { proposalOn: "public" });
  await openWorkspace(page, "opportunities");
  await operatorOn(page);
  const pub = g.pick("public");
  await selectRow(page, pub);
  await page.getByTestId("opps-review-proposal").getByRole("button", { name: "Apply 1 of 1 change" }).click();
  await expect.poll(() => g.captured.filter((c) => /\/functions\/v1\/evaluate-opportunity-alignment/.test(c.url)).length).toBe(1);
  const invoke = g.captured.find((c) => /\/functions\/v1\/evaluate-opportunity-alignment/.test(c.url))!;
  expect(invoke.body).toEqual({ need_id: pub.id, company_id: COMPANY_ID });
  expect(g.captured.filter((c) => /\/rest\/v1\/odi_needs\?/.test(c.url) && c.method === "PATCH")).toHaveLength(2);
});

test("c. Dismiss: one surface_proposals PATCH — rejected + reviewed_at, by the proposal id; nothing else", async ({ page }) => {
  const g = await guardWrites(page, { proposalOn: "declared" });
  await openWorkspace(page, "opportunities");
  await operatorOn(page);
  await selectRow(page, g.pick("declared"));
  await page.getByTestId("opps-review-proposal").getByRole("button", { name: "Dismiss" }).click();
  await expect.poll(() => g.captured.length).toBe(1);
  const [reject] = g.captured;
  expect(reject.method).toBe("PATCH");
  expect(/\/rest\/v1\/surface_proposals\?/.test(reject.url)).toBe(true);
  expect(q(reject).get("id")).toBe(`eq.${g.proposalId}`);
  expect(Object.keys(reject.body as object).sort()).toEqual(["reviewed_at", "status"]);
  expect(reject.body).toMatchObject({ status: "rejected" });
  await expect(page.getByTestId("opps-review-proposal")).toHaveCount(0);
});

test("d. Check for drift: the assess-surface-drift invoke carries company, surface type and the row's id; the view's toast renders", async ({ page }) => {
  const g = await guardWrites(page);
  await openWorkspace(page, "opportunities");
  await operatorOn(page);
  const declared = g.pick("declared");
  await selectRow(page, declared);
  await page.getByTestId("opps-check-drift").click();
  await expect.poll(() => g.captured.length).toBe(1);
  const [check] = g.captured;
  expect(/\/functions\/v1\/assess-surface-drift/.test(check.url)).toBe(true);
  expect(check.body).toEqual({ company_id: COMPANY_ID, surface_type: "opportunity", surface_id: declared.id });
  await expect(page.getByText("Checked opportunity · aligned")).toBeVisible();
  await expect(page.getByTestId("opps-check-drift")).toHaveText("Check for drift");
});

test("f. Propose changes (public row, planted drift): enabled only with a drift row; the click issues propose-opportunity-changes {opportunity_id, company_id}", async ({ page }) => {
  const g = await guardWrites(page, { driftOn: "public", phaseFlow: true });
  await openWorkspace(page, "opportunities");
  await operatorOn(page);
  const pub = g.pick("public");
  await selectRow(page, pub);
  const propose = page.getByTestId("opps-propose-changes").getByRole("button");
  await expect(propose).toHaveText("⊕ Propose changes");
  await expect(propose).toBeEnabled();
  await propose.click();
  await expect.poll(() => g.captured.length).toBe(1);
  expect(/\/functions\/v1\/propose-opportunity-changes/.test(g.captured[0].url)).toBe(true);
  expect(g.captured[0].body).toEqual({ opportunity_id: pub.id, company_id: COMPANY_ID });
  // The declared row carries no agent lane at all.
  await selectRow(page, g.pick("declared"));
  await expect(page.getByTestId("opps-propose-changes")).toHaveCount(0);
});

test("g. Accept as aligned (planted drift + flow phase): the badge opens the panel; Accept issues the surface_drift_assessments PATCH by the assessment id; the badge leaves", async ({ page }) => {
  const g = await guardWrites(page, { driftOn: "public", phaseFlow: true });
  await openWorkspace(page, "opportunities");
  await operatorOn(page);
  await selectRow(page, g.pick("public"));
  const badge = page.getByTestId("opps-drift-badge").getByRole("button");
  await expect(badge).toBeVisible();
  await badge.click();
  const accept = page.getByTestId("drift-accept-aligned");
  await expect(accept).toBeVisible();
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect.poll(() => g.captured.length).toBe(1);
  const [patch] = g.captured;
  expect(patch.method).toBe("PATCH");
  expect(/\/rest\/v1\/surface_drift_assessments\?/.test(patch.url)).toBe(true);
  expect(q(patch).get("id")).toBe(`eq.${g.assessmentId}`);
  expect(Object.keys(patch.body as object)).toEqual(["accepted_as_aligned_at"]);
  await expect(accept).toHaveCount(0); // panel closed
  await expect(page.getByTestId("opps-drift-badge").getByRole("button")).toHaveCount(0); // accepted ⇒ no badge
});

// ── Vacuity (7d): each plant is load-bearing — remove it and the control the proof drives is absent / inert. ──
test("v1. without the proposal plant there is no review section (Apply / Dismiss cannot be reached)", async ({ page }) => {
  const g = await guardWrites(page);
  await openWorkspace(page, "opportunities");
  await operatorOn(page);
  await selectRow(page, g.pick("declared"));
  await expect(page.getByTestId("opps-suggest-edit")).toBeVisible();
  await expect(page.getByTestId("opps-review-proposal")).toHaveCount(0);
  await selectRow(page, g.pick("public"));
  await expect(page.getByTestId("opps-review-proposal")).toHaveCount(0);
});

test("v2. without the drift plant, Propose changes is disabled and no badge renders; with drift but the real (diagnose) phase, still no badge", async ({ page }) => {
  const g = await guardWrites(page);
  await openWorkspace(page, "opportunities");
  await operatorOn(page);
  await selectRow(page, g.pick("public"));
  await expect(page.getByTestId("opps-propose-changes").getByRole("button")).toBeDisabled();
  await expect(page.getByTestId("opps-drift-badge").getByRole("button")).toHaveCount(0);
  expect(g.captured).toHaveLength(0);
});

test("v3. drift planted but the fixture's real phase (diagnose): the phase matrix hides the badge — the phase plant is what proof g depends on", async ({ page }) => {
  const g = await guardWrites(page, { driftOn: "public" });
  await openWorkspace(page, "opportunities");
  await operatorOn(page);
  await selectRow(page, g.pick("public"));
  await expect(page.getByTestId("opps-propose-changes").getByRole("button")).toBeEnabled(); // drift row present
  await expect(page.getByTestId("opps-drift-badge").getByRole("button")).toHaveCount(0); // but no badge in diagnose
});
