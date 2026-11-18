// FOCUS MARKETS (F-1, 2026-11-17; Proposal A, decisions 1/3/6/8) — the client's customer, named and
// signed by the operator. An ORDERED SET of one or more of the company's live markets, stored in
// operator_primary_selection as one row per rank (domain focus_market_01, _02, …). The ONE write path is
// public.sign_focus_markets (admin-only, audited); every live market is offered by
// public.focus_market_options. See supabase/migrations/20261117130000_focus_markets.sql.
import { supabase } from "@/integrations/supabase/client";

/** Admin-only strings, signed as drafted (decision 8). */
export const FOCUS_STRINGS = {
  title: "Focus market",
  proposedFrom: (n: number) => `Proposed by the system from ${n} pieces of evidence`,
  ranUnfocused: "Ran unfocused",
  otherParty: (n: number) => `${n} findings were about another party and were not queued`,
} as const;

export const FOCUS_DOMAIN_PATTERN = /^focus_market_[0-9]{2}$/;
export const MAX_FOCUS_MARKETS = 20;

export type FocusMarketOption = {
  market_definition_id: string;
  journey_key: string;
  job_executor: string | null;
  jtbd: string | null;
  relationship_kind: string | null;
  market_register: string | null;
  validation_state: string | null;
  needs: number;
  job_steps: number;
  outcomes: number;
  evidence: number;
  signed_rank: number | null;
};

export type SignedFocusMarket = {
  rank: number;
  market_definition_id: string;
  journey_key: string;
  chosen_by: string | null;
  chosen_at: string | null;
};

/** The rank a focus_market domain stands for ("focus_market_03" → 3), or null for any other domain. */
export function focusRank(domain: string): number | null {
  return FOCUS_DOMAIN_PATTERN.test(domain) ? Number(domain.slice("focus_market_".length)) : null;
}

/** The domain for a 1-based rank (3 → "focus_market_03"). */
export function focusDomain(rank: number): string {
  if (!Number.isInteger(rank) || rank < 1 || rank > MAX_FOCUS_MARKETS) throw new Error(`focus rank out of range: ${rank}`);
  return `focus_market_${String(rank).padStart(2, "0")}`;
}

/** The signed set, in rank order, read from the options list. */
export function signedFromOptions(options: FocusMarketOption[]): FocusMarketOption[] {
  return options.filter((o) => o.signed_rank != null).sort((a, b) => (a.signed_rank ?? 0) - (b.signed_rank ?? 0));
}

/** Move one id up (-1) or down (+1) in an ordered list; out-of-range moves are no-ops. */
export function moveInOrder(ids: string[], id: string, delta: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// deno-lint-ignore no-explicit-any
const rpc = (name: string, args: Record<string, unknown>) => (supabase as any).rpc(name, args);

export async function fetchFocusMarketOptions(companyId: string): Promise<FocusMarketOption[]> {
  const { data, error } = await rpc("focus_market_options", { p_company_id: companyId });
  if (error) throw new Error(error.message);
  return (data ?? []) as FocusMarketOption[];
}

/** Sign the ordered set (an empty list unsigns). Returns the set as stored. */
export async function signFocusMarkets(companyId: string, orderedMarketIds: string[]): Promise<SignedFocusMarket[]> {
  const { data, error } = await rpc("sign_focus_markets", { p_company_id: companyId, p_market_ids: orderedMarketIds });
  if (error) throw new Error(error.message);
  return (data ?? []) as SignedFocusMarket[];
}

// ── F-2: the system proposes, the operator signs (decision 6) ──────────────────────────────────
export type FocusProposal = {
  id: string;
  evidence_total: number;
  ranking: Array<{ market_definition_id: string; journey_key: string; job_executor: string | null; evidence: number }>;
};

/** The markets a proposal puts forward: its ranking, in order, those with any evidence at all. */
export function proposedIds(p: FocusProposal | null): string[] {
  return (p?.ranking ?? []).filter((r) => r.evidence > 0).map((r) => r.market_definition_id).slice(0, MAX_FOCUS_MARKETS);
}

/** The latest PENDING focus proposal for the company, or null. A read; nothing is written. */
export async function fetchPendingFocusProposal(companyId: string): Promise<FocusProposal | null> {
  // deno-lint-ignore no-explicit-any
  const { data, error } = await (supabase as any).from("surface_proposals").select("id, proposed_state")
    .eq("company_id", companyId).eq("surface_type", "focus_market").eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const ps = (data.proposed_state ?? {}) as { ranking?: FocusProposal["ranking"]; evidence_total?: number };
  return { id: data.id, evidence_total: Number(ps.evidence_total ?? 0), ranking: ps.ranking ?? [] };
}

/** Ask the system for a proposal (admin, deterministic, no model). Supersedes an older pending one. */
export async function proposeFocusMarkets(companyId: string): Promise<void> {
  const { error } = await rpc("propose_focus_markets", { p_company_id: companyId });
  if (error) throw new Error(error.message);
}

// ── F-3: what a file analysis ran under (Admin Files) ──────────────────────────────────────────
/** The focus line for a READY analysis: "Ran unfocused", or the signed markets in rank order. */
export function focusRunLine(focus: Array<{ job_executor: string; journey_key: string }> | null | undefined): string {
  const set = focus ?? [];
  if (set.length === 0) return FOCUS_STRINGS.ranUnfocused;
  return `${FOCUS_STRINGS.title}: ${set.map((m) => m.job_executor || m.journey_key).join(" · ")}`;
}

