import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { FunctionsHttpError } from "@supabase/supabase-js";
import TopNav from "@/components/layout/TopNav";
import AiBoundaryNote from "@/components/AiBoundaryNote";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useJobSteps, type JobStepRow } from "@/hooks/useJobSteps";
import { useOdiNeeds, type OdiMarketDefinitionRow, type OdiNeedRow } from "@/hooks/useOdiNeeds";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useStrategicProblems } from "@/hooks/useStrategicProblems";
import { useInputs } from "@/hooks/useInputs";
import { useLatestLocalAlignment, useRunLocalAlignment } from "@/hooks/useLocalAlignment";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import type { InputItem, PositioningCanvas } from "@/lib/types";
import { opportunityActionFromNeedScore, opportunityActionTone } from "@/lib/opportunityLabels";
import {
  bestFitStrategicMarketCategory,
  buildMarketFitCheckpointSpine,
  buildMarketFitMapOption,
} from "@/lib/marketTaxonomy";
import {
  JTBD_CHECKPOINT_COUNT,
  JTBD_ODI_CHECKPOINTS,
  buildDefaultCheckpointSeed,
  deriveMarketDefinitionCanvas,
} from "@/lib/jtbdProcess";
import { MetaBadge, ScoreChip, StateBadge } from "@/components/ui/semantic-badges";
import SdsTerm from "@/components/ui/sds-term";
import PageContextStatus from "@/components/layout/PageContextStatus";
import { AreaAlignmentPanel } from "@/components/alignment/AreaAlignmentPanel";
import GenericAuditTraceNote from "@/components/diagnostics/GenericAuditTraceNote";
import { isGenericAuditCompany } from "@/lib/genericAudit";

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  card: "#ffffff",
  paper: "#FFFFFF",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  faint: "#C8D8CA",
  coral: "#FF7D2D",
  teal: "#5F9B8C",
  slate: "#233C4B",
  gap: "#FF7D2D",
  empty: "#E7EEDC",
  designedDot: "#7B8F66",
};

const STEP_CARD_WIDTH = "250px";
const STEP_DETAIL_BLOCK_HEIGHT = "96px";

type JourneyKey = string;

type JourneyGroup = {
  key: JourneyKey;
  title: string;
  subtitle: string;
  steps: JobStepRow[];
};

type SuggestedJourneyOption = {
  key: JourneyKey;
  title: string;
  subtitle: string;
  confidence: number;
  rationale: string;
};

type JourneyDraftMap = Record<string, { title: string; subtitle: string }>;

const JOURNEY_STYLE: Record<
  string,
  { rail: string; dot: string; preview?: string }
> = {
  customer: { rail: c.coral, dot: c.coral },
  revenue: { rail: c.teal, dot: c.teal, preview: "Project preview" },
  operations: { rail: c.slate, dot: c.slate },
};

function safeText(value: string | null | undefined, fallback = "") {
  return value?.trim() || fallback;
}

function isPublicSourcePath(sourcePath?: string | null) {
  return String(sourcePath || "").toLowerCase().includes("public");
}

function sourcePathLabel(sourcePath?: string | null) {
  const value = String(sourcePath || "").trim();
  if (!value) return "Unknown source";
  return isPublicSourcePath(value) ? `Public: ${value}` : `Uploaded/company: ${value}`;
}

function formatNeedScore(value: number | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function NeedActionBadge({ label }: { label: "Fix" | "Improve" | "Create" }) {
  const tone = opportunityActionTone(label);
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-[1px] font-mono text-[10px] uppercase tracking-[0.08em]"
      style={{ borderColor: tone.border, background: tone.bg, color: tone.fg }}
    >
      {label}
    </span>
  );
}

function normalizeAudienceSignal(value: string | null | undefined) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
    .trim();
  if (!normalized) return "";
  if (/^(unknown|n\/a|na|none|unset)$/i.test(normalized)) return "";
  return normalized;
}

function isGenericAudienceLabel(value: string | null | undefined) {
  const normalized = normalizeAudienceSignal(value).toLowerCase();
  if (!normalized) return true;
  return (
    normalized === "core audience" ||
    normalized === "audience" ||
    normalized === "target audience" ||
    normalized === "customer" ||
    normalized === "customers" ||
    normalized === "primary customer" ||
    normalized === "primary buyer" ||
    normalized === "user" ||
    normalized === "users" ||
    normalized === "buyer" ||
    normalized === "buyers" ||
    normalized === "progress" ||
    normalized === "customer progress" ||
    normalized === "job progress" ||
    normalized === "decision maker" ||
    normalized === "decision-maker" ||
    normalized === "unknown from public evidence" ||
    normalized === "unknown from uploaded evidence"
  );
}

function isLikelyJobActionLabel(value: string | null | undefined) {
  const normalized = normalizeAudienceSignal(value).toLowerCase();
  if (!normalized) return false;
  const hasRoleNoun = /\b(owner|manager|director|lead|officer|team|department|specialist|buyer|user|customer|consumer|operator|administrator|executive|committee|sponsor|partner|staff|organization|organisation|enterprise|company|client|debtor|creditor|collector|agent|analyst|founder|ceo|cfo|coo|vp|head)\b/.test(normalized);
  if (hasRoleNoun) return false;
  if (/^(getting|securing|converting|delivering|improving|optimizing|building|driving|increasing|reducing|achieving|executing|obtaining|winning|raising|funding|acquiring)\b/.test(normalized)) {
    return true;
  }
  if (/(financial investment|revenue outcomes|qualified demand|recurring economic outcomes)/.test(normalized)) {
    return true;
  }
  return false;
}

function isInvalidAudienceLabel(value: string | null | undefined) {
  return isGenericAudienceLabel(value) || isLikelyJobActionLabel(value);
}

function isGenericJtbdStatement(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes("when trying to complete this job") ||
    normalized.includes("move from defining outcomes to executing and monitoring progress") ||
    normalized === "understand and complete the core job progress for this offering"
  );
}

function isGenericJourneySubtitle(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes("how the primary job performer") ||
    normalized.includes("define, locate, prepare, execute, monitor, and conclude progress") ||
    normalized.includes("secures, converts, and retains economic value") ||
    normalized.includes("demand converts into sustained economic outcomes")
  );
}

function audienceFromJourneyTitle(title: string | null | undefined) {
  const raw = safeText(title, "");
  if (!raw) return "";
  const withoutMapPrefix = raw.replace(/^job\s*map\s*:\s*/i, "").trim();
  const withoutCustomerPrefix = withoutMapPrefix.replace(/^customer\s+/i, "").trim();
  const withoutJourneySuffix = withoutCustomerPrefix.replace(/\s+journey$/i, "").trim();
  const candidate = normalizeAudienceSignal(withoutJourneySuffix || withoutCustomerPrefix || withoutMapPrefix || raw);
  return isInvalidAudienceLabel(candidate) ? "" : candidate;
}

function jtbdFromJourneyTitle(title: string | null | undefined) {
  const audience = audienceFromJourneyTitle(title);
  if (!audience) return "";
  const lower = audience.toLowerCase();

  if (/(cafe|coffee|specialty venue|venue buyer)/.test(lower)) {
    return "When choosing and managing a coffee partner, cafe owners and specialty venue buyers want to secure consistent quality, reliable supply, and responsive support, so they can deliver a strong guest experience and protect margins.";
  }
  if (/(debt|collection|debtor|repayment|arrears|delinquen|past due)/.test(lower)) {
    return "When resolving outstanding debt, consumers want to understand options, choose a workable repayment path, and complete payments with confidence, so they can regain financial control with minimal stress.";
  }
  if (/(financial investment|investor|capital|funding|raise)/.test(lower)) {
    return `When seeking growth capital, ${lower} want to identify, evaluate, and win the right funding partner, so they can execute their strategy on workable terms.`;
  }
  if (/(donor|grant|philanthrop)/.test(lower)) {
    return `When securing mission funding, ${lower} want to win and retain aligned donors and grant partners, so they can sustain impact without constant funding risk.`;
  }

  return `When trying to complete this job, ${lower} want to move from defining outcomes to executing and monitoring progress, so they can achieve the intended result with less risk and rework.`;
}

function chooserFromJourneyTitle(title: string | null | undefined) {
  const audience = audienceFromJourneyTitle(title);
  const lower = audience.toLowerCase();
  if (!audience) return "";

  if (/(cafe|coffee|specialty venue|venue buyer)/.test(lower)) {
    return "Cafe owner, beverage lead, or venue operator";
  }
  if (/(financial investment|investor|capital|funding|raise)/.test(lower)) {
    return "CEO, CFO, or finance lead";
  }
  if (/(donor|grant|philanthrop)/.test(lower)) {
    return "Executive director, development lead, or board sponsor";
  }
  return audience;
}

function marketContextFromJourney(args: {
  title?: string | null;
  subtitle?: string | null;
  fallback?: string | null;
}) {
  const title = audienceFromJourneyTitle(args.title);
  const subtitleRaw = safeText(args.subtitle, "");
  const subtitle = isGenericJourneySubtitle(subtitleRaw) ? "" : subtitleRaw;
  const fallback = safeText(args.fallback, "");

  if (fallback) return fallback;
  if (title && subtitle) return `${title}: ${subtitle}`;
  if (subtitle) return subtitle;
  if (title) return title;
  return "";
}

function isTraditionalMarketDefinition(value: string | null | undefined) {
  const normalized = safeText(value, "").toLowerCase();
  if (!normalized) return false;
  if (/^\s*category\s*:/.test(normalized)) return true;
  return /^(b2b saas|b2c saas|marketplace|e-?commerce|professional services|healthcare services|financial services|education services|nonprofit services|hospitality \/ foodservice|logistics & transportation|manufacturing|public sector \/ government)$/.test(normalized);
}

function rankedNeedsByOpportunity(needs: OdiNeedRow[]) {
  return needs.slice().sort((a, b) => {
    const scoreDiff = (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const sortDiff = (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER);
    if (sortDiff !== 0) return sortDiff;
    return String(a.id).localeCompare(String(b.id));
  });
}

function normalizeClause(value: string | null | undefined) {
  const normalized = safeText(value, "").replace(/\.+$/g, "").trim();
  if (!normalized) return "";
  return normalized.charAt(0).toLowerCase() + normalized.slice(1);
}

function joinWithAnd(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function isGenericRoleLabel(value: string | null | undefined) {
  const normalized = safeText(value, "").toLowerCase();
  if (!normalized) return true;
  return (
    normalized === "primary job performer" ||
    normalized === "buying/decision lead" ||
    normalized === "buying or decision lead" ||
    normalized === "decision owner" ||
    normalized === "decision maker" ||
    normalized === "job performer" ||
    normalized === "customer" ||
    normalized === "customers"
  );
}

function trimToWordLimit(value: string | null | undefined, maxWords: number) {
  const normalized = safeText(value, "");
  if (!normalized) return "";
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return normalized.replace(/\s+/g, " ").trim();
  let trimmed = words.slice(0, maxWords);
  while (
    trimmed.length > 3 &&
    /^(a|an|the|to|for|with|by|and|or|of|on|in|that|which|who|using)$/i.test(trimmed[trimmed.length - 1] || "")
  ) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed.join(" ").replace(/\s+/g, " ").trim();
}

function stripLeadIn(value: string | null | undefined) {
  return safeText(value, "")
    .replace(/^(customers?|users?|teams?|organizations?|enterprises?|companies|clients)\s+can\s+/i, "")
    .replace(/^(for|to)\s+/i, "")
    .replace(/^the\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstClause(value: string | null | undefined) {
  const normalized = safeText(value, "");
  if (!normalized) return "";
  const sentence = normalized.split(/[.;:]/)[0] || normalized;
  const clause = sentence.split(/\b(that|who|which|while|because|so that|by using|using|via)\b/i)[0] || sentence;
  return safeText(clause, "");
}

function concisePhrase(value: string | null | undefined, options?: { maxWords?: number; fallback?: string; stripIntro?: boolean }) {
  const maxWords = options?.maxWords ?? 10;
  const fallback = options?.fallback ?? "";
  const base = firstClause(value);
  const stripped = options?.stripIntro ? stripLeadIn(base) : base;
  const compact = trimToWordLimit(stripped, maxWords);
  return compact || fallback;
}

function parseJtbdParts(value: string | null | undefined) {
  const text = safeText(value, "");
  if (!text) return null;
  const match = text.match(
    /when\s+(.+?)\s+needs\s+to\s+(.+?),\s*they\s+want\s+to\s+(.+?),\s*so\s+they\s+can\s+(.+?)(?:[.]|$)/i,
  );
  if (!match) return null;
  return {
    executor: safeText(match[1], ""),
    situation: safeText(match[2], ""),
    motivation: safeText(match[3], ""),
    outcome: safeText(match[4], ""),
  };
}

function normalizeFrameOfReference(frameCandidate: string | null | undefined) {
  const raw = safeText(frameCandidate, "");
  if (!raw) return "";
  const noLabel = raw.replace(/^\s*category\s*:\s*/i, "").trim();
  const beforeDelimiter = noLabel.split(/[;:]/)[0] || noLabel;
  const withoutFocusedOn = beforeDelimiter.split(/\bfocused on\b/i)[0] || beforeDelimiter;
  const compact = safeText(withoutFocusedOn, "");
  if (!compact) return "";

  const forParts = compact.split(/\s+for\s+/i).map((part) => safeText(part, "")).filter(Boolean);
  if (forParts.length <= 2) return compact;
  return `${forParts[0]} for ${forParts[1]}`;
}

function isOrganizationSegmentLabel(value: string | null | undefined) {
  const normalized = safeText(value, "").toLowerCase();
  if (!normalized) return true;
  const hasRoleNoun = /\b(owner|founder|director|head|vp|chief|officer|manager|lead|buyer|procurement|executive|partner|operator|coordinator|specialist|analyst|staff|agent|practitioner|admin|consultant|strategist)\b/.test(normalized);
  if (hasRoleNoun) return false;
  return /\b(organization|enterprise|business|company|client|customer|segment|market|teams|mid|large|small|smb)\b/.test(normalized);
}

function inferRolesFromSignals(args: {
  bestFitCustomers?: string | null;
  valueForCustomer?: string | null;
  marketContext?: string | null;
  needs: OdiNeedRow[];
}) {
  const topNeed = rankedNeedsByOpportunity(args.needs)[0];
  const signal = [
    safeText(args.bestFitCustomers, ""),
    safeText(args.valueForCustomer, ""),
    safeText(args.marketContext, ""),
    safeText(topNeed?.desired_outcome, ""),
    safeText(topNeed?.step_label, ""),
  ]
    .join(" ")
    .toLowerCase();

  if (/\b(strategy|strategic decision|decision framework|consulting|advisory)\b/.test(signal)) {
    return { executor: "Strategy lead", chooser: "Executive sponsor" };
  }
  if (/\bdebt|collection|repayment|delinquen|arrears\b/.test(signal)) {
    return { executor: "Repayment customer", chooser: "Collections manager" };
  }
  if (/\bcafe|coffee|restaurant|foodservice|venue\b/.test(signal)) {
    return { executor: "Operations lead", chooser: "Owner or general manager" };
  }
  if (/\binvestor|investment|capital|funding|raise\b/.test(signal)) {
    return { executor: "Finance lead", chooser: "CEO or founder" };
  }
  if (/\bdonor|grant|philanthrop|fundraising\b/.test(signal)) {
    return { executor: "Development lead", chooser: "Executive director" };
  }
  return { executor: "", chooser: "" };
}

function inferRoleFromBestFitCustomers(bestFitCustomers: string | null | undefined, options: { chooser: boolean }) {
  const text = safeText(bestFitCustomers, "");
  if (!text) return "";

  const candidates = text
    .split(/[,;/]|\band\b/gi)
    .map((part) => safeText(part, ""))
    .filter(Boolean)
    .slice(0, 8);

  if (options.chooser) {
    const chooserHit = candidates.find((part) =>
      /\b(owner|founder|director|head|vp|chief|officer|manager|lead|buyer|procurement|executive|partner)\b/i.test(part),
    );
    if (chooserHit) return chooserHit;
    const first = candidates[0] || "";
    return isOrganizationSegmentLabel(first) ? "" : first;
  }

  const executorHit = candidates.find((part) =>
    /\b(operator|coordinator|specialist|analyst|team|staff|rep|agent|manager|lead|practitioner|admin)\b/i.test(part),
  );
  if (executorHit) return executorHit;
  const first = candidates[0] || "";
  return isOrganizationSegmentLabel(first) ? "" : first;
}

function firstSpecificRole(...candidates: Array<string | null | undefined>) {
  const cleaned = candidates.map((value) => safeText(value, "")).filter(Boolean);
  for (const candidate of cleaned) {
    if (
      !isGenericRoleLabel(candidate) &&
      !isInvalidAudienceLabel(candidate) &&
      !isOrganizationSegmentLabel(candidate)
    ) {
      return candidate;
    }
  }
  return "";
}

function deriveBestGuessJtbd(args: {
  storedJtbd?: string | null;
  derivedJtbd?: string | null;
  executor?: string | null;
  needs: OdiNeedRow[];
  valueForCustomer?: string | null;
}) {
  const stored = safeText(args.storedJtbd, "");
  if (
    stored &&
    !isGenericJtbdStatement(stored) &&
    stored.length <= 200 &&
    /when\b.+\b(want|need)s?\b.+\bso\b.+\bcan\b/i.test(stored)
  ) {
    return stored.replace(/\s+/g, " ").trim();
  }

  const derived = safeText(args.derivedJtbd, "");
  if (
    derived &&
    !isGenericJtbdStatement(derived) &&
    derived.length <= 200 &&
    /when\b.+\b(want|need)s?\b.+\bso\b.+\bcan\b/i.test(derived)
  ) {
    return derived.replace(/\s+/g, " ").trim();
  }

  const rankedNeeds = rankedNeedsByOpportunity(args.needs);
  const topNeed = rankedNeeds[0];
  const topNeedOutcome = normalizeClause(topNeed?.desired_outcome);
  const topNeedStep = normalizeClause(topNeed?.step_label);
  const valueForCustomer = normalizeClause(args.valueForCustomer);
  const executor = safeText(args.executor, "the customer").toLowerCase();

  const situation = concisePhrase(valueForCustomer || topNeedOutcome || topNeedStep || "make progress on the core job", {
    maxWords: 7,
    stripIntro: true,
    fallback: "make progress on the core job",
  });
  const motivation = concisePhrase(topNeedOutcome || valueForCustomer || "achieve the desired outcome with less effort", {
    maxWords: 9,
    stripIntro: true,
    fallback: "achieve the desired outcome with less effort",
  });
  const outcome =
    concisePhrase(valueForCustomer && valueForCustomer !== motivation ? valueForCustomer : "", {
      maxWords: 9,
      stripIntro: true,
      fallback: "",
    }) ||
    "get reliable results with less risk";

  return `When ${executor} needs to ${situation}, they want to ${motivation}, so they can ${outcome}.`;
}

function deriveOdiDunfordMarketContext(args: {
  marketContext?: string | null;
  jobExecutor?: string | null;
  chooser?: string | null;
  jtbd?: string | null;
  needs: OdiNeedRow[];
  positioningCanvas?: PositioningCanvas | null;
}) {
  const marketContext = safeText(args.marketContext, "");
  const frameOfReference = safeText(args.positioningCanvas?.market_category, "");
  const bestFitCustomers = safeText(args.positioningCanvas?.best_fit_customers, "");
  const valueForCustomer = safeText(args.positioningCanvas?.value_for_customer, "");
  const topNeedOutcome = normalizeClause(rankedNeedsByOpportunity(args.needs)[0]?.desired_outcome);
  const jtbd = safeText(args.jtbd, "");
  const executor = safeText(args.jobExecutor, "primary job performer");
  const chooser = safeText(args.chooser, "buying or decision lead");
  const inferredRoles = inferRolesFromSignals({
    bestFitCustomers,
    valueForCustomer,
    marketContext,
    needs: args.needs,
  });

  const parsedJtbd = parseJtbdParts(jtbd);
  const frame = normalizeFrameOfReference(
    frameOfReference
      || (isTraditionalMarketDefinition(marketContext) ? marketContext : "")
      || marketContext,
  );
  const specificCustomerRole = firstSpecificRole(
    bestFitCustomers,
    inferredRoles.executor,
    parsedJtbd?.executor,
    chooser,
    executor,
  );
  const customers = safeText(
    specificCustomerRole,
    concisePhrase(bestFitCustomers, {
      maxWords: 6,
      stripIntro: true,
      fallback: safeText(inferredRoles.executor, safeText(executor, "target customers")),
    }),
  );
  const value = valueForCustomer || topNeedOutcome || "reliable progress on the core job";
  const coreJob = parsedJtbd?.situation || concisePhrase(valueForCustomer || topNeedOutcome || "", {
    maxWords: 7,
    stripIntro: true,
    fallback: "make progress on the core job",
  });
  const outcome = parsedJtbd?.outcome || concisePhrase(value, {
    maxWords: 8,
    stripIntro: true,
    fallback: "reliable strategic outcomes",
  });

  if (!frame && !jtbd && !valueForCustomer && !topNeedOutcome) {
    return marketContext;
  }

  const compactFrame = concisePhrase(frame || "Current market category", { maxWords: 6 });
  const compactCustomers = concisePhrase(customers, { maxWords: 6 });
  const compactJob = concisePhrase(coreJob, { maxWords: 7, stripIntro: true, fallback: "core job progress" });
  const compactOutcome = concisePhrase(outcome, { maxWords: 8, stripIntro: true, fallback: "reliable strategic outcomes" });
  return `${compactFrame}: ${compactCustomers} trying to ${compactJob}, so they can ${compactOutcome}.`;
}

function isDraftPlaceholderStep(step: JobStepRow) {
  const basis = safeText(step.evidence_basis, "").toLowerCase();
  return (
    step.evidence_status === "unclear" &&
    Number(step.evidence_confidence ?? 0) <= 25 &&
    basis.includes("local draft step generated without external model run")
  );
}

function hasAssessedGap(step: JobStepRow) {
  return Boolean(step.has_gap) && !isDraftPlaceholderStep(step);
}

function normalizeJourneyKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function titleFromKey(key: JourneyKey) {
  if (key === "customer") return "Customer Journey";
  if (key === "revenue") return "Revenue Journey";
  if (key === "operations") return "Operations Journey";
  return `${titleCaseFromKey(key)} Journey`;
}

function subtitleFromKey(key: JourneyKey) {
  if (key === "customer") return "How a customer experiences the end-to-end service.";
  if (key === "revenue") return "How the company secures and grows revenue.";
  if (key === "operations") return "How the company builds and operates the service.";
  return `How ${titleCaseFromKey(key).toLowerCase()} progress through the work from start to finish.`;
}

function titleCaseFromKey(key: string) {
  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Custom Journey";
}

function fallbackStyleForJourney(key: string) {
  const palette = [
    { rail: c.coral, dot: c.coral },
    { rail: c.teal, dot: c.teal },
    { rail: c.slate, dot: c.slate },
    { rail: "#A0C382", dot: "#A0C382" },
    { rail: "#FAC846", dot: "#FAC846" },
  ];
  const hash = Array.from(key).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

async function describeJobMapInvokeError(error: unknown) {
  const maybeContext = (() => {
    if (!error || typeof error !== "object") return null;
    const candidate = (error as { context?: { text?: () => Promise<string> } }).context;
    if (!candidate || typeof candidate.text !== "function") return null;
    return candidate;
  })();

  if (error instanceof FunctionsHttpError || maybeContext) {
    const payloadText = await (maybeContext?.text?.() ?? Promise.resolve("")).catch(() => "");
    const payload = (() => {
      if (!payloadText) return null;
      try {
        return JSON.parse(payloadText) as {
          error?: string;
          status?: string;
          message?: string;
        };
      } catch {
        return null;
      }
    })();

    const status = String(payload?.status || "");
    if (status === "job_map_selection_required") {
      return "Choose at least one checkpoint map, then run research.";
    }
    if (status === "customer_job_map_required") {
      return "Include a customer checkpoint map so opportunities can anchor to the primary job performer.";
    }

    return String(payload?.message || payload?.error || payloadText || error.message);
  }

  return error instanceof Error ? error.message : String(error);
}

function shouldUseLocalMapFallback(message: string) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("missing openai_api_key") ||
    text.includes("missing openai") ||
    text.includes("openai") && text.includes("non-2xx") ||
    text.includes("edge function returned a non-2xx status code") ||
    text.includes("public baseline is not strong enough") ||
    text.includes("evidence check blocked") ||
    text.includes("insufficient_public_evidence") ||
    text.includes("ambiguous_public_evidence") ||
    text.includes("customer_job_map_required")
  );
}

function shouldAttemptBaselineRetry(message: string) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("baseline review needed") ||
    text.includes("public baseline") ||
    text.includes("insufficient_public_evidence") ||
    text.includes("ambiguous_public_evidence") ||
    text.includes("not enough extractable evidence")
  );
}

function isMissingTableError(message: string, tableName: string) {
  const text = String(message || "").toLowerCase();
  const table = String(tableName || "").toLowerCase();
  return (
    (text.includes("could not find the table") && text.includes(table)) ||
    (text.includes(table) && text.includes("schema cache"))
  );
}

class InvokeTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvokeTimeoutError";
  }
}

