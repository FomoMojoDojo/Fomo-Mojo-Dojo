import TopNav from "@/components/layout/TopNav";
import { useCompany } from "@/hooks/useCompany";
import { useInputs } from "@/hooks/useInputs";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import { useLatestPositioningReview } from "@/hooks/useLatestPositioningReview";
import { useLatestLocalAlignment } from "@/hooks/useLocalAlignment";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import { MetaBadge } from "@/components/ui/semantic-badges";
import { AreaAlignmentPanel } from "@/components/alignment/AreaAlignmentPanel";
import PageContextStatus from "@/components/layout/PageContextStatus";
import GenericAuditTraceNote from "@/components/diagnostics/GenericAuditTraceNote";
import type { InputItem, PositioningCanvas, StrategyCascade } from "@/lib/types";
import { isGenericAuditCompany } from "@/lib/genericAudit";
import { parseClaritySuggestion } from "@/lib/text/claritySuggestion";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleDashed,
  FlaskConical,
  Globe,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  paper: "#FFFFFF",
  line: "#DDE6D1",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  coral: "#FF7D2D",
  teal: "#5F9B8C",
  amber: "#FAC846",
  sage: "#A0C382",
};

type CanvasKey =
  | "competitive_alternatives"
  | "unique_attributes"
  | "value_proposition"
  | "market_category";

type PositioningSectionKey =
  | CanvasKey
  | "current_tagline"
  | "proposed_direction";

type EditablePositioningField =
  | "value_for_customer"
  | "best_fit_customers"
  | "market_category"
  | "category_rationale"
  | "current_tagline"
  | "proposed_tagline";

type SourceTier = "public" | "company" | "evidence" | "implemented_tested";

const SOURCE_ORDER: SourceTier[] = ["public", "company", "evidence", "implemented_tested"];

const SOURCE_META: Record<
  SourceTier,
  {
    label: string;
    short: string;
    icon: LucideIcon;
    bg: string;
    fg: string;
    border: string;
  }
> = {
  public: {
    label: "Public",
    short: "Public-source research",
    icon: Globe,
    bg: "#EDF4F6",
    fg: "#233C4B",
    border: "#C4D7DE",
  },
  company: {
    label: "Company",
    short: "Company-provided input",
    icon: Building2,
    bg: "#FFF6D8",
    fg: "#A06700",
    border: "#F3D77A",
  },
  evidence: {
    label: "Research",
    short: "Research-backed evidence",
    icon: FlaskConical,
    bg: "#EEF6E7",
    fg: "#2E6B52",
    border: "#BDD8CF",
  },
  implemented_tested: {
    label: "Testing",
    short: "Live and measured",
    icon: CheckCircle2,
    bg: "#EAF3EC",
    fg: "#25603E",
    border: "#BFD8C6",
  },
};

const INPUT_TO_CANVAS: Partial<Record<InputItem["input_key"], CanvasKey>> = {
  "comp-alt": "competitive_alternatives",
  "unique-attr": "unique_attributes",
  "val-prop": "value_proposition",
  "market-cat": "market_category",
};

const META: Record<
  CanvasKey,
  {
    eyebrow: string;
    title: string;
    subtitle: string;
    accent: string;
  }
> = {
  competitive_alternatives: {
    eyebrow: "When Customers Can't Use Us",
    title: "Competitive Alternatives",
    subtitle:
      "The real alternatives customers use today, including doing nothing or stitching together workarounds.",
    accent: c.coral,
  },
  unique_attributes: {
    eyebrow: "What Only We Do",
    title: "Unique Attributes",
    subtitle:
      "The differentiated qualities the alternatives do not have or cannot easily replicate.",
    accent: c.teal,
  },
  value_proposition: {
    eyebrow: "What Customers Can Do That They Couldn't Before",
    title: "Value Statement",
    subtitle:
      "How the unique attributes translate into meaningful value for the right customer.",
    accent: c.amber,
  },
  market_category: {
    eyebrow: "Where We Compete",
    title: "Market Category",
    subtitle:
      "The frame of reference that helps buyers understand the company and why it matters.",
    accent: c.sage,
  },
};

function findInput(inputs: InputItem[], section: CanvasKey) {
  return inputs.find((input) => INPUT_TO_CANVAS[input.input_key] === section) ?? null;
}

