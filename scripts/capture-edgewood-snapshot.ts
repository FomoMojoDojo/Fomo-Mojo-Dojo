// capture-edgewood-snapshot.ts — Edgewood static-snapshot capture for the
// Lovable design-exploration frontend (a+c hybrid: this JSON is consumed by the
// fixture-backed mock Supabase client in src/integrations/supabase/fixtureClient.ts
// when HAS_SUPABASE_CREDENTIALS === false).
//
// READ-ONLY. Scoped STRICTLY to Edgewood's company_id so no other company's rows
// ride along. Strips raw LLM/source payloads (signals.raw_payload, claims.raw_payload)
// before writing. No secrets are committed — creds come from env at run time.
//
// Run (locally, with the Edgewood-reachable local stack):
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SERVICE_ROLE_KEY=<local service role key> \
//   deno run --allow-net --allow-env --allow-write scripts/capture-edgewood-snapshot.ts
//
// Refreshing when Edgewood or the schema moves: re-run this one command, then
// re-push the lovable-snapshot branch. Staleness is a known, single step.

const EDGEWOOD_COMPANY_ID = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";
const OUT_PATH = "src/integrations/supabase/edgewood.snapshot.json";

// The 23 real relations the client-refine preview surfaces read (from the audit).
// company_id-scoped tables:
const COMPANY_SCOPED = [
  "routes",
  "odi_needs",
  "odi_market_definitions",
  "job_steps",
  "positioning_canvases",
  "strategy_cascades",
  "mojo_scores",
  "signals",
  "claims",
  "claim_signal_refs",
  "surface_proposals",
  "surface_drift_assessments",
  "public_baseline_runs",
  "strategic_hypotheses",
  "file_proposals",
  "desired_outcomes",
  "managed_outcomes",
  "tests",
  "route_decision_events",
  "company_members",
];
// Global / reference tables (not company-scoped) — empty in the live DB, captured whole:
const GLOBAL = ["surface_educational_content", "methodology_pages"];
// Privacy strip: hidden raw LLM/source payloads never leave CC. Policy: strip the
// `raw_payload` column from EVERY table that has one. Rendered LLM-generated
// content (e.g. surface_drift_assessments.llm_confirmation — the drift narrative
// the UI shows; file_proposals.* — the proposal cards) is KEPT: it is real content,
// not a hidden trace. Edgewood is test/mock data, so the bar is no-secrets +
// strip-raw-payloads (not client-confidential redaction).
const STRIP_COLUMNS: Record<string, string[]> = {
  signals: ["raw_payload"],
  claims: ["raw_payload"],
  surface_proposals: ["raw_payload"],
  strategic_hypotheses: ["raw_payload"],
};

function reqEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    console.error(`Missing required env ${name}. See the header of this file for usage.`);
    Deno.exit(1);
  }
  return v;
}

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321").replace(/\/$/, "");
const SERVICE_KEY = reqEnv("SUPABASE_SERVICE_ROLE_KEY");

async function fetchTable(table: string, filter: string): Promise<Record<string, unknown>[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*${filter}`;
  const resp = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!resp.ok) {
    throw new Error(`GET ${table} failed: HTTP ${resp.status} ${await resp.text()}`);
  }
  const rows = (await resp.json()) as Record<string, unknown>[];
  const strip = STRIP_COLUMNS[table];
  if (strip) {
    for (const row of rows) for (const col of strip) delete row[col];
  }
  return rows;
}

const data: Record<string, Record<string, unknown>[]> = {};

// companies — the single Edgewood row (keyed by id, not company_id).
data["companies"] = await fetchTable("companies", `&id=eq.${EDGEWOOD_COMPANY_ID}`);
for (const t of COMPANY_SCOPED) {
  data[t] = await fetchTable(t, `&company_id=eq.${EDGEWOOD_COMPANY_ID}`);
}
for (const t of GLOBAL) {
  data[t] = await fetchTable(t, "");
}

const snapshot = {
  _meta: {
    fixture: "edgewood",
    company_id: EDGEWOOD_COMPANY_ID,
    // Stamp is passed in via env so the script stays deterministic/reproducible.
    captured_note: "Edgewood-only static snapshot for Lovable design exploration. raw_payload stripped from signals+claims. No secrets.",
    stripped: STRIP_COLUMNS,
    row_counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
  },
  data,
};

await Deno.writeTextFile(OUT_PATH, JSON.stringify(snapshot, null, 2));
console.log(`Wrote ${OUT_PATH}`);
console.table(snapshot._meta.row_counts);
