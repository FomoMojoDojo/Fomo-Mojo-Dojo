"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type StartingMode = "Customer Truth first" | "Reality Reset first";
type CustomerTruthSignal = "Strong" | "Mixed" | "Weak";

type MojoSnapshot = {
  starting_mode: StartingMode;
  primary_friction: string;
  customer_truth_signal: CustomerTruthSignal;
  top_focus_areas: [string, string, string];
};

type MojoMapIntakePayload = {
  where_stuck: string;
  where_stuck_other: string;
  decision_slowdowns: string[];
  customer_confidence: string;
  last_customer_input: string;
  momentum_drag: string;
  momentum_drag_other: string;
  explicit_strategic_problem: string;
  desired_outcome: string;
  desired_outcome_other: string;
  success_definition: string;
  company_name: string;
  website_url: string;
  industry: string;
  notes: string;
  run_initial_public_signal_pass: boolean;
  mojo_snapshot: MojoSnapshot;
  submitted_at: string;
};

type QuizAnswers = Omit<MojoMapIntakePayload, "mojo_snapshot" | "submitted_at">;

type MojoMapQuizProps = {
  triggerLabel?: string;
  triggerClassName?: string;
  calendlyBaseUrl?: string;
};

const STORAGE_KEY = "mojomap_quiz_answers_v1";
const LAST_PAYLOAD_KEY = "mojomap_quiz_last_payload_v1";

const WHERE_STUCK_OPTIONS = [
  "We're busy, but progress feels slow for the amount of effort",
  "Priorities keep changing and we can't seem to align",
  "Customers aren't adopting the way we expected",
  "We're growing, but it feels fragile or chaotic",
  "We know something's off, but we can't name it yet",
  "Other",
] as const;

const DECISION_SLOWDOWN_OPTIONS = [
  "We don't have enough customer evidence",
  "Leaders disagree",
  "Ownership or decision rights aren't clear",
  "Everything feels important, so nothing gets chosen",
  "Incentives pull teams in different directions",
  "We move fast, then second-guess later",
] as const;

const CUSTOMER_CONFIDENCE_OPTIONS = [
  "Very confident",
  "Somewhat confident",
  "Not very confident",
  "We're guessing more than we'd like",
] as const;

const MOMENTUM_DRAG_OPTIONS = [
  "Unclear strategy",
  "Conflicting priorities",
  "Slow or political decisions",
  "Capability gaps or bottlenecks",
  "Messaging / positioning not landing",
  "Execution is messy even when direction is clear",
  "Something else",
] as const;

const DESIRED_OUTCOME_OPTIONS = [
  "Grow revenue",
  "Improve adoption",
  "Enter a new market",
  "Align the team",
  "Fix something that isn't working",
  "Other",
] as const;

const QUESTION_COUNT = 7;

const initialAnswers: QuizAnswers = {
  where_stuck: "",
  where_stuck_other: "",
  decision_slowdowns: [],
  customer_confidence: "",
  last_customer_input: "",
  momentum_drag: "",
  momentum_drag_other: "",
  explicit_strategic_problem: "",
  desired_outcome: "",
  desired_outcome_other: "",
  success_definition: "",
  company_name: "",
  website_url: "",
  industry: "",
  notes: "",
  run_initial_public_signal_pass: true,
};

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
};

const inferStartingMode = (answers: QuizAnswers): StartingMode => {
  const hasResetSignals =
    answers.decision_slowdowns.includes("Leaders disagree") ||
    answers.decision_slowdowns.includes("Ownership or decision rights aren't clear") ||
    answers.decision_slowdowns.includes("Incentives pull teams in different directions");

  return hasResetSignals ? "Reality Reset first" : "Customer Truth first";
};

const inferPrimaryFriction = (answers: QuizAnswers) => {
  if (answers.momentum_drag === "Something else" && answers.momentum_drag_other.trim()) {
    return answers.momentum_drag_other.trim();
  }
  if (answers.momentum_drag.trim()) return answers.momentum_drag;
  if (answers.where_stuck === "Other" && answers.where_stuck_other.trim()) {
    return answers.where_stuck_other.trim();
  }
  return answers.where_stuck || "Clarity and prioritization drift";
};

const inferCustomerTruthSignal = (answers: QuizAnswers): CustomerTruthSignal => {
  if (answers.customer_confidence === "Very confident") return "Strong";
  if (answers.customer_confidence === "Somewhat confident") return "Mixed";
  return "Weak";
};

