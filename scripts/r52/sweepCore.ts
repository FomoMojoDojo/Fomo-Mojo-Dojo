// ── R52 voice sweep — the core shared by plan.ts / apply.ts / revert.ts (operator rules signed 2026-10-20) ──────────
//
// WHAT IT DOES. Re-decides the voice class of EXISTING outside rows the reviewed R52 plan names, through THE shipped
// authority (_shared/voiceClassAtMint.ts → voiceClassForMintedExcerpt), with the regen path's own inputs rebuilt from the
// row and its stored snapshot, under keep_label. It never mints and never un-mints.
//
// HOW AN EXISTING ROW IS FED TO THE AUTHORITY (what the mint path supplied, and where this sweep gets it):
//   b3 row (raw_payload.run_id)   url = source_url · labeledClass = the row's CURRENT class · item null
//                                 pageText = the snapshot the row was minted from (raw_payload.snapshot_text_sha256)
//                                 judgedText = evidence_excerpt · offset = raw_payload.excerpt_offset, else the excerpt's
//                                 position in that page · registry = classifyRegistryRow over the same snapshot
//                                 attribution = detectAttribution · context = speakerContext (R42) · gate profile_wire_boilerplate
//                                 textGates = REGEN_TEXT_GATES · syndication = buildClientCorpus (shipped, rows of the row's
//                                 own run excluded — the mint's exclusion) + the client's anchors (clientAnchorsFor)
//   baseline row (no run_id)      the baseline seam's inputs: item {voice_class}, labeledClass = current class,
//                                 judgedText = judgedTextFor (shipped), no page, no text gates, no syndication stage
//   policy                        keep_label, always (R52): a judge failure or "unknown" leaves the class and is recorded
//
// A JUDGMENT ALREADY ON THE ROW STANDS ONLY WHERE JUDGE + QUESTION + PROMPT SHA MATCH (R52 ruling 2026-10-20): a stored
// speaker stamp (raw_payload.speaker) or authorship stamp (raw_payload.authorship_judge) is REPLAYED — no model call —
// only when (1) its model is the model this sweep would ask, and (2) the company's model_calls ledger holds a row of that
// judge role and model whose prompt_sha equals sha256(system + user) of the prompt the SHIPPED judge would send for this
// row now. The sha is the shipped judge's own: the judge is invoked with a refusing transport and a capturing ledger
// (shippedPromptSha) — no model reachable, nothing written. A stored verdict under a different prompt or question, or
// with no ledgered prompt (every pre-R53 authorship stamp), is re-asked. A stored judge_failed is not a judgment: it is
// re-asked. Plan mode counts only the calls that would be made.
//
// PLAN is the upper bound of calls: the stub band judge answers "not syndicated" and the stub speaker "third party", so
// every later stage the shipped order can reach is reached (band → speaker → URL-gated authorship).
import { MIXED_CANDIDATE, voiceClassForMintedExcerpt, type VoiceClassDecision, type VoiceClassInput } from "../../supabase/functions/_shared/voiceClassAtMint.ts";
import { REGEN_TEXT_GATES } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import {
  authorshipContext, judgeAggregatorAuthorship, judgeSpeaker, judgedTextFor, locateOnPage, ollamaAuthorshipTransport, ollamaSpeakerTransport,
  type AuthorshipInput, type AuthorshipJudgment, type AuthorshipTransport, type SpeakerInput, type SpeakerJudgment, type SpeakerTransport,
} from "../../supabase/functions/_shared/aggregatorAuthorship.ts";
import {
  buildClientCorpus, judgeSyndicationBand, ollamaSyndicationTransport, SYNDICATION_BAND_MODEL,
  type ClientCorpus, type SyndicationJudgeInput, type SyndicationTransport,
} from "../../supabase/functions/_shared/syndication.ts";
import { CLASSIFIER_MODEL, isLocalOllamaUrl } from "../../supabase/functions/_shared/uploadVoiceClassifier.ts";
import { detectAttribution, speakerContext } from "../../supabase/functions/_shared/attribution.ts";
import { classifyRegistryRow } from "../../supabase/functions/_shared/registryClassifier.ts";
import { clientAnchorsFor } from "../../supabase/functions/_shared/clientAnchors.ts";
import { classifyBodyMode } from "../../supabase/functions/_shared/bodyMode.ts";
import { FROZEN_COMPANY_IDS } from "../../supabase/functions/_shared/frozenCompanies.ts";
import { CLIENT_PORTALS_IDS } from "../../src/lib/b3Review/review.ts";
import { R52_REVERT, SweepRefusedError, type SweepCompany, type SweepSignal, type SweepStore } from "./psqlSweepStore.ts";

export { SweepRefusedError };
export const R52_RULES = "R52";
export const R52_COMPONENT = "r52_voice_sweep";
export const R52_CALL_SITE = "r52-voice-sweep";
export const R52_POLICY = "keep_label" as const;
export const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
/** Sweep order (signed): the b3 order, then causeway, then Edgewood, then Cafe Barra 2 last. */
export const SWEEP_ORDER: ReadonlyArray<string> = [
  "Brand AI", "Ground Up Innovations", "whispering.ai", "Corestar Partners", "Lumio", "Geniant", "Coreviva", "Riverlane",
  "Wasabi Technologies", "SIAA", "Sonos", "Gotham Sports", "Indoor Air Quality Management", "FomoMojoDojo",
  "causeway", "Edgewood", "Cafe Barra 2",
];
/** Restampable classes: the audit table's own check constraint. */
const AUDITABLE = new Set(["client_voice", "competitor_voice", "outside_voice_about_client"]);
export type JudgeName = "band" | "speaker" | "authorship";

