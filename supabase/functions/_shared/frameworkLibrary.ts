export type FrameworkArtifact =
  | "inputs"
  | "journeys"
  | "opportunities"
  | "routes"
  | "positioning"
  | "messaging";

export type FrameworkKey =
  | "odi"
  | "april_dunford"
  | "teresa_torres"
  | "heath_brothers"
  | "strategy_cascade"
  | "working_playbook"
  | "positioning_first";

type SourceMode = "public" | "internal" | "hybrid";

export interface FrameworkReference {
  key: FrameworkKey;
  name: string;
  sourceMode: SourceMode;
  summary: string;
  priority: number;
  useCases: FrameworkArtifact[];
  concepts: string[];
  heuristics: string[];
  scoringDimensions: string[];
  antiPatterns: string[];
  evidencePreference: string[];
  preferredTerms?: string[];
  forbiddenTerms?: string[];
  requiredSections?: string[];
  promptRules: Partial<Record<FrameworkArtifact, string[]>>;
}

const FRAMEWORK_LIBRARY: FrameworkReference[] = [
  {
    key: "odi",
    name: "ODI / Jobs-to-be-Done",
    sourceMode: "hybrid",
    priority: 50,
    summary:
      "Frames demand around the job the customer is trying to get done, the desired outcomes, and where outcomes are underserved or overserved.",
    useCases: ["journeys", "opportunities", "routes", "positioning"],
    concepts: [
      "Separate the job from the solution.",
      "Use stable desired outcomes rather than feature wishlists.",
      "Interpret demand through importance, satisfaction, and evidence strength.",
      "Treat gaps as unmet outcomes, not generic complaints.",
    ],
    heuristics: [
      "Write step labels around what the customer is trying to accomplish.",
      "A high-opportunity area has high importance, low satisfaction, or weak evidence of fulfillment.",
      "When evidence is thin, mark uncertainty explicitly instead of assuming latent demand.",
    ],
    scoringDimensions: [
      "Outcome importance",
      "Current satisfaction",
      "Opportunity score",
      "Confidence in evidence",
    ],
    antiPatterns: [
      "Confusing product features with customer jobs.",
      "Listing generic pain points without an underlying outcome.",
      "Declaring opportunities without tying them to a specific step or unmet outcome.",
    ],
    evidencePreference: [
      "Public customer statements",
      "Workflow descriptions",
      "Pricing and service constraints",
      "Behavioral signals from adoption or churn",
    ],
    preferredTerms: [
      "job",
      "job executor",
      "desired outcome",
      "importance",
      "satisfaction",
      "underserved",
      "overserved",
    ],
    forbiddenTerms: [
      "pain point list",
      "feature wishlist",
      "user request",
      "customer complaint bucket",
    ],
    requiredSections: [
      "job context",
      "desired outcomes",
      "importance and satisfaction",
      "underserved opportunities",
    ],
    promptRules: {
      journeys: [
        "Describe the customer, revenue, and operations journeys as attempts to get important jobs done.",
        "Make each step correspond to a meaningful progress point in the job, not a generic business stage.",
        "Use the exact ODI language job and desired outcome where appropriate.",
      ],
      opportunities: [
        "Express opportunities as outcome improvements tied to a specific journey step.",
        "Bias toward areas with high importance, low satisfaction, or weak evidence of fulfillment.",
        "Write each outcome as a desired outcome statement, not a feature idea or generic recommendation.",
        "Use the exact ODI language desired outcome, importance, satisfaction, underserved, and overserved where appropriate.",
      ],
      routes: [
        "Synthesize routes around underserved outcomes and blocked progress, not around internal departments.",
      ],
      positioning: [
        "Position the company around the job and the outcomes customers are trying to improve.",
      ],
    },
  },
  {
    key: "april_dunford",
    name: "April Dunford Positioning",
    sourceMode: "hybrid",
    priority: 60,
    summary:
      "Clarifies positioning through competitive alternatives, differentiated attributes, value themes, target segments, and the market category that makes those differences obvious.",
    useCases: ["inputs", "positioning", "routes", "messaging"],
    concepts: [
      "Competitive alternatives define the frame of reference.",
      "Unique attributes matter only when they create customer value.",
      "Market category should make the value obvious to the buyer.",
      "Proof points are required for credible differentiation.",
    ],
    heuristics: [
      "Tie differentiation to specific value themes and buyer context.",
      "Use routes to strengthen proof, category clarity, and sales narrative.",
      "Treat vague category language as a positioning gap.",
    ],
    scoringDimensions: [
      "Category clarity",
      "Differentiation strength",
      "Proof depth",
      "Buyer resonance",
    ],
    antiPatterns: [
      "Using abstract adjectives without proof.",
      "Mixing multiple categories without explaining why.",
      "Claiming uniqueness without naming alternatives.",
    ],
    evidencePreference: [
      "Homepage language",
      "Product pages",
      "Sales materials",
      "Competitor comparisons",
    ],
    preferredTerms: [
      "competitive alternatives",
      "unique attributes",
      "value themes",
      "best-fit customers",
      "market category",
    ],
    forbiddenTerms: [
      "brand pillars",
      "messaging buckets",
      "audience segments",
      "value proposition canvas",
    ],
    requiredSections: [
      "competitive alternatives",
      "unique attributes",
      "value themes",
      "best-fit customers",
      "market category",
    ],
    promptRules: {
      inputs: [
        "Ensure strategy inputs capture category choice, differentiation, proof, audience, and value articulation.",
        "Use exact April Dunford language: competitive alternatives, unique attributes, value themes, best-fit customers, market category.",
      ],
      positioning: [
        "Frame positioning through alternatives, unique attributes, value themes, and market category.",
        "Use the exact labels competitive alternatives, unique attributes, value themes, best-fit customers, and market category.",
      ],
      routes: [
        "Create routes that improve proof, narrative clarity, and market framing where positioning is weak.",
      ],
      messaging: [
        "Make messages concrete, contrastive, and proof-backed.",
      ],
    },
  },
  {
    key: "teresa_torres",
    name: "Teresa Torres Opportunity Mapping",
    sourceMode: "internal",
    priority: 55,
    summary:
      "Structures discovery around opportunities, assumptions, evidence quality, and sequencing from opportunity to solution rather than jumping straight to ideas.",
    useCases: ["opportunities", "routes", "inputs"],
    concepts: [
      "Opportunities sit between outcomes and solutions.",
      "Evidence quality matters as much as idea quality.",
      "Good recommendation sets prioritize assumptions to test and opportunities to validate.",
      "Routes should avoid prescribing solutions before the opportunity is clear.",
    ],
    heuristics: [
      "Phrase opportunities as changes in behavior or progress, not as feature requests.",
      "Prefer routes that reduce uncertainty when evidence is thin.",
      "Use inputs to capture missing assumptions, research, and validation assets.",
    ],
    scoringDimensions: [
      "Evidence quality",
      "Assumption risk",
      "Opportunity leverage",
      "Learning velocity",
    ],
    antiPatterns: [
      "Jumping from problem statement to feature recommendation.",
      "Treating assumptions as facts.",
      "Creating routes that bundle too many unvalidated bets.",
    ],
    evidencePreference: [
      "Interview notes",
      "Observed behavior",
      "Uploaded evidence",
      "Public signals that reduce uncertainty",
    ],
    preferredTerms: [
      "outcome",
      "opportunity",
      "assumption",
      "solution",
      "experiment",
    ],
    forbiddenTerms: [
      "feature request",
      "idea backlog",
      "quick win list",
      "solution bucket",
    ],
    requiredSections: [
      "outcome opportunities",
      "assumptions to test",
      "solution direction",
    ],
    promptRules: {
      inputs: [
        "Include inputs that make assumptions, evidence, and validation work explicit.",
      ],
      opportunities: [
        "Write opportunities so they can later branch into multiple solutions.",
        "Flag uncertainty where evidence is weak instead of pretending the opportunity is validated.",
        "Use the language outcome, opportunity, assumption, solution, and experiment instead of generic recommendation terms.",
      ],
      routes: [
        "Prefer routes that sequence learning, validation, and capability-building logically.",
      ],
    },
  },
  {
    key: "heath_brothers",
    name: "Heath Brothers / Made to Stick",
    sourceMode: "public",
    priority: 40,
    summary:
      "Improves recommendation clarity through simplicity, concreteness, credibility, and memorable framing.",
    useCases: ["routes", "positioning", "messaging"],
    concepts: [
      "Simple messages are easier to act on.",
      "Concrete language beats abstract strategy jargon.",
      "Credibility requires proof and specificity.",
      "Recommendations should be memorable and behaviorally clear.",
    ],
    heuristics: [
      "Use route titles that are concrete and immediately understandable.",
      "Avoid consultant clichés in descriptions and recommendations.",
      "Ground every strategic recommendation in specific evidence or proof language.",
    ],
    scoringDimensions: [
      "Clarity",
      "Specificity",
      "Credibility",
      "Actionability",
    ],
    antiPatterns: [
      "Using vague strategic language that could apply to any company.",
      "Packing too many ideas into a single recommendation.",
      "Using abstract nouns without a concrete next action.",
    ],
    evidencePreference: [
      "Proof points",
      "Observable signals",
      "Specific examples",
      "Named constraints",
    ],
    promptRules: {
      routes: [
        "Make route titles and descriptions concrete, memorable, and immediately actionable.",
      ],
      positioning: [
        "Favor specific and credible wording over abstract brand language.",
      ],
      messaging: [
        "Use concise, vivid language supported by proof.",
      ],
    },
  },
  {
    key: "strategy_cascade",
    name: "Strategy Cascade",
    sourceMode: "hybrid",
    priority: 80,
    summary:
      "Structures strategy as a set of linked choices across winning aspiration, where to play, how to win, required capabilities, and management systems.",
    useCases: ["inputs", "routes", "positioning"],
    concepts: [
      "Strategy is an integrated set of choices, not a list of goals.",
      "Where-to-play and how-to-win choices should shape recommendations upstream.",
      "Capabilities and management systems are required to make strategic choices executable.",
      "Routes should strengthen the chain of choices rather than produce isolated initiatives.",
    ],
    heuristics: [
      "Use strategy inputs to expose missing choices, weak capabilities, and absent management systems.",
      "Write routes so they reinforce a coherent where-to-play and how-to-win logic.",
      "Treat contradictions between target market, value claim, and operating model as strategic gaps.",
    ],
    scoringDimensions: [
      "Choice clarity",
      "Strategic coherence",
      "Capability fit",
      "Management-system readiness",
    ],
    antiPatterns: [
      "Producing recommendations without a clear strategic choice model.",
      "Treating capability gaps as isolated tasks rather than part of a strategy system.",
      "Mixing multiple where-to-play choices without prioritization.",
    ],
    evidencePreference: [
      "Stated strategy",
      "Operating model signals",
      "Capability evidence",
      "Management rhythms and metrics",
    ],
    preferredTerms: [
      "winning aspiration",
      "where to play",
      "how to win",
      "capabilities",
      "management systems",
    ],
    forbiddenTerms: [
      "strategy pillars",
      "strategic themes",
      "growth levers",
      "core buckets",
    ],
    requiredSections: [
      "winning aspiration",
      "where to play",
      "how to win",
      "capabilities",
      "management systems",
    ],
    promptRules: {
      inputs: [
        "Ensure the input set exposes winning aspiration, where-to-play choices, how-to-win logic, capabilities, and management systems.",
        "Use the exact Strategy Cascade language: winning aspiration, where to play, how to win, capabilities, management systems.",
      ],
      routes: [
        "Make routes reinforce the strategy cascade by linking strategic choices to required capabilities and systems.",
      ],
      positioning: [
        "Keep positioning aligned with where-to-play and how-to-win choices instead of treating messaging as standalone.",
      ],
    },
  },
  {
    key: "positioning_first",
    name: "Positioning-First Approach",
    sourceMode: "internal",
    priority: 95,
    summary:
      "House methodology that treats positioning clarity as the gating constraint for downstream execution, growth, and route sequencing.",
    useCases: ["inputs", "journeys", "opportunities", "routes", "positioning", "messaging"],
    concepts: [
      "Positioning quality sets the ceiling on downstream execution quality.",
      "Do not scale go-to-market motion before the value narrative and category framing are clear.",
      "Recommendations should sequence from clarity to proof to amplification.",
      "When positioning is weak, execution problems are often symptoms rather than root causes.",
    ],
    heuristics: [
      "Bias early recommendations toward positioning clarity, proof, and value articulation when those are weak.",
      "Interpret journey friction through positioning maturity before prescribing execution fixes.",
      "Down-rank scale-up routes if the message, category, or differentiation remains unclear.",
    ],
    scoringDimensions: [
      "Positioning clarity",
      "Message-market fit",
      "Proof strength",
      "Readiness to scale",
    ],
    antiPatterns: [
      "Recommending channel or execution expansion before the positioning foundation is stable.",
      "Treating narrative confusion as a minor copy problem.",
      "Producing routes that optimize operations while the market story remains ambiguous.",
    ],
    evidencePreference: [
      "Homepage and messaging",
      "Competitive alternatives",
      "Sales proof",
      "Customer understanding of value",
    ],
    promptRules: {
      inputs: [
        "Make sure inputs expose whether positioning, proof, and category clarity are strong enough to support execution.",
      ],
      journeys: [
        "When step evidence is ambiguous, consider whether weak positioning is causing confusion across the journey.",
      ],
      opportunities: [
        "Treat positioning gaps as root-cause opportunities when they distort buyer understanding or conversion.",
      ],
      routes: [
        "Sequence routes so positioning and proof are stabilized before amplification or scale routes.",
      ],
      positioning: [
        "Treat positioning as a strategic prerequisite, not a messaging afterthought.",
      ],
      messaging: [
        "Prefer messages that sharpen category, differentiation, and proof before expanding channel tactics.",
      ],
    },
  },
  {
    key: "working_playbook",
    name: "Working Playbook",
    sourceMode: "internal",
    priority: 100,
    summary:
      "House orchestration layer that decides which frameworks to apply, in what order, and what recommendation sequencing rules should govern output quality.",
    useCases: ["inputs", "journeys", "opportunities", "routes", "positioning", "messaging"],
    concepts: [
      "Frameworks are complementary tools, not interchangeable prompt flavor.",
      "Artifact generation should follow a deliberate method order rather than ad hoc retrieval.",
      "Evidence quality determines how assertive recommendations can be.",
      "Recommendation sequencing should surface root-cause work before optimization work.",
    ],
    heuristics: [
      "Use the playbook to route each artifact through the most relevant supporting frameworks.",
      "When frameworks conflict, prefer the rule that addresses root cause, evidence quality, and strategic coherence.",
      "If evidence is weak, recommendations should acknowledge uncertainty and emphasize validation.",
    ],
    scoringDimensions: [
      "Evidence sufficiency",
      "Root-cause alignment",
      "Sequencing quality",
      "Method coherence",
    ],
    antiPatterns: [
      "Applying every framework equally to every artifact.",
      "Allowing downstream recommendation style to override upstream evidence quality.",
      "Producing impressive-looking output that ignores sequencing discipline.",
    ],
    evidencePreference: [
      "Framework-aligned evidence",
      "Cross-source consistency",
      "Proof over inference",
      "Explicit uncertainty when proof is thin",
    ],
    promptRules: {
      inputs: [
        "Route the input design through the house methodology first, then supporting frameworks.",
      ],
      journeys: [
        "Use the playbook to prioritize root-cause interpretation and evidence-aware sequencing.",
      ],
      opportunities: [
        "Select opportunities that reflect both unmet outcomes and the right intervention order.",
      ],
      routes: [
        "Order routes by root-cause importance, positioning readiness, and execution leverage.",
      ],
      positioning: [
        "Use the playbook to resolve category, value, and proof into a coherent positioning narrative.",
      ],
      messaging: [
        "Messages should be clear, credible, and sequenced from strategic clarity to amplification.",
      ],
    },
  },
];

