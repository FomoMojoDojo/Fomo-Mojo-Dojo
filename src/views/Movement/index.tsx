import { useMemo } from "react";
import TopNav from "@/components/layout/TopNav";
import { useCompany } from "@/hooks/useCompany";
import { useStrategicDecisions } from "@/hooks/useStrategicDecisions";
import { useStrategicHypotheses } from "@/hooks/useStrategicHypotheses";
import { useOdiNeeds } from "@/hooks/useOdiNeeds";
import { useRoutes } from "@/views/Routes/useRoutes";
import { useDerivedTensions } from "@/hooks/useDerivedTensions";
import {
  buildStrategicMovementEvents,
  groupByTemporalBand,
  TEMPORAL_GROUP_LABELS,
  REVERSIBILITY_GLYPHS,
  POSTURE_IMPACT_COLORS,
  type StrategicMovementEvent,
  type TemporalGroup,
} from "@/lib/strategicMovementNarrative";

// ─── Colors ───────────────────────────────────────────────────────────────────

const c = {
  bg:        "#faf7f6",
  panel:     "#FFFFFF",
  line:      "#DDE6D1",
  lineFaint: "#EEF3E9",
  charcoal:  "#233C4B",
  secondary: "#46606D",
  muted:     "#6E847F",
  inkFaint:  "#8EA89F",
};

// ─── Event card ───────────────────────────────────────────────────────────────

function MovementEventCard({ event }: { event: StrategicMovementEvent }) {
  const glyph = REVERSIBILITY_GLYPHS[event.reversibility];
  const impactColor = POSTURE_IMPACT_COLORS[event.postureImpact];

  return (
    <article
      style={{
        background: c.panel,
        border:     `1px solid ${c.lineFaint}`,
        borderRadius: 8,
        padding:    "14px 16px",
        display:    "flex",
        gap:        12,
      }}
    >
      <div
        aria-hidden
        style={{
          width:      22,
          flexShrink: 0,
          paddingTop: 2,
          fontSize:   14,
          color:      impactColor,
          lineHeight: 1,
        }}
      >
        {glyph}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize:   13,
            fontWeight: 500,
            color:      c.charcoal,
            lineHeight: "1.4",
            margin:     0,
          }}
        >
          {event.headline}
        </p>
        <p
          style={{
            fontSize:   12,
            color:      c.secondary,
            lineHeight: "1.5",
            margin:     "4px 0 0",
          }}
        >
          {event.meaning}
        </p>
        {event.unresolvedConditions.length > 0 && (
          <ul
            style={{
              margin:    "8px 0 0",
              padding:   0,
              listStyle: "none",
              display:   "flex",
              flexDirection: "column",
              gap:       3,
            }}
          >
            {event.unresolvedConditions.slice(0, 2).map((cond, i) => (
              <li
                key={i}
                style={{
                  fontSize: 11,
                  color:    c.muted,
                  paddingLeft: 10,
                  position: "relative",
                }}
              >
                <span
                  aria-hidden
                  style={{ position: "absolute", left: 0 }}
                >
                  ·
                </span>
                {cond}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

// ─── Temporal section ─────────────────────────────────────────────────────────

function TemporalSection({
  band,
  events,
}: {
  band: TemporalGroup;
  events: StrategicMovementEvent[];
}) {
  if (events.length === 0) return null;

  return (
    <section>
      <h2
        style={{
          fontSize:      9,
          fontFamily:    "monospace",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color:         c.muted,
          opacity:       0.7,
          margin:        "0 0 8px",
        }}
      >
        {TEMPORAL_GROUP_LABELS[band]}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {events.map((event) => (
          <MovementEventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyFeed() {
  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        padding:        "64px 24px",
        textAlign:      "center",
        gap:            10,
      }}
    >
      <p style={{ fontSize: 22, lineHeight: 1, margin: 0, opacity: 0.25 }}>◎</p>
      <p style={{ fontSize: 13, color: c.secondary, margin: 0, fontWeight: 500 }}>
        No strategic movement to show yet.
      </p>
      <p style={{ fontSize: 12, color: c.muted, margin: 0, maxWidth: 300 }}>
        As confidence signals, validations, and decision states shift, interpretations will appear here.
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MovementView() {
  const { activeCompany } = useCompany();
  const { decisions } = useStrategicDecisions(activeCompany?.id);
  const { data: hypotheses = [] } = useStrategicHypotheses(activeCompany?.id);
  const { needs } = useOdiNeeds(activeCompany?.id);
  const { items: routes } = useRoutes(activeCompany?.id);

  const { all: tensions } = useDerivedTensions({ routes, needs });

  const events = useMemo(
    () => buildStrategicMovementEvents(decisions, { tensions, hypotheses }),
    [decisions, tensions, hypotheses],
  );

  const grouped = useMemo(() => groupByTemporalBand(events), [events]);

  const BAND_ORDER: TemporalGroup[] = ["today", "this_week", "earlier"];
  const hasAny = events.length > 0;

  return (
    <div style={{ minHeight: "100vh", background: c.bg }}>
      <TopNav />
      <main
        style={{
          maxWidth: 680,
          margin:   "0 auto",
          padding:  "32px 24px 80px",
        }}
      >
        <header style={{ marginBottom: 28 }}>
          <h1
            style={{
              fontSize:   22,
              fontWeight: 500,
              color:      c.charcoal,
              margin:     "0 0 6px",
              lineHeight: 1.3,
            }}
          >
            Strategic movement
          </h1>
          <p style={{ fontSize: 13, color: c.muted, margin: 0, lineHeight: 1.5 }}>
            How the strategic picture is shifting — confidence, commitments, and conditions that are moving.
          </p>
        </header>

        {!hasAny ? (
          <EmptyFeed />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {BAND_ORDER.map((band) => {
              const bandEvents = grouped.get(band) ?? [];
              return (
                <TemporalSection key={band} band={band} events={bandEvents} />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
