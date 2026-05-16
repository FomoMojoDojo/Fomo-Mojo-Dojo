// ── MojoScore explainer UI ────────────────────────────────────────────────────
//
// Two surfaces:
//   MojoScoreStrip      — always-visible compact bar, CURRENT → REACHABLE → UNLOCKABLE
//   MojoScoreDetailPanel — inline expansion, opened by "See breakdown →"
//
// Design: neutral, editorial, no gamification. Matches existing crpv palette.
// Uses inline styles throughout (CSS custom properties not available here).

import { useState } from "react";
import type { MojoScoreResult, ProjectedRaise } from "@/lib/mojoScore/types";
import type { MojoScoreHistoryPoint } from "@/hooks/useMojoScore";
import {
  computeReachableScore,
  computeUnlockableScore,
  contributorTier,
} from "@/lib/mojoScore/projections";

// ── Design tokens ─────────────────────────────────────────────────────────────

const c = {
  charcoal:    "#233C4B",
  secondary:   "#46606D",
  muted:       "#6E847F",
  teal:        "#5F9B8C",
  line:        "#DDE6D1",
  lineFaint:   "#EEF3E9",
  paper:       "#F7FBF8",
  paperWarm:   "#F0F7F5",
  amber:       "#FAC846",
  amberLight:  "#fff3c4",   // highlight for UNLOCKABLE
  amberText:   "#7A5F00",
  coral:       "#FF7D2D",
  tierFound:   "#5F9B8C",   // foundation tier badge
  tierCust:    "#b56c1a",   // customer tier badge
};

// ── Editorial mappings ────────────────────────────────────────────────────────

const CONTRIBUTOR_LABELS: Record<string, string> = {
  state_distribution_health:   "How far along",
  customer_band_evidence:      "Customer evidence",
  wrap_evidence:               "Decision rigor",
  action_portfolio_balance:    "Action mix",
  structural_completeness:     "Structural depth",
  evidence_freshness:          "Evidence recency",
  opportunity_route_coverage:  "Opportunity coverage",
};

const CONFIDENCE_LABELS: Record<ProjectedRaise["confidence"], string> = {
  high:   "high confidence",
  medium: "medium confidence",
  low:    "low confidence",
};

// ── Smart-friend voice summaries ──────────────────────────────────────────────

function deriveSmartFriendSummary(
  result: MojoScoreResult,
  companyName?: string,
): string {
  const prefix = companyName ? `${companyName} has` : "You've";
  const org = companyName ?? "your organization";

  switch (result.engagement_state) {
    case "forming":
      return `${prefix} just started mapping the strategy. Adding claims backed by internal research will start moving the score.`;

    case "diagnosing":
      return `${org}'s team knowledge is mapped. Talking to customers is what moves the score next.`;

    case "focusing":
      return `Customer signals are starting to confirm the direction. The gap between what you know and what customers say is closing.`;

    case "committing":
      return `Active commitments are in motion. The focus now is on closing execution gaps and strengthening the evidence that backs them.`;

    case "accelerating":
      return `The strategy is committed and moving. Evidence is strong across the key areas.`;

    default:
      return "Review the breakdown to understand where to focus.";
  }
}

// ── Simple SVG sparkline ──────────────────────────────────────────────────────

