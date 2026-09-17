// Evidence presence — read side (operator rulings 2026-09-16).
// The ONE client answer to "is there any evidence for this company yet?", read from the
// persisted record (integrity_runs component 'evidence_presence', newest row), never
// recomputed on the client. Three states:
//   "none"    → suppress every score / projection / progress narrative; render the signed note
//   "present" → render as today (pixel-identical)
//   null      → unknown (no record yet, still loading, or the read failed) → render as today
// A number rendered on zero evidence is a fabricated verdict; a missing record is NOT a verdict
// of "none" — only the record is.
import { useIntegrityRecord } from "./useIntegrityRecord";

export const EVIDENCE_PRESENCE_COMPONENT = "evidence_presence";
export type EvidencePresenceState = "none" | "present";

export function evidencePresenceFromRecord(
  record: { excluded_by_rule: Record<string, unknown> | null } | null,
): EvidencePresenceState | null {
  const s = record?.excluded_by_rule?.state;
  return s === "none" || s === "present" ? s : null;
}

export function useEvidencePresence(companyId: string | null | undefined): EvidencePresenceState | null {
  const { record } = useIntegrityRecord(companyId, EVIDENCE_PRESENCE_COMPONENT);
  return evidencePresenceFromRecord(record);
}

/** True only on a persisted "none" record. */
export function useNoEvidenceYet(companyId: string | null | undefined): boolean {
  return useEvidencePresence(companyId) === "none";
}
