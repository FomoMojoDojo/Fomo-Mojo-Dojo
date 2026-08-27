// GATE S3 (2026-08-20) — deterministic status-conflict detector. For each tracked location entity,
// if an AUTHORITATIVE source (Google/Yelp/Apple/Corner/TripAdvisor) reports it closed AND another
// source frames it as operating at/after the closure date, upsert a 'status_conflict' open question
// carrying both source sets. Content-identity keyed; preserve-on-upsert. NEVER a verdict. No model.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { contentIdentity } from "../_shared/contentIdentity.ts";
import { detectConflict, type StatusSignal } from "../_shared/statusConflict.ts";
import { isTerminalSupersession } from "../../../src/lib/claimState/prunePolicy.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const hostOf = (u: string | null) => (u ?? "").replace(/^https?:\/\/(www\.)?/i, "").split("/")[0] || "-";

// Present-tense operating language (paired with a NOT-closed status → the location is being treated
// as open). Deterministic — no model.
const OPERATING_RE = /teaming up|is available|delivery (is )?available|listed (on|for)|partnership|rated \d|now serving|order online|pick[- ]?up|open (daily|for|now)|located (at|in)|offers|serving/i;

// DRAFT copy (S4) — operator signs.
const CONFLICT_QUESTION = (loc: string) =>
  `Some sources say ${loc} is closed; others still list it as open. Which is true today?`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const company_id = String(body.company_id ?? "");
    if (!company_id) return json({ error: "company_id required" }, 400);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: co } = await supabase.from("companies").select("id, frozen").eq("id", company_id).maybeSingle();
    if (!co) return json({ error: "company not found" }, 404);
    if ((co as { frozen?: boolean }).frozen) return json({ error: "refused: company is frozen" }, 403);

    // Tracked entities: the primary partner location + any location named in market definitions.
    // (Kept to the named entity this gate; the keyword set is the entity match.)
    const entities: Array<{ label: string; keywords: RegExp }> = [
      { label: "Le French Rooster & Cafe Barra (2221 W Olive Ave, Burbank)", keywords: /le french rooster|2221 w\.? olive/i },
    ];

    const { data: sigRows } = await supabase
      .from("signals")
      .select("id, claim_text, evidence_excerpt, source_title, source_url, operating_status, operating_status_as_of, event_date, created_at, held_at, superseded_at, superseded_reason")
      .eq("company_id", company_id).limit(2000);
    // Dispute-refresh (2026-08-26): TERMINALLY-superseded signals (fabricated / redesigned-away / gone)
    // must never seed a status conflict — they are not evidence of anything. Held / recrawl-pending
    // signals ARE kept (provisional; the render marks them). Mirrors the render-side liveness gate.
    const sigs = ((sigRows ?? []) as Array<Record<string, string | null>>)
      .filter((s) => !isTerminalSupersession({ held_at: s.held_at, superseded_at: s.superseded_at, superseded_reason: s.superseded_reason }));

    const results: Array<Record<string, unknown>> = [];
    for (const ent of entities) {
      const mapped: StatusSignal[] = sigs.map((s) => {
        const text = `${s.source_title ?? ""} ${s.claim_text ?? ""} ${s.evidence_excerpt ?? ""}`;
        const referencesEntity = ent.keywords.test(text);
        const status = s.operating_status ?? "unknown";
        const notClosed = status !== "temporarily_closed" && status !== "permanently_closed";
        const date = s.event_date ?? (s.created_at ? String(s.created_at).slice(0, 10) : null);
        return {
          id: String(s.id), host: hostOf(s.source_url), operatingStatus: status,
          asOf: s.operating_status_as_of ?? null, date,
          quote: (s.evidence_excerpt ?? s.claim_text ?? "").slice(0, 160),
          referencesEntity, operatingFramed: referencesEntity && notClosed && OPERATING_RE.test(text),
        };
      });
      const r = detectConflict(mapped);
      if (!r.fires) {
        // RETIRE path (dispute-refresh, 2026-08-26): the conflict no longer holds over the current
        // (non-terminal) signal set — resolve any lingering live row so a healed dispute leaves the
        // surface. Preserve-on-upsert never retired; this is its missing complement.
        const identity = await contentIdentity(`status_conflict|${ent.label}`);
        const { data: stale } = await supabase.from("first_read_open_questions")
          .select("id").eq("company_id", company_id).eq("question_identity", identity).eq("status", "live").maybeSingle();
        if (stale) {
          const { error } = await supabase.from("first_read_open_questions")
            .update({ status: "resolved" }).eq("id", (stale as { id: string }).id);
          if (error) throw new Error(`retire failed: ${error.message}`);
          results.push({ entity: ent.label, fires: false, action: "retired", question_id: (stale as { id: string }).id });
        } else {
          results.push({ entity: ent.label, fires: false });
        }
        continue;
      }

      const srcSet = (arr: StatusSignal[]) => arr.map((x) => ({ host: x.host, date: x.asOf ?? x.date, quote: x.quote, signal_id: x.id }));
      const conflict_sources = { location: ent.label, closed: srcSet(r.closed), open: srcSet(r.open), closure_date: r.closureDate };
      const identity = await contentIdentity(`status_conflict|${ent.label}`);

      // Preserve-on-upsert: keep an existing live row (refresh its sources), else insert.
      const { data: existing } = await supabase.from("first_read_open_questions")
        .select("id").eq("company_id", company_id).eq("question_identity", identity).eq("status", "live").maybeSingle();
      const row = {
        company_id, run_id: "status_conflict", question_text: CONFLICT_QUESTION(ent.label),
        question_identity: identity, source_kind: "status_conflict", anchor_identity: identity,
        status: "live", conflict_sources, conflict_location: ent.label,
      };
      if (existing) {
        const { error } = await supabase.from("first_read_open_questions")
          .update({ conflict_sources, conflict_location: ent.label, question_text: row.question_text })
          .eq("id", (existing as { id: string }).id);
        if (error) throw new Error(`update failed: ${error.message}`);
        results.push({ entity: ent.label, fires: true, action: "refreshed", question_id: (existing as { id: string }).id, closed: r.closed.length, open: r.open.length, conflict_sources });
      } else {
        const { data: ins, error } = await supabase.from("first_read_open_questions").insert(row).select("id").single();
        if (error) throw new Error(`insert failed: ${error.message}`);
        results.push({ entity: ent.label, fires: true, action: "inserted", question_id: (ins as { id: string }).id, closed: r.closed.length, open: r.open.length, conflict_sources });
      }
    }
    return json({ ok: true, company_id, results });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
