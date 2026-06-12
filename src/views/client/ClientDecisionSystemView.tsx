import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import ClientOwnerAssignDialog from "@/components/client-view/ClientOwnerAssignDialog";
import TeamAgreementControl from "@/components/client-view/decision-path/TeamAgreementControl";
import type { PrioritySignal } from "@/components/client-view/decision-path/types";
import DecisionPhaseNav from "@/components/client-view/decision-path/DecisionPhaseNav";
import PageShell from "@/components/layout/PageShell";
import { useCompany } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import type {
  ClientActionStatus,
  ClientActionSummary,
  ClientConfidenceLevel,
} from "@/lib/clientViewModel";
import {
  getScoreToneClassFromScore,
  getStatusLabelFromScore,
  toDecisionPathViewModel,
  type DecisionPathViewModel,
} from "@/lib/decisionPathAdapter";

type EvidenceRow = NonNullable<
  DecisionPathViewModel["phaseNarrative"]["diagnose"]
>["rows"][number];
type OutsideRoute = DecisionPathViewModel["outsideView"]["rankedRoutes"][number];

const STAGE_COPY = {
  outside: {
    eyebrow: "Outside View",
    headline: "What can we learn before we ask a single question?",
    support:
      "This is an early outside read of where momentum may be getting lost and what feels most worth testing first.",
  },
  diagnosis: {
    eyebrow: "Diagnose",
    headline: "What does the evidence say?",
    support:
      "This is where we separate what holds up, what weakens, and what still needs proof.",
  },
  focus: {
    eyebrow: "Focus",
    headline: "What matters most now?",
    support:
      "This is where we choose the move most likely to change the picture without losing sight of the alternatives.",
  },
  execution: {
    eyebrow: "Flow",
    headline: "What is shifting and what should we watch?",
    support:
      "This is how we watch whether the picture is actually changing as the work moves.",
  },
} as const;

const CONFIDENCE_OPTIONS: ClientConfidenceLevel[] = ["Low", "Medium", "High"];
const CLIENT_VIEW_THEME_STORAGE_KEY = "mojomap-client-view-theme";