function buildFallbackCanvas(inputs: InputItem[]): PositioningCanvas {
  const competitiveAlternatives = findInput(inputs, "competitive_alternatives");
  const uniqueAttributes = findInput(inputs, "unique_attributes");
  const valueProposition = findInput(inputs, "value_proposition");
  const marketCategory = findInput(inputs, "market_category");
  const targetAudience = inputs.find((input) => input.input_key === "target-aud") ?? null;
  const brandNarrative = inputs.find((input) => input.input_key === "brand-narrative") ?? null;

  return {
    competitive_alternatives: splitBullets(competitiveAlternatives?.description).map((entry, index) => ({
      id: `alt-${index + 1}`,
      name: entry,
      description:
        competitiveAlternatives?.why_it_matters ||
        "Needs stronger validation from buyer interviews or market research.",
    })),
    unique_attributes: splitBullets(uniqueAttributes?.description).map((entry, index) => ({
      id: `attr-${index + 1}`,
      name: entry,
      description:
        splitBullets(uniqueAttributes?.why_it_matters)[index] ||
        uniqueAttributes?.why_it_matters ||
        "Needs stronger proof from public or client evidence.",
      highlighted: index < 3,
    })),
    value_for_customer: valueProposition?.description || "",
    best_fit_customers: targetAudience?.description || "",
    market_category: marketCategory?.input_label || marketCategory?.description || "",
    category_rationale: marketCategory?.description || "",
    current_tagline: brandNarrative?.description || "",
    proposed_tagline:
      uniqueAttributes?.why_it_matters ||
      "Refine the positioning direction after competitive mapping and audience validation.",
    frameworks_used: [],
  };
}

function sectionLabel(text: string) {
  return (
    <div
      className="font-mono text-[10px] uppercase tracking-[0.14em]"
      style={{ color: c.muted }}
    >
      {text}
    </div>
  );
}

function splitBullets(text: string | undefined) {
  return (text || "")
    .split(/(?:\n|•|\.\s(?=[A-Z]))/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 5);
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="rounded-[24px] border px-6 py-12 text-center"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
        {message}
      </p>
    </div>
  );
}

function SuggestionActions({
  raw,
  onAccept,
  onIgnore,
  saving,
}: {
  raw: string;
  onAccept?: (value: string) => void | Promise<void>;
  onIgnore?: (value: string) => void | Promise<void>;
  saving?: boolean;
}) {
  const parsed = parseClaritySuggestion(raw);
  if (!parsed.suggested) return null;

  return (
    <div className="mt-3 rounded-[14px] border px-3 py-2.5" style={{ borderColor: c.line, background: c.paper }}>
      <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
        Suggested clearer version
      </p>
      <p className="mt-1.5 font-sans text-[13px] leading-[1.65]" style={{ color: c.secondary }}>
        {parsed.suggested}
      </p>
      {onAccept && onIgnore ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onAccept(parsed.suggested!)}
            disabled={!!saving}
            className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
            style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
          >
            Accept Suggestion
          </button>
          <button
            type="button"
            onClick={() => onIgnore(parsed.primary)}
            disabled={!!saving}
            className="rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
            style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
          >
            Ignore
          </button>
        </div>
      ) : null}
    </div>
  );
}

function OptionCard({
  title,
  detail,
  accent,
  highlighted = false,
  onAcceptSuggestion,
  onIgnoreSuggestion,
  saving,
}: {
  title: string;
  detail: string;
  accent: string;
  highlighted?: boolean;
  onAcceptSuggestion?: (suggested: string) => void | Promise<void>;
  onIgnoreSuggestion?: (primary: string) => void | Promise<void>;
  saving?: boolean;
}) {
  const parsedDetail = parseClaritySuggestion(detail);
  return (
    <div
      className="rounded-[18px] border p-4"
      style={{
        borderColor: highlighted ? accent : c.line,
        background: c.paper,
        boxShadow: highlighted ? `inset 3px 0 0 ${accent}` : "none",
      }}
    >
      <p className="font-sans text-[15px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
        {title}
      </p>
      <p className="mojo-under-title font-sans text-[12px] leading-[1.45]" style={{ color: c.secondary }}>
        {parsedDetail.primary || detail}
      </p>
      <SuggestionActions
        raw={detail}
        onAccept={onAcceptSuggestion}
        onIgnore={onIgnoreSuggestion}
        saving={saving}
      />
    </div>
  );
}

