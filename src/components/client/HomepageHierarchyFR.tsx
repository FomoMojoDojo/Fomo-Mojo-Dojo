// HomepageHierarchyFR — the MojoMap home in the First Read design language (home reskin, operator
// rulings 2026-09-11). SAME props as HomepageHierarchy, SAME strings, SAME derivations (imported from
// it — nothing is re-typed here): only the layout and the CSS system change.
//
//   rail  (Spread side, slate)  title {Company}. · lede DAY n · STATE (mono) · aside = the 01 · CONTEXT
//                               block (eyebrow, foundation sentence, DAY · SCORE · FOUNDATION meta line)
//   main  (Spread main)         HorizontalScale (the compass) · the hero group at display scale —
//                               THE NEXT TURN / {observe} / {name_tension} / → {open} (fallback:
//                               TwoWeightHeadline lead/tail · +n PTS) · HangingItem rows 02 · SIGNAL,
//                               03 · ROUTES
//   (Layout correction 2026-09-11: the hero is body content at display scale; the rail carries the
//   identity and the context block.)
//
// Orange → --fr-electric-sol (the one accent; no new token). The §02 CTA points at the workshop's
// Opportunities tab (href only — operator ruling). Everything else the home used to show around this
// block (Scan all surfaces, INTERACTION SPEC, the keyboard legend, the company switcher) is the
// caller's concern and lives behind the operator switch there.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { computeReachableScore, computeUnlockableScore } from "@/lib/mojoScore/projections";
import { CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE } from "@/lib/clientRefinePreview";
import { Chip, Eyebrow, TwoWeightHeadline } from "@/views/client/firstReadPreview/primitives";
import { HangingItem, HorizontalScale, Spread, withStop } from "@/views/client/firstReadPreview/primitives-editorial";
import {
  adaptTeamLanguage,
  claimStateToHomepageState,
  deriveDetourLabel,
  engagementPhaseToHomepageState,
  foundationNarrative,
  topOpportunityAttribution,
  type HomepageHierarchyProps,
} from "./HomepageHierarchy";

/** The §02 CTA destination — the workshop's Opportunities tab (was /legacy/opportunities). */
export const HOME_SIGNAL_CTA_HREF = `${CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE}?tab=needs`;

/** The "→ open" line: the arrow is electric-sol; the phrase after the em-dash (if any) is accented, as
 *  the CRPV home did with its orange (renderOpenWithAccent). */
function OpenLine({ text }: { text: string }) {
  const dash = text.indexOf(" — ");
  const body = dash >= 0
    ? <>{text.slice(0, dash)}<span className="fr-home-arrow">{text.slice(dash)}</span></>
    : text;
  return (
    <p className="fr-lede fr-home-open">
      <span className="fr-home-arrow">→ </span>{body}
    </p>
  );
}

/** FR-only extras: the rail's identity. `railTitle` is the company name (title, with the green stop);
 *  `railDay` / `railState` are the same values the shell identity string carries — the lede renders
 *  them as `DAY {n | —} · {STATE}`, the inventory string minus its bracketed name (which is the title). */
export type HomepageHierarchyFRProps = HomepageHierarchyProps & {
  railTitle?: string | null;
  railDay?: number | null;
  railState?: string | null;
};

