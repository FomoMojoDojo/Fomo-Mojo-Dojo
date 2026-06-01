/**
 * Canonical strategic language helpers.
 *
 * Single source of truth for recurring phrases that appear across
 * Routes, Needs, Orientation, and Readiness surfaces. Keeps vocabulary
 * coherent without templating the UI into robotic sameness.
 */

/**
 * Maps internal confidence label values to clean user-facing display text.
 * Internal type values may contain technical vocabulary ("validated signals")
 * that should not surface verbatim in the UI.
 */
export function displayConfidenceLabel(label: string | null | undefined): string {
  if (!label) return "";
  if (label === "Supported by multiple validated signals") return "Confirmed by multiple signals";
  if (label === "Customer validation missing")             return "Customer confirmation missing";
  return label;
}

/**
 * Canonical commitment movement sentences for the Flow phase.
 * Used wherever a selected route's movement state is narrated to the user.
 */
export function commitmentMovementSentence(movement: string): string {
  if (movement === "weaken")
    return "This commitment has been destabilizing — evidence that once supported it has continued to pull away.";
  if (movement === "strengthen")
    return "This commitment continues to strengthen — evidence has been converging here over time.";
  if (movement === "narrow")
    return "Options have been narrowing around this direction — the field has gradually tightened.";
  return "This direction remains active — the organization continues to monitor as evidence develops.";
}

/**
 * Canonical orientation movement sentence for the committed direction in Flow.
 * Complements commitmentMovementSentence — used in the orientation read block
 * where the framing is about the broader strategic direction, not the commitment act.
 */
export function orientationMovementSentence(movement: string): string {
  if (movement === "weaken")
    return "The committed direction has been under pressure — evidence that once supported it has continued to pull away.";
  if (movement === "strengthen")
    return "Evidence has been converging here — signals continue to accumulate in this direction.";
  return commitmentMovementSentence(movement);
}
