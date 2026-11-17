// BRIEF-17 commit 2 — OPTION A: A FILE ANALYSIS'S CANDIDATES REACH THE REVIEW QUEUE (SP-324..SP-327)
//
// An analysis stores five candidate lists on its file_proposals row (needs, job steps, outcomes,
// routes, positioning updates). Until now nothing read them into the map (SP-F48). This module puts
// each item into surface_proposals as a PENDING row and does nothing else: no map row is written here,
// and no model is called. A candidate becomes a map row only when an admin accepts it, through
// public.accept_candidate_proposal() (SP-327).
//
// Each queued row carries:
//   - the item as the analysis wrote it (proposed_state.item);
//   - the live signals of the SAME analysis it rests on, found deterministically: a signal backs an
//     item when the item's normalised `evidence` is contained in the signal's normalised evidence
//     (raw_payload.evidence, else its excerpt). Measured on Charter's two live analyses: 30 of 30 items
//     match. An item with no match is still queued, with evidence_match "unmatched" and no ids;
//   - the VOICE of that evidence (SP-321) — company / outside / mixed / unlabeled — from the signals'
//     own labels, with an uploaded document's voice taken from its document verdict (an operator
//     override wins). A filing is the company speaking: its rows say "the company says".
//
// Idempotent: one queue row per (analysis, list, index), enforced by a unique index; a second call
// writes nothing. Only the LIVE analysis of a file queues — one that a newer ready analysis of the same
// file has replaced is skipped.

type Sb = { from: (t: string) => any };

export const CANDIDATE_LISTS = [
  { list: "candidate_needs", surfaceType: "candidate_need" },
  { list: "candidate_job_steps", surfaceType: "candidate_job_step" },
  { list: "candidate_outcomes", surfaceType: "candidate_outcome" },
  { list: "possible_routes", surfaceType: "candidate_route" },
  { list: "candidate_positioning_updates", surfaceType: "candidate_positioning" },
] as const;

export const CANDIDATE_SURFACE_TYPES: string[] = CANDIDATE_LISTS.map((c) => c.surfaceType);

export type CandidateList = typeof CANDIDATE_LISTS[number]["list"];
export type CandidateSurfaceType = typeof CANDIDATE_LISTS[number]["surfaceType"];
export type EvidenceVoice = "company" | "outside" | "mixed" | "unlabeled";
export type DocAuthorship = "client" | "us" | "third_party" | "uncertain" | null;

export const CANDIDATE_QUEUE_VERSION = "candidate-queue v3";
export const QUEUE_RETIRE_REASON = "reanalysis:superseded_by_newer_analysis";

/** Lower-case, every run of non-alphanumerics to one space, trimmed — the same normalisation the
 *  acceptance query used. */
