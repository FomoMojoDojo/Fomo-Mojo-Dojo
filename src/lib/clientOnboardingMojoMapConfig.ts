export const CLIENT_ONBOARDING_MOJOMAP_ID = "client-onboarding-mojomap";
export const CLIENT_ONBOARDING_MOJOMAP_ROUTE = "/resources/client-onboarding-mojomap";
export const CLIENT_ONBOARDING_MOJOMAP_EDITOR_ROUTE = "/resources/client-onboarding-mojomap/edit";

export type MapStatus = "active" | "draft" | "archived";
export type LayerStatus = "not_started" | "planned" | "in_progress";
export type ConstraintPriority = "highest" | "high" | "medium" | "low";
export type ConstraintSeverity = "high" | "medium" | "low";
export type ActionTimeframe = "now" | "next" | "later";

export type OwnershipConfig = {
  primaryOwner: string;
  decider?: string;
  contributors?: string[];
};

export type OnboardingOutcome = {
  title: string;
  description: string;
  targetMetric?: string;
  targetDate?: string;
};

export type OnboardingLayer = {
  id: string;
  title: string;
  purpose: string;
  summary?: string;
  content: string[];
  suggestedInputs?: string[];
  suggestedActivities?: string[];
  outputs?: string[];
  outputLabel?: string;
  score?: number;
  status?: LayerStatus;
  notes?: string;
  risk?: string;
  ownership?: OwnershipConfig;
};

export type ConstraintConfig = {
  id: string;
  title: string;
  description?: string;
  role: string;
  whyItMatters?: string;
  symptoms: string[];
  affectedLayerIds: string[];
  blocks?: string[];
  priority?: ConstraintPriority;
  severity?: ConstraintSeverity;
  expectedLift?: string;
};

export type ActionItem = {
  id: string;
  title: string;
  description?: string;
  ownership: OwnershipConfig;
  status: "not_started" | "planned" | "in_progress";
  impact: number;
  timeframe?: ActionTimeframe;
  linkedLayerId?: string;
};

export type ActionGroup = {
  id: "fix" | "improve" | "create";
  title: string;
  items: ActionItem[];
};

export type HealthSubscore = {
  id: string;
  label: string;
  value: number;
};

export type HealthScoreConfig = {
  overallScore: number;
  statusLabel: string;
  subscores: HealthSubscore[];
  topLifts: string[];
};

export type ContinuousUpdateConfig = {
  title: string;
  content: string[];
  cadence?: string;
  outputLabel: string;
};

export type OnboardingMapConfig = {
  id: string;
  name: string;
  type: string;
  description: string;
  ownership: OwnershipConfig;
  status: MapStatus;
  createdAt: string;
  updatedAt: string;
  purpose: string;
  outcome: OnboardingOutcome;
  centerOutcome: string;
  layers: OnboardingLayer[];
  constraint: ConstraintConfig;
  continuousUpdate: ContinuousUpdateConfig;
  actionGroups: ActionGroup[];
  health: HealthScoreConfig;
};

export const FOUNDER_OWNER_DEFAULTS = ["Owner 1", "Owner 2", "Owner 3"] as const;

