import { D } from "./tokens";
import { Eyebrow } from "./Eyebrow";
import { SignalBasisChip, type SignalBasis } from "./SignalBasisChip";

interface HierarchyPageShellProps {
  /** Eyebrow segments after "STRATEGY", e.g. ["CASCADE"] */
  eyebrowSegments: string[];
  /** Text before the signal keyword in the H1 */
  h1Before: string;
  /** Signal-orange keyword at the end of the H1 */
  h1Signal: string;
  /** Subhead below the H1 */
  subhead?: string;
  /** Signal basis counts shown below the subtitle */
  signalBasis?: SignalBasis;
  /** Reduce H1 + subtitle to supporting weight when a section element is the visual lead */
  compactHero?: boolean;
  /** Content after the hero block */
  children: React.ReactNode;
  /** Inline style overrides for the outer wrapper */
  wrapperStyle?: React.CSSProperties;
}

/**
 * Shared outer shell for all hierarchy workshop tab pages.
 * Breaks out of the 36px crpv-ws-content padding and provides
 * the editorial header (eyebrow, H1, subhead).
 */
export function HierarchyPageShell({
  eyebrowSegments,
  h1Before,
  h1Signal,
  subhead,
  signalBasis,
  compactHero,
  children,
  wrapperStyle,
}: HierarchyPageShellProps) {
  return (
    <div style={{ margin: -36, padding: "40px 48px 80px", background: D.canvas, ...wrapperStyle }}>
      <Eyebrow segments={["Strategy", ...eyebrowSegments]} />

      <h1 style={{
        fontFamily: D.sans,
        fontSize: compactHero ? 30 : 44,
        fontWeight: compactHero ? 700 : 800,
        color: D.ink,
        margin: "0 0 10px",
        lineHeight: 1.05,
        letterSpacing: "-0.022em",
        maxWidth: 720,
      }}>
        {h1Before}{" "}
        <span style={{ color: D.signal }}>{h1Signal}</span>
      </h1>

      {subhead && (
        <p style={{
          fontFamily: D.sans,
          fontSize: compactHero ? 13 : 16,
          color: "rgba(17,17,17,0.55)",
          margin: signalBasis ? "0 0 10px" : (compactHero ? "0 0 20px" : "0 0 40px"),
          lineHeight: 1.55,
          maxWidth: 600,
        }}>
          {subhead}
        </p>
      )}

      {signalBasis && <SignalBasisChip {...signalBasis} />}

      {children}
    </div>
  );
}
