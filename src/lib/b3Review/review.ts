// ── b3 REVIEW PATH — the pure rules (R11, operator ruling 2026-10-18) ───────────────────────────
//
// Three runners share these rules and none of them re-derives one:
//   scripts/first-read-outside-recrawl.ts --from-snapshots   plan file → review rows (no fetch, no model)
//   scripts/b3-review-notion-push.ts                         review rows → one Notion page per URL
//   scripts/b3-review-decide.ts                              Notion Verdict → operator_decision (compare-and-set)
//
// They live under src/lib so vitest covers them (vitest collects src/** only; scripts/ is not run).

export type PlanRow = {
  company: string;
  url: string;
  snapshot_id: string;
  chars: number;
  at_cap: boolean;
  blanked_rows: number;
  blanked_signal_ids: string[];
  /** "" when the row is in scope; json / script_shell / thin_shell when R10 excludes it. */
  exclude: string;
  exclude_rule: string;
  /** R20 (b3plan-r20.tsv): true when the URL is in the R20 set; null when the file has no r20 column (b3plan.tsv,
   *  b3plan-r10.tsv). The column is written as t/f; "true"/"false" and 1/0 read the same. */
  r20: boolean | null;
  /** R20's reason when the row is out of the set ("R20:no_outside_voice_row"); "" otherwise or when absent. */
  exclude_r20: string;
};

/** The one reading of a plan file's boolean columns: t / true / 1 are true; f / false / 0 / "" are false. */
export function planBool(v: string): boolean {
  const t = v.trim().toLowerCase();
  return t === "t" || t === "true" || t === "1";
}

/** Why a plan row is out of scope, or "" when it is in: the R10 content class first, then R20's reason, then a
 *  bare r20=f with no reason given. Every reader of the plan goes through this, not through `exclude` alone. */
export function planExcludeOf(r: Pick<PlanRow, "exclude" | "exclude_r20" | "r20">): string {
  if (r.exclude) return r.exclude;
  if (r.exclude_r20) return r.exclude_r20;
  if (r.r20 === false) return "R20:not_in_set";
  return "";
}

export const PLAN_EXCLUDE_CLASSES = ["json", "script_shell", "thin_shell", "person_profile"] as const;

