// V2-4 — generate-open-questions. The post-findings open-question generator (Shape A,
// FR_V2_decomposition §2): ZERO blast radius on the fragile public-baseline generator —
// it reads ALREADY-PERSISTED findings + publicly_silent claim-deltas and emits open
// questions, each grounded in the exact anchor it was handed, so the question→anchor link
// resolves by content identity BY CONSTRUCTION (deriveAnchoredRows owns the law).
//
// UNIFICATION: findings AND publicly_silent deltas are ONE candidate stream ("a declared
// thing the public doesn't echo" is an open question too) → ONE list in
// first_read_open_questions, stamped source_kind. No parallel lists.
//
// Chunked per the wall-clock law (client packs cap-3 anchors/chunk; ~1 gen + 1 judge per
// anchor ≈ 30s → 3 ≈ 90s under the ~150s gateway wall). START-of-run ledger in
// long_runner_runs (run_kind='open_questions'). Reconcile keep/add/supersede by content
// identity — never delete+insert. Discipline: gen qwen2.5:14b-instruct, judge llama3:70b,
// hard-pinned, local-only, require_model (loud fail, judge-reject persists nothing).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { contentIdentity } from "../_shared/contentIdentity.ts";
import { documentDerivedClaimIds } from "../_shared/firstReadProvenance.ts";
import { deriveAnchoredRows, type QuestionAnchor } from "../../../src/lib/firstRead/openQuestionLinks.ts";
import { US_ENGLISH_RULE } from "../_shared/languageRule.ts";
import { resolveModel, callOpenAIJson, withRetry429, usdCost, type OpenAIUsage } from "../_shared/modelRouter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
const GEN_MODEL = "qwen2.5:14b-instruct";
const JUDGE_MODEL = "llama3:70b";
const RUN_KIND = "open_questions";

