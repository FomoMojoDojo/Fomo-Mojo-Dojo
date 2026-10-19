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
};

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
      chars: Number(get("chars")) || 0, at_cap: get("at_cap") === "t" || get("at_cap") === "true",
      blanked_rows: Number(get("blanked_rows")) || 0,
      blanked_signal_ids: get("blanked_signal_ids").split(",").map((s) => s.trim()).filter(Boolean),
      exclude: get("exclude"), exclude_rule: get("exclude_rule"),
    });
  }
  return out;
}

/** The rows one company's run takes: its name, and no R10 exclusion. */
export function planRowsFor(rows: readonly PlanRow[], companyName: string): { kept: PlanRow[]; excluded: PlanRow[]; other_companies: number } {
  const mine = rows.filter((r) => r.company === companyName);
  return {
    kept: mine.filter((r) => !r.exclude),
    excluded: mine.filter((r) => !!r.exclude),
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