const BASE_CLIENT_ONBOARDING_MOJOMAP_CONFIG: OnboardingMapConfig = {
  id: CLIENT_ONBOARDING_MOJOMAP_ID,
  name: "Client Onboarding MojoMap",
  type: "internal-operating-map",
  description: "Founder map for running client onboarding as a repeatable system",
  ownership: {
    primaryOwner: FOUNDER_OWNER_DEFAULTS[0],
    decider: FOUNDER_OWNER_DEFAULTS[0],
    contributors: [FOUNDER_OWNER_DEFAULTS[1], FOUNDER_OWNER_DEFAULTS[2]],
  },
  status: "active",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  purpose: "Founder map for running client onboarding as a repeatable system.",
  outcome: {
    title: "Take a client from we're stuck to a working MojoMap",
    description:
      "Take a client from we're stuck to a working MojoMap that drives real decisions within 6-8 weeks.",
  },
  centerOutcome:
    "Take a client from we're stuck to a working MojoMap that drives real decisions within 6-8 weeks.",
  layers: [
    {
      id: "customer_truth",
      title: "What They Think Is Going On",
      purpose: "Understand how the client sees the problem.",
      summary: "Capture what they think is wrong before validating what is actually true.",
      content: [
        "What do they think is wrong?",
        "What outcome do they want?",
        "Where do they feel stuck?",
        "What decisions are hard right now?",
      ],
      suggestedInputs: [
        "Pre-diagnosis survey",
        "First conversation",
        "Key stakeholder calls",
      ],
      outputs: ["Initial problem framing"],
      outputLabel: "Initial problem framing",
      status: "in_progress",
      notes: "Capture what the client says before jumping into solutions.",
      risk: "Solving the wrong problem",
    },
    {
      id: "reality",
      title: "What's Actually Going On",
      purpose: "Replace assumptions with truth.",
      summary: "Build a shared understanding of what is actually happening.",
      content: [
        "Misalignment between leaders",
        "Lack of real customer evidence",
        "Too many priorities",
        "Broken decision patterns",
        "Hidden constraints",
      ],
      suggestedInputs: [
        "Customer interviews (SDS / JTBD)",
        "Internal interviews",
        "Strategy + initiative review",
      ],
      outputs: ["Shared reality"],
      outputLabel: "Shared reality",
      status: "in_progress",
    },
    {
      id: "opportunity_landscape",
      title: "Where to Focus",
      purpose: "Turn reality into clear focus.",
      summary: "Translate what is true into one clear problem to solve first.",
      content: [
        "What to fix",
        "What to improve",
        "What to create",
        "What matters most",
      ],
      outputs: ["One clear problem"],
      outputLabel: "One clear problem",
      status: "planned",
    },
    {
      id: "decision_system",
      title: "What We're Going to Do",
      purpose: "Make clear decisions.",
      summary: "Create one clear direction the team can execute.",
      content: [
        "The problem we're solving",
        "What we're not doing",
        "The highest-leverage moves",
        "Trade-offs",
      ],
      outputs: ["Clarity"],
      outputLabel: "Clarity",
      status: "planned",
    },
    {
      id: "activation",
      title: "Make It Move",
      purpose: "Turn clarity into momentum.",
      summary: "Translate decisions into execution, ownership, and cadence.",
      content: [
        "First moves",
        "Who owns what",
        "What success looks like",
        "How we track progress",
      ],
      outputs: ["Momentum"],
      outputLabel: "Momentum",
      status: "planned",
    },
  ],
  constraint: {
    id: "primary_constraint",
    title: "The team does not have a shared, evidence-based view of what matters most",
    description:
      "The team does not yet have a shared and validated view of the primary problem and the highest-leverage path forward.",
    role: "This is the bottleneck the onboarding system is built to resolve.",
    whyItMatters: "If this is not solved, nothing else sticks.",
    symptoms: [
      "Priorities keep changing",
      "Decisions take too long",
      "Teams aren't aligned",
      "Confidence is low",
    ],
    affectedLayerIds: [
      "customer_truth",
      "reality",
      "opportunity_landscape",
      "decision_system",
    ],
    blocks: [
      "customer_truth",
      "reality",
      "opportunity_landscape",
      "decision_system",
    ],
    priority: "highest",
    severity: "high",
    expectedLift: "Improved clarity, alignment, and activation speed",
  },
  continuousUpdate: {
    title: "Keep It Alive",
    content: [
      "New inputs",
      "Updated understanding",
      "Score changes",
      "Next decisions",
    ],
    cadence: "Quarterly, with weekly decision review",
    outputLabel: "System, not project",
  },
  actionGroups: [
    {
      id: "fix",
      title: "Fix",
      items: [
        {
          id: "fix-1",
          title: "Improve pre-diagnosis quality",
          description: "Tighten intake so we start with a stronger hypothesis.",
          ownership: {
            primaryOwner: FOUNDER_OWNER_DEFAULTS[0],
            decider: FOUNDER_OWNER_DEFAULTS[0],
            contributors: [FOUNDER_OWNER_DEFAULTS[1]],
          },
          status: "in_progress",
          impact: 8,
          timeframe: "now",
          linkedLayerId: "customer_truth",
        },
        {
          id: "fix-2",
          title: "Tighten first-call hypothesis",
          description: "Reduce ambiguity in initial framing.",
          ownership: {
            primaryOwner: FOUNDER_OWNER_DEFAULTS[0],
            decider: FOUNDER_OWNER_DEFAULTS[0],
            contributors: [FOUNDER_OWNER_DEFAULTS[2]],
          },
          status: "planned",
          impact: 6,
          timeframe: "next",
          linkedLayerId: "customer_truth",
        },
        {
          id: "fix-3",
          title: "Reduce ambiguity in stated client problem",
          description: "Clarify language before synthesis.",
          ownership: {
            primaryOwner: FOUNDER_OWNER_DEFAULTS[1],
            decider: FOUNDER_OWNER_DEFAULTS[0],
            contributors: [FOUNDER_OWNER_DEFAULTS[2]],
          },
          status: "planned",
          impact: 8,
          timeframe: "next",
          linkedLayerId: "opportunity_landscape",
        },
      ],
    },
    {
      id: "improve",
      title: "Improve",
      items: [
        {
          id: "improve-1",
          title: "Speed up constraint identification",
          description: "Find the bottleneck earlier in the cycle.",
          ownership: {
            primaryOwner: FOUNDER_OWNER_DEFAULTS[0],
            decider: FOUNDER_OWNER_DEFAULTS[0],
            contributors: [FOUNDER_OWNER_DEFAULTS[1]],
          },
          status: "in_progress",
          impact: 8,
          timeframe: "now",
          linkedLayerId: "reality",
        },
        {
          id: "improve-2",
          title: "Standardize interview synthesis",
          description: "Use one repeatable synthesis flow.",
          ownership: {
            primaryOwner: FOUNDER_OWNER_DEFAULTS[1],
            decider: FOUNDER_OWNER_DEFAULTS[0],
            contributors: [FOUNDER_OWNER_DEFAULTS[2]],
          },
          status: "planned",
          impact: 6,
          timeframe: "next",
          linkedLayerId: "reality",
        },
        {
          id: "improve-3",
          title: "Improve workshop clarity",
          description: "Improve workshop framing and output quality.",
          ownership: {
            primaryOwner: FOUNDER_OWNER_DEFAULTS[2],
            decider: FOUNDER_OWNER_DEFAULTS[0],
            contributors: [FOUNDER_OWNER_DEFAULTS[1]],
          },
          status: "planned",
          impact: 6,
          timeframe: "next",
          linkedLayerId: "decision_system",
        },
      ],
    },
    {
      id: "create",
      title: "Create",
      items: [
        {
          id: "create-1",
          title: "Productize onboarding templates",
          description: "Package repeatable assets for each onboarding stage.",
          ownership: {
            primaryOwner: FOUNDER_OWNER_DEFAULTS[1],
            decider: FOUNDER_OWNER_DEFAULTS[0],
            contributors: [FOUNDER_OWNER_DEFAULTS[2]],
          },
          status: "planned",
          impact: 8,
          timeframe: "next",
          linkedLayerId: "activation",
        },
        {
          id: "create-2",
          title: "Automate map scaffolding",
          description: "Generate map scaffolds from intake and interviews.",
          ownership: {
            primaryOwner: FOUNDER_OWNER_DEFAULTS[1],
            decider: FOUNDER_OWNER_DEFAULTS[0],
            contributors: [FOUNDER_OWNER_DEFAULTS[2]],
          },
          status: "planned",
          impact: 6,
          timeframe: "later",
          linkedLayerId: "activation",
        },
        {
          id: "create-3",
          title: "Add AI-assisted synthesis for inputs",
          description: "Use AI support to accelerate synthesis.",
          ownership: {
            primaryOwner: FOUNDER_OWNER_DEFAULTS[2],
            decider: FOUNDER_OWNER_DEFAULTS[0],
            contributors: [FOUNDER_OWNER_DEFAULTS[1]],
          },
          status: "not_started",
          impact: 8,
          timeframe: "later",
          linkedLayerId: "reality",
        },
      ],
    },
  ],
  health: {
    overallScore: 64,
    statusLabel: "Emerging",
    subscores: [
      { id: "problem_clarity", label: "Problem Clarity", value: 72 },
      { id: "evidence_quality", label: "Evidence Quality", value: 64 },
      { id: "owner_alignment", label: "Owner Alignment", value: 58 },
      { id: "constraint_visibility", label: "Constraint Visibility", value: 70 },
      { id: "activation_readiness", label: "Activation Readiness", value: 62 },
      { id: "repeatability", label: "Repeatability", value: 55 },
    ],
    topLifts: [
      "Better pre-diagnosis inputs",
      "Faster constraint identification",
      "Clearer activation system",
    ],
  },
};

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.map((item) => String(item)));
  }
  if (typeof value === "string") {
    return uniqueStrings(value.split(","));
  }
  return [];
}

