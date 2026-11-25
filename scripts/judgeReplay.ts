// ── SP-652 (2026-11-24): THE JUDGE REPLAY — `--judge-from=<pairs.json>` ──────────────────────────
//
// WHY. `--apply` generated and judged again, so what it wrote was a NEW run, not the run whose kept
// pairs were hand checked (brief 19 section 5). `--gen-from` already replays the generator's saved
// answers; this replays the judge's saved verdicts, so `--gen-from` + `--judge-from` runs the whole
// runner with zero model calls and every decision downstream of the two (the vote, the strength, the
// representative, the ceiling flag, the not-stated list) is recomputed by the code that would write it.
//
// IT REFUSES RATHER THAN FALLING BACK. A replay that quietly judges something new, or reads a saved
// verdict against a different claim, part, quote or need wording, is the one thing it must not do.
// Every refusal is a `ReplayRefusal` with its own `kind`; the runner prints it and exits 1.
//
// Pure: no database, no model, no file system. The runner hands it the file's text and md5s.
import type { BelongsField, JudgeVerdict, PartVerdict } from "../supabase/functions/_shared/needPatterns.ts";

export type ReplayRefusalKind =
  | "file_md5_missing" | "file_md5" | "unreadable" | "no_pairs" | "prompt_md5" | "rubric" | "judge_model"
  | "duplicate_key" | "missing_key" | "claim_text" | "part_text" | "quote_text" | "voided_stored"
  | "unused_pairs" | "binding" | "binding_absent" | "ledger_prompt" | "live_call";
export class ReplayRefusal extends Error {
  constructor(public kind: ReplayRefusalKind, message: string) { super(message); this.name = "ReplayRefusal"; }
}

export type SavedPair = {
  need: string; pattern: string; pattern_identity: string; signal_id: string; quote: string;
  ordinal: number; part: string;
  judge_of_record: { model: string; states: boolean; span: string; reason: string; rejected: string };
  nomination_voided?: boolean;
  belongs_to_this_need: boolean; belongs_field: string; belongs_reason: string;
};
/** What a need's saved run rested on: the need row, its wording, and its counted quotes IN ORDER
 *  (the labels q1, q2 … are positions in this list, per polarity). */
export type NeedBinding = { need_id: string; wording_md5: string; counted_md5: string; counted: number };
export type SavedPairsFile = {
  judge_of_record?: string; judge_system_md5?: string; gen_system_md5?: string;
  rubric_version?: string; rubric_md5?: string;
  pairs?: SavedPair[]; bindings?: Record<string, NeedBinding>;
};
export type ReplayContext = {
  judgeSystemMd5: string; genSystemMd5: string; rubricVersion: string; rubricMd5: string; judgeModel: string;
};

const keyOf = (need: string, identity: string, signalId: string) => `${need}\u0000${identity}\u0000${signalId}`;

/** The text a need's binding is made of. One line per counted quote, in the order the runner holds them. */
export function bindingTexts(wording: string, quotes: ReadonlyArray<{ signalId: string; polarity: string | null; site: string; eventDate: string | null; quote: string }>): { wording: string; counted: string } {
  return { wording, counted: JSON.stringify(quotes.map((x) => [x.signalId, x.polarity, x.site, x.eventDate, x.quote])) };
}

export class JudgeReplay {
  readonly bindings: Record<string, NeedBinding> | null;
  readonly pairCount: number;
  private byKey = new Map<string, SavedPair[]>();
  private used = new Set<string>();

