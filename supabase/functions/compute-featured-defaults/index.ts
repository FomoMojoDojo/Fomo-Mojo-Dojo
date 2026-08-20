// First Read ROLLUP (Gate 2.5) — compute the auto-default featured item per theme.
//
// Invoked lazily on rail open. For each theme with NO live pointer, it writes an origin-flagged
// default: themes 1 (say-vs-see) and 3 (findings) DETERMINISTICALLY (origin='auto'); theme 2
// (outside-raised) via the operator-signed JUDGE (origin='auto_judged'). It NEVER writes a theme
// that already has a live pointer (the live-unique index makes a second live insert impossible
// anyway), so it is structurally incapable of moving an operator's choice. Theme 1 is skipped
// entirely when a live curated tension exists (curated tension wins).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { contentIdentity } from "../_shared/contentIdentity.ts";
import {
  selectSayVsSeeDefault, selectFindingDefault,
  type SayVsSeeCandidate, type FindingCandidate,
} from "../_shared/featuredDefaults.ts";
import { featuredEligibleDeltas } from "../_shared/firstReadProvenance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
const isLocalOllamaUrl = (u: string) => /^https?:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)(:|\/|$)/.test(u);
const JUDGE_MODEL = Deno.env.get("FR_JUDGE_MODEL") ?? "qwen2.5:7b-instruct";