function AlternativesBlock({
  input,
  items,
  onAcceptSuggestion,
  onIgnoreSuggestion,
  saving,
}: {
  input: InputItem | null;
  items?: PositioningCanvas["competitive_alternatives"];
  onAcceptSuggestion?: (index: number, suggested: string) => void | Promise<void>;
  onIgnoreSuggestion?: (index: number, primary: string) => void | Promise<void>;
  saving?: boolean;
}) {
  if (Array.isArray(items) && items.length > 0) {
    return (
      <div className="space-y-3">
        {items.map((item, index) => (
          <OptionCard
            key={item.id || `alt-${index}`}
            title={item.name}
            detail={item.description || "Needs stronger validation from buyer interviews or market research."}
            accent={META.competitive_alternatives.accent}
            onAcceptSuggestion={
              onAcceptSuggestion ? (suggested) => onAcceptSuggestion(index, suggested) : undefined
            }
            onIgnoreSuggestion={
              onIgnoreSuggestion ? (primary) => onIgnoreSuggestion(index, primary) : undefined
            }
            saving={saving}
          />
        ))}
      </div>
    );
  }

  const bullets = splitBullets(input?.description).map((entry) => ({
    title: entry,
    detail: input?.why_it_matters || "Needs stronger validation from buyer interviews or market research.",
  }));

  const fallbackItems =
    bullets.length > 0
      ? bullets
      : [
          {
            title: input?.input_label || "No competitive alternatives mapped yet",
            detail:
              input?.why_it_matters ||
              "Run AI Research or add strategist notes to identify the real alternatives customers use today.",
          },
        ];

  return (
    <div className="space-y-3">
      {fallbackItems.map((entry, index) => (
        <OptionCard
          key={`alt-${entry.title}-${index}`}
          title={entry.title}
          detail={entry.detail}
          accent={META.competitive_alternatives.accent}
        />
      ))}
    </div>
  );
}

function AttributesBlock({
  input,
  items,
  onAcceptSuggestion,
  onIgnoreSuggestion,
  saving,
}: {
  input: InputItem | null;
  items?: PositioningCanvas["unique_attributes"];
  onAcceptSuggestion?: (index: number, suggested: string) => void | Promise<void>;
  onIgnoreSuggestion?: (index: number, primary: string) => void | Promise<void>;
  saving?: boolean;
}) {
  if (Array.isArray(items) && items.length > 0) {
    return (
      <div className="space-y-3">
        {items.map((item, index) => (
          <OptionCard
            key={item.id || `attr-${index}`}
            title={item.name}
            detail={item.description || "Needs stronger proof from public or client evidence."}
            accent={META.unique_attributes.accent}
            highlighted={!!item.highlighted}
            onAcceptSuggestion={
              onAcceptSuggestion ? (suggested) => onAcceptSuggestion(index, suggested) : undefined
            }
            onIgnoreSuggestion={
              onIgnoreSuggestion ? (primary) => onIgnoreSuggestion(index, primary) : undefined
            }
            saving={saving}
          />
        ))}
      </div>
    );
  }

  const bullets = splitBullets(input?.description);
  const details = splitBullets(input?.why_it_matters);

  const fallbackItems =
    bullets.length > 0
      ? bullets.map((entry, index) => ({
          title: entry,
          detail: details[index] || input?.why_it_matters || "Needs stronger proof from public or client evidence.",
          highlighted: index < 3,
        }))
      : [
          {
            title: input?.input_label || "No unique attributes mapped yet",
            detail:
              input?.why_it_matters ||
              "Clarify what the company can credibly claim that alternatives cannot.",
            highlighted: true,
          },
        ];

  return (
    <div className="space-y-3">
      {fallbackItems.map((entry, index) => (
        <OptionCard
          key={`attr-${entry.title}-${index}`}
          title={entry.title}
          detail={entry.detail}
          accent={META.unique_attributes.accent}
          highlighted={entry.highlighted}
        />
      ))}
    </div>
  );
}