// ── modes: named or refused, never defaulted (classifyBodyMode) ───────────────────────────────────────────────
export function argvBody(args: readonly string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const a of args) {
    if (!a.startsWith("--")) { body[`positional:${a}`] = a; continue; }
    const i = a.indexOf("=");
    const k = (i < 0 ? a.slice(2) : a.slice(2, i)).replace(/-/g, "_");
    body[k] = i < 0 ? true : a.slice(i + 1);
  }
  return body;
}
export function namedMode<M extends string>(args: readonly string[], modes: readonly M[], known: readonly string[]): { mode: M; body: Record<string, unknown> } {
  const body = argvBody(args);
  const v = classifyBodyMode(body, modes, known);
  if (!v.ok) throw new SweepRefusedError("mode_unnamed", `mode refused: ${v.detail}`);
  return { mode: v.mode, body };
}

// ── the reviewed plan ─────────────────────────────────────────────────────────────────────────────────────────
export type ReviewedRow = { seq: string; company: string; company_id: string; signal_id: string; era: "b3" | "baseline"; rules: string; judges: string; preempted_by: string };
export async function md5Hex(path: string): Promise<string> {
  const p = new Deno.Command("md5", { args: ["-q", path], stdout: "piped" }).outputSync();
  return new TextDecoder().decode(p.stdout).trim();
}
export function parseReviewedTsv(text: string): ReviewedRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  const hdr = lines[0].split("\t");
  const col = (n: string) => { const i = hdr.indexOf(n); if (i < 0) throw new Error(`reviewed plan has no ${n} column`); return i; };
  const c = { seq: col("seq"), company: col("company"), company_id: col("company_id"), signal_id: col("signal_id"), era: col("era"), rules: col("rules"), judges: col("judges"), preempted_by: col("preempted_by") };
  return lines.slice(1).map((l) => {
    const f = l.split("\t");
    const era = f[c.era] === "b3" ? "b3" : f[c.era] === "baseline" ? "baseline" : (() => { throw new Error(`unknown era ${f[c.era]}`); })();
    return { seq: f[c.seq], company: f[c.company], company_id: f[c.company_id], signal_id: f[c.signal_id], era, rules: f[c.rules], judges: f[c.judges], preempted_by: f[c.preempted_by] ?? "" };
  });
}
/** Reads every reviewed file and refuses unless each one's md5 is the signed value, by position. */
export async function readReviewed(paths: string[], md5s: string[]): Promise<{ rows: ReviewedRow[]; md5s: string[] }> {
  if (paths.length === 0 || paths.length !== md5s.length) throw new SweepRefusedError("no_reviewed_plan", "--reviewed=<tsv[,tsv]> and --reviewed-md5=<md5[,md5]> are required, one md5 per file");
  const rows: ReviewedRow[] = [];
  for (let i = 0; i < paths.length; i++) {
    const got = await md5Hex(paths[i]);
    if (got !== md5s[i]) throw new SweepRefusedError("reviewed_md5", `reviewed plan ${paths[i]} md5 ${got} ≠ signed ${md5s[i]}`);
    rows.push(...parseReviewedTsv(await Deno.readTextFile(paths[i])));
  }
  const seen = new Set<string>();
  for (const r of rows) { if (seen.has(r.signal_id)) throw new SweepRefusedError("reviewed_duplicate", `signal ${r.signal_id} appears twice in the reviewed plan`); seen.add(r.signal_id); }
  return { rows, md5s };
}
export function companyOrder(rows: ReviewedRow[]): Array<{ company_id: string; company: string; rows: ReviewedRow[] }> {
  const by = new Map<string, { company_id: string; company: string; rows: ReviewedRow[] }>();
  for (const r of rows) { const g = by.get(r.company_id) ?? { company_id: r.company_id, company: r.company, rows: [] }; g.rows.push(r); by.set(r.company_id, g); }
  const rank = (n: string) => { const i = SWEEP_ORDER.indexOf(n); return i < 0 ? 1e6 : i; };
  return [...by.values()].sort((a, b) => rank(a.company) - rank(b.company) || a.company.localeCompare(b.company));
}

// ── refusals by value ─────────────────────────────────────────────────────────────────────────────────────────
/** p4: a held company (fixture_hold), a frozen one, CB1 and the Client Portals ids are refused by value, before any read of rows. */
export function assertCompanyWritable(co: SweepCompany | undefined, companyId: string): asserts co is SweepCompany {
  const bare = companyId.replace(/-/g, "");
  if (CLIENT_PORTALS_IDS.includes(companyId) || CLIENT_PORTALS_IDS.includes(bare)) throw new SweepRefusedError("client_portals_id", `refused by value: ${companyId.slice(0, 8)}… is a Client Portals id`);
  if (companyId === CB1 || FROZEN_COMPANY_IDS.has(companyId)) throw new SweepRefusedError("frozen_company", `refused by value: ${companyId.slice(0, 8)}… is CB1 / a frozen reference company`);
  if (!co) throw new SweepRefusedError("company_not_found", `company ${companyId} not found`);
  if (co.frozen) throw new SweepRefusedError("frozen_company", `company ${co.name} is frozen`);
  if (co.fixture_hold) throw new SweepRefusedError("fixture_held", `company ${co.name} is held (${co.fixture_hold}) — a test fixture is never swept`);
}

