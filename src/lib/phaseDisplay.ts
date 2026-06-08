// Shared client-facing phase/stage display label. Single source so the label can't
// drift across the client-refine views (home / routes / workshop previously each held
// an identical copy). DISPLAY ONLY — never use the return value as a phase key or in
// conditionals; the underlying engagement-phase value is unaffected.
export function stageLabel(value: string): string {
  if (value === "outside_signals" || value === "validate_outside" || value === "outside") return "outside signals";
  if (value === "diagnose" || value === "validate_diagnose" || value === "diagnosis") return "diagnose";
  if (value === "focus" || value === "validate_focus") return "focus";
  if (value === "flow" || value === "validate_flow" || value === "execution") return "flow";
  return "diagnose";
}
