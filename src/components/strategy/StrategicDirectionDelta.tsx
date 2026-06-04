import { useStrategicDelta, type StrategicDeltaSignal } from "@/hooks/useStrategicDelta";

// Design tokens — match Strategy/index.tsx `c` palette
const C = {
  bg:         "#faf7f6",
  line:       "#DDE6D1",
  lineFaint:  "#EEF3E9",
  charcoal:   "#233C4B",
  secondary:  "#46606D",
  muted:      "#6E847F",
  coral:      "#FF7D2D",
  teal:       "#5F9B8C",
  amber:      "#FAC846",
  tealFaint:  "rgba(95,155,140,0.12)",
  coralFaint: "rgba(255,125,45,0.09)",
} as const;

function frameworkBadge(fw: string | null): string {
  if (!fw) return "Direct";
  if (fw.includes("cascade")) return "Cascade";
  if (fw.includes("dify_summary")) return "Doc";
  if (fw.includes("torres")) return "Discovery";
  if (fw.includes("jtbd")) return "JTBD";
  if (fw.includes("odi")) return "ODI";
  if (fw.includes("dunford")) return "Positioning";
  if (fw.includes("public_baseline")) return "Public";
  return fw.replace(/_/g, " ");
}

function topicBadge(topic: string): string {
  if (!topic || topic === "unknown") return "";
  return topic.replace(/_/g, " ").replace(/\band\b/g, "&");
}

function truncate(text: string, max = 180): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function InternalSignalRow({ sig }: { sig: StrategicDeltaSignal }) {
  return (
    <div style={{
      paddingLeft: 10,
      paddingTop: 6,
      paddingBottom: 6,
      borderLeft: `2px solid ${C.teal}`,
      marginBottom: 8,
    }}>
      <p style={{ fontSize: 12.5, color: C.charcoal, lineHeight: 1.5, margin: 0 }}>
        {truncate(sig.claim_text)}
      </p>
      {sig.framework && (
        <p style={{
          fontSize: 9.5,
          color: C.teal,
          opacity: 0.75,
          marginTop: 3,
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}>
          {frameworkBadge(sig.framework)}
        </p>
      )}
    </div>
  );
}

function PublicSignalRow({ sig }: { sig: StrategicDeltaSignal }) {
  const badge = topicBadge(sig.topic);
  return (
    <div style={{
      paddingLeft: 10,
      paddingTop: 6,
      paddingBottom: 6,
      borderLeft: `2px solid ${C.coral}`,
      marginBottom: 8,
      opacity: 0.88,
    }}>
      {badge && (
        <p style={{
          fontSize: 9.5,
          color: C.coral,
          opacity: 0.75,
          marginBottom: 2,
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}>
          {badge}
        </p>
      )}
      <p style={{ fontSize: 12, color: C.secondary, lineHeight: 1.5, margin: 0 }}>
        {truncate(sig.claim_text, 160)}
      </p>
    </div>
  );
}

function SignalColumn({
  title,
  count,
  color,
  children,
}: {
  title: string;
  count: number;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ marginBottom: 12, display: "flex", alignItems: "baseline", gap: 6 }}>
        <p style={{
          fontSize: 10,
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color,
          margin: 0,
        }}>
          {title}
        </p>
        <span style={{
          fontSize: 9,
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          color,
          opacity: 0.6,
        }}>
          {count}
        </span>
      </div>
      <div style={{ maxHeight: 480, overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}

function DeltaDivider() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "28px 20px 0",
      flexShrink: 0,
    }}>
      <div style={{ width: 1, height: 24, background: C.line }} />
      <span style={{
        fontSize: 14,
        color: C.amber,
        padding: "4px 0",
        lineHeight: 1,
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      }}>
        △
      </span>
      <div style={{ width: 1, flex: 1, background: C.line }} />
    </div>
  );
}

export function StrategicDirectionDelta({ companyId }: { companyId: string }) {
  const { data, isLoading } = useStrategicDelta(companyId);

  if (isLoading) {
    return (
      <section style={{ borderTop: `1px solid ${C.lineFaint}`, paddingTop: 20, paddingBottom: 16 }}>
        <p style={{
          fontSize: 10,
          color: C.muted,
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          opacity: 0.5,
        }}>
          Loading foundation…
        </p>
      </section>
    );
  }

  if (!data) return null;

  const { internal, public: pub } = data;
  if (internal.length === 0 && pub.length === 0) return null;

  const hasBothSides = internal.length > 0 && pub.length > 0;

  return (
    <section style={{ borderTop: `1px solid ${C.line}`, paddingTop: 28, paddingBottom: 28 }}>

      {/* Section header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{
          fontSize: 10,
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: C.muted,
          margin: 0,
        }}>
          Strategic Foundation
        </p>
        <p style={{ fontSize: 13, color: C.secondary, marginTop: 6, maxWidth: 680, lineHeight: 1.55 }}>
          Internal direction vs. public presentation —{" "}
          <span style={{ color: hasBothSides ? C.amber : C.muted }}>
            {hasBothSides
              ? "where the two diverge, the gap is the work."
              : internal.length > 0
              ? "no public baseline to contrast against yet."
              : "no internal strategy signals yet."}
          </span>
        </p>
      </div>

      {/* Two-column delta layout */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>

        {/* Internal (primary spine) */}
        {internal.length > 0 && (
          <SignalColumn title="Internal direction" count={internal.length} color={C.teal}>
            {internal.map((sig) => (
              <InternalSignalRow key={sig.id} sig={sig} />
            ))}
          </SignalColumn>
        )}

        {/* Delta divider */}
        {hasBothSides && <DeltaDivider />}

        {/* Public (contrast) */}
        {pub.length > 0 && (
          <SignalColumn title="Presented publicly · B2C" count={pub.length} color={C.coral}>
            {pub.map((sig) => (
              <PublicSignalRow key={sig.id} sig={sig} />
            ))}
          </SignalColumn>
        )}

      </div>

      {/* v2 flag — per-item computed delta tagging */}
      <p style={{
        marginTop: 20,
        fontSize: 9.5,
        color: C.muted,
        fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
        letterSpacing: "0.05em",
        opacity: 0.5,
      }}>
        v2: per-item agree / diverge / silent tagging — feasible via qwen/Dify or Claude matching
        pass on {internal.length} × {pub.length} pairs.
      </p>

    </section>
  );
}
