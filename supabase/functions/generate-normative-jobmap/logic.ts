// ACT-C-1 — pure logic (no Deno.serve side effect), unit-testable in isolation.
import {
  containsNonOdiProcessLanguage,
  containsSolutionPrescriptiveLanguage,
} from "../_shared/jtbdProcess.ts";

// Canonical ODI checkpoint order — the SUBSET-of-8 scaffold.
export const CANON_KEYS = ["define", "locate", "prepare", "confirm", "execute", "monitor", "modify", "conclude"] as const;

export type NormStep = { step_key: string; step_label: string; description: string };

// Subset-of-8 validator (NEW — deliberately does NOT touch
// normalizeToEightCheckpointSpine, whose rigid-8 the internal path depends on).
// Steps must be a SUBSET of the 8 ODI checkpoints in CANONICAL order: may OMIT,
// never REORDER, never INVENT a step outside the skeleton. Reuses the shared
// solution-agnostic / non-ODI-process guards.
export function validateSubsetOfEight(steps: NormStep[]): { ok: true } | { ok: false; issue: string } {
  if (!Array.isArray(steps) || steps.length === 0) return { ok: false, issue: "empty step sequence" };
  const seen = new Set<string>();
  let lastIdx = -1;
  for (const s of steps) {
    const key = String(s?.step_key || "").trim().toLowerCase();
    const idx = (CANON_KEYS as readonly string[]).indexOf(key);
    if (idx < 0) return { ok: false, issue: `invented step_key '${s?.step_key}' outside the 8 ODI checkpoints` };
    if (seen.has(key)) return { ok: false, issue: `duplicate step_key '${key}'` };
    if (idx <= lastIdx) return { ok: false, issue: `step '${key}' breaks canonical order (reordering is forbidden)` };
    seen.add(key);
    lastIdx = idx;
    const label = String(s?.step_label || "").trim();
    const description = String(s?.description || "").trim();
    if (!label || !description) return { ok: false, issue: `step '${key}' missing label or description` };
    if (containsSolutionPrescriptiveLanguage(label) || containsSolutionPrescriptiveLanguage(description)) {
      return { ok: false, issue: `step '${key}' contains solution-prescriptive language` };
    }
    if (containsNonOdiProcessLanguage(label) || containsNonOdiProcessLanguage(description)) {
      return { ok: false, issue: `step '${key}' contains non-ODI process language` };
    }
  }
  return { ok: true };
}
