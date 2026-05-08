import { normalizeAudienceSignal, safeText } from "./textUtils";
import type { JobStepRow } from "@/hooks/useJobSteps";

export function isGenericAudienceLabel(value: string | null | undefined) {
  const normalized = normalizeAudienceSignal(value).toLowerCase();
  if (!normalized) return true;
  return (
    normalized === "core audience" ||
    normalized === "audience" ||
    normalized === "target audience" ||
    normalized === "customer" ||
    normalized === "customers" ||
    normalized === "primary customer" ||
    normalized === "primary buyer" ||
    normalized === "user" ||
    normalized === "users" ||
    normalized === "buyer" ||
    normalized === "buyers" ||
    normalized === "progress" ||
    normalized === "customer progress" ||
    normalized === "job progress" ||
    normalized === "decision maker" ||
    normalized === "decision-maker" ||
    normalized === "unknown from public evidence" ||
    normalized === "unknown from uploaded evidence"
  );
}

export function isLikelyJobActionLabel(value: string | null | undefined) {
  const normalized = normalizeAudienceSignal(value).toLowerCase();
  if (!normalized) return false;
  const hasRoleNoun = /\b(owner|manager|director|lead|officer|team|department|specialist|buyer|user|customer|consumer|operator|administrator|executive|committee|sponsor|partner|staff|organization|organisation|enterprise|company|client|debtor|creditor|collector|agent|analyst|founder|ceo|cfo|coo|vp|head)\b/.test(normalized);
  if (hasRoleNoun) return false;
  if (/^(getting|securing|converting|delivering|improving|optimizing|building|driving|increasing|reducing|achieving|executing|obtaining|winning|raising|funding|acquiring)\b/.test(normalized)) {
    return true;
  }
  if (/(financial investment|revenue outcomes|qualified demand|recurring economic outcomes)/.test(normalized)) {
    return true;
  }
  return false;
}

export function isInvalidAudienceLabel(value: string | null | undefined) {
  return isGenericAudienceLabel(value) || isLikelyJobActionLabel(value);
}

export function isGenericJtbdStatement(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes("when trying to complete this job") ||
    normalized.includes("move from defining outcomes to executing and monitoring progress") ||
    normalized === "understand and complete the core job progress for this offering"
  );
}

export function isGenericJourneySubtitle(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes("how the primary job performer") ||
    normalized.includes("define, locate, prepare, execute, monitor, and conclude progress") ||
    normalized.includes("secures, converts, and retains economic value") ||
    normalized.includes("demand converts into sustained economic outcomes")
  );
}

export function isTraditionalMarketDefinition(value: string | null | undefined) {
  const normalized = safeText(value, "").toLowerCase();
  if (!normalized) return false;
  if (/^\s*category\s*:/.test(normalized)) return true;
  return /^(b2b saas|b2c saas|marketplace|e-?commerce|professional services|healthcare services|financial services|education services|nonprofit services|hospitality \/ foodservice|logistics & transportation|manufacturing|public sector \/ government)$/.test(normalized);
}

export function isGenericRoleLabel(value: string | null | undefined) {
  const normalized = safeText(value, "").toLowerCase();
  if (!normalized) return true;
  return (
    normalized === "primary job performer" ||
    normalized === "buying/decision lead" ||
    normalized === "buying or decision lead" ||
    normalized === "decision owner" ||
    normalized === "decision maker" ||
    normalized === "job performer" ||
    normalized === "customer" ||
    normalized === "customers"
  );
}

export function isOrganizationSegmentLabel(value: string | null | undefined) {
  const normalized = safeText(value, "").toLowerCase();
  if (!normalized) return true;
  const hasRoleNoun = /\b(owner|founder|director|head|vp|chief|officer|manager|lead|buyer|procurement|executive|partner|operator|coordinator|specialist|analyst|staff|agent|practitioner|admin|consultant|strategist)\b/.test(normalized);
  if (hasRoleNoun) return false;
  return /\b(organization|enterprise|business|company|client|customer|segment|market|teams|mid|large|small|smb)\b/.test(normalized);
}

export function isDraftPlaceholderStep(step: JobStepRow) {
  const basis = safeText(step.evidence_basis, "").toLowerCase();
  return (
    step.evidence_status === "unclear" &&
    Number(step.evidence_confidence ?? 0) <= 25 &&
    basis.includes("local draft step generated without external model run")
  );
}

export function hasAssessedGap(step: JobStepRow) {
  return Boolean(step.has_gap) && !isDraftPlaceholderStep(step);
}
