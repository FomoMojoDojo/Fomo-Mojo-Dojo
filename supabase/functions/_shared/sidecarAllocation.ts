// Substitution-fix gate (operator-approved 2026-06-12): evidence-driven sidecar
// excerpt allocation, shared by local-jobmap-synthesis and local-strategy-synthesis
// so both declared paths feed identically.
//
// The old 12,000-char budget (B2B core 2,000 / rest ~363) provably cut
// load-bearing content: "Los Angeles" scope @1,075, "commodity coffee suppliers"
// @1,610, "8-criteria" @3,492 (comparison report on record). Tier caps cover every
// proven cut with margin; real-corpus total ≈ 32,600 chars ≈ 8.2k tokens.
// Effective excerpt is min(full text, cap) — abort-over-truncate stays the law at
// the prompt-assembly layer.

export const SIDECAR_CORE_CAP = 3_600; // B2B_-prefixed core documents
export const SIDECAR_REST_CAP = 1_800; // all other uploaded documents

export function sidecarCapForFile(fileName: string): number {
  return String(fileName || "").trim().startsWith("B2B_") ? SIDECAR_CORE_CAP : SIDECAR_REST_CAP;
}
