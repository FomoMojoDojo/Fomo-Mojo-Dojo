import { safeText } from "./textUtils";
import {
  buildMarketFitCheckpointSpine,
  buildMarketFitMapOption,
  bestFitStrategicMarketCategory,
} from "@/lib/marketTaxonomy";
import {
  JTBD_CHECKPOINT_COUNT,
  buildDefaultCheckpointSeed,
} from "@/lib/jtbdProcess";
import type { JobStepRow } from "@/hooks/useJobSteps";

export type JourneyKey = string;

export type JourneyGroup = {
  key: JourneyKey;
  title: string;
  subtitle: string;
  steps: JobStepRow[];
};

export function normalizeJourneyKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function titleCaseFromKey(key: string) {
  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Custom Journey";
}

export function titleFromKey(key: JourneyKey) {
  if (key === "customer") return "Customer Journey";
  if (key === "revenue") return "Revenue Journey";
  if (key === "operations") return "Operations Journey";
  return `${titleCaseFromKey(key)} Journey`;
}

export function subtitleFromKey(key: JourneyKey) {
  if (key === "customer") return "How a customer experiences the end-to-end service.";
  if (key === "revenue") return "How the company secures and grows revenue.";
  if (key === "operations") return "How the company builds and operates the service.";
  return `How ${titleCaseFromKey(key).toLowerCase()} progress through the work from start to finish.`;
}

export function fallbackStyleForJourney(key: string) {
  const palette = [
    { rail: "#FF7D2D", dot: "#FF7D2D" },
    { rail: "#5F9B8C", dot: "#5F9B8C" },
    { rail: "#233C4B", dot: "#233C4B" },
    { rail: "#A0C382", dot: "#A0C382" },
    { rail: "#FAC846", dot: "#FAC846" },
  ];
  const hash = Array.from(key).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

export const LOCAL_ODI_STEP_SEED = buildDefaultCheckpointSeed().map((checkpoint) => ({
  label: checkpoint.step_label,
  description: checkpoint.description,
}));

export function checkpointSeedForJourneyKey(journeyKey: string) {
  const normalizedKey = normalizeJourneyKey(journeyKey);
  if (normalizedKey.startsWith("market-fit-")) {
    const categoryKey = normalizedKey.replace(/^market-fit-/, "");
    const marketSeed = buildMarketFitCheckpointSpine(categoryKey);
    if (marketSeed.length === JTBD_CHECKPOINT_COUNT) return marketSeed;
  }
  return LOCAL_ODI_STEP_SEED;
}

export function groupJourneys(items: JobStepRow[]): JourneyGroup[] {
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

export { buildMarketFitMapOption, bestFitStrategicMarketCategory };
