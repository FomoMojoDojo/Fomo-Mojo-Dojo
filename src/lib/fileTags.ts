export const INTERNAL_AREA_TAG_PREFIX = "__area:";
export const DERIVED_NEW_TAG = "New";

function normalizeTag(tag: string) {
  return String(tag || "").trim();
}

export function isInternalFileTag(tag: string) {
  const normalized = normalizeTag(tag).toLowerCase();
  return normalized.startsWith(INTERNAL_AREA_TAG_PREFIX);
}

export function makeAreaSupportTag(areaKey: string) {
  const normalized = String(areaKey || "").trim().toLowerCase();
  return `${INTERNAL_AREA_TAG_PREFIX}${normalized}`;
}

export function readAreaSupportTags(tags: string[] | null | undefined): string[] {
  const unique = new Set<string>();
  for (const rawTag of tags ?? []) {
    const tag = normalizeTag(rawTag);
    if (!tag) continue;
    const lower = tag.toLowerCase();
    if (!lower.startsWith(INTERNAL_AREA_TAG_PREFIX)) continue;
    const area = lower.slice(INTERNAL_AREA_TAG_PREFIX.length).trim();
    if (!area) continue;
    unique.add(area);
  }
  return [...unique];
}

export function isRecentUpload(uploadedAt?: string | null, windowHours = 48) {
  if (!uploadedAt) return false;
  const parsed = Date.parse(uploadedAt);
  if (!Number.isFinite(parsed)) return false;
  const ageMs = Date.now() - parsed;
  return ageMs >= 0 && ageMs <= windowHours * 60 * 60 * 1000;
}

export function visibleFileTags(tags: string[] | null | undefined, uploadedAt?: string | null) {
  const unique = new Set<string>();
  for (const rawTag of tags ?? []) {
    const tag = normalizeTag(rawTag);
    if (!tag) continue;
    if (isInternalFileTag(tag)) continue;
    if (tag.toLowerCase() === DERIVED_NEW_TAG.toLowerCase()) continue;
    unique.add(tag);
  }
  if (isRecentUpload(uploadedAt)) unique.add(DERIVED_NEW_TAG);
  return [...unique];
}

export function sanitizeUserEditableTags(tags: string[] | null | undefined) {
  const unique = new Set<string>();
  for (const rawTag of tags ?? []) {
    const tag = normalizeTag(rawTag);
    if (!tag) continue;
    if (isInternalFileTag(tag)) continue;
    if (tag.toLowerCase() === DERIVED_NEW_TAG.toLowerCase()) continue;
    unique.add(tag);
  }
  return [...unique];
}
