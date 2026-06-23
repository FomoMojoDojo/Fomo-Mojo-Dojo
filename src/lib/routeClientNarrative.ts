import type { RouteRationaleEvidenceItem } from "@/lib/routeRationale";
import type { RouteAssumption, RouteRow } from "@/hooks/useRoutes";

export function deriveClientEvidence(route: RouteRow): RouteRationaleEvidenceItem[] {
  const stored = (Array.isArray(route.evidence_json) ? route.evidence_json : []) as RouteRationaleEvidenceItem[];
  if (stored.length > 0) return stored;
  const category = String(route.category || "").toLowerCase();
  if (category === "fix") {
    return [
      { id: `${route.id}-ev-1`, title: "Current-state evidence for the identified gap", status: "missing" },
      { id: `${route.id}-ev-2`, title: "Decision owner and turnaround timing confirmed", status: "missing" },
    ];
  }
  if (category === "improve") {
    return [
      { id: `${route.id}-ev-1`, title: "Improvement owner and baseline metric defined", status: "in_progress" },
      { id: `${route.id}-ev-2`, title: "Target state and success metric confirmed", status: "missing" },
    ];
  }
  return [
    { id: `${route.id}-ev-1`, title: "New capability owner and pilot scope defined", status: "missing" },
    { id: `${route.id}-ev-2`, title: "Demand validation evidence gathered", status: "missing" },
  ];
}

export function deriveClientAssumptions(route: RouteRow, evidence: RouteRationaleEvidenceItem[]): RouteAssumption[] {
  if (Array.isArray(route.assumptions_json) && route.assumptions_json.length > 0) {
    const validLayers = new Set(["outside", "org", "customer", "market"]);
    const validStatuses = new Set(["supported", "partial", "unproven"]);
    return route.assumptions_json.map((assumption) => ({
      id: String(assumption.id ?? Math.random()),
      statement: String(assumption.statement ?? ""),
      status: (validStatuses.has(String(assumption.status)) ? assumption.status : "unproven") as RouteAssumption["status"],
      layer: (validLayers.has(String(assumption.layer)) ? assumption.layer : "outside") as RouteAssumption["layer"],
      critical: assumption.critical ?? false,
      evidence_refs: Array.isArray(assumption.evidence_refs) ? assumption.evidence_refs : undefined,
    }));
  }

  const category = String(route.category || "").toLowerCase();
  const frameworks = Array.isArray(route.frameworks_used) ? route.frameworks_used.map(String) : [];
  const hasOutsideSignals = frameworks.some((framework) =>
    ["odi", "jtbd", "public", "baseline"].some((marker) => framework.toLowerCase().includes(marker)),
  );
  const supportingCount = evidence.filter((item) => item.status !== "missing").length;
  const missingCount = evidence.filter((item) => item.status === "missing").length;
  const hasEvidence = supportingCount > 0;

  const assumptions: RouteAssumption[] = [];

  if (category === "fix") {
    assumptions.push(
      {
        id: "fix-gap-real",
        statement: "The identified gap directly limits customer or business outcomes.",
        layer: "outside",
        status: hasOutsideSignals || hasEvidence ? "supported" : "partial",
        critical: true,
      },
      {
        id: "fix-highest-leverage",
        statement: "Solving this gap would need to change a real customer or business outcome, not just clean up the process.",
        layer: "customer",
        status: "unproven",
        critical: true,
      },
      {
        id: "fix-capacity",
        statement: "The team has the capacity and ownership to close this gap.",
        layer: "org",
        status: "unproven",
        critical: false,
      },
    );
  } else if (category === "improve") {
    assumptions.push(
      {
        id: "improve-can-strengthen",
        statement: "The current approach can be meaningfully strengthened without replacing it.",
        layer: "outside",
        status: hasEvidence ? "partial" : "unproven",
        critical: true,
      },
      {
        id: "improve-customer-value",
        statement: "Customers will notice and benefit from this improvement.",
        layer: "customer",
        status: "unproven",
        critical: true,
      },
    );
  } else {
    assumptions.push(
      {
        id: "create-demand",
        statement: "Customers would need to value this new path enough to change a real decision.",
        layer: "customer",
        status: "unproven",
        critical: true,
      },
      {
        id: "create-timing",
        statement: "The market timing is right for this investment.",
        layer: "market",
        status: hasOutsideSignals ? "partial" : "unproven",
        critical: false,
      },
      {
        id: "create-sustain",
        statement: "The organization can sustain this after the initial build.",
        layer: "org",
        status: "unproven",
        critical: false,
      },
    );
  }

  if (missingCount > 0) {
    assumptions.push({
      id: "evidence-gaps-closed",
      statement: `The ${missingCount} flagged evidence gap${missingCount !== 1 ? "s" : ""} will be resolved before executing this route.`,
      layer: "org",
      status: "unproven",
      critical: false,
    });
  }

  return assumptions;
}
