// BRIEF-17 commit 2 (SP-324..SP-327): the operator's review queue for a file analysis's candidates.
//
// Every row here is PENDING in surface_proposals until an admin acts on it. Accept is the ONLY way a
// candidate becomes a map row, and it goes through public.accept_candidate_proposal() — one row, one
// click, nothing automatic (SP-327). Need, job step and outcome have an insert-type accept (SP-326);
// route and positioning candidates can be reviewed and rejected here, and have no accept in this slice.
//
// Operator-only labels (SP-331): this panel is mounted only on the admin company-files page.
//
// SP-433 (2026-11-19): the queue also holds OUTSIDE-VOICE need cards, read out of customers' own
// public words rather than an uploaded file. Such a card carries proposed_state.origin =
// 'outside_voice_read' and shows the mark "Only the outside shows it"; on accept the need lands
// with source_path 'outside_voice_read' and provenance 'outside_review_derived', neither of which
// is on any public list. Accept is still one admin click through accept_candidate_proposal().
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OUTSIDE_VOICE_MARK, isOutsideVoiceCard } from "@/lib/outsideVoiceMark";   // SP-433 (2026-11-19)

type QueueRow = {
  id: string;
  surface_type: string;
  status: string;
  proposed_state: { item?: Record<string, unknown>; evidence_signal_ids?: string[]; evidence_voice?: string; origin?: string } | null;
  raw_payload: { file_proposal_id?: string; candidate_list?: string; evidence_match?: string } | null;
  created_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  candidate_need: "Need",
  candidate_job_step: "Job step",
  candidate_outcome: "Outcome",
  candidate_route: "Route",
  candidate_positioning: "Positioning update",
};
const VOICE_LABEL: Record<string, string> = {
  company: "Company says",
  outside: "Outside voices",
  mixed: "Both voices",
  unlabeled: "Voice unlabeled",
};
export const ACCEPTABLE_TYPES = new Set(["candidate_need", "candidate_job_step", "candidate_outcome"]);
export const CANDIDATE_TYPES = Object.keys(TYPE_LABEL);

/** The one line that names a candidate, per list. */
export function candidateHeadline(row: Pick<QueueRow, "surface_type" | "proposed_state">): string {
  const item = row.proposed_state?.item ?? {};
  const pick = (k: string) => (typeof item[k] === "string" ? String(item[k]).trim() : "");
  switch (row.surface_type) {
    case "candidate_need": return pick("desired_outcome");
    case "candidate_job_step": return [pick("step_label"), pick("step_description")].filter(Boolean).join(" — ");
    case "candidate_outcome": return pick("outcome");
    case "candidate_route": return pick("title");
    case "candidate_positioning": return [pick("field"), pick("suggested_update")].filter(Boolean).join(": ");
    default: return "";
  }
}

export default function CandidateReviewQueue({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase
      .from("surface_proposals")
      .select("id, surface_type, status, proposed_state, raw_payload, created_at")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .in("surface_type", CANDIDATE_TYPES)
      .order("created_at", { ascending: true });
    setRows((data ?? []) as unknown as QueueRow[]);
    setError(e ? e.message : null);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  const accept = async (id: string) => {
    setBusy(id);
    const { error: e } = await supabase.rpc("accept_candidate_proposal" as never, { p_proposal_id: id } as never);
    setBusy(null);
    if (e) { setError(e.message); return; }
    await load();
  };

  const reject = async (id: string) => {
    setBusy(id);
    const { data: auth } = await supabase.auth.getUser();
    const { error: e } = await supabase
      .from("surface_proposals")
      .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: auth?.user?.id ?? null })
      .eq("id", id)
      .eq("status", "pending");
    setBusy(null);
    if (e) { setError(e.message); return; }
    await load();
  };

  return (
    <section className="mt-8 rounded-lg border p-5" data-testid="candidate-review-queue">
      <h2 className="text-sm font-semibold">Review queue — from file analyses and the outside-voice read</h2>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {loading ? null : rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No pending candidates.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => {
            const ids = row.proposed_state?.evidence_signal_ids ?? [];
            const voice = row.proposed_state?.evidence_voice ?? "unlabeled";
            const canAccept = ACCEPTABLE_TYPES.has(row.surface_type);
            return (
              <li key={row.id} className="rounded border p-3" data-testid="candidate-review-row">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span>{TYPE_LABEL[row.surface_type] ?? row.surface_type}</span>
                  <span>· {VOICE_LABEL[voice] ?? voice}</span>
                  <span>· {ids.length} {ids.length === 1 ? "signal" : "signals"}</span>
                  {/* SP-433: rendered from the card's own origin — the value accept writes into
                      source_path — so the mark cannot disagree with what the row rests on. */}
                  {isOutsideVoiceCard(row.proposed_state) && (
                    <span data-testid="outside-voice-mark">· {OUTSIDE_VOICE_MARK}</span>
                  )}
                </div>
                <p className="mt-1 text-sm">{candidateHeadline(row)}</p>
                <div className="mt-2 flex gap-2">
                  {canAccept ? (
                    <button type="button" className="rounded border px-2 py-1 text-xs" disabled={busy === row.id} onClick={() => void accept(row.id)}>Accept</button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Accept is not available for this type yet.</span>
                  )}
                  <button type="button" className="rounded border px-2 py-1 text-xs" disabled={busy === row.id} onClick={() => void reject(row.id)}>Reject</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