function revealProps(index: number) {
  return {
    initial: { opacity: 0, y: 42 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-15% 0px" },
    transition: {
      duration: 0.9,
      ease: "easeOut" as const,
      delay: index * 0.14,
    },
  };
}

function useAnimatedNumber(targetValue: number, duration = 600) {
  const [value, setValue] = useState(targetValue);

  useEffect(() => {
    const from = value;
    const to = targetValue;
    if (from === to) return;

    let frame = 0;
    let start = 0;
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(1, elapsed / duration);
      const eased = easeOut(progress);
      setValue(Math.round(from + (to - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, targetValue, value]);

  return value;
}

function actionStatusLabel(status: ClientActionStatus) {
  if (status === "in_progress") return "Active";
  if (status === "done") return "Complete";
  if (status === "parked") return "Parked";
  return "Not started";
}

function diagnosisTone(status: EvidenceRow["status"]) {
  if (status === "Confirmed") return "is-confirmed";
  if (status === "Disproven") return "is-disproven";
  return "is-unresolved";
}

function flowActionLabel(action: ClientActionSummary | null) {
  if (!action) return "Choose what to watch";
  if (action.status === "done") return "Mark this as holding up";
  if (action.status === "in_progress") return "Update what changed";
  return "Start tracking this";
}

function splitEvidenceRows(rows: EvidenceRow[]) {
  return {
    Confirmed: rows.filter((row) => row.status === "Confirmed"),
    Disproven: rows.filter((row) => row.status === "Disproven"),
    Unresolved: rows.filter((row) => row.status === "Unresolved"),
  };
}

function scoreCaption(phase: DecisionPathViewModel["phase"]["id"]) {
  return phase === "outside"
    ? "This is an early likelihood read, not a settled answer."
    : "This reflects what the picture looks like right now, based on what the evidence is showing.";
}

function shortText(value: string | null | undefined, max = 88) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text;
}

function routeSignalChip(route: OutsideRoute) {
  const source = [route.title, route.evidenceLevel, ...route.outcomes].join(" ").toLowerCase();
  if (source.includes("eligibility")) return "Eligibility clarity";
  if (/(track|assess|measure|impact)/.test(source)) return "Impact visibility";
  if (/(find|access|support|resource|equipment)/.test(source)) return "Access friction";
  if (/(positioning|message|messaging|story)/.test(source)) return "Story clarity";
  if (/(delivery|consistency|repeatable|partner confidence)/.test(source)) return "Delivery trust";
  if (/(proof|evidence|outcome)/.test(source)) return "Proof strength";
  if (/(priority|focus|tradeoff)/.test(source)) return "Focus";
  if (/(ownership|owner|accountability)/.test(source)) return "Ownership";
  return route.confidenceLevel;
}

function readableOutcome(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function testSummaryTitle(value: string) {
  const lower = value.toLowerCase();

  if (/(track|assess|measure|impact)/.test(lower)) return "Test impact visibility";
  if (/(eligibility|requirements)/.test(lower)) return "Test eligibility clarity";
  if (/(find|access).*(support|resource|equipment)/.test(lower)) return "Test access to support";
  if (/(positioning|message|messaging|story)/.test(lower)) return "Test story clarity";
  if (/(delivery|consistency|repeatable|handoff)/.test(lower)) return "Test delivery consistency";
  if (/(proof|evidence|outcome)/.test(lower)) return "Test visible proof";
  if (/(ownership|owner|accountability)/.test(lower)) return "Test ownership clarity";
  if (/(priority|priorities|focus|tradeoff)/.test(lower)) return "Test priority focus";

  if (lower.startsWith("start by checking whether")) return "Start with the core question";
  if (lower.startsWith("then test whether")) return "Then test the next likely friction";
  if (lower.startsWith("also test whether")) return "Also test the supporting friction";
  return "What we’d test";
}

function toSentenceCase(value: string) {
  const text = value.trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function compactRouteFocus(value: string) {
  const lower = value.replace(/\s+/g, " ").trim().toLowerCase();
  if (!lower) return "strongest route";
  if (lower.includes("onboarding")) return "onboarding";
  if (lower.includes("quality") || lower.includes("standard")) return "quality bar";
  if ((lower.includes("confidence") || lower.includes("trust")) && lower.includes("delivery")) {
    return "delivery trust";
  }
  if (lower.includes("confidence") || lower.includes("trust")) return "trust";
  if (lower.includes("delivery") && lower.includes("consistency")) return "delivery consistency";
  if (lower.includes("handoff")) return "handoff";
  if (lower.includes("activation")) return "activation";
  if (lower.includes("conversion")) return "conversion";
  if (lower.includes("retention")) return "retention";
  if (lower.includes("positioning") || lower.includes("message")) return "positioning clarity";
  if (lower.includes("pricing")) return "pricing clarity";

  return lower
    .replace(/\b(the|a|an|of|for|with|in|to)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");
}

function actionRouteTitle(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "Explore the strongest route";

  const lower = text.toLowerCase();
  const communicationMatch = text.match(
    /^increase the clarity of communication channels for (.+) to find (.+?) quickly$/i,
  );
  if (communicationMatch) {
    return `Make ${communicationMatch[2]} easier to find`;
  }

  const accessMatch = text.match(
    /^improve how clearly and accessibly (.+?) understand (.+)$/i,
  );
  if (accessMatch) {
    if (/eligibility/i.test(accessMatch[2])) return "Make eligibility clearer";
    return `Make ${accessMatch[2]} easier to understand`;
  }

  const impactMatch = text.match(
    /^(enhance|improve)\s+how\s+(.+?)\s+track and assess the impact of\s+(.+)$/i,
  );
  if (impactMatch) {
    return "Make impact easier to track";
  }

  if (/(eligibility|requirements)/.test(lower)) return "Clarify eligibility";
  if (/(track|assess|measure|impact)/.test(lower)) return "Make impact easier to track";
  if (/(find|access).*(support|resource|equipment)/.test(lower)) return "Make support easier to find";
  if (/(positioning|message|messaging|story|category)/.test(lower)) return "Clarify the public story";
  if (/(proof|evidence|outcome|outcomes|credibility)/.test(lower)) return "Strengthen visible proof";
  if (/(delivery|consistency|repeatable|handoff)/.test(lower)) return "Make delivery more consistent";
  if (/(priority|priorities|focus|tradeoff)/.test(lower)) return "Sharpen priority focus";
  if (/(ownership|owner|accountability)/.test(lower)) return "Clarify who owns what";

  const verbStarts = [
    "improve ",
    "clarify ",
    "strengthen ",
    "reduce ",
    "increase ",
    "build ",
    "raise ",
    "restore ",
    "simplify ",
    "tighten ",
    "create ",
    "expand ",
    "prove ",
  ];

  const matchedVerb = verbStarts.find((verb) => lower.startsWith(verb));
  if (matchedVerb) {
    return toSentenceCase(
      `${matchedVerb.trim()} ${compactRouteFocus(text.slice(matchedVerb.length))}`,
    );
  }
  if (lower.includes("onboarding")) return "Improve onboarding";
  if (lower.includes("quality") || lower.includes("standard")) return "Clarify quality bar";
  if (lower.includes("confidence") || lower.includes("trust")) return "Strengthen delivery trust";
  if (lower.includes("retention") || lower.includes("conversion") || lower.includes("activation")) {
    return `Improve ${compactRouteFocus(lower)}`;
  }
  if (lower.includes("delivery") || lower.includes("consistency") || lower.includes("hand")) {
    return `Tighten ${compactRouteFocus(lower)}`;
  }

  return `Strengthen ${compactRouteFocus(lower)}`;
}

function outsideScoreExplanation(score: number) {
  if (score < 40) {
    return {
      lead: "This is an early warning sign, not a settled answer.",
      detail:
        "Right now too much still needs to be proven. A closer look may improve the picture, or it may show that the real issue is somewhere else.",
    };
  }
  if (score < 70) {
    return {
      lead: "This is a promising starting score, but it is still only a starting score.",
      detail:
        "There is enough here to take seriously, but not enough proof yet to trust without pressure-testing what is really driving it.",
    };
  }
  return {
    lead: "This is a strong early score, but it still needs to hold up under pressure.",
    detail:
      "If the supporting evidence is thinner than it appears, the picture could still change once we test what is actually true.",
  };
}

export default function ClientDecisionSystemView() {
  const [ownerDialogActionId, setOwnerDialogActionId] = useState<string | null>(null);
  const [selectedPriorityId, setSelectedPriorityId] = useState<string | null>(null);
  const [selectedFlowDriverId, setSelectedFlowDriverId] = useState<string | null>(null);
  const [clientViewTheme, setClientViewTheme] = useState<"dark" | "light">("dark");
  const [hasMounted, setHasMounted] = useState(false);
  const { companies, setActiveCompanyId, loading: companiesLoading , fetchError: companiesFetchError } = useCompany();

  const {
    activeCompany,
    hasCompany,
    topActions,
    allActions,
    ownership,
    primaryConstraint,
    evidence,
    inputCoverage,
    confidence,
    phase,
    mapStatus,
    primaryDesiredOutcome,
    strategicProblems,
    currentUserBelief,
    currentUserId,
    currentUserLabel,
    teamBeliefs,
    ownerOptions,
    assignActionOwner,
    setActionStatus,
    setPhase,
    setConstraintBelief,
    getActionConfidenceLevel,
    setActionConfidence,
    actionConfidenceById,
    addOwnerOption,
    commitMap,
    opportunitiesLoading,
    opportunitiesError,
    rerunAnalysis,
    rerunningAnalysis,
    publicBaselineRun,
  } = useClientViewData({ actionLimit: 5 });

  const viewModel = useMemo(
    () =>
      toDecisionPathViewModel({
        activeCompany,
        topActions,
        allActions,
        ownership,
        primaryConstraint,
        evidence,
        inputCoverage,
        strategicProblems,
        publicBaselineRun,
        teamBeliefs,
        currentUserBelief,
        selectedPriorityId,
        recentlyCommittedActionId: null,
        actionConfidenceById,
        defaultActionConfidenceLevel: confidence.level,
        phase,
      }),
    [
      activeCompany,
      topActions,
      allActions,
      ownership,
      primaryConstraint,
      evidence,
      inputCoverage,
      strategicProblems,
      publicBaselineRun,
      teamBeliefs,
      currentUserBelief,
      selectedPriorityId,
      actionConfidenceById,
      confidence.level,
      phase,
    ],
  );

  const score = useAnimatedNumber(viewModel.hero.trajectory.currentScore, 700);
  const diagnosisRows = useMemo(
    () => viewModel.phaseNarrative.diagnose?.rows ?? [],
    [viewModel.phaseNarrative.diagnose],
  );
  const diagnosisBuckets = useMemo(() => splitEvidenceRows(diagnosisRows), [diagnosisRows]);
  const leadRoute = viewModel.outsideView.rankedRoutes[0] ?? null;
  const secondaryRoutes = viewModel.outsideView.rankedRoutes.slice(1, 4);
  const strongestSupportSignals = useMemo(
    () => viewModel.outsideView.supportSignals.slice(0, 3),
    [viewModel.outsideView.supportSignals],
  );
  const selectedPriority: PrioritySignal | null =
    viewModel.priorities.items.find((item) => item.action.id === selectedPriorityId) ??
    viewModel.priorities.items[0] ??
    null;
  const selectedFlowDriver =
    viewModel.drivers.list.find((driver) => driver.id === selectedFlowDriverId) ??
    viewModel.drivers.list[0] ??
    null;
  const ownerDialogAction =
    allActions.find((action) => action.id === ownerDialogActionId) ?? null;
  const stageCopy = STAGE_COPY[phase];
  const currentBelief =
    currentUserBelief === "yes" ||
    currentUserBelief === "no" ||
    currentUserBelief === "not_quite"
      ? currentUserBelief
      : "not_quite";
  const outsideScoreCopy = outsideScoreExplanation(score);

  useEffect(() => {
    const timer = window.setTimeout(() => setHasMounted(true), 18);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(CLIENT_VIEW_THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") {
      setClientViewTheme(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CLIENT_VIEW_THEME_STORAGE_KEY, clientViewTheme);
  }, [clientViewTheme]);

  useEffect(() => {
    if (viewModel.priorities.items.length === 0) {
      setSelectedPriorityId(null);
      return;
    }
    const exists = viewModel.priorities.items.some(
      (item) => item.action.id === selectedPriorityId,
    );
    if (!exists) setSelectedPriorityId(viewModel.priorities.items[0].action.id);
  }, [selectedPriorityId, viewModel.priorities.items]);

  useEffect(() => {
    if (viewModel.drivers.list.length === 0) {
      setSelectedFlowDriverId(null);
      return;
    }
    const exists = viewModel.drivers.list.some(
      (driver) => driver.id === selectedFlowDriverId,
    );
    if (!exists) setSelectedFlowDriverId(viewModel.drivers.list[0].id);
  }, [selectedFlowDriverId, viewModel.drivers.list]);

  const handleAssignOwner = (actionId: string, owner: string | null) => {
    assignActionOwner(actionId, owner);
    if (owner && getActionConfidenceLevel(actionId) === "Low") {
      setActionConfidence(actionId, "Medium");
    }
  };

  const handleFlowAction = () => {
    if (!selectedPriority) return;
    if (!selectedPriority.action.primaryOwner) {
      setOwnerDialogActionId(selectedPriority.action.id);
      return;
    }

    if (
      selectedPriority.action.status === "planned" ||
      selectedPriority.action.status === "parked"
    ) {
      setActionStatus(selectedPriority.action.id, "in_progress");
      return;
    }

    if (selectedPriority.action.status === "in_progress") {
      setActionStatus(selectedPriority.action.id, "done");
    }
  };

  const handleFocusAction = () => {
    if (!selectedPriority) return;
    if (!selectedPriority.action.primaryOwner) {
      setOwnerDialogActionId(selectedPriority.action.id);
      return;
    }
    if (getActionConfidenceLevel(selectedPriority.action.id) === "Low") {
      setActionConfidence(selectedPriority.action.id, "Medium");
    }
    if (mapStatus === "signal") commitMap(selectedPriority.action.primaryOwner);
    setPhase("execution");
  };

  return (
    <PageShell bare tone="neutral" mainClassName="max-w-none px-0 pb-0 pt-0">
      <main
        className={`cv-page cv-theme-${clientViewTheme} client-view-stage ${
          hasMounted ? "is-mounted" : ""
        }`}
      >
        {!hasCompany ? (
          <section className="cv-empty-state">
            <motion.div className="cv-empty-card" {...revealProps(0)}>
              <p className="cv-stage-label">Decision Path</p>
              <h1>Select a company to open the client-facing MojoMap.</h1>
              <p>
                This version is built for live conversation, so the first move is
                choosing the company whose signal we want to read.
              </p>
              {companiesLoading ? (
                <p className="cv-empty-meta">Loading companies…</p>
              ) : companies.length > 0 ? (
                <div className="cv-empty-actions">
                  {companies.map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      className="cv-secondary-button"
                      onClick={() => setActiveCompanyId(company.id)}
                    >
                      {company.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="cv-empty-meta">No companies are available right now.</p>
              )}
              {/* Integrity sweep: renders regardless of the fallback company injection. */}
              {companiesFetchError && (
                <p className="cv-empty-meta" style={{ color: "#c45c00" }}>Couldn't load companies — try reloading.</p>
              )}
            </motion.div>
          </section>
        ) : (
          <div className="cv-shell">
            {companiesFetchError && (
              <p className="cv-empty-meta" style={{ color: "#c45c00" }}>Couldn't load companies — try reloading.</p>
            )}
            <DecisionPhaseNav
              activePhase={phase}
              onSelectPhase={setPhase}
              theme={clientViewTheme}
              onThemeChange={setClientViewTheme}
            />

            <motion.header
              className={`cv-hero ${getScoreToneClassFromScore(score)}`}
              {...revealProps(0)}
            >
              <div className="cv-hero-layout">
                <div className="cv-hero-copy">
                  <p className="cv-stage-label">{stageCopy.eyebrow}</p>
                  <h1>{stageCopy.headline}</h1>
                  <p className="cv-stage-support">{stageCopy.support}</p>
                  <p className="cv-hero-story">
                    {phase === "outside"
                      ? viewModel.outsideView.strongestHypothesis
                      : viewModel.phaseNarrative.headline}
                  </p>
                  <p className="cv-hero-note">
                    {phase === "outside"
                      ? viewModel.hero.outsideSignalNoteLine || viewModel.outsideView.confidenceLine
                      : viewModel.phaseNarrative.supportLine}
                  </p>
                  {primaryDesiredOutcome ? (
                    <div className="mt-4 rounded-xl border border-[#e2e8df] bg-white/70 px-3 py-2">
                      <p className="cv-stage-label">Primary Desired Outcome</p>
                      <p className="mt-1 text-[16px] leading-[1.4] text-t-primary">
                        {primaryDesiredOutcome.statement}
                      </p>
                      <p className="mt-1 text-[12px] leading-[1.45] text-t-secondary">
                        Leading indicator: {primaryDesiredOutcome.leadingIndicator || "Not found in repo."}
                      </p>
                    </div>
                  ) : null}
                </div>

                <aside className="cv-score-card">
                  <p className="cv-score-kicker">Mojo Score</p>
                  <div className="cv-score-row">
                    <span className="cv-score-value">{score}</span>
                    <span className="cv-score-status">
                      {phase === "outside" ? "Provisional" : getStatusLabelFromScore(score)}
                    </span>
                  </div>
                  <p className="cv-score-caption">{scoreCaption(phase)}</p>
                  {phase === "outside" ? (
                    <div className="cv-score-explain">
                      <p>{outsideScoreCopy.lead}</p>
                      <p>{outsideScoreCopy.detail}</p>
                    </div>
                  ) : (
                    <div className="cv-score-explain">
                      <p>{viewModel.phaseNarrative.dominantLine}</p>
                      <p>{viewModel.interpretation.fixLine}</p>
                    </div>
                  )}
                  <div className="cv-score-trajectory" aria-label="Score">
                    <div className="cv-score-node">
                      <span>Current</span>
                      <strong>{score}</strong>
                    </div>
                  </div>
                </aside>
              </div>
            </motion.header>

            {phase === "outside" ? (
              <>
                <motion.section className="cv-section" {...revealProps(1)}>
                  <div className="cv-section-inner">
                    <p className="cv-section-kicker">What seems to be going on</p>
                    <h2>{actionRouteTitle(leadRoute?.title || viewModel.outsideView.heroHeadline)}</h2>
                    <p className="cv-section-copy">
                      {viewModel.outsideView.clientLens.whatWeHeard}
                    </p>
                    <p className="cv-section-copy">
                      {viewModel.outsideView.clientLens.whatOutsideViewSuggests}
                    </p>

                    <article className="cv-story-card cv-lead-route">
                      <div className="cv-route-head">
                        <div>
                          <p className="cv-route-label">Leading possibility</p>
                          <h3>{actionRouteTitle(leadRoute?.title || "")}</h3>
                        </div>
                        <div className="cv-route-meta">
                          <span>{leadRoute?.confidenceLevel || "Building evidence"}</span>
                          {leadRoute ? <span>{routeSignalChip(leadRoute)}</span> : null}
                        </div>
                      </div>
                      <p className="cv-route-summary">
                        {leadRoute?.whyRelevant || viewModel.outsideView.heroWhyLine}
                      </p>
                      <div className="cv-route-story-grid">
                        <article className="cv-route-story-item">
                          <p className="cv-section-kicker">Why this is leading</p>
                          <p>{leadRoute?.whyLeading || viewModel.outsideView.leadOpportunity.whyLeading}</p>
                        </article>
                        <article className="cv-route-story-item">
                          <p className="cv-section-kicker">If this is true</p>
                          <p>
                            {readableOutcome(
                              leadRoute?.outcomes[0] ||
                                viewModel.outsideView.leadOpportunity.outcomes[0],
                            )}
                          </p>
                        </article>
                        <article className="cv-route-story-item">
                          <p className="cv-section-kicker">Next thing we’d test</p>
                          <p>
                            {viewModel.outsideView.clientLens.validateQuestions[0] ||
                              viewModel.outsideView.bridge.nextStep}
                          </p>
                        </article>
                      </div>
                    </article>
                  </div>
                </motion.section>

                <motion.section className="cv-section" {...revealProps(2)}>
                  <div className="cv-section-inner">
                    <p className="cv-section-kicker">Other routes still in play</p>
                    <h2>Keep the alternatives visible while the strongest idea gets a closer look.</h2>
                    <div className="cv-route-stack">
                      {secondaryRoutes.map((route, index) => (
                        <article key={`${route.title}-${index}`} className="cv-route-option">
                          <div className="cv-route-head">
                            <div>
                              <p className="cv-route-label">{route.rankLabel}</p>
                              <h3>{actionRouteTitle(route.title)}</h3>
                            </div>
                            <div className="cv-route-meta">
                              <span>{route.confidenceLevel}</span>
                              {routeSignalChip(route) ? <span>{routeSignalChip(route)}</span> : null}
                            </div>
                          </div>
                          <p>{route.whyRelevant}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </motion.section>

                <motion.section className="cv-section" {...revealProps(3)}>
                  <div className="cv-section-inner">
                    <p className="cv-section-kicker">What we noticed</p>
                    <h2>Three things are standing out most clearly from the outside.</h2>
                    <div className="cv-signal-list">
                      {strongestSupportSignals.map((line) => (
                        <article key={line} className="cv-signal-item">
                          <p>{line}</p>
                        </article>
                      ))}
                    </div>

                    <p className="cv-section-kicker">What we’d look at next</p>
                    <div className="cv-hypothesis-list">
                      {viewModel.outsideView.hypothesesToTest.slice(0, 3).map((line) => (
                        <article key={line} className="cv-hypothesis-item">
                          <h3 className="cv-hypothesis-title">{testSummaryTitle(line)}</h3>
                          <p>{line}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </motion.section>
              </>
            ) : null}

            {phase === "diagnosis" ? (
              <>
                <motion.section className="cv-section" {...revealProps(1)}>
                  <div className="cv-section-inner">
                    <p className="cv-section-kicker">What the evidence is doing</p>
                    <h2>{viewModel.phaseNarrative.headline}</h2>
                    <p className="cv-section-copy">{viewModel.phaseNarrative.supportLine}</p>
                    <p className="cv-section-copy">{viewModel.interpretation.riskLine}</p>
                  </div>
                </motion.section>

                {(["Confirmed", "Disproven", "Unresolved"] as const).map((status, index) => (
                  <motion.section
                    key={status}
                    className="cv-section cv-band"
                    {...revealProps(index + 2)}
                  >
                    <div className="cv-section-inner">
                      <div className="cv-band-header">
                        <p className="cv-section-kicker">{status}</p>
                        <h2>
                          {status === "Confirmed"
                            ? "What is holding up under pressure."
                            : status === "Disproven"
                              ? "What is looking weaker once the evidence is applied."
                              : "What still needs proof before it deserves commitment."}
                        </h2>
                      </div>

                      <div className="cv-evidence-list">
                        {diagnosisBuckets[status].length > 0 ? (
                          diagnosisBuckets[status].map((row) => (
                            <article
                              key={`${status}-${row.signal}-${row.assumption}`}
                              className={`cv-evidence-card ${diagnosisTone(row.status)}`}
                            >
                              <p className="cv-evidence-status">{row.status}</p>
                              <h3>{row.signal}</h3>
                              <p>{row.assumption}</p>
                              <div className="cv-evidence-detail">
                                <p className="cv-section-kicker">Evidence</p>
                                <p>{row.evidence}</p>
                              </div>
                              <div className="cv-evidence-detail">
                                <p className="cv-section-kicker">Implication</p>
                                <p>{row.truthStatus}</p>
                              </div>
                            </article>
                          ))
                        ) : (
                          <article className="cv-story-card">
                            <p>No evidence is sitting in this lane yet.</p>
                          </article>
                        )}
                      </div>
                    </div>
                  </motion.section>
                ))}

                <motion.section className="cv-section" {...revealProps(5)}>
                  <div className="cv-section-inner">
                    <p className="cv-section-kicker">What the evidence changes</p>
                    <h2>Use the evidence to align the team read before the next decision.</h2>
                    <div className="cv-story-card cv-agreement-wrap">
                      <p className="cv-section-copy">
                        {viewModel.constraint.trust.confidenceBasis}
                      </p>
                      <TeamAgreementControl
                        value={currentBelief}
                        alignedCount={viewModel.constraint.alignedCount}
                        totalCount={viewModel.constraint.totalCount}
                        onChange={(value) =>
                          setConstraintBelief(currentUserId, currentUserLabel, value)
                        }
                      />
                    </div>
                  </div>
                </motion.section>
              </>
            ) : null}

            {phase === "focus" ? (
              <>
                <motion.section className="cv-section" {...revealProps(1)}>
                  <div className="cv-section-inner">
                    <p className="cv-section-kicker">What matters most now</p>
                    <h2>{selectedPriority?.action.title || viewModel.phaseNarrative.focus?.mattersMostNow}</h2>
                    <p className="cv-section-copy">
                      {selectedPriority?.summaryLine || viewModel.phaseNarrative.focus?.doFirst}
                    </p>

                    {opportunitiesLoading ? (
                      <article className="cv-story-card">
                        <p>Loading priorities…</p>
                      </article>
                    ) : opportunitiesError ? (
                      <article className="cv-story-card">
                        <p>We couldn’t load priorities right now.</p>
                      </article>
                    ) : selectedPriority ? (
                      <article className="cv-story-card cv-focus-hero">
                        <div className="cv-route-head">
                          <div>
                          <p className="cv-route-label">Main move</p>
                            <h3>{selectedPriority.action.title}</h3>
                          </div>
                          <div className="cv-route-meta">
                            <span>{selectedPriority.impactedDriver}</span>
                          </div>
                        </div>
                        <p>{selectedPriority.whyThisMatters}</p>
                        <div className="cv-route-story-grid">
                          <article className="cv-route-story-item">
                            <p className="cv-section-kicker">Why now</p>
                            <p>{selectedPriority.whyNow}</p>
                          </article>
                          <article className="cv-route-story-item">
                            <p className="cv-section-kicker">Why this over others</p>
                            <p>{selectedPriority.whyNotOthers}</p>
                          </article>
                          <article className="cv-route-story-item">
                            <p className="cv-section-kicker">What happens if it waits</p>
                            <p>{selectedPriority.withoutLine || viewModel.constraint.trust.biggestRisk}</p>
                          </article>
                        </div>

                        <div className="cv-control-row">
                          <div className="cv-inline-selectors">
                            {CONFIDENCE_OPTIONS.map((option) => (
                              <button
                                key={`${selectedPriority.action.id}-${option}`}
                                type="button"
                                className={`cv-chip-button ${
                                  getActionConfidenceLevel(selectedPriority.action.id) === option
                                    ? "is-active"
                                    : ""
                                }`}
                                onClick={() => setActionConfidence(selectedPriority.action.id, option)}
                              >
                                {option} confidence
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            className="cv-secondary-button"
                            onClick={() => setOwnerDialogActionId(selectedPriority.action.id)}
                          >
                            {selectedPriority.action.primaryOwner
                              ? `Owner: ${selectedPriority.action.primaryOwner}`
                              : "Assign owner"}
                          </button>
                        </div>
                      </article>
                    ) : (
                      <article className="cv-story-card">
                        <p>No priorities are available yet.</p>
                      </article>
                    )}
                  </div>
                </motion.section>

                <motion.section className="cv-section" {...revealProps(2)}>
                  <div className="cv-section-inner">
                    <p className="cv-section-kicker">Keep these visible, but secondary</p>
                    <h2>The alternatives stay in frame without taking over the decision.</h2>
                    <div className="cv-alt-list">
                      {viewModel.priorities.items
                        .filter((item) => item.action.id !== selectedPriority?.action.id)
                        .slice(0, 3)
                        .map((item) => (
                          <button
                            key={item.action.id}
                            type="button"
                            className={`cv-alt-item ${
                              selectedPriority?.action.id === item.action.id ? "is-active" : ""
                            }`}
                            onClick={() => setSelectedPriorityId(item.action.id)}
                          >
                            <strong>{item.action.title}</strong>
                            <span>{item.whyNow}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                </motion.section>
              </>
            ) : null}

            {phase === "execution" ? (
              <>
                <motion.section className="cv-section" {...revealProps(1)}>
                  <div className="cv-section-inner">
                    <p className="cv-section-kicker">What is changing</p>
                    <h2>{selectedFlowDriver?.label || "Watch the signal that moves next."}</h2>
                    <p className="cv-section-copy">
                      {selectedFlowDriver?.problem || viewModel.phaseNarrative.flow?.signalShift}
                    </p>
                    <article className="cv-story-card cv-flow-story">
                      <div className="cv-route-head">
                        <div>
                          <p className="cv-route-label">Main thing to watch</p>
                          <h3>{selectedFlowDriver?.state || viewModel.phaseNarrative.flow?.scoreMovement}</h3>
                        </div>
                        <div className="cv-route-meta">
                          <span>{viewModel.phaseNarrative.flow?.scoreMovement}</span>
                        </div>
                      </div>
                      <div className="cv-route-story-grid">
                        <article className="cv-route-story-item">
                          <p className="cv-section-kicker">What is shifting</p>
                          <p>
                            {viewModel.phaseNarrative.flow?.signalShift ||
                              selectedFlowDriver?.explanation}
                          </p>
                        </article>
                        <article className="cv-route-story-item">
                          <p className="cv-section-kicker">What to watch</p>
                          <p>
                            {selectedFlowDriver?.unlockLine ||
                              viewModel.phaseNarrative.flow?.adaptation}
                          </p>
                        </article>
                        <article className="cv-route-story-item">
                          <p className="cv-section-kicker">What is moving</p>
                          <p>{selectedPriority?.action.title || "Choose a priority to monitor."}</p>
                        </article>
                      </div>
                    </article>
                  </div>
                </motion.section>

                <motion.section className="cv-section" {...revealProps(2)}>
                  <div className="cv-section-inner">
                    <p className="cv-section-kicker">Watch list</p>
                    <h2>Keep movement visible and adjust before drag compounds.</h2>
                    <div className="cv-flow-watch-list">
                      {viewModel.drivers.list.slice(0, 4).map((driver) => (
                        <button
                          key={driver.id}
                          type="button"
                          className={`cv-flow-watch-item ${
                            selectedFlowDriver?.id === driver.id ? "is-active" : ""
                          }`}
                          onClick={() => setSelectedFlowDriverId(driver.id)}
                        >
                          <strong>{driver.label}</strong>
                          <span>{driver.problem}</span>
                          <p className="cv-watch-meta">{driver.state}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.section>
              </>
            ) : null}

            <motion.section className="cv-action-area" {...revealProps(6)}>
              <div className="cv-action-copy">
                <p className="cv-section-kicker">Next move</p>
                <h2>
                  {phase === "outside"
                    ? "Take this first read into a closer look."
                    : phase === "diagnosis"
                      ? "Turn what holds up into one clear decision."
                      : phase === "focus"
                        ? "Put one move in motion and keep the others secondary."
                        : "Update what changed and decide what needs attention next."}
                </h2>
                <p>
                  {phase === "outside"
                    ? viewModel.outsideView.bridge.nextStep
                    : phase === "diagnosis"
                      ? viewModel.interpretation.fixLine
                      : phase === "focus"
                        ? selectedPriority?.whyLine || viewModel.actionIntro.supportLine
                        : selectedPriority?.whyLine ||
                          viewModel.phaseNarrative.flow?.progressReview}
                </p>
              </div>

              <div className="cv-action-controls">
                <button
                  type="button"
                  className="cv-secondary-button"
                  onClick={() => void rerunAnalysis()}
                  disabled={rerunningAnalysis}
                >
                  {rerunningAnalysis ? "Refreshing…" : "Refresh read"}
                </button>

                {phase === "outside" ? (
                  <button
                    type="button"
                    className="cv-primary-button"
                    onClick={() => setPhase("diagnosis")}
                  >
                    Start Diagnose
                  </button>
                ) : null}

                {phase === "diagnosis" ? (
                  <button
                    type="button"
                    className="cv-primary-button"
                    onClick={() => setPhase("focus")}
                  >
                    Move to Focus
                  </button>
                ) : null}

                {phase === "focus" ? (
                  <button
                    type="button"
                    className="cv-primary-button"
                    onClick={handleFocusAction}
                    disabled={!selectedPriority}
                  >
                    {selectedPriority?.action.primaryOwner
                      ? "Commit to Flow"
                      : "Assign owner to continue"}
                  </button>
                ) : null}

                {phase === "execution" ? (
                  <button
                    type="button"
                    className="cv-primary-button"
                    onClick={handleFlowAction}
                    disabled={!selectedPriority}
                  >
                    {flowActionLabel(selectedPriority?.action || null)}
                  </button>
                ) : null}
              </div>
            </motion.section>
          </div>
        )}

        <ClientOwnerAssignDialog
          open={Boolean(ownerDialogAction)}
          onOpenChange={(open) => {
            if (!open) setOwnerDialogActionId(null);
          }}
          actionTitle={ownerDialogAction?.title || "Action"}
          ownerOptions={ownerOptions}
          currentOwner={ownerDialogAction?.primaryOwner || null}
          onAssign={(owner) => {
            if (!ownerDialogAction) return;
            handleAssignOwner(ownerDialogAction.id, owner);
          }}
          onAddUser={addOwnerOption}
        />
      </main>
    </PageShell>
  );
}
