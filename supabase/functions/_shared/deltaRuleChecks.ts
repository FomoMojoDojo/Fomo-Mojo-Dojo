// ── GAP-QUALITY RULES R1–R3 (operator ruling 2026-10-22) — finalize code checks on judged public_vs_public pairs ─────────
//
// The judge compares two statements and sees no host, no voice class and no specifics, so it disputed figures with
// generic rants, scored a complaint about one thing as a contradiction of another, and counted employee reviews as
// customer evidence (diagnostic B, Spectrum, 26 disputed pairs). These checks run in CODE over what the judge cannot see:
//
//   R1  A SPECIFIC is disputed only by a competing specific of the same unit. When the declared line states a figure,
//       the record's page words must state a DIFFERENT figure that shares a unit word with it (a probe word that is not
//       a number: "57 million homes" against "60 million homes"). A declared exclusivity or reach specific with no
//       figure is disputed only by a record that states a specific at all.                              → not_echoed
//   R2  ABSENCE IS NOT CONTRADICTION. The record's page words must share at least one content word with the declared
//       line (stop words and the company's own names — its name and its confirmed related entities — excluded). A
//       record that speaks of something else does not contradict it.                                    → not_echoed
//   R3  EMPLOYEE VOICE IS NOT CUSTOMER EVIDENCE. A record whose every live backing row sits on an employer-review host
//       (EMPLOYER_REVIEW_HOSTS) is removed from the gap beat — disputed or raised.                       → removed
//
// Scope (signed): divergent pairs take R3, R1, R2 in that order (one refusal per pair — the first rule that fires; the
// detail names every rule that fired). internally_silent ("raised") pairs take R3 only: they have no declared side.
// Echoed pairs take R3 only (ruling 7, 2026-10-22): employee voice neither disputes nor confirms.
//
// OPERATOR KIND (ruling 8, 2026-10-22): an operator may refuse a pair the rules let stand — kind 'operator', rule
// 'operator', the operator's reason VERBATIM, actor 'operator:<who>' (planOperatorRefusals validates; the table checks).
// An active refusal of EITHER kind on an identity is never revisited by the system: planRuleRefusals skips it.
//
// The record's words are VERIFIED PAGE WORDS only (R5: excerptIsVerifiedPageWords, incl. a passed verification via
// annotateVerifiedExcerpts) of live backing signals (not held, not superseded). No page words ⇒ R2 sees no shared word.
//
// claim_deltas verdict rows are NEVER edited. A refusal is an append-only claim_delta_rule_refusals row, preceded by one
// claim_delta_rule_refusal_audit row; a revert is a second row (action 'revert'). Readers take an ACTIVE refusal out of
// the gap through isPairAdmissible (relevanceActive.ts). Nothing here is company-specific.

import { extractSpecifics, type Specific } from "./classFactCheck.ts";
import { annotateVerifiedExcerpts, excerptIsVerifiedPageWords } from "./classSourcingScope.ts";
import { loadConfirmedRelatedEntities } from "./ownHosts.ts";

// deno-lint-ignore no-explicit-any
type AnySupabase = { from: (t: string) => any };

/** Bump when a rule's behaviour changes; stamped on every refusal row. */
export const DELTA_RULES_VERSION = 2;   // 2: R3 reaches echoed pairs (ruling 7, 2026-10-22)

export type DeltaRule = "R1" | "R2" | "R3";
export type DeltaRuleOutcome = "not_echoed" | "removed";
export const RULE_OUTCOME: Record<DeltaRule, DeltaRuleOutcome> = { R1: "not_echoed", R2: "not_echoed", R3: "removed" };