async function invokeFunctionWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new InvokeTimeoutError(
              "Map generation is still running in the background. This can take a few minutes for full evidence-backed generation.",
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const LOCAL_ODI_STEP_SEED = buildDefaultCheckpointSeed().map((checkpoint) => ({
  label: checkpoint.step_label,
  description: checkpoint.description,
}));

function checkpointSeedForJourneyKey(journeyKey: string) {
  const normalizedKey = normalizeJourneyKey(journeyKey);
  if (normalizedKey.startsWith("market-fit-")) {
    const categoryKey = normalizedKey.replace(/^market-fit-/, "");
    const marketSeed = buildMarketFitCheckpointSpine(categoryKey);
    if (marketSeed.length === JTBD_CHECKPOINT_COUNT) return marketSeed;
  }
  return LOCAL_ODI_STEP_SEED;
}

function groupJourneys(items: JobStepRow[]): JourneyGroup[] {
  const byKey = new Map<string, JobStepRow[]>();
  for (const item of items) {
    const key = safeText(item.journey_key, "").toLowerCase();
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(item);
  }

  const preferredOrder = ["customer", "revenue", "operations"];
  const orderedKeys = [
    ...preferredOrder.filter((key) => byKey.has(key)),
    ...Array.from(byKey.keys())
      .filter((key) => !preferredOrder.includes(key))
      .sort((a, b) => a.localeCompare(b)),
  ];

  return orderedKeys.map((key) => {
    const steps = (byKey.get(key) ?? []).slice().sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
    const first = steps[0];
    return {
      key,
      title: safeText(first?.journey_title, key === "customer" || key === "revenue" || key === "operations" ? titleFromKey(key) : `Checkpoint Map: ${titleCaseFromKey(key)}`),
      subtitle: safeText(first?.journey_subtitle, key === "customer" || key === "revenue" || key === "operations" ? subtitleFromKey(key) : `How ${titleCaseFromKey(key).toLowerCase()} define, prepare, execute, monitor, and improve progress.`),
      steps,
    };
  });
}

function normalizeRoleLabel(value: string) {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
    .trim();
  if (!cleaned) return "Primary Job Performer";
  return cleaned;
}

function deriveAbstractedExecutor(executor: string) {
  const normalized = safeText(executor, "Primary job performer");
  const lower = normalized.toLowerCase();
  if (/(director|manager|lead|officer|head|vp|chief|owner|founder|coordinator|specialist)/.test(lower)) {
    return "Decision owner";
  }
  if (/(customer|client|buyer|user|member|consumer|participant)/.test(lower)) {
    return "Primary job performer";
  }
  if (/(team|department|organization|organisation|company|staff)/.test(lower)) {
    return "Operating team";
  }
  return "Primary job performer";
}

function deriveFunctionOfProductStatement(jtbd: string, executor: string) {
  const trimmed = safeText(jtbd, "");
  if (!trimmed) {
    return `Help ${safeText(executor, "the job performer").toLowerCase()} make progress with less risk and rework.`;
  }
  const wantMatch = trimmed.match(/\bwant to\b(.*?)(?:,\s*so they can| so they can|$)/i);
  if (wantMatch?.[1]) {
    const clause = wantMatch[1].replace(/^[\s,:-]+|[\s,:-]+$/g, "");
    if (clause) {
      return `Help ${safeText(executor, "the job performer").toLowerCase()} ${clause}.`;
    }
  }
  return trimmed;
}

function deriveAbstractedJobStatement(jtbd: string, abstractedExecutor: string) {
  const trimmed = safeText(jtbd, "");
  if (!trimmed) {
    return `${abstractedExecutor} can complete the core job reliably with clear evidence of progress.`;
  }
  const soMatch = trimmed.match(/\bso they can\b(.*?)(?:\.|$)/i);
  if (soMatch?.[1]) {
    const outcomeClause = soMatch[1].replace(/^[\s,:-]+|[\s,:-]+$/g, "");
    if (outcomeClause) {
      return `${abstractedExecutor} can ${outcomeClause}.`;
    }
  }
  return trimmed;
}

function deriveOtherProductsContext(marketContext: string, needs: OdiNeedRow[]) {
  const context = safeText(marketContext, "");
  if (context) {
    return `Compared against current alternatives in this market context: ${context}`;
  }
  const topNeed = needs
    .slice()
    .sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))[0];
  if (topNeed?.step_label) {
    return `Compared against existing ways teams currently handle "${topNeed.step_label}".`;
  }
  return "Compared against existing alternatives customers use to complete the same job.";
}

type OtherProductsContextGroup = {
  alternative: string;
  context: string;
  comparisonPressure: string;
};

function deriveOtherProductsContextGroups(args: {
  marketContext?: string | null;
  needs: OdiNeedRow[];
  positioningCanvas?: PositioningCanvas | null;
}): OtherProductsContextGroup[] {
  const context = safeText(args.marketContext, "");
  const topNeed = rankedNeedsByOpportunity(args.needs)[0];
  const pressure =
    normalizeClause(topNeed?.desired_outcome) ||
    "reliable progress on the core job with less risk and rework";

  const alternatives = (args.positioningCanvas?.competitive_alternatives ?? [])
    .map((entry) => ({
      name: safeText(entry.name, ""),
      description: safeText(entry.description, ""),
    }))
    .filter((entry) => Boolean(entry.name));

  if (alternatives.length > 0) {
    return alternatives.map((entry) => ({
      alternative: entry.name,
      context: entry.description || "No detailed context captured yet for this alternative.",
      comparisonPressure: pressure,
    }));
  }

  if (context) {
    return [
      {
        alternative: "Current market alternatives",
        context,
        comparisonPressure: pressure,
      },
    ];
  }

  if (topNeed?.step_label) {
    return [
      {
        alternative: "Current workaround options",
        context: `Teams currently patch together ways to handle "${topNeed.step_label}".`,
        comparisonPressure: pressure,
      },
    ];
  }

  return [
    {
      alternative: "Existing alternatives",
      context: "Customers use current alternatives to complete the same job.",
      comparisonPressure: pressure,
    },
  ];
}

function deriveExecutorDetermination(args: {
  activeCustomerJourneyTitle?: string | null;
  marketDefinitionExecutor?: string | null;
  marketDefinitionChooser?: string | null;
}) {
  const titleExecutor = audienceFromJourneyTitle(args.activeCustomerJourneyTitle);
  const storedExecutor = safeText(args.marketDefinitionExecutor, "");
  const chooser = safeText(args.marketDefinitionChooser, "");

  const notes: string[] = [];
  if (titleExecutor) notes.push(`Customer map title suggests "${titleExecutor}".`);
  if (storedExecutor) notes.push(`Strategic Decision System market row currently stores "${storedExecutor}".`);
  if (chooser) notes.push(`Chooser context: "${chooser}".`);
  return notes.join(" ");
}

function inferRevenueMapTitle(economicEngine: string, publicSignalText: string, allowNonprofitFunding: boolean) {
  const text = `${economicEngine} ${publicSignalText}`.toLowerCase();
  if (/(investment|investor|capital|funding|raise)/.test(text)) {
    return "Checkpoint Map: Getting Financial Investment";
  }
  if (allowNonprofitFunding && /(donor|grant|philanthrop|fundraising)/.test(text)) {
    return "Checkpoint Map: Securing Donor and Grant Support";
  }
  if (/(referral|pipeline|conversion|enrollment)/.test(text)) {
    return "Checkpoint Map: Converting Qualified Demand";
  }
  return "Checkpoint Map: Securing Revenue Outcomes";
}

