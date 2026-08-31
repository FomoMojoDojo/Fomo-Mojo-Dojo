// ── Stage B — public Playing-to-Win cascade routing (deterministic, pure) ────────────────────────
//
// Given a 5-rung strategy payload (as the generator emits it) and the judge's cascade_coherence
// verdict, this module computes TWO things, with no I/O so the vacuous-proofs can exercise it:
//
//   spine  — the strategy payload with INCOHERENT grounded rungs excluded (ruling R3: the coherent
//            spine renders; a grounded-but-incoherent rung is NOT dressed as clean). how_to_win is
//            blanked when it doesn't serve where-to-play + aspiration; a capability is dropped when it
//            doesn't serve how_to_win.
//   items  — the cascade_gap routing set for the Questions beat:
//              • GAP     — a rung the public record does not GROUND (empty on arrival), never fabricated.
//              • TENSION — a grounded rung that FAILS coherence, surfaced (never silently dropped).
//
// A rung is EITHER a gap (ungrounded) OR a tension (grounded-but-incoherent) — never both. Grounding is
// read from the RAW payload (before the coherence filter); tensions from the verdict.
//
// The gap/tension QUESTION TEMPLATES here are DRAFT strings the operator signs at the Stage-B hold.

export type RungKey =
  | "winning_aspiration" | "where_to_play" | "how_to_win"
  | "must_have_capabilities" | "management_systems";

export interface CapItem { text?: string | null; citations?: unknown }
export interface StrategyPayload {
  winning_aspiration?: string | null;
  where_to_play?: string | null;
  how_to_win?: string | null;
  must_have_capabilities?: Array<CapItem | string> | null;
  management_systems?: Array<CapItem | string> | null;
  [k: string]: unknown;
}
export interface CascadeCoherence {
  how_to_win?: { coherent?: boolean; reason?: string | null } | null;
  capabilities?: Array<{ text?: string | null; coherent?: boolean; reason?: string | null }> | null;
}
export interface CascadeGapItem {
  kind: "gap" | "tension";
  rung: RungKey;
  question_text: string;
  question_identity: string;
  reason: string | null; // judge's coherence reason (tension only)
}

/** Plain-language rung names used in the DRAFT gap question (operator signs at hold). */
export const RUNG_PLAIN_NAME: Record<RungKey, string> = {
  winning_aspiration: "a winning aspiration",
  where_to_play: "where you play",
  how_to_win: "how you win",
  must_have_capabilities: "the capabilities this strategy needs",
  management_systems: "the systems that run the strategy",
};

/** DRAFT question templates (operator signs at hold). */
export const cascadeGapQuestion = (plainName: string): string =>
  `The public record doesn't show ${plainName} — what is it?`;
export const cascadeTensionQuestion = (rungLabel: string, text: string, servesWhat: string): string =>
  `${rungLabel} reads as "${text}", but it doesn't clearly serve ${servesWhat} — which is right?`;

export function capText(item: CapItem | string | null | undefined): string {
  if (typeof item === "string") return item.trim();
  return String(item?.text ?? "").trim();
}
const nonEmptyText = (s: unknown): boolean => typeof s === "string" && s.trim().length > 0;
const listItems = (arr: Array<CapItem | string> | null | undefined): string[] =>
  (Array.isArray(arr) ? arr : []).map(capText).filter(Boolean);

/** Short, stable slug for a capability tension's question_identity (kept unique within a run). */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

/**
 * Derive the rendered spine + the cascade_gap routing items. Pure: same inputs → same outputs.
 * `coherenceOn` gates the tension pass — when the judge returned no cascade_coherence (older payloads),
 * the spine passes through unfiltered and only GAP items are produced.
 */
export function deriveCascadeSpineAndGaps(
  strategy: StrategyPayload | null | undefined,
  coherence: CascadeCoherence | null | undefined,
): { spine: StrategyPayload; items: CascadeGapItem[] } {
  const s: StrategyPayload = strategy ?? {};
  const items: CascadeGapItem[] = [];

  const aspiration = nonEmptyText(s.winning_aspiration) ? String(s.winning_aspiration).trim() : "";
  const whereToPlay = nonEmptyText(s.where_to_play) ? String(s.where_to_play).trim() : "";
  const howToWinRaw = nonEmptyText(s.how_to_win) ? String(s.how_to_win).trim() : "";
  const capsRaw = listItems(s.must_have_capabilities);
  const mgmtRaw = listItems(s.management_systems);

  // ── COHERENCE PASS (grounded-but-incoherent → tension + excluded from spine) ──
  const htwVerdict = coherence?.how_to_win ?? null;
  const htwIncoherent = !!howToWinRaw && htwVerdict != null && htwVerdict.coherent === false;
  if (htwIncoherent) {
    items.push({
      kind: "tension", rung: "how_to_win",
      question_text: cascadeTensionQuestion("How to win", howToWinRaw, "your where-to-play and winning aspiration"),
      question_identity: "cascade_tension:how_to_win",
      reason: htwVerdict?.reason ?? null,
    });
  }
  const howToWin = htwIncoherent ? "" : howToWinRaw;

  // Per-capability coherence (match verdict by text; a capability with no verdict is kept).
  const capVerdicts = Array.isArray(coherence?.capabilities) ? coherence!.capabilities! : [];
  const capIncoherent = (text: string): { bad: boolean; reason: string | null } => {
    const v = capVerdicts.find((c) => capText(c.text ?? "") === text);
    return { bad: !!v && v.coherent === false, reason: v?.reason ?? null };
  };
  const capsKept: string[] = [];
  for (const c of capsRaw) {
    const { bad, reason } = capIncoherent(c);
    if (bad) {
      items.push({
        kind: "tension", rung: "must_have_capabilities",
        question_text: cascadeTensionQuestion("A must-have capability", c, "how you win"),
        question_identity: `cascade_tension:must_have_capabilities:${slug(c)}`,
        reason,
      });
    } else capsKept.push(c);
  }

  // ── GROUNDING PASS (ungrounded rung → gap). Read from the RAW payload, not the filtered spine. ──
  const gapFor = (rung: RungKey) =>
    items.push({
      kind: "gap", rung,
      question_text: cascadeGapQuestion(RUNG_PLAIN_NAME[rung]),
      question_identity: `cascade_gap:${rung}`,
      reason: null,
    });
  if (!aspiration) gapFor("winning_aspiration");
  if (!whereToPlay) gapFor("where_to_play");
  if (!howToWinRaw) gapFor("how_to_win");
  if (capsRaw.length === 0) gapFor("must_have_capabilities");
  if (mgmtRaw.length === 0) gapFor("management_systems");

  const spine: StrategyPayload = {
    ...s,
    winning_aspiration: aspiration || "",
    where_to_play: whereToPlay || "",
    how_to_win: howToWin || "",
    // keep the original item objects (with citations) for the KEPT capabilities, in original order
    must_have_capabilities: (Array.isArray(s.must_have_capabilities) ? s.must_have_capabilities : [])
      .filter((it) => capsKept.includes(capText(it))),
    management_systems: Array.isArray(s.management_systems) ? s.management_systems : [],
  };

  return { spine, items };
}
