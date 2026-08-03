// G1 / G1-b — "Where you stand": the read-only recap of the client's OWN verdicts from
// their first meeting, for the returning client view. NOT mounted here (G2 mounts it).
// Sessionless: reads live activeCompany's first_read_responses via useMeetingVerdicts.
//
// G1-b: DEDUPE BY STATEMENT. A real client can verdict the same statement two ways (the
// comparisons it appears in differ). One row per distinct statement; when the verdicts on
// it CONFLICT, every distinct verdict's line is shown plus a signed conflict line — no
// verdict is dropped, none wins by order/recency. Market items get their own lines (the
// claim-shaped "After review, it stands" asserts a landing a market item lacks).
//
// Outcome lines are keyed by the recorded VERDICT (a per-response fact) — never by
// claim_contests.resolution_reason (operator voice, never client-facing; the hook does
// not fetch it). Known accepted gap: a rejection later STRUCK would still read "it
// stands" — the response→contest join does not exist in the schema; not attempted.

import { useMeetingVerdicts, type MeetingVerdict } from "@/hooks/useMeetingVerdicts";

// ── Client-facing copy — OPERATOR-SIGNED 2026-08-03 (G1 / G1-b) ──────────────
export const WYS_HEADER = "Where you stand";
export const WYS_SUB = "What you told us in the first meeting, and where each finding landed.";

// Non-market outcome lines (unchanged from G1).
export const WYS_OUTCOME: Readonly<Record<string, string>> = {
  confirmed: "You confirmed this.",
  rejected: "You pushed back on this. After review, it stands.",
  not_important: "You set this aside. We've de-emphasized it — it still counts.",
};
// Market outcome lines (G1-b) — claim-shaped landings don't apply to a market item.
export const WYS_MARKET_OUTCOME: Readonly<Record<string, string>> = {
  rejected: "You pushed back on this market.",
  not_important: "You set this market aside.",
};
// One signed conflict line, used for market and non-market alike (G1-b).
export const WYS_CONFLICT_LINE = "You saw this in more than one place and read it differently each time.";

// OC-3b: a query FAILURE is a distinct state from "no verdicts" — render it, never silent.
export const WYS_LOAD_ERROR = "Couldn't load what you told us — reload or check access.";
// ─────────────────────────────────────────────────────────────────────────────

// Fixed within-group order so no verdict wins by recency/input order.
const VERDICT_ORDER = ["confirmed", "rejected", "not_important"] as const;

/** The signed line for a (kind, verdict), or undefined when none is signed (e.g. a
 *  market-confirmed item, or a 'corrected' verdict — inventing copy is forbidden). */
export function outcomeLine(isMarket: boolean, verdict: string): string | undefined {
  return isMarket ? WYS_MARKET_OUTCOME[verdict] : WYS_OUTCOME[verdict];
}

export interface VerdictGroup {
  /** The statement, verbatim (edge whitespace is the ONLY thing collapsed for the key). */
  statement: string;
  isMarket: boolean;
  /** Distinct verdicts on this statement, in fixed order — never dropped, never ranked. */
  verdicts: string[];
  conflict: boolean;
}

/** Dedupe key: item_text with leading/trailing whitespace trimmed. Case + interior
 *  whitespace are PRESERVED, so two genuinely-different statements can never merge. */
function dedupeKey(statement: string): string {
  return statement.trim();
}

/** Pure grouping: one group per distinct statement; distinct verdicts collected. Order of
 *  groups is stable (by statement) so the render is deterministic. */
export function groupVerdicts(verdicts: MeetingVerdict[]): VerdictGroup[] {
  const byKey = new Map<string, { statement: string; kinds: Set<string>; verdicts: Set<string> }>();
  for (const v of verdicts) {
    const key = dedupeKey(v.statement);
    let g = byKey.get(key);
    if (!g) {
      g = { statement: v.statement, kinds: new Set(), verdicts: new Set() };
      byKey.set(key, g);
    }
    g.kinds.add(v.item_kind);
    g.verdicts.add(v.verdict);
  }
  return [...byKey.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, g]) => ({
      statement: g.statement,
      isMarket: [...g.kinds].every((k) => k === "market"),
      verdicts: [...g.verdicts].sort((a, b) => VERDICT_ORDER.indexOf(a as never) - VERDICT_ORDER.indexOf(b as never)),
      conflict: g.verdicts.size > 1,
    }));
}

const mono: React.CSSProperties = { fontFamily: '"IBM Plex Mono", ui-monospace, monospace' };

export default function WhereYouStand({ companyId }: { companyId: string | null }) {
  const { verdicts, isLoading, isError } = useMeetingVerdicts(companyId);

  if (isError) {
    return (
      <p style={{ ...mono, fontSize: 11, color: "#a4442f", margin: 0 }} role="status">
        {WYS_LOAD_ERROR}
      </p>
    );
  }

  const groups = groupVerdicts(verdicts);

  // DEFN-1 structural suppression: no verdicts → render NOTHING.
  if (isLoading || groups.length === 0) return null;

  return (
    <section className="cvs-act" aria-label="Where you stand — your first-meeting verdicts">
      <p style={{ ...mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.13em", color: "#9298B5", margin: "0 0 6px" }}>
        {WYS_HEADER}
      </p>
      <p style={{ fontSize: 12, color: "#6e847f", lineHeight: 1.5, margin: "0 0 16px", maxWidth: 560 }}>
        {WYS_SUB}
      </p>

      {groups.map((g) => (
        <div key={dedupeKey(g.statement)} data-wys="group" style={{ paddingLeft: 10, borderLeft: "2px solid rgba(30,51,64,0.12)", marginBottom: 14 }}>
          {/* The client's verdicted statement, UNCHANGED. */}
          <p data-wys="statement" style={{ fontFamily: "Georgia, serif", fontSize: 14, color: "#1e3340", lineHeight: 1.5, margin: 0 }}>
            {g.statement}
          </p>
          {/* One signed line per DISTINCT verdict (kind-appropriate). None dropped. */}
          {g.verdicts.map((vd) => {
            const line = outcomeLine(g.isMarket, vd);
            return line ? (
              <p key={vd} data-wys="outcome" style={{ ...mono, fontSize: 11, color: "#6e847f", margin: "5px 0 0" }}>
                {line}
              </p>
            ) : null;
          })}
          {/* Conflict line only when the client read it differently across places. */}
          {g.conflict && (
            <p data-wys="conflict" style={{ ...mono, fontSize: 11, color: "#8a6d1c", margin: "6px 0 0", fontStyle: "italic" }}>
              {WYS_CONFLICT_LINE}
            </p>
          )}
        </div>
      ))}
    </section>
  );
}
