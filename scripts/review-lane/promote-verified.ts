#!/usr/bin/env -S deno run --allow-all
// ── PROMOTE VERIFIED LEADS (brief "verify search-cited quotes", slice 4, 2026-11-18; ruling R1) ─────────────────────────
// A lead row — a review-lane row held "search summary, not checked against the page" because it rests on the search
// tool's cited_text — is promoted only when the page the lane fetched for it (a stored verify call, public-baseline
// review_lane { verify: { url } }) gives it a quote under the existing rules (verifyLead → buildReviewLaneRows). A
// promoted row gets its quote and quote_source_text from that page, raw_payload.verified_by_call_id names the call, and
// its hold is released through scripts/signal-holds.ts (audited). A row that fails stays a lead; the reason is recorded
// on it (raw_payload.lead_verify). Nothing is deleted; the excerpt (the search's cited_text) is unchanged.
//
//   deno run --allow-all scripts/review-lane/promote-verified.ts --plan  --company=<uuid> --verify-call=<uuid>
//   deno run --allow-all scripts/review-lane/promote-verified.ts --write --company=<uuid> --verify-call=<uuid> --actor=<name>
// --plan is one read-only transaction. The voice decision is the one stored at mint (the url is unchanged).
import { classifyBodyMode } from "../../supabase/functions/_shared/bodyMode.ts";
import { argvBody } from "../r52/sweepCore.ts";
import { lit, PsqlSession } from "../lib/psqlBlankingStore.ts";
import { REVIEW_LISTS } from "../../supabase/functions/_shared/reviewPages.ts";
import { LEAD_BASIS_LABEL } from "../../supabase/functions/_shared/searchLeads.ts";
import { REVIEW_LANE_VERIFY_TARGET_PREFIX, verifyLead } from "../../supabase/functions/_shared/reviewHostLane.ts";

const out = (o: unknown) => console.log(JSON.stringify(o, null, 1));
const body = argvBody(Deno.args);
const v = classifyBodyMode(body, ["plan", "write"] as const, ["plan", "write", "company", "verify_call", "actor"]);
if (!v.ok) { out({ ok: false, refused: true, code: "mode_unnamed", error: v.detail }); Deno.exit(3); }
const str = (k: string) => (typeof body[k] === "string" ? String(body[k]).trim() : "");
const company = str("company"), callId = str("verify_call");
if (!/^[0-9a-f-]{36}$/.test(company) || !/^[0-9a-f-]{36}$/.test(callId)) { out({ ok: false, refused: true, code: "args", error: "--company and --verify-call are required uuids" }); Deno.exit(3); }
if (v.mode === "write" && !str("actor")) { out({ ok: false, refused: true, code: "args", error: "--write needs --actor" }); Deno.exit(3); }
const list = REVIEW_LISTS[company];
if (!list) { out({ ok: false, refused: true, code: "no_list", error: "this company has no reviewed page list" }); Deno.exit(3); }

type Call = { id: string; company_id: string; target_key: string; response: unknown; outcome: { verify_url?: string } | null };
type Lead = { id: string; source_url: string; raw_payload: Record<string, any>; call_target: string };
const s = new PsqlSession();
try {
  await s.exec(v.mode === "plan" ? "begin transaction read only;" : "begin;");
  const [call] = await s.query<Call>(`select id, company_id, target_key, response, outcome from review_lane_calls where id=${lit(callId)}::uuid`);
  if (!call || call.company_id !== company || !call.target_key.startsWith(REVIEW_LANE_VERIFY_TARGET_PREFIX) || !call.outcome?.verify_url) {
    await s.exec("rollback;"); out({ ok: false, refused: true, code: "not_a_verify_call", error: "the call is not a stored verify call of this company" }); Deno.exit(3);
  }
  const url = call.outcome.verify_url;
  const leads = await s.query<Lead>(`select s.id, s.source_url, s.raw_payload, c.target_key call_target from signals s join review_lane_calls c on c.id=s.review_lane_call_id
    where s.company_id=${lit(company)}::uuid and s.source_url=${lit(url)} and s.held_reason=${lit(LEAD_BASIS_LABEL)} and s.superseded_at is null and s.quote is null order by s.id`);
  const verdicts = leads.map((l) => {
    const target = list.targets.find((t) => t.key === l.call_target);
    if (!target) return { id: l.id, verdict: { promoted: false as const, reason: "no_target" } };
    const p = l.raw_payload ?? {};
    const authority = String(p.voice_authority?.authority ?? "third_party_host");
    return { id: l.id, verdict: verifyLead({ list, target, lead: { url: l.source_url, title: String(p.title ?? ""), sentence: String(p.sentence ?? ""), cited_text: String(p.cited_text ?? "") },
      verifyResponse: call.response, decide: () => ({ ok: true, voice_class: "outside_voice_about_client", authority }) }) };
  });
  const at = new Date().toISOString();
  if (v.mode === "write") {
    for (const { id, verdict } of verdicts) {
      if (verdict.promoted) {
        const patch = { quote_basis: "web_fetch_page_text", date_basis: verdict.date_basis, review_body: verdict.review_body, verified_by_call_id: callId,
          lead_verify: { call: callId, result: "promoted", page_url: verdict.page_url, at } };
        await s.mutate(`update signals set quote=${lit(verdict.quote)}, quote_source_text=${lit(verdict.quote_source_text)},
            event_date=${verdict.event_date ? `${lit(verdict.event_date)}::date` : "event_date"}, event_date_precision=${lit(verdict.event_date_precision)},
            raw_payload = raw_payload || ${lit(JSON.stringify(patch))}::jsonb
          where id=${lit(id)}::uuid and held_reason=${lit(LEAD_BASIS_LABEL)} and quote is null returning id`);
      } else {
        await s.mutate(`update signals set raw_payload = raw_payload || ${lit(JSON.stringify({ lead_verify: { call: callId, result: "lead", reason: verdict.reason, at } }))}::jsonb
          where id=${lit(id)}::uuid returning id`);
      }
    }
    await s.exec("commit;");
    // release each promoted row's own hold through the one audited writer
    for (const { id, verdict } of verdicts.filter((x) => x.verdict.promoted)) {
      const p = new Deno.Command("deno", { args: ["run", "--allow-all", "scripts/signal-holds.ts", "--revert", `--company=${company}`, `--run-ref=hold_search_cited_R1_20261118_${id}`, `--actor=${str("actor")}`], stdout: "piped", stderr: "piped" });
      const r = await p.output();
      const j = JSON.parse(new TextDecoder().decode(r.stdout) || "{}");
      if (!(j.ok && j.released === 1 && j.still_held === 0)) throw new Error(`release of ${id} failed: ${new TextDecoder().decode(r.stdout)}`);
    }
  } else {
    await s.exec("rollback;");
  }
  out({ mode: v.mode, ok: true, verify_call: callId, url, leads: leads.length, promoted: verdicts.filter((x) => x.verdict.promoted).length,
    verdicts: verdicts.map((x) => ({ id: x.id, ...(x.verdict.promoted ? { promoted: true, quote_chars: x.verdict.quote.length, dated: !!x.verdict.event_date } : x.verdict) })) });
} catch (e) {
  try { await s.exec("rollback;"); } catch { /* none open */ }
  out({ ok: false, error: String((e as Error)?.message ?? e) });
  await s.close();
  Deno.exit(1);
}
await s.close();