/** Employer-review hosts (signed list). A host matches itself or any subdomain; glassdoor matches every country TLD. */
export const EMPLOYER_REVIEW_HOSTS: readonly RegExp[] = [
  /(^|\.)glassdoor\.[a-z.]+$/,
  /(^|\.)indeed\.com$/,
  /(^|\.)comparably\.com$/,
  /(^|\.)kununu\.com$/,
  /(^|\.)teamblind\.com$/,
];
export function isEmployerReviewHost(host: string | null | undefined): boolean {
  const h = String(host ?? "").trim().toLowerCase().replace(/^www\./, "");
  return !!h && EMPLOYER_REVIEW_HOSTS.some((re) => re.test(h));
}
export function hostOfUrl(url: string | null | undefined): string {
  try { return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, "") : ""; } catch { return ""; }
}

/** Generic stop words for R2. Company names are excluded per company, from data (companyNameWords). */
export const R2_STOP_WORDS: ReadonlySet<string> = new Set(
  "a an and are as at be by for from has have in is it its of on or our that the their this to with we you your can more than all any not no plus".split(" "),
);
/** R2 content words: lowercase; newlines and every character outside [a-z0-9%$/] become a space; words of 3+ characters. */
export function contentWords(text: string, exclude: ReadonlySet<string> = new Set()): Set<string> {
  const out = new Set<string>();
  for (const w of String(text ?? "").toLowerCase().replace(/[^a-z0-9%$/]+/g, " ").split(/\s+/)) {
    if (w.length > 2 && !R2_STOP_WORDS.has(w) && !exclude.has(w)) out.add(w);
  }
  return out;
}
/** The company's own names as R2 exclusions: its name and every confirmed related entity's name, word by word. */
export function companyNameWords(names: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const n of names) for (const w of contentWords(n)) out.add(w);
  return out;
}

/** R1 unit words of a specific: the words of its probes that do not start with a digit. */
function unitWords(s: Specific): Set<string> {
  const out = new Set<string>();
  for (const p of s.probes ?? []) for (const w of p.toLowerCase().split(/\s+/)) if (w && !/^\d/.test(w)) out.add(w);
  return out;
}

export type PairRuleInput = {
  deltaId: string;
  contentIdentity: string;
  deltaType: "divergent" | "internally_silent" | "echoed";
  /** the declared (own-words) statement; null on a raised (internally_silent) pair */
  declared: string | null;
  /** verified page words of the record's live backing signals */
  recordPageWords: readonly string[];
  /** hosts of the record's live backing signals */
  recordHosts: readonly string[];
};
export type PairRuleVerdict = {
  rule: DeltaRule;
  outcome: DeltaRuleOutcome;
  reason: string;
  detail: Record<string, unknown>;
} | null;

/** PURE: the first rule that refuses this pair (R3, then R1, then R2), or null when the pair stands. */
export function checkPair(p: PairRuleInput, nameWords: ReadonlySet<string>): PairRuleVerdict {
  const fired: DeltaRule[] = [];
  const detail: Record<string, unknown> = { record_hosts: [...p.recordHosts], page_words_rows: p.recordPageWords.length };
  const reasons: Partial<Record<DeltaRule, string>> = {};

  // R3 — every live backing row is on an employer-review host
  if (p.recordHosts.length > 0 && p.recordHosts.every(isEmployerReviewHost)) {
    fired.push("R3");
    reasons.R3 = `record is employee voice only (${[...new Set(p.recordHosts)].join(", ")}), not customer evidence`;
  }
  if (p.deltaType === "divergent" && p.declared) {
    const record = p.recordPageWords.join("\n");
    // R1 — a specific is disputed only by a competing specific of the same unit
    const ys = extractSpecifics(p.declared);
    if (ys.length > 0) {
      const rs = extractSpecifics(record);
      const yf = ys.filter((s) => s.kind === "figure"), rf = rs.filter((s) => s.kind === "figure");
      const competing = yf.some((a) => { const ua = unitWords(a); return rf.some((b) => b.token !== a.token && [...unitWords(b)].some((w) => ua.has(w))); });
      const r1 = !competing && (yf.length > 0 || rs.length === 0);
      detail.declared_specifics = ys.map((s) => `${s.kind}:${s.token}`);
      detail.record_specifics = rs.map((s) => `${s.kind}:${s.token}`);
      if (r1) {
        fired.push("R1");
        reasons.R1 = yf.length > 0
          ? `declared figure ${yf.map((s) => s.token).join(", ")} is not met by a competing figure of the same unit in the record`
          : `declared ${ys.map((s) => s.kind).join("/")} specific is not met by any specific in the record`;
      }
    }
    // R2 — absence is not contradiction
    const shared = [...contentWords(record, nameWords)].filter((w) => contentWords(p.declared!, nameWords).has(w));
    detail.shared_content_words = shared;
    if (shared.length === 0) {
      fired.push("R2");
      reasons.R2 = "record shares no content word with the declared statement: absence, not contradiction";
    }
  }
  if (fired.length === 0) return null;
  const rule = fired[0];
  return { rule, outcome: RULE_OUTCOME[rule], reason: reasons[rule]!, detail: { ...detail, rules_fired: fired } };
}

