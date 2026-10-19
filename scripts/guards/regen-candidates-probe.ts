// R27 probe: the regen WRITE path on the test fixtures (fake db, fake transport — no network, no stack) where the
// model returns ONE exact span and ONE paraphrase of the same sentence. Prints the measured values the guard asserts:
// admitted, e4_not_verbatim, candidates stored on the integrity row, how many carry both reasons, and the
// paraphrase's nearest page span with its offset. Plant P1 (drop the recording) moves stored 2 → 0.
import { runOutsideRegen } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import { fakeDb, seedR27, deps, r27Transport, CO, RUN2, U1, P27 } from "../../supabase/functions/_shared/outsideRegenHandler.test.ts";

const db = fakeDb(seedR27());
const { d } = deps(db, r27Transport(), null);
const r = await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, d);
const integ = ((db.inserts.integrity_runs ?? [])[0]?.excluded_by_rule ?? {}) as { candidates?: Array<Record<string, unknown>>; reject_reasons?: Record<string, number> };
const stored = integ.candidates ?? [];
const para = stored.find((c) => c.code === "e4_not_verbatim");
const ns = (para?.nearest_span ?? null) as { text: string; offset: number; length: number } | null;
const minted = (db.inserts.signals ?? []) as Array<{ raw_payload: Record<string, unknown> }>;
console.log(JSON.stringify({
  status: r.status, admitted: minted.length, e4_not_verbatim: integ.reject_reasons?.e4_not_verbatim ?? 0,
  stored_candidates: stored.length, with_both_reasons: stored.filter((c) => c.generator_reason && c.judge_reason).length,
  stored_in_full: stored.every((c) => String(c.text).length > 80),
  paraphrase_nearest_span: ns ? { text: ns.text, offset: ns.offset, indexes_raw_page: P27.slice(ns.offset, ns.offset + ns.length) === ns.text } : null,
  minted_raw_payload_reasons: minted.length ? [minted[0].raw_payload.generator_reason, minted[0].raw_payload.judge_reason] : null,
}));