export function normalizeEvidence(text: unknown): string {
  return String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** An item's evidence shorter than this matches too much to name a signal. */
export const MIN_MATCH_CHARS = 16;

// M1 (2026-11-17): A SIGNAL'S QUOTE MAY BE THE ITEM'S QUOTE CUT AT ITS TAIL. C1's answer schema caps a
// framework finding's `evidence` at 150 characters and a candidate's at 180, so a sentence between the two
// is stored on the signal cut mid-word and on the candidate whole. "The excerpt contains the item's
// evidence" then fails although the excerpt is the item's own quote, verified by E4 against the document.
// Measured on the 9 analyses made under the caps: 17 of 27 unmatched cards were exactly this — the stored
// excerpt a strict PREFIX of the card's evidence, covering 0.65–0.99 of it (Charter's earnings release,
// 5 of its 8). So a signal also backs an item when its stored, non-blank excerpt is a prefix of the item's
// evidence that is at least MIN_PREFIX_CHARS long and covers at least MIN_PREFIX_SHARE of it. Only the
// stored excerpt counts, as before (G1 backstop 3): the model's own raw_payload.evidence never matches.
export const MIN_PREFIX_CHARS = 40;
export const MIN_PREFIX_SHARE = 0.6;

/** PURE: does a signal's normalised stored excerpt `t` back an item's normalised evidence `ev`? */
export function excerptBacksEvidence(t: string, ev: string): boolean {
  if (!t || ev.length < MIN_MATCH_CHARS) return false;
  if (t.includes(ev)) return true;
  return t.length >= MIN_PREFIX_CHARS && t.length >= MIN_PREFIX_SHARE * ev.length && ev.startsWith(t);
}

export type QueueSignal = {
  id: string;
  source_type: string | null;
  signal_band: string | null;
  voice_class: string | null;
  evidence_excerpt: string | null;
  raw_payload: Record<string, unknown> | null;
};

/**
 * The voice of ONE signal (SP-321). An uploaded document speaks with the voice of its author: the
 * company's own document is company voice, a third party's is outside voice, our own write-up and an
 * unresolved author are unlabeled. Every other signal speaks with its stored voice label.
 */
export function signalVoice(sig: Pick<QueueSignal, "source_type" | "signal_band" | "voice_class">, docAuthorship: DocAuthorship): Exclude<EvidenceVoice, "mixed"> {
  if (sig.source_type === "uploaded_file") {
    if (docAuthorship === "client") return "company";
    if (docAuthorship === "third_party") return "outside";
    return "unlabeled";
  }
  if (sig.voice_class === "outside_voice_about_client") return "outside";
  if (sig.voice_class === "client_voice" || sig.signal_band === "organization") return "company";
  return "unlabeled";
}

/** The voice of a set of signals: both voices present ⇒ mixed; unlabeled counts only when alone. */
export function combineVoices(voices: Array<Exclude<EvidenceVoice, "mixed">>): EvidenceVoice {
  const company = voices.includes("company");
  const outside = voices.includes("outside");
  if (company && outside) return "mixed";
  if (company) return "company";
  if (outside) return "outside";
  return "unlabeled";
}

/** The effective authorship of a document from its verdict rows (newest first): an operator override
 *  wins over the classifier. */
export function effectiveAuthorship(rows: Array<{ authorship: string | null; operator_override: string | null; created_at?: string | null }>): DocAuthorship {
  const sorted = [...rows].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  const override = sorted.find((r) => r.operator_override === "client_voice" || r.operator_override === "external");
  if (override) return override.operator_override === "client_voice" ? "client" : "third_party";
  const a = sorted.find((r) => r.authorship)?.authorship ?? null;
  return a === "client" || a === "us" || a === "third_party" || a === "uncertain" ? a : null;
}

// ── G1 (2026-11-16): THE BACKSTOP — no model, applied before anything is queued ─────────────────────
//
// The analysis prompt now asks for one list per finding, no mirrored outcomes and no analyst verbs, but a
// prompt is a request, not a rule. Measured before G1 on Charter's 10-Q proposal 578e9e2f: one idea ("the
// financial impact of the Cox acquisition") sat in FOUR lists — need 90c52129, job step d3e04ff6, outcome
// e8b2fc73 with the need's own text, route 572386e1 "Analyze financial impact of acquisitions" — and all
// 18 rows read evidence_match "matched" although E4 had blanked every excerpt they rested on: the match
// was made against the model's own raw_payload.evidence, i.e. the item matched itself.
//   1. an item whose text is led by an analyst verb (understand / analyze / review / assess, with or
//      without a leading "to") is dropped: that is the reader's activity, not the customer's or a move;
//   2. within one analysis, an item that repeats an EARLIER kept item of a DIFFERENT list — the same
//      normalised text, or the same normalised evidence — is dropped; lists are read in CANDIDATE_LISTS
//      order, so a need outranks the job step, outcome or route that restates it;
//   3. evidence counts as matched only against a signal's stored, NON-BLANK evidence_excerpt — never
//      the model's own raw_payload.evidence. A blanked excerpt is evidence E4 could not find in the
//      document; it backs nothing.
// Every drop is returned with its reason and logged by the caller. Indices are the analysis's own, so a
// dropped item leaves a gap and a second call stays idempotent.

const ANALYST_VERB = /^(to\s+)?(understand|understanding|analy[sz]e|analy[sz]ing|review|reviewing|assess|assessing)\b/i;

/** The words an item is ABOUT, by list — what a duplicate or an analyst verb is judged on. */
export function candidateText(list: CandidateList, item: Record<string, unknown>): string {
  const pick = (...keys: string[]) => keys.map((k) => String(item[k] ?? "")).find((v) => v.trim()) ?? "";
  switch (list) {
    case "candidate_needs": return pick("desired_outcome", "need");
    case "candidate_job_steps": return pick("step_label", "step_description");
    case "candidate_outcomes": return pick("outcome");
    case "possible_routes": return pick("title");
    case "candidate_positioning_updates": return pick("suggested_update");
  }
}

/** True when the item's text is led by an analyst verb ("Understand…", "To analyze…", "Assess…"). */
export function ledByAnalystVerb(text: string): boolean {
  return ANALYST_VERB.test(String(text ?? "").trim());
}

export type CandidateDrop = { list: CandidateList; index: number; reason: "analyst_verb" | "duplicate_text" | "duplicate_evidence"; of?: string; text: string };

export type PlannedQueueRow = {
  company_id: string;
  surface_type: CandidateSurfaceType;
  surface_id: null;
  current_state: null;
  proposed_state: {
    item: Record<string, unknown>;
    evidence_signal_ids: string[];
    evidence_voice: EvidenceVoice;
  };
  status: "pending";
  reason: string;
  raw_payload: {
    file_proposal_id: string;
    file_id: string | null;
    candidate_list: CandidateList;
    candidate_index: string;
    evidence_match: "matched" | "unmatched";
    signal_ids: string[];
    document_authorship: DocAuthorship;
    queued_by: string;
  };
};

/** PURE: the queue rows for one analysis. No I/O — the unit tests and the guard read this. */
export function planCandidateQueue(args: {
  companyId: string;
  proposal: { id: string; file_id: string | null } & Partial<Record<CandidateList, unknown>>;
  signals: QueueSignal[];
  docAuthorship: DocAuthorship;
}): PlannedQueueRow[] {
  return planCandidateQueueWithDrops(args).rows;
}

/** PURE: the queue rows for one analysis, and every item the backstop dropped, with its reason. */
export function planCandidateQueueWithDrops(args: {
  companyId: string;
  proposal: { id: string; file_id: string | null } & Partial<Record<CandidateList, unknown>>;
  signals: QueueSignal[];
  docAuthorship: DocAuthorship;
}): { rows: PlannedQueueRow[]; drops: CandidateDrop[] } {
  // backstop 3: only a stored, non-blank excerpt can back an item
  const sigText = args.signals
    .map((s) => ({ s, t: normalizeEvidence(s.evidence_excerpt ?? "") }))
    .filter(({ t }) => t.length > 0);
  const out: PlannedQueueRow[] = [];
  const drops: CandidateDrop[] = [];
  const seenText = new Map<string, CandidateList>();
  const seenEvidence = new Map<string, CandidateList>();
  for (const { list, surfaceType } of CANDIDATE_LISTS) {
    const items = Array.isArray(args.proposal[list]) ? (args.proposal[list] as unknown[]) : [];
    items.forEach((raw, index) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const item = raw as Record<string, unknown>;
      const text = candidateText(list, item);
      const nText = normalizeEvidence(text);
      const ev = normalizeEvidence(item.evidence);
      // backstop 1: the reader's activity is not a candidate
      if (ledByAnalystVerb(text)) { drops.push({ list, index, reason: "analyst_verb", text }); return; }
      // backstop 2: an earlier list already holds this idea
      const textOwner = nText ? seenText.get(nText) : undefined;
      if (textOwner && textOwner !== list) { drops.push({ list, index, reason: "duplicate_text", of: textOwner, text }); return; }
      const evOwner = ev.length >= MIN_MATCH_CHARS ? seenEvidence.get(ev) : undefined;
      if (evOwner && evOwner !== list) { drops.push({ list, index, reason: "duplicate_evidence", of: evOwner, text }); return; }
      if (nText && !seenText.has(nText)) seenText.set(nText, list);
      if (ev.length >= MIN_MATCH_CHARS && !seenEvidence.has(ev)) seenEvidence.set(ev, list);
      const backing = sigText.filter(({ t }) => excerptBacksEvidence(t, ev)).map(({ s }) => s);
      const ids = backing.map((s) => s.id);
      out.push({
        company_id: args.companyId,
        surface_type: surfaceType,
        surface_id: null,
        current_state: null,
        proposed_state: {
          item,
          evidence_signal_ids: ids,
          evidence_voice: combineVoices(backing.map((s) => signalVoice(s, args.docAuthorship))),
        },
        status: "pending",
        reason: `file_proposal:${args.proposal.id} ${list}[${index}]`,
        raw_payload: {
          file_proposal_id: args.proposal.id,
          file_id: args.proposal.file_id,
          candidate_list: list,
          candidate_index: String(index),
          evidence_match: ids.length > 0 ? "matched" : "unmatched",
          signal_ids: ids,
          document_authorship: args.docAuthorship,
          queued_by: CANDIDATE_QUEUE_VERSION,
        },
      });
    });
  }
  return { rows: out, drops };
}