export function normalizeOwnershipRecord(
  value: {
    ownership?: unknown;
    owner?: unknown;
    ownerName?: unknown;
    approver?: unknown;
    reviewer?: unknown;
    assignee?: unknown;
    stakeholders?: unknown;
    contributors?: unknown;
  },
  fallbackPrimaryOwner: string,
): OwnershipConfig {
  const ownershipRecord = asRecord(value.ownership);
  const primaryOwner =
    toText(ownershipRecord?.primaryOwner) ||
    toText(value.ownerName) ||
    toText(value.assignee) ||
    toText(value.owner) ||
    toText(fallbackPrimaryOwner) ||
    "";
  const decider =
    toText(ownershipRecord?.decider) ||
    toText(value.approver) ||
    toText(value.reviewer);
  const contributors = uniqueStrings([
    ...toStringList(ownershipRecord?.contributors),
    ...toStringList(value.contributors),
    ...toStringList(value.stakeholders),
  ]).filter((person) => person !== primaryOwner);

  return {
    primaryOwner,
    ...(decider ? { decider } : {}),
    ...(contributors.length ? { contributors } : {}),
  };
}

export function normalizeClientOnboardingMojoMapConfig(
  source: Partial<OnboardingMapConfig>,
): OnboardingMapConfig {
  const base = deepClone(BASE_CLIENT_ONBOARDING_MOJOMAP_CONFIG);
  const merged = {
    ...base,
    ...source,
    outcome: {
      ...base.outcome,
      ...(source.outcome ?? {}),
    },
    constraint: {
      ...base.constraint,
      ...(source.constraint ?? {}),
    },
    continuousUpdate: {
      ...base.continuousUpdate,
      ...(source.continuousUpdate ?? {}),
    },
    health: {
      ...base.health,
      ...(source.health ?? {}),
    },
    layers: Array.isArray(source.layers) ? source.layers : base.layers,
    actionGroups: Array.isArray(source.actionGroups) ? source.actionGroups : base.actionGroups,
  } as OnboardingMapConfig;

  merged.ownership = normalizeOwnershipRecord(
    merged as unknown as {
      ownership?: unknown;
      owner?: unknown;
      ownerName?: unknown;
      approver?: unknown;
      reviewer?: unknown;
      assignee?: unknown;
      stakeholders?: unknown;
      contributors?: unknown;
    },
    base.ownership.primaryOwner,
  );
  merged.purpose = merged.description || merged.purpose;
  merged.description = merged.purpose || merged.description;
  merged.outcome.description = merged.outcome.description || merged.centerOutcome;
  merged.centerOutcome = merged.outcome.description || merged.centerOutcome;
  merged.constraint.blocks = uniqueStrings(
    merged.constraint.blocks?.length
      ? merged.constraint.blocks
      : merged.constraint.affectedLayerIds,
  );
  merged.constraint.affectedLayerIds = uniqueStrings(
    merged.constraint.affectedLayerIds?.length
      ? merged.constraint.affectedLayerIds
      : merged.constraint.blocks,
  );
  merged.continuousUpdate.content = Array.isArray(merged.continuousUpdate.content)
    ? merged.continuousUpdate.content
    : [];
  merged.health.subscores = Array.isArray(merged.health.subscores)
    ? merged.health.subscores.map((subscore) => {
        const value = Number(subscore.value);
        const legacyStakeholderAlignment =
          subscore.id === "stakeholder_alignment" ||
          subscore.label.trim().toLowerCase() === "stakeholder alignment";
        if (legacyStakeholderAlignment) {
          return {
            ...subscore,
            id: "owner_alignment",
            label: "Owner Alignment",
            value: Number.isFinite(value) ? value : 0,
          };
        }
        return {
          ...subscore,
          value: Number.isFinite(value) ? value : 0,
        };
      })
    : [];
  merged.health.topLifts = Array.isArray(merged.health.topLifts)
    ? merged.health.topLifts
    : [];
  merged.layers = (Array.isArray(merged.layers) ? merged.layers : []).map((layer) => {
    const legacyLayer = layer as OnboardingLayer & {
      owner?: unknown;
      ownerName?: unknown;
      assignee?: unknown;
      approver?: unknown;
      reviewer?: unknown;
      stakeholders?: unknown;
      contributors?: unknown;
      ownership?: unknown;
    };
    const hasLayerOwnership =
      legacyLayer.ownership !== undefined ||
      legacyLayer.owner !== undefined ||
      legacyLayer.ownerName !== undefined ||
      legacyLayer.assignee !== undefined ||
      legacyLayer.approver !== undefined ||
      legacyLayer.reviewer !== undefined ||
      legacyLayer.stakeholders !== undefined ||
      legacyLayer.contributors !== undefined;

    return {
      ...layer,
      summary: layer.summary || layer.purpose,
      suggestedInputs: Array.isArray(layer.suggestedInputs) ? layer.suggestedInputs : [],
      suggestedActivities: Array.isArray(layer.suggestedActivities)
        ? layer.suggestedActivities
        : [],
      outputs: Array.isArray(layer.outputs)
        ? layer.outputs
        : layer.outputLabel
          ? [layer.outputLabel]
          : [],
      outputLabel:
        layer.outputLabel ||
        (Array.isArray(layer.outputs) && layer.outputs.length ? layer.outputs[0] : undefined),
      ...(hasLayerOwnership
        ? { ownership: normalizeOwnershipRecord(legacyLayer, merged.ownership.primaryOwner) }
        : {}),
    };
  });

  merged.actionGroups = (Array.isArray(merged.actionGroups) ? merged.actionGroups : []).map(
    (group) => ({
      ...group,
      items: (Array.isArray(group.items) ? group.items : []).map((item) => {
        const normalizedOwnership = normalizeOwnershipRecord(item, merged.ownership.primaryOwner);
        return {
          ...item,
          ownership: normalizedOwnership,
        };
      }),
    }),
  );

  return merged;
}

