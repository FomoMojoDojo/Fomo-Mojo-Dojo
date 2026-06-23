/**
 * FMD Strategic Field — the internal recursive operating cockpit.
 *
 * Always loads FomoMojoDojo's own strategic data. Answers 8 questions:
 *   1. What appears true
 *   2. What changed recently
 *   3. What is destabilizing
 *   4. What is strengthening
 *   5. What remains unresolved
 *   6. What is safest to commit to now
 *   7. What proof is still missing
 *   8. What the current readiness posture is
 *
 * Separated from all client and demo environments.
 */

import { useMemo } from "react";
import { Link } from "react-router-dom";
import TopNav from "@/components/layout/TopNav";
import { useStrategicDecisions } from "@/hooks/useStrategicDecisions";
import { useStrategicHypotheses } from "@/hooks/useStrategicHypotheses";
import { useRoutes } from "@/hooks/useRoutes";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { useDerivedTensions } from "@/hooks/useDerivedTensions";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import {
  buildConfidenceAnatomyReport,
  buildDecisionOnlyContext,
  POSTURE_RANK,
} from "@/lib/confidenceAnatomy";
import {
  buildMojoScoreReadinessReport,
  READINESS_POSTURE_LABELS,
  READINESS_MOVEMENT_COLORS,
} from "@/lib/mojoScoreFromAnatomy";
import {
  buildStrategicMovementEvents,
  deriveTopMovementItems,
  REVERSIBILITY_GLYPHS,
  POSTURE_IMPACT_COLORS,
} from "@/lib/strategicMovementNarrative";
import { DECISION_STATE_LABELS, CONFIDENCE_STATE_LABELS } from "@/lib/strategicDecisionDomain";
import { FMD_COMPANY_ID, FMD_PRIMARY_QUESTION } from "@/lib/fmdWorkspace";

// ─── Colors ───────────────────────────────────────────────────────────────────

const c = {
  bg:          "#0e1218",
  panel:       "#161c24",
  panelAlt:    "#1b2230",
  line:        "#252e3a",
  lineFaint:   "#1e2633",
  frost:       "#e8f0ec",
  secondary:   "#8faaaa",
  muted:       "#5c7070",
  coral:       "#e05a3a",
  amber:       "#c8993a",
  teal:        "#5F9B8C",
  positive:    "#5F9B8C",
  uncertain:   "#9298B5",
  negative:    "#c44233",
};

// ─── Section wrapper ──────────────────────────────────────────────────────────

function FieldSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        borderTop:  `1px solid ${c.line}`,
        paddingTop: 20,
      }}
    >
      <p
        style={{
          fontSize:      9,
          fontFamily:    "monospace",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color:         c.muted,
          margin:        "0 0 12px",
        }}
      >
        {label}
      </p>
      {children}
    </section>
  );
}

// ─── Pill ─────────────────────────────────────────────────────────────────────

function Pill({
  label,
  color,
}: {
  label: string;
  color?: string;
}) {
  return (
    <span
      style={{
        display:      "inline-block",
        fontSize:     9,
        fontFamily:   "monospace",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        padding:      "2px 6px",
        borderRadius: 3,
        border:       `1px solid ${color ?? c.muted}40`,
        color:        color ?? c.muted,
        marginRight:  4,
      }}
    >
      {label}
    </span>
  );
}

// ─── Readiness block ──────────────────────────────────────────────────────────

