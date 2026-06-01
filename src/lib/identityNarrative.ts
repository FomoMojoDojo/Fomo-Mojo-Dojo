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

// Derives public identity from the company's own public-context label.
// Never emits a canned reference-company identity string.
function inferPublicIdentity(center: StrategicCenter | null): string | null {
  const publicLabel = clean(center?.publicContextLabel || null);
  if (publicLabel) return `A company publicly known for ${publicLabel}`;
  return null;
}

// Derives strategic identity from the company's own center label (the L153 pattern).
// Never emits a canned reference-company identity string.
function inferStrategicIdentity(center: StrategicCenter | null): string | null {
  const label = clean(center?.label || null);
  if (!label) return null;
  return `A company increasingly centered on ${label}`;
}

function inferCustomerIdentity(text: string, center: StrategicCenter | null): string | null {
  if (includesAny(text, ["reliability", "consistency", "predictable"])) {
    return "Early signs that reliability and consistency drive customer choice";
  }
  if (includesAny(text, ["craft", "quality", "roast"])) {
    return "Early signs that quality and standards drive customer choice";
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
  // routeSeeds kept for API compatibility — not used internally after identity derivation moved to center
  routeSeeds?: StrategicCenterRouteSeed[];
  phase: string;
  strategicCenter?: StrategicCenter | null;
}): IdentityNarrative {
  const rows = args.activeRows.filter((row) => row.hypothesis.is_active);
  const customerText = collectBandText(rows, "customer", args.phase);
  const center = args.strategicCenter ?? null;

  return {
    publicIdentity: inferPublicIdentity(center),
    publicDescriptor: clean(center?.publicContextLabel || null) || null,
    strategicIdentity: inferStrategicIdentity(center),
    strategicDescriptor: clean(center?.label || null) || null,
    customerIdentity: inferCustomerIdentity(customerText, center),
  };
}
