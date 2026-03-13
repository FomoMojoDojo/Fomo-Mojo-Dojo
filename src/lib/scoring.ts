export const SCORE_WEIGHTS: Record<string, Record<string, number>> = {
  positioning: {
    competitive_alternatives: 0.25,
    unique_attributes: 0.25,
    value_proposition: 0.25,
    target_customer: 0.15,
    market_category: 0.10,
  },
  strategy: {
    jtbd_implementation: 0.30,
    odi_process: 0.25,
    market_opportunity: 0.25,
    resource_allocation: 0.10,
    competitive_strategy: 0.10,
  },
  product: {
    kano_analysis: 0.35,
    ux_job_alignment: 0.30,
    roadmap_clarity: 0.20,
    okr_stories: 0.15,
  },
  marketing: {
    brandscript: 0.25,
    success_messaging: 0.25,
    channel_strategy: 0.25,
    content_presence: 0.25,
  },
  sales: {
    sales_process: 0.35,
    win_loss_analysis: 0.30,
    qualification_criteria: 0.20,
    pipeline_data: 0.15,
  },
  cx: {
    retention_data: 0.35,
    job_steps_coverage: 0.35,
    expansion_motion: 0.30,
  },
};

export const MOJO_WEIGHTS: Record<string, number> = {
  positioning: 0.25,
  strategy: 0.20,
  product: 0.18,
  marketing: 0.17,
  sales: 0.10,
  cx: 0.10,
};

export const AREA_LAYERS: Record<string, number> = {
  positioning: 1,
  strategy: 1,
  product: 2,
  marketing: 2,
  sales: 3,
  cx: 3,
};

/** Component values (1–10) → 0–100 area score */
export function computeAreaScore(
  components: Record<string, number>,
  weights: Record<string, number>
): number {
  return Math.round(
    Object.entries(weights).reduce((s, [k, w]) => s + (components[k] ?? 0) * w, 0) * 100
  ) / 10;
}

/**
 * Constraint cascade:
 *   Layer 2 (product, marketing) → max 90% of MIN(positioning, strategy)
 *   Layer 3 (sales, cx)          → max 80% of MIN(all four above)
 */
export function applyCeilings(rawScores: Record<string, number>): {
  scores: Record<string, number>;
  ceilings: Record<string, number | null>;
} {
  const { positioning, strategy, product, marketing, sales, cx } = rawScores;
  const foundationMin = Math.min(positioning, strategy);
  const allUpstreamMin = Math.min(positioning, strategy, product, marketing);
  const ceiling2 = foundationMin * 0.9;
  const ceiling3 = allUpstreamMin * 0.8;

  return {
    scores: {
      positioning,
      strategy,
      product: Math.min(product, ceiling2),
      marketing: Math.min(marketing, ceiling2),
      sales: Math.min(sales, ceiling3),
      cx: Math.min(cx, ceiling3),
    },
    ceilings: {
      positioning: null,
      strategy: null,
      product: product > ceiling2 ? ceiling2 : null,
      marketing: marketing > ceiling2 ? ceiling2 : null,
      sales: sales > ceiling3 ? ceiling3 : null,
      cx: cx > ceiling3 ? ceiling3 : null,
    },
  };
}

export function computeMojoScore(scores: Record<string, number>): number {
  return Math.round(
    Object.entries(MOJO_WEIGHTS).reduce((s, [k, w]) => s + (scores[k] ?? 0) * w, 0) * 10
  ) / 10;
}

export function computeProjectedScore(
  currentScore: number,
  inputs: Array<{ score_impact: number; status: string }>
): number {
  const gain = inputs
    .filter((i) => i.status !== 'complete')
    .reduce((s, i) => s + (i.score_impact ?? 0), 0);
  return Math.min(Math.round((currentScore + gain) * 10) / 10, 100);
}

/** ODI opportunity score formula */
export function computeOpportunityScore(importance: number, satisfaction: number): number {
  return Math.round((importance + Math.max(importance - satisfaction, 0)) * 10) / 10;
}

export function scoreColor(score: number): string {
  if (score >= 65) return 'hsl(var(--forest))';
  if (score >= 40) return 'hsl(var(--rust))';
  return 'hsl(var(--danger))';
}

export function scoreColorClass(score: number): string {
  if (score >= 65) return 'text-forest';
  if (score >= 40) return 'text-rust';
  return 'text-danger';
}

export function impactTier(pts: number): 'high' | 'med' | 'low' {
  if (pts >= 3.0) return 'high';
  if (pts >= 1.0) return 'med';
  return 'low';
}

export function opportunitySegment(score: number): 'focus' | 'monitor' | 'defer' {
  if (score >= 12) return 'focus';
  if (score >= 8) return 'monitor';
  return 'defer';
}