// ── judges ────────────────────────────────────────────────────────────────────────────────────────────────────
export type BaseJudges = {
  band: (i: SyndicationJudgeInput) => Promise<{ syndicated: boolean | null; model: string }>;
  speaker: (i: SpeakerInput) => Promise<SpeakerJudgment | null>;
  authorship: (i: AuthorshipInput) => Promise<AuthorshipJudgment | null>;
};
/** replay: why a stored judgment was or was not replayed (null when the row carried none). */
/** nocall (R54): the judge was consulted but NOT called — the row has no page words; not a model call, never counted. */
export type CallRecord = { judge: JudgeName; replayed: boolean; unknown: string | null; model: string; replay?: "matched" | "model_differs" | "prompt_unledgered" | null; nocall?: true };
export type Tally = { band: number; speaker: number; authorship: number; ledger_failed: number };
export const emptyTally = (): Tally => ({ band: 0, speaker: 0, authorship: 0, ledger_failed: 0 });

/** PLAN stubs: no model, no network. Answers that reach every later stage (the upper bound of calls). */
export function planStubJudges(): BaseJudges {
  return {
    band: () => Promise.resolve({ syndicated: false, model: "r52-plan-stub" }),
    speaker: () => Promise.resolve({ speaker_class: "third_party", speaker_name: null, speaker_role: null, reason: "plan stub", model: "r52-plan-stub" }),
    authorship: () => Promise.resolve({ verdict: "uncertain", entity: null, reason: "plan stub", model: "r52-plan-stub" }),
  };
}
export type Transports = { authorship: AuthorshipTransport; speaker: SpeakerTransport; band: SyndicationTransport };
/** The local transports. Refused unless the base is local (no external model, no cloud provider anywhere in this runner). */
export function localTransports(base = Deno.env.get("R52_OLLAMA_URL") ?? "http://localhost:11434"): Transports {
  if (!isLocalOllamaUrl(base)) throw new SweepRefusedError("non_local_model", `the sweep's judges are local only — ${base} is not`);
  return { authorship: ollamaAuthorshipTransport(base), speaker: ollamaSpeakerTransport(base), band: ollamaSyndicationTransport(base) };
}
/** APPLY judges: the shipped judges, each with its REQUIRED ledger — one model_calls row per call, written before parse. */
export function ledgeredJudges(store: SweepStore, companyId: string, tally: Tally, t: Transports): BaseJudges {
  const ledgerFor = (role: JudgeName) => async (e: { usage: { provider: string; model: string; prompt_tokens: number | null; completion_tokens: number | null; usd: number | null }; promptSha: string }) => {
    const ok = await store.insertModelCall({ company_id: companyId, call_site: `${R52_CALL_SITE}:${role}`, provider: e.usage.provider, model: e.usage.model, prompt_tokens: e.usage.prompt_tokens, completion_tokens: e.usage.completion_tokens, usd: e.usage.usd, attempt: 1, prompt_sha: e.promptSha });
    tally[role] += 1;
    if (!ok) tally.ledger_failed += 1;
    return ok;
  };
  return {
    band: (i) => judgeSyndicationBand(i, { transport: t.band, ledger: ledgerFor("band"), model: Deno.env.get("R52_BAND_MODEL") || SYNDICATION_BAND_MODEL }),
    speaker: (i) => judgeSpeaker(i, { transport: t.speaker, ledger: ledgerFor("speaker"), model: CLASSIFIER_MODEL }),
    authorship: (i) => judgeAggregatorAuthorship(i, { transport: t.authorship, ledger: ledgerFor("authorship"), model: CLASSIFIER_MODEL }),
  };
}
type StoredSpeaker = { speaker_class?: string; speaker_name?: string | null; speaker_role?: string | null; reason?: string; model?: string };
type StoredAuthorship = { verdict?: string; entity?: string | null; reason?: string; model?: string };
/** The prompt sha the SHIPPED judge would ledger for this input: the judge runs with a transport that refuses (no model
 *  reachable) and a ledger that only captures — it hashes its own system + user exactly as on a real call. */
export async function shippedPromptSha(role: "speaker" | "authorship", i: SpeakerInput | AuthorshipInput): Promise<string> {
  let sha = "";
  const refuse = () => Promise.reject(new Error("r52 prompt-sha capture: no model call"));
  const capture = (e: { promptSha: string }) => { sha = e.promptSha; return Promise.resolve(true); };
  const warn = console.warn; console.warn = () => {}; // the judge logs its refused "call" as judge_failed — not a failure here
  try {
    if (role === "speaker") await judgeSpeaker(i as SpeakerInput, { transport: refuse, ledger: capture, model: CLASSIFIER_MODEL });
    else await judgeAggregatorAuthorship(i as AuthorshipInput, { transport: refuse, ledger: capture, model: CLASSIFIER_MODEL });
  } finally { console.warn = warn; }
  if (!sha) throw new Error(`shippedPromptSha(${role}): the judge ledgered no prompt sha`);
  return sha;
}
export const ledgerKey = (role: string, model: string, sha: string) => `${role}|${model}|${sha}`;
/** Per row: replay a stored judgment only where judge + question + prompt sha match the ledger; otherwise call the base
 *  judge. Every consultation recorded. */
