import type { StrategicChangeSummary } from "@/hooks/useStrategicChangeSummary";
import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { RouteRationale } from "@/lib/routeRationale";
import { inferStrategicCenterOfGravity, resolveSignalConflict, hypothesisAuthorityScore } from "@/lib/signalAuthority";

export type RefinePreviewMovementTone = "default" | "review" | "tension" | "strengthening";

export type RefinePreviewMovementItem = {
  id: string;
  when: string;
  headline: string;
  whyItMatters: string;
  confidenceImplication: string;
  evidenceLines: string[];
  tone: RefinePreviewMovementTone;
  priority: number;
};

type PhaseLabel = "Pre-Diagnosis" | "Diagnose" | "Focus" | "Flow";

type SourceMix = {
  outside: number;
  organization: number;
  customer: number;
};

function aggregateSourceMix(rows: HypothesisProvenanceCard["supportingClaims"]): SourceMix {
  return rows.reduce(
    (acc, row) => {
      acc.outside += row.supportShape.outside;
      acc.organization += row.supportShape.organization;
      acc.customer += row.supportShape.customer;
      return acc;
    },
    { outside: 0, organization: 0, customer: 0 },
  );
}

function hypothesisSourceMix(row: HypothesisProvenanceCard): SourceMix {
  return aggregateSourceMix(row.supportingClaims);
}

function sortActiveRows(rows: HypothesisProvenanceCard[], phaseLabel: PhaseLabel) {
  return [...rows].sort((a, b) => {
    const score = (row: HypothesisProvenanceCard) => {
      const mix = hypothesisSourceMix(row);
      const confidence = row.hypothesis.confidence === "high" ? 3 : row.hypothesis.confidence === "medium" ? 2 : 1;
      const kind =
        row.hypothesis.hypothesis_kind === "inferred_tension"
          ? 3
          : row.hypothesis.hypothesis_kind === "candidate_assumption"
            ? 2
            : 1;
      const support = (mix.customer > 0 ? 12 : 0) + (mix.organization > 0 ? 4 : 0) + (mix.outside > 0 ? 2 : 0);
      return confidence * 100 + kind * 10 + support + hypothesisAuthorityScore(row, phaseLabel) * 20;
    };

    return score(b) - score(a);
  });
}

function isRecent(value: string | null | undefined, days = 30) {
  if (!value) return false;
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at <= days * 24 * 60 * 60 * 1000;
}

function hasCustomerBackedSupport(row: HypothesisProvenanceCard) {
  const mix = hypothesisSourceMix(row);
  return mix.customer > 0;
}

function hasMixedSupport(row: HypothesisProvenanceCard) {
  const mix = hypothesisSourceMix(row);
  const activeBands = [mix.outside, mix.organization, mix.customer].filter((value) => value > 0).length;
  return activeBands >= 2;
}

function sentence(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueLines(values: string[], maxItems = 3) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const raw of values) {
    const item = sentence(raw);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= maxItems) break;
  }

  return output;
}

function activeEvidenceLines(rows: HypothesisProvenanceCard[], maxItems = 3) {
  return uniqueLines(rows.map((row) => row.hypothesis.statement), maxItems);
}