function inferSuggestedJourneyOptions(args: {
  baselineRun: { result_json?: unknown } | null;
  journeys: JourneyGroup[];
  inputs: InputItem[];
  strategicProblems: Array<{ statement: string; status?: string; source?: string }>;
  whereToPlay?: string | null;
  howToWin?: string | null;
}): SuggestedJourneyOption[] {
  const existingJourneyKeys = new Set(args.journeys.map((journey) => journey.key));
  const baseline = args.baselineRun?.result_json as {
    lens_card?: {
      primary_buyer?: string;
      chooser?: string;
      user?: string;
      value_chain?: string;
      economic_engine?: string;
      adoption_constraints?: string;
      risk_surface?: string;
    };
    evidence_ledger?: Array<{ bucket?: string; snippet?: string }>;
  } | null;

  const lens = baseline?.lens_card ?? {};
  const ledger = Array.isArray(baseline?.evidence_ledger) ? baseline.evidence_ledger : [];

  const uploadedSignalText = args.inputs
    .flatMap((input) => [
      input.input_label,
      input.sub_group,
      input.description,
      input.why_it_matters,
      ...input.files.flatMap((file) => [file.file_name, ...(file.tags ?? [])]),
    ])
    .join(" ")
    .toLowerCase();
  const strategicProblemText = args.strategicProblems
    .map((item) => String(item?.statement || ""))
    .join(" ")
    .toLowerCase();

  const publicSignalText = [
    String(lens.value_chain || ""),
    String(lens.economic_engine || ""),
    String(lens.adoption_constraints || ""),
    String(lens.risk_surface || ""),
    ...ledger.slice(0, 14).map((entry) => `${String(entry?.bucket || "")} ${String(entry?.snippet || "")}`),
    String(args.whereToPlay || ""),
    String(args.howToWin || ""),
    uploadedSignalText,
    strategicProblemText,
  ]
    .join(" ")
    .toLowerCase();

  const marketSignalText = [
    String(lens.user || ""),
    String(lens.primary_buyer || ""),
    String(lens.chooser || ""),
    String(lens.value_chain || ""),
    String(args.whereToPlay || ""),
    String(args.howToWin || ""),
    strategicProblemText,
  ]
    .join(" ")
    .toLowerCase();
  const nonprofitSignalText = [
    String(lens.value_chain || ""),
    String(lens.economic_engine || ""),
    String(args.whereToPlay || ""),
    String(args.howToWin || ""),
    strategicProblemText,
  ]
    .join(" ")
    .toLowerCase();
  const hasNonprofitFundingSignal = /\b(nonprofit|charity|foundation|mission|philanthrop|donor|grant|fundraising)\b/.test(nonprofitSignalText);
  const hasCommercialMarketSignal = /\b(saas|software|telecom|enterprise|b2b|subscription|arr|contract|procurement|retail|cafe|restaurant|venue)\b/.test(nonprofitSignalText);
  const allowDonorGrantRevenueMap = hasNonprofitFundingSignal && !hasCommercialMarketSignal;

  const fileSignals = args.inputs.flatMap((input) =>
    input.files.map((file) => ({
      fileName: String(file.file_name || ""),
      tags: (file.tags ?? []).map((tag) => String(tag || "")),
    })),
  );

  const matchingProblemSnippets = (matcher: RegExp) =>
    args.strategicProblems
      .map((problem) => String(problem?.statement || "").trim())
      .filter((statement) => matcher.test(statement))
      .map((statement) => statement.split(/\n+/)[0].trim())
      .filter(Boolean)
      .slice(0, 2);

  const matchingFileSnippets = (matcher: RegExp) =>
    fileSignals
      .map((file) => `${file.fileName} ${file.tags.join(" ")}`.trim())
      .filter((snippet) => matcher.test(snippet))
      .map((snippet) => snippet.split(/\s+/).slice(0, 10).join(" "))
      .slice(0, 2);

  const countMatches = (terms: string[]) =>
    terms.reduce((sum, term) => (publicSignalText.includes(term) ? sum + 1 : sum), 0);

  const options: SuggestedJourneyOption[] = [];
  const addOption = (option: SuggestedJourneyOption) => {
    if (existingJourneyKeys.has(option.key)) return;
    if (options.some((item) => item.key === option.key)) return;
    options.push(option);
  };

  if (!existingJourneyKeys.has("customer")) {
    const customerSignalRaw = safeText(lens.user || lens.primary_buyer || lens.chooser, "");
    const normalizedCustomerSignal = normalizeAudienceSignal(customerSignalRaw);
    const customerSignal = normalizedCustomerSignal && !isInvalidAudienceLabel(normalizedCustomerSignal)
      ? normalizeRoleLabel(normalizedCustomerSignal)
      : "Primary Job Performer";
    addOption({
      key: "customer",
      title: `Checkpoint Map: ${customerSignal}`,
      subtitle: `How ${customerSignal.toLowerCase()} define, locate, prepare, execute, monitor, and conclude progress.`,
      confidence: normalizedCustomerSignal && !isInvalidAudienceLabel(normalizedCustomerSignal) ? 95 : 80,
      rationale: normalizedCustomerSignal && !isInvalidAudienceLabel(normalizedCustomerSignal)
        ? `Public signal identifies primary job performer context: ${normalizedCustomerSignal}`
        : "Customer checkpoint map is required first and should define the core functional job performer.",
    });
  }

  if (!existingJourneyKeys.has("revenue")) {
    const revenueMatches = countMatches([
      "revenue",
      "pricing",
      "contract",
      "renewal",
      "payer",
      "reimbursement",
      "referral",
      "pipeline",
      "conversion",
    ]);
    const nonprofitRevenueMatches = allowDonorGrantRevenueMap
      ? countMatches(["donor", "fundraising", "grant", "philanthrop"])
      : 0;
    const revenueSignalScore = revenueMatches + nonprofitRevenueMatches;
    const economicEngine = safeText(lens.economic_engine, "");
    const hasEconomicSignal =
      economicEngine.length > 0 && economicEngine.toLowerCase() !== "unknown";

    if (revenueSignalScore >= 2 || hasEconomicSignal) {
      const revenueTitle = inferRevenueMapTitle(economicEngine, publicSignalText, allowDonorGrantRevenueMap);
      addOption({
        key: "revenue",
        title: revenueTitle,
        subtitle: "How the company secures, converts, and retains economic value for the chosen market.",
        confidence: Math.min(92, 50 + revenueSignalScore * 8 + (hasEconomicSignal ? 12 : 0)),
        rationale: hasEconomicSignal
          ? `Public signal in economic engine: ${economicEngine}`
          : "Public signals suggest monetization, funding, or referral conversion dynamics.",
      });
    }
  }

  if (!existingJourneyKeys.has("operations")) {
    const operationsMatches = countMatches([
      "operations",
      "delivery",
      "capacity",
      "workflow",
      "staffing",
      "compliance",
      "quality",
      "handoff",
      "throughput",
      "support",
      "service continuity",
    ]);
    const adoptionConstraints = safeText(lens.adoption_constraints, "");
    const riskSurface = safeText(lens.risk_surface, "");
    const hasOpsSignal =
      (adoptionConstraints.length > 0 && adoptionConstraints.toLowerCase() !== "unknown") ||
      (riskSurface.length > 0 && riskSurface.toLowerCase() !== "unknown");

    if (operationsMatches >= 2 || hasOpsSignal) {
      addOption({
        key: "operations",
        title: "Checkpoint Map: Delivering Consistent Service",
        subtitle: "How delivery systems coordinate define, prepare, execute, monitor, and adjust work at quality.",
        confidence: Math.min(92, 50 + operationsMatches * 8 + (hasOpsSignal ? 10 : 0)),
        rationale: hasOpsSignal
          ? `Public signal in constraints/risk: ${safeText(adoptionConstraints || riskSurface)}`
          : "Public signals suggest delivery, quality, or operational coordination risk.",
      });
    }
  }

  const audienceCandidates = new Set<string>();
  const baselineRoleCandidates = [lens.user, lens.primary_buyer, lens.chooser]
    .map((value) => normalizeAudienceSignal(String(value || "")))
    .filter((value) => Boolean(value) && !isInvalidAudienceLabel(value))
    .map((value) => normalizeRoleLabel(value));
  for (const role of baselineRoleCandidates) {
    audienceCandidates.add(role);
  }
  if (/\binvestor|investment committee|capital partner\b/.test(marketSignalText)) {
    audienceCandidates.add("Investors and Investment Committee");
  }
  if (/\bchannel partner|distribution partner|reseller|procurement lead\b/.test(marketSignalText)) {
    audienceCandidates.add("Channel and Distribution Partners");
  }

  for (const candidate of audienceCandidates) {
    const key = `customer-${candidate.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)}`;
    const roleMatcher = new RegExp(candidate.split(/\s+/).slice(0, 3).join("|"), "i");
    const candidateEvidence = [
      ...matchingProblemSnippets(roleMatcher).map((source) => `Problem: ${source}`),
      ...matchingFileSnippets(roleMatcher).map((source) => `File: ${source}`),
    ].slice(0, 3);
    const rationale = candidateEvidence.length > 0
      ? `Derived from uploaded/client evidence: ${candidateEvidence.join(" • ")}`
      : "Derived from baseline role signals and market context.";
    addOption({
      key,
      title: `Checkpoint Map: ${candidate}`,
      subtitle: `How ${candidate.toLowerCase()} define, evaluate, select, execute, and monitor progress.`,
      confidence: candidateEvidence.length > 0 ? 90 : 78,
      rationale,
    });
  }

  const bestFitCategory = bestFitStrategicMarketCategory([
    publicSignalText,
    marketSignalText,
    nonprofitSignalText,
    String(args.whereToPlay || ""),
    String(args.howToWin || ""),
  ].join(" "));
  const marketFitOption = buildMarketFitMapOption(bestFitCategory.label);
  addOption({
    key: marketFitOption.key,
    title: marketFitOption.title,
    subtitle: marketFitOption.subtitle,
    confidence: 86,
    rationale: `Best-fit market category: ${marketFitOption.categoryLabel}. Adds a market-specific checkpoint spine option.`,
  });

  return options.sort((a, b) => b.confidence - a.confidence);
}