// ── loader + planner (reads only) ───────────────────────────────────────────────────────────────────────────────────────

export type RefusalKind = "rule" | "operator";
export type ActiveRefusal = { id: string; content_identity: string; delta_id: string; rule: DeltaRule | "operator"; outcome: DeltaRuleOutcome; kind: RefusalKind };

/** The company's ACTIVE refusals (the view), keyed by content identity. */
export async function loadActiveRuleRefusals(supabase: AnySupabase, companyId: string): Promise<Map<string, ActiveRefusal>> {
  const { data, error } = await supabase.from("claim_delta_rule_refusals_active")
    .select("id, content_identity, delta_id, rule, outcome, kind").eq("company_id", companyId);
  if (error) throw new Error(`claim_delta_rule_refusals_active read failed: ${error.message}`);
  return new Map(((data ?? []) as ActiveRefusal[]).map((r) => [r.content_identity, r]));
}

export type PlannedRefusal = {
  delta_id: string; content_identity: string; delta_type: "divergent" | "internally_silent" | "echoed";
  rule: DeltaRule | "operator"; outcome: DeltaRuleOutcome; reason: string; detail: Record<string, unknown>;
  kind: RefusalKind;
  /** operator kind only: 'operator:<who>' (a rule row takes the writer's actor) */
  actor?: string;
};

