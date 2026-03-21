import type { InputItem } from "@/lib/types";
import { readAreaSupportTags } from "@/lib/fileTags";

export type AreaKey =
  | "positioning"
  | "strategy"
  | "product"
  | "marketing"
  | "sales"
  | "cx";

const AREA_BY_INPUT_KEY: Record<string, AreaKey> = {
  "comp-alt": "positioning",
  "unique-attr": "positioning",
  "val-prop": "positioning",
  "target-aud": "positioning",
  "market-cat": "positioning",
  "brand-narrative": "positioning",
  "program-model": "strategy",
  "needs-assessment": "strategy",
  "outcome-data": "product",
  "channel-strat": "marketing",
  "referral-map": "sales",
  "donor-retention": "sales",
  "grant-pipeline": "sales",
  "family-satisfaction": "cx",
};

const TAG_HINTS_BY_AREA: Record<AreaKey, string[]> = {
  positioning: ["positioning", "competitive", "brand"],
  strategy: ["strategy"],
  product: ["operations"],
  marketing: ["marketing"],
  sales: ["financial", "pipeline", "referral"],
  cx: ["customer data", "customer experience", "experience", "odi", "jtbd"],
};

const FILE_NAME_HINTS_BY_AREA: Record<AreaKey, string[]> = {
  positioning: ["position", "compet", "market-cat", "value-prop", "brand", "messag"],
  strategy: ["strategy", "aspiration", "where-to-play", "how-to-win", "cascade"],
  product: ["program", "service", "delivery", "ops", "operation"],
  marketing: ["campaign", "channel", "outreach", "awareness", "content"],
  sales: ["sales", "revenue", "referral", "pipeline", "funnel", "fundraising", "grant"],
  cx: ["customer", "client", "family", "journey", "odi", "jtbd", "need", "survey", "interview"],
};

export function mapInputToAreaKey(
  input: Pick<InputItem, "input_key" | "sub_group" | "group_key">,
): AreaKey {
  const inputKey = String(input.input_key || "").trim().toLowerCase();
  const mappedByKey = AREA_BY_INPUT_KEY[inputKey];
  if (mappedByKey) return mappedByKey;

  const sub = String(input.sub_group || "").toLowerCase();
  const group = String(input.group_key || "").toLowerCase();

  if (sub.includes("positioning")) return "positioning";
  if (sub.includes("strategy")) return "strategy";
  if (sub.includes("service delivery") || sub.includes("operations") || sub.includes("product")) return "product";
  if (sub.includes("awareness") || sub.includes("marketing") || sub.includes("outreach")) return "marketing";
  if (sub.includes("referral") || sub.includes("sales") || sub.includes("pipeline")) return "sales";
  if (sub.includes("fundraising") || sub.includes("revenue") || sub.includes("donor")) return "sales";
  if (
    sub.includes("family") ||
    sub.includes("customer") ||
    sub.includes("client") ||
    sub.includes("experience") ||
    sub.includes("satisfaction")
  ) {
    return "cx";
  }

  if (group === "foundation") return "positioning";
  if (group === "execution") return "marketing";
  return "cx";
}

function normalizeTag(tag: string) {
  return String(tag || "").trim().toLowerCase();
}

function normalizeName(name: string) {
  return String(name || "").trim().toLowerCase();
}

export function inferAreaHintsFromTags(tags: string[] | null | undefined): AreaKey[] {
  const found = new Set<AreaKey>();
  const supportTags = readAreaSupportTags(tags ?? []);
  for (const support of supportTags) {
    if (support === "positioning" || support === "strategy" || support === "product" || support === "marketing" || support === "sales" || support === "cx") {
      found.add(support);
    }
  }

  for (const rawTag of tags ?? []) {
    const tag = normalizeTag(rawTag);
    if (!tag) continue;
    for (const [areaKey, hints] of Object.entries(TAG_HINTS_BY_AREA) as Array<[AreaKey, string[]]>) {
      if (hints.some((hint) => tag.includes(hint))) {
        found.add(areaKey);
      }
    }
  }

  return [...found];
}

export function inferAreaHintsFromFileName(fileName: string): AreaKey[] {
  const normalized = normalizeName(fileName);
  if (!normalized) return [];
  const found = new Set<AreaKey>();
  for (const [areaKey, hints] of Object.entries(FILE_NAME_HINTS_BY_AREA) as Array<[AreaKey, string[]]>) {
    if (hints.some((hint) => normalized.includes(hint))) {
      found.add(areaKey);
    }
  }
  return [...found];
}

export function fileSupportsArea(params: {
  areaKey: AreaKey;
  input: Pick<InputItem, "input_key" | "sub_group" | "group_key">;
  fileName: string;
  tags: string[] | null | undefined;
}) {
  const { areaKey, input, fileName, tags } = params;
  if (mapInputToAreaKey(input) === areaKey) return true;
  if (inferAreaHintsFromTags(tags).includes(areaKey)) return true;
  if (inferAreaHintsFromFileName(fileName).includes(areaKey)) return true;
  return false;
}
