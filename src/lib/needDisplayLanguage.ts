/**
 * Render-time utilities for ODI need display language.
 */

// ─── Generic step phrase map ──────────────────────────────────────────────────
// Used by rewriteJobContextPhrase for partial/embedded matches.

const STEP_PHRASE_MAP: Record<string, string> = {
  "identify main competitors in specialty coffee": "supplier evaluation",
};

/**
 * Replaces known job-step label phrases and cleans up formula wrappers
 * that embed them ("before work on X starts", "for X the same way", etc.).
 */
export function rewriteJobContextPhrase(raw: string): string {
  if (!raw) return raw;
  let s = raw;

  for (const [phrase, human] of Object.entries(STEP_PHRASE_MAP)) {
    s = s.replace(new RegExp(phrase, "gi"), human);
  }

  // "before work on [X] starts" → "before [X] starts"
  s = s.replace(/before work on (.+?) starts/gi, "before $1 starts");

  // "[X] the same way for [step phrase]" tail trim — conservative
  s = s.replace(
    /\b(the same way|next cycle)\s+for\s+[a-z][\w\s]{20,}$/i,
    "$1",
  );

  return s;
}

// ─── Source label ─────────────────────────────────────────────────────────────

/**
 * Returns a clean human-readable source label for display.
 * Returns null for unclassified or unknown paths — callers should suppress the field.
 */
export function humanSourceLabel(sourcePath: string | null | undefined): string | null {
  if (!sourcePath || !sourcePath.trim()) return null;
  const s = sourcePath.trim().toLowerCase();
  if (s.includes("customer") || s.includes("interview") || s.includes("primary")) {
    return "Customer interviews";
  }
  if (s.includes("baseline") || s.includes("public") || s.includes("social")) {
    return "Public research";
  }
  if (s.includes("upload") || s.includes("org") || s.includes("company") || s.includes("file")) {
    return "Uploaded materials";
  }
  return null;
}

// ─── Stale reason ─────────────────────────────────────────────────────────────

/**
 * Sanitizes stale_reason text — strips internal pipeline and phase references.
 */
export function sanitizeStaleReason(
  raw: string | null | undefined,
  fallback = "This need may need to be reviewed — the job map has changed.",
): string {
  if (!raw || !raw.trim()) return fallback;
  const s = raw.trim();

  if (/replaced by/i.test(s)) return "This need was updated when new research came in.";
  if (/phase\s+\d+\w*/i.test(s)) return "This need was flagged after an evidence update.";
  if (/active file analysis/i.test(s)) return "This need was flagged after an evidence update.";
  if (/evidence-derived/i.test(s)) return "This need was updated when new research came in.";

  return s;
}