function rowJudges(row: SweepSignal, base: BaseJudges, calls: CallRecord[], ledgered: ReadonlySet<string>): BaseJudges {
  const rp = row.raw_payload ?? {};
  const replayable = async (role: "speaker" | "authorship", storedModel: string | undefined, i: SpeakerInput | AuthorshipInput) => {
    if (storedModel !== CLASSIFIER_MODEL) return "model_differs" as const;
    return ledgered.has(ledgerKey(role, storedModel, await shippedPromptSha(role, i))) ? "matched" as const : "prompt_unledgered" as const;
  };
  return {
    band: async (i) => {
      const r = await base.band(i);
      calls.push({ judge: "band", replayed: false, unknown: r.syndicated === null ? `band judge unresolved (${r.model})` : null, model: r.model });
      return r;
    },
    speaker: async (i) => {
      const st = rp.speaker as StoredSpeaker | undefined;
      const stored = !!st && typeof st === "object" && !!st.speaker_class && st.speaker_class !== "judge_failed";
      const replay = stored ? await replayable("speaker", st!.model, i) : null;
      if (replay === "matched") {
        const j = { speaker_class: st!.speaker_class, speaker_name: st!.speaker_name ?? null, speaker_role: st!.speaker_role ?? null, reason: String(st!.reason ?? "stored"), model: String(st!.model) } as SpeakerJudgment;
        calls.push({ judge: "speaker", replayed: true, unknown: j.speaker_class === "unknown" ? `stored speaker unknown: ${j.reason}` : j.speaker_class === "mixed" ? `mixed_candidate: ${j.reason}` : null, model: j.model, replay });
        return j;
      }
      const r = await base.speaker(i);
      // R55d: a mixed answer is recorded unknown:mixed_candidate — the label stands, no class write
      calls.push({ judge: "speaker", replayed: false, unknown: !r ? "speaker judge unavailable" : r.speaker_class === "mixed" ? `mixed_candidate: ${r.reason}` : (r.speaker_class === "unknown" || r.speaker_class === "judge_failed") ? `speaker ${r.speaker_class}: ${r.reason}` : null, model: r?.model ?? "none", replay });
      return r;
    },
    authorship: async (i) => {
      // R54: a row with no page words is not judged for authorship — no call, no replay; recorded unknown, the label stands
      if (i.context.kind === "no_page") {
        const reason = `no_page_words: ${i.context.reason}`;
        calls.push({ judge: "authorship", replayed: false, unknown: reason, model: "none", nocall: true });
        return { verdict: "no_page_words", entity: null, reason: `${reason} — not judged; the label stands.`, model: "none" };
      }
      const st = rp.authorship_judge as StoredAuthorship | undefined;
      const stored = !!st && typeof st === "object" && !!st.verdict && st.verdict !== "judge_failed";
      const replay = stored ? await replayable("authorship", st!.model, i) : null;
      if (replay === "matched") {
        const j = { verdict: st!.verdict, entity: st!.entity ?? null, reason: String(st!.reason ?? "stored"), model: String(st!.model) } as AuthorshipJudgment;
        calls.push({ judge: "authorship", replayed: true, unknown: j.verdict === "uncertain" ? `stored authorship uncertain: ${j.reason}` : null, model: j.model, replay });
        return j;
      }
      const r = await base.authorship(i);
      calls.push({ judge: "authorship", replayed: false, unknown: !r ? "authorship judge unavailable" : (r.verdict === "judge_failed" || r.verdict === "uncertain") ? `authorship ${r.verdict}: ${r.reason}` : null, model: r?.model ?? "none", replay });
      return r;
    },
  };
}
export const madeCall = (c: CallRecord) => !c.replayed && !c.nocall;
export const callsString = (calls: CallRecord[]) => calls.filter(madeCall).map((c) => c.judge).join("+") || "none";