function TimelineRow({
  steps,
  color,
}: {
  steps: JobStepRow[];
  color: string;
}) {
  return (
    <div className="flex gap-3 px-5 py-4">
      {steps.map((step, index) => {
        const evidenced = step.evidence_status === "evidenced";
        const implied = step.evidence_status === "implied";
        const active = evidenced || implied || !!step.designed;
        const bg = evidenced ? color : implied ? `${color}B3` : c.empty;
        const text = evidenced || implied ? "#fff" : c.muted;

        return (
          <div key={step.id} className="w-[250px] shrink-0" style={{ width: STEP_CARD_WIDTH }}>
            <div className="flex items-center">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-bold"
                style={{ background: bg, color: text }}
              >
                {step.step_number ?? "—"}
              </div>
              {index < steps.length - 1 ? (
                <div
                  className="ml-2 h-[3px] flex-1 rounded-full"
                  style={{ background: active ? `${color}40` : c.line }}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepCard({
  step,
  onSaveText,
  saving,
}: {
  step: JobStepRow;
  onSaveText?: (stepId: string, values: { step_label: string; description: string }) => Promise<void>;
  saving?: boolean;
}) {
  const draftPlaceholder = isDraftPlaceholderStep(step);
  const assessedGap = hasAssessedGap(step);
  const [isEditing, setIsEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState(safeText(step.step_label, "Untitled checkpoint"));
  const [descriptionDraft, setDescriptionDraft] = useState(safeText(step.description, ""));

  useEffect(() => {
    if (isEditing) return;
    setLabelDraft(safeText(step.step_label, "Untitled checkpoint"));
    setDescriptionDraft(safeText(step.description, ""));
  }, [step.step_label, step.description, isEditing]);

  const handleSaveEdit = async () => {
    if (!onSaveText) {
      setIsEditing(false);
      return;
    }
    const nextLabel = labelDraft.trim();
    if (!nextLabel) {
      toast.error("Checkpoint label cannot be empty.");
      return;
    }
    try {
      await onSaveText(step.id, {
        step_label: nextLabel,
        description: descriptionDraft.trim(),
      });
      setIsEditing(false);
      toast.success("Checkpoint updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update checkpoint.");
    }
  };

  const evidenceTone =
    draftPlaceholder
      ? { label: "Not Assessed", color: c.muted, bg: "#F3F4EF", border: c.line }
      : step.evidence_status === "evidenced"
      ? { label: "Evidenced", color: c.teal, bg: "#EEF6E7", border: "#BDD8CF" }
      : step.evidence_status === "implied"
        ? { label: "Implied", color: c.slate, bg: "#EDF4F6", border: "#C4D7DE" }
        : { label: "Unclear", color: c.gap, bg: "#FFF0E6", border: "#FFD1B4" };

  return (
    <div
      className="flex h-full w-[250px] shrink-0 flex-col overflow-hidden rounded-2xl"
      style={{
        width: STEP_CARD_WIDTH,
        background: c.paper,
        border: `1px solid ${assessedGap ? "#E7C3A4" : c.line}`,
        boxShadow: assessedGap ? "0 0 0 1px rgba(255,125,45,0.08) inset" : "none",
      }}
    >
      <div className="flex min-h-[440px] flex-1 flex-col p-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
              Checkpoint {step.step_number ?? "—"}
            </p>
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                disabled={!!saving}
                className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] disabled:opacity-50"
                style={{ borderColor: c.line, color: c.secondary, background: c.card }}
              >
                Edit
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setLabelDraft(safeText(step.step_label, "Untitled checkpoint"));
                    setDescriptionDraft(safeText(step.description, ""));
                  }}
                  disabled={!!saving}
                  className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] disabled:opacity-50"
                  style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={!!saving}
                  className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] disabled:opacity-50"
                  style={{ borderColor: c.line, color: "#1F6A5B", background: "#EEF6E7" }}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </div>
          {!isEditing ? (
            <>
              <p className="mt-2 font-sans text-[14px] font-bold leading-tight" style={{ color: c.charcoal }}>
                {safeText(step.step_label, "Untitled checkpoint")}
              </p>
              <p className="mt-2 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
                {safeText(step.description, "No description yet.")}
              </p>
            </>
          ) : (
            <div className="mt-2 space-y-2">
              <input
                value={labelDraft}
                onChange={(event) => setLabelDraft(event.target.value)}
                className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                placeholder="Checkpoint title"
              />
              <textarea
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                className="min-h-[74px] w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] leading-[1.5] outline-none"
                style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                placeholder="Checkpoint description"
              />
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
            style={{ color: evidenceTone.color, background: evidenceTone.bg, borderColor: evidenceTone.border }}
          >
            {evidenceTone.label}
          </span>
          <MetaBadge>Conf {step.evidence_confidence ?? 0}</MetaBadge>
        </div>

        <div
          className="mt-3 rounded-xl border px-3 py-2"
          style={{ borderColor: c.line, background: c.lineFaint, minHeight: STEP_DETAIL_BLOCK_HEIGHT }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            Evidence Basis
          </p>
          <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
            {safeText(
              step.evidence_basis,
              draftPlaceholder
                ? "This is a starter checkpoint. Add customer evidence to make it specific."
                : "No evidence note has been captured yet.",
            )}
          </p>
        </div>

        {assessedGap ? (
          <div
            className="mt-3 rounded-xl border px-3 py-2"
            style={{
              borderColor: "#E7C3A4",
              background: "#FFF7F0",
              minHeight: STEP_DETAIL_BLOCK_HEIGHT,
            }}
          >
            <p
              className="font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
              style={{ color: c.gap }}
            >
              Gap Identified
            </p>
            <p
              className="mt-1 font-sans text-[12px] leading-[1.55]"
              style={{ color: c.gap }}
            >
              {safeText(step.gap_note, "A gap is flagged here, but we still need clear evidence showing why it is happening.")}
            </p>
          </div>
        ) : draftPlaceholder ? (
          <div
            className="mt-3 rounded-xl border px-3 py-2"
            style={{ borderColor: c.line, background: c.lineFaint, minHeight: STEP_DETAIL_BLOCK_HEIGHT }}
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: c.muted }}>
              Needs Assessment
            </p>
            <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
              This checkpoint is still a draft. Run research to confirm whether a real gap exists and what is causing it.
            </p>
          </div>
        ) : (
          <div style={{ minHeight: STEP_DETAIL_BLOCK_HEIGHT }} className="mt-3" />
        )}
      </div>

      <div
        className="flex min-h-[34px] items-center border-t px-4 py-2"
        style={{ borderColor: c.line }}
      >
        {assessedGap ? (
          <span className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: c.gap }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.gap }} />
            Gap
          </span>
        ) : draftPlaceholder ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            Draft
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            {step.designed ? "Designed" : evidenceTone.label}
          </span>
        )}
      </div>
    </div>
  );
}

function titleCaseJourney(key: string) {
  if (key === "customer") return "Customer";
  if (key === "revenue") return "Revenue";
  if (key === "operations") return "Operations";
  return titleCaseFromKey(key);
}

const INNOVATION_STRATEGIES = [
  { key: "differentiated", label: "Differentiated", desc: "Target underserved outcomes in the mainstream market with a better solution than current alternatives." },
  { key: "dominant", label: "Dominant", desc: "Address all key outcomes better than any competitor — suitable when resources allow a full-market play." },
  { key: "disruptive", label: "Disruptive", desc: "Target overserved or non-consuming segments with a simpler, more affordable solution." },
  { key: "discrete", label: "Discrete", desc: "Build a unique solution for a distinct segment with unique outcome priorities not served by the mainstream." },
] as const;

function OdiContextSection({
  companyName,
  marketDefinition,
  odiError,
  needs,
  marketContext,
  activeCustomerJourneyTitle,
  activeCustomerJourneySubtitle,
  onRemovePublicMarketContext,
  onRemovePublicMarketContextAndRerun,
  removingPublicMarketContextAction,
  onSaveContextEdits,
  savingContextEdits,
  positioningCanvas,
  hasUploadedFiles,
  onResetPublicResearchArtifacts,
  resettingPublicResearchArtifacts,
  onUpdateInnovationStrategy,
}: {
  companyName?: string | null;
  marketDefinition: OdiMarketDefinitionRow | null;
  odiError?: string | null;
  needs: OdiNeedRow[];
  marketContext?: string;
  activeCustomerJourneyTitle?: string | null;
  activeCustomerJourneySubtitle?: string | null;
  onRemovePublicMarketContext?: () => void;
  onRemovePublicMarketContextAndRerun?: () => void;
  removingPublicMarketContextAction?: "remove" | "remove_and_rerun" | null;
  onSaveContextEdits?: (values: {
    marketContext: string;
    jobExecutor: string;
    chooser: string;
    jtbd: string;
  }) => Promise<void>;
  savingContextEdits?: boolean;
  positioningCanvas?: PositioningCanvas | null;
  hasUploadedFiles?: boolean;
  onResetPublicResearchArtifacts?: () => void;
  resettingPublicResearchArtifacts?: boolean;
  onUpdateInnovationStrategy?: (strategy: string) => Promise<void>;
}) {
  const derivedExecutor = audienceFromJourneyTitle(activeCustomerJourneyTitle);
  const derivedJtbd = jtbdFromJourneyTitle(activeCustomerJourneyTitle);
  const derivedChooser = chooserFromJourneyTitle(activeCustomerJourneyTitle);
  const storedExecutor = safeText(marketDefinition?.job_executor, "");
  const storedChooser = safeText(marketDefinition?.chooser, "");
  const storedJtbd = safeText(marketDefinition?.jtbd, "");
  const companyExecutorFallback = safeText(companyName, "")
    ? `${safeText(companyName, "")} customer`
    : "Primary job performer";

  const storedExecutorClean = isInvalidAudienceLabel(storedExecutor) ? "" : storedExecutor;
  const storedChooserClean = isInvalidAudienceLabel(storedChooser) ? "" : storedChooser;
  const derivedExecutorClean = isInvalidAudienceLabel(derivedExecutor) ? "" : derivedExecutor;
  const derivedChooserClean = isInvalidAudienceLabel(derivedChooser) ? "" : derivedChooser;
  const storedJtbdClean = isGenericJtbdStatement(storedJtbd) ? "" : storedJtbd;
  const derivedJtbdClean = isGenericJtbdStatement(derivedJtbd) ? "" : derivedJtbd;
  const bestFitCustomers = safeText(positioningCanvas?.best_fit_customers, "");
  const inferredExecutor = inferRoleFromBestFitCustomers(bestFitCustomers, { chooser: false });
  const inferredChooser = inferRoleFromBestFitCustomers(bestFitCustomers, { chooser: true });
  const inferredRoles = inferRolesFromSignals({
    bestFitCustomers,
    valueForCustomer: positioningCanvas?.value_for_customer,
    marketContext,
    needs,
  });

  const jobExecutor = firstSpecificRole(
    storedExecutorClean,
    derivedExecutorClean,
    inferredExecutor,
    inferredRoles.executor,
    storedChooserClean,
  );
  const resolvedJobExecutor = safeText(
    jobExecutor,
    safeText(inferredRoles.executor, companyExecutorFallback),
  );
  const chooser = firstSpecificRole(
    storedChooserClean,
    derivedChooserClean,
    inferredChooser,
    inferredRoles.chooser,
    isGenericRoleLabel(resolvedJobExecutor) ? "" : `${resolvedJobExecutor} decision owner`,
  );
  const resolvedChooser = safeText(
    chooser,
    safeText(inferredRoles.chooser, "Executive sponsor"),
  );
  const jtbd = deriveBestGuessJtbd({
    storedJtbd: storedJtbdClean,
    derivedJtbd: derivedJtbdClean,
    executor: resolvedJobExecutor,
    needs,
    valueForCustomer: positioningCanvas?.value_for_customer,
  });
  const traditionalMarketFallback = safeText(
    marketContextFromJourney({
      title: activeCustomerJourneyTitle,
      subtitle: activeCustomerJourneySubtitle,
      fallback: safeText(marketContext, ""),
    }),
    "",
  );
  const market = safeText(
    deriveOdiDunfordMarketContext({
      marketContext: traditionalMarketFallback,
      jobExecutor: resolvedJobExecutor,
      chooser: resolvedChooser,
      jtbd,
      needs,
      positioningCanvas,
    }),
    "No market context captured yet.",
  );
  const marketSource = sourcePathLabel(marketDefinition?.source_path);
  const publicNeedCount = needs.filter((item) => isPublicSourcePath(item.source_path)).length;
  const uploadedNeedCount = Math.max(0, needs.length - publicNeedCount);
  const hasPublicMarketContext = Boolean(marketDefinition?.source_path) && isPublicSourcePath(marketDefinition?.source_path);
  const [editingContext, setEditingContext] = useState(false);
  const [marketDraft, setMarketDraft] = useState(market);
  const [jobExecutorDraft, setJobExecutorDraft] = useState(resolvedJobExecutor);
  const [chooserDraft, setChooserDraft] = useState(resolvedChooser);
  const [jtbdDraft, setJtbdDraft] = useState(jtbd);
  const [savingStrategy, setSavingStrategy] = useState(false);
  const currentStrategy = String(marketDefinition?.innovation_strategy || "").trim().toLowerCase() || null;

  useEffect(() => {
    if (editingContext) return;
    setMarketDraft(market);
    setJobExecutorDraft(resolvedJobExecutor);
    setChooserDraft(resolvedChooser);
    setJtbdDraft(jtbd);
  }, [editingContext, market, resolvedJobExecutor, resolvedChooser, jtbd]);

  const handleSaveContext = async () => {
    if (!onSaveContextEdits) return;
    const nextMarket = marketDraft.trim();
    const nextExecutor = jobExecutorDraft.trim();
    const nextChooser = chooserDraft.trim();
    const nextJtbd = jtbdDraft.trim();
    if (!nextMarket || !nextExecutor || !nextChooser || !nextJtbd) {
      toast.error("Market context, job executor, chooser, and job statement are all required.");
      return;
    }
    const confirmed = window.confirm(
      "Save these market context edits?\n\nThis will update Strategic Decision System market context (executor, chooser, job statement) and then regenerate downstream strategy artifacts (job checkpoints, opportunities, routes, and related strategy outputs).",
    );
    if (!confirmed) return;
    try {
      await onSaveContextEdits({
        marketContext: nextMarket,
        jobExecutor: nextExecutor,
        chooser: nextChooser,
        jtbd: nextJtbd,
      });
      setEditingContext(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save market context edits.");
    }
  };

  return (
    <section
      className="rounded-[28px] border px-6 py-6"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h2 className="font-sans text-[24px] font-semibold" style={{ color: c.charcoal }}>
            <SdsTerm short />{" "}Needs & Market Context
          </h2>
          <MetaBadge>{marketSource}</MetaBadge>
          <MetaBadge>{`Needs: ${publicNeedCount} public / ${uploadedNeedCount} uploaded`}</MetaBadge>
          {onSaveContextEdits ? (
            <button
              type="button"
              onClick={() => {
                if (editingContext) {
                  setEditingContext(false);
                  return;
                }
                setMarketDraft(market);
                setJobExecutorDraft(resolvedJobExecutor);
                setChooserDraft(resolvedChooser);
                setJtbdDraft(jtbd);
                setEditingContext(true);
              }}
              disabled={!!savingContextEdits}
              className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
              style={{ borderColor: c.line, color: c.secondary, background: c.card }}
            >
              {editingContext ? "Cancel Edit" : "Edit Context"}
            </button>
          ) : null}
        </div>
        <p className="mt-1 max-w-4xl font-sans text-[14px]" style={{ color: c.secondary }}>
          Public and uploaded-company signals are shown side by side through local alignment. Use this panel to spot mismatches before trusting Strategic Decision System priorities.
        </p>
        {odiError ? (
          <p className="mt-2 font-sans text-[13px]" style={{ color: c.gap }}>
            Strategic Decision System data load warning: {odiError}
          </p>
        ) : null}
        {hasPublicMarketContext && onRemovePublicMarketContext ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {hasUploadedFiles && onRemovePublicMarketContextAndRerun ? (
              <button
                type="button"
                onClick={onRemovePublicMarketContextAndRerun}
                disabled={Boolean(removingPublicMarketContextAction)}
                className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                style={{ borderColor: c.line, color: c.charcoal, background: c.card }}
              >
                {removingPublicMarketContextAction === "remove_and_rerun"
                  ? "Removing + Re-running…"
                  : "Remove + Re-run Uploaded Files"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRemovePublicMarketContext}
              disabled={Boolean(removingPublicMarketContextAction)}
              className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
              style={{ borderColor: "#F1C3AC", color: c.coral, background: c.card }}
            >
              {removingPublicMarketContextAction === "remove"
                ? "Removing…"
                : hasUploadedFiles && onRemovePublicMarketContextAndRerun
                  ? "Remove Only"
                  : "Remove Public Market Context"}
            </button>
          </div>
        ) : null}
        {onResetPublicResearchArtifacts ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={onResetPublicResearchArtifacts}
              disabled={Boolean(removingPublicMarketContextAction) || !!resettingPublicResearchArtifacts}
              className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
              style={{ borderColor: "#E6CFC2", color: "#915E46", background: "#FFF8F5" }}
              title="Remove generated public-research artifacts (map, opportunities, routes, baseline snapshots) while keeping uploaded files"
            >
              {resettingPublicResearchArtifacts ? "Resetting…" : "Reset False Public Research Artifacts"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border p-4" style={{ borderColor: c.line, background: c.paper }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Market Context
          </p>
          {editingContext ? (
            <textarea
              value={marketDraft}
              onChange={(event) => setMarketDraft(event.target.value)}
              className="mt-2 min-h-[126px] w-full rounded-lg border px-2.5 py-2 font-sans text-[13px] leading-[1.55] outline-none"
              style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
              placeholder="Define the specific market context for this company."
            />
          ) : (
            <p className="mt-2 font-sans text-[13px] leading-[1.55]" style={{ color: c.secondary }}>
              {market}
            </p>
          )}
        </div>

        <div className="rounded-2xl border p-4" style={{ borderColor: c.line, background: c.paper }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Job Executor
          </p>
          {editingContext ? (
            <input
              value={jobExecutorDraft}
              onChange={(event) => setJobExecutorDraft(event.target.value)}
              className="mt-2 w-full rounded-lg border px-2.5 py-2 font-sans text-[14px] font-semibold outline-none"
              style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
              placeholder="Who performs the core job?"
            />
          ) : (
            <p className="mt-2 font-sans text-[15px] font-semibold" style={{ color: c.charcoal }}>
              {resolvedJobExecutor}
            </p>
          )}
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Chooser
          </p>
          {editingContext ? (
            <input
              value={chooserDraft}
              onChange={(event) => setChooserDraft(event.target.value)}
              className="mt-2 w-full rounded-lg border px-2.5 py-2 font-sans text-[13px] outline-none"
              style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
              placeholder="Who chooses/approves the solution?"
            />
          ) : (
            <p className="mt-2 font-sans text-[13px]" style={{ color: c.secondary }}>
              {resolvedChooser}
            </p>
          )}
        </div>

        <div className="rounded-2xl border p-4 lg:col-span-1" style={{ borderColor: c.line, background: c.paper }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Job to Be Done
          </p>
          {editingContext ? (
            <>
              <textarea
                value={jtbdDraft}
                onChange={(event) => setJtbdDraft(event.target.value)}
                className="mt-2 min-h-[126px] w-full rounded-lg border px-2.5 py-2 font-sans text-[14px] font-semibold leading-[1.45] outline-none"
                style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                placeholder="When [job executor] is trying to..., they want to..., so they can..."
              />
              <p className="mt-2 font-sans text-[12px] italic leading-[1.6]" style={{ color: c.muted }}>
                Keep the job statement stable and solution-agnostic. Focus on enduring progress, not a specific product flow.
              </p>
            </>
          ) : (
            <p className="mt-2 font-sans text-[15px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
              {jtbd}
            </p>
          )}
        </div>
      </div>
      {editingContext ? (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="lg:col-start-3">
            <div
              className="mb-2 rounded-xl border px-3 py-2.5"
              style={{ borderColor: "#F1C3AC", background: "#FFF4EC" }}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: "#915E46" }}>
                Save Impact
              </p>
              <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: "#6C4638" }}>
                Saving updates Strategic Decision System market context (executor, chooser, job statement), then regenerates downstream strategy artifacts (job checkpoints, opportunities, routes, and strategy outputs).
              </p>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveContext}
                disabled={!!savingContextEdits}
                className="rounded-full border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                style={{ borderColor: "#D46A2D", color: "#FFFFFF", background: "#D46A2D" }}
              >
                {savingContextEdits ? "Saving + Refreshing…" : "Save Context"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {onUpdateInnovationStrategy ? (
        <div className="mt-5">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            Innovation Strategy
          </p>
          <p className="mb-3 font-sans text-[13px]" style={{ color: c.secondary }}>
            Select the strategy that best matches the opportunity landscape. This shapes how solutions should be framed and prioritized.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {INNOVATION_STRATEGIES.map((s) => {
              const isSelected = currentStrategy === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={savingStrategy}
                  onClick={async () => {
                    if (isSelected) return;
                    setSavingStrategy(true);
                    try {
                      await onUpdateInnovationStrategy(s.key);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to save strategy.");
                    } finally {
                      setSavingStrategy(false);
                    }
                  }}
                  className="rounded-xl border p-3 text-left transition-colors disabled:opacity-60"
                  style={{
                    borderColor: isSelected ? c.coral : c.line,
                    background: isSelected ? "#FFF4EC" : c.card,
                  }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: isSelected ? c.coral : c.secondary }}>
                    {s.label}
                  </p>
                  <p className="mt-1 font-sans text-[11px] leading-[1.55]" style={{ color: c.secondary }}>
                    {s.desc}
                  </p>
                </button>
              );
            })}
          </div>
          {savingStrategy ? (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Saving…
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ProcessFidelitySection({
  marketDefinition,
  marketContext,
  customerJourney,
  activeCustomerJourneyTitle,
  needs,
  positioningCanvas,
}: {
  marketDefinition: OdiMarketDefinitionRow | null;
  marketContext?: string | null;
  customerJourney?: JourneyGroup | null;
  activeCustomerJourneyTitle?: string | null;
  needs: OdiNeedRow[];
  positioningCanvas?: PositioningCanvas | null;
}) {
  const market = safeText(marketContext, "No market context captured yet.");
  const storedExecutor = safeText(marketDefinition?.job_executor, "");
  const storedChooser = safeText(marketDefinition?.chooser, "");
  const derivedExecutor = audienceFromJourneyTitle(activeCustomerJourneyTitle);
  const derivedChooser = chooserFromJourneyTitle(activeCustomerJourneyTitle);
  const bestFitCustomers = safeText(positioningCanvas?.best_fit_customers, "");
  const inferredExecutor = inferRoleFromBestFitCustomers(bestFitCustomers, { chooser: false });
  const inferredChooser = inferRoleFromBestFitCustomers(bestFitCustomers, { chooser: true });
  const inferredRoles = inferRolesFromSignals({
    bestFitCustomers,
    valueForCustomer: positioningCanvas?.value_for_customer,
    marketContext,
    needs,
  });
  const executor = firstSpecificRole(
    isInvalidAudienceLabel(storedExecutor) ? "" : storedExecutor,
    isInvalidAudienceLabel(derivedExecutor) ? "" : derivedExecutor,
    inferredExecutor,
    inferredRoles.executor,
  );
  const resolvedExecutor = safeText(
    executor,
    safeText(inferredRoles.executor, "Primary job performer"),
  );
  const chooser = firstSpecificRole(
    isInvalidAudienceLabel(storedChooser) ? "" : storedChooser,
    isInvalidAudienceLabel(derivedChooser) ? "" : derivedChooser,
    inferredChooser,
    inferredRoles.chooser,
    isGenericRoleLabel(resolvedExecutor) ? "" : `${resolvedExecutor} decision owner`,
  );
  const resolvedChooser = safeText(
    chooser,
    safeText(inferredRoles.chooser, "Executive sponsor"),
  );
  const storedJtbd = safeText(marketDefinition?.jtbd, "");
  const derivedJtbd = jtbdFromJourneyTitle(activeCustomerJourneyTitle);
  const jtbd = deriveBestGuessJtbd({
    storedJtbd: isGenericJtbdStatement(storedJtbd) ? "" : storedJtbd,
    derivedJtbd: isGenericJtbdStatement(derivedJtbd) ? "" : derivedJtbd,
    executor: resolvedExecutor,
    needs,
    valueForCustomer: positioningCanvas?.value_for_customer,
  });
  const abstractedExecutor = deriveAbstractedExecutor(resolvedExecutor);
  const functionOfProduct = deriveFunctionOfProductStatement(jtbd, resolvedExecutor);
  const abstractedJob = deriveAbstractedJobStatement(jtbd, abstractedExecutor);
  const executorDetermination = deriveExecutorDetermination({
    activeCustomerJourneyTitle,
    marketDefinitionExecutor: marketDefinition?.job_executor,
    marketDefinitionChooser: marketDefinition?.chooser,
  });
  const otherProductsContextGroups = deriveOtherProductsContextGroups({
    marketContext: market,
    needs,
    positioningCanvas,
  });
  const canvasFields = deriveMarketDefinitionCanvas({
    traditionalMarketDefinition: market,
    executorDetermination,
    jobExecutor: resolvedExecutor,
    chooser: resolvedChooser,
    functionOfProductStatement: functionOfProduct,
    otherProductsContext: deriveOtherProductsContext(market, needs),
    abstractedJobStatement: abstractedJob,
    jtbd,
  });
  const customerSteps = Array.isArray(customerJourney?.steps) ? customerJourney?.steps : [];
  const customerStepByNumber = new Map<number, JobStepRow>();
  for (const step of customerSteps) {
    const stepNumber = Number(step.step_number);
    if (!Number.isFinite(stepNumber)) continue;
    const normalized = Math.max(1, Math.min(JTBD_CHECKPOINT_COUNT, Math.round(stepNumber)));
    if (!customerStepByNumber.has(normalized)) customerStepByNumber.set(normalized, step);
  }

  const rankedNeeds = needs
    .slice()
    .sort((a, b) => {
      const scoreDiff = (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      const sortDiff = (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER);
      if (sortDiff !== 0) return sortDiff;
      return String(a.id).localeCompare(String(b.id));
    })
    .slice(0, 12);

  return (
    <section
      className="rounded-[28px] border px-6 py-6"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <div className="mb-5">
        <h2 className="font-sans text-[24px] font-semibold" style={{ color: c.charcoal }}>
          Process Fidelity
        </h2>
        <p className="mt-1 max-w-5xl font-sans text-[14px]" style={{ color: c.secondary }}>
          This section translates current company evidence into a clear market definition canvas, an 8-checkpoint customer job spine, and Strategic Decision System needs linked to exact checkpoints.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-2xl border p-4 xl:col-span-5" style={{ borderColor: c.line, background: c.paper }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Derived Market Definition Canvas
          </p>
          <div className="mt-3 space-y-3">
            {canvasFields.map((field) => (
              <div key={field.key} className="rounded-xl border px-3 py-2.5" style={{ borderColor: c.line, background: "#fff" }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.09em]" style={{ color: c.muted }}>
                  {field.label}
                </p>
                {field.key === "other_products_context" ? (
                  <div className="mt-2 space-y-2">
                    {otherProductsContextGroups.map((group, index) => (
                      <div
                        key={`${group.alternative}-${index}`}
                        className="rounded-lg border px-2.5 py-2"
                        style={{ borderColor: c.line, background: c.paper }}
                      >
                        <p className="font-sans text-[13px] font-semibold leading-[1.35]" style={{ color: c.charcoal }}>
                          {group.alternative}
                        </p>
                        <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
                          {group.context}
                        </p>
                        <p className="mt-1 font-sans text-[11px] leading-[1.5]" style={{ color: c.muted }}>
                          Comparison pressure: {group.comparisonPressure}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 font-sans text-[13px] leading-[1.55]" style={{ color: c.secondary }}>
                    {field.value}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border p-4 xl:col-span-7" style={{ borderColor: c.line, background: c.paper }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            8-Checkpoint Spine
          </p>
          <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
            Customer map checkpoints are fixed at 1–8. Labels can be customized, but sequence cannot break.
          </p>

          <div className="mt-3 space-y-2">
            {JTBD_ODI_CHECKPOINTS.map((checkpoint) => {
              const row = customerStepByNumber.get(checkpoint.stepNumber);
              const evidenceStatus = safeText(row?.evidence_status, "unclear").toLowerCase();
              const statusLabel =
                evidenceStatus === "evidenced"
                  ? "Evidenced"
                  : evidenceStatus === "implied"
                    ? "Implied"
                    : row
                      ? "Unclear"
                      : "Missing";
              const statusTone =
                statusLabel === "Evidenced"
                  ? { bg: "#EEF6E7", border: "#BDD8CF", color: c.teal }
                  : statusLabel === "Implied"
                    ? { bg: "#EDF4F6", border: "#C4D7DE", color: c.slate }
                    : statusLabel === "Missing"
                      ? { bg: "#FFF4EC", border: "#F1C3AC", color: c.gap }
                      : { bg: "#F3F4EF", border: c.line, color: c.muted };
              const hasGap = row?.has_gap === true && !isDraftPlaceholderStep(row);
              return (
                <div
                  key={`checkpoint-${checkpoint.stepNumber}`}
                  className="rounded-xl border px-3 py-2.5"
                  style={{ borderColor: c.line, background: "#fff" }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                        Checkpoint {checkpoint.stepNumber} · {checkpoint.key.toUpperCase()}
                      </p>
                      <p className="mt-1 font-sans text-[15px] font-semibold leading-[1.35]" style={{ color: c.charcoal }}>
                        {safeText(row?.step_label, checkpoint.canonicalLabel)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                        style={{ background: statusTone.bg, borderColor: statusTone.border, color: statusTone.color }}
                      >
                        {statusLabel}
                      </span>
                      <span
                        className="inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                        style={{
                          background: hasGap ? "#FFF0E6" : "#F3F4EF",
                          borderColor: hasGap ? "#F1C3AC" : c.line,
                          color: hasGap ? c.gap : c.muted,
                        }}
                      >
                        {hasGap ? "Gap Flagged" : row ? "No Gap Flagged" : "Gap Unknown"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 font-sans text-[13px] leading-[1.55]" style={{ color: c.secondary }}>
                    {safeText(row?.description, checkpoint.description)}
                  </p>
                  <p className="mt-1 font-sans text-[12px] leading-[1.5]" style={{ color: c.muted }}>
                    Evidence: {safeText(row?.evidence_basis, "No evidence rationale recorded yet.")}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: c.line, background: c.paper }}>
        <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
          <SdsTerm short />{" "}Needs Linked To Checkpoints
        </p>
        <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
          Needs stay ranked by opportunity score and always show the checkpoint anchor used to evaluate the checkpoint map.
        </p>
        {rankedNeeds.length === 0 ? (
          <p className="mt-3 font-sans text-[13px]" style={{ color: c.secondary }}>
            No Strategic Decision System needs are available yet.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {rankedNeeds.map((need, index) => {
              const stepNumber = Number(need.step_number);
              const anchorNumber = Number.isFinite(stepNumber)
                ? Math.max(1, Math.min(JTBD_CHECKPOINT_COUNT, Math.round(stepNumber)))
                : 1;
              const stepLabel =
                safeText(need.step_label, "") ||
                safeText(customerStepByNumber.get(anchorNumber)?.step_label, JTBD_ODI_CHECKPOINTS[anchorNumber - 1].canonicalLabel);
              return (
                <div
                  key={need.id}
                  className="rounded-xl border px-3 py-2.5"
                  style={{ borderColor: c.line, background: "#fff" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                      Rank {String(index + 1).padStart(2, "0")} · Checkpoint {anchorNumber} · {stepLabel}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
                      Opp {formatNeedScore(need.opportunity_score)} · I {need.importance} · S {need.satisfaction}
                    </p>
                  </div>
                  <p className="mt-1 font-sans text-[14px] leading-[1.5]" style={{ color: c.charcoal }}>
                    {need.desired_outcome}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function OdiNeedsListSection({
  companyId,
  needs,
  onRemoveNeed,
  removingNeedId,
  onRemovePublicNeeds,
  removingPublicNeeds,
  onReorderNeeds,
  reorderingNeeds,
  onUpdateNeedText,
  updatingNeedId,
  onUpdateNeedScores,
}: {
  companyId?: string;
  needs: OdiNeedRow[];
  onRemoveNeed?: (needId: string) => void;
  removingNeedId?: string | null;
  onRemovePublicNeeds?: () => void;
  removingPublicNeeds?: boolean;
  onReorderNeeds?: (orderedNeedIds: string[]) => Promise<void>;
  reorderingNeeds?: boolean;
  onUpdateNeedText?: (needId: string, values: { desired_outcome: string }) => Promise<void>;
  updatingNeedId?: string | null;
  onUpdateNeedScores?: (needId: string, importance: number, satisfaction: number) => Promise<void>;
}) {
  type NeedOrderMode = "suggested" | "custom";
  const hasManualNeedOverride = (rows: OdiNeedRow[]) =>
    rows.some((row) =>
      Array.isArray(row.frameworks_used) &&
      row.frameworks_used.some((flag) => String(flag || "").trim().toLowerCase() === "manual_override"),
    );
  const sortNeedItems = (rows: OdiNeedRow[]) => [...rows].sort((a, b) => {
    const aSort = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : Number.MAX_SAFE_INTEGER;
    const bSort = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : Number.MAX_SAFE_INTEGER;
    if (aSort !== bSort) return aSort - bSort;
    const scoreDiff = (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.importance ?? 0) - (a.importance ?? 0);
  });
  const sortSuggestedItems = (rows: OdiNeedRow[]) => [...rows].sort((a, b) => {
    const scoreDiff = (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const importanceDiff = (b.importance ?? 0) - (a.importance ?? 0);
    if (importanceDiff !== 0) return importanceDiff;
    const satisfactionDiff = (a.satisfaction ?? 0) - (b.satisfaction ?? 0);
    if (satisfactionDiff !== 0) return satisfactionDiff;
    return String(a.id).localeCompare(String(b.id));
  });
  const [needItems, setNeedItems] = useState<OdiNeedRow[]>(() =>
    hasManualNeedOverride(needs) ? sortNeedItems(needs) : sortSuggestedItems(needs),
  );
  const [orderMode, setOrderMode] = useState<NeedOrderMode>(() =>
    hasManualNeedOverride(needs) ? "custom" : "suggested",
  );
  const [draggingNeedId, setDraggingNeedId] = useState<string | null>(null);
  const [dragOverNeedId, setDragOverNeedId] = useState<string | null>(null);
  const [editingNeedId, setEditingNeedId] = useState<string | null>(null);
  const [needDrafts, setNeedDrafts] = useState<Record<string, string>>({});
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, { importance: number; satisfaction: number }>>({});
  const [savingScoresId, setSavingScoresId] = useState<string | null>(null);
  const customLabelStorageKey = companyId ? `odi-needs-custom-label:${companyId}` : null;
  const [customLabel, setCustomLabel] = useState("Custom");
  const [customLabelDraft, setCustomLabelDraft] = useState("Custom");
  const [isRenamingCustomLabel, setIsRenamingCustomLabel] = useState(false);
  const reorderNeedItems = (items: OdiNeedRow[], fromId: string, toId: string) => {
    const fromIndex = items.findIndex((item) => item.id === fromId);
    const toIndex = items.findIndex((item) => item.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next.map((item, index) => ({ ...item, sort_order: index + 1 }));
  };

  useEffect(() => {
    const useCustomOrder = hasManualNeedOverride(needs);
    setNeedItems(useCustomOrder ? sortNeedItems(needs) : sortSuggestedItems(needs));
    setOrderMode((current) => (useCustomOrder ? current : "suggested"));
    setDraggingNeedId(null);
    setDragOverNeedId(null);
    setEditingNeedId(null);
  }, [needs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!customLabelStorageKey) {
      setCustomLabel("Custom");
      setCustomLabelDraft("Custom");
      return;
    }
    const stored = window.localStorage.getItem(customLabelStorageKey);
    const nextLabel = String(stored || "").trim() || "Custom";
    setCustomLabel(nextLabel);
    setCustomLabelDraft(nextLabel);
  }, [customLabelStorageKey]);

  const suggestedItems = useMemo(() => sortSuggestedItems(needs), [needs]);
  const suggestedOrderIds = suggestedItems.map((item) => item.id);
  const customOrderIds = needItems.map((item) => item.id);
  const needNumberById = useMemo(
    () =>
      new Map<string, string>(
        suggestedItems.map((item, index) => [item.id, String(index + 1).padStart(3, "0")]),
      ),
    [suggestedItems],
  );
  const hasCustomOrder =
    hasManualNeedOverride(needs) ||
    suggestedOrderIds.length === customOrderIds.length &&
    suggestedOrderIds.some((id, index) => customOrderIds[index] !== id);
  const visibleNeedItems = orderMode === "suggested" ? suggestedItems : needItems;
  const customOrderLabel = customLabel.trim() || "Custom";

  const publicNeedCount = visibleNeedItems.filter((item) => isPublicSourcePath(item.source_path)).length;

  return (
    <section
      className="rounded-[28px] border px-6 py-6"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: c.line, background: c.paper }}
      >
        <div className="h-[5px] w-full" style={{ background: c.coral }} />
        <div className="p-4">
          <div className="mb-3">
            <h3 className="font-sans text-[20px] font-semibold" style={{ color: c.charcoal }}>
              Needs
            </h3>
            <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
              Desired outcome statements from both public and uploaded evidence. Use source labels to remove inaccurate public rows and keep company-grounded needs.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOrderMode("suggested")}
                className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{
                  borderColor: orderMode === "suggested" ? "#E6CFC2" : c.line,
                  color: orderMode === "suggested" ? c.charcoal : c.secondary,
                  background: orderMode === "suggested" ? "#FFF4EC" : c.card,
                }}
              >
                Generated
              </button>
              <button
                type="button"
                onClick={() => setOrderMode("custom")}
                className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{
                  borderColor: orderMode === "custom" ? "#D8E4D6" : c.line,
                  color: orderMode === "custom" ? c.charcoal : c.secondary,
                  background: orderMode === "custom" ? "#EEF6E7" : c.card,
                }}
              >
                {customOrderLabel}
              </button>
              {hasCustomOrder ? (
                <MetaBadge>{customOrderLabel} saved</MetaBadge>
              ) : (
                <MetaBadge>Using generated order</MetaBadge>
              )}
              <button
                type="button"
                onClick={() => {
                  setCustomLabelDraft(customOrderLabel);
                  setIsRenamingCustomLabel((current) => !current);
                }}
                className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{ borderColor: c.line, color: c.secondary, background: c.card }}
              >
                {isRenamingCustomLabel ? "Close Rename" : "Rename Custom"}
              </button>
            </div>
            {isRenamingCustomLabel ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  value={customLabelDraft}
                  onChange={(event) => setCustomLabelDraft(event.target.value)}
                  className="w-full max-w-[260px] rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                  style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                  placeholder="Custom"
                />
                <button
                  type="button"
                  onClick={() => {
                    const nextLabel = customLabelDraft.trim() || "Custom";
                    setCustomLabel(nextLabel);
                    setCustomLabelDraft(nextLabel);
                    setIsRenamingCustomLabel(false);
                    if (typeof window !== "undefined" && customLabelStorageKey) {
                      window.localStorage.setItem(customLabelStorageKey, nextLabel);
                    }
                  }}
                  className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em]"
                  style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                >
                  Save Name
                </button>
              </div>
            ) : null}
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              {orderMode === "suggested"
                ? "Viewing generated rank"
                : reorderingNeeds
                  ? "Saving your order…"
                  : `Drag needs to reorder ${customOrderLabel.toLowerCase()}`}
            </p>
            {publicNeedCount > 0 && onRemovePublicNeeds ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={onRemovePublicNeeds}
                  disabled={!!removingPublicNeeds}
                  className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                  style={{ borderColor: "#F1C3AC", color: c.coral, background: c.card }}
                >
                  {removingPublicNeeds ? "Removing…" : `Remove Public Needs (${publicNeedCount})`}
                </button>
              </div>
            ) : null}
          </div>

          {visibleNeedItems.length === 0 ? (
            <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
              No Strategic Decision System needs identified yet from current evidence.
            </p>
          ) : (
            <div className="space-y-3">
              {visibleNeedItems.map((item) => (
                <div
                  key={item.id}
                  draggable={orderMode === "custom" && !reorderingNeeds && editingNeedId !== item.id}
                  onDragStart={() => {
                    if (orderMode !== "custom" || reorderingNeeds || editingNeedId === item.id) return;
                    setDraggingNeedId(item.id);
                  }}
                  onDragOver={(event) => {
                    if (orderMode !== "custom" || reorderingNeeds || !draggingNeedId || draggingNeedId === item.id) return;
                    event.preventDefault();
                    setDragOverNeedId(item.id);
                  }}
                  onDrop={async (event) => {
                    event.preventDefault();
                    if (orderMode !== "custom" || !onReorderNeeds || reorderingNeeds || !draggingNeedId || draggingNeedId === item.id) {
                      setDragOverNeedId(null);
                      return;
                    }
                    const next = reorderNeedItems(needItems, draggingNeedId, item.id);
                    setNeedItems(next);
                    setDraggingNeedId(null);
                    setDragOverNeedId(null);
                    try {
                      await onReorderNeeds(next.map((entry) => entry.id));
                    } catch (err) {
                      setNeedItems(sortNeedItems(needs));
                      toast.error(err instanceof Error ? err.message : "Failed to reorder needs.");
                    }
                  }}
                  onDragEnd={() => {
                    setDraggingNeedId(null);
                    setDragOverNeedId(null);
                  }}
                  className="rounded-2xl border overflow-hidden"
                  style={{
                    borderColor: c.line,
                    background: c.card,
                    cursor: orderMode !== "custom" || reorderingNeeds ? "default" : "grab",
                    boxShadow: dragOverNeedId === item.id ? "0 0 0 2px rgba(255,125,45,0.32) inset" : "none",
                    opacity: draggingNeedId === item.id ? 0.72 : 1,
                  }}
                >
                  {(() => {
                    const actionLabel = opportunityActionFromNeedScore(item.opportunity_score);
                    const actionTone = opportunityActionTone(actionLabel);
                    const stepContext = item.step_number ? `Checkpoint ${item.step_number}` : "Checkpoint —";
                    const stepDetail = item.step_label ? ` · ${item.step_label}` : "";
                    return (
                      <>
                        <div className="h-[4px] w-full" style={{ background: actionTone.fg }} />
                        <div className="p-4">
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                            <div className="min-w-0">
                              <div className="mb-2 flex items-center gap-2">
                                <span
                                  className="shrink-0 w-9 font-mono text-[11px] uppercase tracking-[0.08em] text-left"
                                  style={{ color: c.secondary }}
                                  title="Stable need number based on suggested priority"
                                >
                                  {needNumberById.get(item.id) || "—"}
                                </span>
                                <span className="font-mono text-[10px] uppercase tracking-[0.08em] whitespace-nowrap" style={{ color: c.secondary }}>
                                  {titleCaseJourney(item.journey_key)} · {stepContext}
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0">
                              <p className="font-mono text-[10px] uppercase tracking-[0.06em] whitespace-nowrap text-right" style={{ color: c.secondary }}>
                                Opp Score {formatNeedScore(item.opportunity_score)}
                              </p>
                            </div>
                          </div>

                          {editingNeedId === item.id ? (
                            <textarea
                              value={needDrafts[item.id] ?? item.desired_outcome}
                              onChange={(event) =>
                                setNeedDrafts((current) => ({ ...current, [item.id]: event.target.value }))
                              }
                              className="min-h-[84px] w-full rounded-lg border px-2.5 py-2 font-sans text-[13px] leading-[1.5] outline-none"
                              style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                              placeholder="Desired outcome"
                            />
                          ) : (
                            <p className="font-sans text-[16px] font-semibold leading-[1.5]" style={{ color: c.charcoal }}>
                              {item.desired_outcome}
                            </p>
                          )}

                          <p className="mt-2 font-sans text-[12px]" style={{ color: c.secondary }}>
                            <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                              Job checkpoint context:
                            </span>{" "}
                            {stepContext}
                            {stepDetail}
                          </p>

                          <div className="mt-3 border-t pt-2" style={{ borderColor: c.line }}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <NeedActionBadge label={actionLabel} />
                                <StateBadge tone={item.service_state} />
                                <MetaBadge>{sourcePathLabel(item.source_path)}</MetaBadge>
                              </div>
                              {onUpdateNeedScores ? (() => {
                                const draft = scoreDrafts[item.id];
                                const curImp = draft?.importance ?? (item.importance ?? 5);
                                const curSat = draft?.satisfaction ?? (item.satisfaction ?? 5);
                                const isDirty = draft !== undefined && (draft.importance !== (item.importance ?? 5) || draft.satisfaction !== (item.satisfaction ?? 5));
                                return (
                                  <div className="flex items-center gap-2">
                                    <div className="flex flex-col gap-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono text-[9px] uppercase tracking-[0.08em] w-5" style={{ color: c.muted }}>I</span>
                                        <input
                                          type="range"
                                          min={0}
                                          max={10}
                                          step={1}
                                          value={curImp}
                                          className="h-1 w-[80px] cursor-pointer accent-current"
                                          style={{ accentColor: c.coral }}
                                          onChange={(e) => setScoreDrafts((prev) => ({ ...prev, [item.id]: { importance: Number(e.target.value), satisfaction: curSat } }))}
                                        />
                                        <span className="font-mono text-[10px] w-4 text-right" style={{ color: c.charcoal }}>{curImp}</span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="font-mono text-[9px] uppercase tracking-[0.08em] w-5" style={{ color: c.muted }}>S</span>
                                        <input
                                          type="range"
                                          min={0}
                                          max={10}
                                          step={1}
                                          value={curSat}
                                          className="h-1 w-[80px] cursor-pointer"
                                          style={{ accentColor: c.teal }}
                                          onChange={(e) => setScoreDrafts((prev) => ({ ...prev, [item.id]: { importance: curImp, satisfaction: Number(e.target.value) } }))}
                                        />
                                        <span className="font-mono text-[10px] w-4 text-right" style={{ color: c.charcoal }}>{curSat}</span>
                                      </div>
                                    </div>
                                    {isDirty ? (
                                      <button
                                        type="button"
                                        disabled={savingScoresId === item.id}
                                        onClick={async () => {
                                          setSavingScoresId(item.id);
                                          try {
                                            await onUpdateNeedScores(item.id, curImp, curSat);
                                            setScoreDrafts((prev) => {
                                              const next = { ...prev };
                                              delete next[item.id];
                                              return next;
                                            });
                                          } finally {
                                            setSavingScoresId(null);
                                          }
                                        }}
                                        className="rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] disabled:opacity-50"
                                        style={{ borderColor: c.line, color: "#1F6A5B", background: "#EEF6E7" }}
                                      >
                                        {savingScoresId === item.id ? "…" : "Save"}
                                      </button>
                                    ) : null}
                                  </div>
                                );
                              })() : (
                                <p className="font-mono text-[10px] uppercase tracking-[0.08em] whitespace-nowrap" style={{ color: c.secondary }}>
                                  I {item.importance ?? "—"} · S {item.satisfaction ?? "—"}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                  <div className="px-4 pb-4">
                    <div className="flex justify-end gap-2">
                      {onRemoveNeed ? (
                        <>
                          {editingNeedId === item.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingNeedId(null);
                                  setNeedDrafts((current) => {
                                    const next = { ...current };
                                    delete next[item.id];
                                    return next;
                                  });
                                }}
                                disabled={updatingNeedId === item.id}
                                className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                                style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!onUpdateNeedText) return;
                                  const draftValue = String(needDrafts[item.id] ?? item.desired_outcome).trim();
                                  if (!draftValue) {
                                    toast.error("Need text cannot be empty.");
                                    return;
                                  }
                                  try {
                                    await onUpdateNeedText(item.id, { desired_outcome: draftValue });
                                    setNeedItems((current) =>
                                      current.map((row) =>
                                        row.id === item.id ? { ...row, desired_outcome: draftValue } : row,
                                      ),
                                    );
                                    setEditingNeedId(null);
                                    setNeedDrafts((current) => {
                                      const next = { ...current };
                                      delete next[item.id];
                                      return next;
                                    });
                                    toast.success("Need updated.");
                                  } catch (err) {
                                    toast.error(err instanceof Error ? err.message : "Failed to update need.");
                                  }
                                }}
                                disabled={updatingNeedId === item.id}
                                className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                                style={{ borderColor: c.line, color: "#1F6A5B", background: "#EEF6E7" }}
                              >
                                {updatingNeedId === item.id ? "Saving…" : "Save"}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNeedId(item.id);
                                setNeedDrafts((current) => ({
                                  ...current,
                                  [item.id]: current[item.id] ?? item.desired_outcome,
                                }));
                              }}
                              disabled={updatingNeedId === item.id}
                              className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                              style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                            >
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onRemoveNeed(item.id)}
                            disabled={removingNeedId === item.id || updatingNeedId === item.id}
                            className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                            style={{ borderColor: "#F1C3AC", color: c.coral, background: c.card }}
                          >
                            {removingNeedId === item.id ? "Removing…" : "Remove Need"}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function JourneySection({
  journey,
  onRemove,
  removing,
  onUpdateStepText,
  updatingStepId,
}: {
  journey: JourneyGroup;
  onRemove: (key: JourneyKey) => void;
  removing: boolean;
  onUpdateStepText: (stepId: string, values: { step_label: string; description: string }) => Promise<void>;
  updatingStepId: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const style = JOURNEY_STYLE[journey.key] ?? fallbackStyleForJourney(journey.key);
  const { rail, dot, preview } = style;
  const designedCount = journey.steps.filter((step) => step.designed).length;
  const evidencedCount = journey.steps.filter((step) => step.evidence_status === "evidenced").length;
  const gapsCount = journey.steps.filter((step) => hasAssessedGap(step)).length;
  const pendingAssessmentCount = journey.steps.filter((step) => isDraftPlaceholderStep(step)).length;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const checkScroll = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };

    checkScroll();
    el.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);

    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [journey.steps.length]);

  const scrollByCards = (direction: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: direction * 340, behavior: "smooth" });
  };

  return (
    <section
      className="overflow-hidden rounded-[28px] border p-0"
      style={{
        background: "#FFFFFF",
        borderColor: c.line,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <div className="h-full w-[6px]" style={{ background: rail, float: "left" }} />
      <div className="ml-[6px] px-6 py-6">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            {preview ? (
              <div
                className="mb-2 inline-flex rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{ background: "#2c2925", color: "#fff" }}
              >
                {preview}
              </div>
            ) : null}
            <h2 className="font-sans text-[24px] font-semibold leading-tight" style={{ color: c.charcoal }}>
              {journey.title}
            </h2>
            <p className="mt-1 max-w-4xl font-sans text-[14px]" style={{ color: c.secondary }}>
              {journey.subtitle}
            </p>
          </div>

          <div className="mt-1 flex items-center gap-5 whitespace-nowrap">
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.designedDot }} />
              {designedCount} designed
            </span>
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.teal }} />
              {evidencedCount} evidenced
            </span>
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.gap }} />
              {gapsCount} gaps
            </span>
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.muted }} />
              {pendingAssessmentCount} pending
            </span>
            <button
              type="button"
              onClick={() => onRemove(journey.key)}
              disabled={removing}
              className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
              style={{ borderColor: c.line, color: c.secondary, background: c.card }}
            >
              {removing ? "Removing…" : "Remove Map"}
            </button>
          </div>
        </div>

        <div className="relative mt-1">
          {canScrollLeft ? (
            <button
              type="button"
              aria-label="Scroll left"
              onClick={() => scrollByCards(-1)}
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border"
              style={{ background: c.card, borderColor: c.line, color: c.secondary }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : null}

          <div ref={scrollRef} className="overflow-x-auto pb-1">
            <div className="inline-block min-w-full">
              <TimelineRow steps={journey.steps} color={dot} />

              <div className="flex gap-3 px-5">
              {journey.steps.map((step) => (
                <StepCard
                  key={step.id}
                  step={step}
                  onSaveText={onUpdateStepText}
                  saving={updatingStepId === step.id}
                />
              ))}
              </div>
            </div>
          </div>

          {canScrollRight ? (
            <button
              type="button"
              aria-label="Scroll right"
              onClick={() => scrollByCards(1)}
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border"
              style={{ background: c.card, borderColor: c.line, color: c.secondary }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SuggestedMapsSection({
  options,
  drafts,
  onDraftChange,
  onAddMap,
  runningKey,
}: {
  options: SuggestedJourneyOption[];
  drafts: JourneyDraftMap;
  onDraftChange: (key: string, field: "title" | "subtitle", value: string) => void;
  onAddMap: (key: string) => void;
  runningKey: string | null;
}) {
  if (options.length === 0) return null;

  return (
    <section
      className="rounded-[24px] border px-6 py-5"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-sans text-[18px] font-semibold" style={{ color: c.charcoal }}>
            Choose Checkpoint Maps
          </p>
          <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
            Add maps one at a time. You can edit title/subtitle first, then click add.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {options.map((option) => (
          <div
            key={option.key}
            className="rounded-xl border p-3"
            style={{ borderColor: c.line, background: c.paper }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MetaBadge>{titleCaseJourney(option.key)}</MetaBadge>
              <ScoreChip label="Confidence" value={option.confidence} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <MetaBadge>Public signal</MetaBadge>
            </div>
            <p
              className="mt-2 font-sans text-[16px] font-semibold leading-[1.3] break-words"
              style={{ color: c.charcoal }}
              title={drafts[option.key]?.title || option.title}
            >
              {drafts[option.key]?.title || option.title}
            </p>
            <p
              className="mt-1 font-sans text-[12px] leading-[1.55] break-words"
              style={{ color: c.secondary }}
              title={option.rationale}
            >
              {option.rationale}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <input
                value={drafts[option.key]?.title || option.title}
                onChange={(event) => onDraftChange(option.key, "title", event.target.value)}
                className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                placeholder="Map title"
              />
              <textarea
                value={drafts[option.key]?.subtitle || option.subtitle}
                onChange={(event) => onDraftChange(option.key, "subtitle", event.target.value)}
                className="min-h-[62px] w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                placeholder="Map subtitle"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span />
              <button
                type="button"
                onClick={() => onAddMap(option.key)}
                disabled={runningKey !== null}
                className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                style={{ borderColor: c.line, color: c.secondary, background: c.card }}
              >
                {runningKey === option.key ? "Adding…" : "Add Map"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function JobStepsView() {
  const { activeCompany } = useCompany();
  const auditMode = isGenericAuditCompany(activeCompany);
  const activeCompanyId = activeCompany?.id ?? null;
  const {
    loading,
    items,
    error,
    updatingStepId,
    updateStepText,
    removingJourneyKey,
    removeJourneyMap,
    refetch: refetchJobSteps,
  } = useJobSteps(activeCompanyId ?? undefined);
  const { run: baselineRun, refetch: refetchBaseline } = usePublicBaseline(activeCompanyId ?? undefined);
  const { item: strategyCascade } = useStrategyCascade(activeCompanyId ?? undefined);
  const { item: positioningCanvas } = usePositioningCanvas(activeCompanyId ?? undefined);
  const { items: strategicProblems } = useStrategicProblems(activeCompanyId ?? undefined);
  const { query: inputsQuery } = useInputs(activeCompanyId ?? undefined);
  const [odiRefreshKey, setOdiRefreshKey] = useState(0);
  const { marketDefinition, needs, error: odiError, updateNeedScores, updateMarketDefinition } = useOdiNeeds(activeCompanyId ?? undefined, odiRefreshKey);
  const { data: localAlignment } = useLatestLocalAlignment(activeCompanyId ?? undefined);
  const runLocalAlignment = useRunLocalAlignment(activeCompanyId ?? undefined);
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompanyId ?? undefined,
    areaScoresJson: activeCompany?.area_scores_json,
  });
  const [journeyDrafts, setJourneyDrafts] = useState<JourneyDraftMap>({});
  const [customMapDraft, setCustomMapDraft] = useState({ key: "", title: "", subtitle: "" });
  const [runningJourneyKey, setRunningJourneyKey] = useState<string | null>(null);
  const [showChooseMaps, setShowChooseMaps] = useState(true);
  const [showCustomMapForm, setShowCustomMapForm] = useState(false);
  const [recentlyRemovedKeysByCompany, setRecentlyRemovedKeysByCompany] = useState<Record<string, string[]>>({});
  const [removingNeedId, setRemovingNeedId] = useState<string | null>(null);
  const [updatingNeedId, setUpdatingNeedId] = useState<string | null>(null);
  const [reorderingNeeds, setReorderingNeeds] = useState(false);
  const [removingPublicNeeds, setRemovingPublicNeeds] = useState(false);
  const [removingPublicMarketContextAction, setRemovingPublicMarketContextAction] = useState<"remove" | "remove_and_rerun" | null>(null);
  const [resettingPublicResearchArtifacts, setResettingPublicResearchArtifacts] = useState(false);
  const [savingOdiContext, setSavingOdiContext] = useState(false);

  const scopedBaselineRun = useMemo(() => {
    if (!activeCompanyId || !baselineRun) return null;
    return baselineRun?.company_id === activeCompanyId ? baselineRun : null;
  }, [activeCompanyId, baselineRun]);

  const recentlyRemovedKeys = useMemo(() => {
    if (!activeCompanyId) return [];
    return recentlyRemovedKeysByCompany[activeCompanyId] ?? [];
  }, [activeCompanyId, recentlyRemovedKeysByCompany]);
  const marketAlignment = localAlignment?.areas?.market ?? null;
  const odiAlignment = localAlignment?.areas?.odi ?? null;
  const uploadedFileCount = useMemo(
    () => (inputsQuery.data ?? []).reduce((sum, input) => sum + input.files.length, 0),
    [inputsQuery.data],
  );

  useEffect(() => {
    setJourneyDrafts({});
    setCustomMapDraft({ key: "", title: "", subtitle: "" });
    setRunningJourneyKey(null);
    setShowChooseMaps(true);
    setShowCustomMapForm(false);
  }, [activeCompanyId]);

  const journeys = useMemo(() => groupJourneys(items), [items]);
  const activeCustomerJourneyTitle = useMemo(() => {
    const customerJourney = journeys.find((journey) => journey.key === "customer");
    if (customerJourney) return customerJourney.title;
    const customCustomerJourney = journeys.find((journey) => journey.key.startsWith("customer-"));
    return customCustomerJourney?.title ?? null;
  }, [journeys]);
  const activeCustomerJourneySubtitle = useMemo(() => {
    const customerJourney = journeys.find((journey) => journey.key === "customer");
    if (customerJourney) return customerJourney.subtitle;
    const customCustomerJourney = journeys.find((journey) => journey.key.startsWith("customer-"));
    return customCustomerJourney?.subtitle ?? null;
  }, [journeys]);
  const activeCustomerJourneyGroup = useMemo(() => {
    const customerJourney = journeys.find((journey) => journey.key === "customer");
    if (customerJourney) return customerJourney;
    return journeys.find((journey) => journey.key.startsWith("customer-")) ?? null;
  }, [journeys]);
  const totalGaps = useMemo(
    () => journeys.reduce((sum, journey) => sum + journey.steps.filter((step) => hasAssessedGap(step)).length, 0),
    [journeys]
  );
  const pendingAssessmentTotal = useMemo(
    () =>
      journeys.reduce((sum, journey) => sum + journey.steps.filter((step) => isDraftPlaceholderStep(step)).length, 0),
    [journeys],
  );
  const suggestedJourneyOptions = useMemo(() => {
    const inferred = inferSuggestedJourneyOptions({
      baselineRun: scopedBaselineRun,
      journeys,
      inputs: inputsQuery.data ?? [],
      strategicProblems,
      whereToPlay: strategyCascade?.where_to_play ?? "",
      howToWin: strategyCascade?.how_to_win ?? "",
    });
    const byKey = new Map<JourneyKey, SuggestedJourneyOption>(inferred.map((option) => [option.key, option]));
    for (const key of recentlyRemovedKeys) {
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          title: titleFromKey(key),
          subtitle: subtitleFromKey(key),
          confidence: 70,
          rationale: "Previously removed map. Add it again any time.",
        });
      }
    }
    return Array.from(byKey.values()).sort((a, b) => b.confidence - a.confidence);
  }, [scopedBaselineRun, journeys, recentlyRemovedKeys, inputsQuery.data, strategicProblems, strategyCascade?.where_to_play, strategyCascade?.how_to_win]);
  useEffect(() => {
    setJourneyDrafts((previous) => {
      const next = { ...previous };
      for (const option of suggestedJourneyOptions) {
        const current = next[option.key] || { title: "", subtitle: "" };
        next[option.key] = {
          title: safeText(current.title, option.title),
          subtitle: safeText(current.subtitle, option.subtitle),
        };
      }
      return next;
    });
  }, [suggestedJourneyOptions]);

  const updateJourneyDraft = (key: string, field: "title" | "subtitle", value: string) => {
    setJourneyDrafts((previous) => ({
      ...previous,
      [key]: {
        ...previous[key],
        [field]: value,
      },
    }));
  };

  const insertLocalDraftMap = async (args: {
    key: string;
    title: string;
    subtitle: string;
    checkpointSeed?: Array<{ label: string; description: string }>;
  }) => {
    if (!activeCompanyId) throw new Error("No active company selected.");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) {
      throw new Error("Sign in required to add a local checkpoint map draft.");
    }

    const { data: existingRows, error: existingErr } = await supabase
      .from("job_steps")
      .select("id")
      .eq("company_id", activeCompanyId)
      .eq("journey_key", args.key)
      .limit(1);
    if (existingErr) throw new Error(existingErr.message || "Failed to verify existing map.");
    if ((existingRows ?? []).length > 0) return false;

    const draftCheckpointSeed = Array.isArray(args.checkpointSeed) && args.checkpointSeed.length === JTBD_CHECKPOINT_COUNT
      ? args.checkpointSeed
      : LOCAL_ODI_STEP_SEED;
    const rows = draftCheckpointSeed.map((seed, index) => ({
      company_id: activeCompanyId,
      user_id: authData.user.id,
      journey_key: args.key,
      journey_title: args.title,
      journey_subtitle: args.subtitle,
      step_number: index + 1,
      step_label: seed.label,
      description: seed.description,
      designed: false,
      has_gap: true,
      evidence_status: "unclear",
      evidence_basis: "Local draft step generated without external model run.",
      evidence_confidence: 20,
      gap_note: "Awaiting evidence-backed research and validation.",
    }));

    const { error: insertErr } = await supabase.from("job_steps").insert(rows);
    if (insertErr) throw new Error(insertErr.message || "Failed to insert local checkpoint map draft.");
    return true;
  };

  const currentSelectedMapsForSynthesis = () => {
    const maps = journeys.map((journey) => ({
      journey_key: journey.key,
      journey_title: safeText(journey.title, titleFromKey(journey.key)),
      journey_subtitle: safeText(journey.subtitle, subtitleFromKey(journey.key)),
    }));
    if (maps.length === 0) {
      return [
        {
          journey_key: "customer",
          journey_title: titleFromKey("customer"),
          journey_subtitle: subtitleFromKey("customer"),
        },
      ];
    }
    return maps;
  };

  const invokeLocalJobMapSynthesis = async (args: {
    selectedJobMaps: Array<{ journey_key: string; journey_title: string; journey_subtitle: string }>;
    trigger: string;
  }) => {
    if (!activeCompany?.id) throw new Error("Select a company before running local synthesis.");

    const invocation = await supabase.functions.invoke("local-jobmap-synthesis", {
      body: {
        company_id: activeCompany.id,
        selected_job_maps: args.selectedJobMaps,
        trigger: args.trigger,
      },
    });

    if (invocation.error) {
      throw new Error(await describeJobMapInvokeError(invocation.error));
    }

    const payload =
      invocation.data && typeof invocation.data === "object"
        ? (invocation.data as {
            error?: unknown;
            summary?: {
              selected_maps?: number;
              journeys_generated?: number;
              steps_inserted?: number;
              odi_needs_inserted?: number;
            };
            artifacts?: {
              journeys?: Array<{ journey_key?: string; journey_title?: string; step_count?: number }>;
            };
          })
        : null;

    if (payload?.error) {
      throw new Error(String(payload.error));
    }

    return payload;
  };

  const runAddMap = async (args: {
    key: string;
    title?: string;
    subtitle?: string;
    source?: "suggested" | "custom";
  }) => {
    if (!activeCompany?.id) {
      toast.error("Select a company before running journey research.");
      return;
    }
    const key = normalizeJourneyKey(args.key);
    if (!key) {
      toast.error("Enter a valid map key.");
      return;
    }

    try {
      setRunningJourneyKey(key);
      const { data: activeLock } = await supabase
        .from("company_run_locks")
        .select("operation, started_at, expires_at")
        .eq("company_id", activeCompany.id)
        .maybeSingle();

      if (activeLock?.operation === "research") {
        const started = activeLock.started_at
          ? new Date(activeLock.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
          : "recently";
        toast.message(`Research is already running (started ${started}). We’ll keep this map request queued after it completes.`);
        return;
      }

      const jobMap = {
        journey_key: key,
        journey_title: safeText(args.title, titleFromKey(key)),
        journey_subtitle: safeText(args.subtitle, subtitleFromKey(key)),
        source: args.source || "custom",
      };
      const existingCustomerJourney = journeys.find((journey) => journey.key === "customer");
      const customerSupportMap =
        key !== "customer" && existingCustomerJourney
          ? {
              journey_key: "customer",
              journey_title: safeText(existingCustomerJourney.title, titleFromKey("customer")),
              journey_subtitle: safeText(existingCustomerJourney.subtitle, subtitleFromKey("customer")),
              source: "existing" as const,
            }
          : null;
      const jobMapsPayload = customerSupportMap ? [customerSupportMap, jobMap] : [jobMap];

      const runResearchMap = async () =>
        invokeFunctionWithTimeout(
          () =>
            supabase.functions.invoke("research-company", {
              body: {
                company_id: activeCompany.id,
                company_name: activeCompany.name,
                website: activeCompany.website ?? "",
                journeys_to_generate: [key],
                job_maps: jobMapsPayload,
                review_mode: "advisory",
              },
            }),
          90_000,
        );

      let data: { error?: unknown; message?: unknown } | null = null;
      let invokeError: unknown;
      try {
        const first = await runResearchMap();
        data =
          first?.data && typeof first.data === "object"
            ? (first.data as { error?: unknown; message?: unknown })
            : null;
        invokeError = first?.error;
      } catch (err) {
        if (err instanceof InvokeTimeoutError) {
          await Promise.all([refetchJobSteps(), refetchBaseline()]);
          toast.message(err.message);
          return;
        }
        throw err;
      }
      let invokeMessage = invokeError ? await describeJobMapInvokeError(invokeError) : "";

      if (invokeError && shouldAttemptBaselineRetry(invokeMessage)) {
        toast.message("Refreshing public baseline, then retrying map generation once.");
        const { error: baselineErr } = await supabase.functions.invoke("public-baseline", {
          body: {
            company_id: activeCompany.id,
            company_name: activeCompany.name,
            website: activeCompany.website ?? "",
          },
        });
        if (!baselineErr) {
          await refetchBaseline();
          try {
            const retry = await runResearchMap();
            data =
              retry?.data && typeof retry.data === "object"
                ? (retry.data as { error?: unknown; message?: unknown })
                : null;
            invokeError = retry?.error;
          } catch (retryErr) {
            if (retryErr instanceof InvokeTimeoutError) {
              await Promise.all([refetchJobSteps(), refetchBaseline()]);
              toast.message(retryErr.message);
              return;
            }
            throw retryErr;
          }
          invokeMessage = invokeError ? await describeJobMapInvokeError(invokeError) : "";
        } else {
          const baselineMessage = await describeJobMapInvokeError(baselineErr);
          invokeMessage = `${invokeMessage}. Baseline refresh failed: ${baselineMessage}`;
        }
      }

      if (invokeError) {
        if (shouldUseLocalMapFallback(invokeMessage)) {
          let localSynthesisPayload:
            | {
                summary?: {
                  journeys_generated?: number;
                  odi_needs_inserted?: number;
                };
                artifacts?: {
                  journeys?: Array<{ journey_key?: string }>;
                };
              }
            | null = null;
          let localSynthesisError: string | null = null;

          try {
            localSynthesisPayload = await invokeLocalJobMapSynthesis({
              selectedJobMaps: jobMapsPayload.map((entry) => ({
                journey_key: entry.journey_key,
                journey_title: entry.journey_title,
                journey_subtitle: entry.journey_subtitle,
              })),
              trigger: `jobsteps_add_map:${key}`,
            });
          } catch (synthesisErr) {
            localSynthesisError = synthesisErr instanceof Error ? synthesisErr.message : String(synthesisErr);
          }

          const generatedJourneyKeys = new Set(
            (localSynthesisPayload?.artifacts?.journeys ?? [])
              .map((entry) => normalizeJourneyKey(entry?.journey_key))
              .filter(Boolean),
          );
          let insertedDraft = false;
          if (!generatedJourneyKeys.has(key)) {
            insertedDraft = await insertLocalDraftMap({
              key,
              title: jobMap.journey_title,
              subtitle: jobMap.journey_subtitle,
              checkpointSeed: checkpointSeedForJourneyKey(key),
            });
          }

          await Promise.all([refetchJobSteps(), refetchBaseline()]);
          if (generatedJourneyKeys.has(key)) {
            toast.success(
              `${titleCaseJourney(key)} map generated from local synthesis (${localSynthesisPayload?.summary?.journeys_generated ?? 0} map(s), ${localSynthesisPayload?.summary?.odi_needs_inserted ?? 0} need(s)).`,
            );
          } else if (insertedDraft) {
            toast.success(`${titleCaseJourney(key)} map added as a local draft.`);
            toast.message(
              localSynthesisError
                ? `Local synthesis was unavailable (${localSynthesisError}).`
                : "Local synthesis did not return the requested map key, so a draft was added.",
            );
          } else {
            toast.message(`${titleCaseJourney(key)} map already exists.`);
          }
          return;
        }
        throw new Error(invokeMessage);
      }
      if (data?.error) {
        throw new Error(String(data.message || data.error));
      }

      await Promise.all([refetchJobSteps(), refetchBaseline()]);
      if (activeCompanyId) {
        setRecentlyRemovedKeysByCompany((previous) => ({
          ...previous,
          [activeCompanyId]: (previous[activeCompanyId] ?? []).filter((removed) => removed !== key),
        }));
      }
      toast.success(`${titleCaseJourney(key)} map added.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add checkpoint map.");
    } finally {
      setRunningJourneyKey(null);
    }
  };

  const addMap = async (key: string) => {
    const draft = journeyDrafts[key];
    const suggested = suggestedJourneyOptions.find((option) => option.key === key);
    const fallbackTitle = suggested?.title || titleFromKey(key);
    const fallbackSubtitle = suggested?.subtitle || subtitleFromKey(key);
    await runAddMap({
      key,
      title: safeText(draft?.title, fallbackTitle),
      subtitle: safeText(draft?.subtitle, fallbackSubtitle),
      source: draft?.title || draft?.subtitle ? "custom" : "suggested",
    });
  };

  const addCustomMap = async () => {
    const derivedKey = normalizeJourneyKey(customMapDraft.key || customMapDraft.title);
    if (!derivedKey) {
      toast.error("Enter a custom map key or title.");
      return;
    }
    await runAddMap({
      key: derivedKey,
      title: safeText(customMapDraft.title, titleFromKey(derivedKey)),
      subtitle: safeText(customMapDraft.subtitle, subtitleFromKey(derivedKey)),
      source: "custom",
    });
    setCustomMapDraft({ key: "", title: "", subtitle: "" });
  };

  const handleUpdateStepText = async (
    stepId: string,
    values: { step_label: string; description: string },
  ) => {
    await updateStepText(stepId, values);
  };

  const handleReorderNeeds = async (orderedNeedIds: string[]) => {
    if (!activeCompanyId) throw new Error("Select a company before reordering needs.");
    const ids = Array.isArray(orderedNeedIds)
      ? orderedNeedIds.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [];
    if (ids.length === 0) return;

    const expectedNeedIds = needs.map((item) => item.id).sort();
    const sortedIds = [...ids].sort();
    if (
      expectedNeedIds.length !== sortedIds.length ||
      expectedNeedIds.some((id, index) => id !== sortedIds[index])
    ) {
      throw new Error("Need reorder payload did not match current needs.");
    }

    setReorderingNeeds(true);
    try {
      const needById = new Map(needs.map((item) => [item.id, item]));
      const updateCalls = ids.map((id, index) =>
        {
          const current = needById.get(id);
          const nextFrameworks = Array.from(
            new Set([...(current?.frameworks_used ?? []), "manual_override"]),
          );
          return supabase
            .from("odi_needs")
            .update({ sort_order: index + 1, frameworks_used: nextFrameworks })
            .eq("company_id", activeCompanyId)
            .eq("id", id);
        },
      );
      const results = await Promise.all(updateCalls);
      const errors = results
        .map((result) => result.error?.message)
        .filter((message): message is string => Boolean(message));
      if (errors.length > 0) {
        throw new Error(errors.join(" | "));
      }
    } finally {
      setReorderingNeeds(false);
    }
  };

  const handleUpdateNeedText = async (
    needId: string,
    values: { desired_outcome: string },
  ) => {
    if (!activeCompanyId) throw new Error("Select a company before editing needs.");
    const id = String(needId || "").trim();
    if (!id) throw new Error("Missing need id.");
    const desiredOutcome = String(values.desired_outcome || "").trim();
    if (!desiredOutcome) throw new Error("Need text cannot be empty.");

    setUpdatingNeedId(id);
    try {
      const { error: updateError } = await supabase
        .from("odi_needs")
        .update({ desired_outcome: desiredOutcome })
        .eq("company_id", activeCompanyId)
        .eq("id", id);
      if (updateError) {
        throw new Error(updateError.message || "Failed to update need.");
      }
    } finally {
      setUpdatingNeedId(null);
    }
  };

  const handleUpdateNeedScores = async (needId: string, importance: number, satisfaction: number) => {
    try {
      await updateNeedScores(needId, importance, satisfaction);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update scores.");
    }
  };

  const handleSaveOdiContextEdits = async (values: {
    marketContext: string;
    jobExecutor: string;
    chooser: string;
    jtbd: string;
  }) => {
    if (!activeCompanyId || !activeCompany?.id) {
      throw new Error("Select a company before editing market context.");
    }

    const marketContextValue = String(values.marketContext || "").trim();
    const jobExecutorValue = String(values.jobExecutor || "").trim();
    const chooserValue = String(values.chooser || "").trim();
    const jtbdValue = String(values.jtbd || "").trim();

    if (!marketContextValue || !jobExecutorValue || !chooserValue || !jtbdValue) {
      throw new Error("Market context, job executor, chooser, and JTBD are required.");
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      throw new Error("Sign in required to save market context edits.");
    }
    const userId = authData.user.id;

    setSavingOdiContext(true);
    try {
      const marketFrameworks = Array.from(
        new Set([...(marketDefinition?.frameworks_used ?? []), "odi", "manual_override"]),
      );
      const nowIso = new Date().toISOString();

      const { data: updatedMarket, error: updateMarketError } = await supabase
        .from("odi_market_definitions")
        .update({
          job_executor: jobExecutorValue,
          chooser: chooserValue,
          jtbd: jtbdValue,
          source_path: "manual_context_edit",
          frameworks_used: marketFrameworks,
          updated_at: nowIso,
        })
        .eq("company_id", activeCompanyId)
        .select("id")
        .maybeSingle();
      if (updateMarketError) {
        throw new Error(updateMarketError.message || "Failed to update Strategic Decision System market context.");
      }
      if (!updatedMarket?.id) {
        const { error: insertMarketError } = await supabase.from("odi_market_definitions").insert({
          company_id: activeCompanyId,
          user_id: userId,
          job_executor: jobExecutorValue,
          chooser: chooserValue,
          jtbd: jtbdValue,
          source_path: "manual_context_edit",
          frameworks_used: marketFrameworks,
        });
        if (insertMarketError) {
          throw new Error(insertMarketError.message || "Failed to insert Strategic Decision System market context.");
        }
      }

      const { data: updatedCascade, error: updateCascadeError } = await supabase
        .from("strategy_cascades")
        .update({
          where_to_play: marketContextValue,
          updated_at: nowIso,
        })
        .eq("company_id", activeCompanyId)
        .select("id")
        .maybeSingle();
      if (updateCascadeError) {
        throw new Error(updateCascadeError.message || "Failed to update strategy market context.");
      }
      if (!updatedCascade?.id) {
        const { error: insertCascadeError } = await supabase.from("strategy_cascades").insert({
          company_id: activeCompanyId,
          user_id: userId,
          where_to_play: marketContextValue,
          frameworks_used: ["manual_override"],
        });
        if (insertCascadeError) {
          throw new Error(insertCascadeError.message || "Failed to insert strategy market context.");
        }
      }

      await runLocalAlignment.mutateAsync({
        areas: ["positioning", "strategy", "market", "odi"],
        trigger: "manual_market_context_saved",
        applyScoreUpdate: true,
        ignorePublicBaseline: true,
      });

      let usedLocalSynthesis = false;
      let usedDraftFallback = false;
      if (uploadedFileCount > 0) {
        try {
          await runResearchFromUploadedEvidence();
        } catch (researchErr) {
          const researchMessage = researchErr instanceof Error ? researchErr.message : String(researchErr);
          if (!shouldUseLocalMapFallback(researchMessage)) {
            throw researchErr;
          }

          try {
            await invokeLocalJobMapSynthesis({
              selectedJobMaps: currentSelectedMapsForSynthesis(),
              trigger: "jobsteps_save_context_fallback",
            });
            usedLocalSynthesis = true;
          } catch (localErr) {
            const localMessage = localErr instanceof Error ? localErr.message : String(localErr);
            const inserted = await insertLocalDraftMap({
              key: "customer",
              title: safeText(activeCustomerJourneyTitle, titleFromKey("customer")),
              subtitle: safeText(activeCustomerJourneySubtitle, subtitleFromKey("customer")),
              checkpointSeed: checkpointSeedForJourneyKey("customer"),
            });
            usedDraftFallback = inserted;
            if (!inserted) {
              throw new Error(`${researchMessage}. Local synthesis fallback failed: ${localMessage}`);
            }
          }
        }
      }

      await Promise.all([refetchJobSteps(), refetchBaseline(), inputsQuery.refetch()]);
      refreshOdi();

      if (uploadedFileCount > 0) {
        if (usedLocalSynthesis) {
          toast.success("Saved context edits and regenerated checkpoint map + Strategic Decision System artifacts through local synthesis.");
        } else if (usedDraftFallback) {
          toast.success("Saved context edits and added a local draft customer map while model-backed synthesis is unavailable.");
        } else {
          toast.success("Saved context edits and regenerated downstream artifacts.");
        }
      } else {
        toast.success("Saved context edits and refreshed alignment. Upload files to regenerate full artifacts.");
      }
    } finally {
      setSavingOdiContext(false);
    }
  };

  const handleRemoveJourneyMap = async (key: string) => {
    if (!activeCompany?.id) {
      toast.error("Select a company before removing a checkpoint map.");
      return;
    }

    const confirmed = window.confirm(
      `Remove the ${titleCaseJourney(key)} checkpoint map from this company? This deletes its current checkpoint map.`,
    );
    if (!confirmed) return;

    try {
      await removeJourneyMap(key);
      if (activeCompanyId) {
        setRecentlyRemovedKeysByCompany((previous) => {
          const current = previous[activeCompanyId] ?? [];
          return {
            ...previous,
            [activeCompanyId]: current.includes(key) ? current : [...current, key],
          };
        });
      }
      toast.success(
        key === "customer"
          ? "Customer checkpoint map and related opportunities, Strategic Decision System needs, outcomes, and routes removed."
          : `${titleCaseJourney(key)} checkpoint map and related opportunities/Strategic Decision System needs removed.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove checkpoint map.");
    }
  };

  const refreshOdi = () => setOdiRefreshKey((current) => current + 1);

  const runResearchFromUploadedEvidence = async () => {
    if (!activeCompany?.id) {
      throw new Error("Select a company before regenerating research artifacts.");
    }
    const selectedJourneyKey =
      normalizeJourneyKey(activeCustomerJourneyGroup?.key || "customer") || "customer";

    const formatLockTime = (value?: string | null) => {
      if (!value) return "soon";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    };

    const { data: existingLock } = await supabase
      .from("company_run_locks")
      .select("operation,started_at,expires_at")
      .eq("company_id", activeCompany.id)
      .maybeSingle();
    if (existingLock?.operation === "research") {
      throw new Error(
        `Artifact regeneration is already running (started ${formatLockTime(existingLock.started_at)}; lock expires ${formatLockTime(existingLock.expires_at)}).`,
      );
    }

    let invokeRes:
      | { error: unknown; data: unknown }
      | null = null;

    try {
      invokeRes = await invokeFunctionWithTimeout(
        () =>
          supabase.functions.invoke("run-agent-flow", {
            body: {
              company_id: activeCompany.id,
              company_name: activeCompany.name,
              website: activeCompany.website ?? "",
              // Keep regeneration scoped to the selected customer journey context.
              journey_key: selectedJourneyKey,
              mode: "uploaded_only",
              include_public_collection: false,
              include_local_alignment: false,
              apply_score_update: false,
              trigger: "jobsteps_uploaded_rerun",
              review_mode: "advisory",
              allow_review_block_save: true,
            },
          }),
        95_000,
      );
    } catch (error) {
      if (error instanceof InvokeTimeoutError) {
        const { data: lockAfterTimeout } = await supabase
          .from("company_run_locks")
          .select("operation,started_at,expires_at")
          .eq("company_id", activeCompany.id)
          .maybeSingle();
        if (lockAfterTimeout?.operation === "research") {
          throw new Error(
            `Artifact regeneration is still running (started ${formatLockTime(lockAfterTimeout.started_at)}; lock expires ${formatLockTime(lockAfterTimeout.expires_at)}).`,
          );
        }
      }
      throw error;
    }

    const researchErr = invokeRes?.error;
    const researchData = invokeRes?.data;

    const researchPayload =
      researchData && typeof researchData === "object"
        ? (researchData as { error?: unknown; message?: unknown })
        : null;
    if (researchErr) {
      throw new Error(await describeJobMapInvokeError(researchErr));
    }
    if (researchPayload?.error) {
      throw new Error(String(researchPayload.message || researchPayload.error));
    }
  };

  const handleRemoveNeed = async (needId: string) => {
    if (!activeCompanyId) {
      toast.error("Select a company before removing a need.");
      return;
    }
    setRemovingNeedId(needId);
    try {
      const { error: deleteErr } = await supabase
        .from("odi_needs")
        .delete()
        .eq("company_id", activeCompanyId)
        .eq("id", needId);
      if (deleteErr) throw new Error(deleteErr.message || "Failed to remove need.");
      refreshOdi();
      toast.success("Need removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove need.");
    } finally {
      setRemovingNeedId(null);
    }
  };

  const handleRemovePublicNeeds = async () => {
    if (!activeCompanyId) {
      toast.error("Select a company before removing public needs.");
      return;
    }
    const publicNeedIds = needs.filter((item) => isPublicSourcePath(item.source_path)).map((item) => item.id);
    if (publicNeedIds.length === 0) {
      toast.message("No public-source needs to remove.");
      return;
    }
    setRemovingPublicNeeds(true);
    try {
      const { error: deleteErr } = await supabase
        .from("odi_needs")
        .delete()
        .eq("company_id", activeCompanyId)
        .in("id", publicNeedIds);
      if (deleteErr) throw new Error(deleteErr.message || "Failed to remove public needs.");
      refreshOdi();
      toast.success(`Removed ${publicNeedIds.length} public Strategic Decision System need${publicNeedIds.length === 1 ? "" : "s"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove public needs.");
    } finally {
      setRemovingPublicNeeds(false);
    }
  };

  const removePublicMarketContextRecord = async () => {
    if (!activeCompanyId) {
      toast.error("Select a company before removing public market context.");
      return false;
    }
    if (!marketDefinition?.id || !isPublicSourcePath(marketDefinition.source_path)) {
      toast.message("No public-source market context row to remove.");
      return false;
    }
    const { error: deleteErr } = await supabase
      .from("odi_market_definitions")
      .delete()
      .eq("company_id", activeCompanyId)
      .eq("id", marketDefinition.id);
    if (deleteErr) {
      throw new Error(deleteErr.message || "Failed to remove market context.");
    }
    refreshOdi();
    return true;
  };

  const handleRemovePublicMarketContext = async () => {
    setRemovingPublicMarketContextAction("remove");
    try {
      const removed = await removePublicMarketContextRecord();
      if (!removed) return;
      toast.success("Public market context removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove market context.");
    } finally {
      setRemovingPublicMarketContextAction(null);
    }
  };

  const handleRemovePublicMarketContextAndRerun = async () => {
    setRemovingPublicMarketContextAction("remove_and_rerun");
    let removed = false;
    try {
      removed = await removePublicMarketContextRecord();
      if (!removed) return;

      if (uploadedFileCount <= 0) {
        toast.success("Public market context removed.");
        toast.message("No uploaded files found, so rerun was skipped.");
        return;
      }

      await runLocalAlignment.mutateAsync({
        areas: ["positioning", "strategy", "market", "odi"],
        trigger: "public_market_context_removed",
        applyScoreUpdate: true,
        ignorePublicBaseline: true,
      });
      await runResearchFromUploadedEvidence();
      await Promise.all([refetchJobSteps(), refetchBaseline(), inputsQuery.refetch()]);
      refreshOdi();
      toast.success("Public market context removed. Re-ran local comparison and regenerated artifacts from uploaded files.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Rerun failed.";
      if (removed) {
        if (/still running|already running/i.test(message)) {
          toast.message(`Public market context was removed. ${message}`);
        } else {
          toast.error(`Public market context was removed, but rerun failed: ${message}`);
        }
      } else {
        toast.error(message);
      }
    } finally {
      setRemovingPublicMarketContextAction(null);
    }
  };

  const handleResetPublicResearchArtifacts = async () => {
    if (!activeCompanyId) {
      toast.error("Select a company before resetting public research artifacts.");
      return;
    }

    const confirmed = window.confirm(
      "Reset false public research artifacts for this company?\n\nThis removes generated job checkpoints, opportunities, routes, strategy/positioning drafts, and public research snapshots.\nUploaded files stay in place.",
    );
    if (!confirmed) return;

    setResettingPublicResearchArtifacts(true);
    try {
      const errors: string[] = [];
      const captureError = (table: string, error: { message?: string } | null) => {
        if (!error) return;
        if (isMissingTableError(error.message || "", table)) return;
        errors.push(`${table}: ${error.message || "unknown error"}`);
      };

      const runDelete = async (table: string) => {
        const { error } = await supabase.from(table as never).delete().eq("company_id", activeCompanyId);
        captureError(table, error);
      };

      await runDelete("job_steps");
      await runDelete("opportunities");
      await runDelete("routes");
      await runDelete("strategy_cascades");
      await runDelete("positioning_canvases");

      const { error: needsError } = await supabase
        .from("odi_needs")
        .delete()
        .eq("company_id", activeCompanyId)
        .or("source_path.ilike.%public%");
      captureError("odi_needs", needsError);

      const { error: marketDefError } = await supabase
        .from("odi_market_definitions")
        .delete()
        .eq("company_id", activeCompanyId)
        .or("source_path.ilike.%public%");
      captureError("odi_market_definitions", marketDefError);

      const spClient = supabase as unknown as {
        from: (table: string) => {
          delete: () => {
            eq: (
              column: string,
              value: string,
            ) => {
              in: (
                column: string,
                values: string[],
              ) => Promise<{ error: { message?: string } | null }>;
            };
          };
        };
      };
      const { error: strategicProblemsError } = await spClient
        .from("strategy_problem_statements")
        .delete()
        .eq("company_id", activeCompanyId)
        .in("source", ["public", "evidence"]);
      captureError("strategy_problem_statements", strategicProblemsError);

      const { error: reviewRunsError } = await supabase
        .from("research_review_runs")
        .delete()
        .eq("company_id", activeCompanyId);
      captureError("research_review_runs", reviewRunsError);

      const { error: artifactRunsError } = await supabase
        .from("research_artifact_runs")
        .delete()
        .eq("company_id", activeCompanyId);
      captureError("research_artifact_runs", artifactRunsError);

      const { error: baselineRunsError } = await supabase
        .from("public_baseline_runs")
        .delete()
        .eq("company_id", activeCompanyId);
      captureError("public_baseline_runs", baselineRunsError);

      const { error: companyUpdateError } = await supabase
        .from("companies")
        .update({
          mojo_score: 0,
          potential_score: 0,
          projected_score: 0,
          evidence_status: "no_public_evidence",
          evidence_note:
            "Public research artifacts were reset because public evidence was inaccurate or too weak. Continue from uploaded company files.",
        })
        .eq("id", activeCompanyId);
      captureError("companies", companyUpdateError);

      if (errors.length > 0) {
        throw new Error(`Reset completed with issues: ${errors.join(" | ")}`);
      }

      await Promise.all([
        refetchJobSteps(),
        refetchBaseline(),
        inputsQuery.refetch(),
      ]);
      refreshOdi();

      if (uploadedFileCount > 0) {
        try {
          await runLocalAlignment.mutateAsync({
            areas: ["positioning", "strategy", "market", "odi"],
            trigger: "public_artifacts_reset",
            applyScoreUpdate: true,
            ignorePublicBaseline: true,
          });
          await runResearchFromUploadedEvidence();
          await Promise.all([refetchJobSteps(), refetchBaseline(), inputsQuery.refetch()]);
          refreshOdi();
          toast.success("False public artifacts removed. Regenerated map, Strategic Decision System context, market context, and strategy from uploaded evidence.");
        } catch (rerunError) {
          const rerunMessage = rerunError instanceof Error ? rerunError.message : "unknown error";
          if (/still running|already running/i.test(rerunMessage)) {
            toast.message(`False public artifacts removed. ${rerunMessage}`);
            return;
          }
          toast.error(
            `False public artifacts removed, but rerun failed: ${
              rerunMessage
            }`,
          );
        }
      } else {
        toast.success("False public artifacts removed. Upload files to rebuild local evidence.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset public research artifacts.");
    } finally {
      setResettingPublicResearchArtifacts(false);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background: c.bg,
        backgroundImage:
          'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23000\' fill-opacity=\'0.025\'%3E%3Cpath d=\'M5 0h1L0 5V4zM6 5v1H5z\'/%3E%3C/g%3E%3C/svg%3E")',
      }}
    >
      <TopNav />

      <main className="max-w-[1440px] mx-auto px-4 pb-12 pt-6 sm:px-6 md:px-8">
        <PageContextStatus lastScoredAt={activeCompany?.last_scored_at} sourceSignals={sourceSignals} />

        <div className="mb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                {activeCompany?.name || "No company selected"}
              </div>
              <h1 className="mt-1 font-sans text-[28px] font-semibold" style={{ color: c.charcoal }}>
                Job Checkpoints Map
              </h1>
              <p className="mojo-under-title font-sans text-[14px] mojo-desc" style={{ color: c.secondary }}>
                Select and define Strategic Decision System-style checkpoint maps first, then run research to generate checkpoints and aligned opportunities.
              </p>
            </div>

            <Link
              to="/"
              className="rounded-full border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em]"
              style={{ borderColor: c.line, color: c.secondary, background: c.card }}
            >
              Back to Map
            </Link>
          </div>
          <GenericAuditTraceNote
            active={auditMode}
            className="mt-3 max-w-5xl"
            source="job_steps, Strategic Decision System market definitions, Strategic Decision System needs, strategic_problems, and baseline/source_path provenance."
            evaluation="AI proposes map structure, then journey and evidence logic classify what is public vs uploaded context and where clarity gaps remain."
            scoring="Strategic Decision System needs use importance, satisfaction, and opportunity score; gap states and evidence confidence shape priority readouts."
            why="This explains why each checkpoint/need exists, what evidence it came from, and which assumptions still need validation."
          />
        </div>

        <AiBoundaryNote
          label="Public Research"
          tone="public"
          className="mb-6 max-w-[780px]"
          detail="Map suggestions are inferred from public baseline signals. No checkpoint map is generated until you explicitly choose or define it."
        />

        {!activeCompany?.id ? (
          <div
            className="rounded-[24px] border px-6 py-12 text-center"
            style={{ borderColor: c.line, background: c.panel }}
          >
            <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
              Select a company to view its job-checkpoint journey map.
            </p>
          </div>
        ) : loading ? (
          <div
            className="rounded-[24px] border px-6 py-12 text-center"
            style={{ borderColor: c.line, background: c.panel }}
          >
            <p className="font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Loading checkpoints…
            </p>
          </div>
        ) : error ? (
          <div
            className="rounded-[24px] border px-6 py-12 text-center"
            style={{ borderColor: c.line, background: c.panel }}
          >
            <p className="font-sans text-[15px]" style={{ color: c.gap }}>
              Failed to load checkpoints: {error}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <OdiContextSection
              companyName={activeCompany?.name}
              marketDefinition={marketDefinition}
              odiError={odiError}
              needs={needs}
              marketContext={strategyCascade?.where_to_play}
              activeCustomerJourneyTitle={activeCustomerJourneyTitle}
              activeCustomerJourneySubtitle={activeCustomerJourneySubtitle}
              onRemovePublicMarketContext={handleRemovePublicMarketContext}
              onRemovePublicMarketContextAndRerun={handleRemovePublicMarketContextAndRerun}
              removingPublicMarketContextAction={removingPublicMarketContextAction}
              onSaveContextEdits={handleSaveOdiContextEdits}
              savingContextEdits={savingOdiContext}
              positioningCanvas={positioningCanvas}
              hasUploadedFiles={uploadedFileCount > 0}
              onResetPublicResearchArtifacts={handleResetPublicResearchArtifacts}
              resettingPublicResearchArtifacts={resettingPublicResearchArtifacts}
              onUpdateInnovationStrategy={async (strategy) => {
                await updateMarketDefinition({ innovation_strategy: strategy });
              }}
            />

            <ProcessFidelitySection
              marketDefinition={marketDefinition}
              marketContext={strategyCascade?.where_to_play}
              customerJourney={activeCustomerJourneyGroup}
              activeCustomerJourneyTitle={activeCustomerJourneyTitle}
              needs={needs}
              positioningCanvas={positioningCanvas}
            />

            <AreaAlignmentPanel
              title="Market Context"
              area={marketAlignment}
              run={localAlignment}
              lineColor={c.line}
              panelColor={c.panel}
              textColor={c.charcoal}
              mutedColor={c.muted}
            />

            <AreaAlignmentPanel
              title="SDS Needs"
              area={odiAlignment}
              run={localAlignment}
              lineColor={c.line}
              panelColor={c.panel}
              textColor={c.charcoal}
              mutedColor={c.muted}
            />

            <section
              className="rounded-[24px] border px-6 py-5"
              style={{ borderColor: c.line, background: c.panel }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-sans text-[18px] font-semibold" style={{ color: c.charcoal }}>
                    Checkpoint Map Selection
                  </p>
                  <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
                    Selected maps are shown first. Choose suggested maps or add a custom one as needed.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowChooseMaps((current) => !current)}
                    className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em]"
                    style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                  >
                    {showChooseMaps ? "Hide Choose Checkpoint Maps" : "Show Choose Checkpoint Maps"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCustomMapForm((current) => !current)}
                    className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em]"
                    style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                  >
                    {showCustomMapForm ? "Hide Add Custom" : "Show Add Custom"}
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border px-4 py-3" style={{ borderColor: c.line, background: c.paper }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                  Selected Checkpoint Maps
                </p>
                {journeys.length === 0 ? (
                  <p className="mt-2 font-sans text-[13px]" style={{ color: c.secondary }}>
                    No checkpoint map selected yet.
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {journeys.map((journey) => (
                      <div
                        key={`selected-${journey.key}`}
                        className="rounded-xl border px-3 py-2"
                        style={{ borderColor: c.line, background: "#fff" }}
                      >
                        <p
                          className="font-mono text-[10px] uppercase tracking-[0.1em]"
                          style={{ color: c.muted }}
                        >
                          {titleCaseJourney(journey.key)}
                        </p>
                        <p
                          className="mt-1 font-sans text-[14px] font-semibold leading-[1.35] break-words"
                          style={{ color: c.charcoal }}
                          title={journey.title}
                        >
                          {journey.title}
                        </p>
                        {safeText(journey.subtitle) ? (
                          <p
                            className="mt-1 font-sans text-[12px] leading-[1.5] break-words"
                            style={{ color: c.secondary }}
                            title={journey.subtitle}
                          >
                            {journey.subtitle}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {showChooseMaps ? (
                <div className="mt-4">
                  <SuggestedMapsSection
                    options={suggestedJourneyOptions}
                    drafts={journeyDrafts}
                    onDraftChange={updateJourneyDraft}
                    onAddMap={addMap}
                    runningKey={runningJourneyKey}
                  />
                </div>
              ) : null}

              {showCustomMapForm ? (
                <div className="mt-4 rounded-xl border p-4" style={{ borderColor: c.line, background: c.paper }}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                    Add Custom Checkpoint Map
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <input
                      value={customMapDraft.key}
                      onChange={(event) => setCustomMapDraft((prev) => ({ ...prev, key: event.target.value }))}
                      className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                      style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                      placeholder="Map key (optional, e.g. cafe-owner)"
                    />
                    <input
                      value={customMapDraft.title}
                      onChange={(event) => setCustomMapDraft((prev) => ({ ...prev, title: event.target.value }))}
                      className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                      style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                      placeholder="Map title (e.g. Checkpoint Map: Cafe Owner Buying)"
                    />
                    <input
                      value={customMapDraft.subtitle}
                      onChange={(event) => setCustomMapDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                      className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                      style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                      placeholder="Subtitle"
                    />
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={addCustomMap}
                      disabled={runningJourneyKey !== null}
                      className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                      style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                    >
                      {runningJourneyKey ? "Adding…" : "Add Custom Map"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            {journeys.length === 0 ? (
              <div
                className="rounded-[24px] border px-6 py-12 text-center"
                style={{ borderColor: c.line, background: c.panel }}
              >
                <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
                  No checkpoint map exists yet. Choose or define at least one map above, then run research.
                </p>
              </div>
            ) : (
              <>
                {journeys.map((journey) => (
                  <JourneySection
                    key={journey.key}
                    journey={journey}
                    onRemove={handleRemoveJourneyMap}
                    removing={removingJourneyKey === journey.key}
                    onUpdateStepText={handleUpdateStepText}
                    updatingStepId={updatingStepId}
                  />
                ))}

                <div
                  className="rounded-[24px] border px-6 py-5"
                  style={{ borderColor: c.line, background: c.panel }}
                >
                  <p className="font-sans text-[14px] leading-[1.6]" style={{ color: c.secondary }}>
                    <strong style={{ color: c.charcoal }}>{totalGaps} checkpoints have active gaps</strong> across the current map{journeys.length === 1 ? "" : "s"}.
                    {pendingAssessmentTotal > 0
                      ? ` ${pendingAssessmentTotal} checkpoint${pendingAssessmentTotal === 1 ? "" : "s"} are pending assessment and need an evidence-backed research run.`
                      : " Use this page to confirm the sequence and then move to Inputs and Opportunities to close the highest-impact issues."}
                  </p>
                </div>
              </>
            )}

            <OdiNeedsListSection
              companyId={activeCompanyId ?? undefined}
              needs={needs}
              onRemoveNeed={handleRemoveNeed}
              removingNeedId={removingNeedId}
              onRemovePublicNeeds={handleRemovePublicNeeds}
              removingPublicNeeds={removingPublicNeeds}
              onReorderNeeds={handleReorderNeeds}
              reorderingNeeds={reorderingNeeds}
              onUpdateNeedText={handleUpdateNeedText}
              updatingNeedId={updatingNeedId}
              onUpdateNeedScores={handleUpdateNeedScores}
            />
          </div>
        )}
      </main>
    </div>
  );
}