const buildTopFocusAreas = (answers: QuizAnswers): [string, string, string] => {
  const areaFromStuckMap: Record<string, string> = {
    "We're busy, but progress feels slow for the amount of effort":
      "Reduce effort scatter: identify the one constraint slowing output most.",
    "Priorities keep changing and we can't seem to align":
      "Stabilize priorities: lock decision criteria and naming for what matters now.",
    "Customers aren't adopting the way we expected":
      "Reconnect with demand: verify the core customer problem before scaling execution.",
    "We're growing, but it feels fragile or chaotic":
      "Strengthen operating cadence so growth doesn't depend on constant firefighting.",
    "We know something's off, but we can't name it yet":
      "Make the invisible visible with a shared view of signal, risk, and decisions.",
    Other: "Turn the stated issue into a clear, testable strategic problem statement.",
  };

  const areaFromDragMap: Record<string, string> = {
    "Unclear strategy": "Translate strategy into practical weekly decisions and tradeoffs.",
    "Conflicting priorities": "Resolve priority conflicts by clarifying what gets protected and what gets paused.",
    "Slow or political decisions": "Tighten decision rights and speed up decision loops with explicit owners.",
    "Capability gaps or bottlenecks": "Target the highest-impact bottleneck before adding net new work.",
    "Messaging / positioning not landing": "Refine positioning against buyer reality and evidence, not assumptions.",
    "Execution is messy even when direction is clear":
      "Improve execution rhythm by sequencing work against a single north-star constraint.",
    "Something else": "Break the friction into root causes and choose one high-leverage first move.",
  };

  const areaFromCustomerSignalMap: Record<CustomerTruthSignal, string> = {
    Strong: "Use strong customer signal to sharpen prioritization and commit with confidence.",
    Mixed: "Close confidence gaps with focused customer signal in the next decision cycle.",
    Weak: "Rebuild customer truth quickly before major bets harden into roadmap commitments.",
  };

  const whereKey = answers.where_stuck || "Other";
  const dragKey = answers.momentum_drag || "Something else";
  const signalKey = inferCustomerTruthSignal(answers);

  return [
    areaFromStuckMap[whereKey] ?? areaFromStuckMap.Other,
    areaFromDragMap[dragKey] ?? areaFromDragMap["Something else"],
    areaFromCustomerSignalMap[signalKey],
  ];
};

const buildMojoSnapshot = (answers: QuizAnswers): MojoSnapshot => ({
  starting_mode: inferStartingMode(answers),
  primary_friction: inferPrimaryFriction(answers),
  customer_truth_signal: inferCustomerTruthSignal(answers),
  top_focus_areas: buildTopFocusAreas(answers),
});

const buildPayload = (answers: QuizAnswers): MojoMapIntakePayload => ({
  ...answers,
  website_url: normalizeUrl(answers.website_url),
  mojo_snapshot: buildMojoSnapshot(answers),
  submitted_at: new Date().toISOString(),
});

const normalizeCalendlyUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return parsed.toString();
  } catch {
    return "";
  }
};

export const buildCalendlyUrl = (baseUrl: string, payload: MojoMapIntakePayload) => {
  try {
    const normalized = normalizeCalendlyUrl(baseUrl);
    if (!normalized) return baseUrl;
    const url = new URL(normalized);

    // TODO: Confirm Calendly query parameter support with your final event setup.
    // TODO: If query prefills are unsupported, this URL still works as a clean fallback CTA.
    // The backend email still contains the full intake payload for prep.
    url.searchParams.set("name", payload.company_name);
    url.searchParams.set("a1", payload.explicit_strategic_problem.slice(0, 350));
    url.searchParams.set("a2", payload.mojo_snapshot.primary_friction.slice(0, 200));
    url.searchParams.set("a3", payload.mojo_snapshot.starting_mode);
    return url.toString();
  } catch {
    return baseUrl;
  }
};

const isLikelyCalendlyUrl = (value: string) => {
  try {
    const parsed = new URL(normalizeCalendlyUrl(value));
    return parsed.hostname.includes("calendly.com");
  } catch {
    return false;
  }
};

const buildCalendlyEmbedUrl = (baseUrl: string) => {
  const normalized = normalizeCalendlyUrl(baseUrl);
  if (!normalized) return baseUrl;
  try {
    const url = new URL(normalized);
    // Keep embed URL clean; profile pages can fail when prefill-style params are attached.
    url.searchParams.delete("name");
    url.searchParams.delete("a1");
    url.searchParams.delete("a2");
    url.searchParams.delete("a3");
    return url.toString();
  } catch {
    return baseUrl;
  }
};

