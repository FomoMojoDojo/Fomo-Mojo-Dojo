// Standard input-area taxonomy — client source of truth for scaffolding a fresh
// company's `inputs` rows without running the (destructive) research-company edge fn.
//
// ⚠️ This MIRRORS the edge function's parallel copy and must stay in sync:
//   supabase/functions/research-company/index.ts
//     - INPUT_KEYS         (~line 4584)  — the 14 keys, this order
//     - INPUT_GROUP_BY_KEY (~line 4525)  — key → group_key (foundation/execution/market_evidence)
// Only input_label/description there are LLM-authored; the keys + groups are static.
// Do NOT refactor the edge fn this pass — just keep these two lists identical.

export type InputGroupKey = "foundation" | "execution" | "market_evidence";

export interface StandardInputArea {
  input_key: string;
  group_key: InputGroupKey;
  group_label: string;
  input_label: string;
}

export const GROUP_LABELS: Record<InputGroupKey, string> = {
  foundation: "Foundation",
  execution: "Execution",
  market_evidence: "Market Evidence",
};

// 14 standard areas, ordered to mirror the edge fn's INPUT_KEYS.
export const STANDARD_INPUT_AREAS: StandardInputArea[] = [
  // ── Foundation (7) ────────────────────────────────────────────────────────
  { input_key: "comp-alt",          group_key: "foundation",      group_label: GROUP_LABELS.foundation,      input_label: "Competitive Alternatives" },
  { input_key: "unique-attr",       group_key: "foundation",      group_label: GROUP_LABELS.foundation,      input_label: "Unique Attributes" },
  { input_key: "val-prop",          group_key: "foundation",      group_label: GROUP_LABELS.foundation,      input_label: "Value Proposition" },
  { input_key: "target-aud",        group_key: "foundation",      group_label: GROUP_LABELS.foundation,      input_label: "Target Audiences" },
  { input_key: "market-cat",        group_key: "foundation",      group_label: GROUP_LABELS.foundation,      input_label: "Market Category" },
  { input_key: "operating-model",   group_key: "foundation",      group_label: GROUP_LABELS.foundation,      input_label: "Operating Model" },
  { input_key: "customer-research", group_key: "foundation",      group_label: GROUP_LABELS.foundation,      input_label: "Customer Research" },
  // ── Execution (3) ─────────────────────────────────────────────────────────
  { input_key: "acquisition-map",   group_key: "execution",       group_label: GROUP_LABELS.execution,       input_label: "Acquisition Map" },
  { input_key: "brand-narrative",   group_key: "execution",       group_label: GROUP_LABELS.execution,       input_label: "Brand Narrative" },
  { input_key: "channel-strat",     group_key: "execution",       group_label: GROUP_LABELS.execution,       input_label: "Channel Strategy" },
  // ── Market Evidence (4) ───────────────────────────────────────────────────
  { input_key: "outcome-evidence",  group_key: "market_evidence", group_label: GROUP_LABELS.market_evidence, input_label: "Outcome Evidence" },
  { input_key: "retention-signals", group_key: "market_evidence", group_label: GROUP_LABELS.market_evidence, input_label: "Retention Signals" },
  { input_key: "demand-pipeline",   group_key: "market_evidence", group_label: GROUP_LABELS.market_evidence, input_label: "Demand Pipeline" },
  { input_key: "customer-signals",  group_key: "market_evidence", group_label: GROUP_LABELS.market_evidence, input_label: "Customer Signals" },
];

export const STANDARD_INPUT_KEYS: string[] = STANDARD_INPUT_AREAS.map((a) => a.input_key);