/** Every public_vs_public divergent / internally_silent pair of the company, with its rule inputs. Reads only. */
export async function loadPairRuleInputs(supabase: AnySupabase, companyId: string): Promise<{ inputs: PairRuleInput[]; nameWords: Set<string> }> {
  const { data: co, error: coErr } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
  if (coErr) throw new Error(`companies read failed: ${coErr.message}`);
  const related = await loadConfirmedRelatedEntities(supabase, companyId);
  const nameWords = companyNameWords([String((co as { name?: string } | null)?.name ?? ""), ...related.map((r) => String(r.name ?? ""))]);

  const { data: ds, error: dErr } = await supabase.from("claim_deltas")
    .select("id, delta_type, content_identity, declared_claim_id, public_claim_id")
    .eq("company_id", companyId).eq("pairing_kind", "public_vs_public");
  if (dErr) throw new Error(`claim_deltas read failed: ${dErr.message}`);
  const deltas = ((ds ?? []) as Array<{ delta_type: string }>).filter((d) => d.delta_type === "divergent" || d.delta_type === "internally_silent" || d.delta_type === "echoed") as Array<{ id: string; delta_type: "divergent" | "internally_silent" | "echoed"; content_identity: string; declared_claim_id: string | null; public_claim_id: string | null }>;
  if (deltas.length === 0) return { inputs: [], nameWords };

  const claimIds = [...new Set(deltas.flatMap((d) => [d.declared_claim_id, d.public_claim_id]).filter((x): x is string => !!x))];
  const statement = new Map<string, string>();
  for (let i = 0; i < claimIds.length; i += 200) {
    const { data } = await supabase.from("claims").select("id, statement").in("id", claimIds.slice(i, i + 200));
    for (const c of (data ?? []) as Array<{ id: string; statement: string }>) statement.set(c.id, c.statement);
  }
  const pubIds = [...new Set(deltas.map((d) => d.public_claim_id).filter((x): x is string => !!x))];
  const refs: Array<{ claim_id: string; signal_id: string }> = [];
  for (let i = 0; i < pubIds.length; i += 200) {
    const { data } = await supabase.from("claim_signal_refs").select("claim_id, signal_id").in("claim_id", pubIds.slice(i, i + 200));
    refs.push(...((data ?? []) as typeof refs));
  }
  const sigIds = [...new Set(refs.map((r) => r.signal_id))];
  const sigs: Array<Record<string, unknown>> = [];
  for (let i = 0; i < sigIds.length; i += 200) {
    const { data } = await supabase.from("signals")
      .select("id, evidence_excerpt, source_url, raw_payload, signal_band, superseded_at, held_at").in("id", sigIds.slice(i, i + 200));
    sigs.push(...((data ?? []) as Array<Record<string, unknown>>));
  }
  const live = sigs.filter((s) => s.signal_band === "outside" && !s.superseded_at && !s.held_at);
  await annotateVerifiedExcerpts(supabase, live);
  const byId = new Map(live.map((s) => [String(s.id), s]));

  const inputs: PairRuleInput[] = deltas.map((d) => {
    const backing = refs.filter((r) => r.claim_id === d.public_claim_id).map((r) => byId.get(r.signal_id)).filter((s): s is Record<string, unknown> => !!s);
    return {
      deltaId: d.id,
      contentIdentity: d.content_identity,
      deltaType: d.delta_type,
      declared: d.declared_claim_id ? statement.get(d.declared_claim_id) ?? null : null,
      recordPageWords: backing.filter((s) => String(s.evidence_excerpt ?? "").trim() && excerptIsVerifiedPageWords(s)).map((s) => String(s.evidence_excerpt).trim()),
      recordHosts: backing.map((s) => hostOfUrl(String(s.source_url ?? ""))).filter(Boolean),
    };
  });
  return { inputs, nameWords };
}

/** PURE: the refusals to write — every refused pair with no active refusal on its identity (an OPERATOR refusal included:
 *  the system never revisits it). Sorted by delta id. */
export function planRuleRefusals(inputs: readonly PairRuleInput[], nameWords: ReadonlySet<string>, active: ReadonlyMap<string, unknown>): PlannedRefusal[] {
  const out: PlannedRefusal[] = [];
  for (const p of inputs) {
    if (active.has(p.contentIdentity)) continue;
    const v = checkPair(p, nameWords);
    if (!v) continue;
    out.push({ delta_id: p.deltaId, content_identity: p.contentIdentity, delta_type: p.deltaType, rule: v.rule, outcome: v.outcome, reason: v.reason, detail: v.detail, kind: "rule" });
  }
  return out.sort((a, b) => a.delta_id.localeCompare(b.delta_id));
}

/** PURE validation of one operator refusal request: a non-empty reason (kept verbatim) and an 'operator:<who>' actor. */
export function validateOperatorRefusal(req: { delta_id?: string; reason?: string | null; actor?: string | null }): string | null {
  if (!String(req.delta_id ?? "").trim()) return "delta_id required";
  if (!String(req.reason ?? "").trim()) return "operator refusal requires a non-empty reason";
  if (!/^operator:\S/.test(String(req.actor ?? ""))) return "operator refusal requires an actor 'operator:<who>'";
  return null;
}

/** OPERATOR refusals for named pairs (any company): each validated, each a public_vs_public pair of THIS company with
 *  no active refusal. Reads only; throws on the first invalid request (nothing is half-planned). */
