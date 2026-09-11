// OPERATOR RELEVANCE CONTROLS — Spare / Strike / Withdraw on the First Read gap beat (stage 3 of the
// durable relevance-override gate, signed 2026-09-03). LAW: client views never render operator
// controls. The gate is structural: every component here returns null unless OperatorControlsContext
// carries a value, and the ONLY provider is FirstReadPreviewView (admin preview route). Exports, the
// client story, and the presenter rail render the same acts with no provider → no controls.
//
// Placement (step 2, signed): the control sits in the pair's Source/Recency tag line and borrows the
// tag primitive (10px bold uppercase tracked; no icon, no rule). Struck pairs are omitted upstream
// from a statement's evidence, so Spare lives in an operator-only "struck by the machine" block under
// the statement, built from read.gapPairs (relevance 'orthogonal'). An operator-decided pair wears the
// provenance tag and Withdraw. Empty reason: Record stays inert and nothing is written.
import { createContext, useContext, useState } from "react";
import { Eyebrow, RecencyTag, SourceTag } from "./primitives";
import { formatFullDate } from "./deriveSourceTag";
import { formatMonthYear } from "./mapping";
import type { FRGapPair, FROwnWord } from "./types";
import { OPERATOR_MARK, OPERATOR_STRINGS, operatorKindLabel, operatorProvenanceLabel } from "./operatorStrings";
import type { RelevanceOverrideVerdict } from "./relevanceOverrideAction";

export type OperatorDecision = { pair: FRGapPair; verdict: RelevanceOverrideVerdict; reason: string };
export type OperatorControls = {
  /** Resolves once the override is written AND the surface has been asked to reload. */
  decide: (decision: OperatorDecision) => Promise<void>;
};

/** null = no operator on this surface (the default everywhere except the admin preview). */
export const OperatorControlsContext = createContext<OperatorControls | null>(null);
export function useOperatorControls(): OperatorControls | null {
  return useContext(OperatorControlsContext);
}

const TAG_STYLE = { color: "hsl(var(--fr-faint))" } as const;
const TAG_CLASS = "text-[10px] font-bold uppercase tracking-widest";

function isOperatorDecided(pair: FRGapPair): pair is FRGapPair & { relevanceVerdict: "relevant" | "orthogonal" } {
  return pair.relevanceProvider === "operator" && (pair.relevanceVerdict === "relevant" || pair.relevanceVerdict === "orthogonal");
}

/** "Operator · spared · September 3, 2026" — only on an operator-decided pair. */
export function OperatorProvenanceTag({ pair }: { pair: FRGapPair }) {
  if (!isOperatorDecided(pair)) return null;
  return (
    <span className={TAG_CLASS} style={TAG_STYLE} data-fr-operator-provenance={pair.relevanceVerdict}>
      {operatorProvenanceLabel(pair.relevanceVerdict, formatFullDate(pair.relevanceDecidedAt))}
    </span>
  );
}

type Action = "spare" | "strike" | "withdraw";
const VERDICT_FOR: Record<Action, RelevanceOverrideVerdict> = { spare: "relevant", strike: "orthogonal", withdraw: "withdrawn" };
const LABEL_FOR: Record<Action, string> = { spare: OPERATOR_STRINGS.spare, strike: OPERATOR_STRINGS.strike, withdraw: OPERATOR_STRINGS.withdraw };

/** One control: a tag-style button that opens the inline reason prompt; Record writes, Cancel closes. */
export function RelevanceControl({ pair, action }: { pair: FRGapPair; action: Action }) {
  const ctx = useOperatorControls();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  if (!ctx) return null;
  const trimmed = reason.trim();
  const submit = async () => {
    // Guard (c): an empty reason never reaches the write path.
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await ctx.decide({ pair, verdict: VERDICT_FOR[action], reason: trimmed });
      setOpen(false);
      setReason("");
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  if (!open) {
    return (
      <button
        type="button"
        className={`fr-op-control ${TAG_CLASS}`}
        style={TAG_STYLE}
        {...{ [OPERATOR_MARK.attr]: OPERATOR_MARK.controls }}
        data-fr-action={action}
        onClick={() => setOpen(true)}
      >
        {LABEL_FOR[action]}
      </button>
    );
  }
  return (
    <span
      className="fr-op-prompt flex flex-wrap items-center gap-3"
      {...{ [OPERATOR_MARK.attr]: OPERATOR_MARK.controls }}
      data-fr-action={action}
      data-fr-prompt="open"
    >
      <label className={TAG_CLASS} style={TAG_STYLE}>
        {OPERATOR_STRINGS.reasonEyebrow}
      </label>
      <input
        type="text"
        className="fr-op-reason min-w-[18rem] border-b bg-transparent px-0 py-1 text-sm font-light outline-none"
        style={{ borderColor: "hsl(var(--fr-hair))" }}
        placeholder={OPERATOR_STRINGS.reasonPlaceholder}
        value={reason}
        autoFocus
        disabled={busy}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); void submit(); }
          if (e.key === "Escape") { setOpen(false); setReason(""); }
        }}
      />
      <button
        type="button"
        className={`fr-op-control ${TAG_CLASS}`}
        style={TAG_STYLE}
        data-fr-record
        disabled={trimmed.length === 0 || busy}
        aria-disabled={trimmed.length === 0 || busy}
        onClick={() => void submit()}
      >
        {OPERATOR_STRINGS.record}
      </button>
      <button
        type="button"
        className={`fr-op-control ${TAG_CLASS}`}
        style={TAG_STYLE}
        data-fr-cancel
        disabled={busy}
        onClick={() => { setOpen(false); setReason(""); setFailure(null); }}
      >
        {OPERATOR_STRINGS.cancel}
      </button>
      {failure ? <span className="text-xs font-light" style={{ color: "hsl(var(--fr-muted))" }}>{failure}</span> : null}
    </span>
  );
}

