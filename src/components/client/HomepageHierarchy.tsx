import type { MojoScoreResult } from "@/lib/mojoScore/types";
import { computeReachableScore, computeUnlockableScore } from "@/lib/mojoScore/projections";
import type { SignalLandscape } from "@/hooks/useSignalLandscape";
import type { DirectionEvidence } from "@/hooks/useDirectionEvidence";
import type { FoundationStatus } from "@/hooks/useFoundationStatus";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";


// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  ink:           "#111111",
  inkSoft:       "#555555",
  inkFaint:      "#999999",
  canvas:        "#f6f6f4",
  signal:        "#ff5b29",
  hairline:      "rgba(17,17,17,0.12)",
  hairlineFaint: "rgba(17,17,17,0.08)",
  mono:          '"IBM Plex Mono", ui-monospace, monospace',
  sans:          '"Inter", system-ui, sans-serif',
} as const;

// ── State config ──────────────────────────────────────────────────────────────

type HomepageState = "outside_view" | "diagnose" | "focus" | "flow";

function claimStateToHomepageState(claimState: string | null | undefined): HomepageState {
  if (claimState === "flow")         return "flow";
  if (claimState === "focus")        return "focus";
  if (claimState === "diagnose")     return "diagnose";
  if (claimState === "outside_view") return "outside_view";
  return "diagnose";
}

