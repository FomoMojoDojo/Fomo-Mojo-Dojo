import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import { dominantAuthorityBand } from "@/lib/signalAuthority";
import type { StrategicCenter, StrategicCenterRouteSeed } from "@/lib/strategicCenter";

export type IdentityNarrative = {
  publicIdentity: string | null;
  publicDescriptor: string | null;
  strategicIdentity: string | null;
  strategicDescriptor: string | null;
  customerIdentity: string | null;
};

function clean(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lower(value: string | null | undefined) {
  return clean(value).toLowerCase();
}

function aggregateSupportShape(row: HypothesisProvenanceCard) {
  return row.supportingClaims.reduce(
    (acc, claim) => {
      acc.outside += claim.supportShape.outside;
      acc.organization += claim.supportShape.organization;
      acc.customer += claim.supportShape.customer;
      return acc;
    },
    { outside: 0, organization: 0, customer: 0 },
  );
}

function rowNarrativeText(row: HypothesisProvenanceCard) {
  return clean(
    [
      row.hypothesis.statement,
      ...row.supportingClaims.map((claim) => claim.claim.statement),
      ...row.weakeningClaims.map((claim) => claim.claim.statement),
      ...(row.hypothesis.what_must_be_true ?? []),
    ].join(" "),
  );
}

function routeNarrativeText(seed: StrategicCenterRouteSeed) {
  return clean(
    [
      seed.route.title,
      seed.route.short_description,
      ...(seed.route.why_this_matters_json ?? []),
      ...seed.assumptions.map((assumption) => assumption.statement),
      ...seed.evidence.map((item) => item.title),
    ].join(" "),
  );
}

function collectBandText(rows: HypothesisProvenanceCard[], band: "outside" | "organization" | "customer", phase: string) {
  return lower(
    rows
      .filter((row) => dominantAuthorityBand(aggregateSupportShape(row), phase) === band)
      .map(rowNarrativeText)
      .join(" "),
  );
}

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

function fallbackPublicIdentity(publicContextLabel: string | null) {
  const label = lower(publicContextLabel);
  if (!label) return null;
  if (label.includes("craft quality") || label.includes("specialty coffee")) {
    return "A craft-focused specialty coffee roaster";
  }
  if (label.includes("partner operational outcomes") || label.includes("operational reliability")) {
    return "An operational partner for cafe operators";
  }
  if (label.includes("governance") || label.includes("impact")) {
    return "A responder-support organization built around visible impact";
  }
  if (label.includes("strategic guidance")) {
    return "A strategic guidance system";
  }
  if (label.includes("price") || label.includes("convenience")) {
    return "A lower-friction convenience-led option";
  }
  return null;
}

function inferPublicIdentity(text: string, center: StrategicCenter | null) {
  if (includesAny(text, ["specialty coffee", "craft", "roast", "roaster", "roasting", "artisanal", "small-batch"])) {
    return "A craft-focused specialty coffee roaster";
  }
  if (includesAny(text, ["first responder", "responder", "donor", "fundraising", "endowment", "wellness"])) {
    return "A premium responder-support organization";
  }
  if (includesAny(text, ["counterintuitive", "brand", "strategy", "guidance", "path selection"])) {
    return "A strategic guidance system";
  }
  return fallbackPublicIdentity(center?.publicContextLabel ?? null);
}

function publicDescriptorFromIdentity(identity: string | null, center: StrategicCenter | null) {
  const phrase = lower(identity);
  if (phrase.includes("craft-focused specialty coffee roaster")) {
    return "craft quality and specialty coffee";
  }
  if (phrase.includes("responder-support")) {
    return "premium responder support";
  }
  if (phrase.includes("strategic guidance system")) {
    return "strategic guidance";
  }
  return clean(center?.publicContextLabel || null) || null;
}

function inferStrategicIdentity(text: string, center: StrategicCenter | null) {
  if (
    includesAny(text, [
      "operator",
      "operators",
      "partner operational outcomes",
      "operational reliability",
      "operator burden",
      "repeat purchasing",
      "repeat buying",
      "consistency",
      "predictable",
      "training",
      "documentation",
      "support",
    ])
  ) {
    return "An operational partner for cafe operators, centered on reliability and lower operator burden";
  }
  if (includesAny(text, ["first responder", "responder", "donor", "impact", "allocation", "funding", "governance"])) {
    return "A responder-support organization centered on visible impact";
  }
  if (includesAny(text, ["guidance", "brand", "decision", "execution", "path", "rework", "prerequisite"])) {
    return "A strategic guidance system";
  }

  const label = lower(center?.label);
  if (label.includes("partner operational outcomes") || label.includes("operational reliability")) {
    return "An operational partner for cafe operators, centered on reliability and lower operator burden";
  }
  if (label.includes("governance") || label.includes("impact")) {
    return "A responder-support organization centered on visible impact";
  }
  if (label.includes("strategic guidance")) {
    return "A strategic guidance system";
  }
  if (center?.label) {
    return `A company increasingly centered on ${center.label}`;
  }
  return null;
}

function strategicDescriptorFromIdentity(identity: string | null, center: StrategicCenter | null) {
  const phrase = lower(identity);
  if (phrase.includes("operational partner for cafe operators")) {
    return "partner operational outcomes and operational reliability";
  }
  if (phrase.includes("responder-support organization")) {
    return "visible impact for responders and donors";
  }
  if (phrase.includes("strategic guidance system")) {
    return "strategic guidance and better path selection";
  }
  return clean(center?.label || null) || null;
}

function inferCustomerIdentity(text: string, center: StrategicCenter | null) {
  if (includesAny(text, ["reliability", "consistency", "predictable", "operator burden", "support"])) {
    return "Early signs that day-to-day reliability matters";
  }
  if (includesAny(text, ["craft", "specialty coffee", "quality", "roast"])) {
    return "Early signs that craft quality still matters";
  }
  if (includesAny(text, ["price", "convenience"])) {
    return "Early signs that price or convenience may carry more weight";
  }
  if (center?.customerLag) {
    return "Not enough direct customer proof yet";
  }
  return null;
}

export function inferIdentityNarrative(args: {
  activeRows: HypothesisProvenanceCard[];
  routeSeeds?: StrategicCenterRouteSeed[];
  phase: string;
  strategicCenter?: StrategicCenter | null;
}): IdentityNarrative {
  const rows = args.activeRows.filter((row) => row.hypothesis.is_active);
  const routeSeeds = args.routeSeeds ?? [];
  const publicText = collectBandText(rows, "outside", args.phase);
  const organizationText = lower([
    collectBandText(rows, "organization", args.phase),
    routeSeeds.map(routeNarrativeText).join(" "),
  ].join(" "));
  const customerText = collectBandText(rows, "customer", args.phase);

  const publicIdentity = inferPublicIdentity(publicText, args.strategicCenter ?? null);
  const strategicIdentity = inferStrategicIdentity(organizationText, args.strategicCenter ?? null);

  return {
    publicIdentity,
    publicDescriptor: publicDescriptorFromIdentity(publicIdentity, args.strategicCenter ?? null),
    strategicIdentity,
    strategicDescriptor: strategicDescriptorFromIdentity(strategicIdentity, args.strategicCenter ?? null),
    customerIdentity: inferCustomerIdentity(customerText, args.strategicCenter ?? null),
  };
}
