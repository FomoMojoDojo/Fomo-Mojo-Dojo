// First Read — the pages, rendering REAL data with persisted-
// integrity empty states. Ported from mojomap-redesign src/pages/first-read/
// acts.tsx @ 1f54a56; every fixture-specific string dropped. Signed generic
// copy (headlines, standfirsts, phases, closing line, base definition, band
// strings) ported verbatim. Empty-state strings signed per the operator string
// sheet (2026-08-21); the findings standfirst is the sole HELD string.

import { useState, type ReactNode } from "react";
import {
  Absent,
  ActHeader,
  BeatWhy,
  Eyebrow,
  LedgerRow,
  RecencyTag,
  ScoreNow,
  SourceTag,
  OurReadTag,
  VerdictChip,
} from "./primitives";
import BaseAlignment, { allUntestedPairs } from "./BaseAlignment";
import { SCORE_BANDS, SCORE_LEVERS, bandForScore } from "./scoreBands";
import { conflictExplanationFor, deriveContradictionWhy, foldByHostDate, formatMonthYear, judgedContradictionReason } from "./mapping";
import type { FirstReadPreviewData, FRGapCounts, FRGapPair, FRGapStatement, FROfferItem, FRSignal, FRStatusConflict } from "./types";
import type { ChipTone } from "./primitives";
import { stripEdgeQuotes } from "@/lib/firstRead/provableVerbatim";
// Gate 2 — THE relationship-kind vocabulary (labels + known set + the emergent-kind note). Shared
// verbatim with the MarketAct chip so the two surfaces can never disagree about what a kind is called.
import {
  isKnownRelationshipKind,
  relationshipKindLabel,
  NEW_KIND_NOTE,
} from "../../../../supabase/functions/_shared/relationshipKinds.ts";
import { ListingRow } from "./primitives";
import { OperatorUnstatedState, OperatorUnstatedReason, OperatorKindTag, OperatorPairMeta, OwnWordsNotRunNote, OwnWordsRecordBlock, StruckPairsBlock, struckPairsByStatement } from "./operatorControls";
import { Chip } from "./primitives";
// Stage 2 (visual port): editorial layout primitives — beats 1–2. Stage 3: Spread on the nine
// sidebar beats (3, 4, 5, 6, 11, 12, 14, 15, 16). Stage 3b: full match to the captures, beats 1–17.
import { Divider, FlowLine, HangingItem, Labeled, Screen, Spread, VerticalScale, flowColumns, withStop } from "./primitives-editorial";
import { plural } from "./plural";

/** Stage 3 — the Spread sidebar for an ActHeader-shaped beat. Same strings in the same DOM order the
 *  header used: eyebrow → headline → standfirst → subline → count → Why-this (now below the hairline).
 *  `count` is an existing count element (never a sentence); `extra` is an existing block that moves
 *  into the sidebar (a banner). */
function SpreadBeat({
  eyebrow,
  headline,
  standfirst,
  subline,
  count,
  rationale,
  extra,
  foot,
  countBelowRationale = false,
  children,
}: {
  eyebrow?: ReactNode;
  headline: ReactNode;
  standfirst?: ReactNode;
  subline?: ReactNode;
  count?: ReactNode;
  rationale?: ReactNode;
  extra?: ReactNode;
  /** L2: the body column's foot line (a secondary eyebrow moved out of the sidebar). */
  foot?: ReactNode;
  /** Stage 3g (beat 6): the count element renders BELOW the Why-this rail. */
  countBelowRationale?: boolean;
  children: ReactNode;
}) {
  const why = rationale ? <BeatWhy plain>{rationale}</BeatWhy> : null;
  const aside = count || rationale || extra ? (
    <>
      {countBelowRationale ? why : count ?? null}
      {countBelowRationale ? count ?? null : why}
      {extra ?? null}
    </>
  ) : undefined;
  return (
    <Spread eyebrow={eyebrow} title={typeof headline === "string" ? withStop(headline) : headline} lede={standfirst} statement={subline} aside={aside} foot={foot}>
      {children}
    </Spread>
  );
}

/** Consecutive runs of the same key — a display grouping that never reorders its input. */
function runsBy<T, K>(items: T[], keyOf: (item: T) => K): Array<{ key: K; items: T[] }> {
  const out: Array<{ key: K; items: T[] }> = [];
  for (const it of items) {
    const k = keyOf(it);
    const last = out[out.length - 1];
    if (last && last.key === k) last.items.push(it); else out.push({ key: k, items: [it] });
  }
  return out;
}

// S5 — a small chip marking a row whose backing references a location with a live status conflict.
function StatusDisputedChip() {
  return <Chip tone="bad">Status conflict</Chip>;
}

// "host · date" once, with " ×N" when N>1 raw signal rows fold into it (display only). A provisional
// citation (backing signal held / recrawl-pending — source currently unreachable) is marked verbatim,
// never presented as live evidence (dispute-refresh, 2026-08-26; label signed).
const PROVISIONAL_CITATION_LABEL = "unconfirmed — source currently unreachable"; // signed
function foldedSourceLine(g: { host: string; date: string | null; count: number; provisional?: boolean }): string {
  const base = `${g.host}${g.date ? ` · ${g.date}` : ""}${g.count > 1 ? ` ×${g.count}` : ""}`;
  return g.provisional ? `${base} — ${PROVISIONAL_CITATION_LABEL}` : base;
}

// Source lists fold to this many rows; the rest sit behind a "+n more" toggle (2026-09-03, operator ask:
// the folded rows were unreachable). State only — collapsed again on every mount.
const SOURCE_LIST_FOLD = 6;
const SHOW_FEWER_LABEL = "Show fewer"; // signed with the +n more toggle

/** One source column: the folded rows, then "+n more" as a text toggle (the header's muted link primitive). */
function SourceColumn({ label, groups }: { label: string; groups: ReturnType<typeof foldByHostDate> }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? groups : groups.slice(0, SOURCE_LIST_FOLD);
  const hidden = groups.length - SOURCE_LIST_FOLD;
  return (
    <div data-fr-sources={expanded ? "expanded" : "folded"}>
      <p className="fr-eyebrow mb-2">{label}</p>
      {shown.map((g, i) => (
        <p key={i}>{foldedSourceLine(g)}</p>
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          className="fr-link-muted mt-1 text-xs font-bold uppercase tracking-[0.2em] transition-colors"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? SHOW_FEWER_LABEL : `+${hidden} more`}
        </button>
      ) : null}
    </div>
  );
}

