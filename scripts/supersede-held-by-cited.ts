#!/usr/bin/env -S deno run --allow-all
// ── SUPERSEDE HELD ROWS BY CITED ROWS (operator ruling 2026-10-21, re-run 2 brief step 7) ─────────────────────────────────
//
// The rows a hold run_ref held (signal_hold_audit, action hold, not released) are superseded ONLY where a new cited row
// on the same seed host covers the same claim: the same page (normalizeUrlKey) or the same claim by content identity
// (normalizeForHash of claim_text). A cited row is a live (not superseded, not held) client_voice row whose raw_payload
// carries citation:true and a cited_text that is its evidence_excerpt. Each pairing sets superseded_at / superseded_by /
// superseded_reason on the held row; a held row with no pairing stays held. One transaction; a cited row is used by at
// most one held row.
//
//   deno run --allow-all scripts/supersede-held-by-cited.ts --plan  --company=<uuid> --run-ref=<hold run_ref> --seed-host=<host>
//   deno run --allow-all scripts/supersede-held-by-cited.ts --write --company=<uuid> --run-ref=<ref> --seed-host=<host> --reason=<text>
import { classifyBodyMode } from "../supabase/functions/_shared/bodyMode.ts";
import { argvBody } from "./r52/sweepCore.ts";
import { lit, PsqlSession } from "./lib/psqlBlankingStore.ts";
import { normalizeForHash } from "../supabase/functions/_shared/contentIdentity.ts";
import { normalizeUrlKey } from "../src/lib/firstRead/quoteProducer.ts";
import { isOwnDomainUrl } from "../supabase/functions/_shared/firstReadProvenance.ts";

const out = (o: unknown) => console.log(JSON.stringify(o, null, 1));
const body = argvBody(Deno.args);
const v = classifyBodyMode(body, ["plan", "write"] as const, ["plan", "write", "company", "run_ref", "seed_host", "reason"]);
if (!v.ok) { out({ ok: false, refused: true, code: "mode_unnamed", error: v.detail }); Deno.exit(3); }
const company = String(body.company ?? ""), ref = String(body.run_ref ?? ""), seed = String(body.seed_host ?? "");
if (!/^[0-9a-f-]{36}$/.test(company) || !ref || !seed) { out({ ok: false, refused: true, code: "args", error: "--company, --run-ref and --seed-host are required" }); Deno.exit(3); }
if (v.mode === "write" && !String(body.reason ?? "").trim()) { out({ ok: false, refused: true, code: "args", error: "--write needs --reason" }); Deno.exit(3); }

const s = new PsqlSession();
try {
  await s.exec(v.mode === "plan" ? "begin transaction read only;" : "begin;");
  const held = await s.query<{ id: string; source_url: string; claim_text: string }>(`select s.id, s.source_url, s.claim_text from signals s
    where s.company_id=${lit(company)}::uuid and s.held_at is not null and s.superseded_at is null
      and exists (select 1 from signal_hold_audit a where a.signal_id=s.id and a.run_ref=${lit(ref)} and a.action='hold')
      and not exists (select 1 from signal_hold_audit b where b.signal_id=s.id and b.run_ref=${lit(ref)} and b.action='release') order by s.created_at, s.id`);
  const cited = (await s.query<{ id: string; source_url: string; claim_text: string; evidence_excerpt: string; cited: string | null }>(`select id, source_url, claim_text, evidence_excerpt, raw_payload->>'cited_text' cited from signals
    where company_id=${lit(company)}::uuid and superseded_at is null and held_at is null and voice_class='client_voice' and raw_payload->>'citation'='true' order by created_at, id`))
    .filter((c) => isOwnDomainUrl(c.source_url, seed) && c.cited != null && c.cited === c.evidence_excerpt);
  const used = new Set<string>();
  const pairs: Array<{ held: string; cited: string; rule: "same_page" | "content_identity"; held_url: string; cited_url: string; held_claim: string; cited_claim: string }> = [];
  for (const h of held) {
    const hk = normalizeUrlKey(h.source_url), hc = normalizeForHash(h.claim_text);
    const m = cited.find((c) => !used.has(c.id) && normalizeForHash(c.claim_text) === hc) ?? cited.find((c) => !used.has(c.id) && normalizeUrlKey(c.source_url) === hk);
    if (!m) continue;
    used.add(m.id);
    pairs.push({ held: h.id, cited: m.id, rule: normalizeForHash(m.claim_text) === hc ? "content_identity" : "same_page", held_url: h.source_url, cited_url: m.source_url, held_claim: h.claim_text.slice(0, 120), cited_claim: m.claim_text.slice(0, 120) });
  }
  const stay = held.filter((h) => !pairs.some((p) => p.held === h.id)).map((h) => ({ id: h.id, source_url: h.source_url }));
  if (v.mode === "plan") {
    const xid = (await s.query<{ x: string | null }>(`select pg_current_xact_id_if_assigned()::text x`))[0].x;
    await s.exec("rollback;");
    out({ mode: "plan", xid_assigned: xid, held: held.length, cited_candidates: cited.length, pairs, stay_held: stay });
  } else {
    for (const p of pairs) await s.mutate(`update signals set superseded_at=now(), superseded_by=${lit(p.cited)}::uuid, superseded_reason=${lit(String(body.reason))} where id=${lit(p.held)}::uuid and superseded_at is null returning id`);
    await s.exec("commit;");
    out({ mode: "write", ok: true, superseded: pairs.length, pairs, stay_held: stay });
  }
} catch (e) {
  try { await s.exec("rollback;"); } catch { /* none */ }
  out({ ok: false, error: String((e as Error)?.message ?? e) });
  await s.close();
  Deno.exit(1);
}
await s.close();