function engagementPhaseToHomepageState(phase: string | null | undefined): HomepageState {
  if (!phase) return "diagnose";
  if (phase === "flow" || phase === "validate_flow" || phase === "execution")          return "flow";
  if (phase === "focus" || phase === "validate_focus")                                  return "focus";
  if (phase === "diagnose" || phase === "validate_diagnose" || phase === "diagnosis")   return "diagnose";
  if (phase === "outside_signals" || phase === "validate_outside" || phase === "outside") return "outside_view";
  return "diagnose";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deriveDayCount(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(1, Math.floor(ms / 86_400_000));
}

// ── DETOUR derivation ─────────────────────────────────────────────────────────

function deriveDetourLabel(state: HomepageState): string {
  switch (state) {
    case "outside_view": return "OUTSIDE SIGNALS";
    case "diagnose":     return "CUSTOMER EVIDENCE";
    case "focus":        return "DIRECTION VALIDATION";
    case "flow":         return "EXECUTION";
  }
}

// ── Team language adapter (Finding 2) ─────────────────────────────────────────

function adaptTeamLanguage(text: string, isSolo: boolean): string {
  if (!isSolo) return text;
  return text
    .replace(/\byour team['']s\b/gi, "your")
    .replace(/\bwhat your team believes\b/gi, "what you believe")
    .replace(/\byour team\b/gi, "you")
    .replace(/\bthe team\b/gi, "you")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── JourneyProgressBar (kept exported for backwards-compat) ───────────────────

export function JourneyProgressBar({
  current, reachable, unlockable,
}: {
  current: number; reachable: number; unlockable: number;
}) {
  const max = Math.max(unlockable, 100);
  const filledPct    = (current / max) * 100;
  const reachablePct = (reachable / max) * 100;
  const unlockPct    = (unlockable / max) * 100;

  const foundationGap = reachable - current;
  const customerGap   = unlockable - reachable;

  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.12em", color: T.inkFaint, textTransform: "uppercase" }}>
          § STANDING · <strong style={{ color: T.ink, fontWeight: 500 }}>{current}</strong>
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.12em", color: T.signal, textTransform: "uppercase" }}>
          § DESTINATION · <strong style={{ fontWeight: 500 }}>{unlockable}</strong>
        </span>
      </div>
      <div style={{ position: "relative", height: 3, background: T.hairlineFaint, borderRadius: 1 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${filledPct}%`, background: T.ink, borderRadius: 1, animation: "road-draw 1.2s cubic-bezier(0.19,1,0.22,1) 0s both" }} />
        {foundationGap > 0 && (
          <div style={{ position: "absolute", left: `${filledPct}%`, top: 0, height: "100%", width: `${reachablePct - filledPct}%`, background: T.ink, opacity: 0.22, borderRadius: 1, animation: "road-draw 1.2s cubic-bezier(0.19,1,0.22,1) 0.3s both" }} />
        )}
        {customerGap > 0 && (
          <div style={{ position: "absolute", left: `${reachablePct}%`, top: 0, height: "100%", width: `${unlockPct - reachablePct}%`, background: T.signal, opacity: 0.55, borderRadius: 1, animation: "road-draw 1.2s cubic-bezier(0.19,1,0.22,1) 0.6s both" }} />
        )}
      </div>
    </div>
  );
}

// ── Strategic Compass (replaces HierarchyScoreStrip) ─────────────────────────

function StrategicCompass({
  current, reachable, unlockable, state,
}: {
  current: number; reachable: number; unlockable: number; state: HomepageState;
}) {
  const max        = Math.max(unlockable, 100);
  const filledPct  = (current / max) * 100;
  const reachPct   = (reachable / max) * 100;
  const unlockPct  = (unlockable / max) * 100;
  const detour     = deriveDetourLabel(state);
  const detourLeft = `${Math.min(Math.max(filledPct, 4), 80)}%`;

  return (
    <div style={{ marginBottom: 48 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: T.inkFaint }}>
          CURRENT · <strong style={{ color: T.ink, fontWeight: 500 }}>{current}</strong>
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: T.inkFaint }}>
          REACHABLE · <strong style={{ color: T.ink, fontWeight: 500 }}>{reachable}</strong>
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: T.signal }}>
          DESTINATION · <strong style={{ fontWeight: 500 }}>{unlockable}</strong>
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ position: "relative", height: 3, background: T.hairlineFaint, borderRadius: 1 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${filledPct}%`, background: T.ink, borderRadius: 1 }} />
        {reachPct > filledPct && (
          <div style={{ position: "absolute", left: `${filledPct}%`, top: 0, height: "100%", width: `${reachPct - filledPct}%`, background: T.ink, opacity: 0.22, borderRadius: 1 }} />
        )}
        {unlockPct > reachPct && (
          <div style={{ position: "absolute", left: `${reachPct}%`, top: 0, height: "100%", width: `${unlockPct - reachPct}%`, background: T.signal, opacity: 0.55, borderRadius: 1 }} />
        )}
      </div>

      {/* DETOUR badge — anchored at current-score position along bar */}
      <div style={{ position: "relative", height: 28, marginTop: 0 }}>
        <div style={{ position: "absolute", left: detourLeft, top: 8, transform: "translateX(-50%)" }}>
          <span style={{ fontFamily: T.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: T.inkFaint, whiteSpace: "nowrap" }}>
            NEXT: {detour}
          </span>
        </div>
      </div>
    </div>
  );
}


// ── The Next Turn block ────────────────────────────────────────────────────────

function NextTurnBlock({
  action, scoreLift, isSolo,
}: {
  action: string; scoreLift: number; isSolo: boolean;
}) {
  const adapted = adaptTeamLanguage(action, isSolo);
  // Split at the first sentence boundary; fall back to 55% word-count ratio
  const sentenceMatch = adapted.match(/^(.+?[.!?])\s+(.+)$/s);
  const lead = sentenceMatch ? sentenceMatch[1] : (() => {
    const words = adapted.split(" ");
    return words.slice(0, Math.max(2, Math.ceil(words.length * 0.55))).join(" ");
  })();
  const tail = sentenceMatch ? sentenceMatch[2] : (() => {
    const words = adapted.split(" ");
    return words.slice(Math.max(2, Math.ceil(words.length * 0.55))).join(" ");
  })();

  return (
    <div style={{ marginBottom: 52 }}>
      <p style={{ fontFamily: T.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: T.inkFaint, margin: "0 0 14px" }}>
        THE NEXT TURN
      </p>
      <p style={{ fontFamily: T.sans, fontSize: 60, fontWeight: 700, color: T.ink, lineHeight: 1.12, margin: "0 0 14px", letterSpacing: "-0.03em", maxWidth: 680 }}>
        {lead}{tail ? <> <span style={{ color: T.signal }}>{tail}</span></> : null}
      </p>
      {scoreLift > 0 && (
        <p style={{ fontFamily: T.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: T.signal, margin: 0 }}>
          +{scoreLift} PTS
        </p>
      )}
    </div>
  );
}

// ── § 02 SIGNAL ───────────────────────────────────────────────────────────────

function SignalSection({
  topNeed,
  needCount,
  signalLandscape,
  onGoToOpportunities,
}: {
  topNeed: OdiNeedRow | null;
  needCount: number;
  signalLandscape: SignalLandscape | null;
  onGoToOpportunities: () => void;
}) {
  const outsideCount  = signalLandscape?.byBand.outside.count ?? 0;
  const orgCount      = signalLandscape?.byBand.organization.count ?? 0;
  const customerCount = signalLandscape?.byBand.customer.count ?? 0;
  const maxCount = Math.max(outsideCount, orgCount, customerCount, 1);
  const humanized = topNeed ? topNeed.desired_outcome : null;

  return (
    <div style={{ borderTop: `1px solid ${T.hairline}`, paddingTop: 22 }}>
      <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.12em", color: T.inkFaint, textTransform: "uppercase", display: "block", marginBottom: 22 }}>
        02 · SIGNAL
      </span>

      {humanized ? (
        <>
          <p style={{ fontFamily: T.sans, fontSize: 18, fontStyle: "italic", lineHeight: 1.6, color: T.ink, margin: "0 0 10px", maxWidth: 620 }}>
            "{humanized}"
          </p>
          <p style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: T.inkFaint, margin: "0 0 28px" }}>
            — TOP OPPORTUNITY · TEAM ANALYSIS · 1 OF {needCount}
          </p>
        </>
      ) : (
        <p style={{ fontSize: 14, color: T.inkFaint, margin: "0 0 28px" }}>No customer findings mapped yet.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 22, maxWidth: 400 }}>
        {(["PUBLIC", "TEAM", "CUSTOMERS"] as const).map((label) => {
          const count = label === "PUBLIC" ? outsideCount : label === "TEAM" ? orgCount : customerCount;
          const isCustomer = label === "CUSTOMERS";
          const barPct = (count / maxCount) * 100;
          return (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: T.inkFaint, width: 72, flexShrink: 0 }}>{label}</span>
              <div style={{ flex: 1, height: 3, background: T.hairlineFaint, borderRadius: 1, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${barPct}%`, background: isCustomer && count === 0 ? T.signal : T.ink, opacity: count === 0 ? 0.2 : 1, borderRadius: 1 }} />
              </div>
              <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 500, color: isCustomer && count === 0 ? T.signal : T.inkFaint, width: 24, textAlign: "right", flexShrink: 0 }}>
                {count}
              </span>
            </div>
          );
        })}
      </div>

      {needCount > 0 && (
        <button
          type="button"
          onClick={onGoToOpportunities}
          style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: T.ink, textDecoration: "underline", textUnderlineOffset: 3, background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          SEE ALL {needCount} UNADDRESSED OPPORTUNITIES →
        </button>
      )}
    </div>
  );
}

// ── § 03 DIRECTIONS ──────────────────────────────────────────────────────────

function PathingSection({
  directionEvidence,
  onGoToRoutes,
}: {
  directionEvidence: DirectionEvidence;
  onGoToRoutes: () => void;
}) {
  const { directions, leaning } = directionEvidence;

  return (
    <div style={{ borderTop: `1px solid ${T.hairline}`, paddingTop: 22 }}>
      <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.12em", color: T.inkFaint, textTransform: "uppercase", display: "block", marginBottom: 22 }}>
        03 · ROUTES
      </span>

      {directions.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 22 }}>
          {directions.slice(0, 3).map((dir, i) => {
            const isLeaning = dir.id === leaning;
            return (
              <div
                key={dir.id}
                style={{ display: "flex", alignItems: "baseline", gap: 16 }}
              >
                <span style={{ fontFamily: T.mono, fontSize: 9, color: isLeaning ? T.signal : T.inkFaint, flexShrink: 0, width: 20 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ fontFamily: T.sans, fontSize: isLeaning ? 15 : 14, fontWeight: isLeaning ? 600 : 400, color: isLeaning ? T.ink : T.inkSoft, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {dir.title}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: 11, fontWeight: isLeaning ? 500 : 400, color: isLeaning ? T.signal : T.inkFaint, flexShrink: 0 }}>
                  {dir.legCount}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: T.inkFaint, margin: "0 0 22px" }}>No directions mapped yet.</p>
      )}

      <button
        type="button"
        onClick={onGoToRoutes}
        style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: T.ink, textDecoration: "underline", textUnderlineOffset: 3, background: "none", border: "none", padding: 0, cursor: "pointer" }}
      >
        SEE ALL {directions.length} ROUTES →
      </button>
    </div>
  );
}

// ── § 01 CONTEXT ──────────────────────────────────────────────────────────────

function ContextSection({
  foundationStatus,
  dayCount,
  current,
  unlockable,
  audienceShort,
}: {
  foundationStatus: FoundationStatus;
  dayCount: number | null;
  current: number;
  unlockable: number;
  audienceShort?: string | null;
}) {
  const groundedCount = [
    foundationStatus.positioningSet,
    foundationStatus.strategyMapped,
    foundationStatus.directionCount > 0,
    foundationStatus.wrapPresent,
  ].filter(Boolean).length;

  const foundationLabel = groundedCount === 4 ? "MAPPED" : groundedCount >= 2 ? "PARTIAL" : "MINIMAL";

  const audience = audienceShort ?? "the people you serve";
  const narrativeParts: [string, string, string] | null =
    groundedCount === 4
      ? [`The strategy reads well from inside. The next layer is hearing how ${audience} see it — your foundation is `, "MAPPED", " — that's the starting point for the conversation."]
      : null;

  const narrativePlain =
    narrativeParts === null
      ? groundedCount >= 2
        ? "Solid groundwork is in place. A few elements still need filling in before the picture is complete."
        : "The foundation work is underway. More to build, but a real start has been made."
      : null;

  return (
    <div style={{ borderTop: `1px solid ${T.hairline}`, paddingTop: 22 }}>
      <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.12em", color: T.inkFaint, textTransform: "uppercase", display: "block", marginBottom: 22 }}>
        01 · CONTEXT
      </span>

      <p style={{ fontFamily: T.sans, fontSize: 15, lineHeight: 1.7, color: T.inkSoft, margin: "0 0 28px", maxWidth: 560 }}>
        {narrativeParts
          ? <>{narrativeParts[0]}<span style={{ fontWeight: 700, color: T.signal }}>{narrativeParts[1]}</span>{narrativeParts[2]}</>
          : narrativePlain}
      </p>

      <div style={{ display: "flex", gap: 32 }}>
        <div>
          <p style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: T.inkFaint, margin: "0 0 5px" }}>DAY</p>
          <p style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 500, color: T.ink, margin: 0 }}>{dayCount ?? "—"}</p>
        </div>
        <div>
          <p style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: T.inkFaint, margin: "0 0 5px" }}>SCORE</p>
          <p style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 500, color: T.ink, margin: 0 }}>{current} → {unlockable}</p>
        </div>
        <div>
          <p style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: T.inkFaint, margin: "0 0 5px" }}>FOUNDATION</p>
          <p style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 500, color: groundedCount === 4 ? T.signal : T.inkSoft, margin: 0 }}>{foundationLabel}</p>
        </div>
      </div>
    </div>
  );
}

// ── HomepageHierarchy (main export) ──────────────────────────────────────────

export interface HomepageHierarchyProps {
  score: MojoScoreResult;
  dominantClaimState: string | null;
  engagementPhase?: string;
  foundationStatus: FoundationStatus;
  signalLandscape: SignalLandscape | null;
  directionEvidence: DirectionEvidence | null;
  topNeed: OdiNeedRow | null;
  needCount: number;
  companyCreatedAt: string | null | undefined;
  engagementDay?: number | null;
  /** Override the score-derived Next Turn action (e.g. from cascade context). */
  nextTurnOverride?: string;
  /** Company's own audience noun phrase from odi_market_definitions.job_executor. */
  audienceShort?: string | null;
  /** Number of active company members — used to adapt team-assuming language. */
  memberCount?: number;
  onGoToRoutes: () => void;
  onGoToOpportunities: () => void;
  onGoToWorkshop: () => void;
  navSlot?: React.ReactNode;
}

export function HomepageHierarchy({
  score,
  dominantClaimState,
  engagementPhase,
  foundationStatus,
  signalLandscape,
  directionEvidence,
  topNeed,
  needCount,
  companyCreatedAt,
  engagementDay,
  nextTurnOverride,
  audienceShort,
  memberCount = 1,
  onGoToRoutes,
  onGoToOpportunities,
  navSlot,
}: HomepageHierarchyProps) {
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

  return (
    <div className="crpv-homepage-hierarchy">
      {/* Strategic Compass — STANDING → DESTINATION with DETOUR badge */}
      <StrategicCompass current={current} reachable={reachable} unlockable={unlockable} state={state} />

      {/* The Next Turn — hyper-specific action block */}
      {nextTurnAction && (
        <NextTurnBlock action={nextTurnAction} scoreLift={scoreLift} isSolo={isSolo} />
      )}

      {/* §01 CONTEXT · §02 SIGNAL · §03 DIRECTIONS — three-column bento */}
      <div className="crpv-hp-bento">
        <ContextSection
          foundationStatus={foundationStatus}
          dayCount={dayCount}
          current={current}
          unlockable={unlockable}
          audienceShort={audienceShort}
        />

        <SignalSection
          topNeed={topNeed}
          needCount={needCount}
          signalLandscape={signalLandscape}
          onGoToOpportunities={onGoToOpportunities}
        />

        {directionEvidence && directionEvidence.directions.length > 0 ? (
          <PathingSection
            directionEvidence={directionEvidence}
            onGoToRoutes={onGoToRoutes}
          />
        ) : (
          <div style={{ borderTop: `1px solid ${T.hairline}`, paddingTop: 22 }}>
            <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: "0.12em", color: T.inkFaint, textTransform: "uppercase", display: "block", marginBottom: 14 }}>
              03 · ROUTES
            </span>
            <p style={{ fontSize: 13, color: T.inkFaint }}>No directions mapped yet.</p>
          </div>
        )}
      </div>

      {/* Footer nav */}
      {navSlot && <div style={{ borderTop: `1px solid ${T.hairline}`, paddingTop: 20 }}>{navSlot}</div>}
    </div>
  );
}