export type QueueResult = { queued: number; already: number; dropped?: number; skipped: null | "not_ready" | "not_live" | "not_found" };

/**
 * Queue the candidates of ONE analysis. Runs after the analysis is ready and minted (its signals are
 * what the items rest on) and after the earlier analyses of the file have stood down.
 */
export async function queueCandidatesForAnalysis(supabase: Sb, companyId: string, proposalId: string): Promise<QueueResult> {
  const { data: p, error } = await supabase
    .from("file_proposals")
    .select("id, company_id, file_id, processing_state, created_at, candidate_needs, candidate_job_steps, candidate_outcomes, possible_routes, candidate_positioning_updates")
    .eq("id", proposalId).eq("company_id", companyId).maybeSingle();
  if (error) throw new Error(`candidate queue: proposal read failed: ${error.message}`);
  if (!p) return { queued: 0, already: 0, skipped: "not_found" };
  if (p.processing_state !== "ready") return { queued: 0, already: 0, skipped: "not_ready" };
  const fileId = p.file_id ? String(p.file_id) : null;

  // only the LIVE analysis of its file queues
  if (fileId) {
    const { data: newer, error: nErr } = await supabase
      .from("file_proposals").select("id")
      .eq("company_id", companyId).eq("file_id", fileId).eq("processing_state", "ready")
      .gt("created_at", p.created_at).limit(1);
    if (nErr) throw new Error(`candidate queue: newer-analysis check failed: ${nErr.message}`);
    if (Array.isArray(newer) && newer.length > 0) return { queued: 0, already: 0, skipped: "not_live" };
  }

  const { data: sigs, error: sErr } = await supabase
    .from("signals")
    .select("id, source_type, signal_band, voice_class, evidence_excerpt, raw_payload")
    .eq("company_id", companyId).eq("source_id", proposalId).is("superseded_at", null);
  if (sErr) throw new Error(`candidate queue: signals read failed: ${sErr.message}`);

  let docAuthorship: DocAuthorship = null;
  if (fileId) {
    const { data: verdicts, error: vErr } = await supabase
      .from("doc_voice_verdicts").select("authorship, operator_override, created_at")
      .eq("company_id", companyId).eq("input_file_id", fileId);
    if (vErr) throw new Error(`candidate queue: document verdict read failed: ${vErr.message}`);
    docAuthorship = effectiveAuthorship((verdicts ?? []) as never);
  }

  const { rows: planned, drops } = planCandidateQueueWithDrops({ companyId, proposal: p as never, signals: (sigs ?? []) as QueueSignal[], docAuthorship });
  // G1: every backstop drop is logged, item by item, before anything is written.
  for (const d of drops) {
    console.log("[candidate-queue] dropped", JSON.stringify({ proposal_id: proposalId, list: d.list, index: d.index, reason: d.reason, of: d.of ?? null, text: d.text.slice(0, 160) }));
  }
  if (!planned.length) return { queued: 0, already: 0, dropped: drops.length, skipped: null };

  const { data: existing, error: eErr } = await supabase
    .from("surface_proposals").select("raw_payload")
    .eq("company_id", companyId).in("surface_type", CANDIDATE_SURFACE_TYPES)
    .eq("raw_payload->>file_proposal_id", proposalId);
  if (eErr) throw new Error(`candidate queue: existing-row read failed: ${eErr.message}`);
  const have = new Set(((existing ?? []) as Array<{ raw_payload: Record<string, unknown> | null }>)
    .map((r) => `${r.raw_payload?.candidate_list}|${r.raw_payload?.candidate_index}`));
  const fresh = planned.filter((r) => !have.has(`${r.raw_payload.candidate_list}|${r.raw_payload.candidate_index}`));
  if (fresh.length) {
    const { error: iErr } = await supabase.from("surface_proposals").insert(fresh);
    if (iErr) throw new Error(`candidate queue: insert failed: ${iErr.message}`);
  }
  return { queued: fresh.length, already: planned.length - fresh.length, dropped: drops.length, skipped: null };
}

