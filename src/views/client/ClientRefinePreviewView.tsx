import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useClientViewData } from "@/hooks/useClientViewData";
import { useFileProposals } from "@/hooks/useFileProposals";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { useStrategicAssumptions } from "@/hooks/useStrategicAssumptions";
import { selectBestProposal, normalizeToDiagnostic } from "@/lib/mojoMapDiagnostic";
import type { MojoMapDiagnostic } from "@/lib/mojoMapDiagnostic";
import { CLIENT_REFINE_PREVIEW_ROUTES_ROUTE, CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE } from "@/lib/clientRefinePreview";
import "@/styles/client-refine-preview.css";

type LayerState = "command" | "map" | "narrative" | "drawer";
type CommitState = "idle" | "committing" | "committed" | "next-revealed" | "branching" | "waiting";
type DrawerKey = "why" | "blocking" | "signals" | "progress";
type RouteCategory = "Fix" | "Improve" | "Create";
type TweakTab = "evidence" | "claims" | "foundation" | "assumptions" | "rerun" | "access";

type AccessModes = {
  pills: boolean;
  inline: boolean;
  edge: boolean;
  footer: boolean;
};

type DrawerRow = {
  key: string;
  value: string;
};

type DrawerSection = {
  title: string;
  headline: string;
  big?: string;
  rows: DrawerRow[];
  compact?: boolean;
};

const MODE_STORAGE_KEY = "phase5-modes";

const DEFAULT_ACCESS_MODES: AccessModes = {
  pills: true,
  inline: true,
  edge: true,
  footer: false,
};

const EDGE_DRAWERS: Array<{ key: DrawerKey; label: string }> = [
  { key: "why", label: "Why" },
  { key: "blocking", label: "Blocking" },
  { key: "signals", label: "Signals" },
  { key: "progress", label: "Progress" },
];

const BRANCH_OPTIONS = [
  {
    id: "branch-research",
    title: "Desk Research Sprint",
    description: "Quick evidence pass before interviews.",
    lift: 9,
    duration: "1wk",
  },
  {
    id: "branch-pilot",
    title: "Pilot with Two Accounts",
    description: "Run a live pilot and collect verbatims.",
    lift: 17,
    duration: "4wk",
  },
  {
    id: "branch-reframe",
    title: "Reframe Target Segment",
    description: "Tighten who this decision is really for.",
    lift: 4,
    duration: "3d",
  },
] as const;

const ROUTE_ORDER: RouteCategory[] = ["Fix", "Improve", "Create"];

const ROUTE_FALLBACK_HEADLINE: Record<RouteCategory, string> = {
  Fix: "Resolve the highest-friction blocker first.",
  Improve: "Improve the current route where execution is unstable.",
  Create: "Create a new path only after core blockers are controlled.",
};

const MAP_ROUTE_CURVES: Record<RouteCategory, string> = {
  Fix: "M 880 300 C 960 300, 1050 288, 1140 264 S 1300 220, 1378 186",
  Improve: "M 880 300 C 962 270, 1048 226, 1138 192 S 1294 142, 1378 118",
  Create: "M 880 300 C 955 336, 1044 382, 1136 424 S 1298 498, 1378 540",
};

const MAP_ROUTE_BADGES: Record<RouteCategory, { x: number; y: number }> = {
  Fix: { x: 1146, y: 258 },
  Improve: { x: 1146, y: 176 },
  Create: { x: 1146, y: 410 },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toSentence(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function shorten(value: string, max = 72) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function parseAccessModes(raw: string | null): AccessModes {
  if (!raw) return DEFAULT_ACCESS_MODES;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      pills: Boolean(parsed["mode-pills"]),
      inline: Boolean(parsed["mode-inline"]),
      edge: Boolean(parsed["mode-edge"]),
      footer: Boolean(parsed["mode-footer"]),
    };
  } catch {
    return DEFAULT_ACCESS_MODES;
  }
}

function confidenceBase(level: "Low" | "Medium" | "High") {
  if (level === "High") return 68;
  if (level === "Medium") return 52;
  return 38;
}

function statusLabel(value: string) {
  if (value === "in_progress") return "In progress";
  if (value === "planned") return "Planned";
  if (value === "parked") return "Parked";
  if (value === "done") return "Done";
  return "Planned";
}

function stageLabel(value: string) {
  if (value === "outside_signals" || value === "validate_outside" || value === "outside") return "outside signals";
  if (value === "diagnose" || value === "validate_diagnose" || value === "diagnosis") return "diagnose";
  if (value === "focus" || value === "validate_focus") return "focus";
  if (value === "flow" || value === "validate_flow" || value === "execution") return "flow";
  return "diagnose";
}

function stateLabel(layer: LayerState) {
  if (layer === "map") return "Map";
  if (layer === "narrative") return "Narrative";
  if (layer === "drawer") return "Context drawer";
  return "Command";
}