// ── per-company context: the inputs the mint path had ────────────────────────────────────────────────────────
export type CompanyCtx = { company: SweepCompany; name: string; host: string | null; anchors: readonly string[]; corpusByRun: Map<string, ClientCorpus>; ledgered: ReadonlySet<string> };
export async function companyCtx(store: SweepStore, co: SweepCompany): Promise<CompanyCtx> {
  const ca = clientAnchorsFor(co as { name?: unknown; website?: unknown; entity_anchors_json?: unknown });
  if (!ca.ok) throw new SweepRefusedError("client_unnamed", `${co.id}: ${ca.reason}`);
  const ledgered = new Set((await store.ledgeredPromptShas(co.id)).map((r) => ledgerKey(r.role, r.model, r.prompt_sha)));
  return { company: co, name: ca.name ?? "", host: ca.host, anchors: ca.anchors, corpusByRun: new Map(), ledgered };
}
async function corpusFor(store: SweepStore, ctx: CompanyCtx, runId: string): Promise<ClientCorpus> {
  let c = ctx.corpusByRun.get(runId);
  if (!c) {
    c = await buildClientCorpus(store.corpusClient(), ctx.company.id, ctx.host ?? "", [], (row) => String(row.raw_payload?.run_id ?? "") === runId);
    ctx.corpusByRun.set(runId, c);
  }
  return c;
}
export type Derived = { decision: VoiceClassDecision; calls: CallRecord[]; basis: { page: "snapshot" | "missing" | "none"; offset: "stored" | "located" | "none"; context: "page" | "no_page" } };
/** THE re-decision of one existing row, through the shipped authority under keep_label. */
export async function deriveRow(store: SweepStore, ctx: CompanyCtx, row: SweepSignal, era: "b3" | "baseline", base: BaseJudges, now: () => string = () => new Date().toISOString()): Promise<Derived> {
  const calls: CallRecord[] = [];
  const j = rowJudges(row, base, calls, ctx.ledgered);
  const rp = row.raw_payload ?? {};
  const company = { name: ctx.name, host: ctx.host };
  const url = String(row.source_url ?? "");
  let input: VoiceClassInput;
  let basis: Derived["basis"];
  if (era === "b3") {
    const sha = String(rp.snapshot_text_sha256 ?? "");
    const snap = sha ? await store.loadSnapshot(row.company_id, sha) : null;
    const page = snap?.clean_text ?? null;
    const excerpt = String(row.evidence_excerpt ?? "");
    const stored = Number.isInteger(rp.excerpt_offset) ? Number(rp.excerpt_offset) : null;
    const located = stored === null && page ? page.indexOf(excerpt) : -1;
    const offset = stored ?? (located >= 0 ? located : null);
    const length = Number.isInteger(rp.excerpt_length) ? Number(rp.excerpt_length) : excerpt.length;
    const attribution = detectAttribution(excerpt, page, offset);
    const actx = authorshipContext(page, excerpt, offset);
    basis = { page: snap ? "snapshot" : "missing", offset: stored !== null ? "stored" : located >= 0 ? "located" : "none", context: actx.kind };
    input = {
      authorshipContext: actx,
      url, item: null, labeledClass: row.voice_class, pageText: page, judgedText: excerpt, company,
      registry: snap ? classifyRegistryRow({ url, text: excerpt, snapshot: { clean_text: snap.clean_text, text_sha256: snap.text_sha256, structured: snap.structured } as never }) : classifyRegistryRow({ url, text: excerpt }),
      judge: j.authorship, gate: "profile_wire_boilerplate", textGates: REGEN_TEXT_GATES, onJudgeFailure: R52_POLICY, now,
      attribution, speakerJudge: j.speaker,
      context: page && offset !== null ? speakerContext(page, offset, length, attribution?.speaker_string || ctx.name) : null,
      syndication: { corpus: await corpusFor(store, ctx, String(rp.run_id ?? "")), judge: j.band, anchors: ctx.anchors },
    };
  } else {
    // R54: a baseline row's judged text is read in place on the page stored for it (the excerpt guard's basis snapshot,
    // else the newest snapshot of its URL); its offset is located (byte-present) — none was ever stored. pageText stays
    // null for the GATE, exactly as before: only the judge's context reads the page.
    const judged = judgedTextFor(row as never).text;
    const eg = (rp.excerpt_guard ?? {}) as { basis_sha?: unknown };
    const sha = String(rp.snapshot_text_sha256 ?? eg.basis_sha ?? "");
    const snap = (sha ? await store.loadSnapshot(row.company_id, sha) : null) ?? (url ? await store.loadSnapshotByUrl(row.company_id, url) : null);
    const page = snap?.clean_text ?? null;
    const located = locateOnPage(page, judged);
    const actx = authorshipContext(page, judged, located);
    basis = { page: snap ? "snapshot" : "missing", offset: located !== null ? "located" : "none", context: actx.kind };
    input = {
      authorshipContext: actx,
      url, item: { voice_class: row.voice_class }, labeledClass: row.voice_class, pageText: null,
      judgedText: judged, company, registry: null,
      judge: j.authorship, gate: "profile_wire_boilerplate", onJudgeFailure: R52_POLICY, now,
    };
  }
  const decision = await voiceClassForMintedExcerpt(input);
  // R55d: a detected mixed candidate reached the speaker stage and was not judged — recorded as a no-call unknown
  const why = decision.ok ? decision.detail : decision.reason;
  if (String(why ?? "").startsWith(`${MIXED_CANDIDATE}:`)) calls.push({ judge: "speaker", replayed: false, unknown: String(why), model: "none", nocall: true });
  return { decision, calls, basis };
}

// ── plan ──────────────────────────────────────────────────────────────────────────────────────────────────────
export type PlanRow = { seq: string; signal_id: string; company_id: string; era: "b3" | "baseline"; reviewed_judges: string; fresh_judges: string; live: boolean; authority: string | null; equal: boolean; why: string | null; basis: Derived["basis"] | null; replay: string; /** R54: the authorship stage was reached and the row has no page words (no call) */ no_page_words: boolean };
export type CompanyPlan = { company_id: string; company: string; refused: string | null; rows: PlanRow[]; equal: boolean; calls: Record<JudgeName, number> };
/** Re-derive every reviewed row of one company. Zero model calls (stub judges), zero writes. */
export async function planCompany(store: SweepStore, group: { company_id: string; company: string; rows: ReviewedRow[] }): Promise<CompanyPlan> {
  const calls: Record<JudgeName, number> = { band: 0, speaker: 0, authorship: 0 };
  const [co] = await store.loadCompanies([group.company_id]);
  try { assertCompanyWritable(co, group.company_id); } catch (e) {
    if (e instanceof SweepRefusedError) return { company_id: group.company_id, company: group.company, refused: e.code, rows: [], equal: false, calls };
    throw e;
  }
  const ctx = await companyCtx(store, co);
  const sigs = new Map((await store.loadSignals(group.rows.map((r) => r.signal_id))).map((s) => [s.id, s]));
  const stub = planStubJudges();
  const rows: PlanRow[] = [];
  for (const r of group.rows) {
    const s = sigs.get(r.signal_id);
    const live = !!s && s.company_id === r.company_id && !s.superseded_at && !s.held_at && s.signal_band === "outside";
    if (!s || !live) { rows.push({ seq: r.seq, signal_id: r.signal_id, company_id: r.company_id, era: r.era, reviewed_judges: r.judges, fresh_judges: "-", live: false, authority: null, equal: false, why: !s ? "signal not found" : "signal no longer live (superseded / held / not outside / moved company)", basis: null, replay: "", no_page_words: false }); continue; }
    if (s.raw_payload?.r52) { rows.push({ seq: r.seq, signal_id: r.signal_id, company_id: r.company_id, era: r.era, reviewed_judges: r.judges, fresh_judges: "-", live: true, authority: null, equal: false, why: `already swept (run ${String((s.raw_payload.r52 as Record<string, unknown>).run_ref)})`, basis: null, replay: "", no_page_words: false }); continue; }
    const d = await deriveRow(store, ctx, s, r.era, stub);
    const fresh = callsString(d.calls);
    for (const c of d.calls) if (madeCall(c)) calls[c.judge] += 1;
    const equal = fresh === r.judges;
    rows.push({ seq: r.seq, signal_id: r.signal_id, company_id: r.company_id, era: r.era, reviewed_judges: r.judges, fresh_judges: fresh, live: true, authority: d.decision.authority, equal, why: equal ? null : `reviewed ${r.judges} ≠ shipped ${fresh}`, basis: d.basis, replay: d.calls.filter((c) => c.replay).map((c) => `${c.judge}:${c.replay}`).join("+"), no_page_words: d.calls.some((c) => c.nocall && c.judge === "authorship") });
  }
  return { company_id: group.company_id, company: group.company, refused: null, rows, equal: rows.length > 0 && rows.every((x) => x.equal), calls };
}

