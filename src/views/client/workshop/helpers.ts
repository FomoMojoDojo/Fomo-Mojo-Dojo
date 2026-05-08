import type { GapAlignment, BaselineResult } from "./types";

export function toSentence(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

// Strip system-generated placeholder text from evidence snippets.
// "Declared in page metadata (/)" means the research system found a <meta> tag
// declaration but no substantive content — not useful to show verbatim.
export const PLACEHOLDER_PATTERNS = [
  /^declared in (page )?metadata/i,
  /^found in (page )?metadata/i,
  /^referenced in (page )?metadata/i,
  /^present in (page )?metadata/i,
  /^mentioned in (page )?metadata/i,
  /^referenced in (script|asset)\s*(asset|file|resource)?/i,
  /^no public content found/i,
];

export function cleanSnippet(snippet: string | null | undefined): string | null {
  const text = (snippet || "").trim();
  if (!text) return null;
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(text))) return null;
  return text;
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function coverageOf(fields: (string | number | boolean | null | undefined)[]): number {
  return fields.filter((f) => (typeof f === "string" ? f.trim().length > 0 : !!f)).length;
}

export function alignmentOf(
  orgValue: string | null | undefined,
  outsideValue: string | null | undefined,
): GapAlignment {
  const org = (orgValue || "").trim();
  const out = (outsideValue || "").trim();
  if (!out) return "missing";
  if (!org) return "gap";
  if (org.toLowerCase() === out.toLowerCase()) return "aligned";
  const orgWords = new Set(org.toLowerCase().split(/\s+/).filter((w) => w.length > 3));
  const outWords = out.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const overlap = outWords.filter((w) => orgWords.has(w)).length;
  if (outWords.length > 0 && overlap / outWords.length > 0.25) return "drift";
  return "gap";
}

export function baselineOf(run: { result_json?: unknown } | null): BaselineResult | null {
  if (!run?.result_json || typeof run.result_json !== "object") return null;
  return run.result_json as BaselineResult;
}

export const INNOVATION_OPTIONS = [
  { value: "differentiated", label: "Differentiated — you do things others can't" },
  { value: "dominant",       label: "Dominant — you outperform on what matters most" },
  { value: "disruptive",     label: "Disruptive — you're redefining how the job gets done" },
  { value: "discrete",       label: "Discrete — you serve a segment no one else is focused on" },
];