function SourcePill({ tier, compact = false }: { tier: SourceTier; compact?: boolean }) {
  const meta = SOURCE_META[tier];
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex items-center rounded-full border font-sans ${compact ? "px-2.5 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]"}`}
      style={{ background: meta.bg, color: meta.fg, borderColor: meta.border }}
      title={meta.short}
    >
      <Icon className="mr-1.5 h-3.5 w-3.5" />
      <span className="uppercase tracking-[0.08em]">{meta.label}</span>
    </span>
  );
}

function QualityPill({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "caution";
}) {
  const style =
    tone === "ok"
      ? { bg: "#EEF6E7", fg: "#2E6B52", border: "#BDD8CF", icon: ShieldCheck }
      : tone === "warn"
        ? { bg: "#FFF0E6", fg: "#A5512E", border: "#FFD1B4", icon: AlertTriangle }
        : { bg: "#EDF4F6", fg: "#233C4B", border: "#C4D7DE", icon: CircleDashed };

  const Icon = style.icon;

  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1.5 font-sans text-[11px]"
      style={{ background: style.bg, color: style.fg, borderColor: style.border }}
    >
      <Icon className="mr-1.5 h-3.5 w-3.5" />
      <span className="uppercase tracking-[0.08em]">{label}</span>
    </span>
  );
}

function tierRank(tier: SourceTier) {
  return SOURCE_ORDER.indexOf(tier);
}

function elevateTier(current: SourceTier, target: SourceTier) {
  return tierRank(target) > tierRank(current) ? target : current;
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "their",
  "your",
  "our",
  "about",
  "across",
  "through",
  "where",
  "when",
  "what",
  "how",
  "who",
  "are",
  "is",
  "to",
  "of",
  "in",
  "on",
  "at",
]);

function tokenSet(text: string) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4 && !STOP_WORDS.has(token)),
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>) {
  let hits = 0;
  for (const token of a) {
    if (b.has(token)) hits++;
  }
  return hits;
}

function computeStrategyAlignment(canvas: PositioningCanvas, strategy: StrategyCascade | null) {
  if (!strategy) {
    return {
      hasStrategy: false,
      issues: ["Strategy cascade is missing, so positioning cannot be cross-checked yet."],
    };
  }

  const whereToPlayTokens = tokenSet(strategy.where_to_play);
  const marketCategoryTokens = tokenSet(
    `${canvas.market_category} ${canvas.category_rationale} ${canvas.best_fit_customers}`,
  );
  const whereHits = tokenOverlap(whereToPlayTokens, marketCategoryTokens);
  const whereRatio = whereToPlayTokens.size > 0 ? whereHits / whereToPlayTokens.size : 0;
  const whereAligned = whereHits >= 2 || whereRatio >= 0.16;

  const howToWinTokens = tokenSet(strategy.how_to_win);
  const uniqueTokens = tokenSet(
    `${canvas.unique_attributes.map((item) => `${item.name} ${item.description}`).join(" ")} ${canvas.value_for_customer}`,
  );
  const howHits = tokenOverlap(howToWinTokens, uniqueTokens);
  const howRatio = howToWinTokens.size > 0 ? howHits / howToWinTokens.size : 0;
  const howAligned = howHits >= 2 || howRatio >= 0.16;

  const issues: string[] = [];
  if (!whereAligned) {
    issues.push("Where to Play and Market Category are not clearly aligned.");
  }
  if (!howAligned) {
    issues.push("How to Win and Unique Attributes are not clearly aligned.");
  }

  return {
    hasStrategy: true,
    issues,
  };
}

function resolveSectionTier(args: {
  section: PositioningSectionKey;
  hasCompanyEvidence: boolean;
  hasPrimaryEvidence: boolean;
  hasTested: boolean;
}) {
  const { section, hasCompanyEvidence, hasPrimaryEvidence, hasTested } = args;
  let tier: SourceTier = "public";

  if (
    hasCompanyEvidence &&
    section !== "competitive_alternatives" &&
    section !== "current_tagline"
  ) {
    tier = "company";
  }

  if (hasPrimaryEvidence && section !== "current_tagline") {
    tier = elevateTier(tier, "evidence");
  }

  if (
    hasTested &&
    (section === "value_proposition" || section === "proposed_direction")
  ) {
    tier = "implemented_tested";
  }

  return tier;
}

function summarizeTierSpread(tiers: SourceTier[]) {
  if (tiers.length === 0) return "No source signals yet.";
  const unique = Array.from(new Set(tiers));
  if (unique.length === 1) return `Current canvas confidence profile: ${SOURCE_META[unique[0]].label}.`;
  return `Current canvas confidence profile: ${unique.map((tier) => SOURCE_META[tier].label).join(" + ")}.`;
}

function resolvePositioningQualityCheck(args: {
  hasStoredCanvas: boolean;
  hasCompanyEvidence: boolean;
  hasStrategy: boolean;
  alignmentIssues: string[];
  frameworks: string[];
  review: {
    pass: boolean | null;
    severity: string | null;
    summary: string | null;
  } | null;
}) {
  const hasFrameworkGuidance = args.frameworks.includes("april_dunford");

  if (!args.hasStoredCanvas) {
    return {
      label: "Quality Check: Not Run",
      tone: "caution" as const,
      detail: "No first-class positioning artifact exists yet.",
    };
  }

  if (!hasFrameworkGuidance) {
    return {
      label: "Quality Check: Missing Rules",
      tone: "warn" as const,
      detail: "The saved artifact does not declare positioning-framework guidance.",
    };
  }

  if (!args.hasCompanyEvidence) {
    return {
      label: "Quality Check: Needs Company Validation",
      tone: "warn" as const,
      detail: "No uploaded company artifacts confirm current brand, strategy, or positioning yet.",
    };
  }

  if (!args.hasStrategy) {
    return {
      label: "Quality Check: Strategy Missing",
      tone: "warn" as const,
      detail: "Strategy cascade is missing, so positioning cannot be cross-checked for alignment.",
    };
  }

  if (args.alignmentIssues.length > 0) {
    return {
      label: "Quality Check: Alignment Gap",
      tone: "warn" as const,
      detail: args.alignmentIssues[0],
    };
  }

  if (args.review?.severity === "high" || args.review?.pass === false) {
    return {
      label: "Quality Check: Needs Revision",
      tone: "warn" as const,
      detail: args.review?.summary || "Latest automated review flagged high-severity positioning issues.",
    };
  }

  if (args.review?.pass === true) {
    return {
      label: "Quality Check: Passed",
      tone: "ok" as const,
      detail: args.review?.summary || "Latest automated review passed.",
    };
  }

  return {
    label: "Quality Check: In Progress",
    tone: "caution" as const,
    detail: "Framework guidance is applied, but no explicit pass/fail review is available yet.",
  };
}

function CanvasSection({
  section,
  sourceTier,
  input,
  children,
}: {
  section: CanvasKey;
  sourceTier: SourceTier;
  input: InputItem | null;
  children?: React.ReactNode;
}) {
  const meta = META[section];

  return (
    <section
      className="rounded-[24px] border p-5 sm:p-6"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <div className="flex items-start justify-between gap-3">
        {sectionLabel(meta.eyebrow)}
        <SourcePill tier={sourceTier} compact />
      </div>
      <h2 className="mt-3 font-sans text-[30px] font-semibold" style={{ color: c.charcoal }}>
        {meta.title}
      </h2>
      <p className="mojo-under-title font-sans text-[14px] mojo-desc" style={{ color: c.secondary }}>
        {meta.subtitle}
      </p>

      <div className="mt-5">
        {children ?? (
          <>
            <p className="font-sans text-[17px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
              {input?.input_label || "Not set"}
            </p>
            <p className="mt-2.5 font-sans text-[14px] leading-[1.5]" style={{ color: c.secondary }}>
              {input?.description || `No ${meta.title.toLowerCase()} detail has been generated yet.`}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

export default function PositioningView() {
  const { activeCompany } = useCompany();
  const auditMode = isGenericAuditCompany(activeCompany);
  const { query } = useInputs();
  const {
    loading: canvasLoading,
    item: storedCanvas,
    error: canvasError,
    savingField,
    updateTextField,
    updateItemsField,
    updateFrameworks,
  } = usePositioningCanvas(activeCompany?.id);
  const { item: strategyCascade } = useStrategyCascade(activeCompany?.id);
  const { item: latestReview } = useLatestPositioningReview(activeCompany?.id);

  const inputs = query.data ?? [];
  const foundation = inputs.filter((input) => input.group_key === "foundation");
  const competitiveAlternatives = findInput(foundation, "competitive_alternatives");
  const uniqueAttributes = findInput(foundation, "unique_attributes");
  const valueProposition = findInput(foundation, "value_proposition");
  const marketCategory = findInput(foundation, "market_category");

  const fallbackCanvas = buildFallbackCanvas(foundation);
  const canvas = storedCanvas ?? fallbackCanvas;
  const hasStoredCanvas = !!storedCanvas;
  const frameworksUsed = Array.isArray(canvas.frameworks_used) ? canvas.frameworks_used : [];
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompany?.id,
    areaScoresJson: activeCompany?.area_scores_json,
    inputsOverride: inputs,
  });
  const alignment = computeStrategyAlignment(canvas, strategyCascade);

  const sectionTiers: Record<PositioningSectionKey, SourceTier> = {
    competitive_alternatives: resolveSectionTier({
      section: "competitive_alternatives",
      hasCompanyEvidence: sourceSignals.hasCompanyEvidence,
      hasPrimaryEvidence: sourceSignals.hasPrimaryEvidence,
      hasTested: sourceSignals.hasImplementedTested,
    }),
    unique_attributes: resolveSectionTier({
      section: "unique_attributes",
      hasCompanyEvidence: sourceSignals.hasCompanyEvidence,
      hasPrimaryEvidence: sourceSignals.hasPrimaryEvidence,
      hasTested: sourceSignals.hasImplementedTested,
    }),
    value_proposition: resolveSectionTier({
      section: "value_proposition",
      hasCompanyEvidence: sourceSignals.hasCompanyEvidence,
      hasPrimaryEvidence: sourceSignals.hasPrimaryEvidence,
      hasTested: sourceSignals.hasImplementedTested,
    }),
    market_category: resolveSectionTier({
      section: "market_category",
      hasCompanyEvidence: sourceSignals.hasCompanyEvidence,
      hasPrimaryEvidence: sourceSignals.hasPrimaryEvidence,
      hasTested: sourceSignals.hasImplementedTested,
    }),
    current_tagline: resolveSectionTier({
      section: "current_tagline",
      hasCompanyEvidence: sourceSignals.hasCompanyEvidence,
      hasPrimaryEvidence: sourceSignals.hasPrimaryEvidence,
      hasTested: sourceSignals.hasImplementedTested,
    }),
    proposed_direction: resolveSectionTier({
      section: "proposed_direction",
      hasCompanyEvidence: sourceSignals.hasCompanyEvidence,
      hasPrimaryEvidence: sourceSignals.hasPrimaryEvidence,
      hasTested: sourceSignals.hasImplementedTested,
    }),
  };

  const qualityCheck = resolvePositioningQualityCheck({
    hasStoredCanvas,
    hasCompanyEvidence: sourceSignals.hasCompanyEvidence,
    hasStrategy: alignment.hasStrategy,
    alignmentIssues: alignment.issues,
    frameworks: frameworksUsed,
    review: latestReview,
  });
  const { data: localAlignment } = useLatestLocalAlignment(activeCompany?.id);
  const positioningAlignment = localAlignment?.areas?.positioning ?? null;

  const applyClaritySuggestion = async (
    field: EditablePositioningField,
    value: string,
    mode: "accept" | "ignore",
  ) => {
    if (!hasStoredCanvas) return;
    const next = String(value || "").trim();
    if (!next) return;
    try {
      await updateTextField(field, next);
      toast.success(mode === "accept" ? "Suggestion applied." : "Suggestion ignored.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update positioning text.");
    }
  };

  const applyListItemSuggestion = async (
    section: "competitive_alternatives" | "unique_attributes",
    index: number,
    value: string,
    mode: "accept" | "ignore",
  ) => {
    if (!hasStoredCanvas) return;
    const next = String(value || "").trim();
    if (!next) return;

    const sourceItems =
      section === "competitive_alternatives"
        ? canvas.competitive_alternatives
        : canvas.unique_attributes;

    if (index < 0 || index >= sourceItems.length) return;

    const updatedItems = sourceItems.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, description: next } : entry,
    );

    try {
      await updateItemsField(
        section === "competitive_alternatives"
          ? "competitive_alternatives_json"
          : "unique_attributes_json",
        updatedItems,
      );
      toast.success(mode === "accept" ? "Suggestion applied." : "Suggestion ignored.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update positioning card.");
    }
  };

  const valueForCustomerText = parseClaritySuggestion(canvas.value_for_customer);
  const bestFitCustomersText = parseClaritySuggestion(canvas.best_fit_customers);
  const marketCategoryText = parseClaritySuggestion(canvas.market_category);
  const categoryRationaleText = parseClaritySuggestion(canvas.category_rationale);
  const currentTaglineText = parseClaritySuggestion(canvas.current_tagline);
  const proposedTaglineText = parseClaritySuggestion(canvas.proposed_tagline);

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

      <main className="mx-auto max-w-[1120px] px-4 pb-12 pt-6 sm:px-6 md:px-8">
        <PageContextStatus lastScoredAt={activeCompany?.last_scored_at} sourceSignals={sourceSignals} />

        <div className="mb-8 border-b pb-5" style={{ borderColor: c.line }}>
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                {activeCompany?.name || "No company selected"}
              </div>
              <h1 className="mt-2 font-sans text-[34px] font-semibold" style={{ color: c.charcoal }}>
                Positioning Canvas
              </h1>
              <p className="mojo-under-title max-w-3xl font-sans text-[15px] mojo-desc" style={{ color: c.secondary }}>
                Positioning is the foundation for go-to-market clarity. This canvas now shows source
                confidence so we can distinguish public-source drafts from research-backed and testing-informed positioning.
              </p>
            </div>
          </div>
          <GenericAuditTraceNote
            active={auditMode}
            className="mt-3 max-w-4xl"
            source="positioning_canvases when saved; otherwise this page falls back to foundation inputs and public baseline context."
            evaluation="AI clarity review plus alignment checks compare market category, unique attributes, and strategy cascade coherence."
            scoring="Source confidence tiers (public/company/research/testing) and review severity determine confidence readout, warnings, and quality status."
            why="This explains whether positioning is first-class evidence or fallback synthesis, so generic claims can be replaced with concrete proof."
          />
        </div>

        {!activeCompany?.id ? (
          <EmptyState message="Select a company to view positioning inputs." />
        ) : query.isLoading || canvasLoading ? (
          <EmptyState message="Loading positioning canvas…" />
        ) : canvasError ? (
          <EmptyState message={`Failed to load positioning canvas: ${canvasError}`} />
        ) : !hasStoredCanvas && foundation.length === 0 ? (
          <EmptyState message="No foundation inputs yet. Run AI Research in Admin → Companies." />
        ) : (
          <div className="space-y-5">
            {!hasStoredCanvas ? (
              <section
                className="rounded-[20px] border px-5 py-4"
                style={{ borderColor: c.amber, background: `${c.amber}12` }}
              >
                <p className="font-sans text-[13px] leading-[1.65]" style={{ color: c.charcoal }}>
                  Showing legacy input-derived positioning because no stored positioning canvas exists yet.
                  Apply the positioning migration and rerun AI Research to replace this with first-class positioning data.
                </p>
              </section>
            ) : null}

            <section
              className="rounded-[28px] border border-dashed p-4 sm:p-5"
              style={{ borderColor: c.line, background: `${c.paper}80` }}
            >
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <CanvasSection
                  section="competitive_alternatives"
                  sourceTier={sectionTiers.competitive_alternatives}
                  input={competitiveAlternatives}
                >
                  <AlternativesBlock
                    input={competitiveAlternatives}
                    items={hasStoredCanvas ? canvas.competitive_alternatives : undefined}
                    saving={savingField === "competitive_alternatives_json"}
                    onAcceptSuggestion={
                      hasStoredCanvas
                        ? (index, suggested) =>
                            applyListItemSuggestion("competitive_alternatives", index, suggested, "accept")
                        : undefined
                    }
                    onIgnoreSuggestion={
                      hasStoredCanvas
                        ? (index, primary) =>
                            applyListItemSuggestion("competitive_alternatives", index, primary, "ignore")
                        : undefined
                    }
                  />
                </CanvasSection>

                <CanvasSection
                  section="unique_attributes"
                  sourceTier={sectionTiers.unique_attributes}
                  input={uniqueAttributes}
                >
                  <AttributesBlock
                    input={uniqueAttributes}
                    items={hasStoredCanvas ? canvas.unique_attributes : undefined}
                    saving={savingField === "unique_attributes_json"}
                    onAcceptSuggestion={
                      hasStoredCanvas
                        ? (index, suggested) =>
                            applyListItemSuggestion("unique_attributes", index, suggested, "accept")
                        : undefined
                    }
                    onIgnoreSuggestion={
                      hasStoredCanvas
                        ? (index, primary) =>
                            applyListItemSuggestion("unique_attributes", index, primary, "ignore")
                        : undefined
                    }
                  />
                </CanvasSection>

                <CanvasSection
                  section="value_proposition"
                  sourceTier={sectionTiers.value_proposition}
                  input={valueProposition}
                >
                  <p className="font-sans text-[18px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
                    {hasStoredCanvas ? "Value Statement" : valueProposition?.input_label || "Value statement not set"}
                  </p>
                  <p className="mt-3 font-sans text-[15px] leading-[1.5]" style={{ color: c.secondary }}>
                    {valueForCustomerText.primary || "No value proposition has been generated yet."}
                  </p>
                  <SuggestionActions
                    raw={canvas.value_for_customer}
                    saving={savingField === "value_for_customer"}
                    onAccept={
                      hasStoredCanvas
                        ? (suggested) => applyClaritySuggestion("value_for_customer", suggested, "accept")
                        : undefined
                    }
                    onIgnore={
                      hasStoredCanvas
                        ? (primary) => applyClaritySuggestion("value_for_customer", primary, "ignore")
                        : undefined
                    }
                  />
                  {bestFitCustomersText.primary || bestFitCustomersText.suggested ? (
                    <p className="mt-3 font-sans text-[13px] leading-[1.5]" style={{ color: c.secondary }}>
                      Best-fit audience: {bestFitCustomersText.primary || "Not set yet."}
                    </p>
                  ) : null}
                  <SuggestionActions
                    raw={canvas.best_fit_customers}
                    saving={savingField === "best_fit_customers"}
                    onAccept={
                      hasStoredCanvas
                        ? (suggested) => applyClaritySuggestion("best_fit_customers", suggested, "accept")
                        : undefined
                    }
                    onIgnore={
                      hasStoredCanvas
                        ? (primary) => applyClaritySuggestion("best_fit_customers", primary, "ignore")
                        : undefined
                    }
                  />
                </CanvasSection>

                <CanvasSection
                  section="market_category"
                  sourceTier={sectionTiers.market_category}
                  input={marketCategory}
                >
                  <p className="font-sans text-[18px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
                    {marketCategoryText.primary || "Market category not set"}
                  </p>
                  <SuggestionActions
                    raw={canvas.market_category}
                    saving={savingField === "market_category"}
                    onAccept={
                      hasStoredCanvas
                        ? (suggested) => applyClaritySuggestion("market_category", suggested, "accept")
                        : undefined
                    }
                    onIgnore={
                      hasStoredCanvas
                        ? (primary) => applyClaritySuggestion("market_category", primary, "ignore")
                        : undefined
                    }
                  />
                  <p className="mt-3 font-sans text-[15px] leading-[1.5]" style={{ color: c.secondary }}>
                    {categoryRationaleText.primary || "No market category framing has been generated yet."}
                  </p>
                  <SuggestionActions
                    raw={canvas.category_rationale}
                    saving={savingField === "category_rationale"}
                    onAccept={
                      hasStoredCanvas
                        ? (suggested) => applyClaritySuggestion("category_rationale", suggested, "accept")
                        : undefined
                    }
                    onIgnore={
                      hasStoredCanvas
                        ? (primary) => applyClaritySuggestion("category_rationale", primary, "ignore")
                        : undefined
                    }
                  />
                </CanvasSection>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section
                className="rounded-[24px] border p-5 sm:p-6"
                style={{ borderColor: c.line, background: c.panel }}
              >
                <div className="flex items-start justify-between gap-3">
                  {sectionLabel("Current Tagline")}
                  <SourcePill tier={sectionTiers.current_tagline} compact />
                </div>
                <p className="mt-3 font-sans text-[16px] leading-[1.5]" style={{ color: c.charcoal }}>
                  {currentTaglineText.primary ||
                    "No current tagline or brand line has been mapped yet."}
                </p>
                <SuggestionActions
                  raw={canvas.current_tagline}
                  saving={savingField === "current_tagline"}
                  onAccept={
                    hasStoredCanvas
                      ? (suggested) => applyClaritySuggestion("current_tagline", suggested, "accept")
                      : undefined
                  }
                  onIgnore={
                    hasStoredCanvas
                      ? (primary) => applyClaritySuggestion("current_tagline", primary, "ignore")
                      : undefined
                  }
                />
              </section>

              <section
                className="rounded-[24px] border p-5 sm:p-6"
                style={{ borderColor: c.line, background: c.panel }}
              >
                <div className="flex items-start justify-between gap-3">
                  {sectionLabel("Proposed Direction")}
                  <SourcePill tier={sectionTiers.proposed_direction} compact />
                </div>
                <p className="mt-4 font-sans text-[16px] font-semibold leading-[1.6]" style={{ color: c.charcoal }}>
                  {proposedTaglineText.primary ||
                    "Refine the positioning direction after competitive mapping and audience validation."}
                </p>
                <SuggestionActions
                  raw={canvas.proposed_tagline}
                  saving={savingField === "proposed_tagline"}
                  onAccept={
                    hasStoredCanvas
                      ? (suggested) => applyClaritySuggestion("proposed_tagline", suggested, "accept")
                      : undefined
                  }
                  onIgnore={
                    hasStoredCanvas
                      ? (primary) => applyClaritySuggestion("proposed_tagline", primary, "ignore")
                      : undefined
                  }
                />
                <p className="mt-2.5 font-sans text-[13px] mojo-desc" style={{ color: c.secondary }}>
                  The next strategist pass should pressure-test alternatives, sharpen the differentiated claim,
                  and make the market category easier to repeat in real buyer conversations.
                </p>
              </section>
            </div>

            <AreaAlignmentPanel
              title="Positioning"
              area={positioningAlignment}
              run={localAlignment}
              lineColor={c.line}
              panelColor={c.panel}
              textColor={c.charcoal}
              mutedColor={c.muted}
            />

            <section
              className="relative rounded-[20px] border px-5 py-4"
              style={{ borderColor: c.line, background: c.panel }}
            >
              <div className="absolute right-4 top-4 hidden sm:block">
                <QualityPill label={qualityCheck.label} tone={qualityCheck.tone} />
              </div>

              <div className="flex flex-wrap items-start justify-between gap-3 pr-0 sm:pr-[220px]">
                <div className="max-w-2xl">
                  {sectionLabel("Source Confidence")}
                  <p className="mt-2 font-sans text-[14px] leading-[1.7]" style={{ color: c.secondary }}>
                    {summarizeTierSpread(Object.values(sectionTiers))}
                  </p>
                  <p className="mt-1 font-sans text-[12px] leading-[1.6]" style={{ color: c.muted }}>
                    {sourceSignals.hasPrimaryEvidence
                      ? `Evidence is enabled from primary Strategic Decision System interview/survey signals (${sourceSignals.primaryEvidenceSignals} source signals).`
                      : "Evidence stays off until primary Strategic Decision System interviews/surveys are captured; public sources alone never qualify."}
                  </p>
                </div>
              </div>

              <div className="mt-3 sm:hidden">
                <QualityPill label={qualityCheck.label} tone={qualityCheck.tone} />
              </div>

              <p className="mt-3 max-w-4xl font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
                {qualityCheck.detail}
              </p>

              {hasStoredCanvas && !frameworksUsed.includes("april_dunford") ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await updateFrameworks(["april_dunford"]);
                        toast.success("Framework guidance applied.");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed to apply framework guidance.");
                      }
                    }}
                    className="rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors hover:bg-black/5"
                    style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                  >
                    Apply Positioning Framework
                  </button>
                </div>
              ) : null}
            </section>

            <section
              className="rounded-[24px] px-5 py-5 sm:px-6"
              style={{ background: c.charcoal }}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="font-sans text-[15px] leading-[1.7] text-white">
                  Strong positioning is a leverage point. It improves messaging, narrows the right
                  customer, clarifies alternatives, and raises strategic confidence across the map.
                </p>
                <div className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: c.amber }}>
                  Work On Positioning →
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
