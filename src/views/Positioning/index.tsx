import TopNav from "@/components/layout/TopNav";
import { useCompany } from "@/hooks/useCompany";
import { useInputs } from "@/hooks/useInputs";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import { MetaBadge } from "@/components/ui/semantic-badges";
import type { InputItem, PositioningCanvas } from "@/lib/types";

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  paper: "#FFFFFF",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
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

function splitBullets(text: string | undefined) {
  return (text || "")
    .split(/(?:\n|•|\.\s(?=[A-Z]))/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 5);
}

function OptionCard({
  title,
  detail,
  accent,
  highlighted = false,
}: {
  title: string;
  detail: string;
  accent: string;
  highlighted?: boolean;
}) {
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
      <p className="mt-2 font-sans text-[12px] leading-[1.6]" style={{ color: c.secondary }}>
        {detail}
      </p>
    </div>
  );
}

function AlternativesBlock({ input }: { input: InputItem | null }) {
  const bullets = splitBullets(input?.description).map((entry) => ({
    title: entry,
    detail: input?.why_it_matters || "Needs stronger validation from buyer interviews or market research.",
  }));

  const items =
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
      {items.map((item, index) => (
        <OptionCard
          key={`alt-${item.title}-${index}`}
          title={item.title}
          detail={item.detail}
          accent={META.competitive_alternatives.accent}
        />
      ))}
    </div>
  );
}

function AttributesBlock({ input }: { input: InputItem | null }) {
  const bullets = splitBullets(input?.description);
  const details = splitBullets(input?.why_it_matters);

  const items =
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
      {items.map((item, index) => (
        <OptionCard
          key={`attr-${item.title}-${index}`}
          title={item.title}
          detail={item.detail}
          accent={META.unique_attributes.accent}
          highlighted={item.highlighted}
        />
      ))}
    </div>
  );
}

