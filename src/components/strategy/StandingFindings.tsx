import { useStandingFindings, type Finding } from "@/hooks/useStandingFindings";
import { D } from "@/components/design-system/tokens";

// PROVISIONAL copy (section label + framing) — pending operator phrasing approval.
// Body is rendered as-stored; the Observe/Name/Open three-beat framing is a later item.

const A = {
  watchOut: "#c47a1c", // amber — watch-out lean
  primary: D.signal,
} as const;

const ambientBtn: React.CSSProperties = {
  fontFamily: D.mono,
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  color: D.inkFaint,
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
};

function truncate(t: string, max = 240): string {
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function FindingRow({
  f, isPrimary, companyDomain, onMakePrimary, onResolve,
}: {
  f: Finding;
  isPrimary: boolean;
  companyDomain: string | null;
  onMakePrimary: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  // Show provenance host only when it's a genuine third-party source — suppress the
  // company's own domain (synthesis reads are stamped with the company website).
  const showHost = f.host && f.host !== companyDomain ? f.host : null;
  const accent = isPrimary ? A.primary : (f.kind === "watch_out" ? A.watchOut : D.hairline);
  return (
    <div style={{
      paddingLeft: 10, paddingTop: 8, paddingBottom: 8,
      borderLeft: `2px solid ${accent}`, marginBottom: 10,
    }}>
      {isPrimary && (
        <p style={{
          fontFamily: D.mono, fontSize: 8, textTransform: "uppercase",
          letterSpacing: "0.12em", color: A.primary, margin: "0 0 3px",
        }}>
          Primary
        </p>
      )}
      <p style={{ fontFamily: D.sans, fontSize: 13, color: D.ink, lineHeight: 1.5, margin: 0 }}>
        {f.beats?.observe ?? truncate(f.body)}
      </p>
      <p style={{
        fontFamily: D.mono, fontSize: 8, textTransform: "uppercase",
        letterSpacing: "0.07em", color: D.inkFaint, margin: "3px 0 0",
      }}>
        {f.kind === "watch_out" ? "Watch-out" : f.kind === "frontier" ? "Your bet" : "Observation"}
        {f.origin_run_id != null && ` · Update #${f.origin_run_id}`}
        {showHost && ` · ${showHost}`}
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 5 }}>
        {!isPrimary && (
          <button type="button" onClick={() => onMakePrimary(f.id)} style={ambientBtn}>
            Make primary
          </button>
        )}
        <button type="button" onClick={() => onResolve(f.id)} style={ambientBtn}>
          Resolve
        </button>
      </div>
    </div>
  );
}

export function StandingFindings({ companyId }: { companyId: string }) {
  const { data, markPrimary, resolve } = useStandingFindings(companyId);

  // Quiet: hidden entirely when there are no open findings.
  if (!data || data.findings.length === 0) return null;

  // Watch-outs, then your bet (frontier), then observations (matches the resolver's lead heuristic).
  const watchOuts = data.findings.filter((f) => f.kind === "watch_out");
  const frontiers = data.findings.filter((f) => f.kind === "frontier");
  const observations = data.findings.filter((f) => f.kind === "observation");
  const ordered = [...watchOuts, ...frontiers, ...observations];

  return (
    <div style={{
      borderTop: `1px solid ${D.hairline}`,
      paddingTop: 24,
      paddingBottom: 8,
      marginBottom: 32,
    }}>
      <p style={{
        fontFamily: D.mono, fontSize: 9, textTransform: "uppercase",
        letterSpacing: "0.16em", color: D.inkFaint, margin: "0 0 6px",
      }}>
        What Keeps Surfacing
      </p>
      <p style={{
        fontFamily: D.sans, fontSize: 11.5, color: D.inkFaint, lineHeight: 1.5,
        margin: "0 0 16px", maxWidth: 560,
      }}>
        What keeps coming up until you resolve it — the watch-outs and patterns the outside world keeps surfacing.
      </p>
      {ordered.map((f) => (
        <FindingRow
          key={f.id}
          f={f}
          isPrimary={f.id === data.primaryId}
          companyDomain={data.companyDomain}
          onMakePrimary={markPrimary}
          onResolve={resolve}
        />
      ))}
    </div>
  );
}
