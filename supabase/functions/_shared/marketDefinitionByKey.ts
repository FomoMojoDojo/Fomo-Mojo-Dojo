// R2 (operator ruling, 2026-09-15) — the ONE way a run reads a market definition.
//
// Every definition read is by (company_id, journey_key), retracted excluded, and there is
// NO fallback to a latest row: a key with no live definition refuses before any write.
// The never-edit law follows from the read — a run can only ever see the rows it named.
//
// The old shape this replaces (local-jobmap-synthesis :996 / :1244; opportunitySynthesis
// :511; stepConditionsSynthesis :394) ordered by created_at/updated_at and took the first
// row of the company, so a public-register discovery written last (Edgewood: 1bbe6408,
// New Clinicians) became "the market" for a customer run.
export const NO_MARKET_DEFINITION = "no_market_definition" as const;

export type JourneyDefinition = {
  id: string;
  journey_key: string;
  job_executor: string;
  chooser: string;
  jtbd: string;
  provenance_type: string | null;
  market_register: string | null;
};

export type ResolveDefinitionsResult =
  | { ok: true; byKey: Map<string, JourneyDefinition> }
  | { ok: false; error: typeof NO_MARKET_DEFINITION; missing: string[]; message: string };

type Db = { from: (t: string) => any };

const SELECT = "id, journey_key, job_executor, chooser, jtbd, provenance_type, market_register";

/** The keyed, live-only read. null when the key has no live definition — callers refuse. */
export async function readLiveDefinitionByKey(
  supabase: Db,
  companyId: string,
  journeyKey: string,
): Promise<JourneyDefinition | null> {
  const { data, error } = await supabase
    .from("odi_market_definitions")
    .select(SELECT)
    .eq("company_id", companyId)
    .eq("journey_key", journeyKey)
    .is("retracted_at", null)
    .maybeSingle();
  if (error) throw new Error(`market definition read failed for '${journeyKey}': ${error.message}`);
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id ?? ""),
    journey_key: String(r.journey_key ?? journeyKey),
    job_executor: String(r.job_executor ?? "").trim(),
    chooser: String(r.chooser ?? "").trim(),
    jtbd: String(r.jtbd ?? "").trim(),
    provenance_type: r.provenance_type == null ? null : String(r.provenance_type),
    market_register: r.market_register == null ? null : String(r.market_register),
  };
}

export function noMarketDefinitionMessage(missing: string[]): string {
  const keys = missing.map((k) => `'${k}'`).join(", ");
  return missing.length === 1
    ? `No live market definition for journey ${keys}. Define the market for this set (generate-market-hypothesis, or a declared definition) before generating its job map — nothing was written.`
    : `No live market definition for journeys ${keys}. Every set in a run needs its own market definition before any of them is generated — nothing was written.`;
}

/**
 * Resolve every key of a run BEFORE any write. All-or-nothing: one missing key refuses
 * the whole run, so a multi-map run can never half-write.
 */
export async function resolveJourneyDefinitions(
  supabase: Db,
  companyId: string,
  journeyKeys: string[],
): Promise<ResolveDefinitionsResult> {
  const keys = [...new Set(journeyKeys.map((k) => String(k ?? "").trim()).filter(Boolean))];
  const byKey = new Map<string, JourneyDefinition>();
  const missing: string[] = [];
  for (const key of keys) {
    const def = await readLiveDefinitionByKey(supabase, companyId, key);
    if (def) byKey.set(key, def);
    else missing.push(key);
  }
  if (missing.length > 0) {
    return { ok: false, error: NO_MARKET_DEFINITION, missing, message: noMarketDefinitionMessage(missing) };
  }
  return { ok: true, byKey };
}

/** The per-journey ODI grounding block for a model brief — one definition per requested set. */
export function renderOdiGrounding(
  definitions: JourneyDefinition[],
  extras: { desiredOutcome?: string; outcomeLeadingIndicator?: string; recurringChallenge?: string } = {},
): string {
  if (definitions.length === 0) return "";
  const lines: string[] = [
    "ODI grounding inputs — one market definition per requested journey_key (use these as the foundation; do not invent a different job or performer for any journey):",
  ];
  for (const d of definitions) {
    lines.push(`- journey_key '${d.journey_key}':`);
    if (d.job_executor) lines.push(`  - Job performer: ${d.job_executor}`);
    if (d.chooser) lines.push(`  - Chooser: ${d.chooser}`);
    if (d.jtbd) lines.push(`  - Primary job: ${d.jtbd}`);
  }
  if (extras.desiredOutcome) lines.push(`- Primary desired outcome: ${extras.desiredOutcome}`);
  if (extras.outcomeLeadingIndicator) lines.push(`- Outcome leading indicator: ${extras.outcomeLeadingIndicator}`);
  if (extras.recurringChallenge) lines.push(`- Recurring progress challenge: ${extras.recurringChallenge}`);
  return `\n${lines.join("\n")}\n`;
}