// ── apply ─────────────────────────────────────────────────────────────────────────────────────────────────────
export type RowOutcome = { signal_id: string; kind: "changed" | "unchanged" | "unknown" | "refused"; from: string | null; to: string | null; reason: string | null; calls: string };
export type ApplyResult = { company_id: string; run_ref: string; integrity_id: number; rows: number; judged: number; changed: number; unknown: number; refused: number; ledger_failed: number; model_calls: Tally; outcomes: RowOutcome[] };

/** One transaction around a row's writes: a SAVEPOINT inside an outer probe transaction, BEGIN/COMMIT otherwise. */
export async function tx<T>(store: SweepStore, nested: boolean, fn: () => Promise<T>): Promise<T> {
  const s = store.session;
  if (nested) {
    await s.exec("savepoint r52_row;");
    try { const v = await fn(); await s.exec("release savepoint r52_row;"); return v; } catch (e) { await s.exec("rollback to savepoint r52_row;"); throw e; }
  }
  await s.exec("begin;");
  try { const v = await fn(); await s.exec("commit;"); return v; } catch (e) { await s.exec("rollback;"); throw e; }
}
/** p5: every row the executor is handed must be in the reviewed plan — checked for ALL rows before the first write. */
export function assertInPlan(rowIds: readonly string[], reviewedIds: ReadonlySet<string>): void {
  const out = rowIds.filter((id) => !reviewedIds.has(id));
  if (out.length) throw new SweepRefusedError("not_in_plan", `${out.length} row(s) not in the reviewed plan: ${out.slice(0, 3).join(", ")}`);
}
/** Every judge that answered for a row, in the audit row's field shape (judge_verdict / judge_entity / judge_reason /
 *  judge_model) — stored on EVERY stamp, so an unchanged or unknown row keeps the judge's full reason too (R52 batch-1
 *  ruling: the stamp on an unchanged row had kept only the authority's detail, never the reason). Empty when no judge ran. */
export type StampJudgment = { judge: JudgeName; judge_verdict: string; judge_entity: string | null; judge_reason: string; judge_model: string };
export function stampJudgments(d: Extract<VoiceClassDecision, { ok: true }>): StampJudgment[] {
  const j: StampJudgment[] = [];
  if (d.syndication && d.syndication.method === "local_llm") j.push({ judge: "band", judge_verdict: d.syndication.verdict, judge_entity: null, judge_reason: d.detail, judge_model: String(d.syndication.model ?? "unknown") });
  if (d.speaker) j.push({ judge: "speaker", judge_verdict: d.speaker.speaker_class, judge_entity: d.speaker.speaker_name, judge_reason: d.speaker.reason, judge_model: d.speaker.model });
  if (d.authorship_judge) j.push({ judge: "authorship", judge_verdict: d.authorship_judge.verdict, judge_entity: d.authorship_judge.entity, judge_reason: d.authorship_judge.reason, judge_model: d.authorship_judge.model });
  return j;
}
function auditFields(d: Extract<VoiceClassDecision, { ok: true }>): { verdict: string; entity: string | null; reason: string; model: string } {
  if (d.authority === "authorship_judge" && d.authorship_judge) return { verdict: d.authorship_judge.verdict, entity: d.authorship_judge.entity, reason: d.authorship_judge.reason, model: d.authorship_judge.model };
  if (d.speaker) return { verdict: d.speaker.speaker_class, entity: d.speaker.speaker_name, reason: d.speaker.reason, model: d.speaker.model };
  if (d.authority === "syndication" && d.syndication) return { verdict: "syndicated", entity: null, reason: d.detail, model: d.syndication.model ?? "deterministic" };
  return { verdict: d.authority, entity: null, reason: d.detail, model: "deterministic" };
}
/**
 * Apply one company: refusals first (by value, then plan-equals-reviewed, then every row in plan), then the integrity row
 * OPENED running before the first judge call, then one transaction per row (audit row then class write on a change;
 * the stamp on every row; r52_unknown with the class untouched on an undecidable row), then the row FINISHED with counts.
 */