const buildCalendlyIframeUrl = (embedUrl: string) => {
  const normalized = normalizeCalendlyUrl(embedUrl);
  if (!normalized) return embedUrl;
  try {
    const url = new URL(normalized);
    // Calendly's iframe embed hints.
    url.searchParams.set("embed_type", "Inline");
    url.searchParams.set("hide_gdpr_banner", "1");
    return url.toString();
  } catch {
    return embedUrl;
  }
};

export const buildPlainTextEmailBody = (payload: MojoMapIntakePayload) => {
  const focusAreas = payload.mojo_snapshot.top_focus_areas.map((item, index) => `${index + 1}. ${item}`).join("\n");
  return [
    `New MojoMap Pre-Diagnosis — ${payload.company_name}`,
    "",
    `Company: ${payload.company_name}`,
    `Website: ${payload.website_url}`,
    `Industry: ${payload.industry || "Not provided"}`,
    "",
    `Main strategic problem:`,
    payload.explicit_strategic_problem,
    "",
    `Desired outcome: ${payload.desired_outcome}${payload.desired_outcome_other ? ` (${payload.desired_outcome_other})` : ""}`,
    `Success definition: ${payload.success_definition || "Not provided"}`,
    "",
    `Where stuck: ${payload.where_stuck}${payload.where_stuck_other ? ` (${payload.where_stuck_other})` : ""}`,
    `What slows decisions: ${payload.decision_slowdowns.join("; ") || "Not provided"}`,
    `Customer confidence: ${payload.customer_confidence}`,
    `Last customer input: ${payload.last_customer_input || "Not provided"}`,
    `Biggest drag: ${payload.momentum_drag}${payload.momentum_drag_other ? ` (${payload.momentum_drag_other})` : ""}`,
    "",
    "MOJOMAP™:",
    `- Starting mode: ${payload.mojo_snapshot.starting_mode}`,
    `- Primary friction: ${payload.mojo_snapshot.primary_friction}`,
    `- Customer truth signal: ${payload.mojo_snapshot.customer_truth_signal}`,
    "- Top focus areas:",
    focusAreas,
    "",
    `Notes: ${payload.notes || "None"}`,
    `Run initial public signal pass: ${payload.run_initial_public_signal_pass ? "Yes" : "No"}`,
    `Timestamp: ${payload.submitted_at}`,
  ].join("\n");
};

export const buildHtmlEmailBody = (payload: MojoMapIntakePayload) => {
  const focusAreas = payload.mojo_snapshot.top_focus_areas.map((item) => `<li>${item}</li>`).join("");
  return `
    <h2>New MojoMap Pre-Diagnosis — ${payload.company_name}</h2>
    <p><strong>Company:</strong> ${payload.company_name}<br/>
    <strong>Website:</strong> ${payload.website_url}<br/>
    <strong>Industry:</strong> ${payload.industry || "Not provided"}</p>

    <h3>Main strategic problem</h3>
    <p>${payload.explicit_strategic_problem}</p>

    <h3>Desired outcome</h3>
    <p>${payload.desired_outcome}${payload.desired_outcome_other ? ` (${payload.desired_outcome_other})` : ""}<br/>
    <strong>Success definition:</strong> ${payload.success_definition || "Not provided"}</p>

    <h3>Inputs</h3>
    <p><strong>Where stuck:</strong> ${payload.where_stuck}${payload.where_stuck_other ? ` (${payload.where_stuck_other})` : ""}<br/>
    <strong>Decision slowdowns:</strong> ${payload.decision_slowdowns.join("; ") || "Not provided"}<br/>
    <strong>Customer confidence:</strong> ${payload.customer_confidence}<br/>
    <strong>Last customer input:</strong> ${payload.last_customer_input || "Not provided"}<br/>
    <strong>Biggest drag:</strong> ${payload.momentum_drag}${payload.momentum_drag_other ? ` (${payload.momentum_drag_other})` : ""}</p>

    <h3>MOJOMAP™</h3>
    <p><strong>Starting mode:</strong> ${payload.mojo_snapshot.starting_mode}<br/>
    <strong>Primary friction:</strong> ${payload.mojo_snapshot.primary_friction}<br/>
    <strong>Customer truth signal:</strong> ${payload.mojo_snapshot.customer_truth_signal}</p>
    <ul>${focusAreas}</ul>

    <p><strong>Notes:</strong> ${payload.notes || "None"}<br/>
    <strong>Run initial public signal pass:</strong> ${payload.run_initial_public_signal_pass ? "Yes" : "No"}<br/>
    <strong>Timestamp:</strong> ${payload.submitted_at}</p>
  `;
};