function Sparkline({
  points,
  width = 80,
  height = 24,
}: {
  points: MojoScoreHistoryPoint[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;

  const scores = points.map((p) => p.total_score);
  const minS = Math.min(...scores);
  const maxS = Math.max(...scores);
  const range = maxS - minS || 1;

  const xs = points.map((_, i) => (i / (points.length - 1)) * width);
  const ys = scores.map((s) => height - ((s - minS) / range) * (height - 4) - 2);

  const d = xs
    .map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${ys[i].toFixed(1)}`)
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block" }}
    >
      <path d={d} fill="none" stroke={c.teal} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={2.5} fill={c.teal} />
    </svg>
  );
}

// ── Score bar (used in detail breakdown) ──────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const fillColor =
    pct >= 70 ? c.teal :
    pct >= 40 ? c.muted :
    "#b0bec5";

  return (
    <div style={{ width: 80, height: 6, background: c.lineFaint, borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: fillColor, borderRadius: 3, transition: "width 0.4s ease" }} />
    </div>
  );
}

// ── Score number cell (used in the 3-number strip) ────────────────────────────

function ScoreCell({
  value,
  label,
  highlight = false,
}: {
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: highlight ? "6px 14px" : "4px 10px",
        background: highlight ? c.amberLight : "transparent",
        borderRadius: highlight ? 5 : 0,
        border: highlight ? `1px solid ${c.amber}` : "none",
      }}
    >
      <span
        style={{
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: 28,
          fontWeight: 700,
          color: highlight ? c.amberText : c.charcoal,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: 8,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: highlight ? c.amberText : c.muted,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Arrow() {
  return (
    <span
      style={{
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontSize: 14,
        color: c.muted,
        alignSelf: "center",
        paddingBottom: 16,
        opacity: 0.6,
        flexShrink: 0,
      }}
    >
      →
    </span>
  );
}

// ── MojoScoreStrip ─────────────────────────────────────────────────────────────

export function MojoScoreStrip({
  result,
  reachable,
  unlockable,
  onShowBreakdown,
  isOpen,
  hideTopAction,
}: {
  result: MojoScoreResult;
  reachable: number;
  unlockable: number;
  onShowBreakdown: () => void;
  isOpen: boolean;
  hideTopAction?: boolean;
}) {
  const current        = Math.round(result.total_score);
  const foundationDelta = reachable - current;
  const customerDelta   = unlockable - reachable;
  const topRaiser       = hideTopAction ? null : (result.projected_raisers[0] ?? null);

  return (
    <div
      style={{
        background: c.paperWarm,
        border: `1px solid ${c.line}`,
        borderRadius: 6,
        padding: "14px 18px",
        marginBottom: 16,
      }}
    >
      {/* ── Three numbers ── */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 4,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <ScoreCell value={current}    label="Current"    />
        <Arrow />
        <ScoreCell value={reachable}  label="Reachable"  />
        <Arrow />
        <ScoreCell value={unlockable} label="Unlockable" highlight />

        {/* Right side: version + breakdown toggle */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: 6,
            paddingLeft: 16,
            alignSelf: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 8,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: c.muted,
            }}
          >
            MojoScore · {result.methodology_version}
          </p>
          <button
            type="button"
            onClick={onShowBreakdown}
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 10,
              color: isOpen ? c.muted : c.teal,
              textDecoration: "underline",
              textUnderlineOffset: 2,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              letterSpacing: "0.05em",
            }}
          >
            {isOpen ? "Close breakdown" : "See breakdown →"}
          </button>
        </div>
      </div>

      {/* ── Delta line ── */}
      {(foundationDelta > 0 || customerDelta > 0) && (
        <p
          style={{
            margin: "0 0 8px",
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 9,
            color: c.muted,
            letterSpacing: "0.04em",
          }}
        >
          {foundationDelta > 0 && `+${foundationDelta} with foundation work`}
          {foundationDelta > 0 && customerDelta > 0 && " · "}
          {customerDelta > 0 && `+${customerDelta} with customer research`}
        </p>
      )}

      {/* ── Smart-friend summary + top action ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <p
          style={{
            flex: 1,
            minWidth: 200,
            margin: 0,
            fontSize: 12,
            color: c.secondary,
            lineHeight: 1.55,
          }}
        >
          {deriveSmartFriendSummary(result)}
        </p>

        {topRaiser && (
          <div
            style={{
              flexShrink: 0,
              maxWidth: 260,
              borderLeft: `1px solid ${c.line}`,
              paddingLeft: 14,
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: 8,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: c.muted,
              }}
            >
              Top action
            </p>
            <p
              style={{
                margin: "3px 0 0",
                fontSize: 11,
                color: c.secondary,
                lineHeight: 1.4,
              }}
            >
              {topRaiser.action_description}
              <span style={{ color: c.teal, marginLeft: 6 }}>
                +{topRaiser.estimated_points} pts
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MojoScoreDetailPanel ──────────────────────────────────────────────────────

export function MojoScoreDetailPanel({
  result,
  reachable,
  unlockable,
  history,
  companyName,
}: {
  result: MojoScoreResult;
  reachable: number;
  unlockable: number;
  history: MojoScoreHistoryPoint[];
  companyName?: string;
}) {
  const editorialSummary = deriveSmartFriendSummary(result, companyName);
  const current = Math.round(result.total_score);

  const computedDate = result.computed_at
    ? new Date(result.computed_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const topRaisers = result.projected_raisers.slice(0, 5);

  return (
    <div
      style={{
        border: `1px solid ${c.line}`,
        borderRadius: 6,
        background: "#fff",
        marginBottom: 20,
        overflow: "hidden",
      }}
    >
      {/* ── Total score header ── */}
      <div
        style={{
          padding: "18px 22px 16px",
          borderBottom: `1px solid ${c.lineFaint}`,
          display: "flex",
          alignItems: "flex-start",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        {/* Three numbers */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <div>
            <span
              style={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: 48,
                fontWeight: 700,
                color: c.charcoal,
                lineHeight: 1,
              }}
            >
              {current}
            </span>
            <p
              style={{
                margin: "3px 0 0",
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: 8,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: c.muted,
              }}
            >
              Current{computedDate && ` · ${computedDate}`}
            </p>
          </div>
          <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 18, color: c.muted, marginBottom: 6, opacity: 0.5 }}>→</span>
          <div>
            <span
              style={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: 32,
                fontWeight: 600,
                color: c.secondary,
                lineHeight: 1,
              }}
            >
              {reachable}
            </span>
            <p
              style={{
                margin: "3px 0 0",
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: 8,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: c.muted,
              }}
            >
              Reachable
            </p>
          </div>
          <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 18, color: c.muted, marginBottom: 6, opacity: 0.5 }}>→</span>
          <div
            style={{
              background: c.amberLight,
              border: `1px solid ${c.amber}`,
              borderRadius: 4,
              padding: "4px 10px",
              marginBottom: 0,
            }}
          >
            <span
              style={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: 32,
                fontWeight: 700,
                color: c.amberText,
                lineHeight: 1,
              }}
            >
              {unlockable}
            </span>
            <p
              style={{
                margin: "3px 0 0",
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: 8,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: c.amberText,
                opacity: 0.8,
              }}
            >
              Unlockable
            </p>
          </div>
        </div>

        {/* Editorial summary */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <p
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 8,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: c.muted,
              margin: "0 0 6px",
            }}
          >
            Score read
          </p>
          <p
            style={{
              fontSize: 13,
              color: c.secondary,
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {editorialSummary}
          </p>
          <p
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 8.5,
              color: c.muted,
              margin: "10px 0 0",
              letterSpacing: "0.04em",
            }}
          >
            {result.methodology_version}
          </p>
        </div>
      </div>

      {/* ── Component breakdown ── */}
      <div style={{ padding: "18px 22px", borderBottom: `1px solid ${c.lineFaint}` }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <p
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 8.5,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: c.muted,
              margin: 0,
            }}
          >
            What goes into this score
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 8, color: c.tierFound, letterSpacing: "0.06em" }}>
              ▪ Foundation
            </span>
            <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 8, color: c.tierCust, letterSpacing: "0.06em" }}>
              ▪ Needs research
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {result.contributors.map((contrib) => {
            const editorialLabel = CONTRIBUTOR_LABELS[contrib.key] ?? contrib.label;
            const tier = contributorTier(contrib.key);
            const tierColor  = tier === "foundation" ? c.tierFound : tier === "customer" ? c.tierCust : c.muted;
            const tierLabel  = tier === "foundation" ? "Foundation" : tier === "customer" ? "Research" : null;
            return (
              <div key={contrib.key}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 5,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontSize: 12,
                      fontWeight: 500,
                      color: c.charcoal,
                      minWidth: 120,
                    }}
                  >
                    {editorialLabel}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    {tierLabel && (
                      <span
                        style={{
                          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                          fontSize: 7.5,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          color: tierColor,
                          border: `1px solid ${tierColor}`,
                          borderRadius: 3,
                          padding: "1px 5px",
                          opacity: 0.8,
                        }}
                      >
                        {tierLabel}
                      </span>
                    )}
                    <ScoreBar score={contrib.score} />
                    <span
                      style={{
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: 10,
                        color: c.charcoal,
                        width: 42,
                        textAlign: "right",
                        flexShrink: 0,
                      }}
                    >
                      {Math.round(contrib.score)}/100
                    </span>
                    <span
                      style={{
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: 9,
                        color: c.muted,
                        width: 30,
                        flexShrink: 0,
                      }}
                    >
                      {Math.round(contrib.weight * 100)}%
                    </span>
                    <span
                      style={{
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                        fontSize: 10,
                        color: c.teal,
                        width: 36,
                        textAlign: "right",
                        flexShrink: 0,
                      }}
                    >
                      +{contrib.weighted.toFixed(1)}
                    </span>
                  </div>
                </div>
                {contrib.explanation && (
                  <p
                    style={{
                      fontSize: 11,
                      color: c.muted,
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {contrib.explanation}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Projected raisers ── */}
      {topRaisers.length > 0 && (
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${c.lineFaint}` }}>
          <p
            style={{
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 8.5,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: c.muted,
              margin: "0 0 14px",
            }}
          >
            What would raise this score
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {topRaisers.map((raiser, i) => (
              <div
                key={i}
                style={{
                  paddingLeft: 12,
                  borderLeft: `2px solid ${i === 0 ? c.teal : c.lineFaint}`,
                }}
              >
                <p
                  style={{
                    fontSize: 13,
                    color: i === 0 ? c.charcoal : c.secondary,
                    fontWeight: i === 0 ? 500 : 400,
                    margin: "0 0 3px",
                    lineHeight: 1.45,
                  }}
                >
                  {raiser.action_description}
                </p>
                <p
                  style={{
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                    fontSize: 9,
                    color: c.muted,
                    margin: 0,
                    letterSpacing: "0.05em",
                  }}
                >
                  +{raiser.estimated_points} pts · {CONFIDENCE_LABELS[raiser.confidence]}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Score history ── */}
      <div style={{ padding: "16px 22px" }}>
        <p
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 8.5,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: c.muted,
            margin: "0 0 10px",
          }}
        >
          Score history
        </p>

        {history.length <= 1 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: c.muted,
                border: `1px solid ${c.line}`,
                borderRadius: 3,
                padding: "2px 7px",
              }}
            >
              First reading
            </span>
            {computedDate && (
              <span style={{ fontSize: 11, color: c.muted }}>{computedDate}</span>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Sparkline points={history} width={100} height={28} />
            <div>
              <p
                style={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: 10,
                  color: c.secondary,
                  margin: 0,
                }}
              >
                {history[0].total_score} → {history[history.length - 1].total_score}
              </p>
              <p style={{ fontSize: 10, color: c.muted, margin: "2px 0 0" }}>
                {history.length} readings
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Composed surface (strip + collapsible detail) ─────────────────────────────

export default function MojoScoreSurface({
  result,
  history,
  companyName,
  hideTopAction,
}: {
  result: MojoScoreResult;
  history: MojoScoreHistoryPoint[];
  companyName?: string;
  hideTopAction?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const reachable  = computeReachableScore(result);
  const unlockable = computeUnlockableScore(reachable, result);

  return (
    <div style={{ marginBottom: open ? 0 : 4 }}>
      <MojoScoreStrip
        result={result}
        reachable={reachable}
        unlockable={unlockable}
        onShowBreakdown={() => setOpen((v) => !v)}
        isOpen={open}
        hideTopAction={hideTopAction}
      />
      {open && (
        <MojoScoreDetailPanel
          result={result}
          reachable={reachable}
          unlockable={unlockable}
          history={history}
          companyName={companyName}
        />
      )}
    </div>
  );
}