/** Tag-line fragment for an ACTIVE (rendered) pair: Strike, or provenance + Withdraw when operator-spared. */
export function OperatorPairMeta({ pair }: { pair: FRGapPair }) {
  const ctx = useOperatorControls();
  if (!ctx) return null;
  if (isOperatorDecided(pair)) {
    return (
      <>
        <OperatorProvenanceTag pair={pair} />
        <RelevanceControl pair={pair} action="withdraw" />
      </>
    );
  }
  return <RelevanceControl pair={pair} action="strike" />;
}

/** The machine's reason line on a struck pair: "Router · <reason>" / "Judge · <stored reason>". */
function machineReason(pair: FRGapPair): string | null {
  if (!pair.relevanceReason) return null;
  const prefix = pair.relevanceModel === "router" ? OPERATOR_STRINGS.routerPrefix : OPERATOR_STRINGS.judgePrefix;
  return `${prefix}${pair.relevanceReason}`;
}

/** Operator-only block under a statement: the pairs the machine (or the operator) struck, each with Spare
 *  (machine-struck) or provenance + Withdraw (operator-struck). Renders nothing without the context or
 *  with no struck pairs. */
export function StruckPairsBlock({ pairs }: { pairs: FRGapPair[] }) {
  const ctx = useOperatorControls();
  if (!ctx || pairs.length === 0) return null;
  return (
    <div className="fr-op-struck mt-8 flex flex-col gap-6" {...{ [OPERATOR_MARK.attr]: OPERATOR_MARK.struck }}>
      <Eyebrow>{OPERATOR_STRINGS.struckBlockEyebrow}</Eyebrow>
      {pairs.map((pair) => {
        const recency = formatMonthYear(pair.eventDate);
        const reason = machineReason(pair);
        return (
          <div key={pair.id} data-fr-struck-pair={pair.id}>
            <div className="mb-3 flex flex-wrap items-center gap-4">
              {pair.sourceTag ? <SourceTag>{pair.sourceTag.label}</SourceTag> : null}
              {recency ? <RecencyTag>{recency}</RecencyTag> : null}
              {isOperatorDecided(pair) ? (
                <>
                  <OperatorProvenanceTag pair={pair} />
                  <RelevanceControl pair={pair} action="withdraw" />
                </>
              ) : (
                <RelevanceControl pair={pair} action="spare" />
              )}
            </div>
            {!isOperatorDecided(pair) && reason ? (
              <p className="mb-2 text-xs font-light" style={{ color: "hsl(var(--fr-faint))" }}>{reason}</p>
            ) : null}
            {pair.record ? (
              <p className="text-lg font-light leading-relaxed" style={{ color: "hsl(var(--fr-faint))" }}>
                {pair.record}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Convenience for the beat: struck pairs grouped by statement id (relevance 'orthogonal' only). */
export function struckPairsByStatement(pairs: FRGapPair[]): Map<string, FRGapPair[]> {
  const out = new Map<string, FRGapPair[]>();
  for (const p of pairs) {
    if (p.relevanceVerdict !== "orthogonal") continue;
    const list = out.get(p.statementId);
    if (list) list.push(p); else out.set(p.statementId, [p]);
  }
  return out;
}


/** OWN-WORDS ADMISSION (2026-09-03): own words kept as RECORD but never shown to the client (instruction /
 *  policy / recruiting / other). Operator view only — null without the context. Rendered under "In your
 *  words" so the operator sees what the criterion declined, with the judged kind. */
/** Gate 9a — "{n} pairs looked, unverifiable with the cited span": one mono line, operator-only. The count
 *  is the integrity record's (claim_delta_looks via integrity_runs), never the rejection cache's. Null
 *  outside the admin preview and when nothing was looked. */
export function OperatorLooksLine({ pairsLooked }: { pairsLooked: number }) {
  const ctx = useOperatorControls();
  if (!ctx || pairsLooked <= 0) return null;
  return (
    <p className="fr-tag fr-mono mt-8" data-testid="operator-looks-line" {...{ [OPERATOR_MARK.attr]: OPERATOR_MARK.looks }}>
      {OPERATOR_STRINGS.looksLine(pairsLooked)}
    </p>
  );
}

export function OwnWordsRecordBlock({ words }: { words: FROwnWord[] }) {
  const ctx = useOperatorControls();
  if (!ctx || words.length === 0) return null;
  return (
    <div className="fr-op-record mt-12 flex flex-col gap-6" {...{ [OPERATOR_MARK.attr]: "record-only" }}>
      <Eyebrow>{OPERATOR_STRINGS.recordOnlyEyebrow}</Eyebrow>
      {words.map((w) => (
        <div key={w.id} data-fr-record-only={w.id}>
          <div className="mb-2 flex flex-wrap items-center gap-4">
            {w.sourceTag ? <SourceTag>{w.sourceTag.label}</SourceTag> : null}
            <OperatorKindTag kind={w.kind ?? null} reason={w.reason ?? null} />
          </div>
          <p className="text-lg font-light leading-relaxed" style={{ color: "hsl(var(--fr-faint))" }}>{w.quote}</p>
        </div>
      ))}
    </div>
  );
}

/** R2 (2026-09-04): beat 3 — no own-words run exists for this company (no COMPLETED first_read_own_words
 *  record). The client sees NO copy for this state; the operator sees one line behind the glyph toggle.
 *  Null without the context or when a run exists. */
export function OwnWordsNotRunNote({ run }: { run: boolean }) {
  const ctx = useOperatorControls();
  if (!ctx || run) return null;
  return (
    <p className={`fr-op-not-ready ${TAG_CLASS}`} style={TAG_STYLE} {...{ [OPERATOR_MARK.attr]: OPERATOR_MARK.notMeetingReady }}>
      {OPERATOR_STRINGS.notMeetingReadyOwnWords}
    </p>
  );
}

/** OPERATOR KIND LABEL (2026-09-04): one tag-style line beside a row's source tag — the judged kind and, when an
 *  audit reason exists (own_words_retypes), the reason. Operator view only — null without the context. Rendered
 *  on every own-words row and every channel row (and inside the record-only block). */
export function OperatorKindTag({ kind, reason }: { kind: string | null; reason: string | null }) {
  const ctx = useOperatorControls();
  if (!ctx) return null;
  return (
    <span className={TAG_CLASS} style={TAG_STYLE} {...{ [OPERATOR_MARK.attr]: OPERATOR_MARK.kindLabel }} data-fr-kind={kind ?? ""}>
      {operatorKindLabel(kind, reason)}
    </span>
  );
}

/** Gate 4b — the judge's VERBATIM clause under an unstated group. OPERATOR ONLY: the client sub-line
 *  carries the signed plain-words string instead, because these clauses are written for a machine
 *  gate and read as accusations on a client surface ("names 'machine-readable system' which is a key
 *  feature of Brand AI's product"). Structural gate, like every control here: no provider, no render. */
export function OperatorUnstatedReason({ reason, reconstructed, criterionVersion, stale }: {
  reason: string | null; reconstructed: boolean; criterionVersion?: number; stale?: boolean;
}) {
  const ctx = useOperatorControls();
  if (!ctx || !reason) return null;
  return (
    <p className={TAG_CLASS} style={{ ...TAG_STYLE, textTransform: "none", letterSpacing: "0.04em", marginTop: "0.4rem" }}>
      {criterionVersion ? `CRITERION v${criterionVersion}${stale ? " (stale — not yet re-judged)" : ""} · ` : ""}
      {`JUDGE: ${reason}`}
      {reconstructed ? " · RECONSTRUCTED" : ""}
    </p>
  );
}

/** Gate E1 — the market pass's integrity state, OPERATOR ONLY. The client sees nothing when no group
 *  was set aside; the operator still needs to know whether that means "we looked and everything could
 *  be stated in their terms", "we could not finish", or "this snapshot's pass never ran". */
export function OperatorUnstatedState({ state }: { state: "not_yet" | "looked_none" | "couldnt_check" }) {
  const ctx = useOperatorControls();
  if (!ctx) return null;
  const LINES: Record<typeof state, string> = {
    not_yet: "Not read yet — this snapshot's market pass hasn't run.",
    looked_none: "Every group we saw could be stated in your customers' terms.",
    couldnt_check: "Couldn't finish this read — nothing is hidden, there's just nothing to show yet.",
  };
  return (
    <p className={TAG_CLASS} style={{ ...TAG_STYLE, textTransform: "none", letterSpacing: "0.04em", marginTop: "1.5rem" }}>
      {`OTHER GROUPS: ${LINES[state]}`}
    </p>
  );
}