const LEGACY_OWNERSHIP_KEYS = [
  "owner",
  "ownerName",
  "approver",
  "reviewer",
  "assignee",
  "stakeholders",
  "contributors",
] as const;

function stripLegacyOwnershipKeys<T extends Record<string, unknown>>(value: T): T {
  const copy = { ...value };
  for (const key of LEGACY_OWNERSHIP_KEYS) {
    if (key in copy) delete copy[key];
  }
  return copy;
}

export function toCanonicalOnboardingMojoMap(
  source: Partial<OnboardingMapConfig>,
): OnboardingMapConfig {
  const normalized = normalizeClientOnboardingMojoMapConfig(source);
  const normalizedRecord = normalized as OnboardingMapConfig & Record<string, unknown>;

  const mapCore = stripLegacyOwnershipKeys(normalizedRecord);
  const mapOwnership = normalizeOwnershipRecord(normalizedRecord, FOUNDER_OWNER_DEFAULTS[0]);

  return {
    ...(mapCore as OnboardingMapConfig),
    ownership: mapOwnership,
    layers: normalized.layers.map((layer) => {
      const layerRecord = layer as OnboardingLayer & Record<string, unknown>;
      const layerCore = stripLegacyOwnershipKeys(layerRecord);
      const hasLegacyOwnership =
        layerRecord.ownership !== undefined ||
        layerRecord.owner !== undefined ||
        layerRecord.ownerName !== undefined ||
        layerRecord.assignee !== undefined ||
        layerRecord.approver !== undefined ||
        layerRecord.reviewer !== undefined ||
        layerRecord.stakeholders !== undefined ||
        layerRecord.contributors !== undefined;

      return {
        ...(layerCore as OnboardingLayer),
        ...(hasLegacyOwnership
          ? {
              ownership: normalizeOwnershipRecord(
                layerRecord,
                mapOwnership.primaryOwner || FOUNDER_OWNER_DEFAULTS[0],
              ),
            }
          : {}),
      };
    }),
    actionGroups: normalized.actionGroups.map((group) => ({
      ...group,
      items: group.items.map((item) => {
        const itemRecord = item as ActionItem & Record<string, unknown>;
        const itemCore = stripLegacyOwnershipKeys(itemRecord);
        return {
          ...(itemCore as ActionItem),
          ownership: normalizeOwnershipRecord(
            itemRecord,
            mapOwnership.primaryOwner || FOUNDER_OWNER_DEFAULTS[0],
          ),
        };
      }),
    })),
  };
}

export const CLIENT_ONBOARDING_MOJOMAP_CONFIG: OnboardingMapConfig = toCanonicalOnboardingMojoMap(
  BASE_CLIENT_ONBOARDING_MOJOMAP_CONFIG,
);

export function getClientOnboardingMojoMapSeed(): OnboardingMapConfig {
  return deepClone(CLIENT_ONBOARDING_MOJOMAP_CONFIG);
}