// ── R15 (operator ruling 2026-10-18): PERSONAL-PROFILE URLs ARE OUT OF b3 until a rule is signed ───────
// A person's own profile page carries that person's words (often the company's own copy, when the person
// is staff); no authority on the regen path classes it, and the aggregator gate excludes person pages by
// design. Host and path shapes that are a PERSON's page, not a company's:
export const PERSON_PROFILE_PATTERNS: ReadonlyArray<{ host: string; path: RegExp; rule: string }> = [
  { host: "linkedin.com", path: /^\/in\//i, rule: "linkedin.com/in/ — a member profile" },
  { host: "linkedin.com", path: /^\/pub\//i, rule: "linkedin.com/pub/ — a legacy member profile" },
  { host: "crunchbase.com", path: /^\/person\//i, rule: "crunchbase.com/person/ — a person entry" },
  { host: "zoominfo.com", path: /^\/p\//i, rule: "zoominfo.com/p/ — a person entry" },
  { host: "signalhire.com", path: /^\/profiles\//i, rule: "signalhire.com/profiles/ — a person entry" },
  { host: "apollo.io", path: /^\/people\//i, rule: "apollo.io/people/ — a person entry" },
];
/** The R15 rule that fires for a URL, or null when it is not a personal profile. */
export function personProfileRule(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  for (const p of PERSON_PROFILE_PATTERNS) {
    if ((host === p.host || host.endsWith(`.${p.host}`)) && p.path.test(u.pathname || "/")) return p.rule;
  }
  return null;
}

/** Parse the plan TSV (b3plan.tsv or b3plan-r10.tsv). The header names the columns; order is not assumed.
 *  A file without the exclude column (b3plan.tsv) reads every row as in scope. */
export function parsePlanTsv(text: string): PlanRow[] {
  const lines = text.split("\n").filter((l) => l.includes("\t"));
  if (lines.length === 0) return [];
  const header = lines[0].split("\t");
  const col = (name: string) => header.indexOf(name);
  const need = ["company", "url", "snapshot_id", "chars", "at_cap", "blanked_rows", "blanked_signal_ids"];
  for (const n of need) if (col(n) < 0) throw new Error(`plan file: missing column ${n}`);
  const out: PlanRow[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split("\t");
    if (f.length < header.length - 2) continue;
    const get = (name: string) => (col(name) >= 0 ? (f[col(name)] ?? "") : "");
    out.push({
      company: get("company"), url: get("url"), snapshot_id: get("snapshot_id"),
      chars: Number(get("chars")) || 0, at_cap: planBool(get("at_cap")),
      blanked_rows: Number(get("blanked_rows")) || 0,
      blanked_signal_ids: get("blanked_signal_ids").split(",").map((s) => s.trim()).filter(Boolean),
      exclude: get("exclude"), exclude_rule: get("exclude_rule"),
      r20: col("r20") >= 0 ? planBool(get("r20")) : null, exclude_r20: get("exclude_r20"),
    });
  }
  return out;
}

/** The rows one company's run takes: its name, and no exclusion — R10's class or R20's set (planExcludeOf). */
export function planRowsFor(rows: readonly PlanRow[], companyName: string): { kept: PlanRow[]; excluded: PlanRow[]; other_companies: number } {
  const mine = rows.filter((r) => r.company === companyName);
  return {
    kept: mine.filter((r) => !planExcludeOf(r)),
    excluded: mine.filter((r) => !!planExcludeOf(r)),
    other_companies: rows.length - mine.length,
  };
}

// ── Notion ───────────────────────────────────────────────────────────────────────────────────────
/** The review database schema, by property name. URL is the title (one title per database; the URL is the
 *  row's identity). Verdict is a select with exactly these two options; Comment is free text. */
export const REVIEW_DB_PROPERTIES = {
  url: "URL", company: "Company", snapshot_id: "Snapshot id", chars: "Chars", at_cap: "At cap",
  blanked_rows: "Blanked rows", verdict: "Verdict", comment: "Comment", review_row_id: "Review row id",
} as const;
export const VERDICT_OPTIONS = ["Approve", "Reject"] as const;
export type Verdict = typeof VERDICT_OPTIONS[number];

export type ReviewPagePlan = {
  company: string; url: string; snapshot_id: string; chars: number; at_cap: boolean; blanked_rows: number;
  /** The outside_recrawl_review.id the page will carry; null until --from-snapshots --write has run. */
  review_row_id: string | null;
};

/** The Notion page properties for one review row — the exact payload shape the push sends. */
export function notionPageProperties(p: ReviewPagePlan): Record<string, unknown> {
  const P = REVIEW_DB_PROPERTIES;
  return {
    [P.url]: { title: [{ text: { content: p.url } }] },
    [P.company]: { rich_text: [{ text: { content: p.company } }] },
    [P.snapshot_id]: { rich_text: [{ text: { content: p.snapshot_id } }] },
    [P.chars]: { number: p.chars },
    [P.at_cap]: { checkbox: p.at_cap },
    [P.blanked_rows]: { number: p.blanked_rows },
    [P.review_row_id]: { rich_text: [{ text: { content: p.review_row_id ?? "" } }] },
    // Verdict and Comment are the operator's: created empty, never written by the push.
  };
}

const dashless = (id: string) => String(id ?? "").replace(/-/g, "").toLowerCase();

/** The Client Portals database and its data source (scripts/notion-client-sync). The b3 scripts may NEVER
 *  address them — not by argument, not by env: a review push landing in the client-portal table is the
 *  one misdirection no allow-list check downstream can undo. Refused by VALUE, before any other check. */
export const CLIENT_PORTALS_IDS: ReadonlyArray<string> = [
  "75df0a3f617182c6beb101a61c145212",   // database
  "31af0a3f617183a09da887337f0ffc6d",   // data source
];
export function refuseClientPortals(kind: "database" | "data source", id: string | null | undefined): void {
  const d = dashless(id ?? "");
  if (d && CLIENT_PORTALS_IDS.includes(d)) throw new Error(`REFUSED: ${kind} ${d.slice(0, 8)}… is the Client Portals ${kind} — the b3 review scripts never address it, whatever the env says`);
}

/** THE allow-list: the push may address ONE database, the one the operator named in the env. Any other id —
 *  including an unset allow-list — is refused before a token is read. The Client Portals ids are refused first. */
export function assertAllowedDatabase(requested: string | null | undefined, allowed: string | null | undefined): string {
  refuseClientPortals("database", requested);
  refuseClientPortals("database", allowed);
  const a = dashless(allowed ?? "");
  const r = dashless(requested ?? "");
  if (!a) throw new Error("REFUSED: no review database is allow-listed (B3_REVIEW_NOTION_DATABASE_ID is unset)");
  if (!r) throw new Error("REFUSED: no database id requested");
  if (a !== r) throw new Error(`REFUSED: database ${r.slice(0, 8)}… is not the allow-listed review database ${a.slice(0, 8)}…`);
  return a;
}
/** The data source the scripts query and create pages under — ONE, from the env; the Client Portals data source is refused by value. */
export function assertAllowedDataSource(allowed: string | null | undefined): string {
  refuseClientPortals("data source", allowed);
  const a = dashless(allowed ?? "");
  if (!a) throw new Error("REFUSED: no review data source is allow-listed (B3_REVIEW_NOTION_DATA_SOURCE_ID is unset)");
  return a;
}

// ── Decide: compare-and-set ──────────────────────────────────────────────────────────────────────
export type ReviewRowState = { id: string; operator_decision: string | null; decided_by: string | null; notion_page_id?: string | null };
export type DecisionInput = { page_id: string; review_row_id: string; verdict: string | null; comment?: string | null };
export type DecisionPlan =
  | { action: "write"; review_row_id: string; page_id: string; decision: "approve" | "reject"; reason: string }
  | { action: "noop"; review_row_id: string; page_id: string; reason: string }
  | { action: "refuse"; review_row_id: string; page_id: string; reason: string };

export function decisionOfVerdict(v: string | null | undefined): "approve" | "reject" | null {
  if (v === "Approve") return "approve";
  if (v === "Reject") return "reject";
  return null;
}

/** One page's verdict against the row as it stands. A row already decided DIFFERENTLY is refused, never
 *  overwritten: changing a decision is a new ruling, not a sync. An undecided verdict is a no-op. */
export function decideCompareAndSet(row: ReviewRowState | null, input: DecisionInput): DecisionPlan {
  const base = { review_row_id: input.review_row_id, page_id: input.page_id };
  if (!row) return { action: "refuse", ...base, reason: "no review row with this id under this company and run" };
  const want = decisionOfVerdict(input.verdict);
  if (!want) return { action: "noop", ...base, reason: `Verdict is ${input.verdict ? JSON.stringify(input.verdict) : "empty"} — not decided yet` };
  if (row.operator_decision == null) return { action: "write", ...base, decision: want, reason: "row undecided; verdict set" };
  if (row.operator_decision === want) {
    if (row.notion_page_id && row.notion_page_id !== input.page_id) return { action: "refuse", ...base, reason: `row already decided ${want} from a different Notion page ${row.notion_page_id}` };
    return { action: "noop", ...base, reason: `already ${want}` };
  }
  return { action: "refuse", ...base, reason: `row already decided ${row.operator_decision} (by ${row.decided_by ?? "?"}); verdict says ${want} — a changed decision is refused, not applied` };
}

export function planDecisions(inputs: readonly DecisionInput[], rowsById: ReadonlyMap<string, ReviewRowState>): DecisionPlan[] {
  return inputs.map((i) => decideCompareAndSet(rowsById.get(i.review_row_id) ?? null, i));
}

// ── R18 (operator ruling 2026-10-18): THE SYSTEM DECIDES b3 REVIEW ROWS BY RULE ───────────────────────
//
// For the outside read the operator never has to review items. A b3_from_snapshot row is APPROVED when its
// basis is the newest ok snapshot of its URL, the snapshot's shape is html text, and nothing excludes it
// (R10 content classes, R15 person profile); otherwise REJECTED with the rule named. decided_by carries the
// rules version. An OPERATOR decision is an override: it always wins, a system decision never overwrites it,
// and an operator override of a system decision is allowed and audited (from, to, by).
export const RULES_VERSION = "b3-rules-1";
export const SYSTEM_DECIDER = `system:${RULES_VERSION}`;
export const OPERATOR_DECIDER = "operator";
export function isSystemDecider(by: string | null | undefined): boolean {
  return /^system:b3-rules-/.test(String(by ?? ""));
}

export type ContentShape = "html_text" | "json" | "script_shell" | "thin_shell";
/** The plan file's content-shape heuristic, on the snapshot text itself — so the decider needs no plan file. */
export function contentShape(text: string): { shape: ContentShape; detail: string } {
  const t = String(text ?? "");
  const chars = t.length;
  if (/^\s*[\[{]/.test(t)) return { shape: "json", detail: "clean_text starts with { or [" };
  const punct = (t.match(/[{}\[\]":,]/g) ?? []).length;
  const ratio = chars ? punct / chars : 0;
  if (ratio > 0.08) return { shape: "json", detail: `JSON punctuation ${(ratio * 100).toFixed(1)}% of chars (> 8%)` };
  const codeMarks = (t.match(/(function\s*\(|window\.|document\.|var |const |=>|\{\s*"[a-zA-Z_]+"\s*:)/g) ?? []).length;
  const sentences = (t.match(/[.!?]\s+[A-Z]/g) ?? []).length;
  if (codeMarks >= 8 && sentences < 5) return { shape: "script_shell", detail: `code marks ${codeMarks} (>= 8) and sentences ${sentences} (< 5)` };
  if (sentences === 0 && chars < 400) return { shape: "thin_shell", detail: `no sentence and ${chars} chars (< 400)` };
  return { shape: "html_text", detail: `${sentences} sentences, ${codeMarks} code marks, ${chars} chars` };
}

export type SystemRuleInput = {
  disposition: string;
  url: string;
  /** the row's baseline sha equals the newest ok snapshot's sha for its URL */
  basis_is_newest_ok: boolean;
  /** the newest ok snapshot's text (shape is decided here) */
  snapshot_text: string | null;
  /** the plan file's exclusion for this URL when a plan is given — planExcludeOf: an R10 class or an R20 reason
   *  ("" when in scope; null when no plan) */
  plan_exclude: string | null;
};
export type SystemRuleResult = { decision: "approve" | "reject"; rule: string; detail: string };

/** THE rule. Pure; the order is the order of the refusals an operator would want named first. */
export function systemRule(i: SystemRuleInput): SystemRuleResult {
  if (i.disposition !== "b3_from_snapshot") return { decision: "reject", rule: "scope:disposition", detail: `disposition ${i.disposition} is outside R18's scope (b3_from_snapshot only)` };
  const pp = personProfileRule(i.url);
  if (pp) return { decision: "reject", rule: "R15:person_profile", detail: pp };
  if (i.plan_exclude) {
    return i.plan_exclude.startsWith("R20:")
      ? { decision: "reject", rule: i.plan_exclude, detail: "outside the plan file's R20 set" }
      : { decision: "reject", rule: `R10:${i.plan_exclude}`, detail: "excluded by the plan file's content class" };
  }
  if (!i.basis_is_newest_ok) return { decision: "reject", rule: "basis:not_newest_ok", detail: "the row's baseline sha is not the newest ok snapshot of its URL" };
  if (i.snapshot_text == null || !i.snapshot_text.trim()) return { decision: "reject", rule: "basis:no_snapshot_text", detail: "no snapshot text to read" };
  const s = contentShape(i.snapshot_text);
  if (s.shape !== "html_text") return { decision: "reject", rule: `R10:${s.shape}`, detail: s.detail };
  return { decision: "approve", rule: "html_text:newest_ok", detail: s.detail };
}

export type Decider = "operator" | "system";
export type ProposedDecision = { decision: "approve" | "reject"; by: Decider; /** the Notion page or "--operator" when by = operator */ source?: string | null };
export type PrecedencePlan =
  | { action: "write"; decision: "approve" | "reject"; decided_by: string; reason: string }
  | { action: "override"; decision: "approve" | "reject"; decided_by: string; from: { decision: string; by: string }; reason: string }
  | { action: "noop"; reason: string }
  | { action: "refuse"; reason: string };

/** PRECEDENCE. An operator decision always wins; the system never overwrites one; the operator may override the
 *  system (audited); the system never changes its own earlier decision (a changed rule outcome needs an operator);
 *  an operator changing an operator decision is refused (R11's compare-and-set stands). */
export function applyPrecedence(existing: { operator_decision: string | null; decided_by: string | null }, proposed: ProposedDecision): PrecedencePlan {
  const by = proposed.by === "system" ? SYSTEM_DECIDER : OPERATOR_DECIDER;
  const cur = existing.operator_decision;
  if (cur == null) return { action: "write", decision: proposed.decision, decided_by: by, reason: `row undecided; ${proposed.by} decides ${proposed.decision}` };
  const curBy = String(existing.decided_by ?? "");
  const curIsSystem = isSystemDecider(curBy);
  if (proposed.by === "system") {
    if (!curIsSystem) return { action: "noop", reason: `operator decision ${cur} stands; the system never overwrites it` };
    if (cur === proposed.decision) return { action: "noop", reason: `already ${cur} by ${curBy}` };
    return { action: "noop", reason: `system decision ${cur} (${curBy}) stands; the rules now say ${proposed.decision} — a changed outcome needs an operator` };
  }
  // operator
  if (curIsSystem) {
    if (cur === proposed.decision) return { action: "noop", reason: `already ${cur} by ${curBy}; the operator agrees` };
    return { action: "override", decision: proposed.decision, decided_by: by, from: { decision: cur, by: curBy }, reason: `operator overrides the system's ${cur}` };
  }
  if (cur === proposed.decision) return { action: "noop", reason: `already ${cur} by operator` };
  return { action: "refuse", reason: `row already decided ${cur} by operator; a changed decision is refused, not applied` };
}
