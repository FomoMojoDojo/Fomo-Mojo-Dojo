// GATE R3b — SEMANTIC + PAGE-GONE SUPERSEDE of the old client_voice (with audit; never deletes).
//
// The redesign refresh's retirement step. An OLD active client_voice signal is superseded-with-audit
// only when the NEW site no longer supports it:
//   · PAGE-GONE — its source page has no current (2026-08-26) snapshot (order-cafebarra.square.site,
//     /curiosity-labs, /merchandise): superseded_reason='source_gone'. Deterministic, no judge.
//   · SEMANTIC — its page survived the redesign but NO admitted new-site client_voice asserts the
//     equivalent substance: superseded_reason='own_site_redesign_2026_08'. Judged by gpt-4.1-mini
//     (own-site = public corpus → external, per router law); the judge's per-row reason is recorded.
// A signal whose substance IS re-asserted by the new voice is KEPT (untouched). Nothing is deleted;
// superseded_at/reason are set, the per-row judge reason stored in raw_payload.supersede_detail
// (reversible). Frozen company → 403.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "POST,OPTIONS" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

const MODEL = Deno.env.get("CLIENT_VOICE_MODEL") ?? "gpt-4.1-mini";
const JUDGE_SYSTEM =
  `The company redesigned its website. You are given its CURRENT self-descriptive voice (NEW statements) and a list ` +
  `of OLD statements. For each OLD statement decide whether the CURRENT site still asserts its SUBSTANCE. ` +
  `"keep" = the new voice still says this (or clearly equivalent). "supersede" = the redesign dropped it (the new ` +
  `voice does not assert it). Judge substance, not wording. Respond with ONLY JSON: ` +
  `{"verdicts":[{"i":0,"decision":"keep|supersede","reason":"..."}]}. No other text.`;

