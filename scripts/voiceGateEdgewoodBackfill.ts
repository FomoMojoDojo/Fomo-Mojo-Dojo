// VOICE-GATE-6 — Edgewood attestation backfill (data act, 2026-07-16).
//
// Records what already happened: the operator hand-attested Edgewood's uploaded
// documents as the client's voice out-of-band (that is the ONLY reason Edgewood
// cleared before this gate existed). This writes one immutable client_voice
// OVERRIDE row per CONTRIBUTING document — BESIDE any model verdict, never over
// it — so Edgewood's next declared run is the gate's first real-use acceptance.
//
// - content_sha comes from the SAME TS authority the gate uses (loadContributingDocs
//   → normalizeForHash + sha256Hex). No SQL hash. An override therefore matches the
//   doc's CURRENT content; edit the doc and it re-blocks until re-attested.
// - Touches NO odi_market_definitions / market_register rows (those are immutable).
// - Idempotent: re-running inserts nothing (partial-unique override index).
// - The 9th upload (JTBD Framework PDF) has an EMPTY extracted-text sidecar, so it
//   contributes to no declared brief and is never gated — it needs no override.
//
// Run: SUPABASE_URL=... SRK=<service_role_key> deno run --allow-net --allow-env \
//        scripts/voiceGateEdgewoodBackfill.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadContributingDocs } from "../supabase/functions/_shared/uploadCorpus.ts";

const EDGEWOOD = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";
const BASIS = "operator attestation on record 2026-07-16";
const OVERRIDE_REASON =
  "Edgewood backfill — operator hand-attested all contributing uploads as client voice out-of-band on 2026-07-16 (VOICE_GATE_DESIGN).";

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SRK") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) throw new Error("SUPABASE_URL and SRK (service role key) are required.");

const supabase = createClient(url, key) as any;

const docs = await loadContributingDocs(supabase, EDGEWOOD);
console.log(`Edgewood contributing docs: ${docs.length}`);

let inserted = 0;
let skipped = 0;
for (const d of docs) {
  const { error } = await supabase.from("doc_voice_verdicts").insert({
    input_file_id: d.input_file_id,
    company_id: EDGEWOOD,
    content_sha: d.content_sha,
    verdict: "client_voice", // mirror the override
    operator_override: "client_voice",
    basis: BASIS,
    override_by: null, // out-of-band attestation; no interactive operator id on record
    override_reason: OVERRIDE_REASON,
  });
  if (error) {
    if (String(error.message ?? "").toLowerCase().includes("duplicate")) {
      skipped++;
      console.log(`  = already attested: ${d.file_name}`);
    } else {
      throw new Error(`override insert failed (${d.file_name}): ${error.message}`);
    }
  } else {
    inserted++;
    console.log(`  + attested client_voice: ${d.file_name} (${d.content_sha.slice(0, 12)})`);
  }
}
console.log(`Done — ${inserted} attested, ${skipped} already on record.`);