export default function ClientRefinePreviewView() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { companies, setActiveCompanyId, loading: companiesLoading } = useCompany();
  const {
    activeCompany,
    hasCompany,
    topActions,
    allActions,
    primaryConstraint,
    nextMove,
    confidence,
    evidence,
    inputCoverage,
    signalStrength,
    primaryDesiredOutcome,
    rerunAnalysis: refetchClientViewData,
  } = useClientViewData({ actionLimit: 5 });

  const phase = activeCompany?.engagement_phase ?? "outside_signals";
  const isEarlyPhase = phase === "outside_signals" || phase === "validate_outside" || phase === "diagnose" || phase === "validate_diagnose";

  // ── Strategic state analysis ────────────────────────────────────────────────
  const queryClient = useQueryClient();
  const { data: fileProposals = [] } = useFileProposals(activeCompany?.id);
  const { run: latestBaselineRun, preferredRun: baselineRun, loading: baselineLoading } = usePublicBaseline(activeCompany?.id);
  const {
    items: strategicAssumptions,
    loading: assumptionsLoading,
    saving: assumptionSaving,
    updatingId: assumptionUpdatingId,
    addAssumption,
    setAssumptionStatus,
  } = useStrategicAssumptions(activeCompany?.id);

  const analysisRunning = fileProposals.some(
    (p) => p.processing_state === "queued" || p.processing_state === "running",
  );

  // Elapsed seconds counter — resets when analysis stops
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    if (!analysisRunning) { setElapsedSeconds(0); return; }
    setElapsedSeconds(0);
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [analysisRunning]);

  const prevAnalysisRunning = useRef(false);
  useEffect(() => {
    if (prevAnalysisRunning.current && !analysisRunning) {
      const latest = fileProposals[0];
      if (latest?.processing_state === "ready") {
        toast.success("Analysis complete — diagnostic updated.");
      } else if (latest?.processing_state === "failed") {
        toast.error("Analysis failed. Check the pipeline and try again.");
      }
    }
    prevAnalysisRunning.current = analysisRunning;
  }, [analysisRunning, fileProposals]);

  // Poll check-mojo-analysis every 5s while a proposal is running.
  // The edge function background monitor is unreliable in the local runtime —
  // this drives result capture from the frontend instead.
  useEffect(() => {
    if (!analysisRunning || !activeCompany?.id) return;
    const runningProposal = fileProposals.find((p) => p.processing_state === "running");
    if (!runningProposal) return;

    const interval = setInterval(async () => {
      try {
        await supabase.functions.invoke("check-mojo-analysis", {
          body: { proposal_id: runningProposal.id },
        });
        queryClient.invalidateQueries({ queryKey: ["file-proposals", activeCompany.id] });
      } catch { /* ignore — next tick will retry */ }
    }, 5000);

    return () => clearInterval(interval);
  }, [analysisRunning, activeCompany?.id, fileProposals, queryClient]);

  const runAnalysis = useCallback(async () => {
    if (!activeCompany?.id) {
      toast.error("No company selected.");
      return;
    }
    if (analysisRunning) return;
    toast.loading("Starting analysis…", { id: "run-analysis" });
    const { error } = await supabase.functions.invoke("run-mojo-analysis", {
      body: { company_id: activeCompany.id, trigger_type: "manual" },
    });
    if (error) {
      console.error("[run-mojo-analysis]", error);
      toast.error(`Could not start analysis: ${error.message}`, { id: "run-analysis" });
    } else {
      toast.success("Analysis started.", { id: "run-analysis" });
      queryClient.invalidateQueries({ queryKey: ["file-proposals", activeCompany.id] });
    }
  }, [activeCompany?.id, analysisRunning, queryClient]);

  const cancelAnalysis = useCallback(async () => {
    if (!activeCompany?.id) return;
    const stuckIds = fileProposals
      .filter((p) => p.processing_state === "queued" || p.processing_state === "running")
      .map((p) => p.id);
    if (stuckIds.length === 0) return;
    await supabase.from("file_proposals")
      .update({ processing_state: "failed", processing_error: "Cancelled by user" })
      .in("id", stuckIds);
    queryClient.invalidateQueries({ queryKey: ["file-proposals", activeCompany.id] });
  }, [activeCompany?.id, fileProposals, queryClient]);

  const runOutsideSignals = useCallback(async () => {
    if (!activeCompany?.id || !activeCompany?.website?.trim()) {
      toast.error("Add a website before running outside signals.");
      return;
    }
    toast.loading("Running outside signals…", { id: "run-outside-signals" });
    const { error } = await supabase.functions.invoke("public-baseline", {
      body: {
        company_id: activeCompany.id,
        company_name: activeCompany.name,
        website: activeCompany.website,
      },
    });
    if (error) {
      toast.error(error.message || "Outside signals failed.", { id: "run-outside-signals" });
      return;
    }
    toast.success("Outside signals updated.", { id: "run-outside-signals" });
    queryClient.invalidateQueries({ queryKey: ["file-proposals", activeCompany.id] });
  }, [activeCompany?.id, activeCompany?.name, activeCompany?.website, queryClient]);

  const rerunFoundationScope = useCallback(async () => {
    if (!activeCompany?.id || !activeCompany?.name) {
      toast.error("No company selected.");
      return;
    }
    toast.loading("Rebuilding foundation and routes…", { id: "rerun-foundation-scope" });
    const { error } = await supabase.functions.invoke("research-company", {
      body: {
        company_id: activeCompany.id,
        company_name: activeCompany.name,
        website: activeCompany.website ?? "",
        journey_key: "customer",
        review_mode: "advisory",
      },
    });
    if (error) {
      toast.error(error.message || "Foundation rerun failed.", { id: "rerun-foundation-scope" });
      return;
    }
    await refetchClientViewData();
    toast.success("Foundation and routes refreshed.", { id: "rerun-foundation-scope" });
    queryClient.invalidateQueries({ queryKey: ["file-proposals", activeCompany.id] });
  }, [activeCompany?.id, activeCompany?.name, activeCompany?.website, queryClient, refetchClientViewData]);

  const rerunOdiJobMapScope = useCallback(async () => {
    if (!activeCompany?.id) {
      toast.error("No company selected.");
      return;
    }
    toast.loading("Regenerating ODI job map…", { id: "rerun-jobmap-scope" });
    const { data, error } = await supabase.functions.invoke("local-jobmap-synthesis", {
      body: {
        company_id: activeCompany.id,
        selected_job_maps: [
          {
            journey_key: "customer",
            journey_title: "Customer Progress",
            journey_subtitle: "How the primary job performer moves through the core job.",
          },
        ],
        trigger: "command_workbench_scoped_rerun",
      },
    });
    if (error) {
      toast.error(error.message || "ODI job map rerun failed.", { id: "rerun-jobmap-scope" });
      return;
    }
    if (data && typeof data === "object" && "error" in data && data.error) {
      toast.error(String(data.error), { id: "rerun-jobmap-scope" });
      return;
    }
    await refetchClientViewData();
    toast.success("ODI job map regenerated.", { id: "rerun-jobmap-scope" });
  }, [activeCompany?.id, refetchClientViewData]);
  const diagnostic = useMemo((): MojoMapDiagnostic | null => {
    const best = selectBestProposal(fileProposals);
    if (!best) return null;
    return normalizeToDiagnostic(best);
  }, [fileProposals]);

  const baselineSummary = useMemo(() => {
    const result = (baselineRun?.result_json ?? {}) as Record<string, unknown>;
    return {
      outsideSignals: Array.isArray(result.outside_voice_signals) ? result.outside_voice_signals.length : 0,
      evidenceLedger: Array.isArray(result.evidence_ledger) ? result.evidence_ledger.length : 0,
      hypotheses: Array.isArray(result.top_hypotheses) ? result.top_hypotheses.length : 0,
      questions: Array.isArray(result.open_questions) ? result.open_questions.length : 0,
    };
  }, [baselineRun]);

  const latestBaselineSummary = useMemo(() => {
    const result = (latestBaselineRun?.result_json ?? {}) as Record<string, unknown>;
    return {
      outsideSignals: Array.isArray(result.outside_voice_signals) ? result.outside_voice_signals.length : 0,
      evidenceLedger: Array.isArray(result.evidence_ledger) ? result.evidence_ledger.length : 0,
      hypotheses: Array.isArray(result.top_hypotheses) ? result.top_hypotheses.length : 0,
      questions: Array.isArray(result.open_questions) ? result.open_questions.length : 0,
    };
  }, [latestBaselineRun]);

  const baselineSelectionReason = useMemo(() => {
    if (!baselineRun) return "No public baseline selected yet.";
    if (!latestBaselineRun) return "Using the strongest available public baseline.";
    if (baselineRun.id === latestBaselineRun.id) {
      return "Latest run is also the strongest usable public baseline.";
    }
    if (latestBaselineSummary.outsideSignals === 0 && baselineSummary.outsideSignals > 0) {
      return "Latest run had no outside voice signals, so the stronger recent baseline is active.";
    }
    return "A stronger recent baseline is active because it carries better evidence quality than the latest run.";
  }, [baselineRun, latestBaselineRun, latestBaselineSummary.outsideSignals, baselineSummary.outsideSignals]);

  const signalPosture = useMemo(() => {
    const outside =
      baselineSummary.outsideSignals > 0
        ? "Present"
        : baselineSummary.evidenceLedger > 0 || baselineSummary.hypotheses > 0
          ? "Thin"
          : "Missing";
    const organization = fileProposals.length > 0 ? "Present" : "Thin";
    const customer = evidence.sources.some((source) => /customer|interview|survey/i.test(source.label) && source.present)
      ? "Present"
      : "Missing";
    return { outside, organization, customer };
  }, [baselineSummary, fileProposals.length, evidence.sources]);

  const evidenceGuidance = useMemo(() => {
    const usable: string[] = [];
    const revalidate: string[] = [];

    if (signalPosture.outside === "Present") {
      usable.push("market language and public positioning cues");
    } else if (signalPosture.outside === "Thin") {
      usable.push("light public context only");
    }

    if (signalPosture.organization === "Present") {
      usable.push("internal strategy and uploaded company context");
    }

    if (signalPosture.customer === "Present") {
      usable.push("existing customer evidence, with framing checks");
    } else {
      revalidate.push("customer priorities under the current framing");
    }

    if (baselineRun && latestBaselineRun && baselineRun.id !== latestBaselineRun.id) {
      revalidate.push("the latest public baseline before treating it as authoritative");
    }

    return {
      usable: usable.length > 0 ? usable.join(", ") : "no strong evidence is safe to use yet",
      revalidate: revalidate.length > 0 ? revalidate.join(", ") : "no immediate revalidation flags",
    };
  }, [signalPosture, baselineRun, latestBaselineRun]);

  const frameworkClaimPreview = useMemo(
    () => (diagnostic?.frameworkFindings ?? []).slice(0, 6),
    [diagnostic],
  );

  const claimWorkbenchPreview = useMemo(() => {
    return frameworkClaimPreview.map((finding) => {
      const framework = finding.framework.toLowerCase();
      const customerSensitive = framework === "jtbd" || framework === "odi";
      const marketSensitive = framework === "april_dunford";
      const hasOutside = signalPosture.outside === "Present";
      const hasOrganization = signalPosture.organization === "Present";
      const hasCustomer = signalPosture.customer === "Present";

      let supportLevel = "Thin";
      let supportReason = "Evidence is still too incomplete to trust this claim yet.";
      let validationNote = "Gather stronger supporting evidence before treating this as durable.";

      if (customerSensitive) {
        if (hasCustomer && hasOrganization) {
          supportLevel = "Customer-backed";
          supportReason = "Direct customer signal exists and internal context supports the same read.";
          validationNote = hasOutside
            ? "Pressure-test this against market context if the framing has changed."
            : "Keep it, but add outside context if the market read still matters.";
        } else if (hasCustomer) {
          supportLevel = "Direct but narrow";
          supportReason = "Customer evidence exists, but it is not yet reinforced by enough surrounding context.";
          validationNote = "Check whether current company context still fits what customers are saying.";
        } else if (hasOrganization) {
          supportLevel = "Internal proxy only";
          supportReason = "This reads more like an internal interpretation than a validated customer truth.";
          validationNote = "Revalidate with direct customer evidence before using it as foundational truth.";
        }
      } else if (marketSensitive) {
        if (hasOutside && hasOrganization) {
          supportLevel = "Market-backed";
          supportReason = "Public market context and internal positioning signals point in the same direction.";
          validationNote = hasCustomer
            ? "Customer evidence can sharpen this, but it is already usable as a positioning read."
            : "Useful for positioning now, but still worth checking against direct customer response.";
        } else if (hasOutside) {
          supportLevel = "Market-facing only";
          supportReason = "Public evidence supports the claim, but internal proof is still thin.";
          validationNote = "Confirm the company can actually support this claim internally.";
        } else if (hasOrganization) {
          supportLevel = "Internal positioning claim";
          supportReason = "This is coming mainly from company material, not external market response.";
          validationNote = "Treat as directional until outside signals or customer response support it.";
        }
      } else {
        if (hasOrganization && hasOutside) {
          supportLevel = "Directional";
          supportReason = "Internal evidence and public context align enough to treat this as a working claim.";
          validationNote = hasCustomer
            ? "Customer evidence should refine this before it becomes a hard commitment."
            : "Customer validation is still the missing step.";
        } else if (hasOrganization) {
          supportLevel = "Internal only";
          supportReason = "This is currently supported mostly by company-side interpretation.";
          validationNote = "Use as a working hypothesis, not as a settled strategic truth.";
        }
      }

      return {
        ...finding,
        supportLevel,
        supportReason,
        validationNote,
      };
    });
  }, [frameworkClaimPreview, signalPosture]);

  const foundationWorkbenchPreview = useMemo(() => {
    const positioningStatement =
      diagnostic?.headline ||
      (baselineSummary.outsideSignals > 0
        ? "Public market context is present, but the positioning read still needs sharpening."
        : "No clear external positioning read yet.");

    const strategyStatement =
      toSentence(primaryConstraint?.title) ||
      toSentence(primaryConstraint?.detail) ||
      "No clear strategic constraint has been formed yet.";

    const outcomeStatement =
      toSentence(primaryDesiredOutcome?.statement) ||
      "No primary outcome is being held consistently yet.";

    const routeStatement =
      toSentence(nextMove?.title) ||
      toSentence(nextMove?.detail) ||
      "No active route is leading yet.";

    return [
      {
        area: "Positioning",
        statement: positioningStatement,
        evidenceShape:
          signalPosture.outside === "Present" && signalPosture.organization === "Present"
            ? "Outside + organization"
            : signalPosture.outside === "Present"
              ? "Outside-led"
              : "Thin",
        nextCheck:
          signalPosture.customer === "Present"
            ? "Check whether current customer signal still fits the positioning read."
            : "Add direct customer response before hardening this into a positioning truth.",
      },
      {
        area: "Strategy",
        statement: strategyStatement,
        evidenceShape:
          signalPosture.organization === "Present"
            ? signalPosture.outside === "Present"
              ? "Organization + outside"
              : "Organization-led"
            : "Thin",
        nextCheck:
          "Confirm this constraint still reflects the real decision bottleneck, not only internal interpretation.",
      },
      {
        area: "Outcome",
        statement: outcomeStatement,
        evidenceShape:
          signalPosture.customer === "Present"
            ? "Customer-supported"
            : signalPosture.organization === "Present"
              ? "Internal proxy"
              : "Thin",
        nextCheck:
          signalPosture.customer === "Present"
            ? "Keep outcome language tied to actual customer progress."
            : "Revalidate this outcome with direct customer evidence before overcommitting.",
      },
      {
        area: "Route",
        statement: routeStatement,
        evidenceShape: "Current move",
        nextCheck:
          "Make the core route assumption explicit before treating this as locked.",
      },
    ];
  }, [
    baselineSummary.outsideSignals,
    diagnostic?.headline,
    nextMove?.detail,
    nextMove?.title,
    primaryConstraint?.detail,
    primaryConstraint?.title,
    primaryDesiredOutcome?.statement,
    signalPosture,
  ]);

  const assumptionWorkbenchPreview = useMemo(() => {
    return strategicAssumptions.map((assumption) => {
      const normalized = assumption.assumption.toLowerCase();
      const gates: string[] = [];

      if (/(customer|buyer|user|interview|survey|demand|need|priority)/i.test(normalized)) {
        gates.push("Customer signal");
      }
      if (/(position|message|category|brand|proof|differentiat|value proposition|market)/i.test(normalized)) {
        gates.push("Positioning");
      }
      if (/(route|launch|deliver|execute|pilot|channel|distribution|partner|sales|rollout)/i.test(normalized)) {
        gates.push("Current route");
      }
      if (/(team|owner|ops|process|workflow|execution|capacity|resource)/i.test(normalized)) {
        gates.push("Execution path");
      }
      if (gates.length === 0 && primaryConstraint?.title) {
        gates.push(`Constraint: ${shorten(primaryConstraint.title, 56)}`);
      }
      if (gates.length === 0 && diagnostic?.headline) {
        gates.push(`Diagnostic: ${shorten(diagnostic.headline, 56)}`);
      }

      let impact = "Still a live assumption behind the current direction.";
      if (assumption.status === "validating") {
        impact = "In testing now. Keep dependent decisions flexible until the result settles.";
      } else if (assumption.status === "validated") {
        impact = "Supported enough to stop treating it as a primary blocker.";
      } else if (assumption.status === "invalidated") {
        impact = "Broken assumption. Recheck the dependent route or strategic read.";
      }

      return {
        ...assumption,
        gates: gates.slice(0, 2),
        impact,
      };
    });
  }, [strategicAssumptions, primaryConstraint?.title, diagnostic?.headline]);

  const [layer, setLayer] = useState<LayerState>("command");
  const [commitState, setCommitState] = useState<CommitState>("idle");
  const [drawerKey, setDrawerKey] = useState<DrawerKey | null>(null);
  const [selectedMapRoute, setSelectedMapRoute] = useState<RouteCategory>("Fix");
  const [hoveredMapRoute, setHoveredMapRoute] = useState<RouteCategory | null>(null);
  const [systemLine, setSystemLine] = useState("");
  const [systemLineOn, setSystemLineOn] = useState(false);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [tweakTab, setTweakTab] = useState<TweakTab>("evidence");
  const [specOpen, setSpecOpen] = useState(false);
  const [accessModes, setAccessModes] = useState<AccessModes>(DEFAULT_ACCESS_MODES);
  const [newAssumption, setNewAssumption] = useState("");
  const [confidenceFrom, setConfidenceFrom] = useState(42);
  const [confidenceTo, setConfidenceTo] = useState(42);
  const [evidenceChecks, setEvidenceChecks] = useState<boolean[]>([false, false, false]);
  const [hoverTip, setHoverTip] = useState<{ text: string; x: number; y: number } | null>(null);

  const handleAddAssumption = useCallback(async () => {
    const assumption = toSentence(newAssumption);
    if (!assumption) return;
    try {
      await addAssumption({ assumption, source: "client", status: "untested" });
      setNewAssumption("");
      toast.success("Assumption added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add assumption.");
    }
  }, [addAssumption, newAssumption]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);
  const typingRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const actionHeadline = useMemo(() => {
    if (isEarlyPhase) {
      const missing = evidence.sources.filter((s) => !s.present).map((s) => s.label);
      if (missing.length > 0) {
        const listed = missing.slice(0, 2).join(" and ");
        return `${listed} ${missing.length === 1 ? "is" : "are"} still missing`;
      }
      return "What internal evidence would confirm or challenge this read";
    }
    const detail = toSentence(nextMove?.detail);
    if (detail) return detail;
    return "Define the next high-leverage move with clearer evidence.";
  }, [isEarlyPhase, nextMove?.detail, evidence.sources]);

  const impactValue = useMemo(() => {
    const lift = Math.round((signalStrength.proof.value + signalStrength.execution.value) / 12);
    return `CONF +${Math.max(6, lift)}`;
  }, [signalStrength.execution.value, signalStrength.proof.value]);

  const effortValue = useMemo(() => {
    const detail = toSentence(nextMove?.detail).toLowerCase();
    if (detail.includes("week")) {
      const match = detail.match(/\b\d+\s*(?:-|to)?\s*\d*\s*weeks?\b/);
      if (match) return match[0].replace(/\s+/g, " ");
      return "2 weeks";
    }
    return "2 weeks";
  }, [nextMove?.detail]);

  const baseConfidence = useMemo(() => confidenceBase(confidence.level), [confidence.level]);

  const confidenceTarget = useMemo(() => {
    const projected = Number(activeCompany?.projected_score ?? activeCompany?.potential_score ?? 0);
    const candidate = Number.isFinite(projected) && projected > 0 ? projected : baseConfidence + 22;
    return clamp(Math.round(candidate), baseConfidence + 8, 95);
  }, [activeCompany?.potential_score, activeCompany?.projected_score, baseConfidence]);

  const confidenceLift = useMemo(
    () => clamp(confidenceTarget - baseConfidence, 8, 30),
    [baseConfidence, confidenceTarget],
  );

  const certaintyValue = useMemo(() => {
    const mojo = Number(activeCompany?.mojo_score ?? 0);
    if (mojo > 0) return `Mojo ${Math.round(mojo)}`;
    return `Mojo ${baseConfidence}`;
  }, [activeCompany?.mojo_score, baseConfidence]);

  const stageIndex = useMemo(() => {
    if (phase === "outside_signals" || phase === "validate_outside") return 0;
    if (phase === "diagnose" || phase === "validate_diagnose") return 1;
    if (phase === "focus" || phase === "validate_focus") return 2;
    return 3;
  }, [phase]);

  const stageStrip = useMemo(
    () => ["Outside Signals", "Diagnose", "Focus", "Flow"],
    [],
  );

  const strongestAction = topActions[0] ?? null;

  const commandActionTitle = useMemo(() => {
    const actionTitle = toSentence(strongestAction?.title);
    if (actionTitle) return actionTitle;

    const moveTitle = toSentence(nextMove?.title);
    if (moveTitle && moveTitle.toLowerCase() !== "in progress") return moveTitle;

    return actionHeadline;
  }, [actionHeadline, nextMove?.title, strongestAction?.title]);

  const commandActionSupport = useMemo(() => {
    const detail = toSentence(nextMove?.detail);
    if (detail && detail !== commandActionTitle) return detail;

    const supportParts: string[] = [];
    const constraintTitle = toSentence(primaryConstraint?.title);
    const desiredOutcome = toSentence(primaryDesiredOutcome?.statement);

    if (constraintTitle) supportParts.push(`Constraint: ${constraintTitle}.`);
    if (desiredOutcome) supportParts.push(`Target outcome: ${desiredOutcome}.`);

    return supportParts.join(" ");
  }, [commandActionTitle, nextMove?.detail, primaryConstraint?.title, primaryDesiredOutcome?.statement]);

  const routeOptions = useMemo(() => {
    const buckets: Record<RouteCategory, typeof allActions> = {
      Fix: [],
      Improve: [],
      Create: [],
    };

    allActions.forEach((action) => {
      buckets[action.category].push(action);
    });

    return ROUTE_ORDER.map((category) => {
      const lead = buckets[category][0] ?? null;
      return {
        category,
        count: buckets[category].length,
        available: buckets[category].length > 0,
        leadTitle: toSentence(lead?.title) || ROUTE_FALLBACK_HEADLINE[category],
        leadStatus: lead ? statusLabel(lead.status) : "No route",
        optionTitles: buckets[category].slice(0, 3).map((action) => toSentence(action.title)).filter(Boolean),
      };
    });
  }, [allActions]);

  const preferredRoute = useMemo<RouteCategory>(() => {
    if (strongestAction?.category) return strongestAction.category;
    const firstAvailable = routeOptions.find((route) => route.available);
    return firstAvailable ? firstAvailable.category : "Fix";
  }, [routeOptions, strongestAction?.category]);

  const selectedRouteOption = useMemo(
    () => routeOptions.find((route) => route.category === selectedMapRoute) ?? routeOptions[0],
    [routeOptions, selectedMapRoute],
  );

  const hoverRouteOption = useMemo(
    () =>
      hoveredMapRoute
        ? routeOptions.find((route) => route.category === hoveredMapRoute) ?? null
        : null,
    [hoveredMapRoute, routeOptions],
  );

  const mapActionHeadline = useMemo(
    () => selectedRouteOption?.leadTitle || actionHeadline,
    [actionHeadline, selectedRouteOption],
  );

  const routeHoverText = useCallback((category: RouteCategory) => {
    const route = routeOptions.find((item) => item.category === category);
    if (!route) return `${category} route`;
    if (!route.available) return `${category} route · no live options yet`;
    const options = route.optionTitles.length > 0
      ? route.optionTitles.map((item) => shorten(item, 56)).join(" • ")
      : shorten(route.leadTitle, 56);
    return `${category} route · ${route.count} option${route.count === 1 ? "" : "s"} · ${options}`;
  }, [routeOptions]);

  const evidencePresentLabels = useMemo(
    () => evidence.sources.filter((source) => source.present).map((source) => source.label),
    [evidence.sources],
  );

  const evidenceMissingLabels = useMemo(
    () => evidence.sources.filter((source) => !source.present).map((source) => source.label),
    [evidence.sources],
  );

  const criticalActionCount = useMemo(
    () => allActions.filter((item) => item.category === "Fix" || item.category === "Improve").length,
    [allActions],
  );

  const unownedCriticalCount = useMemo(
    () => allActions.filter((item) => (item.category === "Fix" || item.category === "Improve") && !item.isOwned).length,
    [allActions],
  );

  const plannedCriticalCount = useMemo(
    () => allActions.filter((item) => (item.category === "Fix" || item.category === "Improve") && item.status === "planned").length,
    [allActions],
  );

  const topAssumption = useMemo(
    () => toSentence(strongestAction?.assumptions?.[0]),
    [strongestAction?.assumptions],
  );

  const topOutcomeIfSolved = useMemo(
    () => toSentence(strongestAction?.ifSolved?.[0]),
    [strongestAction?.ifSolved],
  );

  const topSuccessCriterion = useMemo(
    () => toSentence(strongestAction?.successCriteria?.[0]),
    [strongestAction?.successCriteria],
  );

  const signalRows = useMemo(
    () => [
      { key: "Proof", value: `${Math.round(signalStrength.proof.value)} · ${signalStrength.proof.level.toUpperCase()}` },
      { key: "Ownership", value: `${Math.round(signalStrength.ownership.value)} · ${signalStrength.ownership.level.toUpperCase()}` },
      { key: "Execution", value: `${Math.round(signalStrength.execution.value)} · ${signalStrength.execution.level.toUpperCase()}` },
    ],
    [
      signalStrength.execution.level,
      signalStrength.execution.value,
      signalStrength.ownership.level,
      signalStrength.ownership.value,
      signalStrength.proof.level,
      signalStrength.proof.value,
    ],
  );

  const weakestSignalRow = useMemo(
    () =>
      [...signalRows].sort((a, b) => {
        const aValue = Number(a.value.split("·")[0]?.trim() || 0);
        const bValue = Number(b.value.split("·")[0]?.trim() || 0);
        return aValue - bValue;
      })[0] ?? null,
    [signalRows],
  );

  const drawerSections = useMemo<Record<DrawerKey, DrawerSection>>(
    () => {
      if (isEarlyPhase) {
        const diagHeadline  = diagnostic?.headline  || toSentence(primaryConstraint?.title) || "The picture is still forming.";
        const diagSubhead   = diagnostic?.subhead   || toSentence(primaryConstraint?.detail) || "More evidence is needed before a clear direction can be confirmed.";
        const diagObs       = diagnostic?.observations.filter(Boolean) ?? [];
        const diagTensions  = diagnostic?.tensions.filter(Boolean) ?? [];
        const diagMissing   = diagnostic?.missingEvidence.filter(Boolean) ?? [];
        const diagQuestions = diagnostic?.questionsToInvestigate.filter(Boolean) ?? [];
        const missingLabel  = diagMissing.length > 0
          ? diagMissing.slice(0, 3).join(" · ")
          : evidenceMissingLabels.length > 0 ? evidenceMissingLabels.join(", ") : "None identified";
        const nextLearning  = diagnostic?.recommendedNextLearningStep ?? null;

        return {
          why: {
            title: "WHAT WE'RE SEEING",
            headline: diagHeadline,
            big: diagSubhead,
            rows: [
              { key: "Pattern", value: diagObs.length > 0 ? diagObs[0] : (toSentence(primaryConstraint?.title) || "Still emerging") },
              { key: "Tensions", value: diagTensions.length > 0 ? diagTensions[0] : "None identified yet" },
              { key: "Evidence present", value: evidencePresentLabels.length > 0 ? evidencePresentLabels.join(", ") : "None captured yet" },
            ],
          },
          blocking: {
            title: "WHAT'S STILL MISSING",
            headline: diagMissing.length > 0 ? `${diagMissing.length} gap${diagMissing.length === 1 ? "" : "s"} flagged by analysis.` : evidenceMissingLabels.length > 0 ? `${evidenceMissingLabels.length} evidence type${evidenceMissingLabels.length === 1 ? "" : "s"} not yet captured.` : "No obvious evidence gap identified.",
            big: nextLearning || "These evidence types would materially sharpen the diagnosis.",
            compact: true,
            rows: [
              { key: "Missing", value: missingLabel },
              { key: "Proof signal", value: signalRows.find((r) => r.key === "Proof")?.value ?? "Not yet measured" },
            ],
          },
          signals: {
            title: "SIGNAL LEVELS",
            headline: weakestSignalRow ? `${weakestSignalRow.key} is the weakest signal right now.` : "Signal read not available.",
            compact: true,
            rows: [
              { key: "Missing evidence", value: evidenceMissingLabels.length > 0 ? evidenceMissingLabels.join(", ") : "No obvious gap" },
              { key: "Signal levels", value: signalRows.map((row) => `${row.key} ${row.value}`).join(" · ") },
            ],
          },
          progress: {
            title: "QUESTIONS TO INVESTIGATE",
            headline: diagQuestions.length > 0
              ? diagQuestions[0]
              : evidencePresentLabels.length > 0
                ? `${evidencePresentLabels.length} of ${evidencePresentLabels.length + evidenceMissingLabels.length} evidence types present`
                : "No evidence captured yet",
            compact: true,
            rows: [
              ...(diagQuestions.length > 1 ? [{ key: "Also", value: diagQuestions.slice(1, 3).join(" · ") }] : []),
              { key: "Present", value: evidencePresentLabels.length > 0 ? evidencePresentLabels.join(", ") : "None" },
              { key: "Missing", value: evidenceMissingLabels.length > 0 ? evidenceMissingLabels.join(", ") : "None" },
            ],
          },
        };
      }

      return {
        why: {
          title: "WHY THIS MOVE",
          headline: commandActionTitle || "This is the next move with the highest leverage right now.",
          big:
            toSentence(strongestAction?.whyItMatters) ||
            "This is the move most likely to improve the current decision path.",
          rows: [
            {
              key: "If this lands",
              value: topOutcomeIfSolved || "A clearer next action becomes possible.",
            },
            {
              key: "Success signal",
              value: topSuccessCriterion || `Confidence moves by +${confidenceLift}.`,
            },
            {
              key: "Owner",
              value: toSentence(strongestAction?.primaryOwner) || "Unassigned",
            },
          ],
        },
        blocking: {
          title: "WHAT IS BLOCKING",
          headline: toSentence(primaryConstraint?.title) || "Core blocker is still unresolved.",
          big: toSentence(primaryConstraint?.detail) || "No validated blocker statement has been captured yet.",
          compact: true,
          rows: [
            {
              key: "Assumption",
              value: topAssumption || "The key assumption has not been made explicit yet.",
            },
            {
              key: "Execution state",
              value:
                unownedCriticalCount > 0
                  ? `${unownedCriticalCount} of ${Math.max(1, criticalActionCount)} critical actions are unowned`
                  : plannedCriticalCount > 0
                    ? `${plannedCriticalCount} critical actions are still planned`
                    : "Critical work is already moving",
            },
          ],
        },
        signals: {
          title: "SIGNALS",
          headline:
            weakestSignalRow ? `${weakestSignalRow.key} is the weakest signal right now.` : "Signal read not available.",
          compact: true,
          rows: [
            {
              key: "Missing evidence",
              value: evidenceMissingLabels.length > 0 ? evidenceMissingLabels.join(", ") : "No obvious evidence gap",
            },
            {
              key: "Signal levels",
              value: signalRows.map((row) => `${row.key} ${row.value}`).join(" · "),
            },
          ],
        },
        progress: {
          title: "PROGRESS",
          headline: `${baseConfidence} → ${baseConfidence + confidenceLift} → ${confidenceTarget}`,
          compact: true,
          rows: [
            { key: "Movement", value: `${baseConfidence} → ${baseConfidence + confidenceLift} → ${confidenceTarget}` },
          ],
        },
      };
    },
    [
      isEarlyPhase,
      baseConfidence,
      confidenceLift,
      confidenceTarget,
      commandActionTitle,
      criticalActionCount,
      evidencePresentLabels,
      evidenceMissingLabels,
      primaryConstraint?.detail,
      primaryConstraint?.title,
      primaryDesiredOutcome?.leadingIndicator,
      primaryDesiredOutcome?.statement,
      strongestAction?.primaryOwner,
      strongestAction?.whyItMatters,
      plannedCriticalCount,
      signalRows,
      topAssumption,
      topOutcomeIfSolved,
      topSuccessCriterion,
      unownedCriticalCount,
      weakestSignalRow,
      diagnostic,
    ],
  );

  const combinedDrawerSections = useMemo(
    () => [drawerSections.why, drawerSections.blocking, drawerSections.signals, drawerSections.progress],
    [drawerSections],
  );

  const narrativeRows = useMemo(() => {
    const obs    = toSentence(primaryConstraint?.title);
    const detail = toSentence(primaryConstraint?.detail) || obs;
    const ifMissed = toSentence(strongestAction?.ifMissed?.[0]);

    // For early phases, prefer diagnostic data from Dify when available
    const diagObs     = diagnostic?.observations?.[0] ?? "";
    const diagObs2    = diagnostic?.observations?.[1] ?? "";
    const diagTension = diagnostic?.tensions?.[0] ?? "";
    const diagMissing = diagnostic?.missingEvidence?.[0] ?? "";
    const diagQ       = diagnostic?.questionsToInvestigate?.[0] ?? "";
    const diagImpl    = diagnostic?.possibleImplications?.[0] ?? "";

    if (phase === "outside_signals") {
      const row1 = diagObs  || obs    || "Outside signals are still forming";
      const row2 = diagObs2 || detail || "A second signal appears in the same area";
      const row3 = diagMissing || diagQ  || actionHeadline || "Still unclear what the company's own evidence shows";
      const row4 = diagTension || ifMissed || "Company or customer evidence would confirm or contradict this";
      return [
        { label: "What keeps appearing",         lead: "", emphasis: row1, tail: row1 === obs && !obs ? " — more signals needed." : "." },
        { label: "",                             lead: "", emphasis: row2, tail: diagObs2 ? "." : " — not yet confirmed." },
        { label: "What's still unclear",         lead: "", emphasis: row3, tail: ". Without that, this is a hypothesis." },
        { label: "What would sharpen confidence",lead: "", emphasis: row4, tail: "." },
      ].filter((r) => r.emphasis);
    }

    if (phase === "validate_outside") {
      const row1 = diagObs     || obs    || "The external signals are consistent enough to share";
      const row2 = diagTension || detail || "The outside read may not match how the company sees itself";
      const row3 = diagMissing || diagQ  || actionHeadline;
      const row4 = ifMissed || "The next phase starts from a shared understanding";
      return [
        { label: "What the outside view says", lead: "", emphasis: row1, tail: ". This is what the outside read looks like before the client weighs in." },
        { label: "Why it matters to check",    lead: "", emphasis: row2, tail: ". The client's reaction shapes what comes next." },
        { label: "What we haven't heard",      lead: "", emphasis: row3, tail: ". That's the gap this moment closes." },
        { label: "What changes if we get it",  lead: "", emphasis: row4, tail: ", not an untested assumption." },
      ];
    }

    if (phase === "diagnose") {
      const row1 = diagObs  || obs    || "A pattern is emerging but not yet confirmed";
      const row2 = diagObs2 || detail || "A second signal points in the same direction";
      const row3 = diagMissing || diagQ  || diagTension || actionHeadline || "Still unclear what would confirm or change this";
      const row4 = ifMissed || diagMissing || "Direct customer evidence would move this from likely to clear";
      const row5 = diagImpl || diagTension || "If this holds, the focus likely shifts to closing that gap";
      return [
        { label: "Why this is surfacing",        lead: "", emphasis: row1, tail: diagObs  ? "." : (obs ? "." : " — not yet confirmed.") },
        { label: "",                             lead: "", emphasis: row2, tail: diagObs2 ? "." : "." },
        { label: "What's still unclear",         lead: "", emphasis: row3, tail: "." },
        { label: "What would sharpen confidence",lead: "", emphasis: row4, tail: "." },
        { label: "Possible implication",         lead: "", emphasis: row5, tail: " — not a recommendation yet." },
      ].filter((r) => r.emphasis);
    }

    if (phase === "validate_diagnose") {
      const row1 = diagObs  || obs    || "A working direction is in place";
      const row2 = diagObs2 || detail || "A second signal reinforces it";
      const row3 = diagMissing || diagQ  || diagTension || actionHeadline || "Still unclear what would confirm or change this";
      const row4 = ifMissed || diagMissing || "Getting the client's read separates confirmed from still-open";
      const row5 = diagImpl || diagTension || "If confirmed, the next phase starts from a shared foundation";
      return [
        { label: "Why this is surfacing",        lead: "", emphasis: row1, tail: diagObs  ? "." : (obs ? " — some of it backed by evidence, some still assumed." : " — parts are still assumed.") },
        { label: "",                             lead: "", emphasis: row2, tail: diagObs2 ? "." : "." },
        { label: "What's still unclear",         lead: "", emphasis: row3, tail: " — that's what needs settling before the direction gets locked." },
        { label: "What would sharpen confidence",lead: "", emphasis: row4, tail: "." },
        { label: "Possible implication",         lead: "", emphasis: row5, tail: " — not a decision yet." },
      ].filter((r) => r.emphasis);
    }

    if (phase === "focus") return [
      { label: "What the evidence says",        lead: "", emphasis: obs    || "A clear direction has emerged",                   tail: obs ? ". This is the highest-leverage point the data has surfaced." : "." },
      { label: "Why this, not something else",  lead: "", emphasis: detail || "The evidence here is stronger than anywhere else", tail: ". That's the reason this is the focus." },
      { label: "The priority",                  lead: "", emphasis: actionHeadline,                                               tail: `. That's what moves the score from ${baseConfidence} toward ${confidenceTarget}.` },
      { label: "What would shift it",           lead: "", emphasis: ifMissed || "If the evidence changes, so does the direction — right now, it hasn't", tail: "." },
    ];

    if (phase === "validate_focus") return [
      { label: "What the evidence says",  lead: "", emphasis: obs    || "A direction has been chosen",       tail: obs ? ". Before locking in, it needs one more pass." : " — confirm it holds." },
      { label: "What needs to be true",   lead: "", emphasis: detail || "The route assumptions hold",        tail: ". If they do, execution starts from solid ground. If they don't, now is the time to know." },
      { label: "The last open question",  lead: "", emphasis: actionHeadline,                               tail: ". That's the one thing to confirm." },
      { label: "What happens if we skip", lead: "", emphasis: ifMissed || "Execution begins with an open assumption", tail: " — the kind that's expensive to discover mid-flow." },
    ];

    if (phase === "flow") return [
      { label: "What's in motion", lead: "", emphasis: obs    || "The route is in execution",                     tail: obs ? ". That's what the work is built around." : "." },
      { label: "Why it matters",   lead: "", emphasis: detail || "Keeping this visible keeps execution on track", tail: "." },
      { label: "The priority",     lead: "", emphasis: actionHeadline,                                           tail: ". That drives the outcome." },
      { label: "What to watch",    lead: "", emphasis: ifMissed || "If progress stalls without explanation, the assumptions need a look", tail: "." },
    ];

    // validate_flow
    return [
      { label: "What the data shows",     lead: "", emphasis: obs    || "Execution is in progress",         tail: obs ? ". Step back and check whether it's working." : " — step back and measure." },
      { label: "What to measure",         lead: "", emphasis: detail || "Results should be visible by now", tail: ". If they're flat, that's worth knowing." },
      { label: "The question",            lead: "", emphasis: actionHeadline,                              tail: ". That's what this moment is for." },
      { label: "What changes with drift", lead: "", emphasis: ifMissed || "The route gets examined, not abandoned", tail: " — small corrections here prevent larger ones later." },
    ];
  }, [
    actionHeadline,
    baseConfidence,
    confidenceTarget,
    diagnostic,
    phase,
    primaryConstraint?.detail,
    primaryConstraint?.title,
    strongestAction?.ifMissed,
  ]);

  const clearAsync = useCallback(() => {
    if (typingRef.current !== null) {
      window.clearInterval(typingRef.current);
      typingRef.current = null;
    }

    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const typeSystemLine = useCallback(
    (text: string, onDone?: () => void) => {
      if (typingRef.current !== null) {
        window.clearInterval(typingRef.current);
        typingRef.current = null;
      }

      setSystemLineOn(true);
      setSystemLine("");
      let index = 0;

      typingRef.current = window.setInterval(() => {
        index += 1;
        setSystemLine(text.slice(0, index));
        if (index >= text.length) {
          if (typingRef.current !== null) {
            window.clearInterval(typingRef.current);
            typingRef.current = null;
          }

          if (onDone) {
            later(onDone, 300);
          }
        }
      }, 22);
    },
    [later],
  );

  const animateConfidenceTo = useCallback((from: number, to: number, ms: number, onDone?: () => void) => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const start = performance.now();

    const tick = (now: number) => {
      const progress = clamp((now - start) / ms, 0, 1);
      const eased = 1 - (1 - progress) ** 3;
      setConfidenceTo(Math.round(from + (to - from) * eased));

      if (progress < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      rafRef.current = null;
      if (onDone) onDone();
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, []);

  const resetCommit = useCallback(() => {
    clearAsync();
    setCommitState("idle");
    setSystemLine("");
    setSystemLineOn(false);
    setConfidenceFrom(baseConfidence);
    setConfidenceTo(baseConfidence);
    setEvidenceChecks([false, false, false]);
  }, [baseConfidence, clearAsync]);

  const commitAgree = useCallback(
    (targetOverride?: number, messageOverride?: string) => {
      clearAsync();
      setCommitState("committing");
      setLayer("command");
      setDrawerKey(null);
      setEvidenceChecks([false, false, false]);
      setConfidenceFrom(baseConfidence);
      setConfidenceTo(baseConfidence);

      const target = clamp(targetOverride ?? baseConfidence + confidenceLift, baseConfidence + 1, 98);

      typeSystemLine("LOGGING COMMIT · RECOMPUTING", () => {
        animateConfidenceTo(baseConfidence, target, 900, () => {
          setCommitState("committed");
          const message = messageOverride || `CONFIDENCE ${baseConfidence} → ${target} · STAGE ${stageLabel(phase).toUpperCase()} ADVANCING`;
          typeSystemLine(message, () => {
            later(() => {
              setCommitState("next-revealed");
              setSystemLineOn(false);
            }, 700);
          });
        });
      });
    },
    [
      animateConfidenceTo,
      baseConfidence,
      clearAsync,
      confidenceLift,
      later,
      phase,
      typeSystemLine,
    ],
  );

  const commitDisagree = useCallback(() => {
    clearAsync();
    setCommitState("branching");
    setLayer("command");
    setDrawerKey(null);
    setEvidenceChecks([false, false, false]);
    setConfidenceFrom(baseConfidence);
    setConfidenceTo(baseConfidence);
    typeSystemLine("PATH BRANCHED · AWAITING ALTERNATIVE");
  }, [baseConfidence, clearAsync, typeSystemLine]);

  const commitNeedEvidence = useCallback(() => {
    clearAsync();
    setCommitState("waiting");
    setLayer("command");
    setDrawerKey(null);
    setConfidenceFrom(baseConfidence);
    setConfidenceTo(baseConfidence);
    setEvidenceChecks([false, false, false]);
    typeSystemLine("DECISION PAUSED · 3 CONDITIONS REQUESTED");
  }, [baseConfidence, clearAsync, typeSystemLine]);

  const resolveEvidence = useCallback(() => {
    if (commitState !== "waiting") return;

    [0, 1, 2].forEach((index) => {
      later(() => {
        setEvidenceChecks((current) => {
          const next = [...current];
          next[index] = true;
          return next;
        });

        if (index === 2) {
          later(() => {
            commitAgree(undefined, "EVIDENCE SATISFIED · COMMITTING NEXT MOVE");
          }, 500);
        }
      }, 500 + index * 600);
    });
  }, [commitAgree, commitState, later]);

  const selectBranch = useCallback(
    (lift: number) => {
      commitAgree(baseConfidence + lift, `ALT PATH COMMITTED · +${lift} CONF`);
    },
    [baseConfidence, commitAgree],
  );

  const openDrawer = useCallback((key: DrawerKey = "why") => {
    setDrawerKey(key);
    setLayer("drawer");
  }, []);

  const closeDrawer = useCallback(() => {
    if (layer !== "drawer") return;
    setLayer("command");
    setDrawerKey(null);
  }, [layer]);

  const onHotPhraseActivate = useCallback(
    (hint: DrawerKey) => {
      if (accessModes.inline) {
        openDrawer(hint);
        return;
      }
      setLayer("map");
    },
    [accessModes.inline, openDrawer],
  );

  const goToMainSite = useCallback(() => {
    navigate("/");
  }, [navigate]);

  const goToRoutesPreview = useCallback(() => {
    navigate(CLIENT_REFINE_PREVIEW_ROUTES_ROUTE);
  }, [navigate]);

  const goToWorkshop = useCallback(() => {
    navigate(CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE);
  }, [navigate]);

  const goToWorkshopInputs = useCallback(() => {
    const stage = (phase === "outside_signals" || phase === "validate_outside") ? "outside" : "org";
    navigate(`${CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE}?stage=${stage}`);
  }, [navigate, phase]);

  const showHoverTip = useCallback((event: ReactMouseEvent<HTMLElement>, text: string) => {
    const stageBounds = stageRef.current?.getBoundingClientRect();
    if (!stageBounds) return;

    setHoverTip({
      text,
      x: event.clientX - stageBounds.left + 14,
      y: event.clientY - stageBounds.top + 14,
    });
  }, []);

  const hideHoverTip = useCallback(() => {
    setHoverTip(null);
  }, []);

  const moveHoverTip = useCallback((event: ReactMouseEvent<HTMLElement>, text: string) => {
    showHoverTip(event, text);
  }, [showHoverTip]);

  useEffect(() => {
    try {
      const loaded = parseAccessModes(window.localStorage.getItem(MODE_STORAGE_KEY));
      setAccessModes(loaded);
    } catch {
      setAccessModes(DEFAULT_ACCESS_MODES);
    }
  }, []);

  useEffect(() => {
    const stored = {
      "mode-pills": accessModes.pills,
      "mode-inline": accessModes.inline,
      "mode-edge": accessModes.edge,
      "mode-footer": accessModes.footer,
    };

    window.localStorage.setItem(MODE_STORAGE_KEY, JSON.stringify(stored));
  }, [accessModes]);

  useEffect(() => {
    if (commitState === "idle") {
      setConfidenceFrom(baseConfidence);
      setConfidenceTo(baseConfidence);
    }
  }, [baseConfidence, commitState]);

  useEffect(() => {
    setSelectedMapRoute(preferredRoute);
  }, [activeCompany?.id, preferredRoute]);

  useEffect(() => {
    setLayer("command");
    setDrawerKey(null);
    setHoverTip(null);
    resetCommit();
  }, [activeCompany?.id, resetCommit]);

  useEffect(() => {
    if (layer !== "map") {
      setHoveredMapRoute(null);
      setHoverTip(null);
    }
  }, [layer]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const lower = event.key.toLowerCase();

      if (event.key === "Escape") {
        if (layer === "drawer") {
          closeDrawer();
          return;
        }
        setLayer("command");
        resetCommit();
        return;
      }

      if (lower === "m") {
        setLayer("map");
        setDrawerKey(null);
        return;
      }

      if (lower === "n") {
        setLayer("narrative");
        setDrawerKey(null);
        return;
      }

      if (event.key === "1") openDrawer("why");
      if (event.key === "2") openDrawer("blocking");
      if (event.key === "3") openDrawer("signals");
      if (event.key === "4") openDrawer("progress");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeDrawer, layer, openDrawer, resetCommit]);

  useEffect(() => () => clearAsync(), [clearAsync]);

  const currentDrawer = drawerKey ? drawerSections[drawerKey] : null;

  const stageClassName = [
    "crpv-stage",
    layer === "map" ? "state-map" : "",
    layer === "narrative" ? "state-narrative" : "",
    layer === "drawer" ? "state-drawer" : "",
    commitState !== "idle" ? commitState : "",
    accessModes.pills ? "mode-pills" : "",
    accessModes.inline ? "mode-inline" : "",
    accessModes.edge ? "mode-edge" : "",
    accessModes.footer ? "mode-footer" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const showStageStrip = commitState !== "idle";

  return (
      <section className="crpv-page">
        {!hasCompany ? (
          <article className="crpv-empty-state">
            <p className="cap">Client Refine Preview · Read-only</p>
            <h1>Select a company to preview the strict refine design.</h1>
            {companiesLoading ? (
              <p className="crpv-muted">Loading companies…</p>
            ) : companies.length > 0 ? (
              <div className="crpv-company-grid">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    className="crpv-company-button"
                    onClick={() => setActiveCompanyId(company.id)}
                  >
                    <span>{company.name}</span>
                    <small>
                      {company.quarter || "Quarter"} · {company.archetype || "Archetype"}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="crpv-muted">No companies available.</p>
            )}
          </article>
        ) : (
          <div ref={stageRef} className={stageClassName}>
            {analysisRunning && (
              <div className="crpv-analysis-bar" aria-hidden>
                <div className="crpv-analysis-bar-fill" />
              </div>
            )}
            <header className="crpv-header">
              <div className="left">
                <b>Mojo</b>
                <span className="cap">[{toSentence(activeCompany?.name) || "COMPANY"}] · DAY 52 · {stageLabel(phase).toUpperCase()}</span>
              </div>
              <div className="crpv-header-tools">
                {analysisRunning ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="cap" style={{ color: "#999" }}>
                      Analyzing{elapsedSeconds > 0 ? ` · ${elapsedSeconds}s` : "…"}
                    </span>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => { void cancelAnalysis(); }}
                      style={{ fontSize: 10, opacity: 0.6 }}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => { void runAnalysis(); }}
                  >
                    Run Analysis
                  </button>
                )}
                <button type="button" className="btn ghost" onClick={goToWorkshop}>Edit strategy →</button>
                <button type="button" className="btn ghost crpv-main-site-btn" onClick={goToRoutesPreview}>
                  Routes page
                </button>
                <button type="button" className="btn ghost crpv-main-site-btn" onClick={goToMainSite}>
                  ← Main site
                </button>
                <div className="cap" aria-live="polite">
                  {stateLabel(layer)}
                </div>
              </div>
            </header>

            {showStageStrip ? (
              <div className="crpv-stage-strip" aria-hidden>
                {stageStrip.map((item, index) => (
                  <span
                    key={item}
                    className={`s ${index < stageIndex ? "done" : ""} ${index === stageIndex ? "current" : ""}`.trim()}
                  >
                    {String(index + 1).padStart(2, "0")} · {item}
                  </span>
                ))}
              </div>
            ) : null}

            <section className="crpv-command-layer">
              {!commitState || commitState !== "next-revealed" ? (
                <div className="crpv-command-main">
                  {isEarlyPhase ? (
                    <>
                      <p className="cap">
                        {(phase === "diagnose" || phase === "validate_diagnose") ? "KEY TENSIONS" : "WHAT WE'RE SEEING"}
                      </p>

                      {diagnostic ? (
                        <>
                          <p className="crpv-action" role="status">
                            {diagnostic.headline || "The picture is still forming."}
                          </p>
                          {diagnostic.subhead && (
                            <p className="crpv-action-support">{diagnostic.subhead}</p>
                          )}
                          {!diagnostic.isAccepted && (
                            <p style={{ fontSize: 10, color: "#6E847F", fontFamily: '"JetBrains Mono", ui-monospace, monospace', textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 8 }}>
                              Working analysis · not yet accepted
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="crpv-action" role="status" style={{ opacity: 0.6 }}>
                          No diagnostic analysis has been run yet.
                        </p>
                      )}

                      <div className="crpv-secondary-links">
                        <button
                          type="button"
                          className="btn ghost"
                          data-go="narrative"
                          onClick={() => { setLayer("narrative"); setDrawerKey(null); }}
                        >
                          ✎ Full picture
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={goToRoutesPreview}
                        >
                          ⧉ Routes page
                        </button>
                        <button type="button" className="btn ghost" onClick={goToWorkshopInputs}>
                          Edit inputs →
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="cap">THE NEXT MOVE</p>

                      <p className="crpv-action" role="status">{commandActionTitle}</p>
                      {commandActionSupport ? <p className="crpv-action-support">{commandActionSupport}</p> : null}

                      <div className="crpv-meta-row">
                        <div
                          className="meta"
                          onClick={() => (accessModes.inline ? openDrawer("progress") : undefined)}
                          onMouseEnter={(event) => showHoverTip(event, "Estimated confidence lift after this action is complete.")}
                          onMouseMove={(event) => moveHoverTip(event, "Estimated confidence lift after this action is complete.")}
                          onMouseLeave={hideHoverTip}
                        >
                          <span className="cap">Impact</span>
                          <span className="v">{impactValue}</span>
                        </div>
                        <div
                          className="meta"
                          onClick={() => (accessModes.inline ? openDrawer("blocking") : undefined)}
                          onMouseEnter={(event) => showHoverTip(event, "Expected execution time and coordination load for this move.")}
                          onMouseMove={(event) => moveHoverTip(event, "Expected execution time and coordination load for this move.")}
                          onMouseLeave={hideHoverTip}
                        >
                          <span className="cap">Effort</span>
                          <span className="v">{effortValue}</span>
                        </div>
                        <div
                          className="meta"
                          onClick={() => (accessModes.inline ? openDrawer("signals") : undefined)}
                          onMouseEnter={(event) => showHoverTip(event, "How reliable the current evidence is for making this decision now.")}
                          onMouseMove={(event) => moveHoverTip(event, "How reliable the current evidence is for making this decision now.")}
                          onMouseLeave={hideHoverTip}
                        >
                          <span className="cap">Certainty</span>
                          <span className="v">{certaintyValue}</span>
                        </div>
                      </div>

                      {accessModes.pills ? (
                        <div className="crpv-pill-row">
                          <button type="button" className="pill" onClick={() => openDrawer()}>
                            <span className="dot" /> Decision context <span className="count">{combinedDrawerSections.length}</span>
                          </button>
                        </div>
                      ) : null}

                      <div className="crpv-cta-row">
                        <button type="button" className="btn primary" data-commit="agree" onClick={() => commitAgree()}>
                          ✓ Agree — do this
                        </button>
                        <button type="button" className="btn" data-commit="disagree" onClick={commitDisagree}>
                          Disagree
                        </button>
                        <button type="button" className="btn" data-commit="evidence" onClick={commitNeedEvidence}>
                          Need more evidence
                        </button>
                      </div>

                      <div className="crpv-secondary-links">
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={goToRoutesPreview}
                        >
                          ⧉ Routes page
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          data-go="map"
                          onClick={() => {
                            setLayer("map");
                            setDrawerKey(null);
                          }}
                        >
                          ◎ View Map
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          data-go="narrative"
                          onClick={() => {
                            setLayer("narrative");
                            setDrawerKey(null);
                          }}
                        >
                          ✎ Explain this decision
                        </button>
                        <button type="button" className="btn ghost" onClick={() => setLayer("narrative")}>
                          ↗ Share with team
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {showStageStrip ? (
                <div className="crpv-confidence-morph" aria-live="polite">
                  <span>{confidenceFrom}</span>
                  <span className="arrow">→</span>
                  <span>{confidenceTo}</span>
                  <small>{commitState === "waiting" ? "confidence · paused" : "confidence"}</small>
                </div>
              ) : null}

              {commitState === "committed" ? (
                <div className="crpv-commit-stamp">✓ COMMITTED · DAY 52 · 14:22</div>
              ) : null}

              {commitState === "branching" ? (
                <div className="crpv-branch-prompt">
                  <p className="cap">PATH BRANCHED · CHOOSE AN ALTERNATIVE</p>
                  <h2>Pick the best route and continue.</h2>
                  <div className="crpv-branch-options">
                    {BRANCH_OPTIONS.map((option) => (
                      <button key={option.id} type="button" className="crpv-branch-card" onClick={() => selectBranch(option.lift)}>
                        <span className="t">{option.title}</span>
                        <span className="d">{option.description}</span>
                        <span className="lift">
                          <span>+{option.lift} CONF</span>
                          <span>{option.duration}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {commitState === "waiting" ? (
                <div className="crpv-evidence-prompt">
                  <h4>Evidence conditions requested</h4>
                  {[
                    "Interview evidence linked to top need",
                    "Decision-owner confirmation captured",
                    "Execution support plan documented",
                  ].map((label, index) => (
                    <div key={label} className="check">
                      <div className={`box ${evidenceChecks[index] ? "on" : ""}`}>{evidenceChecks[index] ? "✓" : ""}</div>
                      <span className={evidenceChecks[index] ? "done" : ""}>{label}</span>
                      <span className="note">{evidenceChecks[index] ? "SATISFIED" : "REQUESTED"}</span>
                    </div>
                  ))}
                  <div className="actions">
                    <button type="button" className="btn" data-ev-resolve onClick={resolveEvidence}>
                      Resolve all
                    </button>
                    <button type="button" className="btn ghost" data-go="command-reset" onClick={resetCommit}>
                      Start over
                    </button>
                  </div>
                </div>
              ) : null}

              {commitState === "next-revealed" ? (
                <div className="crpv-next-move-reveal">
                  <p className="cap">NOW · THE NEXT MOVE AFTER THAT</p>
                  <p className="n">{toSentence(nextMove?.title) || "Run the next execution checkpoint."}</p>
                  <div className="meta">
                    <span>Owner · {toSentence(strongestAction?.primaryOwner) || "Unassigned"}</span>
                    <span>Timeline · {effortValue}</span>
                    <span>Lift · +{confidenceLift}</span>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn primary"
                      data-commit="agree2"
                      onClick={() => {
                        typeSystemLine("SECOND MOVE LOGGED · ROUTE UPDATED", () => {
                          later(() => {
                            setSystemLineOn(false);
                            setLayer("map");
                          }, 900);
                        });
                      }}
                    >
                      ✓ Do this next
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setLayer("map");
                        setDrawerKey(null);
                      }}
                    >
                      ◎ Show on map
                    </button>
                    <button type="button" className="btn ghost" onClick={resetCommit}>
                      ← Start over
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="crpv-map-layer">
              <div className="crpv-map-wrap">
                <svg viewBox="0 0 1440 620" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Decision map">
                  <defs>
                    <pattern id="crpv-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <line x1="0" y1="0" x2="0" y2="8" stroke="#111" strokeWidth="1" opacity="0.08" />
                    </pattern>
                  </defs>

                  {[120, 165, 210, 255, 300].map((radius) => (
                    <ellipse key={radius} cx="1050" cy="240" rx={radius} ry={radius * 0.58} fill="none" stroke="#e5e1d6" />
                  ))}
                  {[140, 190, 240].map((radius) => (
                    <ellipse key={`left-${radius}`} cx="380" cy="460" rx={radius} ry={radius * 0.58} fill="none" stroke="#e5e1d6" />
                  ))}

                  <polygon points="820,70 1440,0 1440,380 1120,300" fill="url(#crpv-hatch)" />

                  <path d="M 160 515 C 320 505, 420 450, 560 420 S 760 320, 880 300" fill="none" stroke="#111" strokeWidth="3" />
                  <path
                    d="M 880 300 C 960 280, 1040 230, 1120 200 S 1320 120, 1380 100"
                    fill="none"
                    stroke="#999"
                    strokeWidth="2"
                    strokeDasharray="2 10"
                    strokeLinecap="round"
                  />

                  {ROUTE_ORDER.map((category) => {
                    const route = routeOptions.find((item) => item.category === category);
                    const badge = MAP_ROUTE_BADGES[category];
                    const isSelected = selectedMapRoute === category;
                    const isHovered = hoveredMapRoute === category;
                    const isDimmed = hoveredMapRoute
                      ? hoveredMapRoute !== category && !isSelected
                      : !isSelected;
                    const routeMeta = route?.available ? `${route.count} options` : "No options";

                    return (
                      <g
                        key={category}
                        className={[
                          "crpv-map-route",
                          `route-${category.toLowerCase()}`,
                          isSelected ? "selected" : "",
                          isHovered ? "hovered" : "",
                          isDimmed ? "dimmed" : "",
                          route?.available ? "" : "empty",
                        ].join(" ").trim()}
                        onClick={() => setSelectedMapRoute(category)}
                        onMouseEnter={(event) => {
                          setHoveredMapRoute(category);
                          showHoverTip(event, routeHoverText(category));
                        }}
                        onMouseMove={(event) => {
                          moveHoverTip(event, routeHoverText(category));
                        }}
                        onMouseLeave={() => {
                          setHoveredMapRoute(null);
                          hideHoverTip();
                        }}
                      >
                        <path d={MAP_ROUTE_CURVES[category]} className="crpv-map-route-line" />
                        <path d={MAP_ROUTE_CURVES[category]} className="crpv-map-route-hit" />
                        <g transform={`translate(${badge.x}, ${badge.y})`} className="crpv-map-route-badge">
                          <rect x="0" y="-22" width="128" height="38" rx="8" />
                          <text x="12" y="-6" className="label">{category}</text>
                          <text x="12" y="10" className="meta">{routeMeta}</text>
                        </g>
                      </g>
                    );
                  })}

                  <g className="wp wp-start" onClick={() => setLayer("narrative")}>
                    <circle cx="160" cy="515" r="7" fill="#111" />
                    <text x="178" y="518" className="wp-label">Start</text>
                  </g>

                  <g className={`wp wp-current ${commitState !== "idle" ? "pulse" : ""}`} onClick={() => setLayer("narrative")}>
                    <circle cx="880" cy="300" r="26" fill="none" stroke="#111" strokeWidth="2" />
                    <circle cx="880" cy="300" r="9" fill="#111" />
                    <text x="815" y="268" className="wp-label">You are here</text>
                    <text x="842" y="338" className="wp-cap">CONF {confidenceTo}</text>
                  </g>

                  <g className="wp wp-next" onClick={() => setLayer("narrative")}>
                    <circle cx="1120" cy="200" r="26" fill="none" stroke="#777" strokeWidth="1.5" strokeDasharray="4 5" />
                    <line x1="1120" y1="186" x2="1120" y2="214" stroke="#111" strokeWidth="2" />
                    <line x1="1106" y1="200" x2="1134" y2="200" stroke="#111" strokeWidth="2" />
                    <text x="1080" y="170" className="wp-label">Next move →</text>
                  </g>

                  <g className="wp wp-desired" onClick={() => setLayer("narrative")}>
                    <rect x="1368" y="88" width="24" height="24" fill="#111" />
                    <text x="1310" y="78" className="wp-label">Desired</text>
                    <text x="1308" y="126" className="wp-cap">DESIRED {confidenceTarget}</text>
                  </g>
                </svg>
              </div>

              {hoverRouteOption ? (
                <aside className="crpv-map-hover-card" aria-live="polite">
                  <p className="cap">{hoverRouteOption.category} route</p>
                  <h3>
                    {hoverRouteOption.available
                      ? `${hoverRouteOption.count} option${hoverRouteOption.count === 1 ? "" : "s"}`
                      : "No live options"}
                  </h3>
                  {hoverRouteOption.optionTitles.length > 0 ? (
                    <ul>
                      {hoverRouteOption.optionTitles.slice(0, 3).map((item) => (
                        <li key={item}>{shorten(item, 64)}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty">{hoverRouteOption.leadTitle}</p>
                  )}
                </aside>
              ) : null}

              <div className="crpv-map-pin">
                <div className="crpv-map-route-row" role="tablist" aria-label="Route options">
                  {routeOptions.map((route) => (
                    <button
                      key={route.category}
                      type="button"
                      role="tab"
                      aria-selected={selectedMapRoute === route.category}
                      className={`crpv-map-route-pill ${selectedMapRoute === route.category ? "active" : ""}`.trim()}
                      onClick={() => setSelectedMapRoute(route.category)}
                    >
                      <span className="name">{route.category}</span>
                      <span className="meta">{route.available ? `${route.count} live` : "none"}</span>
                    </button>
                  ))}
                </div>
                <p>{mapActionHeadline}</p>
                <p className="crpv-map-route-note">
                  Chosen route: {selectedRouteOption?.category || preferredRoute} ·{" "}
                  {selectedRouteOption?.leadStatus || "No route"}
                </p>
                {hoverRouteOption ? (
                  <p className="crpv-map-route-note">
                    Hovering: {hoverRouteOption.category} ·{" "}
                    {hoverRouteOption.optionTitles.length > 0
                      ? hoverRouteOption.optionTitles.slice(0, 2).map((item) => shorten(item, 44)).join(" • ")
                      : hoverRouteOption.leadTitle}
                  </p>
                ) : null}
                <div className="actions">
                  <button type="button" className="btn primary" onClick={() => commitAgree()}>
                    ✓ Agree
                  </button>
                  <button type="button" className="btn" onClick={commitDisagree}>
                    Disagree
                  </button>
                  <button type="button" className="btn" onClick={() => setLayer("command") }>
                    ← Back
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setLayer("narrative") }>
                    ✎ Explain
                  </button>
                </div>
              </div>
            </section>

            <section className="crpv-narrative-layer">
              <div className="crpv-narrative-close">
                <button type="button" className="btn ghost" onClick={() => setLayer("command") }>
                  ← Back
                </button>
              </div>
              <div className="crpv-narrative-inner">
                <p className="cap crpv-narrative-cap">
                  THE DECISION, IN FULL · [{toSentence(activeCompany?.name) || "COMPANY"}] · DAY 52
                </p>
                {narrativeRows.map((item, i) => (
                  <div key={i} className="step">
                    <div className="n">{item.label}</div>
                    <p>
                      {item.lead}
                      <em>{item.emphasis}</em>
                      {item.tail}
                    </p>
                  </div>
                ))}
                <div className="crpv-narrative-cta">
                  {!isEarlyPhase && (
                    <button type="button" className="btn primary" onClick={() => commitAgree()}>
                      ✓ Commit
                    </button>
                  )}
                  <button type="button" className="btn" onClick={() => setLayer("map") }>
                    ◎ Show on map
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setLayer("command") }>
                    ← Back
                  </button>
                </div>
              </div>
            </section>

            <div className="crpv-edge-tabs">
              <button type="button" onClick={() => openDrawer()}>
                Decision Context
              </button>
            </div>

            {accessModes.footer ? (
              <div className="crpv-footer-drawers">
                <div className="left cap">DECISION CONTEXT</div>
                <div className="right">
                  <button type="button" className="btn ghost" onClick={() => openDrawer()}>
                    Open context
                  </button>
                </div>
              </div>
            ) : null}

            <button type="button" className="crpv-spec-toggle" onClick={() => setSpecOpen((value) => !value)}>
              {specOpen ? "▾ HIDE SPEC" : "▸ INTERACTION SPEC"}
            </button>
            <aside className={`crpv-spec-panel ${specOpen ? "open" : ""}`}>
              <h4>Layer stack</h4>
              <p>Command defaults. Map and Narrative are progressive disclosure layers. Drawers expose context on demand.</p>
              <h4>Keyboard</h4>
              <p>M map · N narrative · Esc command · 1-4 open context.</p>
              <h4>Commit model</h4>
              <p>Agree logs commit, Disagree branches alternatives, Need evidence pauses until checks are satisfied.</p>
            </aside>

            <div className="crpv-legend">
              <button type="button" className="crpv-main-link" onClick={goToMainSite}>
                ← MAIN SITE
              </button>
              <span className="sep">·</span>
              <span><span className="k">M</span> MAP</span>
              <span className="sep">·</span>
              <span><span className="k">N</span> NARRATIVE</span>
              <span className="sep">·</span>
              <span><span className="k">1-4</span> CONTEXT</span>
              <span className="sep">·</span>
              <span><span className="k">Esc</span> BACK</span>
            </div>

            <aside className={`crpv-tweaks ${tweaksOpen ? "open" : ""}`}>
              <div className="hdr">
                <span>{isAdmin ? "Admin Workbench" : "Tweaks · Drawer Access"}</span>
                <button type="button" className="x" onClick={() => setTweaksOpen(false)}>
                  ✕
                </button>
              </div>
              {isAdmin ? (
                <>
                  <div className="section">
                    <div className="crpv-tweaks-tabs">
                      {([
                        ["evidence", "Evidence"],
                        ["claims", "Claims"],
                        ["foundation", "Foundation"],
                        ["assumptions", "Assumptions"],
                        ["rerun", "Rerun"],
                        ["access", "Access"],
                      ] as Array<[TweakTab, string]>).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          className={`crpv-tweaks-tab ${tweakTab === key ? "active" : ""}`}
                          onClick={() => setTweakTab(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {tweakTab === "evidence" && (
                    <div className="section">
                      <div className="sect-title">Evidence state</div>
                      <div className="crpv-tweaks-stat">
                        <span>Preferred run</span>
                        <strong>
                          {baselineRun?.created_at ? new Date(baselineRun.created_at).toLocaleString() : "None"}
                        </strong>
                      </div>
                      <div className="crpv-tweaks-stat">
                        <span>Latest run</span>
                        <strong>
                          {latestBaselineRun?.created_at ? new Date(latestBaselineRun.created_at).toLocaleString() : "None"}
                        </strong>
                      </div>
                      <div className="crpv-tweaks-stat"><span>Outside signals</span><strong>{baselineLoading ? "…" : baselineSummary.outsideSignals}</strong></div>
                      <div className="crpv-tweaks-stat"><span>Evidence ledger</span><strong>{baselineLoading ? "…" : baselineSummary.evidenceLedger}</strong></div>
                      <div className="crpv-tweaks-stat"><span>Top hypotheses</span><strong>{baselineLoading ? "…" : baselineSummary.hypotheses}</strong></div>
                      <div className="crpv-tweaks-stat"><span>Open questions</span><strong>{baselineLoading ? "…" : baselineSummary.questions}</strong></div>
                      <div className="crpv-tweaks-note">{baselineSelectionReason}</div>
                      <div className="crpv-tweaks-list">
                        <div className="crpv-tweaks-list-item">
                          <div className="crpv-tweaks-list-meta">Signal posture</div>
                          <div className="crpv-tweaks-list-text">
                            Outside: {signalPosture.outside} · Organization: {signalPosture.organization} · Customer: {signalPosture.customer}
                          </div>
                        </div>
                        <div className="crpv-tweaks-list-item">
                          <div className="crpv-tweaks-list-meta">Safe to use now</div>
                          <div className="crpv-tweaks-list-text">{evidenceGuidance.usable}</div>
                        </div>
                        <div className="crpv-tweaks-list-item">
                          <div className="crpv-tweaks-list-meta">Needs revalidation</div>
                          <div className="crpv-tweaks-list-text">{evidenceGuidance.revalidate}</div>
                        </div>
                      </div>
                      <div className="crpv-tweaks-note">
                        Treat outside signals as market-facing evidence. Customer truth still needs direct validation when framing changes.
                      </div>
                    </div>
                  )}

                  {tweakTab === "claims" && (
                    <div className="section">
                      <div className="sect-title">Current claims</div>
                      {claimWorkbenchPreview.length === 0 ? (
                        <div className="crpv-tweaks-note">No framework claims available yet. Run analysis first.</div>
                      ) : (
                        <div className="crpv-tweaks-list">
                          {claimWorkbenchPreview.map((finding, index) => (
                            <div key={`${finding.framework}-${index}`} className="crpv-tweaks-list-item">
                              <div className="crpv-tweaks-list-meta">
                                {finding.framework} · {finding.mojoArea} · {finding.confidence} · {finding.supportLevel}
                              </div>
                              <div className="crpv-tweaks-list-text">{finding.claim}</div>
                              <div className="crpv-tweaks-list-sub">{finding.supportReason}</div>
                              {finding.evidence ? <div className="crpv-tweaks-list-sub">Evidence: {shorten(finding.evidence, 110)}</div> : null}
                              <div className="crpv-tweaks-list-sub">Next check: {finding.validationNote}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {tweakTab === "foundation" && (
                    <div className="section">
                      <div className="sect-title">Foundation read</div>
                      <div className="crpv-tweaks-note">
                        This is the current working foundation the command view is using. It is not the final truth. It is the best current read from the available evidence shape.
                      </div>
                      <div className="crpv-tweaks-list">
                        {foundationWorkbenchPreview.map((item) => (
                          <div key={item.area} className="crpv-tweaks-list-item">
                            <div className="crpv-tweaks-list-meta">{item.area} · {item.evidenceShape}</div>
                            <div className="crpv-tweaks-list-text">{item.statement}</div>
                            <div className="crpv-tweaks-list-sub">Next check: {item.nextCheck}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {tweakTab === "assumptions" && (
                    <div className="section">
                      <div className="sect-title">Assumptions</div>
                      <div className="crpv-tweaks-assumption-form">
                        <textarea
                          value={newAssumption}
                          onChange={(event) => setNewAssumption(event.target.value)}
                          placeholder="Add a testable what-must-be-true statement"
                          className="crpv-tweaks-textarea"
                        />
                        <button type="button" className="btn" onClick={() => void handleAddAssumption()} disabled={assumptionSaving}>
                          {assumptionSaving ? "Saving…" : "Add assumption"}
                        </button>
                      </div>
                      {assumptionsLoading ? (
                        <div className="crpv-tweaks-note">Loading assumptions…</div>
                      ) : assumptionWorkbenchPreview.length === 0 ? (
                        <div className="crpv-tweaks-note">No assumptions stored yet.</div>
                      ) : (
                        <div className="crpv-tweaks-list">
                          {assumptionWorkbenchPreview.slice(0, 8).map((assumption) => (
                            <div key={assumption.id} className="crpv-tweaks-list-item">
                              <div className="crpv-tweaks-list-text">{assumption.assumption}</div>
                              <div className="crpv-tweaks-list-meta">
                                {assumption.source} · {assumption.status}
                                {assumption.gates.length > 0 ? ` · gates ${assumption.gates.join(" · ")}` : ""}
                              </div>
                              <div className="crpv-tweaks-list-sub">{assumption.impact}</div>
                              {assumption.note ? <div className="crpv-tweaks-list-sub">Note: {assumption.note}</div> : null}
                              <div className="crpv-tweaks-chip-row">
                                {(["untested", "validating", "validated", "invalidated"] as const).map((status) => (
                                  <button
                                    key={status}
                                    type="button"
                                    className={`crpv-tweaks-chip ${assumption.status === status ? "active" : ""}`}
                                    disabled={assumptionUpdatingId === assumption.id}
                                    onClick={() => void setAssumptionStatus(assumption.id, status)}
                                  >
                                    {status}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {tweakTab === "rerun" && (
                    <div className="section">
                      <div className="sect-title">Rerun controls</div>
                      <div className="crpv-tweaks-note">
                        Scoped reruns are preferred here. Only the full analysis button rebuilds the broader diagnostic layer.
                      </div>
                      <button type="button" className="btn" onClick={() => void runOutsideSignals()}>
                        Refresh outside evidence
                      </button>
                      <button type="button" className="btn" onClick={() => void rerunFoundationScope()}>
                        Rebuild foundation + routes
                      </button>
                      <button type="button" className="btn" onClick={() => void rerunOdiJobMapScope()}>
                        Regenerate ODI job map
                      </button>
                      <button type="button" className="btn" onClick={() => void runAnalysis()} disabled={analysisRunning}>
                        {analysisRunning ? "Full analysis running…" : "Run full analysis"}
                      </button>
                      <button type="button" className="btn" onClick={() => void cancelAnalysis()} disabled={!analysisRunning}>
                        Cancel running analysis
                      </button>
                      <button type="button" className="btn" onClick={() => navigate(CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE)}>
                        Open workshop
                      </button>
                    </div>
                  )}

                  {tweakTab === "access" && (
                    <>
                      <div className="section">
                        <div className="sect-title">Access patterns</div>
                        <label className="tweak-toggle">
                          <span className="lbl">Pill row<span className="sub">Explicit chips under meta row</span></span>
                          <input
                            type="checkbox"
                            checked={accessModes.pills}
                            onChange={(event) =>
                              setAccessModes((prev) => ({ ...prev, pills: event.target.checked }))
                            }
                          />
                          <span className="sw" />
                        </label>
                        <label className="tweak-toggle">
                          <span className="lbl">Inline hot-phrase<span className="sub">Dashes open related drawer</span></span>
                          <input
                            type="checkbox"
                            checked={accessModes.inline}
                            onChange={(event) =>
                              setAccessModes((prev) => ({ ...prev, inline: event.target.checked }))
                            }
                          />
                          <span className="sw" />
                        </label>
                        <label className="tweak-toggle">
                          <span className="lbl">Right-edge tabs<span className="sub">Pinned vertical access</span></span>
                          <input
                            type="checkbox"
                            checked={accessModes.edge}
                            onChange={(event) =>
                              setAccessModes((prev) => ({ ...prev, edge: event.target.checked }))
                            }
                          />
                          <span className="sw" />
                        </label>
                        <label className="tweak-toggle">
                          <span className="lbl">Footer row<span className="sub">Bottom context strip</span></span>
                          <input
                            type="checkbox"
                            checked={accessModes.footer}
                            onChange={(event) =>
                              setAccessModes((prev) => ({ ...prev, footer: event.target.checked }))
                            }
                          />
                          <span className="sw" />
                        </label>
                      </div>
                      <div className="section">
                        <div className="sect-title">Navigation</div>
                        <button type="button" className="btn" onClick={goToMainSite}>
                          ← Main site
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="section">
                    <div className="sect-title">Access patterns</div>
                    <label className="tweak-toggle">
                      <span className="lbl">Pill row<span className="sub">Explicit chips under meta row</span></span>
                      <input
                        type="checkbox"
                        checked={accessModes.pills}
                        onChange={(event) =>
                          setAccessModes((prev) => ({ ...prev, pills: event.target.checked }))
                        }
                      />
                      <span className="sw" />
                    </label>
                    <label className="tweak-toggle">
                      <span className="lbl">Inline hot-phrase<span className="sub">Dashes open related drawer</span></span>
                      <input
                        type="checkbox"
                        checked={accessModes.inline}
                        onChange={(event) =>
                          setAccessModes((prev) => ({ ...prev, inline: event.target.checked }))
                        }
                      />
                      <span className="sw" />
                    </label>
                    <label className="tweak-toggle">
                      <span className="lbl">Right-edge tabs<span className="sub">Pinned vertical access</span></span>
                      <input
                        type="checkbox"
                        checked={accessModes.edge}
                        onChange={(event) =>
                          setAccessModes((prev) => ({ ...prev, edge: event.target.checked }))
                        }
                      />
                      <span className="sw" />
                    </label>
                    <label className="tweak-toggle">
                      <span className="lbl">Footer row<span className="sub">Bottom context strip</span></span>
                      <input
                        type="checkbox"
                        checked={accessModes.footer}
                        onChange={(event) =>
                          setAccessModes((prev) => ({ ...prev, footer: event.target.checked }))
                        }
                      />
                      <span className="sw" />
                    </label>
                  </div>
                  <div className="section">
                    <div className="sect-title">Navigation</div>
                    <button type="button" className="btn" onClick={goToMainSite}>
                      ← Main site
                    </button>
                  </div>
                </>
              )}
            </aside>

            <button type="button" className={`crpv-tweaks-fab ${tweaksOpen ? "hidden" : "visible"}`} onClick={() => setTweaksOpen(true)}>
              ⚙
            </button>

            <div className="crpv-scrim" onClick={closeDrawer} />

            <aside className="crpv-side-drawer" aria-hidden={layer !== "drawer"}>
              <button type="button" className="close" onClick={closeDrawer}>
                ✕ CLOSE
              </button>
              {currentDrawer ? (
                <>
                  <p className="cap">DECISION CONTEXT</p>
                  <h3>{commandActionTitle || currentDrawer.headline}</h3>
                  {commandActionSupport ? <p className="big">{commandActionSupport}</p> : null}
                  <div className="crpv-drawer-sections">
                    {combinedDrawerSections.map((section) => (
                      <section key={section.title} className={`crpv-drawer-section ${section.compact ? "compact" : ""}`.trim()}>
                        <div className="crpv-drawer-section-header">
                          <p className="cap">{section.title}</p>
                          {!section.compact ? <h4>{section.headline}</h4> : null}
                        </div>
                        {section.big ? <p className="big">{section.big}</p> : null}
                        <div className="rows">
                          {section.rows.map((row) => (
                            <div key={`${section.title}-${row.key}-${row.value}`} className="row">
                              <span className="label">{row.key}</span>
                              <span className="value">{row.value}</span>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </>
              ) : null}
            </aside>

            <div className={`crpv-system-line ${systemLineOn ? "on" : ""}`}>
              {systemLine}
              <span className="cursor" />
            </div>

            <div
              className={`crpv-waypoint-tooltip ${hoverTip ? "show" : ""}`}
              style={{
                left: `${hoverTip?.x ?? 0}px`,
                top: `${hoverTip?.y ?? 0}px`,
              }}
            >
              {hoverTip?.text || ""}
            </div>

          </div>
        )}
      </section>
  );
}
