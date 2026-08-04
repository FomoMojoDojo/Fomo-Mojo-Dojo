// PCL-1 — the smallest honest positioning-as-claims writer.
//
// Mints claims from a company's DECLARED_DIRECTION positioning canvas ONLY.
// Each differentiator's DESCRIPTION (verbatim) becomes the claim statement;
// identity is contentIdentity(statement) via the single shared authority
// (imported, never reimplemented). Deterministic, model-free, add-only.
//
// LAWS honored:
//   - SOURCE: artifact_role='declared_direction' is filtered AT THE QUERY
//     (line ~55). market_read is structurally unreachable — there is no code
//     path in this module that reads any other artifact_role.
//   - STATEMENT: item.description, byte-identical. No trim / case / truncation.
//     The name + local id are labels and live in raw_payload (NOT hashed).
//   - IDENTITY: contentIdentity(description). Skip-before-insert against the
//     company's existing topic='positioning' claim identities.
//   - ADD-ONLY: this module INSERTs and nothing else. It never updates,
//     deletes, or touches status — including for orphans (reported only).
//   - Fields: provenance='internal_declared', topic='positioning'; every other
//     column takes its DB default (state=outside_view born, triangulation=
//     untested, claim_type=observation, confidence=low, counts=0, status=active).
//
// Run (dry by default):
//   export $(supabase status -o env | grep -E '^(SERVICE_ROLE_KEY|API_URL)=' | xargs)
//   deno run --allow-net --allow-env --allow-read scripts/oneoff/pcl1-mint-positioning-claims.ts
// To write for real: prepend  PCL1_WRITE=1
import { contentIdentity } from "../../supabase/functions/_shared/contentIdentity.ts";

const API = Deno.env.get("API_URL") ?? "http://127.0.0.1:54321";
const KEY = Deno.env.get("SERVICE_ROLE_KEY") ?? "";
const COMPANY_ID = Deno.env.get("PCL1_COMPANY_ID") ?? "3dd2cfbb-0792-4bf1-9cd4-15db9646874b"; // Edgewood Center
const WRITE = Deno.env.get("PCL1_WRITE") === "1";

if (!KEY) { console.error("SERVICE_ROLE_KEY missing"); Deno.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (path: string) => `${API}/rest/v1/${path}`;
async function getJSON(path: string) {
  const r = await fetch(rest(path), { headers: H });
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

type UA = { id: string; name: string; description: string };
type Report = {
  companyId: string;
  canvasId: string | null;
  toInsert: Array<{ identity: string; statement: string; name: string; localId: string }>;
  toSkip: Array<{ identity: string; name: string; localId: string }>;
  orphans: Array<{ claimId: string; identity: string; statement: string }>;
};

async function plan(): Promise<Report> {
  // SOURCE FILTER — declared_direction ONLY, enforced in the query string.
  // market_read is unreachable: no other select of unique_attributes_json exists here.
  const canv = await getJSON(
    `positioning_canvases?company_id=eq.${COMPANY_ID}` +
    `&artifact_role=eq.declared_direction` +
    `&select=id,unique_attributes_json`,
  );
  if (!Array.isArray(canv) || canv.length === 0) {
    return { companyId: COMPANY_ID, canvasId: null, toInsert: [], toSkip: [], orphans: [] };
  }
  const canvasId: string = canv[0].id;
  const items: UA[] = Array.isArray(canv[0].unique_attributes_json) ? canv[0].unique_attributes_json : [];

  // Existing identities — SCOPE = this company's topic='positioning' claims.
  // (Deliberately NOT scoped by statement text across other topics/provenance:
  //  per the coexistence law a public_observed echo of the same text must NOT
  //  suppress our internal_declared mint — that coexistence is the delta signal.)
  const existing = await getJSON(
    `claims?company_id=eq.${COMPANY_ID}&topic=eq.positioning&select=id,statement`,
  ) as Array<{ id: string; statement: string }>;
  const existingByIdentity = new Map<string, { id: string; statement: string }>();
  for (const c of existing) existingByIdentity.set(await contentIdentity(c.statement), c);

  const toInsert: Report["toInsert"] = [];
  const toSkip: Report["toSkip"] = [];
  const canvasIdentities = new Set<string>();
  const seenThisRun = new Set<string>(); // intra-batch dedup (identical descriptions)
  for (const it of items) {
    const statement = it.description; // VERBATIM — no trim/case/truncate
    const identity = await contentIdentity(statement);
    canvasIdentities.add(identity);
    if (existingByIdentity.has(identity) || seenThisRun.has(identity)) {
      toSkip.push({ identity, name: it.name, localId: it.id });
      continue;
    }
    seenThisRun.add(identity);
    toInsert.push({ identity, statement, name: it.name, localId: it.id });
  }

  // ORPHANS — existing positioning claims whose identity is absent from the
  // current canvas. REPORT ONLY. There is no code path below that mutates them.
  const orphans: Report["orphans"] = [];
  for (const [identity, row] of existingByIdentity) {
    if (!canvasIdentities.has(identity)) orphans.push({ claimId: row.id, identity, statement: row.statement });
  }

  return { companyId: COMPANY_ID, canvasId, toInsert, toSkip, orphans };
}

async function insert(rows: Report["toInsert"], canvasId: string): Promise<number> {
  if (rows.length === 0) return 0;
  const payload = rows.map((r) => ({
    company_id: COMPANY_ID,
    statement: r.statement,          // verbatim
    topic: "positioning",
    provenance: "internal_declared",
    raw_payload: {
      differentiator_name: r.name,
      differentiator_local_id: r.localId,
      source_canvas_id: canvasId,
      source_artifact_role: "declared_direction",
      minted_by: "pcl1-mint-positioning-claims",
    },
    // every other column intentionally omitted -> DB default
  }));
  const r = await fetch(rest("claims"), {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`INSERT -> ${r.status} ${await r.text()}`);
  const inserted = await r.json();
  return Array.isArray(inserted) ? inserted.length : 0;
}

const report = await plan();
console.log(`PCL-1  company=${report.companyId}  canvas=${report.canvasId}  WRITE=${WRITE}`);
console.log(`WOULD INSERT (${report.toInsert.length}):`);
for (const r of report.toInsert) console.log(`  + ci=${r.identity.slice(0, 12)} [${r.localId}] name="${r.name}" stmt="${r.statement.slice(0, 60)}${r.statement.length > 60 ? "…" : ""}"`);
console.log(`WOULD SKIP (${report.toSkip.length}):`);
for (const r of report.toSkip) console.log(`  = ci=${r.identity.slice(0, 12)} [${r.localId}] name="${r.name}"`);
console.log(`ORPHANS — report only, never modified (${report.orphans.length}):`);
for (const r of report.orphans) console.log(`  ? claim=${r.claimId} ci=${r.identity.slice(0, 12)} stmt="${r.statement.slice(0, 60)}"`);

if (WRITE) {
  if (!report.canvasId) { console.error("no declared_direction canvas — nothing to write"); Deno.exit(1); }
  const n = await insert(report.toInsert, report.canvasId);
  console.log(`INSERTED ${n} row(s).`);
} else {
  console.log("DRY RUN — no writes. Set PCL1_WRITE=1 to persist.");
}