export async function applyCompany(store: SweepStore, args: {
  group: { company_id: string; company: string; rows: ReviewedRow[] };
  runRef: string; reviewedMd5s: string[]; transports: Transports; nested: boolean;
  /** Probe seam only: the rows handed to the executor (defaults to the reviewed rows). */
  executeIds?: string[];
  log?: (s: string) => void;
}): Promise<ApplyResult> {
  const { group, runRef } = args;
  if (!runRef || !/^r52_/.test(runRef)) throw new SweepRefusedError("no_run_ref", "--run-ref=r52_<…> is required (one run_ref for the whole sweep; never defaulted)");
  const plan = await planCompany(store, group);
  if (plan.refused) throw new SweepRefusedError(plan.refused, `company ${group.company} refused: ${plan.refused}`);
  if (!plan.equal) {
    const bad = plan.rows.filter((r) => !r.equal);
    throw new SweepRefusedError("plan_mismatch", `plan ≠ reviewed for ${bad.length} row(s) of ${group.company}: ${bad.slice(0, 3).map((r) => `${r.signal_id.slice(0, 8)} ${r.why}`).join("; ")}`);
  }
  const reviewedIds = new Set(group.rows.map((r) => r.signal_id));
  const executeIds = args.executeIds ?? group.rows.map((r) => r.signal_id);
  assertInPlan(executeIds, reviewedIds);
  const [co] = await store.loadCompanies([group.company_id]);
  assertCompanyWritable(co, group.company_id);
  const ctx = await companyCtx(store, co);
  const eraOf = new Map(group.rows.map((r) => [r.signal_id, r.era]));
  const md5Before = await store.companySignalsMd5(group.company_id);
  const openedAt = new Date().toISOString();
  const integrityId = await store.openIntegrity({
    company_id: group.company_id, component: R52_COMPONENT, run_ref: runRef,
    excluded_by_rule: { mode: "apply", rules: R52_RULES, policy: R52_POLICY, run_ref: runRef, reviewed_md5: args.reviewedMd5s, rows_planned: executeIds.length, signals_md5_before: md5Before, opened_at: openedAt },
  });
  const tally = emptyTally();
  const base = ledgeredJudges(store, group.company_id, tally, args.transports);
  const outcomes: RowOutcome[] = [];
  let judged = 0;
  try {
    const sigs = new Map((await store.loadSignals(executeIds)).map((s) => [s.id, s]));
    for (const id of executeIds) {
      const s = sigs.get(id)!;
      const d = await deriveRow(store, ctx, s, eraOf.get(id) ?? "b3", base);
      if (d.calls.some(madeCall)) judged++;
      const callStr = callsString(d.calls);
      const unknownReasons = d.calls.map((c) => c.unknown).filter((x): x is string => !!x);
      const from = s.voice_class;
      const stampBase = { run_ref: runRef, rules: R52_RULES, policy: R52_POLICY, at: new Date().toISOString(), calls: d.calls.map((c) => ({ judge: c.judge, replayed: c.replayed, model: c.model, ...(c.nocall ? { nocall: true } : {}) })), basis: d.basis, ...(s.raw_payload === null ? { payload_was_null: true } : {}) };
      if (!d.decision.ok) {
        // keep_label never refuses; a refusal here would be an un-mint — the row is refused and NOTHING is written to it
        outcomes.push({ signal_id: id, kind: "refused", from, to: null, reason: `unmint_refused: ${d.decision.reason}`, calls: callStr });
        continue;
      }
      const dec = d.decision;
      const to = dec.voice_class;
      const stamp = { ...stampBase, authority: dec.authority, rule: dec.rule ?? null, detail: dec.detail, from, to: to ?? from, judgments: stampJudgments(dec) };
      if (to && to !== from && AUDITABLE.has(to)) {
        const a = auditFields(dec);
        await tx(store, args.nested, async () => {
          await store.insertAudit({ company_id: s.company_id, signal_id: id, run_ref: runRef, old_voice_class: from, new_voice_class: to, judge_verdict: a.verdict, judge_entity: a.entity, judge_reason: a.reason, judge_model: a.model, source_url: s.source_url });
          await store.writeSignal(id, runRef, { voice_class: to, raw_payload: { r52: stamp } });
        });
        outcomes.push({ signal_id: id, kind: "changed", from, to, reason: dec.detail, calls: callStr });
      } else if (unknownReasons.length > 0 || (to && to !== from && !AUDITABLE.has(to)) || (!to && from)) {
        const reason = unknownReasons.join("; ") || `the authority decided ${String(to)}, which this sweep does not restamp — the class stands`;
        await tx(store, args.nested, () => store.writeSignal(id, runRef, { raw_payload: { r52: { ...stamp, to: from }, r52_unknown: reason } }));
        outcomes.push({ signal_id: id, kind: "unknown", from, to: from, reason, calls: callStr });
      } else {
        await tx(store, args.nested, () => store.writeSignal(id, runRef, { raw_payload: { r52: stamp } }));
        outcomes.push({ signal_id: id, kind: "unchanged", from, to: from, reason: null, calls: callStr });
      }
      args.log?.(`${group.company} ${id.slice(0, 8)} ${outcomes[outcomes.length - 1].kind} ${from} → ${outcomes[outcomes.length - 1].to} [${callStr}]`);
    }
  } catch (e) {
    await store.finishIntegrity(integrityId, { status: "failed", examined: outcomes.length, admitted: outcomes.filter((o) => o.kind === "changed").length, excluded_by_rule: { mode: "apply", rules: R52_RULES, policy: R52_POLICY, run_ref: runRef, model_calls: tally, outcomes_so_far: outcomes.length, opened_at: openedAt, finished_at: new Date().toISOString(), signals_md5_before: md5Before }, error: String((e as Error).message).slice(0, 500) });
    throw e;
  }
  const count = (k: RowOutcome["kind"]) => outcomes.filter((o) => o.kind === k).length;
  const result: ApplyResult = { company_id: group.company_id, run_ref: runRef, integrity_id: integrityId, rows: outcomes.length, judged, changed: count("changed"), unknown: count("unknown"), refused: count("refused"), ledger_failed: tally.ledger_failed, model_calls: tally, outcomes };
  await store.finishIntegrity(integrityId, {
    status: "completed", examined: result.rows, admitted: result.changed,
    excluded_by_rule: { mode: "apply", rules: R52_RULES, policy: R52_POLICY, run_ref: runRef, reviewed_md5: args.reviewedMd5s, judged, changed: result.changed, unknown: result.unknown, refused: result.refused, ledger_failed: tally.ledger_failed, model_calls: tally, signals_md5_before: md5Before, opened_at: openedAt, finished_at: new Date().toISOString() },
  });
  return result;
}