function uniqueFrameworks(frameworks: FrameworkReference[]) {
  const seen = new Set<FrameworkKey>();
  return frameworks.filter((framework) => {
    if (seen.has(framework.key)) return false;
    seen.add(framework.key);
    return true;
  });
}

export function getFrameworksForArtifacts(
  artifacts: FrameworkArtifact[],
): FrameworkReference[] {
  const selected = FRAMEWORK_LIBRARY.filter((framework) =>
    framework.useCases.some((useCase) => artifacts.includes(useCase))
  );
  return uniqueFrameworks(selected).sort((a, b) => b.priority - a.priority);
}

export function buildFrameworkBrief(
  artifact: FrameworkArtifact,
  frameworks = getFrameworksForArtifacts([artifact]),
): string {
  return frameworks
    .map((framework) => {
      const artifactRules = framework.promptRules[artifact] ?? [];

      return [
        `${framework.name} [${framework.sourceMode}]`,
        `Summary: ${framework.summary}`,
        framework.requiredSections?.length
          ? `Required sections: ${framework.requiredSections.join(", ")}`
          : null,
        framework.preferredTerms?.length
          ? `Preferred terms: ${framework.preferredTerms.join(", ")}`
          : null,
        framework.forbiddenTerms?.length
          ? `Avoid terms: ${framework.forbiddenTerms.join(", ")}`
          : null,
        `Concepts:`,
        ...framework.concepts.map((item) => `- ${item}`),
        `Heuristics:`,
        ...framework.heuristics.map((item) => `- ${item}`),
        artifactRules.length ? `Artifact rules:` : null,
        ...artifactRules.map((item) => `- ${item}`),
        `Scoring dimensions: ${framework.scoringDimensions.join(", ")}`,
        `Anti-patterns:`,
        ...framework.antiPatterns.map((item) => `- ${item}`),
        `Evidence preference: ${framework.evidencePreference.join(", ")}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

export function buildFrameworkCatalog(): string {
  return FRAMEWORK_LIBRARY.map((framework) =>
    [
      `${framework.name} (${framework.key})`,
      `Use cases: ${framework.useCases.join(", ")}`,
      `Source mode: ${framework.sourceMode}`,
      `Summary: ${framework.summary}`,
    ].join("\n")
  ).join("\n\n");
}

const ARTIFACT_ROUTING: Record<FrameworkArtifact, FrameworkKey[]> = {
  inputs: ["working_playbook", "positioning_first", "strategy_cascade", "april_dunford", "teresa_torres"],
  journeys: ["working_playbook", "positioning_first", "odi"],
  opportunities: ["working_playbook", "positioning_first", "odi", "teresa_torres"],
  routes: ["working_playbook", "positioning_first", "strategy_cascade", "odi", "teresa_torres", "april_dunford", "heath_brothers"],
  positioning: ["working_playbook", "positioning_first", "strategy_cascade", "april_dunford", "heath_brothers"],
  messaging: ["working_playbook", "positioning_first", "april_dunford", "heath_brothers"],
};

export function getFrameworkRoutingPlan(artifact: FrameworkArtifact): FrameworkReference[] {
  const byKey = new Map(FRAMEWORK_LIBRARY.map((framework) => [framework.key, framework]));
  return ARTIFACT_ROUTING[artifact]
    .map((key) => byKey.get(key))
    .filter((framework): framework is FrameworkReference => Boolean(framework));
}

export { FRAMEWORK_LIBRARY };
