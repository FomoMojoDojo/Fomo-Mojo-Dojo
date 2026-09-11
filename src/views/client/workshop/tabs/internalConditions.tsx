// b-i CONDITIONS GATE — the sole sanctioned render path for job-step conditions, moved verbatim from
// JobMapOrgPanel.tsx (comp port 2a, 2026-09-11) so the workspace Job Map renders conditions through
// the SAME component. No logic change: the gate, the signed copy and the render are byte-identical
// (JobMapOrgPanel.parity.test.tsx proves the panel's output is unchanged). `admissibleStepConditions`
// is the component's own filter, exposed so a caller can count what will render.
import { D } from "@/components/design-system/tokens";

// ── Condition-builder honesty gate (b-i, operator-signed 2026-06-13) ──────────
// The former deriveInternalConditions mad-libbed a step's own prose (gap_note →
// description → evidence_basis → ownership → ODI phase) into canned assertions
// ("… is established", "… requirements are established", "Ownership of … is named
// and documented", "… is tracked and current", and 8 ODI-phase boilerplate
// sentences) rendered as the live "What must be true" panel. That is fabrication:
// a template-transformed assertion is NOT a model-authored condition. It also
// leaked internal run-tags (e.g. "Run_mojo_analysis:… is tracked and current").
//
// b-i removes the fabrication entirely. The only genuine source it drew from
// (gap_note) is already surfaced honestly elsewhere — the gap badge in the
// expanded detail and tileSignal on the tile — so nothing real is lost. A
// labeled best-guess condition is the generator's job (b-ii), never a template.
//
// What remains is the STANDING GATE below. assertNoCannedConditionString refuses
// the canned class (and the run-tag leak shape), and InternalConditions — the
// SOLE sanctioned path for rendering step conditions — routes every string
// through it, so a future generator (b-ii) cannot silently reintroduce garble:
// any conditions render MUST pass this gate.

// Canned/template assertion class produced by the removed builder. A string
// matching any of these is refused at the render boundary (dropped; loud in dev).
const CANNED_CONDITION_PATTERNS: RegExp[] = [
  /\b(?:is|are)\s+established\b/i,
  /requirements?\s+(?:are\s+established|(?:are\s+)?documented\s+before\s+the\s+step\s+begins)/i,
  /\bmust\s+be\s+confirmed\b/i,
  /\bis\s+named\s+and\s+documented\b/i,
  /\bis\s+tracked\s+and\s+current\b/i,
  /\bis\s+captured\s+before\s+decisions\s+are\s+made\b/i,
  // ODI-phase boilerplate stems:
  /can\s+state\s+what\s+a\s+successful\b/i,
  /\bis\s+documented,\s+not\s+held\s+by\s+one\s+person\b/i,
  /\bis\s+written\s+down,\s+not\s+assumed\b/i,
  /\bhas\s+the\s+authority\s+to\s+act\s+without\s+escalating\b/i,
  /\ba\s+named\s+signal\b|\bnot\s+a\s+gut\s+check\b/i,
  /\bgo\s+through\s+an\s+identified\s+reviewer\b/i,
  /\bhanded\s+off\s+in\s+a\s+form\s+the\s+next\s+step\s+can\s+use\b/i,
  /\bsomeone\s+updates\s+the\s+approach\s+based\s+on\s+what\s+happened\b/i,
];
// Internal run-tag leak shape (e.g. "run_mojo_analysis:2026-06-10",
// "dify_mojo_analysis:…") — never client-facing as a condition.
const RUN_TAG_CONDITION_PATTERN = /^\s*(?:run|dify)_mojo_analysis\s*:/i;

// Render-boundary guard: returns true if `s` is a canned/templated assertion or a
// run-tag leak that must NOT render as a condition. Throws loudly in dev so a
// regression is caught at the source; in prod it returns true and the caller
// drops the string (fail-closed, never render garble).
export function assertNoCannedConditionString(s: string): boolean {
  const str = String(s ?? "");
  const canned =
    RUN_TAG_CONDITION_PATTERN.test(str) ||
    CANNED_CONDITION_PATTERNS.some((re) => re.test(str));
  if (canned && import.meta.env?.DEV) {
    throw new Error(
      `[JobMapOrgPanel] Refused canned/templated condition string: ${JSON.stringify(str.slice(0, 120))}. ` +
        `Conditions must be model-authored, not template-substituted (b-i honesty gate).`,
    );
  }
  return canned;
}

// b-ii per-step condition entry (job_steps.conditions_json). status drives the copy
// tier; only "best_guess" is produced today, "real_source" reserved.
export type StepCondition = { condition: string; status?: string; origin?: string };

// Signed copy (B-II-3 operator signature).
const COND_COPY = {
  best_guess: {
    heading: "What must be true — a starting hypothesis",
    marker: "Hypothesis — not yet validated",
    subline: "A starting read from this step. Test it against evidence before relying on it.",
  },
  real_source: { heading: "What must be true" },
};

function ConditionsList({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
      {items.map((c, i) => (
        <p key={i} style={{ fontFamily: D.sans, fontSize: 13, color: D.ink, margin: 0, lineHeight: 1.55, display: "flex", gap: 8 }}>
          <span aria-hidden="true" style={{ color: D.inkFaint, flexShrink: 0 }}>•</span>
          <span>{c}</span>
        </p>
      ))}
    </div>
  );
}

// Sole sanctioned path for rendering step conditions — the b-i standing gate. Every
// string is filtered through assertNoCannedConditionString (canned/run-tag dropped,
// throws in dev). Branches on status tier; renders NOTHING when no admissible
// condition remains (hide tier — no empty heading). Mounted in the live
// renderStepDetail (the hierarchy detail), tile-independent styling.
export function admissibleStepConditions(entries: StepCondition[] | null | undefined): StepCondition[] {
  return (entries ?? []).filter(
    (e) => e && typeof e.condition === "string" && e.condition.trim() && !assertNoCannedConditionString(e.condition),
  );
}

export function InternalConditions({ entries }: { entries: StepCondition[] }) {
  const admissible = admissibleStepConditions(entries);
  if (admissible.length === 0) return null;
  const realSource = admissible.filter((e) => e.status === "real_source").map((e) => e.condition);
  const bestGuess = admissible.filter((e) => e.status !== "real_source").map((e) => e.condition);
  const headingStyle = { fontFamily: D.mono, fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: D.inkFaint, margin: 0 };

  return (
    <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${D.hairlineFaint}` }}>
      {realSource.length > 0 && (
        <div style={{ marginBottom: bestGuess.length > 0 ? 24 : 0 }}>
          <p style={headingStyle}>{COND_COPY.real_source.heading}</p>
          <ConditionsList items={realSource} />
        </div>
      )}
      {bestGuess.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <p style={headingStyle}>{COND_COPY.best_guess.heading}</p>
            <span style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "#b45309", background: "#fef9ec", border: "1px solid #f5d96b", borderRadius: 3, padding: "2px 7px" }}>
              {COND_COPY.best_guess.marker}
            </span>
          </div>
          <p style={{ fontFamily: D.sans, fontSize: 11.5, color: D.inkFaint, margin: "6px 0 0", lineHeight: 1.5, fontStyle: "italic" }}>
            {COND_COPY.best_guess.subline}
          </p>
          <ConditionsList items={bestGuess} />
        </div>
      )}
    </div>
  );
}