  /** `givenMd5` is what the operator typed on the command line; `actualMd5` is the md5 of `text`. */
  constructor(text: string, givenMd5: string, actualMd5: string, ctx: ReplayContext) {
    if (!givenMd5) throw new ReplayRefusal("file_md5_missing", `--judge-from needs --judge-from-md5=<md5 of the pairs file>; the file's md5 is ${actualMd5}`);
    if (givenMd5.toLowerCase() !== actualMd5.toLowerCase()) throw new ReplayRefusal("file_md5", `the pairs file's md5 is ${actualMd5}, the command line gave ${givenMd5}`);
    let f: SavedPairsFile;
    try { f = JSON.parse(text) as SavedPairsFile; }
    catch (e) { throw new ReplayRefusal("unreadable", `the pairs file is not JSON: ${e instanceof Error ? e.message : String(e)}`); }
    if (!Array.isArray(f.pairs) || f.pairs.length === 0) throw new ReplayRefusal("no_pairs", "the pairs file carries no pairs");
    if (f.judge_system_md5 !== ctx.judgeSystemMd5) throw new ReplayRefusal("prompt_md5", `the pairs were judged under judge prompt md5 ${f.judge_system_md5}; this run's is ${ctx.judgeSystemMd5}`);
    if (f.gen_system_md5 !== ctx.genSystemMd5) throw new ReplayRefusal("prompt_md5", `the pairs' claims were generated under prompt md5 ${f.gen_system_md5}; this run's is ${ctx.genSystemMd5}`);
    if (f.rubric_version !== ctx.rubricVersion || f.rubric_md5 !== ctx.rubricMd5) throw new ReplayRefusal("rubric", `the pairs were judged under rubric ${f.rubric_version} md5 ${f.rubric_md5}; this run's is ${ctx.rubricVersion} md5 ${ctx.rubricMd5}`);
    if (f.judge_of_record !== ctx.judgeModel) throw new ReplayRefusal("judge_model", `the pairs' judge of record is ${f.judge_of_record}; this run's is ${ctx.judgeModel}`);
    for (const p of f.pairs) {
      const k = keyOf(p.need, p.pattern_identity, p.signal_id);
      const rows = this.byKey.get(k) ?? this.byKey.set(k, []).get(k)!;
      if (rows.some((r) => r.ordinal === p.ordinal)) throw new ReplayRefusal("duplicate_key", `the pairs file carries part ${p.ordinal} of ${p.need} "${p.pattern.slice(0, 50)}" / ${p.signal_id.slice(0, 8)} twice`);
      rows.push(p);
    }
    this.pairCount = this.byKey.size;
    this.bindings = f.bindings ?? null;
  }

  /** The saved verdict of one (claim, quote) judge call. Refuses on a missing key, and on any mismatch
   *  of claim text, part text or quote text. `supports` and `notStated` are computed here from the
   *  per-part rows, as `parseJudgeOne` computes them — never read off the file. */
  verdict(a: { need: string; identity: string; signalId: string; claim: string; parts: readonly string[]; quote: string }): { verdict: JudgeVerdict; voided: boolean } {
    const k = keyOf(a.need, a.identity, a.signalId);
    const where = `${a.need} "${a.claim.slice(0, 50)}" / ${a.signalId.slice(0, 8)}`;
    const rows = this.byKey.get(k);
    if (!rows) throw new ReplayRefusal("missing_key", `the pairs file has no verdict for ${where} — a replay that judges something new is not a replay`);
    if (rows.length !== a.parts.length) throw new ReplayRefusal("part_text", `${where}: the saved run judged ${rows.length} part(s), this claim has ${a.parts.length}`);
    const parts: PartVerdict[] = [];
    for (let i = 0; i < a.parts.length; i++) {
      const r = rows.find((x) => x.ordinal === i + 1);
      if (!r) throw new ReplayRefusal("part_text", `${where}: the saved run has no verdict for part ${i + 1}`);
      if (r.pattern !== a.claim) throw new ReplayRefusal("claim_text", `${where}: the saved claim text is ${JSON.stringify(r.pattern)}`);
      if (r.part !== a.parts[i]) throw new ReplayRefusal("part_text", `${where}: part ${i + 1} is ${JSON.stringify(a.parts[i])}, the saved run judged ${JSON.stringify(r.part)}`);
      if (r.quote !== a.quote) throw new ReplayRefusal("quote_text", `${where}: the quote's text is not the text the saved run judged`);
      parts.push({ ordinal: i + 1, states: r.judge_of_record.states, span: r.judge_of_record.span, reason: r.judge_of_record.reason,
        rejected: r.judge_of_record.rejected as PartVerdict["rejected"] });
    }
    this.used.add(k);
    const notStated = a.parts.filter((_, i) => !parts[i].states);
    const first = rows[0];
    return {
      verdict: { supports: notStated.length === 0, parts, belongsToNeed: first.belongs_to_this_need,
        belongsField: first.belongs_field as BelongsField, reason: first.belongs_reason, notStated },
      voided: rows.some((r) => r.nomination_voided === true),
    };
  }

  /** Called where the runner is about to KEEP a verdict for storing. A pair the saved run marked as a
   *  voided nomination is never stored, whatever the runner decided this time. */
  assertStorable(need: string, identity: string, signalId: string): void {
    if ((this.byKey.get(keyOf(need, identity, signalId)) ?? []).some((r) => r.nomination_voided === true)) {
      throw new ReplayRefusal("voided_stored", `${need} / ${signalId.slice(0, 8)}: the saved run marked this pair as a voided nomination; it is never stored`);
    }
  }

