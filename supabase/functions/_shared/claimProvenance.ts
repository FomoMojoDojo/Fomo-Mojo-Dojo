// Claim provenance: which company self-claims are independently corroborated. Judged by a
// dedicated structured call against the baseline's own independent items (third-party
// profiles, outside-voice signals, news) — never by keyword matching on claim text.
// "unverified" is the loud deterministic fallback when the judge call fails: every
// company_claim item is tagged self-reported without asserting a corroboration verdict.
//
// Extracted from research-company (single source). The OpenAI client is INJECTED via
// `callJson` so each caller keeps its own client: research-company passes its local
// callOpenAIJSON (budget-ladder retry); leaves pass _shared/openaiClient's.

import { callOpenAIJSON as sharedCallOpenAIJSON } from "./openaiClient.ts";

type CallJson = (opts: {
  apiKey: string;
  model: string;
  schemaName: string;
  schema: unknown;
  systemText: string;
  userText: string;
  maxOutputTokens?: number;
  temperature?: number;
}) => Promise<any>;

type ClaimProvenanceEntry = {
  ledger_index: number | null;
  claim: string;
  status: "corroborated" | "uncorroborated" | "contradicted" | "unverified";
  basis_urls: string[];
};

function urlHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// Company-source predicate — the single independence authority for claim extraction AND
// corroboration basis. All data-level provenance, never claim text: bucket vocabulary
// drifts across baseline generations (some runs emit free-text buckets), so bucket alone
// is reliable in NEITHER direction — a self-claim can hide under a free-text bucket, and
// a company page can masquerade as an independent item.
function isCompanySource(
  entry: { bucket?: string; source_type?: string; url?: string },
  companyHost: string,
): boolean {
  if (String(entry?.bucket || "") === "company_claim") return true;
  if (String(entry?.source_type || "") === "profile_or_company_page") return true;
  const host = urlHost(String(entry?.url || ""));
  if (host && companyHost && (host === companyHost || host.endsWith(`.${companyHost}`))) {
    return true;
  }
  return false;
}

// B1: four-class voice taxonomy. Only outside_voice_about_client may corroborate or fire
// tensions; competitor_voice (unreachable until B2) and market_context ground other
// surfaces but corroborate NOTHING. Reads the discovery-time voice_class when present;
// the deterministic company-source guard overrides any label (an item on the company's
// domain is client_voice no matter what the model said).
//
// ACCEPTED RESIDUAL (council 2026-06-10): legacy items with no voice_class fall back to
// the binary test — isCompanySource ⇒ client_voice, else outside_voice_about_client.
// That preserves current behavior for legacy runs, which means legacy NON-client signals
// (including competitor-adjacent ones) retain corroboration rights until a fresh run
// reclassifies them. The leak is closed for everything classified going forward.
type VoiceClass = "client_voice" | "outside_voice_about_client" | "competitor_voice" | "market_context";
const VOICE_CLASSES: ReadonlySet<string> = new Set([
  "client_voice",
  "outside_voice_about_client",
  "competitor_voice",
  "market_context",
]);

function classifyVoice(
  entry: { voice_class?: string; bucket?: string; source_type?: string; url?: string },
  companyHost: string,
): VoiceClass {
  if (isCompanySource(entry, companyHost)) return "client_voice";
  const labeled = String(entry?.voice_class || "").trim();
  if (VOICE_CLASSES.has(labeled)) return labeled as VoiceClass;
  // Legacy fallback (documented residual above): unclassified non-client ⇒ outside voice.
  return "outside_voice_about_client";
}

function listCompanyClaimLedgerItems(baselineResultJson: unknown, companyWebsite?: string) {
  const baseline = baselineResultJson as {
    evidence_ledger?: Array<{ bucket?: string; snippet?: string; url?: string; source_type?: string }>;
  } | null;
  const ledger = Array.isArray(baseline?.evidence_ledger) ? baseline.evidence_ledger : [];
  const companyHost = urlHost(String(companyWebsite || ""));
  return ledger
    .map((item, index) => ({ index, item }))
    .filter((entry) => isCompanySource(entry.item, companyHost));
}

const claimProvenanceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    claims: {
      type: "array",
      minItems: 0,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          ledger_index: { type: ["integer", "null"] },
          claim: { type: "string" },
          status: { type: "string", enum: ["corroborated", "uncorroborated", "contradicted"] },
          basis_urls: { type: "array", items: { type: "string" } },
        },
        required: ["ledger_index", "claim", "status", "basis_urls"],
      },
    },
  },
  required: ["claims"],
};

async function deriveClaimProvenance(opts: {
  apiKey: string;
  model: string;
  baselineResultJson: unknown;
  companyWebsite?: string;
  callJson?: CallJson;
}): Promise<ClaimProvenanceEntry[]> {
  const callJson = opts.callJson ?? sharedCallOpenAIJSON;
  const baseline = opts.baselineResultJson as {
    evidence_ledger?: Array<{
      bucket?: string;
      snippet?: string;
      url?: string;
      source_type?: string;
    }>;
    outside_voice_signals?: Array<{
      signal?: string;
      alignment?: string;
      sentiment?: string;
      url?: string;
      perspective?: string;
      source_type?: string;
    }>;
    message_alignment?: { alignment_summary?: string };
  } | null;

  const ledger = Array.isArray(baseline?.evidence_ledger) ? baseline.evidence_ledger : [];
  const companyHost = urlHost(String(opts.companyWebsite || ""));
  const companyClaims = listCompanyClaimLedgerItems(opts.baselineResultJson, opts.companyWebsite);
  const alignmentSummary = String(baseline?.message_alignment?.alignment_summary || "");
  if (companyClaims.length === 0 && !alignmentSummary) return [];

  // B1 rights enforcement: the corroboration basis is outside_voice_about_client ONLY.
  // classifyVoice keeps the company-source guard as branch 1 (an item can never be both
  // claim and corroboration basis) and additionally excludes competitor_voice and
  // market_context — closing the binary predicate's rights leak for classified items.
  const independentItems = ledger
    .map((item, index) => ({ index, item }))
    .filter((entry) => classifyVoice(entry.item, companyHost) === "outside_voice_about_client");
  const outsideSignals = (Array.isArray(baseline?.outside_voice_signals)
    ? baseline.outside_voice_signals
    : []
  ).filter((signal) => classifyVoice(signal, companyHost) === "outside_voice_about_client");
  // Basis-composition evidence (countable): what the whole baseline contained vs what
  // was admitted as corroboration basis.
  {
    const tally = (arr: Array<{ voice_class?: string; bucket?: string; source_type?: string; url?: string }>) => {
      const out: Record<string, number> = {};
      for (const e of arr) { const c = classifyVoice(e, companyHost); out[c] = (out[c] || 0) + 1; }
      return out;
    };
    console.log("[claimProvenance] corroboration basis composition", {
      ledger_by_class: tally(ledger),
      admitted_ledger_items: independentItems.length,
      admitted_outside_signals: outsideSignals.length,
    });
  }

  // Deterministic post-validation set: corroboration may only cite these URLs.
  const independentUrls = new Set<string>(
    [
      ...independentItems.map((entry) => String(entry.item?.url || "").trim()),
      ...outsideSignals.map((signal) => String(signal?.url || "").trim()),
    ].filter(Boolean),
  );

  const userText =
    `Company self-claims (from the evidence ledger, with their ledger index):\n` +
    (companyClaims.length
      ? companyClaims
          .map((entry) => `[index ${entry.index}] ${entry.item?.snippet || "No snippet"}`)
          .join("\n")
      : "None in ledger.") +
    `\n\nCompany-attributed claims may also appear in this alignment summary (use ledger_index null for claims found only here):\n` +
    (alignmentSummary || "None.") +
    `\n\nIndependent evidence (third-party profiles, news, customer/outside voice — the ONLY admissible corroboration basis):\n` +
    independentItems
      .map((entry) => `- [${entry.item?.bucket || "signal"}] ${entry.item?.snippet || "No snippet"} (url: ${entry.item?.url || "unknown"})`)
      .join("\n") +
    `\n\nOutside voice signals:\n` +
    outsideSignals
      .map((signal) => `- [${signal?.perspective || "outside voice"} | ${signal?.sentiment || "unknown"}] ${signal?.signal || "No signal"} | alignment: ${signal?.alignment || "unknown"} (url: ${signal?.url || "unknown"})`)
      .join("\n") +
    `\n\nJudge every company self-claim listed above.`;

  const systemText =
    `You are a claim provenance judge.\n` +
    `Return ONLY valid JSON matching the schema. No prose.\n` +
    `For each company self-claim, decide from the independent evidence ONLY:\n` +
    `- corroborated: at least one independent item attests the claim's core fact (even with different wording). basis_urls MUST cite the attesting independent item URL(s).\n` +
    `- contradicted: independent evidence cuts against the claim's core fact.\n` +
    `- uncorroborated: no independent item speaks to the claim either way.\n` +
    `Judge the claim's core fact, not its exact phrasing. Never treat the company's own pages or profiles as corroboration.\n` +
    `Echo each ledger claim with its given ledger_index; claims found only in the alignment summary get ledger_index null.\n`;

  const result = await callJson({
    apiKey: opts.apiKey,
    model: opts.model,
    schemaName: "mojo_claim_provenance_v1",
    schema: claimProvenanceSchema,
    systemText,
    userText,
    maxOutputTokens: 1200,
    temperature: 0.1,
  });

  const rows: any[] = Array.isArray(result?.claims) ? result.claims : [];
  // Corroboration must be earned, not asserted: basis_urls must be a subset of the provided
  // independent-item URLs; a corroborated verdict with no valid citation downgrades.
  return rows.map((row) => {
    const basis = (Array.isArray(row?.basis_urls) ? row.basis_urls : [])
      .map((url: unknown) => String(url || "").trim())
      .filter((url: string) => independentUrls.has(url));
    let status = String(row?.status || "uncorroborated") as ClaimProvenanceEntry["status"];
    if (!["corroborated", "uncorroborated", "contradicted"].includes(status)) {
      status = "uncorroborated";
    }
    if (status === "corroborated" && basis.length === 0) status = "uncorroborated";
    return {
      ledger_index: typeof row?.ledger_index === "number" ? row.ledger_index : null,
      claim: String(row?.claim || ""),
      status,
      basis_urls: basis,
    };
  });
}