function themeSummary(rows: HypothesisProvenanceCard[]) {
  const text = rows.map((row) => sentence(row.hypothesis.statement).toLowerCase()).join(" ");
  const themes = [
    { label: "proof", terms: ["proof", "credible", "credibility"] },
    { label: "trust", terms: ["trust", "confidence"] },
    { label: "switching risk", terms: ["switching", "switch"] },
    { label: "reliability", terms: ["reliability", "consistent", "consistency", "predictable"] },
    { label: "support capacity", terms: ["support", "hands-on", "documentation", "training"] },
    { label: "operational burden", terms: ["operational", "burden", "dial-in", "batch variability", "recipe-adjustment"] },
    { label: "governance", terms: ["governance", "participation", "leadership involvement"] },
    { label: "donor confidence", terms: ["donor", "endowment", "funding"] },
  ].filter((theme) => theme.terms.some((term) => text.includes(term)));

  const labels = themes.map((theme) => theme.label).slice(0, 3);
  if (labels.length === 0) return "a smaller set of decision-shaping patterns";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels[0]}, ${labels[1]}, and ${labels[2]}`;
}

function reviewMovementItem(changeSummary: StrategicChangeSummary): RefinePreviewMovementItem | null {
  if (changeSummary.affectedCounts.odi_needs <= 0) return null;

  const needLines = uniqueLines(
    changeSummary.affectedArtifacts
      .filter((artifact) => artifact.object_type === "odi_need")
      .map((artifact) => artifact.label),
    3,
  );

  return {
    id: "needs-review",
    when: "After the latest update",
    headline: "Some needs now require review.",
    whyItMatters:
      "The job map shifted, so some downstream needs may no longer reflect the current view of the customer's job.",
    confidenceImplication:
      "Customer insight confidence should be treated as unsettled until those needs are reviewed.",
    evidenceLines: needLines.length > 0 ? needLines : ["A downstream need now needs a fresh review against the updated job view."],
    tone: "review",
    priority: 2,
  };
}

function confidenceMovementItem(activeRows: HypothesisProvenanceCard[]): RefinePreviewMovementItem | null {
  if (activeRows.length === 0) return null;

  const customerBacked = activeRows.filter(hasCustomerBackedSupport);
  const mixedSupport = activeRows.filter(hasMixedSupport);

  if (customerBacked.length > 0) {
    return {
      id: "customer-support-emerging",
      when: "Based on new evidence",
      headline: "Customer evidence is starting to reinforce part of the read.",
      whyItMatters:
        "At least one of the strongest hypotheses is starting to hold up in customer reality, not just in outside or internal interpretation.",
      confidenceImplication:
        "Confidence is improving, but it is still too early to treat the pattern as settled.",
      evidenceLines: activeEvidenceLines(customerBacked, 3),
      tone: "strengthening",
      priority: 4,
    };
  }

  if (mixedSupport.length > 0) {
    return {
      id: "evidence-converging",
      when: "Recently",
      headline: "Different evidence sources are starting to line up.",
      whyItMatters:
        "Public and internal evidence are beginning to point toward the same strategic read, which makes the current picture less fragmentary.",
      confidenceImplication:
        "Confidence is moving beyond a single-source read, but it still needs customer proof before it can be treated as reliable.",
      evidenceLines: activeEvidenceLines(mixedSupport, 3),
      tone: "strengthening",
      priority: 4,
    };
  }

  return {
    id: "customer-proof-gap",
    when: "Based on new evidence",
    headline: "Customer proof is still the main gap.",
    whyItMatters:
      "The current read is still coming mostly from public and internal evidence, so it is not safe to treat the top hypotheses as validated yet.",
    confidenceImplication:
      "Confidence stays directional until customer evidence confirms or challenges the pattern.",
    evidenceLines: activeEvidenceLines(activeRows, 3),
    tone: "default",
    priority: 1,
  };
}

function authorityConflictMovementItem(activeRows: HypothesisProvenanceCard[], phaseLabel: PhaseLabel): RefinePreviewMovementItem | null {
  if (phaseLabel === "Pre-Diagnosis") return null;
  const conflict = resolveSignalConflict(activeRows, phaseLabel);
  if (!conflict.hasConflict || !conflict.summary) return null;

  return {
    id: "signal-authority-conflict",
    when: "Based on new evidence",
    headline: "The public story and strategic direction are not fully aligned.",
    whyItMatters: conflict.summary,
    confidenceImplication:
      "Treat the current read cautiously until customer or stakeholder validation shows which story actually shapes decisions.",
    evidenceLines: conflict.evidenceLines,
    tone: "tension",
    priority: 2,
  };
}

function tensionMovementItem(activeRows: HypothesisProvenanceCard[]): RefinePreviewMovementItem | null {
  const tensions = activeRows.filter((row) => row.hypothesis.hypothesis_kind === "inferred_tension");
  if (tensions.length === 0) return null;

  return {
    id: "open-tension",
    when: "Recently",
    headline: "A strategic tension is still open.",
    whyItMatters:
      "The evidence is surfacing a tradeoff that is not yet resolved cleanly, so committing too early would flatten a live strategic question.",
    confidenceImplication:
      "Treat the current read as provisional until this tension is resolved or customer evidence breaks it.",
    evidenceLines: activeEvidenceLines(tensions, 2),
    tone: "tension",
    priority: 3,
  };
}

function focusMovementItem(activeRows: HypothesisProvenanceCard[], allRows: HypothesisProvenanceCard[], phaseLabel: PhaseLabel): RefinePreviewMovementItem | null {
  if (activeRows.length === 0) return null;

  const narrowedRows = allRows.filter(
    (row) =>
      !row.hypothesis.is_active &&
      (row.hypothesis.hypothesis_state === "retired" || row.hypothesis.hypothesis_state === "reframed") &&
      isRecent(row.latestEventAt),
  );

  if (narrowedRows.length === 0) return null;

  const center = inferStrategicCenterOfGravity(activeRows, phaseLabel);
  const themeText = center.label || themeSummary(activeRows);
  return {
    id: "read-focusing",
    when: "Since the last read",
    headline:
      phaseLabel === "Pre-Diagnosis"
        ? "The outside read is becoming more focused."
        : phaseLabel === "Diagnose"
          ? "The diagnosis is becoming more focused."
          : "The read is narrowing around fewer live directions.",
    whyItMatters:
      `Some earlier directions have fallen away, leaving ${themeText} as the patterns that seem to matter most right now.`,
    confidenceImplication:
      "The next validation should test whether these patterns actually affect customer or stakeholder decisions.",
    evidenceLines: activeEvidenceLines(activeRows, 3),
    tone: "default",
    priority: 5,
  };
}

function routeScore(rationale: RouteRationale) {
  const readiness =
    rationale.readiness === "Commit"
      ? 40
      : rationale.readiness === "Validate"
        ? 28
        : rationale.readiness === "Investigate"
          ? 18
          : 6;
  const confidence =
    rationale.confidenceLabel === "Supported by multiple validated signals"
      ? 18
      : rationale.confidenceLabel === "Evidence is starting to converge"
        ? 14
        : rationale.confidenceLabel === "Customer validation missing"
          ? 10
          : rationale.confidenceLabel === "Early directional read"
            ? 8
            : rationale.confidenceLabel === "Still highly uncertain"
              ? 5
              : 0;
  const movement =
    rationale.movement === "strengthen"
      ? 8
      : rationale.movement === "narrow"
        ? 6
        : rationale.movement === "remain_unresolved"
          ? 3
          : rationale.movement === "split"
            ? 2
            : 0;
  return readiness + confidence + movement + rationale.relevanceScore;
}

function routeMovementItem(routeRationales: RouteRationale[], phaseLabel: PhaseLabel): RefinePreviewMovementItem | null {
  if (phaseLabel !== "Focus" && phaseLabel !== "Flow") return null;
  if (routeRationales.length === 0) return null;

  const ordered = [...routeRationales].sort((a, b) => routeScore(b) - routeScore(a));
  const lead = ordered[0];
  if (!lead) return null;

  const weakenedCount = routeRationales.filter((item) => item.movement === "weaken" || item.readiness === "Hold").length;
  const commitLikeCount = routeRationales.filter((item) => item.readiness === "Commit" || item.readiness === "Validate").length;

  if (phaseLabel === "Focus") {
    if (lead.readiness === "Hold" || lead.movement === "weaken") {
      return {
        id: "focus-not-ready",
        when: "Recently",
        headline: "The lead route is still not safe to lock in.",
        whyItMatters:
          `${lead.routeTitle} is carrying unresolved proof gaps or weakening signals, so the team should not treat it as a commitment yet.`,
        confidenceImplication:
          "Keep this route in validation until the missing proof clears or the weakening evidence resolves.",
        evidenceLines: [lead.whatSupportsIt, lead.couldWeaken].filter(Boolean),
        tone: "default",
        priority: 2,
      };
    }

    return {
      id: "focus-route-narrowing",
      when: "Since the last read",
      headline: "A lead route is becoming safer to focus around.",
      whyItMatters:
        `${lead.routeTitle} is carrying the clearest support right now, while weaker alternatives are still waiting on more proof.`,
      confidenceImplication:
        lead.readiness === "Commit"
          ? "This route is strong enough to focus around, but it still deserves monitoring as new evidence comes in."
          : "Treat this as the lead path to validate, not a locked commitment.",
      evidenceLines: [lead.whatSupportsIt, lead.mustBecomeTrue].filter(Boolean),
      tone: "strengthening",
      priority: commitLikeCount > 0 ? 2 : 4,
    };
  }

  if (lead.movement === "weaken" || lead.readiness === "Hold" || weakenedCount > 0) {
    return {
      id: "flow-route-drift",
      when: "Recently",
      headline: "Confidence around the current route is softening.",
      whyItMatters:
        `${lead.routeTitle} is showing signs of drift or contradiction, which means execution may be teaching something different from the earlier read.`,
      confidenceImplication:
        "The route should stay live, but it needs closer learning and adjustment before confidence can stabilize again.",
      evidenceLines: [lead.couldWeaken, lead.uncertainty].filter(Boolean),
      tone: "tension",
      priority: 2,
    };
  }

  return {
    id: "flow-route-learning",
    when: "Based on new evidence",
    headline: "Execution is starting to reinforce the current route.",
    whyItMatters:
      `${lead.routeTitle} is still holding up as signals come in, which suggests the route is learning in the right direction rather than drifting.`,
    confidenceImplication:
      "Confidence is improving, but it should still be maintained through ongoing evidence rather than assumed to be settled.",
    evidenceLines: [lead.whatSupportsIt, lead.mustBecomeTrue].filter(Boolean),
    tone: "strengthening",
    priority: 3,
  };
}

export function buildRefinePreviewMovementItems(args: {
  activeRows: HypothesisProvenanceCard[];
  allRows: HypothesisProvenanceCard[];
  phaseLabel: PhaseLabel;
  changeSummary: StrategicChangeSummary | null;
  routeRationales?: RouteRationale[];
}) {
  const activeRows = sortActiveRows(args.activeRows.filter((row) => row.hypothesis.is_active), args.phaseLabel);
  const allRows = args.allRows;
  const items: RefinePreviewMovementItem[] = [];

  if (args.changeSummary) {
    const reviewItem = reviewMovementItem(args.changeSummary);
    if (reviewItem) items.push(reviewItem);
  }

  const confidenceItem = confidenceMovementItem(activeRows);
  if (confidenceItem) items.push(confidenceItem);

  const authorityConflictItem = authorityConflictMovementItem(activeRows, args.phaseLabel);
  if (authorityConflictItem) items.push(authorityConflictItem);

  const tensionItem = tensionMovementItem(activeRows);
  if (tensionItem) items.push(tensionItem);

  const focusItem = focusMovementItem(activeRows, allRows, args.phaseLabel);
  if (focusItem) items.push(focusItem);

  const routeItem = routeMovementItem(args.routeRationales ?? [], args.phaseLabel);
  if (routeItem) items.push(routeItem);

  const deduped: RefinePreviewMovementItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }

  if (deduped.length > 0) {
    return deduped.sort((a, b) => a.priority - b.priority).slice(0, 4);
  }

  if (activeRows.length > 0) {
    return [
      {
        id: "read-forming",
        when: "Recently",
        headline: "The strategic read is still forming.",
        whyItMatters:
          "There is enough evidence to surface directional hypotheses, but not enough movement yet to say confidence is changing in a durable way.",
        confidenceImplication:
          "Treat the current read as provisional until stronger evidence shifts it one way or the other.",
        evidenceLines: activeEvidenceLines(activeRows, 3),
        tone: "default",
        priority: 6,
      },
    ];
  }

  return [];
}