  /** Saved pairs of `need` that this replay never asked for. A replay that reaches the end without
   *  using every saved verdict of the need did not retrace the saved run. */
  unused(need: string): SavedPair[] {
    const out: SavedPair[] = [];
    for (const [k, rows] of this.byKey) if (rows[0].need === need && !this.used.has(k)) out.push(rows[0]);
    return out;
  }
  assertAllUsed(need: string): void {
    const u = this.unused(need);
    if (u.length) throw new ReplayRefusal("unused_pairs", `${u.length} saved verdict(s) of ${need} were never asked for by the replay, first: "${u[0].pattern.slice(0, 50)}" / ${u[0].signal_id.slice(0, 8)}`);
  }

  /** The need's binding as the file records it, checked against today's. Returns "file" when the file
   *  carries one and it matches, "absent" when the file was written before bindings existed. */
  checkBinding(need: string, today: NeedBinding): "file" | "absent" {
    const b = this.bindings?.[need];
    if (!b) return "absent";
    if (b.need_id !== today.need_id) throw new ReplayRefusal("binding", `${need}: the saved run used need row ${b.need_id}; today's is ${today.need_id}`);
    if (b.wording_md5 !== today.wording_md5) throw new ReplayRefusal("binding", `${need}: the need's wording has changed since the saved run (md5 ${b.wording_md5} then, ${today.wording_md5} now)`);
    if (b.counted !== today.counted || b.counted_md5 !== today.counted_md5) throw new ReplayRefusal("binding", `${need}: the ordered counted-quote list has changed since the saved run (${b.counted} quotes md5 ${b.counted_md5} then, ${today.counted} md5 ${today.counted_md5} now)`);
    return "file";
  }
}

// ── BINDING A FILE WRITTEN BEFORE BINDINGS EXISTED: THE LEDGER ───────────────────────────────────
//
// Runs 12 and 13 were saved before `bindings` was written into the file, and neither file records the
// need's wording. What does record it is the ledger: every model call of the saved run wrote a
// `model_calls` row whose `prompt_sha` is md5(system + "\n" + user) of the prompt that was SENT. The
// generator's first prompt of a pass is the need's wording plus that pass's quotes in label order,
// each with its text; a judge prompt is the wording, the claim, its parts and the quote.
//
// So: the replay rebuilds every prompt from TODAY's rows — it has to, to run at all — and each one
// must be the prompt of a ledger row written inside the saved run's own time window. One row is
// consumed per prompt. A wording edit, a reordered or changed quote list, a changed quote text, claim
// or part gives a prompt no row of the saved run carries, and the replay refuses there.
export class LedgerProof {
  private left = new Map<string, number>();
  matched = { generator: 0, judge: 0 };
  /** `rows`: (role, prompt_sha) of the saved run's ledger rows, in its window. */
  constructor(rows: ReadonlyArray<{ role: "generator" | "judge"; sha: string }>, readonly window: string) {
    for (const r of rows) this.left.set(`${r.role}\u0000${r.sha}`, (this.left.get(`${r.role}\u0000${r.sha}`) ?? 0) + 1);
  }
  get rows(): number { let n = 0; for (const v of this.left.values()) n += v; return n + this.matched.generator + this.matched.judge; }
  consume(role: "generator" | "judge", sha: string, what: string): void {
    const k = `${role}\u0000${sha}`;
    const n = this.left.get(k) ?? 0;
    if (n < 1) throw new ReplayRefusal("ledger_prompt", `${what}: today's ${role} prompt (md5 ${sha}) is not a prompt the saved run sent in ${this.window} — the need's wording, its counted quotes or a claim has changed since`);
    this.left.set(k, n - 1);
    this.matched[role]++;
  }
}

// ── SP-656 (2026-11-24): ONE TRANSACTION PER NEED ────────────────────────────────────────────────
// The retire of a need's live patterns and the inserts of its new ones, as one begin … commit. The
// retire is FIRST inside it: the unique indexes on live patterns (one identity per need, one
// representative per need) are checked per statement, and a retire placed after the inserts would
// retire the rows just written. psql runs it with ON_ERROR_STOP, so an error at any statement ends
// the session before `commit` and the need's live set is exactly what it was.
export function applyNeedSql(retire: string, writes: readonly string[]): string {
  const stmt = (x: string) => x.trim().replace(/;+\s*$/, "");
  if (!/^update\s+public\.need_patterns\b/i.test(stmt(retire)) || !/superseded_at\s+is\s+null/i.test(retire)) {
    throw new Error("applyNeedSql: the retire statement must be an update of public.need_patterns limited to live rows");
  }
  return ["begin", stmt(retire), ...writes.map(stmt), "commit"].join(";\n") + ";";
}