// ── revert ────────────────────────────────────────────────────────────────────────────────────────────────────
export type RevertAuditWritten = { id: string; signal_id: string; old_voice_class: string | null; new_voice_class: string; judge_entity: string };
export type RevertResult = { run_ref: string; company_id: string; apply_integrity_id: number; apply_md5_before: string | null; audit_rows: number; restored: number; skipped: string[]; unstamped: number; md5_after: string; integrity_id: number; revert_audit: RevertAuditWritten[] };
/** Revert one company's rows of a run, from its audit rows: class back where it still holds the new value; audit marked;
 *  the r52 / r52_unknown keys removed from every row the run stamped. */
export async function revertCompany(store: SweepStore, args: { runRef: string; companyId: string }): Promise<RevertResult> {
  const [co] = await store.loadCompanies([args.companyId]);
  assertCompanyWritable(co, args.companyId);
  // THE REVERT RECORD (ruling 2026-10-20): one integrity row per revert, OPENED before the first write; one audit row of
  // the revert's own per restored row (old → new class, verdict/reason r52_revert, judge_entity apply_audit:<id> it
  // undoes) and per stamp removed from a row apply never changed (judge_entity stamp_only) — each written BEFORE its
  // restore / unstamp, which the store refuses without it. Runs inside the caller's transaction.
  const { runRef, companyId } = args;
  // the apply run this revert undoes: newest not yet reverted; named on the revert's own integrity row (refused if none)
  const applyRun = await store.applyRunToRevert(runRef, companyId);
  const md5Before = await store.companySignalsMd5(companyId);
  const audit = (await store.loadAudit(runRef, companyId)).filter((a) => !a.reverted_at);
  const stamped = await store.stampedRows(runRef, companyId);
  const cls = new Map(stamped.map((r) => [r.id, r]));
  for (const a of audit) if (!cls.has(a.signal_id)) { const [s] = await store.loadSignals([a.signal_id]); if (s) cls.set(s.id, { id: s.id, voice_class: s.voice_class, source_url: s.source_url }); }
  const openedAt = new Date().toISOString();
  const integrityId = await store.openIntegrity({ company_id: companyId, component: R52_COMPONENT, run_ref: runRef,
    excluded_by_rule: { mode: "revert", rules: R52_RULES, run_ref: runRef, apply_integrity_id: applyRun.id, apply_audit_rows: audit.length, stamped_rows: stamped.length, signals_md5_before: md5Before, opened_at: openedAt } });
  const written: RevertAuditWritten[] = [];
  const skipped: string[] = [];
  const recorded = new Set<string>();
  let restored = 0;
  const record = async (signalId: string, from: string | null, to: string, entity: string) => {
    const id = await store.insertAudit({ company_id: companyId, signal_id: signalId, run_ref: runRef, old_voice_class: from, new_voice_class: to, judge_verdict: R52_REVERT, judge_entity: entity, judge_reason: R52_REVERT, judge_model: "deterministic", source_url: cls.get(signalId)?.source_url ?? null });
    written.push({ id, signal_id: signalId, old_voice_class: from, new_voice_class: to, judge_entity: entity });
    recorded.add(signalId);
  };
  for (const a of audit) {
    if (cls.get(a.signal_id)?.voice_class !== a.new_voice_class) { skipped.push(a.signal_id); await store.markReverted(a.id); continue; }
    if (a.old_voice_class === null) throw new SweepRefusedError("revert_unrecordable", `audit ${a.id}: no old class to restore`);
    await record(a.signal_id, a.new_voice_class, a.old_voice_class, `apply_audit:${a.id}`);
    if (!(await store.restoreClass(a.signal_id, a.old_voice_class, a.new_voice_class, runRef, a.id))) throw new SweepRefusedError("unaudited_restore", `restore of ${a.signal_id} refused: no revert audit row of this revert undoes apply audit ${a.id}`);
    await store.markReverted(a.id);
    restored++;
  }
  for (const r of stamped) if (!recorded.has(r.id)) {
    if (r.voice_class === null) throw new SweepRefusedError("revert_unrecordable", `stamped row ${r.id} has no class to record`);
    await record(r.id, r.voice_class, r.voice_class, "stamp_only");
  }
  const unstamped = await store.unstamp(runRef, companyId);
  if (unstamped !== stamped.length) throw new SweepRefusedError("unaudited_unstamp", `unstamped ${unstamped} of ${stamped.length} stamped rows — a row without its revert audit row kept its stamp`);
  const md5After = await store.companySignalsMd5(companyId);
  await store.finishIntegrity(integrityId, { status: "completed", examined: stamped.length, admitted: restored,
    excluded_by_rule: { mode: "revert", rules: R52_RULES, run_ref: runRef, apply_integrity_id: applyRun.id, apply_audit_rows: audit.length, stamped_rows: stamped.length, restored, unstamped, skipped, revert_audit_ids: written.map((w) => w.id), signals_md5_before: md5Before, signals_md5_after: md5After, opened_at: openedAt, finished_at: new Date().toISOString() } });
  return { run_ref: runRef, company_id: companyId, apply_integrity_id: applyRun.id, apply_md5_before: applyRun.md5_before, audit_rows: audit.length, restored, skipped, unstamped, md5_after: md5After, integrity_id: integrityId, revert_audit: written };
}