const QuestionBlock = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <div className="space-y-4">
    <div className="space-y-2">
      <h3 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h3>
      {subtitle ? <p className="text-sm text-slate-600 sm:text-base">{subtitle}</p> : null}
    </div>
    {children}
  </div>
);

export function MojoMapQuiz({
  triggerLabel = "See what's blocking your momentum",
  triggerClassName = "btn btn-primary",
  calendlyBaseUrl = "https://calendly.com/your-link/mojo-diagnostic",
}: MojoMapQuizProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>(initialAnswers);
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [submittedPayload, setSubmittedPayload] = useState<MojoMapIntakePayload | null>(null);
  const [showScheduler, setShowScheduler] = useState(false);
  const [stepError, setStepError] = useState("");
  const [submitErrorMessage, setSubmitErrorMessage] = useState("");
  const [calendlyLoading, setCalendlyLoading] = useState(false);
  const [calendlyError, setCalendlyError] = useState(false);
  const [calendlyErrorMessage, setCalendlyErrorMessage] = useState("");
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const strategicProblemRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as QuizAnswers;
      setAnswers((prev) => ({ ...prev, ...parsed }));
      const hasSavedProgress = Boolean(
        parsed.where_stuck ||
          parsed.decision_slowdowns.length ||
          parsed.customer_confidence ||
          parsed.momentum_drag ||
          parsed.explicit_strategic_problem ||
          parsed.desired_outcome ||
          parsed.company_name ||
          parsed.website_url,
      );
      if (hasSavedProgress) setHasStarted(true);
    } catch {
      // Ignore malformed persisted data.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  }, [answers]);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || submitState === "success") return;
    const timer = window.setTimeout(() => {
      if (step === 4 && strategicProblemRef.current) {
        strategicProblemRef.current.focus();
      } else {
        const node = sheetRef.current?.querySelector<HTMLElement>(
          "input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [role='checkbox']",
        );
        node?.focus();
      }
    }, 50);
    return () => window.clearTimeout(timer);
  }, [isOpen, step, submitState]);

  useEffect(() => {
    if (!isOpen || !showScheduler) return;
    setCalendlyLoading(false);
    setCalendlyError(false);
    setCalendlyErrorMessage("");

    if (!isLikelyCalendlyUrl(calendlyBaseUrl)) {
      setCalendlyError(true);
      setCalendlyErrorMessage(
        "Calendly URL is missing or invalid. Set NEXT_PUBLIC_SECONDARY_CTA_URL to your Calendly event link.",
      );
    }
  }, [isOpen, showScheduler, calendlyBaseUrl]);

  const progress = Math.round(((step + 1) / QUESTION_COUNT) * 100);

  const isStepValid = useMemo(() => {
    if (submitState === "success") return true;
    switch (step) {
      case 0:
        if (!answers.where_stuck) return false;
        if (answers.where_stuck === "Other" && !answers.where_stuck_other.trim()) return false;
        return true;
      case 1:
        return answers.decision_slowdowns.length > 0 && answers.decision_slowdowns.length <= 2;
      case 2:
        return Boolean(answers.customer_confidence);
      case 3:
        if (!answers.momentum_drag) return false;
        if (answers.momentum_drag === "Something else" && !answers.momentum_drag_other.trim()) return false;
        return true;
      case 4:
        return answers.explicit_strategic_problem.trim().length > 0;
      case 5:
        if (!answers.desired_outcome) return false;
        if (answers.desired_outcome === "Other" && !answers.desired_outcome_other.trim()) return false;
        return true;
      case 6:
        return Boolean(answers.company_name.trim()) && Boolean(answers.website_url.trim());
      default:
        return false;
    }
  }, [answers, step, submitState]);

  const updateAnswer = <K extends keyof QuizAnswers>(key: K, value: QuizAnswers[K]) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setStepError("");
    if (submitState === "error") {
      setSubmitState("idle");
      setSubmitErrorMessage("");
    }
  };

  const toggleSlowdown = (value: string) => {
    const selected = answers.decision_slowdowns;
    if (selected.includes(value)) {
      updateAnswer(
        "decision_slowdowns",
        selected.filter((item) => item !== value),
      );
      return;
    }
    if (selected.length >= 2) {
      setStepError("Choose up to two.");
      return;
    }
    updateAnswer("decision_slowdowns", [...selected, value]);
  };

  const autoResizeTextarea = (node: HTMLTextAreaElement | null) => {
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${node.scrollHeight}px`;
  };

  const onNext = async () => {
    if (!isStepValid) {
      setStepError("Please complete this question before continuing.");
      return;
    }
    if (step < QUESTION_COUNT - 1) {
      setStep((current) => current + 1);
      return;
    }

    setStepError("");
    setSubmitErrorMessage("");
    setSubmitState("loading");
    const payload = buildPayload(answers);

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(LAST_PAYLOAD_KEY, JSON.stringify(payload));
    }

    try {
      // Server route handles email delivery and optional downstream intake workflows.
      const response = await fetch("/api/mojomap-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;
      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error || "We couldn't submit your intake just now. Please try again or book directly.",
        );
      }

      setSubmittedPayload(payload);
      setShowScheduler(false);
      setSubmitState("success");
    } catch (error) {
      setSubmitErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "We couldn't submit your intake just now. Please try again or book directly.",
      );
      setSubmitState("error");
    }
  };

  const onBack = () => {
    if (step === 0 || submitState === "loading") return;
    setStep((current) => Math.max(0, current - 1));
    setStepError("");
  };

  const onRestart = () => {
    setAnswers(initialAnswers);
    setSubmitState("idle");
    setSubmittedPayload(null);
    setShowScheduler(false);
    setHasStarted(false);
    setStep(0);
    setStepError("");
    setSubmitErrorMessage("");
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  };

  const calendlyUrl = submittedPayload
    ? buildCalendlyUrl(calendlyBaseUrl, submittedPayload)
    : calendlyBaseUrl;
  const calendlyEmbedUrl = buildCalendlyEmbedUrl(calendlyBaseUrl);
  const calendlyIframeUrl = buildCalendlyIframeUrl(calendlyEmbedUrl);

  return (
    <>
      {/* Sample page wrapper trigger button */}
      <button type="button" className={triggerClassName} onClick={() => setIsOpen(true)}>
        {triggerLabel}
      </button>

      {isMounted
        ? createPortal(
            <AnimatePresence>
              {isOpen ? (
                <>
                  <motion.button
                    type="button"
                    aria-label="Close MojoMap quiz"
                    className="fixed inset-0 z-[190] bg-black/55 backdrop-blur-[3px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsOpen(false)}
                  />

                  <motion.section
                    ref={sheetRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label="MojoMap pre-diagnosis quiz"
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 28, stiffness: 320, mass: 0.85 }}
                    className="fixed inset-x-0 bottom-0 z-[191] mx-auto h-[90dvh] max-h-[90dvh] w-full max-w-4xl overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-[0_-24px_90px_rgba(0,0,0,0.45)] sm:h-[min(86dvh,56rem)] sm:max-h-[min(86dvh,56rem)] sm:rounded-t-[2rem]"
                  >
              <div className="flex h-full flex-col">
                <header className="border-b border-slate-200 px-5 py-3 sm:px-7 sm:py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-emerald-700/80">
                        MojoMap Pre-Diagnosis
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Close quiz"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-lg leading-none text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                      onClick={() => setIsOpen(false)}
                    >
                      ×
                    </button>
                  </div>

                  {submitState !== "success" && hasStarted ? (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-slate-500">
                        <span>
                          Question {step + 1} of {QUESTION_COUNT}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <motion.span
                          className="block h-full rounded-full bg-gradient-to-r from-teal-300/85 to-emerald-300/85"
                          animate={{ width: `${progress}%` }}
                          transition={{ duration: 0.25 }}
                        />
                      </div>
                    </div>
                  ) : null}
                </header>

                <div
                  className={
                    showScheduler
                      ? "flex-1 overflow-hidden"
                      : "flex-1 overflow-y-auto px-5 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-7 sm:py-6"
                  }
                >
                  <AnimatePresence mode="wait">
                    {submitState === "success" && submittedPayload ? (
                      showScheduler ? (
                        <motion.div
                          key="scheduler"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -16 }}
                          transition={{ duration: 0.24 }}
                          className="space-y-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <h3 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                              Schedule a 45 min MojoMap™ call
                            </h3>
                            <button
                              type="button"
                              onClick={() => setShowScheduler(false)}
                              className="text-sm font-medium text-slate-600 underline underline-offset-4 transition hover:text-slate-900"
                            >
                              Back to your MOJOMAP™
                            </button>
                          </div>
                          <div className="relative h-[min(60dvh,39rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            {calendlyLoading ? (
                              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
                                <p className="text-sm text-slate-600">Loading scheduler...</p>
                              </div>
                            ) : null}
                            <iframe
                              src={calendlyIframeUrl}
                              title="Calendly scheduler"
                              className="h-full w-full border-0"
                            />
                          </div>
                          {calendlyError ? (
                            <p className="rounded-xl border border-rose-300/40 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                              {calendlyErrorMessage ||
                                "We couldn&apos;t load the embedded scheduler here. Use the direct booking link below."}
                            </p>
                          ) : null}
                          <p className="text-xs text-slate-500">
                            If the embedded scheduler is blocked, use the direct link:{" "}
                            <a className="underline underline-offset-4" href={calendlyUrl} target="_blank" rel="noreferrer">
                              Open Calendly
                            </a>
                          </p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="result"
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -16 }}
                          transition={{ duration: 0.24 }}
                          className="space-y-5"
                        >
                          <div className="space-y-2">
                            <h3 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                              Here&apos;s what we&apos;re seeing
                            </h3>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Starting Point</p>
                              <p className="mt-2 text-lg font-semibold text-slate-900">
                                {submittedPayload.mojo_snapshot.starting_mode}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Primary Friction</p>
                              <p className="mt-2 text-lg font-semibold text-slate-900">
                                {submittedPayload.mojo_snapshot.primary_friction}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                                Customer Truth Signal
                              </p>
                              <p className="mt-2 text-lg font-semibold text-slate-900">
                                {submittedPayload.mojo_snapshot.customer_truth_signal}
                              </p>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-orange-400/45 bg-orange-500/10 p-4">
                            <p className="text-xs uppercase tracking-[0.16em] text-orange-700/90">
                              Your stated strategic problem
                            </p>
                            <p className="mt-2 text-base leading-relaxed text-orange-900 sm:text-lg">
                              {submittedPayload.explicit_strategic_problem}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                              What we&apos;d likely focus on first
                            </p>
                            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-800 sm:text-base">
                              {submittedPayload.mojo_snapshot.top_focus_areas.map((item) => (
                                <li key={item} className="flex gap-2">
                                  <span className="mt-1 text-emerald-500">•</span>
                                  <span>{item}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                              Public context we&apos;ll review
                            </p>
                            <p className="mt-2 text-sm leading-relaxed text-slate-800 sm:text-base">
                              We&apos;ll review your website, messaging, category cues, and other public signals so we
                              come prepared with the start of your MojoMap.
                            </p>
                          </div>

                        </motion.div>
                      )
                    ) : !hasStarted ? (
                      <motion.div
                        key="intro"
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -18 }}
                        transition={{ duration: 0.22 }}
                        className="mx-auto max-w-2xl space-y-5"
                      >
                        <h3 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                          Here&apos;s how this works
                        </h3>
                        <div className="space-y-3 text-sm leading-relaxed text-slate-700 sm:text-base">
                          <p>Answer a few quick questions about where momentum feels stuck.</p>
                          <p>We&apos;ll get your answers and review.</p>
                          <p>Book your 45-minute MojoMap™ call.</p>
                          <p>Then we&apos;ll turn your answers into the first version of your MOJOMAP™.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setHasStarted(true);
                            setStep(0);
                          }}
                          className="inline-flex items-center justify-center rounded-full border border-orange-300 bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-400"
                        >
                          Let&apos;s start
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div
                        key={`step-${step}`}
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -18 }}
                        transition={{ duration: 0.22 }}
                        className="space-y-5"
                      >
                        {step === 0 ? (
                          <QuestionBlock title="Where do you feel most stuck right now?">
                            <div className="space-y-2">
                              {WHERE_STUCK_OPTIONS.map((option) => (
                                <label
                                  key={option}
                                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition sm:text-base ${
                                    answers.where_stuck === option
                                      ? "border-emerald-300/80 bg-emerald-400/10 text-slate-900"
                                      : "border-slate-300 bg-white text-slate-800 hover:border-slate-500"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name="where_stuck"
                                    className="mt-1"
                                    checked={answers.where_stuck === option}
                                    onChange={() => updateAnswer("where_stuck", option)}
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                            {answers.where_stuck === "Other" ? (
                              <label className="block space-y-2">
                                <span className="text-sm text-slate-600">Describe it in your words</span>
                                <input
                                  type="text"
                                  value={answers.where_stuck_other}
                                  onChange={(event) => updateAnswer("where_stuck_other", event.target.value)}
                                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/75 sm:text-base"
                                />
                              </label>
                            ) : null}
                          </QuestionBlock>
                        ) : null}

                        {step === 1 ? (
                          <QuestionBlock title="What usually slows decisions down?">
                            <p className="text-sm text-slate-500">Select up to 2.</p>
                            <div className="space-y-2">
                              {DECISION_SLOWDOWN_OPTIONS.map((option) => {
                                const selected = answers.decision_slowdowns.includes(option);
                                const maxed = answers.decision_slowdowns.length >= 2 && !selected;
                                return (
                                  <button
                                    key={option}
                                    type="button"
                                    onClick={() => toggleSlowdown(option)}
                                    aria-pressed={selected}
                                    disabled={maxed}
                                    className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition sm:text-base ${
                                      selected
                                        ? "border-emerald-300/80 bg-emerald-400/10 text-slate-900"
                                        : "border-slate-300 bg-white text-slate-800 hover:border-slate-500"
                                    } ${maxed ? "cursor-not-allowed opacity-45" : ""}`}
                                  >
                                    {option}
                                  </button>
                                );
                              })}
                            </div>
                          </QuestionBlock>
                        ) : null}

                        {step === 2 ? (
                          <QuestionBlock
                            title="How confident are you that your team really understands customer needs right now?"
                          >
                            <div className="space-y-2">
                              {CUSTOMER_CONFIDENCE_OPTIONS.map((option) => (
                                <label
                                  key={option}
                                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition sm:text-base ${
                                    answers.customer_confidence === option
                                      ? "border-emerald-300/80 bg-emerald-400/10 text-slate-900"
                                      : "border-slate-300 bg-white text-slate-800 hover:border-slate-500"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name="customer_confidence"
                                    className="mt-1"
                                    checked={answers.customer_confidence === option}
                                    onChange={() => updateAnswer("customer_confidence", option)}
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                            <label className="block space-y-2">
                              <span className="text-sm text-slate-600">
                                What&apos;s the last real customer input you used to make a decision?
                              </span>
                              <textarea
                                rows={2}
                                value={answers.last_customer_input}
                                onChange={(event) => updateAnswer("last_customer_input", event.target.value)}
                                className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/75 sm:text-base"
                              />
                            </label>
                          </QuestionBlock>
                        ) : null}

                        {step === 3 ? (
                          <QuestionBlock title="What feels like the biggest drag on momentum today?">
                            <div className="space-y-2">
                              {MOMENTUM_DRAG_OPTIONS.map((option) => (
                                <label
                                  key={option}
                                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition sm:text-base ${
                                    answers.momentum_drag === option
                                      ? "border-emerald-300/80 bg-emerald-400/10 text-slate-900"
                                      : "border-slate-300 bg-white text-slate-800 hover:border-slate-500"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name="momentum_drag"
                                    className="mt-1"
                                    checked={answers.momentum_drag === option}
                                    onChange={() => updateAnswer("momentum_drag", option)}
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                            {answers.momentum_drag === "Something else" ? (
                              <label className="block space-y-2">
                                <span className="text-sm text-slate-600">Name it in your words</span>
                                <input
                                  type="text"
                                  value={answers.momentum_drag_other}
                                  onChange={(event) => updateAnswer("momentum_drag_other", event.target.value)}
                                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/75 sm:text-base"
                                />
                              </label>
                            ) : null}
                          </QuestionBlock>
                        ) : null}

                        {step === 4 ? (
                          <QuestionBlock
                            title="What is the main strategic problem you want solved?"
                            subtitle="Answer this in your own words. We'll use it to build the starting point for your MojoMap."
                          >
                            <label className="block">
                              <textarea
                                ref={strategicProblemRef}
                                rows={5}
                                required
                                placeholder={`Examples:\n- We're not sure which market to focus on\n- We have too many priorities and no clear direction\n- Customers aren't adopting and we don't know why\n- Our positioning is unclear and growth has stalled`}
                                value={answers.explicit_strategic_problem}
                                onChange={(event) => {
                                  updateAnswer("explicit_strategic_problem", event.target.value);
                                  autoResizeTextarea(event.currentTarget);
                                }}
                                className="w-full resize-none overflow-hidden rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-relaxed text-slate-900 outline-none transition focus:border-emerald-300/75 sm:text-base"
                              />
                            </label>
                          </QuestionBlock>
                        ) : null}

                        {step === 5 ? (
                          <QuestionBlock title="What outcome are you trying to achieve in the next 6–12 months?">
                            <div className="space-y-2">
                              {DESIRED_OUTCOME_OPTIONS.map((option) => (
                                <label
                                  key={option}
                                  className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition sm:text-base ${
                                    answers.desired_outcome === option
                                      ? "border-emerald-300/80 bg-emerald-400/10 text-slate-900"
                                      : "border-slate-300 bg-white text-slate-800 hover:border-slate-500"
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name="desired_outcome"
                                    className="mt-1"
                                    checked={answers.desired_outcome === option}
                                    onChange={() => updateAnswer("desired_outcome", option)}
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>

                            {answers.desired_outcome === "Other" ? (
                              <label className="block space-y-2">
                                <span className="text-sm text-slate-600">Tell us the outcome</span>
                                <input
                                  type="text"
                                  value={answers.desired_outcome_other}
                                  onChange={(event) => updateAnswer("desired_outcome_other", event.target.value)}
                                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/75 sm:text-base"
                                />
                              </label>
                            ) : null}

                            <label className="block space-y-2">
                              <span className="text-sm text-slate-600">What does success look like?</span>
                              <textarea
                                rows={2}
                                value={answers.success_definition}
                                onChange={(event) => updateAnswer("success_definition", event.target.value)}
                                className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/75 sm:text-base"
                              />
                            </label>
                          </QuestionBlock>
                        ) : null}

                        {step === 6 ? (
                          <QuestionBlock title="Help us prepare">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <label className="block space-y-2 sm:col-span-1">
                                <span className="text-sm text-slate-600">Company name *</span>
                                <input
                                  type="text"
                                  required
                                  value={answers.company_name}
                                  onChange={(event) => updateAnswer("company_name", event.target.value)}
                                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/75 sm:text-base"
                                />
                              </label>
                              <label className="block space-y-2 sm:col-span-1">
                                <span className="text-sm text-slate-600">Website URL *</span>
                                <input
                                  type="text"
                                  required
                                  value={answers.website_url}
                                  onChange={(event) => updateAnswer("website_url", event.target.value)}
                                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/75 sm:text-base"
                                />
                              </label>
                              <label className="block space-y-2 sm:col-span-2">
                                <span className="text-sm text-slate-600">Industry / market</span>
                                <input
                                  type="text"
                                  value={answers.industry}
                                  onChange={(event) => updateAnswer("industry", event.target.value)}
                                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/75 sm:text-base"
                                />
                              </label>
                              <label className="block space-y-2 sm:col-span-2">
                                <span className="text-sm text-slate-600">
                                  Anything else we should know before the conversation?
                                </span>
                                <textarea
                                  rows={3}
                                  value={answers.notes}
                                  onChange={(event) => updateAnswer("notes", event.target.value)}
                                  className="w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-emerald-300/75 sm:text-base"
                                />
                              </label>

                              <label className="flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 sm:col-span-2">
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  checked={answers.run_initial_public_signal_pass}
                                  onChange={(event) =>
                                    updateAnswer("run_initial_public_signal_pass", event.target.checked)
                                  }
                                />
                                <span className="text-sm text-slate-700">
                                  Run an initial public-information pass on our company before the call.
                                </span>
                              </label>
                            </div>
                          </QuestionBlock>
                        ) : null}

                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {submitState === "success" && showScheduler ? null : (
                  <footer className="border-t border-slate-200 px-5 py-4 sm:px-7">
                    {submitState === "error" ? (
                      <div className="mb-3 rounded-xl border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-700">
                        <p>{submitErrorMessage || "We couldn't submit your intake just now. Please try again or book directly."}</p>
                        <a
                          className="mt-1 inline-flex underline underline-offset-4"
                          href="mailto:dojocho@fomomojodojo.com"
                        >
                          Email dojocho@fomomojodojo.com
                        </a>
                      </div>
                    ) : null}

                    {submitState !== "success" ? (
                      hasStarted ? (
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={onBack}
                            disabled={step === 0 || submitState === "loading"}
                          >
                            Back
                          </button>
                          <div className="flex items-center gap-3">
                            {stepError ? <p className="text-xs text-rose-600 sm:text-sm">{stepError}</p> : null}
                            <button
                              type="button"
                              className="inline-flex items-center justify-center rounded-full border border-orange-300 bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-55"
                              onClick={() => {
                                void onNext();
                              }}
                              disabled={submitState === "loading"}
                            >
                              {submitState === "loading"
                                ? "Sending..."
                                : step === QUESTION_COUNT - 1
                                  ? "See your MOJOMAP™"
                                  : "Keep going"}
                            </button>
                          </div>
                        </div>
                      ) : null
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-full border border-orange-300 bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-400"
                            onClick={() => setShowScheduler(true)}
                          >
                            Schedule a 45 min MojoMap™ call
                          </button>
                          <button
                            type="button"
                            onClick={onRestart}
                            className="text-sm font-medium text-slate-600 underline underline-offset-4 transition hover:text-slate-900"
                          >
                            Start again
                          </button>
                        </div>
                        <p className="text-xs text-slate-500">
                          You&apos;re in. We&apos;ll come to your first call with the start of your MOJOMAP™.
                        </p>
                      </div>
                    )}
                  </footer>
                )}
              </div>
                  </motion.section>
                </>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}
