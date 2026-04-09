type GenericAuditAreaMeta = {
  area_key?: string;
  source?: string;
  logic?: string;
};

type GenericAuditMeta = {
  purpose?: string;
  areas?: GenericAuditAreaMeta[];
};

type CompanyLike = {
  name?: string | null;
  area_scores_json?: unknown;
};

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function getGenericAuditMeta(areaScoresJson: unknown): GenericAuditMeta | null {
  const root = asRecord(areaScoresJson);
  const genericAudit = asRecord(root?.generic_audit);
  if (!genericAudit) return null;
  const areas = Array.isArray(genericAudit.areas)
    ? genericAudit.areas.filter((item) => item && typeof item === "object") as GenericAuditAreaMeta[]
    : [];
  return {
    purpose: typeof genericAudit.purpose === "string" ? genericAudit.purpose : undefined,
    areas,
  };
}

export function getGenericAuditAreaMeta(areaScoresJson: unknown, areaKey: string) {
  const meta = getGenericAuditMeta(areaScoresJson);
  if (!meta?.areas || !areaKey) return null;
  const target = String(areaKey).trim().toLowerCase();
  return meta.areas.find((item) => String(item?.area_key || "").trim().toLowerCase() === target) || null;
}

export function isGenericAuditCompany(company: CompanyLike | null | undefined) {
  if (!company) return false;
  const byName = String(company.name || "").toLowerCase().includes("generic audit - fallback diagnostics");
  if (byName) return true;
  return !!getGenericAuditMeta(company.area_scores_json);
}