export async function planOperatorRefusals(
  supabase: AnySupabase, companyId: string, reqs: ReadonlyArray<{ delta_id: string; reason: string }>, actor: string,
  active: ReadonlyMap<string, unknown>,
): Promise<PlannedRefusal[]> {
  const out: PlannedRefusal[] = [];
  for (const r of reqs) {
    const bad = validateOperatorRefusal({ ...r, actor });
    if (bad) throw new Error(`${r.delta_id ?? "?"}: ${bad}`);
    const { data, error } = await supabase.from("claim_deltas").select("id, company_id, pairing_kind, delta_type, content_identity").eq("id", r.delta_id).maybeSingle();
    if (error) throw new Error(`claim_deltas read failed: ${error.message}`);
    const d = data as { id: string; company_id: string; pairing_kind: string; delta_type: string; content_identity: string } | null;
    if (!d || d.company_id !== companyId || d.pairing_kind !== "public_vs_public") throw new Error(`${r.delta_id}: not a public_vs_public pair of ${companyId}`);
    if (!["divergent", "internally_silent", "echoed"].includes(d.delta_type)) throw new Error(`${r.delta_id}: delta_type ${d.delta_type} is not a judged pair`);
    if (active.has(d.content_identity)) throw new Error(`${r.delta_id}: already holds an active refusal`);
    out.push({ delta_id: d.id, content_identity: d.content_identity, delta_type: d.delta_type as PlannedRefusal["delta_type"], rule: "operator", outcome: "not_echoed", reason: r.reason, detail: { operator_reason_verbatim: true }, kind: "operator", actor });
  }
  return out.sort((a, b) => a.delta_id.localeCompare(b.delta_id));
}

/** WRITE (finalize path): for each planned refusal, the audit row FIRST, then the refusal row. Returns rows written. */
export async function writeRuleRefusals(
  supabase: AnySupabase,
  companyId: string,
  plan: readonly PlannedRefusal[],
  ctx: { actor: string; runRef: string },
): Promise<number> {
  let n = 0;
  for (const r of plan) {
    const refusalId = crypto.randomUUID();
    const { error: aErr } = await supabase.from("claim_delta_rule_refusal_audit").insert({
      refusal_id: refusalId, company_id: companyId, delta_id: r.delta_id, rule: r.rule, action: "refuse",
      before: { active: false }, after: { active: true, rule: r.rule, outcome: r.outcome, kind: r.kind }, actor: r.actor ?? ctx.actor, run_ref: ctx.runRef,
    });
    if (aErr) throw new Error(`rule-refusal audit insert failed: ${aErr.message}`);
    const { error: rErr } = await supabase.from("claim_delta_rule_refusals").insert({
      id: refusalId, company_id: companyId, delta_id: r.delta_id, content_identity: r.content_identity, delta_type: r.delta_type,
      rule: r.rule, outcome: r.outcome, action: "refuse", reason: r.reason, detail: r.detail,
      rules_version: DELTA_RULES_VERSION, actor: r.actor ?? ctx.actor, run_ref: ctx.runRef, kind: r.kind,
    });
    if (rErr) throw new Error(`rule-refusal insert failed: ${rErr.message}`);
    n++;
  }
  return n;
}

/** The public finalize's one call: load, plan against the active set, write. Returns { examined, refused }. */
export async function applyDeltaRuleChecks(supabase: AnySupabase, companyId: string, ctx: { actor: string; runRef: string }): Promise<{ examined: number; refused: number }> {
  const { inputs, nameWords } = await loadPairRuleInputs(supabase, companyId);
  const active = await loadActiveRuleRefusals(supabase, companyId);
  const plan = planRuleRefusals(inputs, nameWords, active);
  const refused = await writeRuleRefusals(supabase, companyId, plan, ctx);
  return { examined: inputs.length, refused };
}
