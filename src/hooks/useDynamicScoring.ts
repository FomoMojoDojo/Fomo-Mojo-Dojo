import { useMemo } from 'react';
import type { InputItem, ClientSummary, ScoreArea } from '@/lib/types';
import { applyCeilings, computeMojoScore, computeProjectedScore } from '@/lib/scoring';


/**
 * Map input completeness (0-100) into a 0-100 area score.
 * Groups inputs by sub_group / group_key and averages their completeness.
 */
function inputsToAreaRaw(inputs: InputItem[]): Record<string, number> {
  const areaMap: Record<string, number[]> = {
    positioning: [],
    strategy: [],
    product: [],
    marketing: [],
    sales: [],
    cx: [],
  };

  for (const input of inputs) {
    const sub = input.sub_group.toLowerCase();
    const group = input.group_key;

    // Map by sub_group keywords (flexible matching for any industry)
    if (sub.includes('positioning')) {
      areaMap.positioning.push(input.completeness);
    } else if (sub.includes('strategy')) {
      areaMap.strategy.push(input.completeness);
    } else if (sub.includes('service delivery') || sub.includes('operations') || sub.includes('product')) {
      areaMap.product.push(input.completeness);
    } else if (sub.includes('awareness') || sub.includes('marketing') || sub.includes('outreach')) {
      areaMap.marketing.push(input.completeness);
    } else if (sub.includes('referral') || sub.includes('sales') || sub.includes('pipeline')) {
      areaMap.sales.push(input.completeness);
    } else if (sub.includes('fundraising') || sub.includes('revenue') || sub.includes('donor')) {
      areaMap.sales.push(input.completeness);
    } else if (sub.includes('family') || sub.includes('customer') || sub.includes('client') || sub.includes('experience') || sub.includes('satisfaction')) {
      areaMap.cx.push(input.completeness);
    } else {
      // Fallback: map by group_key
      if (group === 'foundation') areaMap.positioning.push(input.completeness);
      else if (group === 'execution') areaMap.marketing.push(input.completeness);
      else areaMap.cx.push(input.completeness);
    }
  }

  const raw: Record<string, number> = {};
  for (const [area, vals] of Object.entries(areaMap)) {
    if (vals.length === 0) {
      raw[area] = 0;
    } else {
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      raw[area] = Math.round(avg * 10) / 10;
    }
  }
  return raw;
}

function trendFromScore(score: number): 'up' | 'down' | 'flat' {
  if (score >= 50) return 'up';
  if (score >= 20) return 'flat';
  return 'down';
}

/** Build industry-adaptive area labels from actual input sub_groups */
function buildAreaLabels(inputs: InputItem[]): Record<string, string> {
  const defaults: Record<string, string> = {
    positioning: 'Positioning & Story',
    strategy: 'Strategy',
    product: 'Product & Operations',
    marketing: 'Marketing & Awareness',
    sales: 'Sales & Revenue',
    cx: 'Customer Experience',
  };

  // Try to pick better labels from actual sub_group names
  for (const input of inputs) {
    const sub = input.sub_group.toLowerCase();
    if (sub.includes('positioning')) {
      defaults.positioning = 'Positioning & Story';
    }
    if (sub.includes('service delivery')) {
      defaults.product = 'Service Delivery';
    } else if (sub.includes('operations') && !sub.includes('service')) {
      defaults.product = 'Product & Operations';
    }
    if (sub.includes('referral') && sub.includes('sales')) {
      defaults.sales = 'Sales & Referral Pipeline';
    } else if (sub.includes('referral')) {
      defaults.sales = 'Referral Pipeline';
    } else if (sub.includes('fundraising') || sub.includes('revenue')) {
      if (sub.includes('fundraising')) defaults.sales = 'Fundraising & Revenue';
      else defaults.sales = 'Revenue & Sales';
    }
    if (sub.includes('family')) {
      defaults.cx = 'Family Experience';
    } else if (sub.includes('customer') || sub.includes('client')) {
      defaults.cx = 'Customer Experience';
    }
    if (sub.includes('awareness') && sub.includes('outreach')) {
      defaults.marketing = 'Awareness & Outreach';
    } else if (sub.includes('awareness') && sub.includes('marketing')) {
      defaults.marketing = 'Marketing & Awareness';
    }
    if (sub.includes('program') || sub.includes('clinical')) {
      defaults.strategy = 'Program Strategy';
    }
  }

  return defaults;
}