/**
 * SP-325: a re-analysis retires the earlier analyses' STILL-PENDING queue rows. Accepted and rejected
 * rows are never touched — they are the operator's decisions. Nothing is deleted: the row moves to
 * `superseded` and records why in raw_payload.
 */
export async function retirePendingCandidates(supabase: Sb, companyId: string, retiredProposalIds: string[], keepProposalId: string): Promise<number> {
  if (!retiredProposalIds.length) return 0;
  const { data, error } = await supabase
    .from("surface_proposals").select("id, raw_payload")
    .eq("company_id", companyId).eq("status", "pending").in("surface_type", CANDIDATE_SURFACE_TYPES)
    .in("raw_payload->>file_proposal_id", retiredProposalIds);
  if (error) throw new Error(`candidate queue: pending lookup failed: ${error.message}`);
  let n = 0;
  const at = new Date().toISOString();
  for (const row of (data ?? []) as Array<{ id: string; raw_payload: Record<string, unknown> | null }>) {
    const { data: upd, error: uErr } = await supabase
      .from("surface_proposals")
      .update({
        status: "superseded",
        reviewed_at: at,
        raw_payload: { ...(row.raw_payload ?? {}), superseded_by_reanalysis: { at, reason: QUEUE_RETIRE_REASON, kept_proposal_id: keepProposalId } },
      })
      .eq("id", row.id).eq("status", "pending")
      .select("id");
    if (uErr) throw new Error(`candidate queue: retire failed: ${uErr.message}`);
    n += Array.isArray(upd) ? upd.length : 0;
  }
  return n;
}