// S4 — the pinned status-conflict banner (top of Questions + Findings). Both source sets, no verdict.
function StatusConflictBanner({ conflicts }: { conflicts: FRStatusConflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <div className="mb-12 flex flex-col gap-6">
      {conflicts.map((c) => (
        <div key={c.location} className="fr-conflict-banner rounded-lg border-l-4 p-6" style={{ borderColor: "hsl(var(--fr-bad))", background: "hsl(var(--fr-bad) / 0.04)" }}>
          <div className="mb-3"><StatusDisputedChip /></div>
          <p className="fr-conflict-question max-w-2xl">{c.question}</p>
          {/* S4 (2026-08-21): fold identical host+date rows on DISPLAY (×N); the underlying
              duplicate signal rows are untouched. "+n more" counts folded groups, not raw rows, and
              now expands in place (both columns) so every source is reachable. */}
          <div className="fr-conflict-sources mt-5 grid gap-6 text-xs md:grid-cols-2" style={{ color: "hsl(var(--fr-muted))" }}>
            <SourceColumn label="Reported closed" groups={foldByHostDate(c.closed)} />
            <SourceColumn label="Still listed open" groups={foldByHostDate(c.open)} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Signed per-page "Why this" rationale lines (2026-08-22, verbatim). The record page keeps its
//    existing "Why outside first" note; the cold open carries NO rationale (standing rule). ──
const RATIONALE_WHAT_YOU_SAY = "Your own public words, exactly as they appear. This is the claim the rest of the read tests."; // signed
const RATIONALE_GAP = "Where your words and the record agree, disagree, or don't yet meet. The disagreements are the most useful part."; // signed
const RATIONALE_SERVE = "The groups the public record suggests you're for. A hypothesis to confirm or correct, not a finding."; // signed
const RATIONALE_FINDINGS = "What stands out in the record on its own, before we weigh it against your direction."; // signed
const RATIONALE_SCORE = "One number for the likelihood your strategy succeeds, read only from public signals at this stage. It moves on evidence, not opinion."; // signed
const RATIONALE_WHERE = "The pieces behind that number, so it's inspectable rather than taken on trust."; // signed
const RATIONALE_BASE = "The four commitments everything else stands on. Aligning them comes first."; // signed
const RATIONALE_QUESTIONS = "The threads the record leaves open — worth taking a position on together."; // signed
const RATIONALE_NEXT = "What this read opened, and where we go from here."; // signed
// Coherence note (2026-08-22, signed): a company with a rung-1 status conflict but ZERO contradicted
// beat-4 statements — the dispute is source-vs-source, not your-words-vs-record. Only shown then.
const STATUS_VS_GAP_COHERENCE_NOTE = "The open-question about your status (see the top of this read) is a disagreement between outside sources — not between your words and the record. Nothing you've said publicly is disputed here."; // signed
// Signed eyebrow above the derived contradiction "why" line (2026-08-22), so it reads as rationale,
// not a source row. Hoisted above the pair evidence.
const WHY_CONFLICT_LABEL = "WHY THIS SEEMS TO CONFLICT"; // signed
const NO_SIGNALS_NOTE = "No outside signals collected yet."; // signed
// NO_MARKETS_NOTE removed with the Declared-markets section (public-only ruling, 2026-08-20).
const NO_SCORE_NOTE = "No score snapshot yet."; // signed (Phase A ruling)
const NOT_ENOUGH_SIGNAL_NOTE = "Not enough public signal to score yet."; // signed (outside-v1.0.0 ruling)
// Signed anchor line (outside-v1.0.0 ruling) — renders under the reveal support.
const ANCHOR_LINE =
  "Most strategy efforts don't succeed — the research base rate is under 20 in 100. This read starts there and moves only on what the public record shows. The bands above are reached with evidence, not optimism.";
// Eligibility mirror of the compute: fewer than 10 outside-voice signals → no score row by rule.
const OUTSIDE_MIN_SIGNALS = 10;
const NO_PAIRS_NOTE = "No comparisons computed yet."; // signed
// GATE B-1 — the empty gap line derives from the PERSISTED integrity record, never
// from array emptiness alone. Both SIGNED (string sheet).
const GAP_LOOKED_NONE_NOTE =
  "We compared your public voice with the record — no disagreements stand right now."; // signed
const GAP_COULDNT_CHECK_NOTE =
  "This comparison didn't complete — it will run again on the next refresh."; // signed
const NO_QUESTIONS_NOTE = "No open questions generated yet."; // signed (not-yet: no integrity row)
// Integrity-grounded empty lines (mirror offeringIntegrity/gapIntegrity vocabulary). DRAFT strings
// pending operator signature — added with the first_read_open_questions integrity gate.
const QUESTIONS_LOOKED_NONE = "We compared what you say with what's out there and found nothing left open yet."; // signed
const QUESTIONS_COULDNT = "We couldn't run that comparison this time."; // signed
// R3 (2026-09-04): the Questions beat standfirst — the whole line, byte-exact. SIGNED.
const QUESTIONS_STANDFIRST = "Questions still to be answered"; // signed
// ── Our-read section labels (positioning / strategy / promise) — SIGNED ──
const LABEL_POSITIONING = "Positioning"; // signed
const LABEL_STRATEGY = "Strategy"; // signed
const LABEL_PROMISE = "Promise"; // signed
// ── Stage B (2026-08-28) 5-rung public Playing-to-Win cascade ladder — DRAFT strings the operator
//    signs at the hold. The framing line reads THE STRATEGY THE PUBLIC RECORD IMPLIES (a reading, not
//    a go-forward proposal). The five eyebrows label the cascade rungs.
const CASCADE_FRAMING = "The strategy your public record implies."; // DRAFT — sign at hold
const RUNG_ASPIRATION = "Winning aspiration"; // DRAFT — sign at hold
const RUNG_WHERE = "Where to play"; // DRAFT — sign at hold
const RUNG_HOW = "How to win"; // DRAFT — sign at hold
const RUNG_CAPABILITIES = "Must-have capabilities"; // DRAFT — sign at hold
const RUNG_MGMT = "Management systems"; // DRAFT — sign at hold
// Ruling 1 (2026-08-21): no distinct promise field in the canvas → render this verbatim, no source tag.
const PROMISE_NOT_ENOUGH = "Not enough information to create promise."; // signed
// GATE (2026-08-21): positioning + strategy render only from a CONFIRMED public-only row (gate 6a).
// Until then beat 9 shows these signed lines verbatim, no source tag, no body.
const POSITIONING_NOT_ENOUGH = "Not enough public information to read positioning."; // signed
const STRATEGY_NOT_ENOUGH = "Not enough public information to read strategy."; // signed
const BASE_INFERRED_LABEL = "Inferred from your public record."; // signed
// ── Standalone-beat copy (council beat-order ruling) — SIGNED ──
const WORLD_HEADLINE = "What the world sees and says."; // signed
const WORLD_SUB = "From reviews, listings, press and the places people talk about you."; // signed
const YOUSAY_HEADLINE = "What you say."; // signed
const YOUSAY_SUB = "Read from your own channels — your site, your socials, your listings."; // signed
const SERVE_HEADLINE = "Who you serve."; // signed
const SERVE_SUB = "Groups of people trying to get something done — and the job they're hiring you for."; // signed
const OURREAD_HEADLINE = "Where this points."; // signed (superseded by the promise/positioning/strategy split — kept for the dark ActOurRead)
const OURREAD_SUB = "What we'd posit about your positioning, strategy and promise — hypotheses for the room to test, not verdicts."; // signed (superseded)
// ── Flow restructure (2026-09-02): the "Where this points" page splits into three unpacking pages
//    (Promise → Positioning → Strategy) + two siesta interludes. All DRAFT pending operator signature. ──
const PROMISE_TITLE = "Your promise"; // signed
const PROMISE_WHY = "What the record hears you promising — the first thing to unpack."; // signed
const POSITIONING_TITLE = "Your positioning"; // signed
const POSITIONING_WHY = "Behind that promise is a position — where you stand against the alternatives."; // signed
const STRATEGY_TITLE = "Your strategy"; // signed
const STRATEGY_WHY = "Behind that position is a set of choices — where to play, how to win."; // signed
const SIESTA1_HEADLINE = "That's what the record shows. Now, what it means."; // signed
const SIESTA1_LINE = "Four commitments the record lets us read — then the base they sit on."; // signed
const SIESTA2_HEADLINE = "That's your base, as the record shows it."; // signed
const SIESTA2_LINE = "Every route on the map starts here. Now — what you offer, and how likely it is to work."; // signed
// Beat 9 opens with the COMPLETE BaseGate (headline + framing + BaseAlignment illustration).
// R1 (2026-09-02): SUPERSEDED BY REORDER — "Who you serve" now precedes the Base in the ruled order, so
// this forward pointer was false. Removed from the Base render; the constant is retained (no replacement).
const MARKET_POINTER_NOTE = "Who you serve — coming up"; // signed (superseded — no longer rendered)
const WHERE_HEADLINE = "Where you stand."; // signed
// R2 (2026-09-04): the former not-read-yet channels line is RETIRED (deleted, not reworded). A company
// with no own-words run shows no channel copy to the client; the state is operator-only (OwnWordsNotRunNote).
// OW-3 (2026-08-20) — beat 3 own-words. SIGNED.
const OWN_WORDS_NONE_NOTE = "We read your channels but found no verbatim self-descriptions to quote yet."; // signed
const IN_YOUR_WORDS_LABEL = "In your words"; // signed
const CHANNELS_AS_READ_LABEL = "Your channels, as we read them"; // signed
const NO_SERVE_NOTE = "No public read of who you serve yet."; // signed

// ── Gate 4b — "groups we saw but couldn't state in your customers' terms" (all OPERATOR-SIGNED) ────
// The law (Living Memory, 2026-09-10): Who-you-serve is a conversation. A solution-bound group
// surfaces LABELLED, never dropped — and it is labelled with its ROLE, exactly like the groups above
// it (operator ruling, 2026-09-10, striking the "IN YOUR WORDS" chip). These people are a `buyer` or
// a `referrer` whether or not the read could state their job in their own words; a chip that said
// something else would make the section a different KIND of thing from the list above, when it is the
// same thing said less confidently. The sub-lines are plain words, not the judge's verbatim clause —
// the judge writes for a machine gate ("names 'machine-readable system' which is a key feature of
// Brand AI's product") and that reads as an accusation about a client's own language. The verbatim
// clause stays operator-only (OperatorUnstatedReason).
const UNSTATED_EYEBROW = "OTHER GROUPS WE SAW"; // signed
// The intro says what is WRONG with these rows, in the client's own frame — not what a market is.
// The ODI definition is ours, not theirs, and it never appears on this surface: a client reading
// "a market is a group of people and the job they're trying to get done" is being taught our
// vocabulary at the moment they most need to recognise their own words.
const UNSTATED_INTRO = "These groups are described around your product — so they tell us what you sell, not what they need."; // signed
/** rejected_solution, when a current offering-read product label is found inside the job text. */
const unstatedNamesLine = (product: string) =>
  `Names ${product} — take it out and ask what they'd still be trying to do.`; // signed
/** rejected_solution, when no label matches: the judge saw a solution we cannot name from the read. */
const UNSTATED_SOLUTION_FALLBACK = "Only makes sense with your product in it — take it out and ask what they'd still be trying to do."; // signed
const UNSTATED_BUYER_LINE = "Written as what you want them to do, not what they're trying to get done — say it from their side."; // signed
const UNSTATED_EMPTY: Record<"not_yet" | "looked_none" | "couldnt_check", string> = {
  not_yet: "Not read yet — this snapshot's market pass hasn't run.", // signed
  looked_none: "Every group we saw could be stated in your customers' terms.", // signed
  couldnt_check: "Couldn't finish this read — nothing is hidden, there's just nothing to show yet.", // signed
};
const NO_OURREAD_NOTE = "No public positioning, strategy or promise read yet."; // signed
// ── Gate-C Stage B (2026-09-01): "What you offer" (public offering read) — SIGNED, byte-exact ──
// The offering is enumerated ONLY from the accepted, judged public_reads kind='offering' payload;
// items carry code-derived seen_on / source_count / year fields verbatim. Earned-empty renders from
// the persisted first_read_offering integrity record (three honest states), never an empty query.
const OFFER_EYEBROW = "FROM THE RECORD"; // signed
const OFFER_HEADLINE = "What you offer, as the market can see it."; // signed
const OFFER_SUB = "Products, services, programs — as they appear in public. Not what you intend. What's visible."; // signed
const OFFER_WHY = "Your base is what you intend. Your offering is what people actually meet. The gap between them is where the next phase starts."; // signed (WHY THIS body)
const OFFER_GROUP_OWN = "Named on your own site"; // signed
const OFFER_GROUP_OUTSIDE = "Seen only from outside"; // signed
const OFFER_EARNED_EMPTY = "The record doesn't yet show what you offer."; // signed
const OFFER_CLOSING = "Next, we lay this against what your market needs."; // signed
// Design rationale (placement) — signed for beatRationale.test.tsx ONLY; internal shorthand, never
// rendered on the page (operator ruling 2026-09-01). Exported so the test asserts its value directly.
export const OFFER_RATIONALE = "The offering is what the base produces — it has to be on the table before needs-vs-offer."; // signed (rationale line, test-only)
// Earned-empty ground line — the three honest states (mirrors the gap beat's integrity-derived line).
const OFFER_NOT_YET = "The record hasn't been read for this yet."; // signed
const OFFER_COULDNT = "We couldn't produce a grounded read from the record this time."; // signed
// looked-and-none: signed template — <n> examined public sources + the read-through date. Both come
// from the persisted integrity record (examined) + the run ledger (through date); never recomputed.
const offerLookedLine = (n: number, date: string | null) =>
  `Across ${n} public ${plural(n, "source", "sources")} through ${date ?? "the latest read"}, nothing spoke to it.`; // signed
// Quiet, CODE-DERIVED source line: "<n> source(s) · <earliest>–<latest>" (single year if same; the
// date clause is omitted when the payload carries no source years). Never recomputed — reads the
// payload's carried fields as-is.
function offerSourceLine(it: FROfferItem): string {
  const years = [it.earliestYear, it.latestYear].filter((y): y is string => !!y);
  const range = years.length
    ? ` · ${years[0] === years[years.length - 1] ? years[0] : `${years[0]}–${years[years.length - 1]}`}`
    : "";
  return `${it.sourceCount} source${it.sourceCount === 1 ? "" : "s"}${range}`;
}
// ── Findings beat (S4) — standfirst SIGNED (2026-08-21). Source counts hidden until per-finding
// corroboration is real (gate 5a, clusterer repair); claim nothing about ordering. ──
const FINDINGS_STANDFIRST = "What we read from the public record."; // signed
const NO_FINDINGS_NOTE = "No public findings surfaced yet."; // signed (not-yet: no integrity row)
// Integrity-grounded empty lines (mirror offeringIntegrity/gapIntegrity vocabulary). DRAFT strings
// pending operator signature — added with the first_read_findings integrity gate.
const FINDINGS_LOOKED_NONE = "We read the outside record and nothing stood out on its own yet."; // signed
const FINDINGS_COULDNT = "We couldn't read the record for what stands out this time."; // signed
const FINDINGS_SHOWN = 5;
const UNSPOKEN_LEFT = "[ No declared position on this theme ]"; // signed
// A1/A3 (2026-08-20) — beat 4 headline follows the persisted type counts. SIGNED.
const GAP_HEADLINE_DISAGREE = "Where the two readings disagree."; // contradicted > 0
const GAP_HEADLINE_UNECHOED = "What you say that the record doesn't echo."; // contradicted 0, unechoed > 0
const GAP_HEADLINE_BACKED = "Where the record backs you."; // only confirmed
const GAP_HEADLINE_NEUTRAL = "Your words next to the record."; // nothing yet
const RECORD_SILENT_NOTE = "The public record doesn't echo this yet."; // signed
// R4 (2026-08-27) — the reverse arrow, "Raised by the record". DRAFT strings; operator signs/rewords
// at acceptance. Vocabulary law: no verdict-family word (echoed/disputed/confirmed/contradicted), and
// the section name must NOT collide with the ratified "Unspoken" (which names the OTHER arrow).
const REVERSE_SECTION_LABEL = "Raised by the record"; // DRAFT
const REVERSE_INTRO = "The record talks about things your own channels haven't mentioned yet."; // DRAFT
// DRAFT (2026-08-26, operator signs at acceptance): the re-verifying holding note — shown ONCE over the
// grouped re-verifying statements. Distinct from record-silent: here the record DID echo; gate 3 held
// its backing signal pending re-crawl.
const PAIRS_UNCOMPUTED_CAPTION = "Pair states not yet computed — all pairs untested"; // signed
const PAIRS_UNCOMPUTED_TITLE = "No pair verdicts computed yet — element pairs await the diagnostic."; // signed

const SHOWN_FULL_SIZE = 4;

/** The strength chip — above the row (stage 3b); tone = the strength word. */
function signalChip(signal: FRSignal) {
  return <Chip tone={signal.strength}>{signal.strength} signal</Chip>;
}

/** The row's tags — source · read-date, mentions, most-recent — below the body. */
function signalTags(signal: FRSignal) {
  const recency = formatMonthYear(signal.eventDate);
  return (
    <>
      {signal.sourceTag ? <SourceTag>{signal.sourceTag.label}</SourceTag> : null}
      {/* R4 (2026-08-27): identical statement+host folded to one row; the count states how many
          underlying mentions it stands for (all retained in data — de-emphasize, never delete). */}
      {(signal.mentionCount ?? 1) > 1 ? <SourceTag>{`${signal.mentionCount} mentions`}</SourceTag> : null}
      {recency ? <RecencyTag>{recency}</RecencyTag> : null}
    </>
  );
}

/** Cold open — one outside statement, full screen, before Act 1.
 *  Stage 2 (visual port): a DARK Screen — eyebrow + statement-size headline in the main column, the
 *  ladder blockquote (or the NO_SIGNALS_NOTE empty state) in the right-hand aside, the forward-link in
 *  the Screen foot. DOM order is unchanged (eyebrow → headline → quote/tags → link); strings verbatim. */
export function ColdOpen({ read, onContinue }: { read: FirstReadPreviewData; onContinue: () => void }) {
  const recency = formatMonthYear(read.coldOpen?.eventDate ?? null);
  // STANDING RULE (2026-08-24): NO rationale rail on the cold open — it added an unwanted
  // vertical rule line. Cold passes no rationale; BeatWhy also no-ops for key `cold`.
  const note = read.coldOpen ? (
    <blockquote className="fr-cold-quote">
      <p className="fr-cold-text">
        {/* Ladder: signed lines (conflict / echo gap) render unquoted (quoted===false). Gate 1:
            the strongest-signal rung is quoted ONLY when provably own-words verbatim; an
            unprovable outside featured signal downgrades to un-quoted (stray marks trimmed). */}
        {read.coldOpen.quoted !== false && read.coldOpen.provablyVerbatim === true
          ? <>&ldquo;{read.coldOpen.text}&rdquo;</>
          : (read.coldOpen.quoted === false ? read.coldOpen.text : stripEdgeQuotes(read.coldOpen.text))}
      </p>
      <footer className="mt-6 flex flex-col gap-2">
        {/* Q2 ruling (2026): the verdict-adjacent Status-conflict chip is REMOVED from the opener —
            the cold-open is the hook, not a verdict surface. Evidence framing (the source line)
            stays; the chip still renders on gap/findings where it belongs. */}
        {read.coldOpen.sourceTag ? <SourceTag>{read.coldOpen.sourceTag.label}</SourceTag> : null}
        {recency ? <RecencyTag>{recency}</RecencyTag> : null}
      </footer>
    </blockquote>
  ) : (
    <Absent>{NO_SIGNALS_NOTE}</Absent>
  );
  // SIGNED 1a (stage 3c): no eyebrow and no forward-link line — the headline stands alone with the
  // aside. Keyboard / tick navigation carries the advance (onContinue is retained for callers).
  void onContinue;
  return (
    <Screen tone="dark" note={note}>
      <h1 className="fr-display fr-h-statement">
        Here&rsquo;s what we can <span>already see<span className="fr-stop">.</span></span>
      </h1>
    </Screen>
  );
}

// ── Bookend path track (OPENER + CLOSER) ─────────────────────────────────────
// Two "you are here" process beats — orientation ONLY: a done → current → ahead
// VISUAL SPINE so the client sees where today's read sits in the whole engagement,
// legible BEFORE reading any text. NO findings, signal, verdict, or score content.
// Desktop: a horizontal left-to-right track (one hairline connector through the dot
// centers, via .fr-track::before). Mobile (<820px): collapses to the product's
// existing vertical milestone pattern. Every color is a --fr token or the accent
// already used by the tick strip — no new colors. Signed copy 2026 (this brief).

type StationState = "done" | "here" | "ahead";

type SubStep = { title: string; detail?: string; gate?: boolean };

interface Station {
  label: string;
  state: StationState;
  /** accent pill on the CURRENT station ("You are here" / "Up next"). */
  pill?: string;
  /** neutral sequencing chip on AHEAD stations ("Up next" / "Then" / "After that"). */
  chip?: string;
  /** soft indigo highlight card (the first-meeting station). */
  highlight?: boolean;
  /** opener: one-paragraph description. */
  blurb?: string;
  /** closer: one-line subline under the title. */
  subline?: string;
  /** closer: draft timing chip text, e.g. "Timing · ~1–2 weeks". */
  timing?: string;
  /** closer: italic muted context beside the timing chip. */
  context?: string;
  /** closer: the hairline-topped sub-step list. */
  substeps?: SubStep[];
}

// OPENER stations (signed). ARC_STAGES retained as the module-local name (no other
// consumer, per diagnostic); now the five whole-path stations.
const ARC_STAGES: Station[] = [
  {
    label: "Outside first",
    state: "done",
    blurb: "We mapped what the world sees and says about you — before you told us anything.",
  },
  {
    label: "The first meeting",
    state: "here",
    pill: "You are here",
    highlight: true,
    blurb:
      "Today you see the start of your map — the outside read, the gaps it surfaces, and a first pass at your base (market, strategy, positioning, promise, offerings). This is the map we build on from here.",
  },
  {
    label: "Diagnose",
    state: "ahead",
    chip: "Up next",
    blurb:
      "We turn the read inward — firm up your base, and lay out your markets, outcomes, and needs.",
  },
  {
    label: "Focus",
    state: "ahead",
    chip: "Then",
    blurb:
      "You choose where to commit, then gather the evidence and reveal the routes most likely to win.",
  },
  {
    label: "Flow",
    state: "ahead",
    chip: "After that",
    blurb:
      "Put the chosen route into motion, and keep the map living as reality changes.",
  },
];

// CLOSER stations (signed). "The first meeting" now DONE + highlighted; the three
// phases carry sublines, draft timing chips, and sub-step lists (Focus = five).
const NEXT_STATIONS: Station[] = [
  {
    label: "The first meeting",
    state: "done",
    highlight: true,
    blurb:
      "Your map is set up, the gaps named, your base drafted — we build on it from here.",
  },
  {
    label: "Diagnose",
    state: "here",
    pill: "Up next",
    subline: "Where guesswork becomes evidence you can rely on and share.",
    timing: "Timing · ~1–2 weeks",
    context: "the inside read",
    substeps: [
      { title: "Agree to go deeper", detail: "The engagement", gate: true },
      { title: "Stakeholder interviews", detail: "The people who hold the decisions" },
      { title: "Gather key documents", detail: "The inside view" },
      { title: "Define your markets, outcomes & needs", detail: "The option set — nothing chosen yet" },
    ],
  },
  {
    label: "Focus",
    state: "ahead",
    chip: "Then",
    subline: "Where a higher likelihood of success is unlocked.",
    timing: "Timing · 2–6 weeks",
    context: "the main effort",
    substeps: [
      { title: "Select your market & outcome", detail: "The choice that opens Focus", gate: true },
      { title: "Gather & score the market's needs", detail: "Evidence of what's underserved" },
      { title: "Reveal the routes", detail: "Options & opportunities to your outcome" },
      { title: "Prioritize & narrow", detail: "Ranked by strength of evidence" },
      { title: "Visualize the implications", detail: "A framework for positioning, messaging & offerings" },
    ],
  },
  {
    label: "Flow",
    state: "ahead",
    chip: "After that",
    subline: "Implement with confidence — you've chosen what's most likely to work.",
    timing: "Timing · 1–2 weeks, then ongoing",
    context: "focused work, then monitoring",
    substeps: [
      { title: "Put your chosen route into motion", detail: "Test it in market" },
      { title: "Run the weekly rhythm", detail: "Everyone has a voice" },
      { title: "Keep the map living", detail: "Switch routes as reality changes" },
      { title: "You leave with a reusable base", detail: "New markets build on it" },
    ],
  },
];

/** Two-weight headline via a CUSTOM split (not ActHeader's last-two-words rule):
 *  the caller passes the plain lead and the exact bold tail. */
function TwoWeightHeadline({ lead, bold }: { lead: string; bold: string }) {
  return (
    <h1 className="text-5xl font-extralight tracking-tight md:text-6xl">
      {lead} <span className="font-semibold">{bold}</span>
    </h1>
  );
}

/** Accent pill — the existing "You are here" idiom (fr-eyebrow + rounded-full + accent/0.12). */
function StationPill({ children }: { children: ReactNode }) {
  return (
    <span
      className="fr-eyebrow rounded-full px-2.5 py-0.5"
      style={{ background: "hsl(var(--fr-accent) / 0.12)", color: "hsl(var(--fr-accent))" }}
    >
      {children}
    </span>
  );
}

/** Neutral sequencing chip — the Chip primitive, neutral tone unless the caller assigns one. */
function SeqChip({ children, tone = "neutral" }: { children: ReactNode; tone?: ChipTone }) {
  return <Chip tone={tone}>{children}</Chip>;
}

function PathDot({ state }: { state: StationState }) {
  const style: React.CSSProperties =
    state === "done"
      ? { background: "hsl(var(--fr-faint))", color: "white" }
      : state === "here"
      ? { background: "hsl(var(--fr-accent))", color: "white", boxShadow: "0 0 0 5px hsl(var(--fr-accent) / 0.16)" }
      : { background: "white", border: "1.5px solid hsl(var(--fr-hair))" };
  return (
    <span aria-hidden className="fr-dot" style={style}>
      {state === "done" ? "✓" : ""}
    </span>
  );
}

/** The shared track. `n` sizes the desktop connector inset (through the dot centers). */
function PathTrack({ stations, n }: { stations: Station[]; n: number }) {
  return (
    <ol className="fr-track" style={{ ["--fr-track-n" as string]: String(n) }}>
      {stations.map((s) => {
        const titleColor = s.state === "here" ? "hsl(var(--fr-accent))" : "hsl(var(--fr-ink))";
        return (
          <li key={s.label} className="fr-station" data-state={s.state} data-highlight={s.highlight ? "true" : undefined}>
            <PathDot state={s.state} />
            <div className={s.highlight ? "fr-station-card" : undefined}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="fr-station-title" style={{ color: titleColor }}>{s.label}</span>
                {s.pill ? <StationPill>{s.pill}</StationPill> : null}
                {s.chip ? <SeqChip>{s.chip}</SeqChip> : null}
              </div>
              {s.blurb ? (
                <p className="mt-2 text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
                  {s.blurb}
                </p>
              ) : null}
              {s.subline ? (
                <p className="mt-2 text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
                  {s.subline}
                </p>
              ) : null}
              {s.timing ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="fr-timing-chip">{s.timing}</span>
                  {s.context ? <span className="fr-timing-context">{s.context}</span> : null}
                </div>
              ) : null}
              {s.substeps ? (
                <ul className="fr-substeps">
                  {s.substeps.map((step) => (
                    <li key={step.title} className="fr-substep">
                      <span className="fr-substep-marker" data-gate={step.gate ? "true" : undefined} aria-hidden />
                      <span>
                        <span className="fr-substep-title">{step.title}</span>
                        {step.detail ? <span className="fr-substep-detail"> — {step.detail}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Outcome hand-off — identical on both bookends (signed). `tone="dark"` (stage 2, opener) renders
 *  the same two strings as a dark slate card; the default keeps the closer's hairline-topped block. */
function OutcomeBlock({ tone = "rule", note }: { tone?: "rule" | "dark"; note?: ReactNode }) {
  if (tone === "dark") {
    return (
      <div className="fr-card fr-card--dark mt-16">
        <Eyebrow>Where this leads</Eyebrow>
        <p className="fr-display fr-h2">
          A clear direction, a coordinated team, and a{" "}
          <span>rising likelihood of success<span className="fr-stop">.</span></span>
        </p>
        {/* L6: the closer's one-line note sits inside the card, under the headline. */}
        {note ? <p className="fr-card-note fr-mono">{note}</p> : null}
      </div>
    );
  }
  return (
    <div className="mt-16 border-t pt-12" style={{ borderColor: "hsl(var(--fr-hair))" }}>
      <Eyebrow>Where this leads</Eyebrow>
      <p className="mt-3 max-w-2xl text-lg font-light leading-relaxed" style={{ color: "hsl(var(--fr-ink) / 0.85)" }}>
        A clear direction, a coordinated team, and a{" "}
        <span className="font-semibold">rising likelihood of success.</span>
      </p>
    </div>
  );
}

/** The opener. Stage 2 (visual port): a paper Screen — headline + lede, the five ARC_STAGES on a
 *  FlowLine (dots) with their existing labels / pill / chips / blurbs in matching columns, the
 *  outcome hand-off as a dark card, then the start link. Per-station DOM order is the milestone
 *  pattern's (✓ · title · pill/chip · blurb), so the rendered text is byte-identical to before.
 *  `eyebrow` is the beat's nav label, passed by the view (the same string the view used to render). */
export function ActArc({ eyebrow, onContinue }: { eyebrow?: ReactNode; onContinue: () => void }) {
  return (
    <Screen tone="paper" eyebrow={eyebrow}>
      <header className="fr-arc-head">
        <h1 className="fr-display fr-h1">
          {"You're already"} <span>moving<span className="fr-stop">.</span></span>
        </h1>
        <p className="fr-lede">
          The outside read is already behind you — done before today, before you told us anything.
          Here&rsquo;s the whole path from here, and where you stand on it now.
        </p>
      </header>

      <div className="fr-arc-path">
        <FlowLine stations={ARC_STAGES.map((s) => ({ key: s.label, state: s.state }))} />
        <div className="fr-flow-cols" style={flowColumns(ARC_STAGES.length)}>
          {ARC_STAGES.map((s) => (
            // Stage 3b: label (mono eyebrow) ABOVE title ABOVE body; the "You are here" column is the highlight.
            <div key={s.label} className="fr-flow-col" data-state={s.state}>
              {/* The done marker keeps the milestone pattern's ✓ glyph (the dot on the line is plain). */}
              {s.state === "done" ? <span className="fr-flow-chip" aria-hidden>✓</span> : null}
              {s.pill ? <span className="fr-flow-chip fr-flow-chip--pill">{s.pill}</span> : null}
              {s.chip ? <span className="fr-flow-chip">{s.chip}</span> : null}
              <p className="fr-flow-title">{s.label}</p>
              {s.blurb ? <p className="fr-flow-blurb">{s.blurb}</p> : null}
            </div>
          ))}
        </div>
      </div>

      <OutcomeBlock tone="dark" />

      <div className="pt-12">
        <button
          type="button"
          onClick={onContinue}
          className="fr-link-ink group text-xs font-bold uppercase tracking-[0.2em] transition-colors fr-mono"
        >
          Start the read{" "}
          <span className="inline-block transition-transform group-hover:translate-x-1">&rarr;</span>
        </button>
      </div>
    </Screen>
  );
}

/** A "what we see" sub-section: label + children. Unmounts when it has no content
 *  (R7: no array-length empty strings — an absent public object is simply not shown). */
function WeSeeSection({ label, show, children }: { label: string; show: boolean; children: ReactNode }) {
  if (!show) return null;
  return (
    <section className="border-b py-12" style={{ borderColor: "hsl(var(--fr-hair))" }}>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-6">{children}</div>
    </section>
  );
}


/**
 * Findings beat (S4) — public_inferred open findings in stored order. First 5 expanded; the rest
 * under "show all N". Each row tags its public read + date. NO source-count label: counts are
 * unearned until per-finding corroboration is real (gate 5a). No verdict language (UNDERSERVED etc.
 * never appears — findings carry no such field).
 */
export function ActFindings({ read, eyebrow }: { read: FirstReadPreviewData; eyebrow?: ReactNode }) {
  const [showAll, setShowAll] = useState(false);
  const total = read.findings.length;
  const shown = showAll ? read.findings : read.findings.slice(0, FINDINGS_SHOWN);
  return (
    <SpreadBeat
      eyebrow={eyebrow}
      headline="What stands out."
      standfirst={FINDINGS_STANDFIRST}
      rationale={RATIONALE_FINDINGS}
      // The existing count element (eyebrow + number), in the sidebar BELOW the Why-this rail (stage 3g).
      countBelowRationale
      count={
        total > 0 ? (
          <div className="fr-side-count">
            <Eyebrow>Findings</Eyebrow>
            <p className="fr-display fr-side-count-num">{total}</p>
          </div>
        ) : undefined
      }
    >
      <main className="fr-stagger fr-rows">
        {/* S4: status conflicts pinned ABOVE findings — top of the body column, a bordered block (stage 3b). */}
        <StatusConflictBanner conflicts={read.statusConflicts} />
        {/* Integrity-grounded empty state (never array emptiness alone): not-yet vs looked-and-none vs
            couldn't-check, from first_read_findings integrity (evidencePhase1 capture). */}
        {total === 0 && read.statusConflicts.length === 0 ? (
          <Absent>
            {read.findingsIntegrity === "couldnt_check"
              ? FINDINGS_COULDNT
              : read.findingsIntegrity === "looked_none"
                ? FINDINGS_LOOKED_NONE
                : NO_FINDINGS_NOTE}
          </Absent>
        ) : null}
        {shown.map((f) => (
          // No source-count label: counts are unearned until gate 5a (clusterer repair). The
          // `f.recurrence` plumbing stays for 5a but nothing reads from it here.
          <LedgerRow
            key={f.id}
            variant="hanging"
            // STEP 2a: the finding BODY is OUR reading (synthesis), not a quote — no hanging-quote glyph.
            // Its verbatim cluster-member receipts (rightContent below) keep their glyph, isProvablyVerbatim-gated.
            quoted={false}
            leftBody={f.body}
            // S5 — disputed marker when the finding references a conflicted location (chip above the title).
            lead={f.statusDisputed ? <StatusDisputedChip /> : undefined}
            meta={
              <>
                {/* Header meta line. CORROBORATED (recurrence > 0): DROPPED entirely — the per-receipt
                    lines below already carry host + read date, so a bare "read <date> · undated" here
                    names nothing. UNCORROBORATED: "Our read · <date>" (signed A′; read date alone; no
                    "undated" — our reading has no event date). No age marker on either branch. */}
                {f.recurrence > 0
                  ? null
                  : (f.sourceTag ? <OurReadTag>{f.sourceTag.label.replace(/^read\s+/i, "")}</OurReadTag> : null)}
              </>
            }
            // FIX 3: the raw supporting quote(s) beneath the synthesized finding — source-attributed.
            // Gate 1: per MEMBER — quote marks only when provably own-words verbatim; an unprovable
            // outside member renders un-quoted (stray marks trimmed). Omitted when none provable.
            rightContent={
              f.quotes.length > 0 ? (
                <div className="flex flex-col gap-6">
                  {f.quotes.map((q, i) => (
                    <div key={i}>
                      {/* LISTING CLASS (shape d): a listing member is a listing, never a quote. */}
                      {q.listing ? (
                        <ListingRow listing={q.listing} sourceTag={q.sourceTag} extra={<OperatorKindTag kind="listing" reason={null} />} />
                      ) : (
                        <>
                          <p className="text-lg font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
                            {q.provablyVerbatim ? <>&ldquo;{q.text}&rdquo;</> : stripEdgeQuotes(q.text)}
                          </p>
                          {q.sourceTag ? <div className="mt-3"><SourceTag>{q.sourceTag.label}</SourceTag></div> : null}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : undefined
            }
          />
        ))}
      </main>
      {total > FINDINGS_SHOWN ? (
        <div className="pt-10">
          <button
            type="button"
            aria-expanded={showAll}
            onClick={() => setShowAll((v) => !v)}
            className="fr-link-ink flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] transition-colors"
          >
            <span aria-hidden className="inline-block transition-transform duration-200" style={{ transform: showAll ? "rotate(90deg)" : "none" }}>
              &rsaquo;
            </span>
            {showAll ? "Show fewer" : `Show all ${total}`}
          </button>
        </div>
      ) : null}
    </SpreadBeat>
  );
}

// ── Standalone beats (council beat-order ruling, 2026-08-20) ──────────────────
// The "What we see" group is dissolved: channels, markets, where-you-stand, and the
// positioning/strategy/promise "our read" each become their own beat. Every row keeps
// its OUR READ label + source tag; empties are honest (no false absence).

/** Beat 3 — "What you say": read from your own channels (the client-voice reads). */
/**
 * Beat 3 "What you say" (OW-3, 2026-08-20): LEADS with the company's own verbatim words
 * (claim_type='own_words') — tri-state: verbatim → quoted; judge-paraphrased → "as stated on
 * {page}", unquoted; unprovable → hidden (id reported in read.ownWordsHiddenIds, never silent).
 * The prior inference rows (OUR read of the channels) are DEMOTED to a labelled sub-row below.
 * The empty state is grounded in a COMPLETED WRITE own-words record (ownWordsWriteCompleted), not emptiness.
 */
export function ActWhatYouSay({ read, eyebrow }: { read: FirstReadPreviewData; eyebrow?: ReactNode }) {
  const verbatim = read.ownWords.filter((w) => w.fidelity === "verbatim");
  const paraphrased = read.ownWords.filter((w) => w.fidelity === "paraphrased");
  const hasOwn = read.ownWords.length > 0;
  // R2: only the looked-and-none line remains; not-looked renders NO client copy.
  // GATE B: the note is earned by a COMPLETED WRITE that admitted nothing — never by the extractor's
  // 'planned' dry run. Planned-not-written renders no client copy; the operator note below covers it.
  const emptyNote = read.ownWordsWriteCompleted ? OWN_WORDS_NONE_NOTE : null;
  // Stage 3: no "Claims you make" string exists, so there is no label column here — each claim keeps
  // its own existing eyebrow ("In your words" / "As stated on {host}") above the numbered row.
  return (
    <SpreadBeat eyebrow={eyebrow} headline={YOUSAY_HEADLINE} standfirst={YOUSAY_SUB} rationale={RATIONALE_WHAT_YOU_SAY}>
      <main className="fr-stagger fr-rows">
        {!hasOwn && emptyNote ? <Absent>{emptyNote}</Absent> : null}
        {/* R2: operator-only "Not meeting-ready" line when no own-words run exists (null for the client). */}
        <OwnWordsNotRunNote run={read.ownWordsRun} />
        {/* Verbatim self-assertions lead — quoted, page + read date. */}
        {verbatim.map((w) => (
          <LedgerRow
            key={w.id}
            variant="hanging"
            leftLabel={IN_YOUR_WORDS_LABEL}
            leftBody={w.quote}
            meta={<>{w.sourceTag ? <SourceTag>{w.sourceTag.label}</SourceTag> : null}<OperatorKindTag kind={w.kind ?? null} reason={w.reason ?? null} /></>}
          />
        ))}
        {/* Judge-faithful paraphrases — NOT quoted; labelled "as stated on {page}". */}
        {paraphrased.map((w) => (
          <LedgerRow
            key={w.id}
            variant="hanging"
            quoted={false}
            leftLabel={`As stated on ${w.pageHost}`}
            leftBody={w.quote}
            meta={<>{w.sourceTag ? <SourceTag>{w.sourceTag.label}</SourceTag> : null}<OperatorKindTag kind={w.kind ?? null} reason={w.reason ?? null} /></>}
          />
        ))}
        {/* ADMISSION CRITERION: own words kept as record only — operator view (context-gated, null for the client). */}
        <OwnWordsRecordBlock words={read.ownWordsRecordOnly} />
        {/* Demoted: our inference read of the channels, below the company's own words.
            R2 (2026-09-04): renders ONLY when an own-words run exists for the company. */}
        {read.ownWordsRun && read.declared.length > 0 ? (
          <div data-fr-block="channels" className="mt-16 border-t pt-12" style={{ borderColor: "hsl(var(--fr-hair))" }}>
            <div className="mb-8"><Eyebrow>{CHANNELS_AS_READ_LABEL}</Eyebrow></div>
            {read.declared.map((claim) => (
              <LedgerRow
                key={claim.id}
                variant="hanging"
                muted
                leftLabel="Our read"
                leftBody={claim.statement}
                meta={<>{claim.sourceTag ? <SourceTag>{claim.sourceTag.label}</SourceTag> : null}<OperatorKindTag kind={claim.kind ?? null} reason={claim.reason ?? null} /></>}
              />
            ))}
          </div>
        ) : null}
      </main>
    </SpreadBeat>
  );
}

/** Relationship-kind chip display map — Gate 2 (2026-09-10): the local map that lived here is gone;
 *  labels, membership and the emergent-kind note all come from the ONE vocabulary authority. The
 *  2026-08-31 signing stands except for `funder`, which now reads "Funder" rather than "Donor" — the
 *  old mapping printed DONOR over Riverlane's venture capitalists. Any kind outside the known set
 *  still renders raw and capitalized ("in the evidence's own terms") but NO LONGER SILENTLY: it
 *  carries the same signed note the MarketAct chip has always shown. null/empty → NO chip. */
export { relationshipKindLabel };

/** Role-tag colours (stage 3b): assigned PER COMPANY from the accent sequence, in order of first
 *  appearance among that company's relationship kinds — no global kind→colour map. */
const ROLE_TONES: ChipTone[] = ["accent-0", "accent-1", "accent-2", "accent-3", "accent-4", "accent-5"];
export function roleTonesByFirstAppearance(kinds: Array<string | null>): Map<string, ChipTone> {
  const out = new Map<string, ChipTone>();
  for (const k of kinds) {
    if (!k || out.has(k)) continue;
    out.set(k, ROLE_TONES[out.size % ROLE_TONES.length]);
  }
  return out;
}

/** Beat 5 — "Who you serve": the ODI market rows (people + the job), each with its
 *  relationship-kind chip (SeqChip idiom — the surface's chip primitive). */
export function ActWhoYouServe({ read, eyebrow }: { read: FirstReadPreviewData; eyebrow?: ReactNode }) {
  // ONE colour assignment across the whole beat: the numbered groups claim their tones first, then
  // the unstated section's kinds continue the same sequence. A kind seen above keeps its colour when
  // it reappears below — the chip means the same thing in both places, so it must look the same.
  const tones = roleTonesByFirstAppearance([
    ...read.observedMarkets.map((m) => m.relationshipKind),
    ...read.unstatedGroups.map((g) => g.relationshipKind),
  ]);
  return (
    <SpreadBeat eyebrow={eyebrow} headline={SERVE_HEADLINE} standfirst={SERVE_SUB} rationale={RATIONALE_SERVE}>
      <main className="fr-stagger">
        {read.observedMarkets.length === 0 ? <Absent>{NO_SERVE_NOTE}</Absent> : null}
        {/* Stage 3: numbered HangingItems (CSS-counter numerals) — chip · who · job · tag, as before. */}
        <ol className="fr-hanging-list">
          {read.observedMarkets.map((m) => {
            const kindLabel = relationshipKindLabel(m.relationshipKind);
            const tone = (m.relationshipKind && tones.get(m.relationshipKind)) || "neutral";
            // Off-vocabulary kinds (competitor, employee — both live on the fleet today) are shown
            // with the signed note, exactly as the MarketAct chip does. Rendering an unfamiliar word
            // with no mark of where it came from reads as house vocabulary; it is not.
            const isNewKind = !!m.relationshipKind && !isKnownRelationshipKind(m.relationshipKind);
            return (
              <HangingItem
                key={m.id}
                lead={kindLabel ? (
                  <span className="fr-kindrow">
                    <SeqChip tone={tone}>{kindLabel}</SeqChip>
                    {isNewKind ? <span className="fr-kindnew">{NEW_KIND_NOTE}</span> : null}
                  </span>
                ) : undefined}
                title={m.who}
                meta={m.sourceTag ? <SourceTag>{m.sourceTag.label}</SourceTag> : undefined}
              >
                {m.job ? <p className="fr-hanging-text">{m.job}</p> : null}
              </HangingItem>
            );
          })}
        </ol>
        <UnstatedGroups read={read} tones={tones} />
      </main>
    </SpreadBeat>
  );
}

/** Generic tails an offering label carries that the model's prose usually drops or swaps: the read
 *  says "Deltaflow QEC system", the job says "Deltaflow QEC layer" or bare "Deltaflow 2". Stripping
 *  the tail leaves the HEAD TOKEN — the part that actually names the product. */
const LABEL_TAILS = ["system", "platform", "tool", "product", "interface", "service", "stack", "layer", "suite", "app"];

/** Words that are a FIELD, not a product. "AI" is Lumio's field and every legal-AI buyer's own word
 *  for what they do; naming it as the client's product would be wrong even when a label contains it.
 *  These never match on their own — the fallback line is the honest output there. */
const CATEGORY_WORDS = new Set(["ai", "software", "data", "cloud", "platform"]);

/** The searchable HEADS of an offering label, longest first: the label with its generic tail removed,
 *  then each shorter prefix. Progressive prefixes are needed because stripping the listed tails alone
 *  is not enough — "Deltaflow 2 QEC system" strips to "Deltaflow 2 QEC", but the model's job says a
 *  bare "Deltaflow 2". A prefix is the right shape for a product name: brands qualify rightwards
 *  ("Deltaflow" → "Deltaflow 2" → "Deltaflow 2 QEC"), so any prefix still names the same thing, while
 *  a suffix ("QEC system") names the category. Each head must be ≥4 chars and not a bare field word. */
export function offeringLabelHeads(label: string): string[] {
  let parts = String(label ?? "").trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && LABEL_TAILS.includes(parts[parts.length - 1].toLowerCase())) parts.pop();
  const heads: string[] = [];
  for (let n = parts.length; n >= 1; n--) {
    const head = parts.slice(0, n).join(" ");
    if (head.length < 4) continue;                        // too short to be a name
    if (CATEGORY_WORDS.has(head.toLowerCase())) continue; // a field, not a product
    heads.push(head);
  }
  return heads;
}

/** Gate 4d — the offering-read product whose HEAD appears in this job text, or null. The RETURNED
 *  label is the full one (what the client calls it in their own read, so the line names it properly);
 *  the returned head is what the job actually says, so the tint marks the real words. Longest head
 *  wins across labels, so "Deltaflow 2" is never reported as "Deltaflow". */
export function matchOfferingProduct(
  job: string | null,
  labels: readonly string[],
): { label: string; head: string } | null {
  const hay = String(job ?? "").toLowerCase();
  if (!hay) return null;
  let best: { label: string; head: string } | null = null;
  for (const label of labels) {
    for (const head of offeringLabelHeads(label)) {
      if (!hay.includes(head.toLowerCase())) continue;
      if (!best || head.length > best.head.length) best = { label: label.trim(), head };
      break; // heads are longest-first, so the first hit is this label's best
    }
  }
  return best;
}

/** The job text with the matched product phrase tinted — the point of the row is that the product is
 *  IN the job, so the reader should be able to see it sitting there rather than take our word. */
function JobWithProduct({ job, head }: { job: string; head: string | null }) {
  if (!head) return <p className="fr-hanging-text">{job}</p>;
  const at = job.toLowerCase().indexOf(head.toLowerCase());
  if (at < 0) return <p className="fr-hanging-text">{job}</p>;
  return (
    <p className="fr-hanging-text">
      {job.slice(0, at)}
      <span className="fr-unstated-product">{job.slice(at, at + head.length)}</span>
      {job.slice(at + head.length)}
    </p>
  );
}

/** Gate 4b — the section below the numbered groups. ALWAYS rendered: when there is nothing to list it
 *  renders its earned-empty line from the persisted integrity record, because an omitted section
 *  cannot tell "nothing to say" from "we never looked", and explaining an absence is this beat's
 *  whole job. Folds are deliberately absent (their people are already inside a numbered group above),
 *  as are already_decided (that IS a numbered group) and error (no ruling exists to report). */
function UnstatedGroups({ read, tones }: { read: FirstReadPreviewData; tones: Map<string, ChipTone> }) {
  const rows = read.unstatedGroups;
  // Gate E1 (operator ruling): NOTHING renders when there is nothing to show — no eyebrow, no intro,
  // no state line. An earned-empty line is right where a client is owed an account of a gap they can
  // see; here there is no gap on the page, so a line saying "we looked and found none" only teaches
  // the client that a machine was grading their words. The tri-state integrity record still exists and
  // is still honest — it moves under the operator toggle, where the person who needs it can read it.
  if (rows.length === 0) return <OperatorUnstatedState state={read.unstatedIntegrity} />;
  return (
    <section className="fr-unstated">
      <div className="fr-unstated-head">
        <Eyebrow>{UNSTATED_EYEBROW}</Eyebrow>
        <p className="fr-unstated-intro">{UNSTATED_INTRO}</p>
      </div>
      <ol className="fr-unstated-list">
          {rows.map((g) => {
            const kindLabel = relationshipKindLabel(g.relationshipKind);
            const tone = (g.relationshipKind && tones.get(g.relationshipKind)) || "neutral";
            const isNewKind = !!g.relationshipKind && !isKnownRelationshipKind(g.relationshipKind);
            const product = g.outcome === "rejected_solution"
              ? matchOfferingProduct(g.job, read.offeringProductLabels)
              : null;
            const subline = g.outcome === "rejected_buyer"
              ? UNSTATED_BUYER_LINE
              : product ? unstatedNamesLine(product.label) : UNSTATED_SOLUTION_FALLBACK;
            return (
            <li key={g.id} className="fr-unstated-item">
              {kindLabel ? (
                <span className="fr-kindrow">
                  <SeqChip tone={tone}>{kindLabel}</SeqChip>
                  {isNewKind ? <span className="fr-kindnew">{NEW_KIND_NOTE}</span> : null}
                </span>
              ) : null}
              <p className="fr-unstated-who">{g.who}</p>
              {g.job ? <JobWithProduct job={g.job} head={product?.head ?? null} /> : null}
              <p className="fr-unstated-sub">{subline}</p>
              <OperatorUnstatedReason reason={g.judgeReason} reconstructed={g.reconstructed} />
            </li>
            );
          })}
      </ol>
    </section>
  );
}

/** Gate-C Stage B — one offering group ("Named on your own site" / "Seen only from outside").
 *  Reuses the "Where this points" numbered hanging-indent idiom: the two-digit numeral is a SEPARATE
 *  flex item so wrapped lines align under the text column. Each cell is label (bold) + statement +
 *  the quiet code-derived source line. Numbering is continuous across groups (startIndex). */
function OfferGroup({ label, items, startIndex }: { label: string; items: FROfferItem[]; startIndex: number }) {
  // Stage 3b: the group eyebrow ABOVE its group; titles at row-headline weight, statements light.
  return (
    <div className="fr-offer-group">
      <div className="fr-offer-group-label"><Eyebrow>{label}</Eyebrow></div>
      <ol className="fr-offer-list">
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="fr-offer-item">
            <span className="fr-hanging-num fr-mono">
              {String(startIndex + i + 1).padStart(2, "0")}
            </span>
            <div className="fr-hanging-body">
              <p className="fr-hanging-title">{it.label}</p>
              <p className="fr-hanging-text">{it.statement}</p>
              <p className="fr-hanging-meta fr-mono">{offerSourceLine(it)}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Beat — "What you offer": the public offering, enumerated from the accepted, judged offering read.
 *  Two groups (own-site first, then outside; an empty group's header is omitted). No chips, no verdict
 *  language, no decorative rules — the only vertical rule is the header's Why-this divider. Earned-empty
 *  renders from the persisted integrity record's three honest states, never from an empty query. Open
 *  questions route to the Questions beat (via the shared open-question list), never onto this beat. */
export function ActWhatYouOffer({ read, eyebrow }: { read: FirstReadPreviewData; eyebrow?: ReactNode }) {
  const off = read.offering;
  // The offering payload carries no created_at of its own; the foot line reuses the latest existing
  // "Public read · date" tag among the commitment reads (same source table, same read).
  const offerTag = basePublicReadTag(read);
  const own = off ? off.items.filter((i) => i.seenOn === "own_site") : [];
  const outside = off ? off.items.filter((i) => i.seenOn === "outside") : [];
  const groundLine =
    read.offeringIntegrity === "couldnt_check"
      ? OFFER_COULDNT
      : read.offeringIntegrity === "looked_none"
        ? offerLookedLine(read.offeringExamined ?? 0, read.offeringThroughDate)
        : OFFER_NOT_YET;
  return (
    // L2/L4 (stage 3d): one sidebar eyebrow (the beat label); FROM THE RECORD becomes the body's foot
    // line; the closing line sits in the sidebar below the hairline in rationale style.
    <SpreadBeat
      eyebrow={eyebrow}
      headline={OFFER_HEADLINE}
      standfirst={OFFER_SUB}
      rationale={OFFER_WHY}
      extra={<p className="fr-why-text fr-why-line">{OFFER_CLOSING}</p>}
      // Stage 3f: FROM THE RECORD joins the public-read tag on one foot line (CSS separator), as on beat 12.
      foot={<>{OFFER_EYEBROW}{offerTag ? <><span className="fr-foot-sep" aria-hidden />{offerTag.label}</> : null}</>}
    >
      <main className="fr-stagger">
        {off ? (
          <div className="flex flex-col gap-12">
            {own.length > 0 ? <OfferGroup label={OFFER_GROUP_OWN} items={own} startIndex={0} /> : null}
            {outside.length > 0 ? <OfferGroup label={OFFER_GROUP_OUTSIDE} items={outside} startIndex={own.length} /> : null}
          </div>
        ) : (
          <Absent>
            <p>{OFFER_EARNED_EMPTY}</p>
            <p className="mt-2">{groundLine}</p>
          </Absent>
        )}
      </main>
    </SpreadBeat>
  );
}

/** Beat 8 — "Where you stand": inferred base reading (R-B), persisted numbers only. */
/** Order the levers by headroom (max − value) desc; ties settle by canonical order
 *  (SCORE_LEVERS index) so a shuffled input still renders deterministically (W1). */
const CANONICAL_LEVER_INDEX = new Map(SCORE_LEVERS.map((l, i) => [l.key, i]));
function orderByHeadroom<T extends { key: string; value: number | null; max: number }>(levers: T[]): T[] {
  return [...levers].sort((a, z) => {
    // A not-computed lever (value null) sorts by full headroom (value treated as 0).
    const h = (z.max - (z.value ?? 0)) - (a.max - (a.value ?? 0)); // headroom desc
    if (Math.abs(h) > 1e-9) return h;
    return (CANONICAL_LEVER_INDEX.get(a.key) ?? 99) - (CANONICAL_LEVER_INDEX.get(z.key) ?? 99);
  });
}

/** value / max, value trimmed to at most one decimal (whole numbers stay whole). */
function fmtLeverValue(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Beat 8 — "Where you stand" (W1, 2026-08-20): the interpretation of the beat-7 score.
 * Band name + band meaning (ladder copy) + the five micro-moves, each value / max with its
 * persisted explanation, ordered by headroom desc. Rendered ONLY from the mojo_scores
 * snapshot — no live recompute, no unearned adjectives. No score → the SAME honest empty
 * state as beat 7, grounded in the outside-score PRODUCER record (ineligible vs never-fired).
 */
export function ActWhereYouStand({ read }: { read: FirstReadPreviewData }) {
  const b = read.whereYouStand;
  // Producer-grounded (2026-09-02): the producer ran and found <10 signals → NOT_ENOUGH; it never fired
  // (no record) → NO_SCORE. Never baseline-ran-ness. A present score row renders the band, not a note.
  const emptyNote = read.outsideScoreState === "ineligible" ? NOT_ENOUGH_SIGNAL_NOTE : NO_SCORE_NOTE;
  return (
    <>
      <ActHeader headline={WHERE_HEADLINE} rationale={RATIONALE_WHERE} />
      <main className="fr-stagger">
        {b ? (
          <>
            <div className="max-w-xl">
              <p className="text-2xl font-semibold leading-snug">
                {b.band} · {b.scoreValue} of 100
              </p>
              <p className="mt-3 text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
                {b.bandMeaning}
              </p>
            </div>
            <p className="mt-6 text-[10px] font-bold uppercase tracking-widest" style={{ color: "hsl(var(--fr-faint))" }}>
              {BASE_INFERRED_LABEL}
            </p>
            <ul className="mt-6 flex max-w-xl flex-col">
              {orderByHeadroom(b.levers).map((lever) => (
                <li
                  key={lever.key}
                  className="flex flex-col gap-1 border-b py-4"
                  style={{ borderColor: "hsl(var(--fr-hair))" }}
                >
                  <div className="flex items-baseline justify-between gap-6">
                    <span className="text-sm font-semibold">{lever.label}</span>
                    <span className="shrink-0 text-sm font-light tabular-nums" style={{ color: "hsl(var(--fr-ink) / 0.85)" }}>
                      {lever.notComputed || lever.value == null ? "—" : fmtLeverValue(lever.value)} / {lever.max}
                    </span>
                  </div>
                  {lever.explanation ? (
                    <p className="text-xs font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
                      {lever.explanation}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
            {b.sourceTag ? <div className="mt-4"><SourceTag>{b.sourceTag.label}</SourceTag></div> : null}
          </>
        ) : (
          <Absent>{emptyNote}</Absent>
        )}
      </main>
    </>
  );
}

/** Beat 9 — "Our read": positioning / strategy / promise as hypotheses; opens with the
 *  BaseGate four-commitments frame (S3). */
// Signed not-enough line (muted, no source tag) — the shared shape for all three gated Our-read rows.
function GatedLine({ children }: { children: ReactNode }) {
  return <p className="text-lg font-light leading-snug" style={{ color: "hsl(var(--fr-muted))" }}>{children}</p>;
}

// DISPLAY casing (2026-08-22): the public-read generator stores market_category / value_for_customer
// with a lower-case first letter (e.g. "artisan coffee roaster…"). Sentence-case the first character
// at RENDER time only — the stored payload is never mutated. Rest of the string untouched.
function sentenceCase(s: string | null | undefined): string {
  const t = (s ?? "").trimStart();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}

/** Numbered hanging-indent list (2026-08-31 restyle) — the Questions-beat mechanic at list scale.
 *  The two-digit index is a SEPARATE flex item, so wrapped lines align under the TEXT column, never
 *  the margin (the defect the old "· " bullets had). Strings render verbatim — zero copy change.
 *  Empty list ⇒ nothing (no empty <ol>). Used identically by the three "Where this points" blocks:
 *  positioning differentiators, must-have capabilities, management systems. */
function NumberedList({ items, className }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ol className={`flex flex-col gap-2${className ? ` ${className}` : ""}`}>
      {items.map((text, i) => (
        <li key={i} className="flex gap-4">
          <span className="shrink-0 pt-0.5 text-[10px] tracking-widest fr-numeral" style={{ color: "hsl(var(--fr-faint))" }}>
            {String(i + 1).padStart(2, "0")}
          </span>
          {/* Stage 3f: colour comes from .fr-numbered-text (ink/85 on paper; paper alphas on a dark Screen) —
              an inline colour here used to win the cascade and kept beats 9/10 dark-on-dark. */}
          <p className="fr-numbered-text text-sm font-light leading-relaxed">{text}</p>
        </li>
      ))}
    </ol>
  );
}

// Stage B — the 5-rung public Playing-to-Win cascade ladder. Each rung renders ONLY when present in
// the stored spine; a missing rung renders NOTHING here (its question lives on the Questions beat).
// The framing line reads the cascade as THE STRATEGY THE PUBLIC RECORD IMPLIES — never a go-forward.
function CascadeRung({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <span className="fr-eyebrow">{eyebrow}</span>
      <div className="mt-1 max-w-xl text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>{children}</div>
    </div>
  );
}
function CascadeLadder({ st }: { st: NonNullable<FirstReadPreviewData["strategy"]> }) {
  const caps = st.capabilities ?? [];
  const mgmt = st.managementSystems ?? [];
  return (
    <>
      <p className="text-xs font-light italic" style={{ color: "hsl(var(--fr-faint))" }}>{CASCADE_FRAMING}</p>
      {st.aspiration ? (
        <div className="mt-3">
          <span className="fr-eyebrow">{RUNG_ASPIRATION}</span>
          <p className="mt-1 text-2xl font-semibold leading-snug">{st.aspiration}</p>
        </div>
      ) : null}
      {st.whereToPlay ? <CascadeRung eyebrow={RUNG_WHERE}>{st.whereToPlay}</CascadeRung> : null}
      {st.howToWin ? <CascadeRung eyebrow={RUNG_HOW}>{st.howToWin}</CascadeRung> : null}
      {caps.length > 0 ? (
        <CascadeRung eyebrow={RUNG_CAPABILITIES}>
          <NumberedList items={caps} />
        </CascadeRung>
      ) : null}
      {mgmt.length > 0 ? (
        <CascadeRung eyebrow={RUNG_MGMT}>
          <NumberedList items={mgmt} />
        </CascadeRung>
      ) : null}
      {st.sourceTag ? <div className="mt-4"><SourceTag>{st.sourceTag.label}</SourceTag></div> : null}
    </>
  );
}

export function ActOurRead({ read }: { read: FirstReadPreviewData }) {
  // GATE (2026-08-21): positioning/strategy render substance ONLY from a confirmed public-only row
  // (the data hook gates them to null today, gate 6a). Otherwise each renders its signed line. The
  // three eyebrows (POSITIONING / STRATEGY / PROMISE) always show. Promise = own field or signed line.
  const p = read.positioning;
  const st = read.strategy;
  const pr = read.promise;
  return (
    <>
      <ActHeader headline={OURREAD_HEADLINE} standfirst={OURREAD_SUB} />
      <main className="fr-stagger">
        <WeSeeSection label={LABEL_POSITIONING} show>
          {p ? (
            <>
              {p.category ? <p className="text-2xl font-semibold leading-snug">{sentenceCase(p.category)}</p> : null}
              {p.value ? (
                <p className="mt-3 max-w-xl text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>{sentenceCase(p.value)}</p>
              ) : null}
              {p.differentiators.length > 0 ? (
                <NumberedList items={p.differentiators} className="mt-4" />
              ) : null}
              {p.sourceTag ? <div className="mt-4"><SourceTag>{p.sourceTag.label}</SourceTag></div> : null}
            </>
          ) : (
            <GatedLine>{POSITIONING_NOT_ENOUGH}</GatedLine>
          )}
        </WeSeeSection>
        <WeSeeSection label={LABEL_STRATEGY} show>
          {st ? (
            <CascadeLadder st={st} />
          ) : (
            <GatedLine>{STRATEGY_NOT_ENOUGH}</GatedLine>
          )}
        </WeSeeSection>
        {/* Promise (ruling 1): own field when present; otherwise the signed line, no source tag. */}
        <WeSeeSection label={LABEL_PROMISE} show>
          {pr?.text ? (
            <>
              <p className="text-2xl font-semibold leading-snug">{pr.text}</p>
              {pr.sourceTag ? <div className="mt-4"><SourceTag>{pr.sourceTag.label}</SourceTag></div> : null}
            </>
          ) : (
            <GatedLine>{PROMISE_NOT_ENOUGH}</GatedLine>
          )}
        </WeSeeSection>
      </main>
    </>
  );
}

// ── The three unpacking pages (flow restructure). Each renders exactly what ActOurRead rendered for
//    its kind (structure ported, content rules intact) + its own headline + WHY-THIS (unpacking voice).
//    The LABEL_* section eyebrow is kept so no signed string is dropped. ──
// Stage 3b: the three unpacking pages are DARK Screens. The page title (PROMISE_TITLE etc.) is the
// eyebrow — it is byte-identical to the beat's nav label, and the view no longer renders the label a
// second time, so each renders exactly once. The statement wears the terminal lime dot when it ends
// in "."; the Why-this line and the "Public read · date" tag form the foot line.
/** Statement class. R2 (length-based step-down) was REVERTED by operator signature (stage 3e):
 *  statements never change size by length — every statement wraps at statement size. */
function statementClass(text: string | null | undefined): string {
  void text;
  return "fr-display fr-h-statement fr-h-statement--wide";
}

function DarkFoot({ tag, why }: { tag?: { label: string } | null; why?: string }) {
  return (
    <div className="fr-dark-foot">
      {tag ? <SourceTag>{tag.label}</SourceTag> : null}
      {why ? (
        <span className="fr-dark-foot-why">
          <Eyebrow>Why this</Eyebrow>
          <span className="fr-mono">{why}</span>
        </span>
      ) : null}
    </div>
  );
}

export function ActPromise({ read }: { read: FirstReadPreviewData }) {
  const pr = read.promise;
  return (
    <Screen tone="dark" eyebrow={PROMISE_TITLE} foot={<DarkFoot tag={pr?.text ? pr.sourceTag : null} why={PROMISE_WHY} />}>
      <main className="fr-stagger">
        {pr?.text ? (
          <h1 className={statementClass(pr.text)}>{withStop(pr.text)}</h1>
        ) : (
          <GatedLine>{PROMISE_NOT_ENOUGH}</GatedLine>
        )}
      </main>
    </Screen>
  );
}

export function ActPositioning({ read }: { read: FirstReadPreviewData }) {
  const p = read.positioning;
  return (
    <Screen
      tone="dark"
      eyebrow={POSITIONING_TITLE}
      // The Why-this line labels the attributes column when there are attributes (B9); otherwise it
      // sits in the foot beside the tag, as on the other unpacking pages.
      foot={<DarkFoot tag={p ? p.sourceTag : null} why={p && p.differentiators.length > 0 ? undefined : POSITIONING_WHY} />}
    >
      <main className="fr-stagger">
        {p ? (
          <>
            {p.category ? <h1 className={statementClass(sentenceCase(p.category))}>{withStop(sentenceCase(p.category))}</h1> : null}
            {p.value ? <p className="fr-lede fr-lede--dark">{sentenceCase(p.value)}</p> : null}
            {/* B9: below a hairline, the label column carries the existing Why-this line (no "What holds
                it up" string exists); the attributes sit as numbered columns (their numerals are text). */}
            {p.differentiators.length > 0 ? (
              <div className="fr-dark-section">
                <Labeled
                  label={<><Eyebrow>Why this</Eyebrow><span className="fr-dark-label fr-mono">{POSITIONING_WHY}</span></>}
                  className="fr-labeled--dark"
                >
                  <NumberedList items={p.differentiators} className="fr-numbered-cols" />
                </Labeled>
              </div>
            ) : null}
          </>
        ) : (
          <GatedLine>{POSITIONING_NOT_ENOUGH}</GatedLine>
        )}
      </main>
    </Screen>
  );
}

export function ActStrategy({ read }: { read: FirstReadPreviewData }) {
  const st = read.strategy;
  const caps = st?.capabilities ?? [];
  const mgmt = st?.managementSystems ?? [];
  return (
    <Screen tone="dark" eyebrow={STRATEGY_TITLE} foot={<DarkFoot tag={st ? st.sourceTag : null} why={STRATEGY_WHY} />}>
      <main className="fr-stagger">
        {st ? (
          <>
            {/* The aspiration at statement size (one string) under its rung eyebrow; the framing line beside. */}
            <p className="fr-dark-framing fr-mono">{CASCADE_FRAMING}</p>
            {st.aspiration ? (
              <div className="mt-6">
                <span className="fr-eyebrow">{RUNG_ASPIRATION}</span>
                <h1 className={`${statementClass(st.aspiration)} mt-4`}>{withStop(st.aspiration)}</h1>
              </div>
            ) : null}
            {/* Hairline, then the rungs as columns: Where to play / How to win / Must-have capabilities
                (+ Management systems when present). Rung text at text-xl paper 500; lists numbered. */}
            <div className="fr-dark-section">
              <div className="fr-rung-cols">
                {st.whereToPlay ? <div className="fr-rung"><span className="fr-eyebrow">{RUNG_WHERE}</span><p className="fr-rung-text">{st.whereToPlay}</p></div> : null}
                {st.howToWin ? <div className="fr-rung"><span className="fr-eyebrow">{RUNG_HOW}</span><p className="fr-rung-text">{st.howToWin}</p></div> : null}
                {caps.length > 0 ? <div className="fr-rung"><span className="fr-eyebrow">{RUNG_CAPABILITIES}</span><NumberedList items={caps} className="mt-3" /></div> : null}
                {mgmt.length > 0 ? <div className="fr-rung"><span className="fr-eyebrow">{RUNG_MGMT}</span><NumberedList items={mgmt} className="mt-3" /></div> : null}
              </div>
            </div>
          </>
        ) : (
          <GatedLine>{STRATEGY_NOT_ENOUGH}</GatedLine>
        )}
      </main>
    </Screen>
  );
}

// ── Siesta interludes (no props, no read): the Divider primitive — numeral (CSS attr, never DOM text),
//    vertical hairline, headline + one line. Beat 7 on lime; beat 13 on dark (the view sets the ground). ──
export function ActSiesta1() {
  return <Divider numeral="2" tone="lime" title={withStop(SIESTA1_HEADLINE)} body={SIESTA1_LINE} />;
}

export function ActSiesta2() {
  return <Divider numeral="3" tone="dark" title={withStop(SIESTA2_HEADLINE)} body={SIESTA2_LINE} />;
}

export function ActRecord({ read, eyebrow }: { read: FirstReadPreviewData; eyebrow?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const shown = read.signals.slice(0, SHOWN_FULL_SIZE);
  const further = read.signals.slice(SHOWN_FULL_SIZE);
  const counts = {
    strong: further.filter((s) => s.strength === "strong").length,
    moderate: further.filter((s) => s.strength === "moderate").length,
    thin: further.filter((s) => s.strength === "thin").length,
  };
  // Stage 3: the shown rows sit under strength group headers (strong → moderate → thin). The header
  // word is the row chip's own "{strength} signal", drawn by CSS from the attribute — never a second
  // string. Rows keep their relative order inside a tier.
  const tiers = (["strong", "moderate", "thin"] as const)
    .map((t) => ({ t, rows: shown.filter((s) => s.strength === t) }))
    .filter((g) => g.rows.length > 0);
  return (
    <SpreadBeat
      eyebrow={eyebrow}
      headline={WORLD_HEADLINE}
      standfirst={WORLD_SUB}
      // The record page's own note (not a RATIONALE_* line) — the same two strings, now in the sidebar.
      count={
        <div className="fr-why">
          <Eyebrow>Why outside first</Eyebrow>
          <p className="fr-why-text">
            We read the outside first because it is neutral ground: not our opinion, not yours. It gives an observable starting point before the internal conversation begins.
          </p>
        </div>
      }
    >
      <main className="fr-stagger fr-rows">
        {read.signals.length === 0 ? <Absent>{NO_SIGNALS_NOTE}</Absent> : null}
        {/* Stage 3b: no group column — tier order kept, the strength chip above each row in colour;
            strong rows at row-headline size, moderate/thin at body size (muted). */}
        {tiers.flatMap((g) => g.rows).map((signal) => (
          <LedgerRow
            key={signal.id}
            variant="hanging"
            leftLabel={signal.strength === "strong" ? "Outside" : "Outside"}
            lead={signalChip(signal)}
            // Gate 1: an outside excerpt renders UN-QUOTED (no false verbatim claim); stray stored
            // quote chars are trimmed so no orphan mark remains beside the attribution. Own-words
            // verbatim (provablyVerbatim) keeps its quote.
            leftBody={signal.provablyVerbatim ? signal.text : stripEdgeQuotes(signal.text)}
            quoted={signal.provablyVerbatim}
            muted={signal.strength !== "strong"}
            meta={signalTags(signal)}
          />
        ))}
      </main>
      {further.length > 0 ? (
        <div className="pt-10">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="fr-further-signals"
            onClick={() => setOpen((current) => !current)}
            className="fr-link-ink flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] transition-colors"
          >
            <span
              aria-hidden
              className="inline-block transition-transform duration-200"
              style={{ transform: open ? "rotate(90deg)" : "none" }}
            >
              &rsaquo;
            </span>
            + {further.length} further {plural(further.length, "signal", "signals")} · {counts.strong} strong · {counts.moderate} moderate · {counts.thin} thin
          </button>
          {open ? (
            <ul id="fr-further-signals" className="mt-6 border-t" style={{ borderColor: "hsl(var(--fr-hair))" }}>
              {further.map((item) => {
                const recency = formatMonthYear(item.eventDate);
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-4 border-b py-3"
                    style={{ borderColor: "hsl(var(--fr-hair))" }}
                  >
                    <span className="fr-oneline min-w-0 flex-1 text-sm font-light" style={{ color: "hsl(var(--fr-muted))" }}>
                      {item.provablyVerbatim ? item.text : stripEdgeQuotes(item.text)}
                    </span>
                    <Chip tone={item.strength}>{item.strength}</Chip>
                    {item.sourceTag ? (
                      <span className="fr-oneline hidden max-w-[180px] shrink-0 md:inline">
                        <SourceTag>{item.sourceTag.label}</SourceTag>
                      </span>
                    ) : null}
                    {recency ? (
                      <span className="hidden shrink-0 md:inline">
                        <RecencyTag>{recency}</RecencyTag>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </SpreadBeat>
  );
}

/** Score reveal — the Mojo Score scale. Stage 3: the sidebar carries eyebrow → the number (ScoreNow,
 *  display size, band as subline) → headline → standfirst → ANCHOR_LINE → RATIONALE_SCORE; the right
 *  column is the VerticalScale (five bands from scoreBands.ts, marker at the score). Same strings. */
// SIGNED 2 (stage 3c): the beat-15 eyebrow string. The nav label ("Mojo Score") is unchanged.
const SCORE_EYEBROW = "MojoScore™"; // signed

export function ScoreReveal({ read, eyebrow }: { read: FirstReadPreviewData; eyebrow?: ReactNode }) {
  void eyebrow; // the view passes the nav label; the signed eyebrow string renders instead
  const score = read.score?.value ?? null;
  const active = score !== null ? bandForScore(score) : null;
  // S1: the empty state is grounded in the outside-score PRODUCER record (first_read_outside_score) —
  // 'ineligible' → the producer ran and <10 outside signals cleared the floor (NOT_ENOUGH); no record →
  // the producer never fired (NO_SCORE). Never baseline-ran-ness, never absent-by-omission: the Mojo
  // Score beat is always mounted (product law). A present score row renders the band, not a note.
  const emptyNote = read.outsideScoreState === "ineligible" ? NOT_ENOUGH_SIGNAL_NOTE : NO_SCORE_NOTE;
  return (
    <Spread
      eyebrow={SCORE_EYEBROW}
      // The Mojo Score number lives here, in its own beat (ruling 2026-08-20) — exactly once.
      lead={read.score ? <ScoreNow now={read.score.value} band={active?.name} display /> : undefined}
      title={withStop("One number, read from the record.")}
      lede="The Mojo Score is the likelihood your strategy succeeds. In this phase it is read only from public signals — it moves when evidence lands, not when opinion changes."
      statement={ANCHOR_LINE}
      aside={<BeatWhy plain>{RATIONALE_SCORE}</BeatWhy>}
    >
      <div className="fr-stagger">
        {score === null ? (
          <div className="mb-10">
            <Absent>{emptyNote}</Absent>
          </div>
        ) : null}
        {/* Stage 3g (signed): the "{company} · {score}" marker label is retired; the dot carries the score. */}
        <VerticalScale bands={SCORE_BANDS} score={score} activeName={active?.name ?? null} />
      </div>
    </Spread>
  );
}

/** A3: the headline follows the persisted type counts — NEVER a disagreement headline over
 *  zero disagreements. contradicted > 0 → disagree; else unechoed > 0 → "record doesn't echo";
 *  else confirmed > 0 → "record backs you"; else neutral. */
function gapHeadline(c: FRGapCounts): string {
  // RESOLVED-STATES-ONLY (2026-08-27): the headline follows the CLIENT-VISIBLE counts only. A
  // re-verifying statement is off the client surface entirely (operator workbench), so it never
  // drives the headline — ActGap always passes visibleCounts (reverifying = 0) here.
  if (c.contradicted > 0) return GAP_HEADLINE_DISAGREE;
  if (c.unechoed > 0) return GAP_HEADLINE_UNECHOED;
  if (c.confirmed > 0) return GAP_HEADLINE_BACKED;
  return GAP_HEADLINE_NEUTRAL;
}
/** A3: standfirst NAMES the counts (only the non-zero VISIBLE categories; re-verifying is off the
 *  client surface — see ActGap's resolved-states-only note). */
function gapStandfirst(c: FRGapCounts): string {
  const parts: string[] = [];
  if (c.contradicted) parts.push(`${c.contradicted} disputed`);
  if (c.unechoed) parts.push(`${c.unechoed} not echoed`);
  if (c.confirmed) parts.push(`${c.confirmed} echoed`);
  const tally = parts.length ? ` ${parts.join(" · ")}.` : "";
  return `What you tell the world on your own channels, next to what the world says back.${tally}`;
}

/** Beat 4 right column: a statement's public evidence. Not-echoed → the signed record-silent line
 *  once. Confirmed/contradicted → every pair listed (source tag + most-recent + STATUS DISPUTED
 *  chip per pair). Nothing hidden — one visible entry per pair beneath its statement. */
// The contradiction "why" under a contradicted statement's declared text: signed eyebrow + muted
// italic line. `text` is the grounded judged reason, or the derived fallback (chosen in ActGap).
function ContradictionWhy({ text }: { text: string }) {
  return (
    <div className="mt-6">
      <Eyebrow>{WHY_CONFLICT_LABEL}</Eyebrow>
      <p className="mt-2 max-w-md text-sm font-light italic leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
        {text}
      </p>
    </div>
  );
}

function StatementEvidence({ statement, struck = [] }: { statement: FRGapStatement; struck?: FRGapPair[] }) {
  // Record-silent = no ACTIVE evidence pair. RELEVANCE BACKSTOP (operator ruling 2026-08-25):
  // relevance-'orthogonal' pairs are omitted upstream (groupGapStatements never adds them to
  // `evidence`), so an all-struck statement arrives here with empty evidence and shows the clean
  // doesn't-echo empty state — the line-through-in-place render is retired on the client surface.
  // Only unechoed (genuinely publicly-silent) statements reach here with empty evidence — reverifying
  // statements are excluded from the client render entirely (resolved-states-only, 2026-08-27), so
  // they never reach this per-row path.
  // OPERATOR OVERRIDE (stage 3, 2026-09-03): the struck pairs render ONLY under the admin preview
  // (StruckPairsBlock is context-gated — null everywhere else), so the client empty state is unchanged.
  if (statement.evidence.length === 0) {
    return (
      <>
        <p className="fr-quote-muted text-lg font-light leading-relaxed">{RECORD_SILENT_NOTE}</p>
        <StruckPairsBlock pairs={struck} />
      </>
    );
  }
  // The contradiction "why" (judged reason, grounded; derived line as fallback) renders in the LEFT
  // column under the declared statement (see ActGap's leftExtra) — NOT here in the evidence column.
  return (
    <div className="flex flex-col gap-8">
      {statement.evidence.map((pair) => {
        const recency = formatMonthYear(pair.eventDate);
        return (
          <div key={pair.id}>
            <div className="mb-3 flex flex-wrap items-center gap-4">
              {/* Chip dedup (2026-08-26, retires item 30): the STATUS DISPUTED chip renders ONCE per
                  statement (in ActGap's meta), not per pair. */}
              {pair.sourceTag ? <SourceTag>{pair.sourceTag.label}</SourceTag> : null}
              {recency ? <RecencyTag>{recency}</RecencyTag> : null}
              {/* Operator-only (context-gated): Strike, or provenance + Withdraw on an operator-spared pair. */}
              <OperatorPairMeta pair={pair} />
            </div>
            {/* LISTING CLASS (shape d): a listing observed side renders as a listing — never the record paragraph. */}
            {pair.listing ? (
              <ListingRow listing={pair.listing} sourceTag={null} extra={<OperatorKindTag kind="listing" reason={null} />} />
            ) : pair.record ? (
              <p className="text-lg font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
                {pair.record}
              </p>
            ) : null}
          </div>
        );
      })}
      <StruckPairsBlock pairs={struck} />
    </div>
  );
}

export function ActGap({ read, eyebrow }: { read: FirstReadPreviewData; eyebrow?: ReactNode }) {
  // RESOLVED-STATES-ONLY (operator ruling 2026-08-27, SUPERSEDES A2's display treatment): the CLIENT
  // surface shows ONLY resolved states — verdict rows with visible evidence, and not-echoed rows.
  // 'reverifying' is process narration (misattributed under YOU SAY) and indefinite while its sources
  // stay walled — that is operator workbench, not client content. The reverifying DATA STATE is
  // UNCHANGED and remains law: groupGapStatements still computes it, and the held-echo carve-out is
  // still load-bearing — it keeps these held rows OUT of a false 'not echoed'. Only the client RENDER
  // is removed here. The held set stays fully queryable; item 23 (operator-only view) is its pending
  // on-screen home. Counts/headline/standfirst below describe the VISIBLE surface only.
  const visible = read.gapStatements.filter(
    (s): s is FRGapStatement & { verdict: "confirmed" | "contradicted" | "unechoed" } => s.verdict !== "reverifying",
  );
  // Client-visible counts = the DATA counts with reverifying zeroed. gapCounts is the count authority
  // (the hook computes it from the same statements); contradicted/unechoed/confirmed already exclude
  // reverifying (verdicts are mutually exclusive), so only reverifying is dropped from the client copy.
  const visibleCounts: FRGapCounts = { ...read.gapCounts, reverifying: 0 };
  // OPERATOR OVERRIDE (stage 3): struck pairs by statement, from the raw pairs (they are omitted from
  // `evidence` upstream). Consumed only by the context-gated operator block — inert on client surfaces.
  const struckByStatement = struckPairsByStatement(read.gapPairs);
  // Stage 3: statements are already ordered contradicted → not-echoed → confirmed, so grouping by
  // verdict is a run split (no reorder). The group header word is the statement chip's own verdict
  // label (VERDICT_LABEL), drawn by CSS from the attribute; chips stay on every statement.
  const groups = runsBy(visible, (s) => s.verdict);
  return (
    <SpreadBeat
      eyebrow={eyebrow}
      // No score in the gap (ruling 2026-08-20): the Mojo Score is introduced at its own
      // beat (beat 7). The gap renders only its integrity note or the pairs.
      headline={gapHeadline(visibleCounts)}
      // Signed (string sheet, 2026-08-21). Standfirst NAMES the visible counts.
      standfirst={gapStandfirst(visibleCounts)}
      rationale={RATIONALE_GAP}
    >
      {/* Coherence note (2026-08-22): a rung-1 status conflict with ZERO contradicted statements —
          the dispute is source-vs-source, not your-words-vs-record. Shown ONLY in that clean case.
          BOTH gates read the DATA state (read.gapCounts), NOT the rendered surface: a held contradiction
          is SUPPRESSED, not RESOLVED, so while DATA reverifying > 0 the note's "nothing you've said
          publicly is contradicted here" claim would still be false. (contradicted is DATA-keyed too —
          a contradicted statement always carries visible evidence, so DATA == visible for it.) The note
          returns naturally once the re-crawl restores evidence and the DATA reverifying count reaches 0. */}
      {read.statusConflicts.length > 0 && read.gapCounts.contradicted === 0 && read.gapCounts.reverifying === 0 ? (
        <p className="mb-12 max-w-2xl text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
          {STATUS_VS_GAP_COHERENCE_NOTE}
        </p>
      ) : null}
      <main className="fr-stagger fr-rows">
        {read.gapStatements.length === 0 ? (
          <Absent>
            {read.gapIntegrity === "couldnt_check"
              ? GAP_COULDNT_CHECK_NOTE
              : read.gapIntegrity === "looked_none"
                ? GAP_LOOKED_NONE_NOTE
                : NO_PAIRS_NOTE}
          </Absent>
        ) : null}
        {/* One row per RESOLVED STATEMENT. Confirmed/contradicted statements list their pair evidence
            beneath; not-echoed statements carry the signed record-silent line once. Re-verifying
            statements are excluded above (operator workbench) — no rows, no group, no note. */}
        {/* Stage 3b: no label column — statements fill the column; the verdict chip sits ABOVE each. */}
        {groups.flatMap((g) => g.items).map((statement) => {
          // The contradiction "why" — THREE TIERS: (1) the freshly generated grounded "what differs"
          // explanation; else (2) the stored grounded judged reason; else (3) the derived line. Null
          // for confirmed/not-echoed. Rendered under the declared text (leftExtra).
          const why = statement.verdict === "contradicted"
            ? conflictExplanationFor(statement) ?? judgedContradictionReason(statement) ?? deriveContradictionWhy(statement)
            : null;
          return (
            <LedgerRow
              key={statement.statementId}
              variant="hanging"
              dataVerdict={statement.verdict}
              leftLabel="You say"
              // One STATUS DISPUTED chip per statement, set only when the statement has VISIBLE evidence.
              lead={
                <>
                  <VerdictChip verdict={statement.verdict} />
                  {statement.statusDisputed ? <StatusDisputedChip /> : null}
                </>
              }
              leftBody={statement.declared || UNSPOKEN_LEFT}
              quoted={statement.declared !== ""}
              // Weight (signed, stage 3): not-echoed reads ink/bold, echoed reads steel/regular.
              muted={statement.verdict === "confirmed"}
              leftExtra={why ? <ContradictionWhy text={why} /> : null}
              meta={null}
              rightContent={<StatementEvidence statement={statement} struck={struckByStatement.get(statement.statementId) ?? []} />}
            />
          );
        })}
      </main>
      {/* R4 — the reverse arrow, "Raised by the record" (2026-08-27): the say-vs-see MIRROR half. Renders
          the record statements that raise something the declared voice is silent on. RESOLVED-STATES LAW:
          only active-backed rows reach read.reverseRows (backstage/screened are excluded in the hook), so
          the section is absent when empty. NO verdict chip (unearned — neither confirmed nor contradicted);
          source tag is real host + read date or hidden. The count is a DISTINCT sub-count, never merged
          into the say-vs-see standfirst tally above. */}
      {read.reverseRows.length > 0 ? (
        <section className="mt-16 border-t pt-12" style={{ borderColor: "hsl(var(--fr-hair))" }}>
          <Eyebrow>{REVERSE_SECTION_LABEL}</Eyebrow>
          <p className="mt-4 mb-2 max-w-2xl text-lg font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
            {REVERSE_INTRO}
          </p>
          <p className="mb-8 text-sm font-light" style={{ color: "hsl(var(--fr-muted))" }}>
            {read.reverseRows.length} raised by the record.
          </p>
          <div className="fr-stagger flex flex-col">
            {read.reverseRows.map((row) => (
              <div key={row.id} className="fr-row fr-reverse-row border-b py-8" style={{ borderColor: "hsl(var(--fr-hair))" }}>
                <p className="text-lg font-light leading-relaxed">{row.statement}</p>
                {row.sourceTag ? <div className="mt-3"><SourceTag>{row.sourceTag.label}</SourceTag></div> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </SpreadBeat>
  );
}

// RESOLVED-STATES-ONLY (2026-08-27): the client-side ReverifyingGroup was DELETED (not gated) — there
// is no operator surface to move it to yet, and a dead client component invites drift. The re-verifying
// DATA state is untouched (groupGapStatements + the held-echo carve-out still compute and protect it);
// its on-screen home is deferred to item 23 (operator-only view), which will build fresh from the query.

/** Base gate — interstitial beat between Act 3 (Gap) and Act 4. Stage 3: a Spread — sidebar carries
 *  both existing eyebrows (the beat label, then "Before the map"), the headline, the two paragraphs
 *  and the BeatWhy rationale; the right column is the existing BaseAlignment (toggle + SVG + caption). */
/** The base's public-read tag: the latest of the three commitment reads' existing "Public read · date"
 *  tags (positioning / strategy / promise), or null when none has rendered. Existing strings only. */
function basePublicReadTag(read: FirstReadPreviewData): { label: string } | null {
  const tags = [read.positioning?.sourceTag, read.strategy?.sourceTag, read.promise?.sourceTag].filter(
    (t): t is { label: string } => !!t && !!t.label,
  );
  if (tags.length === 0) return null;
  const when = (t: { label: string }) => Date.parse(t.label.split("·").slice(1).join("·").trim()) || 0;
  return tags.reduce((best, t) => (when(t) > when(best) ? t : best));
}

export function BaseGate({ eyebrow, read }: { eyebrow?: ReactNode; read?: FirstReadPreviewData }) {
  const tag = read ? basePublicReadTag(read) : null;
  return (
    // L2 (stage 3d): one sidebar eyebrow; "Before the map" is the body's foot line. Stage 3e: the
    // public-read tag joins it on the same line (the " · " is CSS content, never DOM text).
    <Spread
      eyebrow={eyebrow}
      title={<>A strong base <span>changes your odds<span className="fr-stop">.</span></span></>}
      lede={<>Every choice downstream inherits its strength — or its cracks. Aligning it comes first.</>}
      statement={<>Your base is the four commitments everything else stands on — what you&rsquo;re doing, who it&rsquo;s for, why you win, what you promise.</>}
      aside={<BeatWhy plain>{RATIONALE_BASE}</BeatWhy>}
      foot={<>Before the map{tag ? <><span className="fr-foot-sep" aria-hidden />{tag.label}</> : null}</>}
    >
      <div className="fr-stagger flex w-full flex-col items-center">
        {/* R1: marketNote (MARKET_POINTER_NOTE) removed — "Who you serve" now precedes the Base. */}
        <BaseAlignment
          pairs={allUntestedPairs(PAIRS_UNCOMPUTED_TITLE)}
          caption={PAIRS_UNCOMPUTED_CAPTION}
          goalCaption="When your base is aligned, you look like one company."
        />
      </div>
    </Spread>
  );
}

/** Questions beat — the open questions this read raises (own beat per the beat order). */
export function ActQuestions({ read, eyebrow }: { read: FirstReadPreviewData; eyebrow?: ReactNode }) {
  return (
    <SpreadBeat
      eyebrow={eyebrow}
      headline="Questions this read raises."
      standfirst={QUESTIONS_STANDFIRST}
      rationale={RATIONALE_QUESTIONS}
    >
      <main className="fr-stagger">
        {/* SIGNED 5 (stage 3c): the status-conflict banner no longer renders here — it renders on
            beats 2 (cold-open ladder) and 6 (findings). The integrity gate below is unchanged. */}
        {read.questions.length === 0 ? (
          // Integrity-grounded empty state (never array emptiness alone): not-yet vs looked-and-none vs
          // couldn't-check, from first_read_open_questions integrity (open-questions-step finalize).
          read.statusConflicts.length === 0 ? (
            <Absent>
              {read.openQuestionsIntegrity === "couldnt_check"
                ? QUESTIONS_COULDNT
                : read.openQuestionsIntegrity === "looked_none"
                  ? QUESTIONS_LOOKED_NONE
                  : NO_QUESTIONS_NOTE}
            </Absent>
          ) : null
        ) : (
          // L5 (stage 3d): two columns (grid 1fr 1fr) on ≥lg, the list split in halves so the reading
          // order runs down the left column then the right; one column below lg. Numerals are text.
          <div className="fr-questions-grid">
            {[read.questions.slice(0, Math.ceil(read.questions.length / 2)), read.questions.slice(Math.ceil(read.questions.length / 2))]
              .filter((half) => half.length > 0)
              .map((half, h) => (
                <ol key={h} className="fr-questions">
                  {half.map((question, i) => {
                    const index = h === 0 ? i : Math.ceil(read.questions.length / 2) + i;
                    return (
                      <li key={question} className="flex gap-6">
                        <span className="fr-question-num fr-mono">{String(index + 1).padStart(2, "0")}</span>
                        <p>{question}</p>
                      </li>
                    );
                  })}
                </ol>
              ))}
          </div>
        )}
      </main>
    </SpreadBeat>
  );
}

// The CLOSER — the what's-next bookend (2026, signed). The marker has advanced: the first meeting
// is DONE, Diagnose is up next, and Focus/Flow are laid out with real substance (sublines, draft
// timing chips, sub-step lists). Same whole-path track as the opener; identical outcome hand-off.
// Eyebrow "Before you go" is rendered HERE (BEATS["next"].label stays "Next move" for the nav/forward
// link; the parent suppresses its auto-eyebrow for this beat). `isLast` is still passed by the parent
// (unused now — the end-marker line was dropped per ruling); kept optional so <ActNext/> fixtures render.
export function ActNext({ isLast }: { isLast?: boolean }) {
  void isLast;
  // Stage 3b: the same four NEXT_STATIONS on a FlowLine — label (chip) · title · body · timing ·
  // bullets per column; the highlight is the NEXT station (Diagnose, state "here"). The outcome
  // hand-off is the dark card; the pricing paragraph is the foot line. Every string as before.
  return (
    <Screen tone="paper" eyebrow="Before you go">
      <header className="fr-arc-head">
        <h1 className="fr-display fr-h1">
          {"Here's what happens"} <span>next<span className="fr-stop">.</span></span>
        </h1>
        <p className="fr-lede">
          We&rsquo;ve named the gaps. Here&rsquo;s the work that turns them into a grounded choice —
          what happens in each phase, and what we&rsquo;ll need from you.
        </p>
      </header>

      <div className="fr-arc-path">
        <FlowLine numerals stations={NEXT_STATIONS.map((s) => ({ key: s.label, state: s.state }))} />
        <div className="fr-flow-cols" style={flowColumns(NEXT_STATIONS.length)}>
          {NEXT_STATIONS.map((s) => (
            // L6: the highlighted card is the Up-next station only (state "here"), never the done one.
            <div key={s.label} className="fr-flow-col" data-state={s.state}>
              {s.state === "done" ? <span className="fr-flow-chip" aria-hidden>✓</span> : null}
              {s.pill ? <span className="fr-flow-chip fr-flow-chip--pill">{s.pill}</span> : null}
              {s.chip ? <span className="fr-flow-chip">{s.chip}</span> : null}
              <p className="fr-flow-title">{s.label}</p>
              {s.blurb ? <p className="fr-flow-blurb">{s.blurb}</p> : null}
              {s.subline ? <p className="fr-flow-blurb">{s.subline}</p> : null}
              {/* Stage 3e: one mono faint line — the timing string and its note, joined by a CSS " · "
                  (the separator is content, never DOM text). No chip border, no italic. */}
              {s.timing ? (
                <p className="fr-flow-timing fr-mono">
                  <span>{s.timing}</span>
                  {s.context ? <span className="fr-timing-context">{s.context}</span> : null}
                </p>
              ) : null}
              {s.substeps ? (
                <ul className="fr-substeps">
                  {s.substeps.map((step) => (
                    <li key={step.title} className="fr-substep">
                      <span className="fr-substep-marker" data-gate={step.gate ? "true" : undefined} aria-hidden />
                      <span>
                        <span className="fr-substep-title">{step.title}</span>
                        {step.detail ? <span className="fr-substep-detail"> — {step.detail}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <OutcomeBlock tone="dark" note="The next step is a conversation, not a button." />

      {/* The pricing paragraph as the foot line (the same two strings, below a hairline). */}
      <div className="fr-expect fr-expect--foot">
        <Eyebrow>What to expect · draft</Eyebrow>
        <p className="fr-expect-text fr-mono">
          You pay for the <span>map, not the hour</span>: a one-time setup to
          build your base, then <span>per market</span> you take on. Interview
          and survey costs are passed through. Timing depends on access to the right people and documents.
        </p>
      </div>
    </Screen>
  );
}
