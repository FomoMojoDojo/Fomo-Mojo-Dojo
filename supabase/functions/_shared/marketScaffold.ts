// ── The job-step scaffold of a NON-CUSTOMER market (operator rulings 2 + 3, signed 2026-09-18) ────
//
// Ruling 2: "A non-customer market's scaffold is chosen from the market first: relationship_kind
// 'funder' (or an executor/job matching the philanthropy pattern) → industry_key 'grantmaking'. The
// company's category is only the fallback." Before this, inferStandardMarketCategory decided from the
// COMPANY's archetype / economic engine / evidence snippets (pattern order: Healthcare before Nonprofit),
// so Edgewood's funder markets took the patient-care scaffold.
//
// Ruling 3: "Grantmaking anchors come from a published reference job map produced by
// generate-reference-jobmap (generator + judge). No anchor step is hand-authored. Until a grantmaking
// map is PUBLISHED, a funder market run is refused with a clear reason; it never falls back to another
// scaffold." So a market-keyed scaffold reads industry_reference_job_maps (is_published=true) by
// industry_key BEFORE the draft anchors table, and an unpublished key REFUSES.
import type { IndustryStepAnchor } from "./industryStepAnchors.ts";

export const GRANTMAKING_KEY = "grantmaking";
export const SCAFFOLD_UNPUBLISHED = "scaffold_unpublished";
/** The philanthropy pattern — a market whose executor or job reads as a funder. */
export const PHILANTHROPY_PATTERN = /\bphilanthrop(?:y|ic|ies|ist|ists)\b|\bgrant-?mak(?:ing|er|ers)\b|\bgrant(?:s|or|ors)?\b|\bfunders?\b|\bdonors?\b|\bfoundations?\b/i;

export type ScaffoldDecision =
  | { source: "market"; industry_key: string; why: string }
  | { source: "company"; industry_label: string | null; why: string };

/** Ruling 2 — the market decides first; the company's category only when the market says nothing. */
export function resolveMarketScaffold(
  def: { relationship_kind?: string | null; job_executor?: string | null; jtbd?: string | null },
  companyIndustryLabel: string | null | undefined,
): ScaffoldDecision {
  const kind = String(def.relationship_kind ?? "").trim().toLowerCase();
  if (kind === "funder") return { source: "market", industry_key: GRANTMAKING_KEY, why: "relationship_kind 'funder'" };
  const text = `${def.job_executor ?? ""} ${def.jtbd ?? ""}`;
  if (PHILANTHROPY_PATTERN.test(text)) return { source: "market", industry_key: GRANTMAKING_KEY, why: "executor/job matches the philanthropy pattern" };
  return { source: "company", industry_label: companyIndustryLabel?.trim() || null, why: "market names no scaffold — company category (fallback)" };
}

const ODI_KEYS: Array<keyof IndustryStepAnchor> = ["define", "locate", "prepare", "confirm", "execute", "monitor", "modify", "conclude"];

export type PublishedReferenceAnchors = { industry_key: string; industry_label: string; anchors: IndustryStepAnchor; step_count: number };

// deno-lint-ignore no-explicit-any
type Db = { from: (t: string) => any };

/** Ruling 3 — the PUBLISHED reference map for an industry_key, as anchors. null when no published map (or
 *  an incomplete one) exists; a read error throws (callers refuse — never fall back). */
export async function loadPublishedReferenceAnchors(supabase: Db, industryKey: string): Promise<PublishedReferenceAnchors | null> {
  const { data, error } = await supabase.from("industry_reference_job_maps")
    .select("industry_key, industry_label, step_key, step_number, step_label, is_published")
    .eq("industry_key", industryKey).eq("is_published", true).order("step_number", { ascending: true });
  if (error) throw new Error(`reference map read failed for '${industryKey}': ${String(error.message ?? error)}`);
  const rows = (data ?? []) as Array<{ industry_key: string; industry_label: string; step_key: string; step_number: number; step_label: string }>;
  if (rows.length === 0) return null;
  const anchors: Partial<IndustryStepAnchor> = {};
  for (const r of rows) {
    const k = String(r.step_key ?? "").toLowerCase() as keyof IndustryStepAnchor;
    if (ODI_KEYS.includes(k) && !anchors[k]) anchors[k] = String(r.step_label ?? "").trim();
  }
  if (ODI_KEYS.some((k) => !anchors[k])) return null; // an incomplete published map is no scaffold
  return { industry_key: industryKey, industry_label: String(rows[0].industry_label ?? industryKey), anchors: anchors as IndustryStepAnchor, step_count: rows.length };
}

/** The run-level decision: a customer run keeps the company category (unchanged); a market run asks the market first. */
export function scaffoldForRun(
  isMarketRun: boolean,
  def: { relationship_kind?: string | null; job_executor?: string | null; jtbd?: string | null } | null,
  companyIndustryLabel: string | null | undefined,
): ScaffoldDecision {
  if (!isMarketRun || !def) return { source: "company", industry_label: companyIndustryLabel?.trim() || null, why: "customer run — company category" };
  return resolveMarketScaffold(def, companyIndustryLabel);
}

export type ScaffoldAnchors =
  | { ok: true; from: "reference" | "draft" | "none"; industry_label: string; anchors: IndustryStepAnchor | null }
  | { ok: false; error: typeof SCAFFOLD_UNPUBLISHED; industry_key: string };

/** Ruling 3 — a market-keyed scaffold comes from the PUBLISHED reference map or the run is refused; a
 *  company-keyed scaffold reads the draft table (unchanged). NEVER a fallback from one to the other. */
export async function resolveScaffoldAnchors(
  supabase: Db,
  decision: ScaffoldDecision,
  draftLookup: (label: string) => IndustryStepAnchor | null,
): Promise<ScaffoldAnchors> {
  if (decision.source === "market") {
    const ref = await loadPublishedReferenceAnchors(supabase, decision.industry_key);
    if (!ref) return { ok: false, error: SCAFFOLD_UNPUBLISHED, industry_key: decision.industry_key };
    return { ok: true, from: "reference", industry_label: ref.industry_key, anchors: ref.anchors };
  }
  const label = decision.industry_label ?? "";
  const anchors = label ? draftLookup(label) : null;
  return { ok: true, from: anchors ? "draft" : "none", industry_label: label, anchors };
}

export const SCAFFOLD_REFUSED = "jobmap_scaffold_refused";

export function scaffoldRefusalMessage(industryKey: string, journeyKey: string): string {
  return `Journey '${journeyKey}' is a ${industryKey} market and no PUBLISHED ${industryKey} reference job map exists (industry_reference_job_maps, is_published=true). ` +
    `Generate it with generate-reference-jobmap and publish it; this run never falls back to another scaffold — nothing was written.`;
}
