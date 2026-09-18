// ── Open-question anchors (gate 0 of the findings-basis arc, ruling 4 signed 2026-09-18) ────────────
//
// THE ONE loader of the anchors generate-open-questions generates from and finalizes against. Moved here
// verbatim from generate-open-questions/index.ts so the rule is testable with a fake client:
//   • finding anchors are OPEN findings of the run only — a resolved finding anchors nothing, so at
//     finalize its live questions are orphans and are superseded (they used to outlive the finding:
//     the loader read every finding of the run regardless of status; Edgewood db2f0b81 / 5705bd89
//     had to be retired by hand in the C0 act);
//   • silent_delta anchors are the company's publicly_silent public_vs_public deltas (unchanged).
// orphanQuestionIds is the finalize's rule, pure: a live row whose anchor_identity is not in the
// current anchor set. Gate 1 (held state, finding_signal_refs) is NOT here.
import { contentIdentity } from "./contentIdentity.ts";
import { documentDerivedClaimIds } from "./firstReadProvenance.ts";
import type { QuestionAnchor } from "../../../src/lib/firstRead/openQuestionLinks.ts";

// deno-lint-ignore no-explicit-any
type AnySupabase = { from: (t: string) => any };

/** Findings that may anchor a question: OPEN only (ruling 4). One predicate, one place. */
export const ANCHORABLE_FINDING_STATUS = "open" as const;
/** Claims a silent_delta anchor may rest on: ACTIVE only (ruling 7, signed 2026-09-18). A delta anchors a
 *  question only while BOTH of its claims are active — a struck declared claim (FomoMojoDojo's Brand.ai rows,
 *  Lumio's Harvey rows) un-anchors its questions, and the generation-free finalize retires them server-side. */
export const ANCHORABLE_CLAIM_STATUS = "active" as const;
export const ORPHAN_REASON_DELTA_CLAIM_STRUCK = "delta_claim_struck" as const;

export type AnchorExclusion = { identity: string; reason: typeof ORPHAN_REASON_DELTA_CLAIM_STRUCK };

export async function loadQuestionAnchors(supabase: AnySupabase, companyId: string, runId: string): Promise<QuestionAnchor[]> {
  return (await loadQuestionAnchorsDetailed(supabase, companyId, runId)).anchors;
}

/** The loader with its exclusions named: which silent_delta identities were refused because a claim of the
 *  delta is not active. The finalize reads the reasons from here — one predicate, one place. */
export async function loadQuestionAnchorsDetailed(
  supabase: AnySupabase, companyId: string, runId: string,
): Promise<{ anchors: QuestionAnchor[]; excluded: AnchorExclusion[] }> {
  const anchors: QuestionAnchor[] = [];
  const excluded: AnchorExclusion[] = [];

  const { data: findingRows } = await supabase
    .from("findings").select("body").eq("company_id", companyId).eq("origin_run_id", Number(runId))
    // ruling 4 (2026-09-18): a resolved finding anchors nothing — its questions become orphans at finalize
    .eq("status", ANCHORABLE_FINDING_STATUS);
  for (const f of (findingRows ?? []) as Array<{ body?: string | null }>) {
    const text = (f.body ?? "").trim();
    if (text) anchors.push({ kind: "finding", text, identity: await contentIdentity(text) });
  }

  const { data: deltaRows } = await supabase
    .from("claim_deltas").select("content_identity, declared_claim_id, public_claim_id")
    .eq("company_id", companyId).eq("pairing_kind", "public_vs_public") // GATE B-1: First Read questions anchor the public pairing
    .eq("delta_type", "publicly_silent");
  const deltas = (deltaRows ?? []) as Array<{ content_identity: string; declared_claim_id: string | null; public_claim_id?: string | null }>;
  const claimIds = [...new Set(deltas.flatMap((d) => [d.declared_claim_id, d.public_claim_id]).filter((x): x is string => !!x))];
  const claimById = new Map<string, string>();
  const statusById = new Map<string, string | null>();
  if (claimIds.length) {
    const { data: claimRows } = await supabase.from("claims").select("id, statement, status").in("id", claimIds);
    for (const c of (claimRows ?? []) as Array<{ id: string; statement: string | null; status?: string | null }>) {
      if (c.statement) claimById.set(c.id, c.statement.trim());
      statusById.set(c.id, c.status ?? null);
    }
  }
  // ruling 7: both claims of the delta must be ACTIVE (a public side is absent on a publicly_silent delta by
  // construction; when present it is held to the same rule). A refused delta is listed with its reason.
  const claimsActive = (d: { declared_claim_id: string | null; public_claim_id?: string | null }): boolean =>
    [d.declared_claim_id, d.public_claim_id].filter((x): x is string => !!x)
      .every((id) => statusById.get(id) === ANCHORABLE_CLAIM_STATUS);
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
    if (!text.trim() || !d.content_identity) continue;
    if (!claimsActive(d)) { excluded.push({ identity: d.content_identity, reason: ORPHAN_REASON_DELTA_CLAIM_STRUCK }); continue; }
    // anchor identity = the delta's own content identity (stable provenance link)
    anchors.push({ kind: "silent_delta", text: text.trim(), identity: d.content_identity });
  }
  return { anchors, excluded };
}

/** The finalize rule: live rows of the run whose anchor is no longer in the anchor set. Pure. */
export function orphanQuestionIds(liveRows: Array<{ id: string; anchor_identity: string | null }>, anchors: Array<{ identity: string }>): string[] {
  const identSet = new Set(anchors.map((a) => a.identity));
  return liveRows.filter((r) => !r.anchor_identity || !identSet.has(r.anchor_identity)).map((r) => r.id);
}

export type OrphanReason = typeof ORPHAN_REASON_DELTA_CLAIM_STRUCK | "finding_not_open" | "anchor_gone" | "anchorless";
/** Every orphan with WHY it is one (the finalize's audit row reads this). Pure. */
export function orphanQuestionReasons(
  liveRows: Array<{ id: string; anchor_identity: string | null; source_kind?: string | null }>,
  anchors: Array<{ identity: string }>,
  excluded: AnchorExclusion[],
): Array<{ id: string; reason: OrphanReason }> {
  const excludedReason = new Map(excluded.map((e) => [e.identity, e.reason]));
  const orphans = new Set(orphanQuestionIds(liveRows, anchors));
  return liveRows.filter((r) => orphans.has(r.id)).map((r) => ({
    id: r.id,
    reason: !r.anchor_identity ? "anchorless"
      : excludedReason.get(r.anchor_identity) ?? (r.source_kind === "finding" ? "finding_not_open" : "anchor_gone"),
  }));
}