function CanvasSection({
  section,
  input,
  children,
}: {
  section: CanvasKey;
  input: InputItem | null;
  children?: React.ReactNode;
}) {
  const meta = META[section];

  return (
    <section
      className="rounded-[24px] border p-5 sm:p-6"
      style={{ borderColor: c.line, background: c.panel }}
    >
      {sectionLabel(meta.eyebrow)}
      <h2 className="mt-3 font-sans text-[30px] font-semibold" style={{ color: c.charcoal }}>
        {meta.title}
      </h2>
      <p className="mt-2 font-sans text-[14px] leading-[1.7]" style={{ color: c.secondary }}>
        {meta.subtitle}
      </p>

      <div className="mt-5">
        {children ?? (
          <>
            <p className="font-sans text-[17px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
              {input?.input_label || "Not set"}
            </p>
            <p className="mt-3 font-sans text-[14px] leading-[1.8]" style={{ color: c.secondary }}>
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
  const { query } = useInputs();
  const { loading: canvasLoading, item: storedCanvas, error: canvasError } = usePositioningCanvas(activeCompany?.id);
  const inputs = query.data ?? [];
  const foundation = inputs.filter((input) => input.group_key === "foundation");
  const competitiveAlternatives = findInput(foundation, "competitive_alternatives");
  const uniqueAttributes = findInput(foundation, "unique_attributes");
  const valueProposition = findInput(foundation, "value_proposition");
  const marketCategory = findInput(foundation, "market_category");

  const fallbackCanvas = buildFallbackCanvas(foundation);
  const canvas = storedCanvas ?? fallbackCanvas;
  const hasStoredCanvas = !!storedCanvas;

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
        <div className="mb-8 border-b pb-5" style={{ borderColor: c.line }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                {activeCompany?.name || "No company selected"}
              </div>
              <h1 className="mt-2 font-sans text-[34px] font-semibold" style={{ color: c.charcoal }}>
                Positioning Canvas
              </h1>
              <p className="mt-2 max-w-3xl font-sans text-[15px] leading-[1.7]" style={{ color: c.secondary }}>
                Positioning is the foundation for go-to-market clarity. This canvas shows the
                current strategist view of alternatives, differentiators, value, and category so
                the company can be easier to understand and easier to choose.
              </p>
            </div>

            <MetaBadge>
              {activeCompany?.last_scored_at
                ? `Updated ${new Date(activeCompany.last_scored_at).toLocaleDateString()}`
                : "Awaiting research"}
            </MetaBadge>
          </div>
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
                  Apply the positioning migration and rerun AI Research to replace this with grounded, first-class positioning data.
                </p>
              </section>
            ) : null}

            <section
              className="rounded-[28px] border border-dashed p-4 sm:p-5"
              style={{ borderColor: c.line, background: `${c.paper}80` }}
            >
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <CanvasSection section="competitive_alternatives" input={competitiveAlternatives}>
                  <AlternativesBlock
                    input={
                      hasStoredCanvas
                        ? {
                            id: "stored-alt",
                            input_key: "comp-alt",
                            input_label: "Competitive Alternatives",
                            group_key: "foundation",
                            group_label: "Foundation",
                            sub_group: "Positioning",
                            completeness: 0,
                            status: "not_started",
                            score_impact: 0,
                            impact_tier: "med",
                            description: canvas.competitive_alternatives.map((item) => item.name).join("\n"),
                            why_it_matters: canvas.competitive_alternatives[0]?.description || "",
                            subitems: [],
                            files: [],
                          }
                        : competitiveAlternatives
                    }
                  />
                </CanvasSection>

                <CanvasSection section="unique_attributes" input={uniqueAttributes}>
                  <AttributesBlock
                    input={
                      hasStoredCanvas
                        ? {
                            id: "stored-attr",
                            input_key: "unique-attr",
                            input_label: "Unique Attributes",
                            group_key: "foundation",
                            group_label: "Foundation",
                            sub_group: "Positioning",
                            completeness: 0,
                            status: "not_started",
                            score_impact: 0,
                            impact_tier: "med",
                            description: canvas.unique_attributes.map((item) => item.name).join("\n"),
                            why_it_matters: canvas.unique_attributes[0]?.description || "",
                            subitems: [],
                            files: [],
                          }
                        : uniqueAttributes
                    }
                  />
                </CanvasSection>

                <CanvasSection section="value_proposition" input={valueProposition}>
                  <p className="font-sans text-[18px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
                    {hasStoredCanvas ? "Value Statement" : valueProposition?.input_label || "Value statement not set"}
                  </p>
                  <p className="mt-4 font-sans text-[15px] leading-[1.85]" style={{ color: c.secondary }}>
                    {canvas.value_for_customer ||
                      "No value proposition has been generated yet."}
                  </p>
                  {canvas.best_fit_customers ? (
                    <p className="mt-4 font-sans text-[13px] leading-[1.7]" style={{ color: c.secondary }}>
                      Best-fit audience: {canvas.best_fit_customers}
                    </p>
                  ) : null}
                </CanvasSection>

                <CanvasSection section="market_category" input={marketCategory}>
                  <p className="font-sans text-[18px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
                    {canvas.market_category || "Market category not set"}
                  </p>
                  <p className="mt-4 font-sans text-[15px] leading-[1.85]" style={{ color: c.secondary }}>
                    {canvas.category_rationale ||
                      "No market category framing has been generated yet."}
                  </p>
                </CanvasSection>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section
                className="rounded-[24px] border p-5 sm:p-6"
                style={{ borderColor: c.line, background: c.panel }}
              >
                {sectionLabel("Current Tagline")}
                <p className="mt-4 font-sans text-[16px] leading-[1.8]" style={{ color: c.charcoal }}>
                  {canvas.current_tagline ||
                    "No current tagline or brand line has been mapped yet."}
                </p>
              </section>

              <section
                className="rounded-[24px] border p-5 sm:p-6"
                style={{ borderColor: c.line, background: c.panel }}
              >
                {sectionLabel("Proposed Direction")}
                <p className="mt-4 font-sans text-[16px] font-semibold leading-[1.6]" style={{ color: c.charcoal }}>
                  {canvas.proposed_tagline ||
                    "Refine the positioning direction after competitive mapping and audience validation."}
                </p>
                <p className="mt-3 font-sans text-[13px] leading-[1.7]" style={{ color: c.secondary }}>
                  The next strategist pass should pressure-test the alternatives, sharpen the
                  differentiated claim, and make the market category easier to repeat.
                </p>
              </section>
            </div>

            <section
              className="rounded-[24px] px-5 py-5 sm:px-6"
              style={{ background: c.charcoal }}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="font-sans text-[15px] leading-[1.7] text-white">
                  Strong positioning is a leverage point. It improves messaging, narrows the right
                  customer, clarifies the alternatives, and lifts strategic confidence across the map.
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