function isLocalOllamaUrl(rawUrl: string) {
  try { return LOCAL_HOST_ALLOWLIST.has(String(new URL(rawUrl).hostname || "").trim().toLowerCase()); }
  catch { return false; }
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ── load the run's anchors: persisted findings + publicly_silent claim-deltas ────────
async function loadAnchors(supabase: SupabaseClient, companyId: string, runId: string): Promise<QuestionAnchor[]> {
  const anchors: QuestionAnchor[] = [];

  const { data: findingRows } = await supabase
    .from("findings").select("body").eq("company_id", companyId).eq("origin_run_id", Number(runId));
  for (const f of (findingRows ?? []) as Array<{ body?: string | null }>) {
    const text = (f.body ?? "").trim();
    if (text) anchors.push({ kind: "finding", text, identity: await contentIdentity(text) });
  }

  const { data: deltaRows } = await supabase
    .from("claim_deltas").select("content_identity, declared_claim_id")
    .eq("company_id", companyId).eq("pairing_kind", "public_vs_public") // GATE B-1: First Read questions anchor the public pairing
    .eq("delta_type", "publicly_silent");
  const deltas = (deltaRows ?? []) as Array<{ content_identity: string; declared_claim_id: string | null }>;
  const claimIds = deltas.map((d) => d.declared_claim_id).filter((x): x is string => !!x);
  const claimById = new Map<string, string>();
  if (claimIds.length) {
    const { data: claimRows } = await supabase.from("claims").select("id, statement").in("id", claimIds);
    for (const c of (claimRows ?? []) as Array<{ id: string; statement: string | null }>) {
      if (c.statement) claimById.set(c.id, c.statement.trim());
    }
  }
  // PROVENANCE GATE — First Read is OUTSIDE-ONLY. Skip any publicly_silent anchor whose declared
  // claim is uploaded-document-derived (a backing signal with source_type='uploaded_file'). Uploaded
  // docs power the deeper engagement only; a doc-derived open question must never be BORN. Same
  // shared predicate the rail read and the auto-selectors use — one authority, no second impl.
  let excludedDecl = new Set<string>();
  if (claimIds.length) {
    const { data: refs } = await supabase.from("claim_signal_refs").select("claim_id, signal_id").in("claim_id", claimIds);
    const refRows = (refs ?? []) as Array<{ claim_id: string; signal_id: string }>;
    const sigIds = [...new Set(refRows.map((r) => r.signal_id))];
    const { data: sigs } = sigIds.length ? await supabase.from("signals").select("id, source_type").in("id", sigIds) : { data: [] };
    const srcBySig = new Map(((sigs ?? []) as Array<{ id: string; source_type: string | null }>).map((s) => [s.id, s.source_type]));
    excludedDecl = documentDerivedClaimIds(refRows, srcBySig);
  }
  for (const d of deltas) {
    if (d.declared_claim_id && excludedDecl.has(d.declared_claim_id)) continue; // outside-only: doc-derived never born
    const text = (d.declared_claim_id && claimById.get(d.declared_claim_id)) || "";
    // anchor identity = the delta's own content identity (stable provenance link)
    if (text.trim() && d.content_identity) anchors.push({ kind: "silent_delta", text: text.trim(), identity: d.content_identity });
  }
  return anchors;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const OLLAMA_BASE_URL = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(OLLAMA_BASE_URL)) {
      return json({ error: "Local-only policy violation: OLLAMA_BASE_URL must be localhost/host.docker.internal." }, 412);
    }
    const trace = { provider: "local_ollama", gen_model: GEN_MODEL, judge_model: JUDGE_MODEL, endpoint: OLLAMA_BASE_URL };

    const body = await req.json().catch(() => ({}));
    const company_id = String(body.company_id ?? "");
    if (!company_id) return json({ error: "company_id is required" }, 400);
    const doPlan = body.plan === true;
    const doWrite = body.write !== false && !doPlan;
    const scopeIds: string[] | undefined = Array.isArray(body.anchor_identities)
      ? body.anchor_identities.filter((x: unknown): x is string => typeof x === "string")
      : undefined;
    if (Array.isArray(body.anchor_identities) && scopeIds!.length === 0) {
      return json({ error: "anchor_identities present but empty" }, 422);
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Resolve run: the public-baseline run that owns the company's newest findings.
    let runId = body.run_id != null ? String(body.run_id) : "";
    if (!runId) {
      const { data: latest } = await supabase
        .from("findings").select("origin_run_id").eq("company_id", company_id)
        .not("origin_run_id", "is", null).order("origin_run_id", { ascending: false }).limit(1).maybeSingle();
      runId = String((latest as { origin_run_id?: number } | null)?.origin_run_id ?? "");
    }
    if (!runId) return json({ status: "empty", empty_reason: "No findings run for this company.", trace });

    const anchors = await loadAnchors(supabase, company_id, runId);
    const findingIdentities = new Set(anchors.filter((a) => a.kind === "finding").map((a) => a.identity));

    // ── PLAN: manifest only (zero model, zero writes, NO ledger row). ─────────────────
    if (doPlan) {
      return json({
        ok: true, plan: true, run_id: runId,
        counts: { findings: findingIdentities.size, silent_deltas: anchors.length - findingIdentities.size },
        anchors: anchors.map((a) => ({ identity: a.identity, kind: a.kind, preview: a.text.slice(0, 90) })),
        trace,
      });
    }

    // ── START-of-run ledger (first writing chunk opens it; reuse a running row). ──────
    let ledgerRowId: string | null = null;
    if (doWrite) {
      const { data: running } = await supabase.from("long_runner_runs")
        .select("id").eq("run_kind", RUN_KIND).eq("company_id", company_id).eq("status", "running").limit(1);
      ledgerRowId = (running as Array<{ id: string }> | null)?.[0]?.id ?? null;
      if (!ledgerRowId) {
        const { data: led } = await supabase.from("long_runner_runs")
          .insert({ run_kind: RUN_KIND, company_id, status: "running", target_count: anchors.length })
          .select("id").single();
        ledgerRowId = (led as { id: string } | null)?.id ?? null;
      }
    }

    // ── FINALIZE (unscoped write): mark ledger complete + supersede orphaned anchors. ─
    if (doWrite && !scopeIds) {
      const identSet = new Set(anchors.map((a) => a.identity));
      const { data: liveRows } = await supabase.from("first_read_open_questions")
        .select("id, anchor_identity").eq("company_id", company_id).eq("run_id", runId).eq("status", "live");
      const orphanIds = (liveRows ?? [])
        .filter((r) => !r.anchor_identity || !identSet.has(r.anchor_identity)).map((r) => r.id as string);
      if (orphanIds.length) {
        await supabase.from("first_read_open_questions").update({ status: "superseded" }).in("id", orphanIds);
      }
      if (ledgerRowId) {
        await supabase.from("long_runner_runs").update({ status: "completed", finished_at: new Date().toISOString() }).eq("id", ledgerRowId);
      }
      return json({ ok: true, finalize: true, run_id: runId, superseded_orphans: orphanIds.length, trace });
    }

    // ── SCOPED CHUNK: generate + judge + persist for the given anchors. ───────────────
    const callModel = async (model: string, system: string, user: string, temperature: number) => {
      const res = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { Authorization: "Bearer ollama", "Content-Type": "application/json" },
        body: JSON.stringify({ model, temperature, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      });
      if (!res.ok) throw new Error(`ollama ${model} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      const content = String(data?.choices?.[0]?.message?.content ?? "");
      const m = content.match(/\{[\s\S]*\}/);
      if (!m) throw new Error(`${model} returned no JSON: ${content.slice(0, 200)}`);
      return JSON.parse(m[0]) as Record<string, unknown>;
    };

    // ── ROUTER: pick the model by the provenance of the anchor(s). All-public → external OpenAI;
    //    anything non-public/unknown → the local model above (byte-identical local path). Every
    //    anchor here is public (findings=public_inferred, silent_deltas=public_vs_public), so this
    //    normally routes external; the guard still checks each anchor's provenance. ────────────────
    const usage: OpenAIUsage = { prompt_tokens: 0, completion_tokens: 0 };
    const routed = async (
      role: "generator" | "judge",
      provenances: Array<string | null>,
      system: string, user: string, temperature: number,
    ): Promise<{ json: Record<string, unknown>; provider: string; model: string }> => {
      const choice = resolveModel({ role, inputs: provenances.map((p) => ({ provenance: p })) });
      if (choice.provider === "external_openai") {
        const r = await withRetry429(() => callOpenAIJson({ model: choice.model, system, user, temperature }));
        usage.prompt_tokens += r.usage.prompt_tokens; usage.completion_tokens += r.usage.completion_tokens;
        const mm = r.content.match(/\{[\s\S]*\}/);
        if (!mm) throw new Error(`openai ${choice.model} returned no JSON: ${r.content.slice(0, 200)}`);
        return { json: JSON.parse(mm[0]) as Record<string, unknown>, provider: choice.provider, model: choice.model };
      }
      return { json: await callModel(choice.model, system, user, temperature), provider: choice.provider, model: choice.model };
    };
    // Anchor provenance: findings ride the public_inferred register; publicly-silent deltas are the
    // public_vs_public pairing → the declared side is public (own-words / public claims).
    const anchorProvenance = (a: QuestionAnchor): string => (a.kind === "finding" ? "public_inferred" : "public_observed");

    const GEN_FINDING = `You read ONE finding from a company's outside read and produce the open question(s) it raises — the strategic unknown a decision-maker must resolve. Ground every question STRICTLY in THIS finding; invent nothing beyond it. Emit 1 question, or 2 only if the finding genuinely raises two distinct unknowns. Each question must be genuinely OPEN — not already answered by the finding itself. Plain English, no jargon, end with "?". Respond with ONLY JSON: {"questions":["..."]}. No other text.

${US_ENGLISH_RULE}`;
    const GEN_SILENT = `A company DECLARED the statement below, but the public record does NOT echo it. Produce the ONE open question this raises — whether the declared thing actually holds true / is recognized OUTSIDE the company's own telling. Ground it STRICTLY in the declared statement; invent nothing. Plain English, no jargon, end with "?". Respond with ONLY JSON: {"questions":["..."]}. No other text.

${US_ENGLISH_RULE}`;
    const JUDGE_SYS = `You judge candidate open questions against the ANCHOR they were generated from. Keep a question ONLY if ALL hold: (a) it is grounded in the anchor — invents nothing beyond it; (b) it is genuinely OPEN — not already answered by the anchor or by obvious common knowledge; (c) plain English, no framework jargon. Respond with ONLY JSON: {"verdicts":[{"question":"...","keep":true|false,"reason":"..."}]}. No other text.`;

    const scoped = anchors.filter((a) => scopeIds!.includes(a.identity));
    const totals = { anchors_processed: 0, born: 0, linked: 0, linkless: 0, silent_derived: 0, rejected: 0 };
    const perAnchor: Array<{ identity: string; kind: string; born: number; rejected: number; error?: string }> = [];

    for (const anchor of scoped) {
      try {
        // temp 0 → deterministic wording, so a re-click reconciles to the SAME identities
        // (keep, not churn): idempotent by construction. The judge also runs at 0.
        const prov = [anchorProvenance(anchor)];
        const genRes = await routed("generator", prov, anchor.kind === "finding" ? GEN_FINDING : GEN_SILENT, anchor.kind === "finding" ? `Finding:\n${anchor.text}` : `Declared (publicly silent):\n"${anchor.text}"`, 0);
        const gen = genRes.json;
        const candidates = (Array.isArray(gen.questions) ? gen.questions : [])
          .map((q) => String(q ?? "").trim()).filter((q) => q.endsWith("?")).slice(0, anchor.kind === "finding" ? 2 : 1);
        if (candidates.length === 0) { perAnchor.push({ identity: anchor.identity, kind: anchor.kind, born: 0, rejected: 0 }); totals.anchors_processed++; continue; }

        const judgeRes = await routed("judge", prov, JUDGE_SYS, `Anchor:\n${anchor.text}\n\nCandidate questions:\n${candidates.map((q) => `- ${q}`).join("\n")}\n\nJudge each.`, 0);
        const verdict = judgeRes.json;
        const verdicts = (Array.isArray(verdict.verdicts) ? verdict.verdicts : []) as Array<{ question?: string; keep?: boolean }>;
        const keptFor = (q: string) => {
          const v = verdicts.find((x) => String(x.question ?? "").trim() === q);
          return v ? v.keep === true : false; // no verdict for a candidate → reject (require_model)
        };
        const accepted = candidates.filter(keptFor);
        const rejected = candidates.length - accepted.length;
        totals.rejected += rejected;

        const baseRows = await deriveAnchoredRows({ companyId: company_id, runId, anchor, questions: accepted, findingIdentities });
        // Stamp each question with the JUDGE model that decided it (verdict provenance).
        const rows = baseRows.map((r) => ({ ...r, model_provider: judgeRes.provider, model_name: judgeRes.model }));
        if (rows.length) {
          const { error: upErr } = await supabase.from("first_read_open_questions")
            .upsert(rows, { onConflict: "company_id,run_id,question_identity" });
          if (upErr) throw new Error(`upsert failed: ${upErr.message}`);
        }
        // SUPERSEDE prior live questions for this anchor that were NOT regenerated (reconcile).
        const freshSet = new Set(rows.map((r) => r.question_identity));
        const { data: priorLive } = await supabase.from("first_read_open_questions")
          .select("id, question_identity").eq("company_id", company_id).eq("run_id", runId)
          .eq("anchor_identity", anchor.identity).eq("status", "live");
        const stale = (priorLive ?? []).filter((r) => !freshSet.has(r.question_identity as string)).map((r) => r.id as string);
        if (stale.length) await supabase.from("first_read_open_questions").update({ status: "superseded" }).in("id", stale);

        totals.born += rows.length;
        totals.linked += rows.filter((r) => r.finding_identity).length;
        totals.linkless += rows.filter((r) => !r.finding_identity).length;
        totals.silent_derived += rows.filter((r) => r.source_kind === "silent_delta").length;
        totals.anchors_processed++;
        perAnchor.push({ identity: anchor.identity, kind: anchor.kind, born: rows.length, rejected });
      } catch (e) {
        // honest per-anchor isolation — one flaky anchor doesn't nuke the chunk's good work
        perAnchor.push({ identity: anchor.identity, kind: anchor.kind, born: 0, rejected: 0, error: (e as Error).message });
      }
    }

    if (ledgerRowId) {
      // accumulate across chunks (client runs them sequentially) — done_count is the
      // anchors processed so far in this run, not just this chunk.
      const { data: cur } = await supabase.from("long_runner_runs").select("done_count").eq("id", ledgerRowId).maybeSingle();
      const base = (cur as { done_count?: number } | null)?.done_count ?? 0;
      await supabase.from("long_runner_runs")
        .update({ done_count: base + totals.anchors_processed, updated_at: new Date().toISOString() }).eq("id", ledgerRowId);
    }
    // Router usage/cost for this chunk (external tokens; local calls cost 0) — the fill ledger logs it.
    const cost = { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, usd: usdCost(usage) };
    return json({ ok: true, scoped: true, run_id: runId, totals, perAnchor, trace: { ...trace, router: "by_provenance" }, cost });
  } catch (e) {
    return json({ error: `unexpected: ${(e as Error).message}` }, 500);
  }
});
