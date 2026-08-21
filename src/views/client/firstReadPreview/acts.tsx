// First Read (8-beat) — the beats, rendering REAL data with persisted-
// integrity empty states. Ported from mojomap-redesign src/pages/first-read/
// acts.tsx @ 1f54a56; every fixture-specific string dropped. Signed generic
// copy (headlines, standfirsts, phases, closing line, base definition, band
// strings) ported verbatim. Empty-state strings signed per the operator string
// sheet (2026-08-21); the findings standfirst is the sole HELD string.

import { useState, type ReactNode } from "react";
import {
  Absent,
  ActHeader,
  Eyebrow,
  LedgerRow,
  RecencyTag,
  ScoreNow,
  SourceTag,
  VerdictChip,
} from "./primitives";
import BaseAlignment, { allUntestedPairs } from "./BaseAlignment";
import { SCORE_BANDS, SCORE_LEVERS, bandForScore } from "./scoreBands";
import { foldByHostDate, formatMonthYear } from "./mapping";
import type { FirstReadPreviewData, FRGapCounts, FRGapStatement, FRSignal, FRStatusConflict } from "./types";

// S5 — a small chip marking a row whose backing references a location with a live status conflict.
function StatusDisputedChip() {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
      style={{ background: "hsl(347 77% 50% / 0.10)", color: "hsl(347 77% 42%)" }}
    >
      Status disputed
    </span>
  );
}

// "host · date" once, with " ×N" when N>1 raw signal rows fold into it (display only).
function foldedSourceLine(g: { host: string; date: string | null; count: number }): string {
  return `${g.host}${g.date ? ` · ${g.date}` : ""}${g.count > 1 ? ` ×${g.count}` : ""}`;
}

