import type { SourceLink, SourceKind } from "@/lib/sourceLinks";

// All styles use hardcoded hex values — this component renders inside Radix
// Sheet portals where CSS custom properties from .crpv-page are unavailable.

const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace';

const KIND_LABELS: Record<SourceKind, string> = {
  file:         "File",
  social:       "Social signal",
  public:       "Public signals",
  interview:    "Interview",
  survey:       "Survey",
  human_edit:   "Human edit",
  pasted:       "Pasted input",
  evidence_ref: "Evidence",
};

export default function SourcesUsedSection({ sources }: { sources: SourceLink[] }) {
  return (
    <div>
      <p style={{
        margin: "0 0 12px",
        fontFamily: MONO,
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: "0.12em",
        color: "#999",
      }}>
        Sources used
      </p>

      {sources.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "#bbb" }}>
          No direct source links yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {sources.map((src, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {/* Kind label row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "#999",
                }}>
                  {KIND_LABELS[src.kind]}
                </span>
                {src.provenance === "inferred" && (
                  <span style={{
                    fontFamily: MONO,
                    fontSize: 8,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#bbb",
                    border: "1px solid #e0e0e0",
                    borderRadius: 2,
                    padding: "1px 4px",
                  }}>
                    Possibly used
                  </span>
                )}
                {src.date && (
                  <span style={{
                    fontFamily: MONO,
                    fontSize: 9,
                    color: "#bbb",
                    marginLeft: "auto",
                  }}>
                    {src.date}
                  </span>
                )}
              </div>

              {/* Title */}
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "#4a4a4a" }}>
                {src.title}
              </p>

              {/* Snippet */}
              {src.snippet && (
                <p style={{
                  margin: "1px 0 0",
                  fontSize: 11,
                  lineHeight: 1.4,
                  color: "#888",
                  fontStyle: "italic",
                }}>
                  {src.snippet}
                </p>
              )}

              {/* Disclaimer */}
              {src.disclaimer && (
                <p style={{
                  margin: "1px 0 0",
                  fontFamily: MONO,
                  fontSize: 9,
                  color: "#bbb",
                }}>
                  {src.disclaimer}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