function buildStatusNotes(labels: Record<string, string>): Record<string, (score: number, ceiling: number | null) => string> {
  return {
    positioning: (s) => s >= 60 ? 'Foundation — strong positioning drives downstream scores' : 'Foundation — sets ceiling for downstream areas',
    strategy: (s) => s >= 60 ? 'Strong strategic planning and direction' : 'Strategic planning has gaps to address',
    product: (s, c) => c ? `${labels.product} capped at ${c.toFixed(0)} by foundation scores` : `${labels.product} performing well`,
    marketing: (s, c) => c ? `Capped at ${c.toFixed(0)} by Positioning` : 'Awareness channels reaching target audiences',
    sales: (s, c) => c ? 'Limited by upstream visibility' : `${labels.sales} performing well`,
    cx: (s) => s >= 50 ? 'Strong experience, some gaps remain' : 'Experience needs systematic tracking',
  };
}

function generateInsights(mojoScore: number, areas: ScoreArea[], inputs: InputItem[]): ClientSummary['key_insights'] {
  const insights: ClientSummary['key_insights'] = [];
  const gaps = inputs.filter(i => i.status === 'gap' || i.status === 'not_started');
  const partial = inputs.filter(i => i.status === 'partial');
  const complete = inputs.filter(i => i.status === 'complete');

  // Find highest and lowest areas
  const sorted = [...areas].sort((a, b) => b.score - a.score);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];

  if (strongest && weakest && strongest.score - weakest.score > 20) {
    insights.push({
      headline: `Your *${strongest.area_label}* outpaces *${weakest.area_label}* by ${Math.round(strongest.score - weakest.score)} points.`,
      detail: `${strongest.area_label} scores ${strongest.score.toFixed(0)} while ${weakest.area_label} sits at ${weakest.score.toFixed(0)}. Closing this gap is the fastest path to a higher overall score.`,
    });
  }

  if (gaps.length > 0) {
    const highImpactGaps = gaps.filter(g => g.impact_tier === 'high');
    if (highImpactGaps.length > 0) {
      insights.push({
        headline: `*${highImpactGaps.length} high-impact inputs* still need attention.`,
        detail: `${highImpactGaps.map(g => g.input_label).join(', ')} — completing these would significantly raise your score.`,
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      headline: complete.length > 0
        ? `*${complete.length} of ${inputs.length}* inputs complete — keep building.`
        : 'Your strategic evaluation is *just getting started*.',
      detail: partial.length > 0
        ? `${partial.length} inputs are in progress. Focus on completing them to unlock score improvements.`
        : 'Begin by completing the highest-impact inputs to establish your baseline score.',
    });
  }

  return insights;
}

function generateNextMove(inputs: InputItem[]): { next_move: string; next_move_deadline: string; next_move_effort: string } {
  // Find highest impact incomplete input
  const incomplete = inputs
    .filter(i => i.status !== 'complete')
    .sort((a, b) => b.score_impact - a.score_impact);

  if (incomplete.length === 0) {
    return {
      next_move: 'All inputs complete! Review your scores and plan your next strategic phase.',
      next_move_deadline: '—',
      next_move_effort: '—',
    };
  }

  const top = incomplete[0];
  return {
    next_move: `Complete "${top.input_label}" — it has the highest score impact (+${top.score_impact.toFixed(1)} pts). Work with your strategist to fill the remaining gaps.`,
    next_move_deadline: 'Next 2 weeks',
    next_move_effort: 'varies',
  };
}

