export function safeText(value: string | null | undefined, fallback = "") {
  return value?.trim() || fallback;
}

export function isPublicSourcePath(sourcePath?: string | null) {
  return String(sourcePath || "").toLowerCase().includes("public");
}

export function sourcePathLabel(sourcePath?: string | null) {
  const value = String(sourcePath || "").trim();
  if (!value) return "Unknown source";
  const lower = value.toLowerCase();
  if (lower.includes("social")) return "From social conversations";
  return isPublicSourcePath(value) ? `Public: ${value}` : `Uploaded/company: ${value}`;
}

export function formatNeedScore(value: number | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function normalizeAudienceSignal(value: string | null | undefined) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
    .trim();
  if (!normalized) return "";
  if (/^(unknown|n\/a|na|none|unset)$/i.test(normalized)) return "";
  return normalized;
}

export function normalizeClause(value: string | null | undefined) {
  const normalized = safeText(value, "").replace(/\.+$/g, "").trim();
  if (!normalized) return "";
  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

export function joinWithAnd(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

export function trimToWordLimit(value: string | null | undefined, maxWords: number) {
  const normalized = safeText(value, "");
  if (!normalized) return "";
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return normalized.replace(/\s+/g, " ").trim();
  let trimmed = words.slice(0, maxWords);
  while (
    trimmed.length > 3 &&
    /^(a|an|the|to|for|with|by|and|or|of|on|in|that|which|who|using)$/i.test(trimmed[trimmed.length - 1] || "")
  ) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.join(" ").replace(/\s+/g, " ").trim();
}

export function stripLeadIn(value: string | null | undefined) {
  return safeText(value, "")
    .replace(/^(customers?|users?|teams?|organizations?|enterprises?|companies|clients)\s+can\s+/i, "")
    .replace(/^(for|to)\s+/i, "")
    .replace(/^the\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function firstClause(value: string | null | undefined) {
  const normalized = safeText(value, "");
  if (!normalized) return "";
  const sentence = normalized.split(/[.;:]/)[0] || normalized;
  const clause = sentence.split(/\b(that|who|which|while|because|so that|by using|using|via)\b/i)[0] || sentence;
  return safeText(clause, "");
}

export function concisePhrase(value: string | null | undefined, options?: { maxWords?: number; fallback?: string; stripIntro?: boolean }) {
  const maxWords = options?.maxWords ?? 10;
  const fallback = options?.fallback ?? "";
  const base = firstClause(value);
  const stripped = options?.stripIntro ? stripLeadIn(base) : base;
  const compact = trimToWordLimit(stripped, maxWords);
  return compact || fallback;
}

export function parseJtbdParts(value: string | null | undefined) {
  const text = safeText(value, "");
  if (!text) return null;
  const match = text.match(
    /when\s+(.+?)\s+needs\s+to\s+(.+?),\s*they\s+want\s+to\s+(.+?),\s*so\s+they\s+can\s+(.+?)(?:[.]|$)/i,
  );
  if (!match) return null;
  return {
    executor: safeText(match[1], ""),
    situation: safeText(match[2], ""),
    motivation: safeText(match[3], ""),
    outcome: safeText(match[4], ""),
  };
}

export function normalizeFrameOfReference(frameCandidate: string | null | undefined) {
  const raw = safeText(frameCandidate, "");
  if (!raw) return "";
  const noLabel = raw.replace(/^\s*category\s*:\s*/i, "").trim();
  const beforeDelimiter = noLabel.split(/[;:]/)[0] || noLabel;
  const withoutFocusedOn = beforeDelimiter.split(/\bfocused on\b/i)[0] || beforeDelimiter;
  const compact = safeText(withoutFocusedOn, "");
  if (!compact) return "";
  const forParts = compact.split(/\s+for\s+/i).map((part) => safeText(part, "")).filter(Boolean);
  if (forParts.length <= 2) return compact;
  return `${forParts[0]} for ${forParts[1]}`;
}

export function normalizeRoleLabel(value: string) {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
    .trim();
  if (!cleaned) return "Primary Job Performer";
  return cleaned;
}

export function shouldUseLocalMapFallback(message: string) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("missing openai_api_key") ||
    text.includes("missing openai") ||
    text.includes("openai") && text.includes("non-2xx") ||
    text.includes("edge function returned a non-2xx status code") ||
    text.includes("public baseline is not strong enough") ||
    text.includes("evidence check blocked") ||
    text.includes("insufficient_public_evidence") ||
    text.includes("ambiguous_public_evidence") ||
    text.includes("customer_job_map_required")
  );
}

export function shouldAttemptBaselineRetry(message: string) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("baseline review needed") ||
    text.includes("public baseline") ||
    text.includes("insufficient_public_evidence") ||
    text.includes("ambiguous_public_evidence") ||
    text.includes("not enough extractable evidence")
  );
}

export function isMissingTableError(message: string, tableName: string) {
  const text = String(message || "").toLowerCase();
  const table = String(tableName || "").toLowerCase();
  return (
    (text.includes("could not find the table") && text.includes(table)) ||
    (text.includes(table) && text.includes("schema cache"))
  );
}