// S4 — the pinned status-conflict banner (top of Questions + Findings). Both source sets, no verdict.
function StatusConflictBanner({ conflicts }: { conflicts: FRStatusConflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <div className="mb-12 flex flex-col gap-6">
      {conflicts.map((c) => (
        <div key={c.location} className="rounded-lg border-l-4 p-6" style={{ borderColor: "hsl(347 77% 50%)", background: "hsl(347 77% 50% / 0.04)" }}>
          <div className="mb-3"><StatusDisputedChip /></div>
          <p className="max-w-2xl text-lg font-medium leading-snug">{c.question}</p>
          {/* S4 (2026-08-21): fold identical host+date rows on DISPLAY (×N); the underlying
              duplicate signal rows are untouched. "+n more" counts folded groups, not raw rows. */}
          <div className="mt-5 grid gap-6 text-xs md:grid-cols-2" style={{ color: "hsl(var(--fr-muted))" }}>
            <div>
              <p className="fr-eyebrow mb-2">Reported closed</p>
              {foldByHostDate(c.closed).map((g, i) => (
                <p key={i}>{foldedSourceLine(g)}</p>
              ))}
            </div>
            <div>
              <p className="fr-eyebrow mb-2">Still listed open</p>
              {foldByHostDate(c.open).slice(0, 6).map((g, i) => (
                <p key={i}>{foldedSourceLine(g)}</p>
              ))}
              {foldByHostDate(c.open).length > 6 ? <p>+{foldByHostDate(c.open).length - 6} more</p> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

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
const NO_QUESTIONS_NOTE = "No open questions generated yet."; // signed
// ── "What we see" public-beats group (public-beats gate) — SIGNED ──
const WHAT_WE_SEE_STANDFIRST =
  "What we see: our read of your public record — your own channels, the market you're in, and how you position. Every line says where it came from."; // signed
const LABEL_CHANNELS = "Your channels, as we read them"; // signed
const LABEL_MARKETS = "Markets"; // signed
const LABEL_POSITIONING = "Positioning"; // signed
const LABEL_STRATEGY = "Strategy"; // signed
const LABEL_PROMISE = "Promise"; // signed
// Ruling 1 (2026-08-21): no distinct promise field in the canvas → render this verbatim, no source tag.
const PROMISE_NOT_ENOUGH = "Not enough information to create promise."; // signed
// GATE (2026-08-21): positioning + strategy render only from a CONFIRMED public-only row (gate 6a).
// Until then beat 9 shows these signed lines verbatim, no source tag, no body.
const POSITIONING_NOT_ENOUGH = "Not enough public information to read positioning."; // signed
const STRATEGY_NOT_ENOUGH = "Not enough public information to read strategy."; // signed
const LABEL_BASE = "Where you stand (inferred)"; // signed
const BASE_INFERRED_LABEL = "Inferred from your public record."; // signed
// ── Standalone-beat copy (council beat-order ruling) — SIGNED ──
const WORLD_HEADLINE = "What the world says."; // signed
const WORLD_SUB = "From reviews, listings, press and the places people talk about you."; // signed
const YOUSAY_HEADLINE = "What you say."; // signed
const YOUSAY_SUB = "Read from your own channels — your site, your socials, your listings."; // signed
const SERVE_HEADLINE = "Who you serve."; // signed
const SERVE_SUB = "Groups of people trying to get something done — and the job they're hiring you for."; // signed
const OURREAD_HEADLINE = "Our read."; // signed
const OURREAD_SUB = "What we'd posit about your positioning, strategy and promise — hypotheses for the room to test, not verdicts."; // signed
// Beat 9 opens with the COMPLETE BaseGate (headline + framing + BaseAlignment illustration).
const MARKET_POINTER_NOTE = "Who you serve — see above"; // signed
const WHERE_HEADLINE = "Where you stand."; // signed
const NO_CHANNELS_NOTE = "We haven't read your own channels yet."; // signed
// OW-3 (2026-08-20) — beat 3 own-words. SIGNED.
const OWN_WORDS_NONE_NOTE = "We read your channels but found no verbatim self-descriptions to quote yet."; // signed
const IN_YOUR_WORDS_LABEL = "In your words"; // signed
const CHANNELS_AS_READ_LABEL = "Your channels, as we read them"; // signed
const NO_SERVE_NOTE = "No public markets read yet."; // signed
const NO_OURREAD_NOTE = "No public positioning, strategy or promise read yet."; // signed
// ── Findings beat (S4) — standfirst SIGNED (2026-08-21). Source counts hidden until per-finding
// corroboration is real (gate 5a, clusterer repair); claim nothing about ordering. ──
const FINDINGS_STANDFIRST = "What we read from the public record."; // signed
const NO_FINDINGS_NOTE = "No public findings surfaced yet."; // signed
const FINDINGS_SHOWN = 5;
const UNSPOKEN_LEFT = "[ No declared position on this theme ]"; // signed
// A1/A3 (2026-08-20) — beat 4 headline follows the persisted type counts. SIGNED.
const GAP_HEADLINE_DISAGREE = "Where the two readings disagree."; // contradicted > 0
const GAP_HEADLINE_UNECHOED = "What you say that the record doesn't echo."; // contradicted 0, unechoed > 0
const GAP_HEADLINE_BACKED = "Where the record backs you."; // only confirmed
const GAP_HEADLINE_NEUTRAL = "Your words next to the record."; // nothing yet
const RECORD_SILENT_NOTE = "The public record doesn't echo this yet."; // signed
const PAIRS_UNCOMPUTED_CAPTION = "Pair states not yet computed — all pairs untested"; // signed
const PAIRS_UNCOMPUTED_TITLE = "No pair verdicts computed yet — element pairs await the diagnostic."; // signed
const STANDINGS_NOTE = "Base standings not yet generated."; // signed (Phase A ruling)
const DISCUSSION_NOTE = "Discussion items not yet generated."; // signed (Phase A ruling)

const SHOWN_FULL_SIZE = 4;

function signalMeta(signal: FRSignal) {
  const recency = formatMonthYear(signal.eventDate);
  return (
    <>
      <span
        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
        style={{ background: "hsl(215 20% 65% / 0.14)", color: "hsl(var(--fr-muted))" }}
      >
        {signal.strength} signal
      </span>
      {signal.sourceTag ? <SourceTag>{signal.sourceTag.label}</SourceTag> : null}
      {recency ? <RecencyTag>{recency}</RecencyTag> : null}
    </>
  );
}

/** Cold open — one outside statement, full screen, before Act 1. */
export function ColdOpen({ read, onContinue }: { read: FirstReadPreviewData; onContinue: () => void }) {
  const recency = formatMonthYear(read.coldOpen?.eventDate ?? null);
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
      <div className="fr-stagger flex max-w-2xl flex-col items-center">
        <Eyebrow>Before we start</Eyebrow>
        <h1 className="mt-6 text-5xl font-extralight tracking-tight md:text-6xl">
          Here&rsquo;s what we can <span className="font-semibold">already see.</span>
        </h1>
        {read.coldOpen ? (
          <blockquote className="mt-16 max-w-xl">
            <p className="text-2xl font-light leading-relaxed" style={{ color: "hsl(222 47% 25%)" }}>
              &ldquo;{read.coldOpen.text}&rdquo;
            </p>
            <footer className="mt-6 flex flex-col items-center gap-2">
              {/* S5 — the featured cold-open item carries the disputed marker too. */}
              {read.coldOpen.statusDisputed ? <StatusDisputedChip /> : null}
              {read.coldOpen.sourceTag ? <SourceTag>{read.coldOpen.sourceTag.label}</SourceTag> : null}
              {recency ? <RecencyTag>{recency}</RecencyTag> : null}
            </footer>
          </blockquote>
        ) : (
          <div className="mt-16 w-full max-w-xl">
            <Absent>{NO_SIGNALS_NOTE}</Absent>
          </div>
        )}
        <button
          type="button"
          onClick={onContinue}
          className="fr-link-ink group mt-20 text-xs font-bold uppercase tracking-[0.2em] transition-colors"
        >
          Now here&rsquo;s what the world says{" "}
          <span className="inline-block transition-transform group-hover:translate-x-1">&rarr;</span>
        </button>
      </div>
    </div>
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
 * "What we see" — the public-register group (public-beats gate, 2026-08-20). Every
 * sub-section is public provenance and labelled OUR READ; each carries a source tag and
 * unmounts when its object is absent. There is NO "what you say" beat (R2): own-words
 * extraction ships in a separate gate.
 */
export function ActWhatWeSee({ read }: { read: FirstReadPreviewData }) {
  const p = read.positioning;
  const st = read.strategy;
  const pr = read.promise;
  const b = read.whereYouStand;
  return (
    <>
      <ActHeader headline="What we see." standfirst={WHAT_WE_SEE_STANDFIRST} />
      <main className="fr-stagger">
        {/* Your channels, as we read them (R3: junk hidden in the hook) */}
        <WeSeeSection label={LABEL_CHANNELS} show={read.declared.length > 0}>
          {read.declared.map((claim) => (
            <LedgerRow
              key={claim.id}
              leftLabel="Our read"
              leftBody={claim.statement}
              meta={claim.sourceTag ? <SourceTag>{claim.sourceTag.label}</SourceTag> : null}
            />
          ))}
        </WeSeeSection>

        {/* Markets — ODI form: people getting a job done (never a quote) */}
        <WeSeeSection label={LABEL_MARKETS} show={read.observedMarkets.length > 0}>
          <div className="flex flex-col gap-8">
            {read.observedMarkets.map((m) => (
              <div key={m.id} className="flex flex-col gap-2">
                <p className="max-w-xl text-2xl font-semibold leading-snug">{m.who}</p>
                {m.job ? (
                  <p className="max-w-xl text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
                    {m.job}
                  </p>
                ) : null}
                {m.sourceTag ? <SourceTag>{m.sourceTag.label}</SourceTag> : null}
              </div>
            ))}
          </div>
        </WeSeeSection>

        {/* Positioning — the market_read canvas */}
        <WeSeeSection label={LABEL_POSITIONING} show={!!p}>
          {p?.category ? <p className="text-2xl font-semibold leading-snug">{p.category}</p> : null}
          {p?.value ? (
            <p className="mt-3 max-w-xl text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>{p.value}</p>
          ) : null}
          {p && p.differentiators.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {p.differentiators.map((d, i) => (
                <li key={i} className="text-sm font-light" style={{ color: "hsl(222 47% 25%)" }}>· {d}</li>
              ))}
            </ul>
          ) : null}
          {p?.sourceTag ? <div className="mt-4"><SourceTag>{p.sourceTag.label}</SourceTag></div> : null}
        </WeSeeSection>

        {/* Strategy — the market_read cascade */}
        <WeSeeSection label={LABEL_STRATEGY} show={!!st}>
          {st?.aspiration ? <p className="text-2xl font-semibold leading-snug">{st.aspiration}</p> : null}
          {st?.whereToPlay ? (
            <p className="mt-3 max-w-xl text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
              <span className="fr-eyebrow">Where to play</span> — {st.whereToPlay}
            </p>
          ) : null}
          {st?.howToWin ? (
            <p className="mt-2 max-w-xl text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
              <span className="fr-eyebrow">How to win</span> — {st.howToWin}
            </p>
          ) : null}
          {st?.sourceTag ? <div className="mt-4"><SourceTag>{st.sourceTag.label}</SourceTag></div> : null}
        </WeSeeSection>

        {/* Promise (ruling 1): own field when present; otherwise the signed line, no source tag. */}
        <WeSeeSection label={LABEL_PROMISE} show={!!(p || st) || !!pr?.text}>
          {pr?.text ? (
            <>
              <p className="text-2xl font-semibold leading-snug">{pr.text}</p>
              {pr.sourceTag ? <div className="mt-4"><SourceTag>{pr.sourceTag.label}</SourceTag></div> : null}
            </>
          ) : (
            <p className="text-lg font-light leading-snug" style={{ color: "hsl(var(--fr-muted))" }}>{PROMISE_NOT_ENOUGH}</p>
          )}
        </WeSeeSection>

        {/* Where you stand — inferred (R-B): persisted numbers only */}
        <WeSeeSection label={LABEL_BASE} show={!!b}>
          {b ? (
            <>
              <p className="max-w-xl text-lg font-light leading-relaxed" style={{ color: "hsl(222 47% 25%)" }}>
                {b.band} · {b.scoreValue} of 100 — {b.bandMeaning}
              </p>
              <p className="mt-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: "hsl(var(--fr-faint))" }}>
                {BASE_INFERRED_LABEL}
              </p>
              {b.sourceTag ? <div className="mt-3"><SourceTag>{b.sourceTag.label}</SourceTag></div> : null}
            </>
          ) : null}
        </WeSeeSection>
      </main>
    </>
  );
}

/**
 * Findings beat (S4) — public_inferred open findings in stored order. First 5 expanded; the rest
 * under "show all N". Each row tags its public read + date. NO source-count label: counts are
 * unearned until per-finding corroboration is real (gate 5a). No verdict language (UNDERSERVED etc.
 * never appears — findings carry no such field).
 */
export function ActFindings({ read }: { read: FirstReadPreviewData }) {
  const [showAll, setShowAll] = useState(false);
  const total = read.findings.length;
  const shown = showAll ? read.findings : read.findings.slice(0, FINDINGS_SHOWN);
  return (
    <>
      <ActHeader
        headline="What stands out."
        standfirst={FINDINGS_STANDFIRST}
        right={
          total > 0 ? (
            <div className="max-w-xs border-l pl-6 text-right" style={{ borderColor: "hsl(var(--fr-hair))" }}>
              <Eyebrow>Findings</Eyebrow>
              <p className="mt-2 text-3xl font-light">{total}</p>
            </div>
          ) : undefined
        }
      />
      <main className="fr-stagger">
        {/* S4: status conflicts pinned ABOVE findings (above recurrence). */}
        <StatusConflictBanner conflicts={read.statusConflicts} />
        {total === 0 && read.statusConflicts.length === 0 ? <Absent>{NO_FINDINGS_NOTE}</Absent> : null}
        {shown.map((f) => (
          // No source-count label: counts are unearned until gate 5a (clusterer repair). The
          // `f.recurrence` plumbing stays for 5a but nothing reads from it here.
          <LedgerRow
            key={f.id}
            leftBody={f.body}
            meta={
              <>
                {/* S5 — disputed marker when the finding references a conflicted location. */}
                {f.statusDisputed ? <StatusDisputedChip /> : null}
                {f.sourceTag ? <SourceTag>{f.sourceTag.label}</SourceTag> : null}
                {/* R4 age marker — a stale (old-dated or undated) finding is never hidden, only marked. */}
                {f.ageMarker ? (
                  <span className="fr-eyebrow" style={{ color: "hsl(var(--fr-faint))" }}>{f.ageMarker}</span>
                ) : null}
              </>
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
    </>
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
 * The empty state is grounded in the own-words integrity record (ownWordsLooked), not emptiness.
 */
export function ActWhatYouSay({ read }: { read: FirstReadPreviewData }) {
  const verbatim = read.ownWords.filter((w) => w.fidelity === "verbatim");
  const paraphrased = read.ownWords.filter((w) => w.fidelity === "paraphrased");
  const hasOwn = read.ownWords.length > 0;
  const emptyNote = read.ownWordsLooked ? OWN_WORDS_NONE_NOTE : NO_CHANNELS_NOTE;
  return (
    <>
      <ActHeader headline={YOUSAY_HEADLINE} standfirst={YOUSAY_SUB} />
      <main className="fr-stagger">
        {!hasOwn ? <Absent>{emptyNote}</Absent> : null}
        {/* Verbatim self-assertions lead — quoted, page + read date. */}
        {verbatim.map((w) => (
          <LedgerRow
            key={w.id}
            leftLabel={IN_YOUR_WORDS_LABEL}
            leftBody={w.quote}
            meta={w.sourceTag ? <SourceTag>{w.sourceTag.label}</SourceTag> : null}
          />
        ))}
        {/* Judge-faithful paraphrases — NOT quoted; labelled "as stated on {page}". */}
        {paraphrased.map((w) => (
          <LedgerRow
            key={w.id}
            quoted={false}
            leftLabel={`As stated on ${w.pageHost}`}
            leftBody={w.quote}
            meta={w.sourceTag ? <SourceTag>{w.sourceTag.label}</SourceTag> : null}
          />
        ))}
        {/* Demoted: our inference read of the channels, below the company's own words. */}
        {read.declared.length > 0 ? (
          <div className="mt-16 border-t pt-12" style={{ borderColor: "hsl(var(--fr-hair))" }}>
            <div className="mb-8"><Eyebrow>{CHANNELS_AS_READ_LABEL}</Eyebrow></div>
            {read.declared.map((claim) => (
              <LedgerRow
                key={claim.id}
                muted
                leftLabel="Our read"
                leftBody={claim.statement}
                meta={claim.sourceTag ? <SourceTag>{claim.sourceTag.label}</SourceTag> : null}
              />
            ))}
          </div>
        ) : null}
      </main>
    </>
  );
}

/** Beat 5 — "Who you serve": the ODI market rows (people + the job). */
export function ActWhoYouServe({ read }: { read: FirstReadPreviewData }) {
  return (
    <>
      <ActHeader headline={SERVE_HEADLINE} standfirst={SERVE_SUB} />
      <main className="fr-stagger">
        {read.observedMarkets.length === 0 ? <Absent>{NO_SERVE_NOTE}</Absent> : null}
        <div className="flex flex-col gap-10">
          {read.observedMarkets.map((m) => (
            <div key={m.id} className="flex flex-col gap-2">
              <p className="max-w-xl text-2xl font-semibold leading-snug">{m.who}</p>
              {m.job ? (
                <p className="max-w-xl text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>{m.job}</p>
              ) : null}
              {m.sourceTag ? <SourceTag>{m.sourceTag.label}</SourceTag> : null}
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

/** Beat 8 — "Where you stand": inferred base reading (R-B), persisted numbers only. */
/** Order the levers by headroom (max − value) desc; ties settle by canonical order
 *  (SCORE_LEVERS index) so a shuffled input still renders deterministically (W1). */
const CANONICAL_LEVER_INDEX = new Map(SCORE_LEVERS.map((l, i) => [l.key, i]));
function orderByHeadroom<T extends { key: string; value: number; max: number }>(levers: T[]): T[] {
  return [...levers].sort((a, z) => {
    const h = (z.max - z.value) - (a.max - a.value); // headroom desc
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
 * state as beat 7 (grounded in scoreLooked, never array emptiness).
 */
export function ActWhereYouStand({ read }: { read: FirstReadPreviewData }) {
  const b = read.whereYouStand;
  const emptyNote = read.scoreLooked ? NOT_ENOUGH_SIGNAL_NOTE : NO_SCORE_NOTE;
  return (
    <>
      <ActHeader headline={WHERE_HEADLINE} />
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
                    <span className="shrink-0 text-sm font-light tabular-nums" style={{ color: "hsl(222 47% 25%)" }}>
                      {fmtLeverValue(lever.value)} / {lever.max}
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
              {p.category ? <p className="text-2xl font-semibold leading-snug">{p.category}</p> : null}
              {p.value ? (
                <p className="mt-3 max-w-xl text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>{p.value}</p>
              ) : null}
              {p.differentiators.length > 0 ? (
                <ul className="mt-4 flex flex-col gap-2">
                  {p.differentiators.map((d, i) => (
                    <li key={i} className="text-sm font-light" style={{ color: "hsl(222 47% 25%)" }}>· {d}</li>
                  ))}
                </ul>
              ) : null}
              {p.sourceTag ? <div className="mt-4"><SourceTag>{p.sourceTag.label}</SourceTag></div> : null}
            </>
          ) : (
            <GatedLine>{POSITIONING_NOT_ENOUGH}</GatedLine>
          )}
        </WeSeeSection>
        <WeSeeSection label={LABEL_STRATEGY} show>
          {st ? (
            <>
              {st.aspiration ? <p className="text-2xl font-semibold leading-snug">{st.aspiration}</p> : null}
              {st.whereToPlay ? (
                <p className="mt-3 max-w-xl text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
                  <span className="fr-eyebrow">Where to play</span> — {st.whereToPlay}
                </p>
              ) : null}
              {st.howToWin ? (
                <p className="mt-2 max-w-xl text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
                  <span className="fr-eyebrow">How to win</span> — {st.howToWin}
                </p>
              ) : null}
              {st.sourceTag ? <div className="mt-4"><SourceTag>{st.sourceTag.label}</SourceTag></div> : null}
            </>
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

export function ActRecord({ read }: { read: FirstReadPreviewData }) {
  const [open, setOpen] = useState(false);
  const shown = read.signals.slice(0, SHOWN_FULL_SIZE);
  const further = read.signals.slice(SHOWN_FULL_SIZE);
  const counts = {
    strong: further.filter((s) => s.strength === "strong").length,
    moderate: further.filter((s) => s.strength === "moderate").length,
    thin: further.filter((s) => s.strength === "thin").length,
  };
  return (
    <>
      <ActHeader
        headline={WORLD_HEADLINE}
        standfirst={WORLD_SUB}
        right={
          <div className="max-w-xs border-l pl-6" style={{ borderColor: "hsl(var(--fr-hair))" }}>
            <Eyebrow>Why outside first</Eyebrow>
            <p className="mt-3 text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
              We read the outside first because it is neutral ground: not our opinion, not yours. It gives an observable starting point before the internal conversation begins.
            </p>
          </div>
        }
      />
      <main className="fr-stagger">
        {read.signals.length === 0 ? <Absent>{NO_SIGNALS_NOTE}</Absent> : null}
        {shown.map((signal) => (
          <LedgerRow
            key={signal.id}
            leftLabel={signal.strength === "strong" ? "Outside" : "Outside"}
            leftBody={signal.text}
            muted={signal.strength !== "strong"}
            meta={signalMeta(signal)}
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
            + {further.length} further signals · {counts.strong} strong · {counts.moderate} moderate · {counts.thin} thin
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
                      {item.text}
                    </span>
                    <span
                      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                      style={{ background: "hsl(215 20% 65% / 0.14)", color: "hsl(var(--fr-muted))" }}
                    >
                      {item.strength}
                    </span>
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
    </>
  );
}

/** Score reveal — the Mojo Score band ladder, between Act 2 and Act 3. */
export function ScoreReveal({ read }: { read: FirstReadPreviewData }) {
  const score = read.score?.value ?? null;
  const active = score !== null ? bandForScore(score) : null;
  const ladder = [...SCORE_BANDS].reverse();
  // S1: the empty state is grounded in a PERSISTED record — scoreLooked (a public_baseline_run
  // exists) → the read ran but didn't clear the scoring threshold; else no read yet. Never
  // absent-by-omission: the Mojo Score beat is always mounted (product law).
  const emptyNote = read.scoreLooked ? NOT_ENOUGH_SIGNAL_NOTE : NO_SCORE_NOTE;
  return (
    <>
      <ActHeader
        headline="One number, read from the record."
        standfirst="The Mojo Score is the likelihood your strategy succeeds. In this phase it is read only from public signals — it moves when evidence lands, not when opinion changes."
        subline={ANCHOR_LINE}
        // The Mojo Score number lives here, beside the title (moved from the gap header,
        // ruling 2026-08-20) — so it appears exactly once, in its own beat.
        right={read.score ? <ScoreNow now={read.score.value} band={active?.name} /> : undefined}
      />
      <div className="fr-stagger mx-auto max-w-xl">
        {score === null ? (
          <div className="mb-10">
            <Absent>{emptyNote}</Absent>
          </div>
        ) : null}
        {ladder.map((band) => {
          const isActive = active !== null && band.name === active.name;
          const fraction = score !== null ? (band.max - score) / (band.max - band.min) : 0.5;
          return (
            <div
              key={band.name}
              className={`fr-band relative flex items-center justify-between gap-10 border-b px-6 ${
                isActive ? "fr-band-active" : ""
              }`}
              style={{ borderColor: "hsl(var(--fr-hair))" }}
            >
              <span className="fr-eyebrow shrink-0">{band.min}–{band.max}</span>
              <span className="flex max-w-md flex-col text-right">
                <span className={isActive ? "text-lg font-semibold" : "text-lg font-light"} style={isActive ? undefined : { color: "hsl(var(--fr-faint))" }}>
                  {band.name}
                </span>
                <span className={`fr-band-desc mt-1 text-xs font-light leading-relaxed ${isActive ? "" : "fr-band-desc-dim"}`}>
                  {band.description}
                </span>
              </span>
              {isActive && score !== null ? (
                <span
                  className="fr-band-marker"
                  style={{ top: `${Math.min(Math.max(fraction, 0.12), 0.88) * 100}%` }}
                >
                  <span className="fr-band-marker-dot" aria-hidden />
                  <span className="fr-eyebrow" style={{ color: "hsl(var(--fr-accent))" }}>
                    {read.company?.name ?? ""} · {score}
                  </span>
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** A3: the headline follows the persisted type counts — NEVER a disagreement headline over
 *  zero disagreements. contradicted > 0 → disagree; else unechoed > 0 → "record doesn't echo";
 *  else confirmed > 0 → "record backs you"; else neutral. */
function gapHeadline(c: FRGapCounts): string {
  if (c.contradicted > 0) return GAP_HEADLINE_DISAGREE;
  if (c.unechoed > 0) return GAP_HEADLINE_UNECHOED;
  if (c.confirmed > 0) return GAP_HEADLINE_BACKED;
  return GAP_HEADLINE_NEUTRAL;
}
/** A3: standfirst NAMES the counts (only the non-zero categories). */
function gapStandfirst(c: FRGapCounts): string {
  const parts: string[] = [];
  if (c.contradicted) parts.push(`${c.contradicted} contradicted`);
  if (c.unechoed) parts.push(`${c.unechoed} not echoed`);
  if (c.confirmed) parts.push(`${c.confirmed} confirmed`);
  const tally = parts.length ? ` ${parts.join(" · ")}.` : "";
  return `What you tell the world on your own channels, next to what the world says back.${tally}`;
}

/** Beat 4 right column: a statement's public evidence. Not-echoed → the signed record-silent line
 *  once. Confirmed/contradicted → every pair listed (source tag + most-recent + STATUS DISPUTED
 *  chip per pair). Nothing hidden — one visible entry per pair beneath its statement. */
function StatementEvidence({ statement }: { statement: FRGapStatement }) {
  if (statement.verdict === "unechoed" || statement.evidence.length === 0) {
    return (
      <p className="fr-quote-muted text-lg font-light leading-relaxed">{RECORD_SILENT_NOTE}</p>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      {statement.evidence.map((pair) => {
        const recency = formatMonthYear(pair.eventDate);
        return (
          <div key={pair.id}>
            <div className="mb-3 flex flex-wrap items-center gap-4">
              {/* S5 — disputed marker per pair; the pair is NOT hidden. */}
              {pair.statusDisputed ? <StatusDisputedChip /> : null}
              {pair.sourceTag ? <SourceTag>{pair.sourceTag.label}</SourceTag> : null}
              {recency ? <RecencyTag>{recency}</RecencyTag> : null}
            </div>
            {pair.record ? (
              <p className="text-lg font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
                {pair.record}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ActGap({ read }: { read: FirstReadPreviewData }) {
  return (
    <>
      {/* No score in the gap (ruling 2026-08-20): the Mojo Score is introduced at its own
          beat (beat 7). The gap renders only its integrity note or the pairs. */}
      <ActHeader
        headline={gapHeadline(read.gapCounts)}
        // Signed (string sheet, 2026-08-21). Standfirst NAMES the counts.
        standfirst={gapStandfirst(read.gapCounts)}
      />
      <main className="fr-stagger">
        {read.gapStatements.length === 0 ? (
          <Absent>
            {read.gapIntegrity === "couldnt_check"
              ? GAP_COULDNT_CHECK_NOTE
              : read.gapIntegrity === "looked_none"
                ? GAP_LOOKED_NONE_NOTE
                : NO_PAIRS_NOTE}
          </Absent>
        ) : null}
        {/* One row per STATEMENT (2026-08-21). Confirmed/contradicted statements list their pair
            evidence beneath; not-echoed statements carry the signed record-silent line once. */}
        {read.gapStatements.map((statement) => (
          <LedgerRow
            key={statement.statementId}
            leftLabel="You say"
            leftBody={statement.declared || UNSPOKEN_LEFT}
            quoted={statement.declared !== ""}
            muted={statement.verdict === "unechoed"}
            meta={<VerdictChip verdict={statement.verdict} />}
            rightContent={<StatementEvidence statement={statement} />}
          />
        ))}
      </main>
    </>
  );
}

/** Base gate — interstitial beat between Act 3 (Gap) and Act 4. */
export function BaseGate() {
  return (
    <div className="flex flex-col items-center pt-8 text-center">
      <div className="fr-stagger flex w-full flex-col items-center">
        <Eyebrow>Before the map</Eyebrow>
        <h1 className="mt-6 text-5xl font-extralight tracking-tight md:text-6xl">
          A strong base <span className="font-semibold">changes your odds.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
          Every choice downstream inherits its strength — or its cracks. Aligning it comes first.
        </p>
        <p className="mt-8 max-w-xl text-lg font-light leading-relaxed" style={{ color: "hsl(222 47% 25%)" }}>
          Your base is the four commitments everything else stands on — what you&rsquo;re doing, who it&rsquo;s for, why you win, what you promise.
        </p>
        <BaseAlignment
          pairs={allUntestedPairs(PAIRS_UNCOMPUTED_TITLE)}
          caption={PAIRS_UNCOMPUTED_CAPTION}
          goalCaption="When your base is aligned, you look like one company."
          marketNote={MARKET_POINTER_NOTE}
        />
      </div>
    </div>
  );
}

export function ActMap({ read }: { read: FirstReadPreviewData }) {
  const band = read.score ? bandForScore(read.score.value) : null;
  return (
    <>
      <ActHeader
        headline="Where your base stands."
        right={read.score && band ? <ScoreNow now={read.score.value} band={band.name} compact /> : undefined}
      />
      <main className="fr-stagger">
        <div className="border-b pb-14" style={{ borderColor: "hsl(var(--fr-hair))" }}>
          <Absent>{STANDINGS_NOTE}</Absent>
        </div>
        <div className="pt-14">
          <Eyebrow>For discussion</Eyebrow>
          <div className="mt-8">
            <Absent>{DISCUSSION_NOTE}</Absent>
          </div>
        </div>
      </main>
    </>
  );
}

/** Questions beat — the open questions this read raises (own beat per the beat order). */
export function ActQuestions({ read }: { read: FirstReadPreviewData }) {
  return (
    <>
      <ActHeader
        headline="Questions this read raises."
        standfirst="Open questions from the public record — the threads worth taking a position on."
      />
      <main className="fr-stagger">
        {/* S4: status conflicts pinned ABOVE all questions. */}
        <StatusConflictBanner conflicts={read.statusConflicts} />
        {read.questions.length === 0 ? (
          read.statusConflicts.length === 0 ? <Absent>{NO_QUESTIONS_NOTE}</Absent> : null
        ) : (
          <ol className="space-y-8">
            {read.questions.map((question, index) => (
              <li key={question} className="flex gap-6">
                <span className="pt-1 text-[10px] font-bold tracking-widest" style={{ color: "hsl(var(--fr-faint))" }}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="text-lg font-light leading-relaxed" style={{ color: "hsl(222 47% 25%)" }}>{question}</p>
              </li>
            ))}
          </ol>
        )}
      </main>
    </>
  );
}

export function ActNext() {
  const phases = [
    { name: "Diagnose", body: "Open the inside: documents, numbers, and the people who hold the decisions." },
    { name: "Focus", body: "Align your base, define your market." },
    { name: "Flow", body: "Implement the best path — monitored and measured as evidence lands." },
  ];
  return (
    <>
      <ActHeader
        headline="What we'd do together."
        // PUBLIC-ONLY reword (signed, string sheet): told-us clause removed.
        standfirst="This read used only what anyone can see. The full diagnostic opens your side — documents, numbers, and the people who hold the decisions."
      />
      <main className="border-b pb-16" style={{ borderColor: "hsl(var(--fr-hair))" }}>
        <Eyebrow>How the work unfolds</Eyebrow>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {phases.map((phase) => (
            <li key={phase.name} className="border-b pb-6 md:border-b-0" style={{ borderColor: "hsl(var(--fr-hair))" }}>
              <span className="fr-eyebrow" style={{ color: "hsl(var(--fr-accent))" }}>{phase.name}</span>
              <p className="mt-2 text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>{phase.body}</p>
            </li>
          ))}
        </ol>
      </main>
      <p className="fr-link-ink pt-12 text-center text-sm font-light leading-relaxed">
        The next step is a conversation, not a button.
      </p>
    </>
  );
}
