// GATE S2 (2026-08-20) — populate signals.operating_status from text, deterministically. Reads a
// company's signals, runs the shared classifier, and stamps operating_status + _as_of +
// _source='text_classifier' on the ones that resolve to a NON-unknown status. Returns the audit
// ledger (every id changed, with the matched phrase). No model. Frozen companies are refused.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyOperatingStatus } from "../_shared/operatingStatus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const hostOf = (u: string | null) =>
  (u ?? "").replace(/^https?:\/\/(www\.)?/i, "").split("/")[0] || "-";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const company_id = String(body.company_id ?? "");
    const dryRun = body.dry_run === true;
    if (!company_id) return json({ error: "company_id required" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: co } = await supabase.from("companies").select("id, frozen").eq("id", company_id).maybeSingle();
    if (!co) return json({ error: "company not found" }, 404);
    if ((co as { frozen?: boolean }).frozen) return json({ error: "refused: company is frozen" }, 403);

    const { data: sigRows, error: selErr } = await supabase
      .from("signals")
      .select("id, claim_text, evidence_excerpt, source_title, source_url, event_date, created_at, voice_class, operating_status")
      .eq("company_id", company_id)
      .limit(2000);
    if (selErr) return json({ ok: false, error: `signals select failed: ${selErr.message}` }, 500);
    const sigs = (sigRows ?? []) as Array<{
      id: string; claim_text: string | null; evidence_excerpt: string | null; source_title: string | null;
      source_url: string | null; event_date: string | null; created_at: string | null; voice_class: string | null;
      operating_status: string | null;
    }>;

    const changed: Array<Record<string, unknown>> = [];
    const counts: Record<string, number> = { open: 0, temporarily_closed: 0, permanently_closed: 0, unknown: 0 };
    for (const s of sigs) {
      const { status, matchedPhrase } = classifyOperatingStatus({
        statement: s.claim_text, evidenceExcerpt: s.evidence_excerpt, sourceTitle: s.source_title,
      });
      counts[status] = (counts[status] ?? 0) + 1;
      if (status === "unknown") continue; // default already unknown — never a "change"
      const asOf = (s.event_date ?? (s.created_at ? s.created_at.slice(0, 10) : null));
      if (!dryRun) {
        const { error } = await supabase.from("signals")
          .update({ operating_status: status, operating_status_as_of: asOf, operating_status_source: "text_classifier" })
          .eq("id", s.id);
        if (error) throw new Error(`update ${s.id} failed: ${error.message}`);
      }
      changed.push({ id: s.id, status, phrase: matchedPhrase, host: hostOf(s.source_url), as_of: asOf, voice_class: s.voice_class });
    }

    return json({ ok: true, dry_run: dryRun, company_id, examined: sigs.length, changed_count: changed.length, counts, changed });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