async function judge(newStatements: string[], oldBatch: Array<{ i: number; text: string }>): Promise<Map<number, { decision: string; reason: string }>> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const user = `CURRENT SITE VOICE (new statements):\n${newStatements.map((s) => `- ${s}`).join("\n")}\n\nOLD STATEMENTS:\n${oldBatch.map((o) => `${o.i}: ${o.text}`).join("\n")}`;
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, temperature: 0, response_format: { type: "json_object" }, messages: [{ role: "system", content: JUDGE_SYSTEM }, { role: "user", content: user }] }),
  });
  if (!resp.ok) throw new Error(`judge ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  const m = String(data?.choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
  const out = new Map<number, { decision: string; reason: string }>();
  if (m) for (const v of (JSON.parse(m[0]).verdicts ?? []) as Array<{ i: number; decision: string; reason: string }>) {
    out.set(Number(v.i), { decision: v.decision === "keep" ? "keep" : "supersede", reason: String(v.reason ?? "") });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const company_id = String(body.company_id ?? "");
    const newRunId = String(body.new_run_id ?? "");
    const write = body.write === true;
    if (!company_id || !newRunId) return json({ error: "company_id and new_run_id required" }, 400);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: co } = await supabase.from("companies").select("frozen").eq("id", company_id).maybeSingle();
    if ((co as { frozen?: boolean } | null)?.frozen) return json({ error: "supersede refused: company is frozen" }, 403);

    // NEW voice = the just-regenerated client_voice (the run).
    const { data: newRows } = await supabase.from("signals").select("evidence_excerpt")
      .eq("company_id", company_id).eq("voice_class", "client_voice").eq("raw_payload->>run_id", newRunId);
    const newStatements = [...new Set(((newRows ?? []) as Array<{ evidence_excerpt: string | null }>).map((r) => (r.evidence_excerpt ?? "").trim()).filter(Boolean))];

    // OLD active client_voice = everything NOT from this run.
    const { data: oldRows } = await supabase.from("signals").select("id, source_url, evidence_excerpt, raw_payload")
      .eq("company_id", company_id).eq("voice_class", "client_voice").is("held_at", null).is("superseded_at", null);
    const old = ((oldRows ?? []) as Array<{ id: string; source_url: string | null; evidence_excerpt: string | null; raw_payload: Record<string, unknown> }>)
      .filter((o) => (o.raw_payload?.run_id as string | undefined) !== newRunId);

    // PAGE-GONE = source page has no 2026-08-26 snapshot.
    const { data: freshSnaps } = await supabase.from("own_words_page_snapshots").select("source_url").eq("company_id", company_id).gte("fetched_at", "2026-08-26T00:00:00Z");
    const currentPages = new Set(((freshSnaps ?? []) as Array<{ source_url: string }>).map((s) => s.source_url));

    const pageGone: typeof old = [];
    const onChangedPage: typeof old = [];
    for (const o of old) (o.source_url && currentPages.has(o.source_url) ? onChangedPage : pageGone).push(o);

    // SEMANTIC judge over the changed-page olds (batched).
    const decisions = new Map<string, { reason: string; source: "page_gone" | "semantic" | "kept" }>();
    for (const o of pageGone) decisions.set(o.id, { reason: "page removed in redesign (no 2026-08-26 snapshot)", source: "page_gone" });
    const BATCH = 30;
    for (let b = 0; b < onChangedPage.length; b += BATCH) {
      const batch = onChangedPage.slice(b, b + BATCH).map((o, k) => ({ i: b + k, text: (o.evidence_excerpt ?? "").slice(0, 240) }));
      const verd = await judge(newStatements, batch);
      for (const item of batch) {
        const v = verd.get(item.i);
        const o = onChangedPage[item.i];
        if (v && v.decision === "supersede") decisions.set(o.id, { reason: v.reason || "new voice does not assert this", source: "semantic" });
        else decisions.set(o.id, { reason: v?.reason ?? "kept", source: "kept" });
      }
    }

    const toSupersede = old.filter((o) => decisions.get(o.id)?.source === "page_gone" || decisions.get(o.id)?.source === "semantic");
    const kept = old.filter((o) => decisions.get(o.id)?.source === "kept");
    const nowIso = new Date().toISOString();
    let written = 0;
    if (write) {
      for (const o of toSupersede) {
        const d = decisions.get(o.id)!;
        const reason = d.source === "page_gone" ? "source_gone" : "own_site_redesign_2026_08";
        const { error } = await supabase.from("signals").update({
          superseded_at: nowIso, superseded_reason: reason, updated_at: nowIso,
          raw_payload: { ...(o.raw_payload ?? {}), supersede_detail: d.reason, superseded_by_run: newRunId },
        }).eq("id", o.id);
        if (error) throw new Error(`supersede update failed for ${o.id}: ${error.message}`);
        written++;
      }
      await supabase.from("integrity_runs").insert({
        company_id, component: "r3b_client_voice_supersede", status: "completed",
        examined: old.length, admitted: written,
        excluded_by_rule: { page_gone: pageGone.length, semantic: toSupersede.length - pageGone.length, kept: kept.length, new_run_id: newRunId },
        run_ref: `r3b_supersede_${newRunId}`,
      });
    }
    return json({
      ok: true, company_id, write, new_statements: newStatements.length, old_active: old.length,
      page_gone: pageGone.length, semantic_supersede: toSupersede.length - pageGone.length, kept: kept.length, written,
      supersede_list: toSupersede.map((o) => ({ id: o.id, host: (o.source_url ?? "").replace(/^https?:\/\//, "").split("/").slice(0, 2).join("/"), reason_class: decisions.get(o.id)!.source, reason: decisions.get(o.id)!.reason, stmt: (o.evidence_excerpt ?? "").slice(0, 80) })),
      kept_list: kept.map((o) => ({ id: o.id, stmt: (o.evidence_excerpt ?? "").slice(0, 80) })),
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