// ── Attribute evidence judge (canvas leaf) ──────────────────────────────────────
// Same discipline applied to the canvas's unique attributes: the gen schema forces a
// per-attribute evidence_status choice, but a choice is not honesty — this judge re-derives
// status per attribute index against the baseline's independent evidence, and the
// deterministic subset-check downgrades any corroborated verdict whose citations don't
// validate. The judge's verdict overrides the gen's self-assignment.

type AttributeEvidenceVerdict = {
  index: number;
  evidence_status: "corroborated" | "self_reported";
  basis_urls: string[];
};

const attributeEvidenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    attributes: {
      type: "array",
      minItems: 0,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer" },
          evidence_status: { type: "string", enum: ["corroborated", "self_reported"] },
          basis_urls: { type: "array", items: { type: "string" } },
        },
        required: ["index", "evidence_status", "basis_urls"],
      },
    },
  },
  required: ["attributes"],
};

async function judgeAttributeEvidence(opts: {
  apiKey: string;
  model: string;
  baselineResultJson: unknown;
  attributes: Array<{ name?: string; description?: string }>;
  companyWebsite?: string;
  callJson?: CallJson;
}): Promise<AttributeEvidenceVerdict[]> {
  const callJson = opts.callJson ?? sharedCallOpenAIJSON;
  if (!opts.attributes.length) return [];

  const baseline = opts.baselineResultJson as {
    evidence_ledger?: Array<{ bucket?: string; snippet?: string; url?: string; source_type?: string }>;
    outside_voice_signals?: Array<{
      signal?: string;
      alignment?: string;
      sentiment?: string;
      url?: string;
      perspective?: string;
      source_type?: string;
    }>;
  } | null;
  const ledger = Array.isArray(baseline?.evidence_ledger) ? baseline.evidence_ledger : [];

  // Independence is judged by PROVENANCE, all data-level (never claim text), via the
  // shared company-source predicate — the validation run that motivated it corroborated
  // "42 states" off iaqm.com/about when bucket vocabulary alone was the test.
  const companyHost = urlHost(String(opts.companyWebsite || ""));
  // B1 rights enforcement: corroboration basis = outside_voice_about_client only (see
  // classifyVoice — competitor_voice and market_context may ground other surfaces but
  // corroborate nothing).
  const independentItems = ledger
    .map((item, index) => ({ index, item }))
    .filter((entry) => classifyVoice(entry.item, companyHost) === "outside_voice_about_client");
  const outsideSignals = (Array.isArray(baseline?.outside_voice_signals)
    ? baseline.outside_voice_signals
    : []
  ).filter((signal) => classifyVoice(signal, companyHost) === "outside_voice_about_client");
  console.log("[attrEvidence] corroboration basis composition", {
    admitted_ledger_items: independentItems.length,
    admitted_outside_signals: outsideSignals.length,
  });
  const independentUrls = new Set<string>(
    [
      ...independentItems.map((entry) => String(entry.item?.url || "").trim()),
      ...outsideSignals.map((signal) => String(signal?.url || "").trim()),
    ].filter(Boolean),
  );

  const userText =
    `Positioning unique attributes (judge each by its index):\n` +
    opts.attributes
      .map((attribute, index) => `[index ${index}] ${attribute?.name || "Untitled"} — ${attribute?.description || "No description"}`)
      .join("\n") +
    `\n\nIndependent evidence (third-party profiles, news, customer/outside voice — the ONLY admissible corroboration basis):\n` +
    independentItems
      .map((entry) => `- [${entry.item?.bucket || "signal"}] ${entry.item?.snippet || "No snippet"} (url: ${entry.item?.url || "unknown"})`)
      .join("\n") +
    `\n\nOutside voice signals:\n` +
    outsideSignals
      .map((signal) => `- [${signal?.perspective || "outside voice"} | ${signal?.sentiment || "unknown"}] ${signal?.signal || "No signal"} | alignment: ${signal?.alignment || "unknown"} (url: ${signal?.url || "unknown"})`)
      .join("\n") +
    `\n\nJudge every attribute listed above.`;

  const systemText =
    `You are an evidence judge for positioning claims.\n` +
    `Return ONLY valid JSON matching the schema. No prose.\n` +
    `For each attribute, decide from the independent evidence ONLY:\n` +
    `- corroborated: at least one independent item attests the attribute's core fact (even with different wording). basis_urls MUST cite the attesting independent item URL(s). The cited item must attest the SPECIFIC fact claimed, not merely mention the company.\n` +
    `- self_reported: no independent item attests the attribute's core fact — it exists only as the company's own description of itself.\n` +
    `Judge the core fact, not the phrasing. Never treat the company's own pages, profiles, or self-descriptions as corroboration.\n` +
    `Echo every attribute with its given index.\n`;

  const result = await callJson({
    apiKey: opts.apiKey,
    model: opts.model,
    schemaName: "mojo_attribute_evidence_v1",
    schema: attributeEvidenceSchema,
    systemText,
    userText,
    maxOutputTokens: 1000,
    temperature: 0.1,
  });

  const rows: any[] = Array.isArray(result?.attributes) ? result.attributes : [];
  // Corroboration must be earned: citations outside the independent-URL set are dropped,
  // and a corroborated verdict left without valid citations downgrades to self_reported.
  return rows
    .filter((row) => typeof row?.index === "number")
    .map((row) => {
      const basis = (Array.isArray(row?.basis_urls) ? row.basis_urls : [])
        .map((url: unknown) => String(url || "").trim())
        .filter((url: string) => independentUrls.has(url));
      let status = row?.evidence_status === "corroborated" ? "corroborated" : "self_reported";
      if (status === "corroborated" && basis.length === 0) status = "self_reported";
      return {
        index: row.index as number,
        evidence_status: status as AttributeEvidenceVerdict["evidence_status"],
        basis_urls: basis,
      };
    });
}

export {
  claimProvenanceSchema,
  classifyVoice,
  deriveClaimProvenance,
  judgeAttributeEvidence,
  listCompanyClaimLedgerItems,
};
export type { AttributeEvidenceVerdict, ClaimProvenanceEntry };