function ReadinessBlock({ companyId }: { companyId: string }) {
  const { decisions } = useStrategicDecisions(companyId);

  const report = useMemo(() => {
    const active = decisions.filter((d) => d.decision_state !== "retired");
    if (active.length === 0) return null;
    const anatomies = active.map((d) => ({
      d,
      anatomy: buildConfidenceAnatomyReport(buildDecisionOnlyContext(d)),
    }));
    const worst = anatomies.reduce((prev, curr) =>
      POSTURE_RANK[curr.anatomy.overallPosture] < POSTURE_RANK[prev.anatomy.overallPosture]
        ? curr
        : prev,
    );
    return buildMojoScoreReadinessReport(worst.anatomy, worst.d.confidence_movement);
  }, [decisions]);

  if (!report) {
    return (
      <p style={{ fontSize: 12, color: c.muted, margin: 0 }}>
        No active decisions — readiness cannot be derived.
      </p>
    );
  }

  const scoreColor =
    report.currentReadiness >= 66 ? c.positive :
    report.currentReadiness >= 44 ? c.amber :
    c.coral;

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <div>
        <p style={{ fontSize: 36, fontWeight: 600, color: scoreColor, margin: 0, lineHeight: 1 }}>
          {report.currentReadiness}
        </p>
        <p style={{ fontSize: 10, color: c.muted, margin: "4px 0 0", fontFamily: "monospace" }}>
          Current readiness
        </p>
      </div>
      <div>
        <p style={{ fontSize: 36, fontWeight: 300, color: c.secondary, margin: 0, lineHeight: 1 }}>
          {report.nearTermPotential}
        </p>
        <p style={{ fontSize: 10, color: c.muted, margin: "4px 0 0", fontFamily: "monospace" }}>
          If top blocker clears
        </p>
      </div>
      <div>
        <p style={{ fontSize: 36, fontWeight: 300, color: c.secondary, margin: 0, lineHeight: 1 }}>
          {report.structuralUpside}
        </p>
        <p style={{ fontSize: 10, color: c.muted, margin: "4px 0 0", fontFamily: "monospace" }}>
          Structural upside
        </p>
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: c.frost, margin: 0, lineHeight: 1.3 }}>
          {READINESS_POSTURE_LABELS[
            report.currentReadiness >= 83 ? "strong" :
            report.currentReadiness >= 66 ? "building" :
            report.currentReadiness >= 49 ? "directional" :
            report.currentReadiness >= 30 ? "fragile" : "absent"
          ]}
        </p>
        <p
          style={{
            fontSize:  10,
            margin:    "4px 0 0",
            color:     READINESS_MOVEMENT_COLORS[
              report.movementLabel === "Strengthening" ? "strengthening" :
              report.movementLabel === "Weakening"     ? "weakening" :
              report.movementLabel === "Destabilizing" ? "destabilizing" :
              report.movementLabel === "Stabilizing"   ? "stabilizing" :
              "unresolved"
            ],
            fontFamily: "monospace",
          }}
        >
          {report.movementLabel}
        </p>
        {report.ceilingReason && (
          <p style={{ fontSize: 11, color: c.coral, margin: "6px 0 0", lineHeight: 1.4 }}>
            ⊗ {report.ceilingReason}
          </p>
        )}
        {report.topUnlockAction && (
          <p style={{ fontSize: 11, color: c.amber, margin: "6px 0 0", lineHeight: 1.4 }}>
            ◎ Unlock: {report.topUnlockAction}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Decisions block ──────────────────────────────────────────────────────────

function DecisionsBlock({ companyId }: { companyId: string }) {
  const { decisions } = useStrategicDecisions(companyId);
  const active = decisions.filter((d) => d.decision_state !== "retired");

  if (active.length === 0) {
    return <p style={{ fontSize: 12, color: c.muted }}>No active decisions.</p>;
  }

  const destabilizing = active.filter((d) => d.decision_state === "destabilizing");
  const strengthening = active.filter((d) =>
    (d.confidence_movement ?? []).length > 0 &&
    d.confidence_movement[d.confidence_movement.length - 1]?.direction === "strengthening",
  );
  const safestToCommit = active
    .filter((d) => d.decision_state === "stabilizing" || d.decision_state === "commit_ready")
    .slice(0, 2);
  const missingProof = active
    .flatMap((d) =>
      (d.validation_requirements ?? [])
        .filter((r) => r.status === "open")
        .map((r) => ({ decision: d.title, requirement: r.requirement })),
    )
    .slice(0, 4);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* What appears true — from committed/stabilizing decisions */}
      <div>
        <p style={{ fontSize: 10, color: c.muted, fontFamily: "monospace", letterSpacing: "0.12em", margin: "0 0 8px", textTransform: "uppercase" }}>
          What appears true
        </p>
        {active
          .filter((d) => d.current_posture)
          .slice(0, 3)
          .map((d) => (
            <div key={d.id} style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 12, color: c.frost, margin: 0, lineHeight: 1.4 }}>
                {d.current_posture}
              </p>
              <p style={{ fontSize: 10, color: c.muted, margin: "2px 0 0" }}>
                {d.title}
              </p>
            </div>
          ))}
      </div>

      {/* What is destabilizing */}
      {destabilizing.length > 0 && (
        <div>
          <p style={{ fontSize: 10, color: c.coral, fontFamily: "monospace", letterSpacing: "0.12em", margin: "0 0 8px", textTransform: "uppercase" }}>
            Destabilizing
          </p>
          {destabilizing.map((d) => (
            <div key={d.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <span style={{ color: c.coral, fontSize: 12, flexShrink: 0 }}>⊗</span>
              <div>
                <p style={{ fontSize: 12, fontWeight: 500, color: c.frost, margin: 0 }}>{d.title}</p>
                <p style={{ fontSize: 11, color: c.secondary, margin: "2px 0 0", lineHeight: 1.4 }}>
                  {CONFIDENCE_STATE_LABELS[d.confidence_state]} confidence ·{" "}
                  {DECISION_STATE_LABELS[d.decision_state]}
                </p>
                {(d.contradicting_evidence ?? []).length > 0 && (
                  <p style={{ fontSize: 11, color: c.coral, margin: "3px 0 0", lineHeight: 1.4 }}>
                    {d.contradicting_evidence[0].statement}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* What is strengthening */}
      {strengthening.length > 0 && (
        <div>
          <p style={{ fontSize: 10, color: c.teal, fontFamily: "monospace", letterSpacing: "0.12em", margin: "0 0 8px", textTransform: "uppercase" }}>
            Strengthening
          </p>
          {strengthening.map((d) => {
            const latest = d.confidence_movement[d.confidence_movement.length - 1];
            return (
              <div key={d.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <span style={{ color: c.teal, fontSize: 12, flexShrink: 0 }}>◉</span>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500, color: c.frost, margin: 0 }}>{d.title}</p>
                  {latest?.reason && (
                    <p style={{ fontSize: 11, color: c.secondary, margin: "2px 0 0", lineHeight: 1.4 }}>
                      {latest.reason}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Safest to commit to now */}
      {safestToCommit.length > 0 && (
        <div>
          <p style={{ fontSize: 10, color: c.teal, fontFamily: "monospace", letterSpacing: "0.12em", margin: "0 0 8px", textTransform: "uppercase" }}>
            Safest to commit to now
          </p>
          {safestToCommit.map((d) => (
            <div key={d.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <span style={{ color: c.teal, fontSize: 12, flexShrink: 0 }}>◎</span>
              <div>
                <p style={{ fontSize: 12, fontWeight: 500, color: c.frost, margin: 0 }}>{d.title}</p>
                <p style={{ fontSize: 11, color: c.secondary, margin: "2px 0 0" }}>
                  {DECISION_STATE_LABELS[d.decision_state]} · {CONFIDENCE_STATE_LABELS[d.confidence_state]} confidence
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* What proof is still missing */}
      {missingProof.length > 0 && (
        <div>
          <p style={{ fontSize: 10, color: c.amber, fontFamily: "monospace", letterSpacing: "0.12em", margin: "0 0 8px", textTransform: "uppercase" }}>
            Proof still missing
          </p>
          {missingProof.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <span style={{ color: c.muted, fontSize: 12, flexShrink: 0 }}>○</span>
              <div>
                <p style={{ fontSize: 11, color: c.secondary, margin: 0, lineHeight: 1.4 }}>
                  {item.requirement}
                </p>
                <p style={{ fontSize: 10, color: c.muted, margin: "1px 0 0" }}>{item.decision}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tensions block ───────────────────────────────────────────────────────────

function TensionsBlock({ companyId }: { companyId: string }) {
  const { items: routes } = useRoutes(companyId);
  const { needs } = useOdiNeeds(companyId);
  const { item: cascade } = useStrategyCascade(companyId);
  const { item: positioning } = usePositioningCanvas(companyId);
  const { all: tensions } = useDerivedTensions({
    routes,
    needs,
    cascade: cascade ?? null,
    canvas:  positioning ?? null,
  });

  const active = tensions.filter(
    (t) => t.status !== "resolved" && t.status !== "retired",
  );

  if (active.length === 0) {
    return <p style={{ fontSize: 12, color: c.muted }}>No active tensions.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {active.slice(0, 5).map((t) => (
        <div
          key={t.id}
          style={{
            background: c.panelAlt,
            borderRadius: 6,
            padding:    "10px 12px",
            borderLeft: `3px solid ${t.is_commitment_blocker ? c.coral : t.pressure === "high" || t.pressure === "critical" ? c.amber : c.muted}`,
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 500, color: c.frost, margin: 0, lineHeight: 1.4 }}>
            {t.statement}
          </p>
          {t.detail && (
            <p style={{ fontSize: 11, color: c.secondary, margin: "4px 0 0", lineHeight: 1.4 }}>
              {t.detail}
            </p>
          )}
          <div style={{ marginTop: 6 }}>
            <Pill label={t.pressure} color={t.pressure === "critical" || t.pressure === "high" ? c.coral : c.muted} />
            {t.is_commitment_blocker && <Pill label="commitment blocker" color={c.coral} />}
            <Pill label={t.status} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Movement block ───────────────────────────────────────────────────────────

function MovementBlock({ companyId }: { companyId: string }) {
  const { decisions } = useStrategicDecisions(companyId);
  const { data: hypotheses = [] } = useStrategicHypotheses(companyId);

  const { items: routes } = useRoutes(companyId);
  const { needs } = useOdiNeeds(companyId);
  const { all: tensions } = useDerivedTensions({ routes, needs });

  const topItems = useMemo(() => {
    const events = buildStrategicMovementEvents(decisions, { tensions, hypotheses });
    return deriveTopMovementItems(events, 5);
  }, [decisions, tensions, hypotheses]);

  if (topItems.length === 0) {
    return (
      <p style={{ fontSize: 12, color: c.muted }}>
        No movement signals yet. Strategic data is accumulating.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {topItems.map((item) => (
        <div key={item.id} style={{ display: "flex", gap: 10 }}>
          <span
            style={{
              fontSize:  13,
              flexShrink: 0,
              paddingTop: 2,
              color:     POSTURE_IMPACT_COLORS[item.postureImpact],
            }}
          >
            {REVERSIBILITY_GLYPHS[item.reversibility]}
          </span>
          <div>
            <p style={{ fontSize: 12, fontWeight: 500, color: c.frost, margin: 0, lineHeight: 1.4 }}>
              {item.headline}
            </p>
            <p style={{ fontSize: 11, color: c.secondary, margin: "3px 0 0", lineHeight: 1.4 }}>
              {item.meaning}
            </p>
          </div>
        </div>
      ))}
      <Link
        to="/movement"
        style={{ fontSize: 10, color: c.muted, textDecoration: "none", fontFamily: "monospace", letterSpacing: "0.1em", marginTop: 4 }}
      >
        All movement →
      </Link>
    </div>
  );
}

// ─── Hypotheses block ─────────────────────────────────────────────────────────

function HypothesesBlock({ companyId }: { companyId: string }) {
  const { data: cards = [] } = useStrategicHypotheses(companyId);
  const active = cards.filter((c) => c.hypothesis.is_active);

  if (active.length === 0) {
    return <p style={{ fontSize: 12, color: c.muted }}>No active hypotheses.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {active.slice(0, 6).map((card) => {
        const h = card.hypothesis;
        const stateColor =
          h.hypothesis_state === "strengthened" ? c.teal :
          h.hypothesis_state === "contradicted"  ? c.coral :
          h.hypothesis_state === "unstable"      ? c.amber :
          h.hypothesis_state === "reframed"      ? c.uncertain :
          c.muted;

        return (
          <div key={h.id} style={{ display: "flex", gap: 10, paddingBottom: 8, borderBottom: `1px solid ${c.lineFaint}` }}>
            <span style={{ fontSize: 10, color: stateColor, flexShrink: 0, paddingTop: 3, fontFamily: "monospace" }}>
              {h.hypothesis_state === "strengthened" ? "◉" :
               h.hypothesis_state === "contradicted"  ? "⊗" :
               h.hypothesis_state === "unstable"      ? "○" : "·"}
            </span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, color: c.frost, margin: 0, lineHeight: 1.4 }}>
                {h.statement}
              </p>
              <p style={{ fontSize: 10, color: stateColor, margin: "2px 0 0", fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                {h.hypothesis_state} · {h.confidence} confidence
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Routes block ─────────────────────────────────────────────────────────────

function RoutesBlock({ companyId }: { companyId: string }) {
  const { items } = useRoutes(companyId);

  if (items.length === 0) {
    return <p style={{ fontSize: 12, color: c.muted }}>No routes seeded yet.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.slice(0, 7).map((route) => {
        const typeColor =
          route.category === "fix"     ? c.coral :
          route.category === "improve" ? c.amber :
          c.teal;

        return (
          <div
            key={route.id}
            style={{
              display:    "flex",
              gap:        10,
              padding:    "8px 10px",
              background: c.panelAlt,
              borderRadius: 5,
              borderLeft: `2px solid ${typeColor}`,
            }}
          >
            <span style={{ fontSize: 9, color: typeColor, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em", flexShrink: 0, paddingTop: 3, minWidth: 44 }}>
              {route.category}
            </span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 12, color: c.frost, margin: 0, lineHeight: 1.3 }}>
                {route.title}
              </p>
              <p style={{ fontSize: 10, color: c.muted, margin: "2px 0 0" }}>
                {route.effort} effort · +{route.pts_value} pts
              </p>
            </div>
          </div>
        );
      })}
      <Link
        to="/routes"
        style={{ fontSize: 10, color: c.muted, textDecoration: "none", fontFamily: "monospace", letterSpacing: "0.1em", marginTop: 4 }}
      >
        All routes →
      </Link>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FMDStrategicField() {
  const companyId = FMD_COMPANY_ID;

  return (
    <div style={{ minHeight: "100vh", background: c.bg }}>
      <TopNav />
      <main
        style={{
          maxWidth: 760,
          margin:   "0 auto",
          padding:  "32px 24px 100px",
        }}
      >
        {/* Header */}
        <header style={{ marginBottom: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 9, fontFamily: "monospace", letterSpacing: "0.16em", textTransform: "uppercase", color: c.teal, opacity: 0.8 }}>
              Internal · FomoMojoDojo
            </span>
          </div>
          <h1
            style={{
              fontSize:   24,
              fontWeight: 500,
              color:      c.frost,
              margin:     "0 0 10px",
              lineHeight: 1.3,
            }}
          >
            Strategic Field
          </h1>
          <p
            style={{
              fontSize:   13,
              color:      c.secondary,
              margin:     0,
              lineHeight: 1.6,
              maxWidth:   560,
            }}
          >
            {FMD_PRIMARY_QUESTION}
          </p>
        </header>

        {/* Two-column layout on wide, single on narrow */}
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1fr",
            gap:                 32,
          }}
        >
          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <FieldSection label="Current readiness">
              <ReadinessBlock companyId={companyId} />
            </FieldSection>

            <FieldSection label="Active decisions">
              <DecisionsBlock companyId={companyId} />
            </FieldSection>

            <FieldSection label="Active hypotheses">
              <HypothesesBlock companyId={companyId} />
            </FieldSection>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <FieldSection label="Strategic tensions">
              <TensionsBlock companyId={companyId} />
            </FieldSection>

            <FieldSection label="Movement — what changed">
              <MovementBlock companyId={companyId} />
            </FieldSection>

            <FieldSection label="Roadmap — active routes">
              <RoutesBlock companyId={companyId} />
            </FieldSection>
          </div>
        </div>
      </main>
    </div>
  );
}