export function useDynamicScoring(inputs: InputItem[] | undefined, isAuthenticated: boolean) {
  return useMemo(() => {
    // If no real data, return blank/zero state
    if (!isAuthenticated || !inputs || inputs.length === 0) {
      const emptyAreas: ScoreArea[] = [
        { area_key: 'positioning', area_label: 'Positioning & Story', layer: 1, score: 0, trend: 'flat', status_note: 'No data yet', ceiling: null },
        { area_key: 'strategy', area_label: 'Strategy', layer: 1, score: 0, trend: 'flat', status_note: 'No data yet', ceiling: null },
        { area_key: 'product', area_label: 'Product & Operations', layer: 2, score: 0, trend: 'flat', status_note: 'No data yet', ceiling: null },
        { area_key: 'marketing', area_label: 'Marketing & Awareness', layer: 2, score: 0, trend: 'flat', status_note: 'No data yet', ceiling: null },
        { area_key: 'sales', area_label: 'Sales & Revenue', layer: 3, score: 0, trend: 'flat', status_note: 'No data yet', ceiling: null },
        { area_key: 'cx', area_label: 'Customer Experience', layer: 3, score: 0, trend: 'flat', status_note: 'No data yet', ceiling: null },
      ];
      const emptySummary: ClientSummary = {
        mojo_score: 0,
        score_delta: 0,
        potential_score: 0,
        key_insights: [{ headline: 'No strategic data yet.', detail: 'Run AI Research from the admin panel or add inputs manually to begin scoring.' }],
        next_move: 'Run AI Research to populate this company\'s strategic profile.',
        next_move_deadline: '—',
        next_move_effort: '—',
        constraint_area: 'positioning',
        constraint_explanation: 'No inputs have been added yet.',
      };
      return { summary: emptySummary, areas: emptyAreas, projectedScore: 0 };
    }

    // Build adaptive labels from actual input data
    const areaLabels = buildAreaLabels(inputs);
    const statusNotes = buildStatusNotes(areaLabels);

    // Compute area scores from inputs
    const rawScores = inputsToAreaRaw(inputs);
    const { scores: cappedScores, ceilings } = applyCeilings(rawScores);
    const mojoScore = computeMojoScore(cappedScores);

    // Build ScoreArea array
    const areaOrder = ['positioning', 'strategy', 'product', 'marketing', 'sales', 'cx'];
    const layers: Record<string, number> = { positioning: 1, strategy: 1, product: 2, marketing: 2, sales: 3, cx: 3 };

    const areas: ScoreArea[] = areaOrder.map(key => ({
      area_key: key,
      area_label: areaLabels[key],
      layer: layers[key],
      score: Math.round(cappedScores[key] * 10) / 10,
      trend: trendFromScore(cappedScores[key]),
      status_note: statusNotes[key](cappedScores[key], ceilings[key]),
      ceiling: ceilings[key],
    }));

    // Projected score if all inputs were complete
    const projectedScore = computeProjectedScore(
      mojoScore,
      inputs.map(i => ({ score_impact: i.score_impact, status: i.status }))
    );

    // Find constraint area (lowest foundation score)
    const constraintArea = cappedScores.positioning <= cappedScores.strategy ? 'positioning' : 'strategy';
    const constraintScore = Math.round(Math.min(cappedScores.positioning, cappedScores.strategy));

    const nextMove = generateNextMove(inputs);

    const summary: ClientSummary = {
      mojo_score: mojoScore,
      score_delta: 0,
      potential_score: projectedScore,
      key_insights: generateInsights(mojoScore, areas, inputs),
      next_move: nextMove.next_move,
      next_move_deadline: nextMove.next_move_deadline,
      next_move_effort: nextMove.next_move_effort,
      constraint_area: constraintArea,
      constraint_explanation: `${areaLabels[constraintArea]} (${constraintScore}) sets a ceiling on downstream areas. Strengthening the foundation unlocks improvement across the board.`,
    };

    return { summary, areas, projectedScore };
  }, [inputs, isAuthenticated]);
}