// OPERATOR-SIGNED criterion (2026-08-08). Byte-exact — the judge's only question.
const JUDGE_CRITERION =
  "Does this outside statement speak to the company's declared direction (stated problem, positioning, or declared strategy)?";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { company_id } = await req.json().catch(() => ({}));
    if (!company_id) return json({ error: "company_id is required" }, 400);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const written: Record<string, unknown> = {};

    // Which themes already have a LIVE pointer (with origin + identity, so we can replace an 'auto'
    // pointer that provenance now excludes — never an 'operator' one).
    const { data: liveRows } = await supabase
      .from("first_read_featured_items").select("theme_key, origin, item_identity").eq("company_id", company_id).is("removed_at", null);
    const live = new Map(((liveRows ?? []) as Array<{ theme_key: string; origin: string; item_identity: string }>).map((r) => [r.theme_key, r]));
    const hasLive = new Set(live.keys());

    const insertPointer = async (theme_key: string, item_identity: string, origin: string, judge_reason: string | null) => {
      const { error } = await supabase.from("first_read_featured_items")
        .insert({ company_id, theme_key, item_identity, origin, judge_reason });
      if (error) throw new Error(`insert ${theme_key} failed: ${error.message}`);
    };
    const softRemove = async (theme_key: string, reason: string) => {
      await supabase.from("first_read_featured_items")
        .update({ removed_at: new Date().toISOString(), removed_reason: reason })
        .eq("company_id", company_id).eq("theme_key", theme_key).is("removed_at", null);
    };

    // ── THEME 1 (say_vs_see) — deterministic; skipped when a live curated tension exists ────────
    // PROVENANCE: only NON-document-derived declared deltas are eligible; a live 'auto' pointer at a
    // now-excluded (uploaded-file-derived) item is REPLACED, an 'operator' one is left (it renders
    // the honest MISSING state via the rail's filter).
    {
      const { data: curated } = await supabase
        .from("curated_tensions").select("id").eq("company_id", company_id).is("removed_at", null).limit(1);
      const hasCurated = !!curated && curated.length > 0;

      const { data: dRows } = await supabase
        .from("claim_deltas").select("content_identity, delta_type, declared_claim_id")
        .eq("company_id", company_id).in("delta_type", ["echoed", "divergent", "publicly_silent"]);
      const deltas = (dRows ?? []) as Array<{ content_identity: string; delta_type: string; declared_claim_id: string | null }>;
      const declIds = [...new Set(deltas.map((d) => d.declared_claim_id).filter((x): x is string => !!x))];
      const { data: cRows } = declIds.length
        ? await supabase.from("claims").select("id, topic, confidence, raw_payload").in("id", declIds)
        : { data: [] };
      const claimRows = (cRows ?? []) as Array<{ id: string; topic: string | null; confidence: string | null; raw_payload?: unknown }>;
      const byId = new Map(claimRows.map((c) => [c.id, c]));
      // Upload-derived declared claims are ineligible (R1, 2026-08-20): backing uploaded_file
      // signal OR a birth record citing an uploaded document — no-ref claims are never assumed clean.
      let refRows: Array<{ claim_id: string; signal_id: string }> = [];
      let srcBySig = new Map<string, string | null>();
      if (declIds.length) {
        const { data: refs } = await supabase.from("claim_signal_refs").select("claim_id, signal_id").in("claim_id", declIds);
        refRows = (refs ?? []) as Array<{ claim_id: string; signal_id: string }>;
        const sigIds = [...new Set(refRows.map((r) => r.signal_id))];
        const { data: sigs } = sigIds.length ? await supabase.from("signals").select("id, source_type").in("id", sigIds) : { data: [] };
        srcBySig = new Map(((sigs ?? []) as Array<{ id: string; source_type: string | null }>).map((s) => [s.id, s.source_type]));
      }
      const candidates: SayVsSeeCandidate[] = featuredEligibleDeltas(deltas, refRows, srcBySig, claimRows)
        .map((d) => {
          const c = d.declared_claim_id ? byId.get(d.declared_claim_id) : null;
          return { contentIdentity: d.content_identity, deltaType: d.delta_type, declaredTopic: c?.topic ?? null, declaredConfidence: c?.confidence ?? null };
        });
      const eligibleIds = new Set(candidates.map((c) => c.contentIdentity));

      // Replace a live 'auto'/'auto_judged' say_vs_see pointer that provenance now excludes.
      const liveSV = live.get("say_vs_see");
      if (liveSV && liveSV.origin !== "operator" && !eligibleIds.has(liveSV.item_identity)) {
        await softRemove("say_vs_see", "provenance_excluded");
        hasLive.delete("say_vs_see");
        written.say_vs_see_replaced = liveSV.item_identity;
      }

      if (!hasLive.has("say_vs_see") && !hasCurated) {
        const pick = selectSayVsSeeDefault(candidates);
        if (pick) { await insertPointer("say_vs_see", pick, "auto", null); written.say_vs_see = pick; }
      }
    }

    // ── THEME 3 (findings) — deterministic: frontier wins, else most-recent (neutral) ───────────
    if (!hasLive.has("findings")) {
      const { data: fRows } = await supabase
        .from("findings").select("body, kind, created_at, register").eq("company_id", company_id);
      const findings = ((fRows ?? []) as Array<{ body: string; kind: string; created_at: string; register: string | null }>)
        .filter((f) => (f.body || "").trim() && (f.register ?? "").startsWith("public")); // mirror the outside-surface admit
      const cands: FindingCandidate[] = [];
      for (const f of findings) cands.push({ identity: await contentIdentity(f.body), kind: f.kind, createdAtMs: Date.parse(f.created_at) || 0 });
      const pick = selectFindingDefault(cands);
      if (pick) { await insertPointer("findings", pick.identity, "auto", pick.isFrontier ? "frontier" : "most_recent"); written.findings = pick.identity; }
    }

    // ── THEME 2 (outside_raised) — the SIGNED-CRITERION JUDGE (origin='auto_judged') ─────────────
    // No deterministic path to the declared direction exists, so a local model judges relevance.
    // Isolated: a judge failure leaves theme 2 with NO auto pointer (honest absent) — never errors
    // the whole compute.
    if (!hasLive.has("outside_raised")) {
      try {
        const OLLAMA_BASE_URL = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
        if (!isLocalOllamaUrl(OLLAMA_BASE_URL)) throw new Error("Local-only policy violation: OLLAMA_BASE_URL must be localhost/host.docker.internal.");

        const { data: dRows } = await supabase
          .from("claim_deltas").select("content_identity, public_claim_id")
          .eq("company_id", company_id).eq("delta_type", "internally_silent");
        const deltas = (dRows ?? []) as Array<{ content_identity: string; public_claim_id: string | null }>;
        const pubIds = [...new Set(deltas.map((d) => d.public_claim_id).filter((x): x is string => !!x))];
        const { data: pubRows } = pubIds.length
          ? await supabase.from("claims").select("id, statement").in("id", pubIds)
          : { data: [] };
        const stmtById = new Map(((pubRows ?? []) as Array<{ id: string; statement: string }>).map((c) => [c.id, c.statement]));
        const items = deltas
          .map((d) => ({ id: d.content_identity, statement: d.public_claim_id ? (stmtById.get(d.public_claim_id) ?? "") : "" }))
          .filter((x) => x.statement.trim());

        if (items.length > 0) {
          // Declared direction: the stated problem + the positioning/strategy declared claims.
          const { data: co } = await supabase.from("companies").select("strategic_problem_brief").eq("id", company_id).maybeSingle();
          const brief = String((co as { strategic_problem_brief?: string } | null)?.strategic_problem_brief ?? "").trim();
          const { data: declRows } = await supabase
            .from("claims").select("statement, topic").eq("company_id", company_id).eq("provenance", "internal_declared");
          const declared = ((declRows ?? []) as Array<{ statement: string; topic: string | null }>)
            .filter((c) => ["positioning", "problem", "strategy", "unique attributes", "differentiated value"].includes(c.topic ?? ""))
            .map((c) => c.statement).slice(0, 12);

          const system = `You select the single outside statement most relevant to a company's declared direction. Criterion: ${JUDGE_CRITERION} Reply ONLY with JSON {"index": <0-based number>, "reason": "<one short sentence>"}. Pick the index whose statement most speaks to the declared direction; if none clearly do, pick the closest.`;
          const user = `DECLARED DIRECTION\nStated problem: ${brief || "(none stated)"}\nDeclared claims:\n${declared.map((s, i) => `- ${s}`).join("\n") || "(none)"}\n\nOUTSIDE STATEMENTS (choose one index):\n${items.map((it, i) => `${i}: ${it.statement}`).join("\n")}`;

          const res = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: { Authorization: "Bearer ollama", "Content-Type": "application/json" },
            body: JSON.stringify({ model: JUDGE_MODEL, temperature: 0, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
          });
          if (!res.ok) throw new Error(`ollama ${JUDGE_MODEL} ${res.status}`);
          const data = await res.json();
          const content = String(data?.choices?.[0]?.message?.content ?? "");
          const m = content.match(/\{[\s\S]*\}/);
          if (!m) throw new Error("judge returned no JSON");
          const parsed = JSON.parse(m[0]) as { index?: number; reason?: string };
          const idx = Number(parsed.index);
          if (Number.isInteger(idx) && idx >= 0 && idx < items.length) {
            await insertPointer("outside_raised", items[idx].id, "auto_judged", String(parsed.reason ?? "").slice(0, 300) || null);
            written.outside_raised = items[idx].id;
          }
        }
      } catch (e) {
        written.outside_raised_error = String((e as Error)?.message ?? e); // honest: no pointer, reported
      }
    }

    return json({ ok: true, written });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
