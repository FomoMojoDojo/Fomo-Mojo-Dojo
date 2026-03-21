export type ClaritySuggestion = {
  primary: string;
  suggested: string | null;
};

const MARKER = "suggested clearer version:";

export function parseClaritySuggestion(value: string | null | undefined): ClaritySuggestion {
  const text = String(value || "").trim();
  if (!text) {
    return { primary: "", suggested: null };
  }

  const lower = text.toLowerCase();
  const markerIndex = lower.indexOf(MARKER);
  if (markerIndex < 0) {
    return { primary: text, suggested: null };
  }

  const primary = text.slice(0, markerIndex).trim().replace(/[\n\r]+$/, "").trim();
  const suggested = text.slice(markerIndex + MARKER.length).trim();

  if (!suggested) {
    return { primary: primary || text, suggested: null };
  }

  return {
    primary: primary || text,
    suggested,
  };
}