export function HomepageHierarchyFR({
  railTitle,
  railDay,
  railState,
  score,
  dominantClaimState,
  engagementPhase,
  foundationStatus,
  signalLandscape,
  directionEvidence,
  topNeed,
  needCount,
  engagementDay,
  nextTurnOverride,
  insightNextTurn,
  audienceShort,
  memberCount = 1,
  onGoToRoutes,
  navSlot,
}: HomepageHierarchyFRProps) {
  const reachable  = computeReachableScore(score);
  const unlockable = computeUnlockableScore(reachable, score);
  const current    = Math.round(score.total_score);
  const dayCount: number | null = engagementDay ?? null;
  const isSolo     = memberCount <= 1;
  const state = dominantClaimState
    ? claimStateToHomepageState(dominantClaimState)
    : engagementPhaseToHomepageState(engagementPhase);
  const raiser         = score.projected_raisers[0] ?? null;
  const scoreLift      = raiser?.estimated_points ?? 0;
  const nextTurnAction = nextTurnOverride ?? raiser?.action_description ?? null;

  // ── hero: THE NEXT TURN (body, display scale) ───────────────────────────────────────────────────
  let heroTitle: ReactNode = null;
  let heroStatement: ReactNode = null;
  let heroAside: ReactNode = null;
  if (insightNextTurn) {
    heroTitle = withStop(adaptTeamLanguage(insightNextTurn.observe, isSolo));
    heroStatement = adaptTeamLanguage(insightNextTurn.name_tension, isSolo);
    heroAside = <OpenLine text={adaptTeamLanguage(insightNextTurn.open, isSolo)} />;
  } else if (nextTurnAction) {
    const adapted = adaptTeamLanguage(nextTurnAction, isSolo);
    const sentenceMatch = adapted.match(/^(.+?[.!?])\s+(.+)$/s);
    const words = adapted.split(" ");
    const cut = Math.max(2, Math.ceil(words.length * 0.55));
    const lead = sentenceMatch ? sentenceMatch[1] : words.slice(0, cut).join(" ");
    const tail = sentenceMatch ? sentenceMatch[2] : words.slice(cut).join(" ");
    heroTitle = <TwoWeightHeadline lead={lead} bold={tail} />;
    heroAside = scoreLift > 0 ? <span className="fr-home-pts fr-mono">+{scoreLift} PTS</span> : null;
  }

  // ── compass ─────────────────────────────────────────────────────────────────────────────────────
  const max        = Math.max(unlockable, 100);
  const filledPct  = (current / max) * 100;
  const reachPct   = (reachable / max) * 100;
  const unlockPct  = (unlockable / max) * 100;
  const detour     = deriveDetourLabel(state);
  const detourPct  = Math.min(Math.max(filledPct, 4), 80);

  // ── 01 · CONTEXT ────────────────────────────────────────────────────────────────────────────────
  const { groundedCount, foundationLabel, narrativeParts, narrativePlain } = foundationNarrative(foundationStatus, audienceShort);

  // ── 02 · SIGNAL ─────────────────────────────────────────────────────────────────────────────────
  const outsideCount  = signalLandscape?.byBand.outside.count ?? 0;
  const orgCount      = signalLandscape?.byBand.organization.count ?? 0;
  const customerCount = signalLandscape?.byBand.customer.count ?? 0;
  const humanized     = topNeed ? topNeed.desired_outcome : null;
  const attribution   = topOpportunityAttribution(topNeed, isSolo);

  // ── 03 · ROUTES ─────────────────────────────────────────────────────────────────────────────────
  const directions = directionEvidence?.directions ?? [];
  const leaning    = directionEvidence?.leaning ?? null;

  return (
    <Spread
      title={railTitle ? withStop(railTitle) : undefined}
      lede={railState || railDay != null ? <span className="fr-mono fr-home-identity">DAY {railDay ?? "—"} · {railState ?? ""}</span> : undefined}
      aside={
        <div className="fr-home-context" data-testid="home-context">
          <Eyebrow>01 · CONTEXT</Eyebrow>
          <p className="fr-why-line fr-home-context-text">
            {narrativeParts
              ? <>{narrativeParts[0]}<strong className={groundedCount === 4 ? "fr-home-accent" : undefined}>{narrativeParts[1]}</strong>{narrativeParts[2]}</>
              : narrativePlain}
          </p>
          <p className="fr-tag fr-mono fr-home-context-meta">DAY {dayCount ?? "—"} · SCORE {current} → {unlockable} · FOUNDATION {foundationLabel}</p>
        </div>
      }
    >
      <div className="fr-home" data-testid="home-fr">
        <HorizontalScale
          marks={[
            { label: "CURRENT", value: current, pct: filledPct },
            { label: "REACHABLE", value: reachable, pct: reachPct },
            { label: "DESTINATION", value: unlockable, pct: unlockPct, tone: "accent" },
          ]}
          filledPct={filledPct}
          reachablePct={reachPct}
          unlockablePct={unlockPct}
          badge={<>NEXT: {detour}</>}
          badgePct={detourPct}
        />

        {/* Hero scale = the First Read's statement headline (beat 3 "Winning aspiration"): the same
            classes — fr-display fr-h-statement fr-h-statement--wide, mt-4 under its eyebrow — on paper
            (ink, not the dark screen's paper). The measure cap (76rem) is what makes it stack. */}
        {heroTitle ? (
          <section className="fr-home-hero mt-6" data-testid="home-hero">
            <Eyebrow>THE NEXT TURN</Eyebrow>
            <h1 className="fr-display fr-h-statement fr-h-statement--wide mt-4 fr-home-hero-title">{heroTitle}</h1>
            {heroStatement ? <p className="fr-lede fr-home-hero-statement">{heroStatement}</p> : null}
            {heroAside}
          </section>
        ) : null}

        <ol className="fr-hanging-list">
          <HangingItem
            num=""
            lead={<Eyebrow>02 · SIGNAL</Eyebrow>}
            title={humanized ? `"${humanized}"` : undefined}
          >
            {humanized ? (
              <span className="fr-tag fr-mono fr-home-attr">— TOP OPPORTUNITY{attribution ? ` · ${attribution}` : ""} · 1 OF {needCount}</span>
            ) : (
              <p className="fr-hanging-text">No customer input yet.</p>
            )}
            <div className="fr-home-chips">
              <Chip tone={outsideCount > 0 ? "accent-2" : "neutral"}>PUBLIC {outsideCount}</Chip>
              <Chip tone={orgCount > 0 ? "accent-4" : "neutral"}>TEAM {orgCount}</Chip>
              <Chip tone={customerCount > 0 ? "accent-1" : "neutral"}>CUSTOMERS {customerCount}</Chip>
            </div>
            {needCount > 0 && (
              <Link to={HOME_SIGNAL_CTA_HREF} className="fr-home-cta fr-mono" data-testid="home-signal-cta">
                SEE ALL {needCount} UNADDRESSED OPPORTUNITIES →
              </Link>
            )}
          </HangingItem>

          <HangingItem num="" lead={<Eyebrow>03 · ROUTES</Eyebrow>}>
            {directions.length > 0 ? (
              <div>
                {directions.slice(0, 3).map((dir, i) => {
                  const isLeaning = dir.id === leaning;
                  return (
                    <div key={dir.id} className="fr-home-route" data-leaning={isLeaning ? "true" : undefined}>
                      <span className={`fr-tag fr-mono${isLeaning ? " fr-home-accent" : ""}`}>{String(i + 1).padStart(2, "0")}</span>
                      <span className="fr-home-route-title" style={isLeaning ? { fontWeight: 600 } : undefined}>{dir.title}</span>
                      <span className={`fr-tag fr-mono${isLeaning ? " fr-home-accent" : ""}`}>{dir.legCount}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="fr-hanging-text">No directions mapped yet.</p>
            )}
            {/* As before: the CTA belongs to the directions section; with no direction evidence at all the
                row shows only the empty line. */}
            {directionEvidence && directions.length > 0 && (
              <button type="button" className="fr-home-cta fr-mono" onClick={onGoToRoutes} data-testid="home-routes-cta">
                SEE ALL {directions.length} ROUTES →
              </button>
            )}
          </HangingItem>
        </ol>

        {navSlot ? <div className="fr-spread-foot">{navSlot}</div> : null}
      </div>
    </Spread>
  );
}
