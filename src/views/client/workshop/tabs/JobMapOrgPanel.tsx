import { useMemo, useState, useRef, useEffect, Fragment, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { JobStepRow } from "@/hooks/useJobSteps";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { RouteRow } from "@/hooks/useRoutes";
import { useFoundationProvenance } from "@/hooks/useFoundationProvenance";
import { FoundationClaimSupport } from "@/components/evidence/FoundationClaimSupport";
import {
  checkpointForStepNumber,
  containsNonOdiProcessLanguage,
  containsSolutionPrescriptiveLanguage,
} from "@/lib/jtbdProcess";
import { isInternalMetadataString } from "@/lib/clientFacingVoice";
import { isSurveyValidated, needBestGuessBand, needBestGuessBandLabel, serviceVerdictWord } from "@/lib/surveyVerdict";
import { D } from "@/components/design-system/tokens";
import { SignalBasisChip, type SignalBasis } from "@/components/design-system/SignalBasisChip";

const ODI_LABELS = ["DEFINE", "LOCATE", "PREPARE", "EXECUTE", "MONITOR", "MODIFY", "CONCLUDE", "EVALUATE"] as const;
const MONO = "'JetBrains Mono', ui-monospace, monospace";
const NEEDS_REVIEW_STATES = new Set(["needs_review", "stale", "contradicted", "revalidate"]);

// Synthetic terminal step — a job step that exists in the ODI progression but was not
// generated during synthesis. Rendered with "Emerging" posture and a "not yet captured" note.
type JobStepRowExt = JobStepRow & { _synthetic?: true };

const TERMINAL_LABELS: Record<number, string> = {
  7: "Confirm approach",
  8: "Conclude and adjust",
};

// Pads journeys with fewer than 8 steps by synthesizing the missing terminal checkpoints
// from the existing journey context. Synthetic steps are marked _synthetic=true and carry
// no evidence — they render as "Emerging" with no gap or basis.
function normalizeSetSteps(steps: JobStepRowExt[]): JobStepRowExt[] {
  if (steps.length >= 8) return steps;
  const last = steps[steps.length - 1];
  if (!last) return steps;
  const result: JobStepRowExt[] = [...steps];
  for (let n = steps.length + 1; n <= 8; n++) {
    result.push({
      id: `synth-${last.journey_key}-${n}`,
      company_id: last.company_id,
      user_id: last.user_id,
      journey_key: last.journey_key,
      journey_title: last.journey_title,
      journey_subtitle: last.journey_subtitle,
      step_number: n,
      step_label: TERMINAL_LABELS[n] ?? `Step ${n}`,
      description: null,
      designed: false,
      has_gap: false,
      evidence_status: "unclear",
      evidence_basis: null,
      evidence_confidence: null,
      gap_note: null,
      _synthetic: true,
    });
  }
  return result;
}

function odiLabel(index: number): string {
  return ODI_LABELS[index % ODI_LABELS.length];
}

function displayStepLabel(step: JobStepRow): string {
  const raw = String(step.step_label || "").trim();
  const fallback = checkpointForStepNumber(step.step_number || 1).canonicalLabel;
  if (!raw) return fallback;
  return containsSolutionPrescriptiveLanguage(raw) || containsNonOdiProcessLanguage(raw) ? fallback : raw;
}

function displayMarketTitle(value: string | null | undefined, fallbackKey = "") {
  const raw = String(value || "").trim()
    .replace(/^(checkpoint map|job map)\s*:\s*/i, "")
    .trim();
  if (raw) return raw;
  return fallbackKey ? fallbackKey.charAt(0).toUpperCase() + fallbackKey.slice(1) : "";
}

export function suggestionScore(s: JobStepRow): number {
  let n = 0;
  if (s.has_gap) n += 3;
  if (s.evidence_status === "unclear") n += 2;
  else if (s.evidence_status === "implied") n += 1;
  const conf = s.evidence_confidence ?? 100;
  if (conf < 40) n += 2;
  else if (conf < 70) n += 1;
  return n;
}

export function deriveSuggestedId(steps: JobStepRow[]): string | null {
  if (steps.length === 0) return null;
  const sorted = [...steps].sort((a, b) => suggestionScore(b) - suggestionScore(a));
  const top = sorted[0];
  return top && suggestionScore(top) > 0 ? top.id : null;
}

// Strategic posture derived from evidence + gap state — user-facing language, not scores.
function stepPosture(step: JobStepRow): { label: string; color: string; bg: string } {
  const ev = step.evidence_status ?? "";
  const gap = step.has_gap;
  if (ev === "evidenced" && !gap) return { label: "Stable",            color: "#16a34a", bg: "#edf8f4" };
  if (ev === "evidenced" && gap)  return { label: "Under pressure",    color: "#c2410c", bg: "#fff4ec" };
  if (ev === "implied"   && !gap) return { label: "Weak signal",       color: "#6b7280", bg: "#f3f4f6" };
  if (ev === "implied"   && gap)  return { label: "Validation needed", color: "#b45309", bg: "#fef9ec" };
  // Declared direction (operator-signed treatment): one amber state regardless of
  // has_gap — provenance is a single posture; the gap signal rides the existing
  // gap affordances rather than inventing a compound state.
  if (ev === "declared")          return { label: "Declared",          color: "#b45309", bg: "#fef3c7" };
  if (ev === "unclear"   && gap)  return { label: "Under pressure",    color: "#c2410c", bg: "#fff4ec" };
  return                                 { label: "Emerging",          color: "#6d28d9", bg: "#f5f3ff" };
}

// Short signal line for tiles — gap note or description first sentence, capped at 60 chars.
function tileSignal(step: JobStepRow): string | null {
  if (step.has_gap && step.gap_note) {
    const note = step.gap_note.replace(/['.]+\s*$/, "").trim();
    if (note.length > 6) return trunc(note, 60);
  }
  if (step.description) {
    const idx = step.description.search(/[.!?]/);
    const first = (idx > 0 ? step.description.slice(0, idx) : step.description).trim();
    if (first.length > 6) return trunc(first, 60);
  }
  return null;
}

// ─── Internal condition generation ──────────────────────────────────────────
// Priority: gap_note → description → evidence_basis → ownership → ODI phase.
// Generic fallback lines are used only when none of the descriptive fields exist.

// Strip leading negation markers to expose the core noun phrase.
function coreOf(text: string): string {
  return text
    .replace(/^(there (?:is|are) no|no formal|no clear|no defined|lack of|lacking|missing|unclear|without|not enough|limited|poor|insufficient)\s+/i, "")
    .replace(/^(?:\w+\s+)?(?:does?\s+not\s+have|do\s+not\s+have|has\s+no)\s+/i, "")
    .replace(/\s+(?:in place|exists?|available|found|present|currently|yet|documented|established|defined|used|needed|adequate|sufficient)\.?\s*$/i, "")
    .trim();
}

function ucFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/\.$/, "") : s;
}

function trunc(s: string, max = 68): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function wordTrunc(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut) + "…";
}

// Convert the first word of a step label to a gerund so "before negotiating terms begins" reads naturally.
function gerundPhrase(label: string): string {
  const [first, ...rest] = label.split(/\s+/);
  const v = first.toLowerCase();
  const VOWELS = "aeiou";
  let g: string;
  if (v.endsWith("ing")) g = v;
  else if (v.endsWith("ie")) g = v.slice(0, -2) + "ying";
  else if (v.endsWith("e") && v.length > 3 && !VOWELS.includes(v[v.length - 2])) g = v.slice(0, -1) + "ing";
  else if (
    v.length <= 5 &&
    !VOWELS.includes(v[v.length - 1]) &&
    v[v.length - 1] !== "y" &&
    VOWELS.includes(v[v.length - 2]) &&
    !VOWELS.includes(v[v.length - 3] ?? "")
  ) {
    g = v + v[v.length - 1] + "ing";
  }
  else g = v + "ing";
  return rest.length ? `${g} ${rest.join(" ").toLowerCase()}` : g;
}

// ── Condition-builder honesty gate (b-i, operator-signed 2026-06-13) ──────────
// The former deriveInternalConditions mad-libbed a step's own prose (gap_note →
// description → evidence_basis → ownership → ODI phase) into canned assertions
// ("… is established", "… requirements are established", "Ownership of … is named
// and documented", "… is tracked and current", and 8 ODI-phase boilerplate
// sentences) rendered as the live "What must be true" panel. That is fabrication:
// a template-transformed assertion is NOT a model-authored condition. It also
// leaked internal run-tags (e.g. "Run_mojo_analysis:… is tracked and current").
//
// b-i removes the fabrication entirely. The only genuine source it drew from
// (gap_note) is already surfaced honestly elsewhere — the gap badge in the
// expanded detail and tileSignal on the tile — so nothing real is lost. A
// labeled best-guess condition is the generator's job (b-ii), never a template.
//
// What remains is the STANDING GATE below. assertNoCannedConditionString refuses
// the canned class (and the run-tag leak shape), and InternalConditions — the
// SOLE sanctioned path for rendering step conditions — routes every string
// through it, so a future generator (b-ii) cannot silently reintroduce garble:
// any conditions render MUST pass this gate.

// Canned/template assertion class produced by the removed builder. A string
// matching any of these is refused at the render boundary (dropped; loud in dev).
const CANNED_CONDITION_PATTERNS: RegExp[] = [
  /\b(?:is|are)\s+established\b/i,
  /requirements?\s+(?:are\s+established|(?:are\s+)?documented\s+before\s+the\s+step\s+begins)/i,
  /\bmust\s+be\s+confirmed\b/i,
  /\bis\s+named\s+and\s+documented\b/i,
  /\bis\s+tracked\s+and\s+current\b/i,
  /\bis\s+captured\s+before\s+decisions\s+are\s+made\b/i,
  // ODI-phase boilerplate stems:
  /can\s+state\s+what\s+a\s+successful\b/i,
  /\bis\s+documented,\s+not\s+held\s+by\s+one\s+person\b/i,
  /\bis\s+written\s+down,\s+not\s+assumed\b/i,
  /\bhas\s+the\s+authority\s+to\s+act\s+without\s+escalating\b/i,
  /\ba\s+named\s+signal\b|\bnot\s+a\s+gut\s+check\b/i,
  /\bgo\s+through\s+an\s+identified\s+reviewer\b/i,
  /\bhanded\s+off\s+in\s+a\s+form\s+the\s+next\s+step\s+can\s+use\b/i,
  /\bsomeone\s+updates\s+the\s+approach\s+based\s+on\s+what\s+happened\b/i,
];
// Internal run-tag leak shape (e.g. "run_mojo_analysis:2026-06-10",
// "dify_mojo_analysis:…") — never client-facing as a condition.
const RUN_TAG_CONDITION_PATTERN = /^\s*(?:run|dify)_mojo_analysis\s*:/i;

// Render-boundary guard: returns true if `s` is a canned/templated assertion or a
// run-tag leak that must NOT render as a condition. Throws loudly in dev so a
// regression is caught at the source; in prod it returns true and the caller
// drops the string (fail-closed, never render garble).
function assertNoCannedConditionString(s: string): boolean {
  const str = String(s ?? "");
  const canned =
    RUN_TAG_CONDITION_PATTERN.test(str) ||
    CANNED_CONDITION_PATTERNS.some((re) => re.test(str));
  if (canned && import.meta.env?.DEV) {
    throw new Error(
      `[JobMapOrgPanel] Refused canned/templated condition string: ${JSON.stringify(str.slice(0, 120))}. ` +
        `Conditions must be model-authored, not template-substituted (b-i honesty gate).`,
    );
  }
  return canned;
}

// MH-2 boilerplate-jtbd guard (b-i render-boundary pattern). The generic fallback
// job statement (research-company:3269 stem) is NOT an honestly-named market — the
// header routes it to the emptiness invitation rather than rendering a borrowed
// executor against a template job. Keep in sync with that template.
const BOILERPLATE_JTBD_MARKERS: RegExp[] = [
  /when\s+trying\s+to\s+complete\s+this\s+job/i,
  /move\s+from\s+defining\s+outcomes\s+to\s+executing\s+and\s+monitoring\s+progress/i,
];
function isBoilerplateJtbd(jtbd: string | null | undefined): boolean {
  const s = String(jtbd ?? "");
  return BOILERPLATE_JTBD_MARKERS.some((re) => re.test(s));
}

// MH-4a: each switcher option's market headline (its market_def executor clause),
// using the same MH-2 honesty gate; null → fall back to the set title in the menu.
type SwitcherMarketDef = { journey_key?: string | null; job_executor?: string | null; jtbd?: string | null; provenance_type?: string | null } | null;
function optionMarketName(md: SwitcherMarketDef, key: string): string | null {
  if (!md) return null;
  if (String(md.journey_key ?? "").trim().toLowerCase() !== String(key ?? "").trim().toLowerCase()) return null;
  if (isBoilerplateJtbd(md.jtbd)) return null;
  const exec = String(md.job_executor ?? "").trim();
  return exec || null;
}

// MH-4a: the MH-2 headline as a switcher. Options are each candidate set's market
// headline; selecting switches the VIEWED set only (never the chosen on-strategy
// set — that stays with the ON STRATEGY chip). Rendered only when >1 candidate set.
function MarketSwitcher({ options, activeKey, activeName, activeIsValidated, showingAll, onSelect, onShowAll }: {
  options: Array<{ key: string; title: string; marketDef: SwitcherMarketDef }>;
  activeKey: string;
  activeName: string | null;
  activeIsValidated: boolean;
  showingAll?: boolean;
  onSelect: (key: string) => void;
  onShowAll?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const nk = (v: string | null | undefined) => String(v ?? "").trim().toLowerCase();
  const triggerLabel = showingAll ? "All markets" : (activeName ?? "This map's market isn't named yet — who is it for, and what are they getting done?");
  const named = showingAll || !!activeName;
  return (
    <div style={{ position: "relative", marginBottom: 20 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "flex-start", gap: 10, maxWidth: 780 }}
      >
        <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <span style={{ fontFamily: D.sans, fontSize: named && !showingAll ? 28 : showingAll ? 28 : 18, fontWeight: named ? 700 : 500, color: named ? D.ink : D.inkSoft, lineHeight: 1.18, letterSpacing: "-0.02em" }}>
            {triggerLabel}
          </span>
          {!showingAll && activeName && !activeIsValidated && (
            <span style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "#b45309", background: "#fef9ec", border: "1px solid #f5d96b", borderRadius: 3, padding: "3px 9px" }}>
              Hypothesis — not yet validated
            </span>
          )}
        </span>
        <span aria-hidden="true" style={{ fontSize: 16, color: D.inkFaint, marginTop: 8, flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <div role="listbox" style={{ position: "absolute", top: "100%", left: 0, zIndex: 30, marginTop: 6, background: "#fff", border: `1px solid ${D.hairline}`, borderRadius: 8, boxShadow: "0 8px 28px rgba(17,17,17,0.12)", minWidth: 340, maxWidth: 560, padding: 6 }}>
          <p style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: D.inkFaint, margin: "4px 10px 6px" }}>Switch market — viewing only</p>
          {options.map((o) => {
            const name = optionMarketName(o.marketDef, o.key);
            const isHyp = !!name && String(o.marketDef?.provenance_type ?? "") !== "manual";
            const isActive = !showingAll && nk(o.key) === nk(activeKey);
            return (
              <button key={o.key} type="button" role="option" aria-selected={isActive}
                onClick={() => { onSelect(o.key); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: isActive ? "rgba(17,17,17,0.05)" : "none", border: "none", borderRadius: 5, padding: "8px 10px", cursor: "pointer", fontFamily: D.sans, fontSize: 13.5, color: D.ink, lineHeight: 1.4 }}>
                <span style={{ flex: 1 }}>{name ?? o.title}{!name && <span style={{ color: D.inkFaint }}> — market not named yet</span>}</span>
                {isHyp && <span style={{ fontFamily: D.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.06em", color: "#b45309", background: "#fef9ec", border: "1px solid #f5d96b", borderRadius: 3, padding: "2px 6px", flexShrink: 0 }}>hyp</span>}
              </button>
            );
          })}
          {onShowAll && (
            <button type="button" role="option" aria-selected={!!showingAll}
              onClick={() => { onShowAll(); setOpen(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", background: showingAll ? "rgba(17,17,17,0.05)" : "none", border: "none", borderTop: `1px solid ${D.hairlineFaint}`, marginTop: 4, padding: "8px 10px", cursor: "pointer", fontFamily: D.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: D.inkSoft }}>
              Show all markets
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const EVIDENCE_DOT: Record<string, { label: string; color: string }> = {
  evidenced: { label: "Evidenced", color: "#16a34a" },
  implied:   { label: "Implied",   color: "#E8A317" },
  unclear:   { label: "Unclear",   color: "#ef4444" },
  declared:  { label: "Declared",  color: "#b45309" },
};

function EvidenceStatus({ step }: { step: JobStepRow }) {
  const ev = step.evidence_status ? EVIDENCE_DOT[step.evidence_status] : null;
  const dotColor = ev?.color ?? "#d1d5db";
  const evLabel = ev?.label ?? "Not assessed";
  return (
    <div className="crpv-ws-jobmap-tile-status">
      <span className="crpv-ws-jobmap-dot" style={{ background: dotColor }} />
      <span>{evLabel}</span>
      {typeof step.evidence_confidence === "number" && (
        <span className="crpv-ws-jobmap-tile-conf">· {step.evidence_confidence}%</span>
      )}
    </div>
  );
}

// b-ii per-step condition entry (job_steps.conditions_json). status drives the copy
// tier; only "best_guess" is produced today, "real_source" reserved.
type StepCondition = { condition: string; status?: string; origin?: string };

// Signed copy (B-II-3 operator signature).
const COND_COPY = {
  best_guess: {
    heading: "What must be true — a starting hypothesis",
    marker: "Hypothesis — not yet validated",
    subline: "A starting read from this step. Test it against evidence before relying on it.",
  },
  real_source: { heading: "What must be true" },
};

function ConditionsList({ items }: { items: string[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
      {items.map((c, i) => (
        <p key={i} style={{ fontFamily: D.sans, fontSize: 13, color: D.ink, margin: 0, lineHeight: 1.55, display: "flex", gap: 8 }}>
          <span aria-hidden="true" style={{ color: D.inkFaint, flexShrink: 0 }}>•</span>
          <span>{c}</span>
        </p>
      ))}
    </div>
  );
}

// Sole sanctioned path for rendering step conditions — the b-i standing gate. Every
// string is filtered through assertNoCannedConditionString (canned/run-tag dropped,
// throws in dev). Branches on status tier; renders NOTHING when no admissible
// condition remains (hide tier — no empty heading). Mounted in the live
// renderStepDetail (the hierarchy detail), tile-independent styling.
function InternalConditions({ entries }: { entries: StepCondition[] }) {
  const admissible = (entries ?? []).filter(
    (e) => e && typeof e.condition === "string" && e.condition.trim() && !assertNoCannedConditionString(e.condition),
  );
  if (admissible.length === 0) return null;
  const realSource = admissible.filter((e) => e.status === "real_source").map((e) => e.condition);
  const bestGuess = admissible.filter((e) => e.status !== "real_source").map((e) => e.condition);
  const headingStyle = { fontFamily: D.mono, fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: D.inkFaint, margin: 0 };

  return (
    <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${D.hairlineFaint}` }}>
      {realSource.length > 0 && (
        <div style={{ marginBottom: bestGuess.length > 0 ? 24 : 0 }}>
          <p style={headingStyle}>{COND_COPY.real_source.heading}</p>
          <ConditionsList items={realSource} />
        </div>
      )}
      {bestGuess.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <p style={headingStyle}>{COND_COPY.best_guess.heading}</p>
            <span style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "#b45309", background: "#fef9ec", border: "1px solid #f5d96b", borderRadius: 3, padding: "2px 7px" }}>
              {COND_COPY.best_guess.marker}
            </span>
          </div>
          <p style={{ fontFamily: D.sans, fontSize: 11.5, color: D.inkFaint, margin: "6px 0 0", lineHeight: 1.5, fontStyle: "italic" }}>
            {COND_COPY.best_guess.subline}
          </p>
          <ConditionsList items={bestGuess} />
        </div>
      )}
    </div>
  );
}

function EvidenceDrawer({ step }: { step: JobStepRow }) {
  const ev = step.evidence_status ? EVIDENCE_DOT[step.evidence_status] : null;
  const dotColor = ev?.color ?? "#d1d5db";
  const basisClean = (() => {
    const raw = step.evidence_basis;
    if (!raw) return null;
    if (isInternalMetadataString(raw)) return null; // run-tags / input-keys / bare keys → hide
    return raw;
  })();
  return (
    <div style={{ borderTop: "1px solid #f0f2f5", paddingTop: 7, marginTop: 4, display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0, display: "inline-block" }} />
        <span style={{ fontSize: 10, color: "#6b7280" }}>{ev?.label ?? "Not assessed"}</span>
        {typeof step.evidence_confidence === "number" && (
          <span style={{ fontSize: 10, color: "#9ca3af" }}>· {step.evidence_confidence}%</span>
        )}
      </div>
      {basisClean && (
        <p style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.4, margin: 0 }}>{basisClean}</p>
      )}
      {step.has_gap && step.gap_note && (
        <p style={{ fontSize: 10, color: "#b45309", lineHeight: 1.4, margin: 0 }}>
          Gap: {step.gap_note.length > 90 ? step.gap_note.slice(0, 90) + "…" : step.gap_note}
        </p>
      )}
    </div>
  );
}

function EvidenceToggle({ open, onToggle, step }: { open: boolean; onToggle: (e: React.MouseEvent) => void; step: JobStepRow }) {
  const ev = step.evidence_status ? EVIDENCE_DOT[step.evidence_status] : null;
  const dotColor = ev?.color ?? "#d1d5db";
  return (
    <button
      type="button"
      onClick={onToggle}
      title={open ? "Hide evidence" : "Show evidence"}
      style={{
        alignSelf: "flex-end",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "2px 0 0",
        display: "flex",
        alignItems: "center",
        gap: 3,
        lineHeight: 1,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, display: "inline-block", opacity: open ? 1 : 0.5 }} />
    </button>
  );
}

function SuggestedTile({
  step, odi, num, isActive, isInactive, isRouteLinked, activeRoute, onSelect, routes, routesReady,
}: {
  step: JobStepRowExt; odi: string; num: number; isActive: boolean; isInactive: boolean;
  isRouteLinked: boolean; activeRoute?: RouteRow | null;
  onSelect: () => void;
  routes: RouteRow[];
  routesReady?: boolean;
}) {
  const posture = stepPosture(step);
  const shortDesc = (() => {
    if (!step.description) return null;
    const idx = step.description.search(/[.!?]/);
    return (idx > 0 ? step.description.slice(0, idx) : step.description).trim();
  })();

  const contextLine: string | null = isRouteLinked && activeRoute
    ? `Connected route: ${activeRoute.title || "Untitled"}`
    : null;

  return (
    <div
      className={`crpv-ws-jobmap-tile suggested expanded${isActive ? " active" : ""}${isInactive ? " inactive" : ""}${step.has_gap ? " has-gap" : ""}${isRouteLinked ? " route-linked" : ""}`}
      onClick={onSelect}
      style={{ cursor: "pointer" }}
    >
      <div style={{ display: "flex", alignItems: "baseline" }}>
        <span className="crpv-ws-jobmap-tile-num">{String(num).padStart(2, "0")}</span>
      </div>
      <span className="crpv-ws-jobmap-tile-odi">{odi}</span>
      <p className="crpv-ws-jobmap-tile-name">{displayStepLabel(step)}</p>
      {shortDesc && <p className="crpv-ws-jobmap-tile-desc">{shortDesc}</p>}
      <div className="crpv-ws-jobmap-tile-posture" style={{ color: posture.color, background: posture.bg }}>
        {posture.label}
      </div>
      {contextLine && <p className="crpv-ws-jobmap-tile-ctx">{contextLine}</p>}
      <div className="crpv-ws-jobmap-tile-lower">
        {routesReady && routes.length > 0 && (
          <SuggestedRoutes routes={routes} step={step} />
        )}
      </div>
      <p className="crpv-ws-jobmap-tile-focus cap">↑ Highest risk</p>
    </div>
  );
}

function RegularTile({
  step,
  odi,
  num,
  isActive,
  isInactive,
  isRouteLinked,
  activeRoute,
  onSelect,
}: {
  step: JobStepRowExt;
  odi: string;
  num: number;
  isActive: boolean;
  isInactive: boolean;
  isRouteLinked: boolean;
  activeRoute?: RouteRow | null;
  onSelect: () => void;
}) {
  const posture = step._synthetic
    ? { label: "Emerging", color: "#6d28d9", bg: "#f5f3ff" }
    : stepPosture(step);
  const signal = step._synthetic ? null : tileSignal(step);

  const contextLine: string | null = isRouteLinked && activeRoute
    ? `Connected route: ${activeRoute.title || "Untitled"}`
    : step._synthetic
      ? "Not yet captured"
      : null;

  return (
    <div
      className={`crpv-ws-jobmap-tile${isActive ? " active" : ""}${isInactive ? " inactive" : ""}${step.has_gap ? " has-gap" : ""}${isRouteLinked ? " route-linked" : ""}${step._synthetic ? " synthetic" : ""}`}
      onClick={step._synthetic ? undefined : onSelect}
      style={{ cursor: step._synthetic ? "default" : "pointer" }}
    >
      <div className="crpv-ws-jobmap-tile-hd">
        <span className="crpv-ws-jobmap-tile-num">{String(num).padStart(2, "0")}</span>
        <span className="crpv-ws-jobmap-tile-odi">{odi}</span>
      </div>
      <p className="crpv-ws-jobmap-tile-name">{displayStepLabel(step)}</p>
      {!contextLine && signal && <p className="crpv-ws-jobmap-tile-signal">{signal}</p>}
      <div className="crpv-ws-jobmap-tile-posture" style={{ color: posture.color, background: posture.bg }}>
        {posture.label}
      </div>
      {contextLine && <p className="crpv-ws-jobmap-tile-ctx">{contextLine}</p>}
    </div>
  );
}

// ─── Route matching ──────────────────────────────────────────────────────────

const MATCH_STOP = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "has",
  "that", "this", "with", "from", "they", "will", "have", "been", "were",
  "what", "when", "your", "their", "does", "into", "more", "than",
  "then", "some", "would", "could", "should", "which", "there", "about",
  "being", "before", "after", "each", "how", "who", "may", "our",
]);

function tokenSet(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !MATCH_STOP.has(w)),
  );
}

type MatchedRoute = { route: RouteRow; reason: string | null };

function matchRoutesToStep(
  routes: RouteRow[],
  step: JobStepRow,
  limit = 3,
): MatchedRoute[] {
  if (routes.length === 0) return [];

  // Corpus keys off REAL step fields only (b-i honesty pass): no template-derived
  // "conditions" enter matching. evidence_basis is included raw — it is not
  // rendered here (no leak) and any internal run-tag tokens match no route.
  const stepCorpus = [
    displayStepLabel(step),
    step.gap_note ?? "",
    step.description ?? "",
    step.evidence_basis ?? "",
  ].join(" ");
  const stepTokens = tokenSet(stepCorpus);

  const scored = routes.map((route) => {
    const whys = Array.isArray(route.why_this_matters_json)
      ? (route.why_this_matters_json as string[])
      : [];
    const corpus = [route.title, route.short_description ?? "", ...whys].join(" ");
    const routeTokens = tokenSet(corpus);

    let score = 0;
    for (const w of routeTokens) if (stepTokens.has(w)) score++;

    // Reason: first why bullet or short_description, capped at 70 chars.
    // Skip for derived routes whose short_description is internal metadata.
    let reason: string | null = null;
    if (!route.id.startsWith("derived-")) {
      const raw = whys[0] ?? route.short_description ?? null;
      if (raw && raw.trim().length > 6) {
        reason = raw.length > 70 ? raw.slice(0, 70) + "…" : raw;
      }
    }

    return { route, score, reason };
  });

  scored.sort((a, b) => b.score - a.score);

  // Fallback: no text overlap → rank by pts_value descending, no reason shown
  if (scored[0]?.score === 0) {
    return [...routes]
      .sort((a, b) => (b.pts_value ?? 0) - (a.pts_value ?? 0))
      .slice(0, limit)
      .map((r) => ({ route: r, reason: null }));
  }

  return scored.slice(0, limit).map((s) => ({ route: s.route, reason: s.reason }));
}

const CATEGORY_SHORT: Record<string, string> = { fix: "pressure", improve: "validation", create: "directional" };

function SuggestedRoutes({
  routes,
  step,
}: {
  routes: RouteRow[];
  step: JobStepRow;
}) {
  const matched = matchRoutesToStep(routes, step, 3);
  if (matched.length === 0) return null;
  return (
    <div className="crpv-ws-jobmap-tile-routes">
      <p className="cap crpv-ws-jobmap-tile-routes-lbl">Routes that could help</p>
      {matched.map(({ route, reason }, i) => (
        <div key={i} className="crpv-ws-jobmap-tile-routes-item">
          <p className="crpv-ws-jobmap-tile-routes-title">
            <span className="crpv-ws-jobmap-tile-sw-dash" aria-hidden="true">•</span>
            <span>
              {route.title || "Untitled route"}
              {route.category && CATEGORY_SHORT[route.category] && (
                <span className="crpv-ws-jobmap-tile-routes-cat">
                  {" · "}{CATEGORY_SHORT[route.category]}
                </span>
              )}
            </span>
          </p>
          {reason && (
            <p className="crpv-ws-jobmap-tile-routes-reason">{reason}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function JourneySection({
  jk,
  jSteps: rawSteps,
  title,
  subtitle,
  summaryParts,
  suggestedId,
  activeStepId,
  onSelectStep,
  routes,
  routesReady,
  activeRoute,
  headerControls,
}: {
  jk: string;
  jSteps: JobStepRowExt[];
  title: string;
  subtitle: string | null;
  summaryParts: string[];
  suggestedId: string | null;
  activeStepId: string | null;
  onSelectStep: (id: string) => void;
  routes: RouteRow[];
  routesReady?: boolean;
  activeRoute?: RouteRow | null;
  headerControls?: ReactNode;
}) {
  const jSteps = useMemo(() => normalizeSetSteps(rawSteps), [rawSteps]);

  // Compute which steps are linked to the active route by text-token overlap.
  const routeLinkedStepIds = useMemo<Set<string>>(() => {
    if (!activeRoute) return new Set();
    const linked = new Set<string>();
    for (const step of jSteps) {
      if (step._synthetic) continue;
      const matched = matchRoutesToStep([activeRoute], step, 1);
      if ((matched[0]?.score ?? 0) > 0) linked.add(step.id);
    }
    return linked;
  }, [activeRoute, jSteps]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const railRef   = useRef<HTMLDivElement>(null);
  const [canScrollLeft,  setCanScrollLeft]  = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Update arrow visibility on scroll, resize, and content changes
  useEffect(() => {
    const el   = scrollRef.current;
    const rail = railRef.current;
    if (!el) return;

    function update() {
      setCanScrollLeft(el!.scrollLeft > 1);
      setCanScrollRight(el!.scrollLeft + el!.clientWidth < el!.scrollWidth - 1);
    }

    // rAF ensures layout is complete before the first measurement
    const frame = requestAnimationFrame(update);
    el.addEventListener("scroll", update, { passive: true });

    // watch both: scroll container (viewport resize) + rail (content width changes)
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (rail) ro.observe(rail);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  // Auto-scroll to center the suggested tile on mount
  useEffect(() => {
    if (!suggestedId) return;
    const el   = scrollRef.current;
    const rail = railRef.current;
    if (!el || !rail) return;
    const frame = requestAnimationFrame(() => {
      const sugTile = rail.querySelector<HTMLElement>(".crpv-ws-jobmap-tile.suggested");
      if (!sugTile) return;
      const targetLeft = sugTile.offsetLeft - Math.max(0, (el.clientWidth - sugTile.offsetWidth) / 2);
      el.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [suggestedId]);

  // Scroll to the tile immediately before the first visible tile
  function handleScrollLeft() {
    const el   = scrollRef.current;
    const rail = railRef.current;
    if (!el || !rail) return;
    const tiles = Array.from(rail.querySelectorAll<HTMLElement>(".crpv-ws-jobmap-tile"));
    if (tiles.length === 0) return;
    const prevTile = [...tiles].reverse().find(t => t.offsetLeft < el.scrollLeft - 4);
    el.scrollTo({ left: prevTile ? prevTile.offsetLeft : 0, behavior: "smooth" });
  }

  // Scroll to the first tile whose left edge is past the current scroll position
  function handleScrollRight() {
    const el   = scrollRef.current;
    const rail = railRef.current;
    if (!el || !rail) return;
    const tiles = Array.from(rail.querySelectorAll<HTMLElement>(".crpv-ws-jobmap-tile"));
    if (tiles.length === 0) return;
    const nextTile = tiles.find(t => t.offsetLeft > el.scrollLeft + 4);
    if (nextTile) el.scrollTo({ left: nextTile.offsetLeft, behavior: "smooth" });
  }

  return (
    <div className="crpv-ws-jobmap-journey" key={jk}>
      <div className="crpv-ws-jobmap-hd">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            {title && <h2 className="crpv-ws-jobmap-title">{title}</h2>}
            {/* Vocabulary gate: subtitle not rendered (operator ruling) — both layouts. */}
            {summaryParts.length > 0 && (
              <p className="crpv-ws-jobmap-summary">{summaryParts.join(" · ")}</p>
            )}
            {activeRoute && routeLinkedStepIds.size > 0 && (
              <p style={{ margin: "4px 0 0", fontSize: 11, color: "#2563eb", fontFamily: MONO, letterSpacing: "0.04em" }}>
                {routeLinkedStepIds.size} step{routeLinkedStepIds.size !== 1 ? "s" : ""} connected to active route
              </p>
            )}
          </div>
          {headerControls ?? null}
        </div>
      </div>

      <div className="crpv-ws-jobmap-bleed">
        <div className="crpv-ws-jobmap-track">
          <button
            type="button"
            className="crpv-ws-jobmap-arrow"
            onClick={handleScrollLeft}
            aria-label="Scroll left"
            tabIndex={canScrollLeft ? 0 : -1}
            style={{ visibility: canScrollLeft ? "visible" : "hidden" }}
          >
            ←
          </button>

          <div className="crpv-ws-jobmap-scroll" ref={scrollRef}>
            <div className="crpv-ws-jobmap-rail" ref={railRef}>
              {jSteps.map((step, idx) => (
                <Fragment key={step.id}>
                  {step.id === suggestedId && !step._synthetic ? (
                    <SuggestedTile
                      step={step}
                      odi={odiLabel(idx)}
                      num={step.step_number ?? idx + 1}
                      isActive={activeStepId === step.id}
                      isInactive={!!activeStepId && activeStepId !== step.id}
                      isRouteLinked={routeLinkedStepIds.has(step.id)}
                      activeRoute={activeRoute}
                      onSelect={() => onSelectStep(step.id)}
                      routes={routes}
                      routesReady={routesReady}
                    />
                  ) : (
                    <RegularTile
                      step={step}
                      odi={odiLabel(idx)}
                      num={step.step_number ?? idx + 1}
                      isActive={activeStepId === step.id}
                      isInactive={!!activeStepId && activeStepId !== step.id}
                      isRouteLinked={routeLinkedStepIds.has(step.id)}
                      activeRoute={activeRoute}
                      onSelect={() => onSelectStep(step.id)}
                    />
                  )}
                  {idx < jSteps.length - 1 && (
                    <div className="crpv-ws-jobmap-connector" aria-hidden="true">→</div>
                  )}
                </Fragment>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="crpv-ws-jobmap-arrow"
            onClick={handleScrollRight}
            aria-label="Scroll right"
            tabIndex={canScrollRight ? 0 : -1}
            style={{ visibility: canScrollRight ? "visible" : "hidden" }}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

function inferRelevantCategory(step: JobStepRow): "fix" | "improve" | "create" | null {
  if (step.has_gap) return "fix";
  const conf = step.evidence_confidence ?? 100;
  if (step.evidence_status === "unclear" || conf < 50) return "fix";
  if (step.evidence_status === "implied" || conf < 70) return "improve";
  return null;
}

const CATEGORY_LABEL: Record<string, string> = { fix: "Under Pressure", improve: "Under Validation", create: "Directional" };
const CATEGORY_CONTEXT: Record<string, string> = {
  fix:     "This step has gaps — routes in this group address unresolved friction.",
  improve: "Evidence is thin here — routes in this group target areas under continued pressure.",
  create:  "This step looks solid — routes in this group explore directions the evidence suggests but no path yet covers.",
};

function JobMapRoutesSection({
  routes,
  activeStep,
}: {
  routes: RouteRow[];
  activeStep: JobStepRow | null;
}) {
  if (routes.length === 0) return null;
  const relevantCategory = activeStep ? inferRelevantCategory(activeStep) : null;
  const isFiltering = activeStep !== null && relevantCategory !== null;

  return (
    <div className="crpv-ws-jobmap-routes">
      <div className="crpv-ws-jobmap-routes-hd">
        <span className="cap">Recommended routes</span>
        {isFiltering && relevantCategory && (
          <span className="crpv-ws-jobmap-routes-ctx">{CATEGORY_CONTEXT[relevantCategory]}</span>
        )}
      </div>
      <div className="crpv-ws-jobmap-routes-list">
        {routes.map((route) => {
          const isMatch = !isFiltering || route.category === relevantCategory;
          return (
            <div
              key={route.id}
              className={`crpv-ws-jobmap-route-row${isMatch && isFiltering ? " crpv-ws-jobmap-route-match" : ""}${!isMatch ? " crpv-ws-jobmap-route-muted" : ""}`}
            >
              <span className={`crpv-ws-jobmap-route-cat crpv-ws-jobmap-route-cat-${route.category}`}>
                {CATEGORY_LABEL[route.category] ?? route.category}
              </span>
              <span className="crpv-ws-jobmap-route-title">{route.title || "Untitled route"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JobStepInspectPanel({
  open,
  step,
  onClose,
}: {
  open: boolean;
  step: JobStepRow | null;
  onClose: () => void;
}) {
  const { data: provenance, isLoading, error } = useFoundationProvenance({
    companyId: step?.company_id,
    objectType: "job_step",
    objectId: step?.id,
    enabled: open && Boolean(step?.id),
  });

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) onClose();
    };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 40,
          background: "rgba(35,60,75,0.26)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.25s",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          width: 520,
          maxWidth: "100vw",
          height: "100vh",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
          background: "#FAF7F6",
          borderLeft: "1px solid #DDE6D1",
        }}
      >
        {step ? (
          <>
            <div style={{ position: "relative", padding: "20px 52px 16px 20px", borderBottom: "1px solid #DDE6D1" }}>
              <p style={{ margin: "0 0 6px", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "#6E847F" }}>
                {`${String(step.journey_key || "").toUpperCase()} · CHECKPOINT ${step.step_number ?? "—"}`}
              </p>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.3, color: "#233C4B" }}>
                {displayStepLabel(step)}
              </h2>
              {step.description ? (
                <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.6, color: "#46606D" }}>
                  {step.description}
                </p>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  position: "absolute",
                  top: 16,
                  right: 16,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid #DDE6D1",
                  borderRadius: 6,
                  background: "#FFFFFF",
                  color: "#46606D",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", display: "grid", gap: 20 }}>
              {/* Status — posture badge + plain-language explanation */}
              <section>
                <p style={{ margin: "0 0 10px", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#6E847F" }}>
                  Status
                </p>
                {(() => {
                  const p = stepPosture(step);
                  const explanations: Record<string, string> = {
                    "Stable":            "Evidence supports this checkpoint and no gaps are flagged.",
                    "Under pressure":    "A gap has been flagged here. This checkpoint may be blocking progress.",
                    "Weak signal":       "Evidence for this checkpoint is inferred, not directly confirmed.",
                    "Validation needed": "Evidence is thin and a gap exists — this area needs attention.",
                    // Operator-signed declared-direction sentence, reused verbatim.
                    "Declared":          "Declared direction, derived from your internal documents. Not yet validated by market or customer evidence.",
                    "Emerging":          "No evidence has been classified for this checkpoint yet.",
                  };
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "inline-flex", alignSelf: "flex-start", padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500, letterSpacing: "0.04em", color: p.color, background: p.bg }}>
                        {p.label}
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: "#46606D", lineHeight: 1.6 }}>
                        {explanations[p.label] ?? "Status could not be determined."}
                      </p>
                    </div>
                  );
                })()}
              </section>

              {/* What remains unresolved — gap note callout */}
              {step.has_gap && step.gap_note && (
                <section>
                  <p style={{ margin: "0 0 10px", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#6E847F" }}>
                    What remains unresolved
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: "#7c5400", lineHeight: 1.6, background: "#fef9ec", border: "1px solid #f5d96b", borderRadius: 6, padding: "8px 10px" }}>
                    {step.gap_note}
                  </p>
                </section>
              )}

              {/* What appears true — provenance claims */}
              <section>
                <p style={{ margin: "0 0 10px", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#6E847F" }}>
                  What appears true
                </p>
                {isLoading ? (
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#46606D" }}>Loading claim support…</p>
                ) : error ? (
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#a12318" }}>
                    {error instanceof Error ? error.message : "Failed to load claim support."}
                  </p>
                ) : (
                  <FoundationClaimSupport claims={provenance?.claims ?? []} mode="job_step" />
                )}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

export default function JobMapOrgPanel({
  steps,
  loading,
  activeStepId,
  onSelectStep,
  routes,
  routesUnassessedNote,
  activeStep,
  activeRoute,
  routesReady,
  headerControls,
  hasHierarchy,
  needs,
  signalBasis,
  marketDef,
  marketSwitcher,
}: {
  steps: JobStepRow[];
  loading: boolean;
  activeStepId: string | null;
  onSelectStep: (id: string) => void;
  routes?: RouteRow[];
  // Lens reads gate: non-null when the focused lens exists but has ZERO
  // route_lens_refs — the honest "not assessed yet" state. Rendered as a visible
  // note (never a silent blank, never the company pool).
  routesUnassessedNote?: string | null;
  activeStep?: JobStepRow | null;
  activeRoute?: RouteRow | null;
  routesReady?: boolean;
  headerControls?: ReactNode;
  hasHierarchy?: boolean;
  needs?: OdiNeedRow[];
  signalBasis?: SignalBasis;
  // MH-2/5a: the VIEWED set's market_def (scoped by journey_key upstream). The
  // header names its job_executor clause verbatim when honestly named; provenance
  // drives the tier — 'manual' = operator-validated (plain), else = labeled
  // hypothesis; null/boilerplate → emptiness.
  marketDef?: { journey_key?: string | null; job_executor?: string | null; jtbd?: string | null; provenance_type?: string | null } | null;
  // MH-4a: when >1 candidate set, the headline becomes a market switcher (VIEW only).
  marketSwitcher?: {
    options: Array<{ key: string; title: string; marketDef: SwitcherMarketDef }>;
    showingAll?: boolean;
    onSelect: (key: string) => void;
    onShowAll?: () => void;
  };
}) {
  const suggestedId = useMemo(() => deriveSuggestedId(steps), [steps]);
  const [activeHierarchyIdx, setActiveHierarchyIdx] = useState<number>(0);
  const [activeSetKey, setActiveSetKey] = useState<string>("");
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  async function handleMarkNeedReviewed(needId: string) {
    await supabase
      .from("odi_needs")
      .update({
        dependency_state: "fresh",
        stale_reason: null,
        stale_since_event_id: null,
        last_reviewed_at: new Date().toISOString(),
      })
      .eq("id", needId);
    setReviewedIds((prev) => new Set([...prev, needId]));
  }

  const inspectStep = useMemo(
    () => activeStep ?? steps.find((step) => step.id === activeStepId) ?? null,
    [activeStep, activeStepId, steps],
  );

  if (loading) return <div className="crpv-ws-placeholder cap">Loading…</div>;
  if (steps.length === 0) {
    return (
      <div className="crpv-ws-placeholder" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 16, padding: "32px 40px" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#233c4b", lineHeight: 1.4 }}>
          No job map yet
        </div>
        <div style={{ fontSize: 13.5, color: "#5a7568", lineHeight: 1.6, maxWidth: 440 }}>
          A job map shows where customers gain momentum — and where they get stuck. Once built, it surfaces the steps where this organization can make the biggest strategic difference.
        </div>
        <div style={{ fontSize: 13, color: "#8aab97", lineHeight: 1.5, maxWidth: 420 }}>
          Build from the strategy, needs, and research already in the system. It takes about a minute.
        </div>
        {headerControls && (
          <div style={{ marginTop: 4 }}>
            {headerControls}
          </div>
        )}
      </div>
    );
  }

  const journeyOrder: string[] = [];
  const grouped = new Map<string, JobStepRow[]>();
  for (const s of steps) {
    if (!grouped.has(s.journey_key)) {
      journeyOrder.push(s.journey_key);
      grouped.set(s.journey_key, []);
    }
    grouped.get(s.journey_key)!.push(s);
  }

  // Gate 2b: DISPLAY TAXONOMY ONLY — this name test decides which section of the
  // panel a journey renders in, never protection. All write-protection keys off
  // provenance_type in the edge functions (_shared/journeyProtection.ts).
  function isInternalSetKey(key: string): boolean {
    const k = key.toLowerCase().trim();
    return k === "internal" || k === "operations" || k.startsWith("internal-") || k.startsWith("internal_");
  }

  const primaryKeys  = journeyOrder.filter((k) => !isInternalSetKey(k));
  const internalKeys = journeyOrder.filter((k) =>  isInternalSetKey(k));

  // ── Hierarchy layout — horizontal tab bar ────────────────────────────────
  if (hasHierarchy) {
    // When multiple primary journeys exist, show one at a time via journey selector.
    // Fall back to the first primary key if the stored selection is no longer valid.
    const activeJK = primaryKeys.includes(activeSetKey) ? activeSetKey : (primaryKeys[0] ?? "");
    const allPrimarySteps: JobStepRowExt[] = normalizeSetSteps(
      (grouped.get(activeJK) ?? []) as JobStepRowExt[],
    );
    const allNeeds = needs ?? [];

    // Per-step opportunity distribution — underserved/served/overserved counts indexed by step position
    const stepRollups = allPrimarySteps.map((step, idx) => {
      const linked = allNeeds.filter(
        (n) => n.journey_key === step.journey_key && n.step_number === (step.step_number ?? idx + 1),
      );
      // Verdict counts only over survey-validated needs (0 today) — so the verdict-derived
      // step-tab tint stays off until a survey backs it.
      const surveyLinked = linked.filter(isSurveyValidated);
      const underserved = surveyLinked.filter((n) => n.service_state === "underserved").length;
      const overserved  = surveyLinked.filter((n) => n.service_state === "overserved").length;
      const served      = surveyLinked.filter((n) => n.service_state === "served").length;
      return { underserved, overserved, served, total: linked.length };
    });

    // Clamp active index whenever step count changes
    const safeIdx = Math.min(activeHierarchyIdx, Math.max(0, allPrimarySteps.length - 1));
    const activeTabStep = allPrimarySteps[safeIdx] ?? null;

    function renderStepDetail(step: JobStepRowExt, idx: number) {
      if (!step) return null;
      const odi = odiLabel(idx);
      const posture = step._synthetic ? { label: "Emerging", color: "#6d28d9", bg: "#f5f3ff" } : stepPosture(step);
      const stepLabel = displayStepLabel(step);
      const linkedOpps = allNeeds.filter(
        (n) => n.journey_key === step.journey_key && n.step_number === (step.step_number ?? idx + 1),
      );

      return (
        <div style={{ maxWidth: 720 }}>
          {/* Header: ODI label + step name */}
          <p style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: D.inkFaint, margin: "0 0 10px" }}>
            {String(idx + 1).padStart(2, "0")} · {odi}
          </p>
          <h2 style={{ fontFamily: D.sans, fontSize: 24, fontWeight: 800, color: D.ink, margin: "0 0 12px", lineHeight: 1.25, letterSpacing: "-0.02em" }}>
            {stepLabel}
          </h2>

          {/* Description */}
          {!step._synthetic && step.description && (
            <p style={{ fontFamily: D.sans, fontSize: 14, color: D.inkSoft, margin: "0 0 24px", lineHeight: 1.65, maxWidth: 600 }}>
              {step.description}
            </p>
          )}

          {/* Posture badge + gap note */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
            <span style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: posture.color, background: posture.bg, padding: "4px 10px", borderRadius: 3 }}>
              {posture.label}
            </span>
            {!step._synthetic && step.has_gap && step.gap_note && (
              <span style={{ fontFamily: D.sans, fontSize: 12, color: "#7c5400", background: "#fef9ec", border: "1px solid #f5d96b", borderRadius: 4, padding: "4px 12px", lineHeight: 1.55, maxWidth: 480 }}>
                {step.gap_note}
              </span>
            )}
          </div>

          {/* Linked opportunities */}
          {linkedOpps.length > 0 && (
            <div>
              {(() => {
                // Verdict counts only over survey-validated opps (empty until a survey
                // exists); otherwise a best-guess value distribution — no verdict.
                const surveyOpps = linkedOpps.filter(isSurveyValidated);
                const parts: string[] = [];
                let rollupColor = D.inkFaint;
                if (surveyOpps.length > 0) {
                  const u = surveyOpps.filter((n) => n.service_state === "underserved").length;
                  const o = surveyOpps.filter((n) => n.service_state === "overserved").length;
                  const s = surveyOpps.filter((n) => n.service_state === "served").length;
                  if (u > 0) parts.push(`${u} underserved`);
                  if (s > 0) parts.push(`${s} served`);
                  if (o > 0) parts.push(`${o} overserved`);
                  rollupColor = u > 0 ? D.signal : o > 0 ? D.inkFaint : D.inkSoft;
                } else {
                  const high = linkedOpps.filter((n) => needBestGuessBand(n) === "High").length;
                  const med = linkedOpps.filter((n) => needBestGuessBand(n) === "Medium").length;
                  const low = linkedOpps.filter((n) => needBestGuessBand(n) === "Low").length;
                  if (high > 0) parts.push(`${high} high`);
                  if (med > 0) parts.push(`${med} medium`);
                  if (low > 0) parts.push(`${low} low`);
                }
                return (
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "0 0 8px" }}>
                    <p style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: D.inkFaint, margin: 0 }}>
                      {surveyOpps.length > 0 ? "Mapped opportunities" : "Mapped opportunities · potential value"}
                    </p>
                    {parts.length > 0 && (
                      <p style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: rollupColor, margin: 0 }}>
                        {parts.join(" · ")}
                      </p>
                    )}
                  </div>
                );
              })()}
              <div style={{ display: "flex", flexDirection: "column" }}>
                {linkedOpps.map((opp, i) => {
                  // Verdict color only when survey-backed; otherwise neutral (no visual verdict).
                  const stateColor = isSurveyValidated(opp)
                    ? (opp.service_state === "underserved" ? D.signal
                      : opp.service_state === "overserved" ? D.inkFaint
                      : D.inkSoft)
                    : D.inkSoft;
                  const needsPendingReview = NEEDS_REVIEW_STATES.has(opp.dependency_state ?? "") && !reviewedIds.has(opp.id);
                  return (
                    <div key={opp.id} style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", alignItems: "start", gap: "0 12px", borderBottom: `1px solid ${D.hairlineFaint}`, padding: "10px 0" }}>
                      <span style={{ fontFamily: D.mono, fontSize: 24, fontWeight: 700, color: "rgba(17,17,17,0.06)", lineHeight: 1, textAlign: "right" }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <p style={{ fontFamily: D.sans, fontSize: 13, color: D.ink, margin: "2px 0 0", lineHeight: 1.5, ...(needsPendingReview ? { textDecoration: "underline", textDecorationColor: "#e5c9b0", textUnderlineOffset: 2 } : {}) }}>
                          {opp.desired_outcome}
                        </p>
                        {needsPendingReview && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                            <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "#b06a3c", borderBottom: "1px dotted #b06a3c", paddingBottom: 1 }}>
                              review pending
                            </span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); void handleMarkNeedReviewed(opp.id); }}
                              style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "#111", background: "none", border: "1px solid rgba(17,17,17,0.2)", borderRadius: 2, padding: "1px 6px", cursor: "pointer" }}
                            >
                              Mark reviewed
                            </button>
                          </div>
                        )}
                      </div>
                      <span style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: stateColor, paddingTop: 4, whiteSpace: "nowrap" }}>
                        {serviceVerdictWord(opp) ?? needBestGuessBandLabel(opp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* What must be true (b-ii) — every string routes through the b-i canned guard */}
          {!step._synthetic && (
            <InternalConditions entries={Array.isArray(step.conditions_json) ? step.conditions_json : []} />
          )}

          {/* Evidence basis — pure internal metadata (run-tags, input-keys, bare
              keys) is hidden at the render boundary; honest prose renders as-is. */}
          {!step._synthetic && step.evidence_basis && !isInternalMetadataString(step.evidence_basis) && (
            <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${D.hairlineFaint}` }}>
              <p style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: D.inkFaint, margin: "0 0 6px" }}>
                Evidence basis
              </p>
              <p style={{ fontFamily: D.sans, fontSize: 12, color: D.inkSoft, margin: 0, lineHeight: 1.55 }}>
                {step.evidence_basis}
              </p>
            </div>
          )}
        </div>
      );
    }

    // MH-2: the header NAMES the viewed set's market — its market_def job_executor
    // clause, VERBATIM — and only when honestly named: a market_def for the viewed
    // set's EXACT journey_key, a non-boilerplate jtbd, and a non-empty executor.
    // No cross-set borrow; otherwise the signed emptiness invitation.
    const normKey = (v: string | null | undefined) => String(v ?? "").trim().toLowerCase();
    const viewedMarketDef =
      marketDef && normKey(marketDef.journey_key) === normKey(activeJK) ? marketDef : null;
    const marketName =
      viewedMarketDef && !isBoilerplateJtbd(viewedMarketDef.jtbd) && String(viewedMarketDef.job_executor ?? "").trim()
        ? String(viewedMarketDef.job_executor).trim()
        : null;
    // MH-5a tier: operator-authored (manual) market_def renders plain (validated);
    // any other provenance (generated/system) renders as a labeled hypothesis.
    const marketIsValidated = String(viewedMarketDef?.provenance_type ?? "") === "manual";

    return (
      <div style={{ margin: -36, display: "flex", flexDirection: "column", background: D.canvas }}>
        {/* Page header (above the tab bar) */}
        <div style={{ padding: "40px 48px 0", background: "#ffffff", borderBottom: `1px solid ${D.hairline}` }}>
          {/* Eyebrow */}
          <p style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(17,17,17,0.4)", margin: "0 0 16px", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: D.signal, display: "inline-block", flexShrink: 0 }} />
            {"The market this map is for"}
          </p>
          {marketSwitcher && marketSwitcher.options.length > 1 ? (
            <MarketSwitcher
              options={marketSwitcher.options}
              activeKey={activeJK}
              activeName={marketName}
              activeIsValidated={marketIsValidated}
              showingAll={marketSwitcher.showingAll}
              onSelect={marketSwitcher.onSelect}
              onShowAll={marketSwitcher.onShowAll}
            />
          ) : marketName ? (
            <>
              <h1 style={{ fontFamily: D.sans, fontSize: 28, fontWeight: 700, color: D.ink, margin: marketIsValidated ? "0 0 20px" : "0 0 8px", lineHeight: 1.18, letterSpacing: "-0.02em", maxWidth: 760 }}>
                {marketName}
              </h1>
              {!marketIsValidated && (
                <span style={{ display: "inline-block", fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "#b45309", background: "#fef9ec", border: "1px solid #f5d96b", borderRadius: 3, padding: "3px 9px", margin: "0 0 20px" }}>
                  Hypothesis — not yet validated
                </span>
              )}
            </>
          ) : (
            <p style={{ fontFamily: D.sans, fontSize: 18, fontWeight: 500, color: D.inkSoft, margin: "0 0 20px", lineHeight: 1.45, maxWidth: 640 }}>
              This map's market isn't named yet — who is it for, and what are they getting done?
            </p>
          )}
          {/* Lens reads gate: focused lens with zero route_lens_refs — honest state,
              rendered visibly instead of silently suggesting nothing. */}
          {routesUnassessedNote && (
            <p style={{ fontFamily: D.mono, fontSize: 11, color: "#8a6d2f", background: "#fffaf0", border: "1px solid #f0dfae", borderRadius: 4, padding: "7px 11px", margin: "0 0 16px", maxWidth: 640 }}>
              {routesUnassessedNote}
            </p>
          )}
          {/* Vocabulary gate: the subtitle line is not rendered (operator ruling —
              the step tabs show the count; "journey" never renders client-facing). */}
          {signalBasis && <div style={{ marginBottom: 16 }}><SignalBasisChip {...signalBasis} /></div>}

          {/* Journey selector — only shown when more than one primary journey exists */}
          {primaryKeys.length > 1 && (
            <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
              {primaryKeys.map((jk) => {
                const jkFirstStep = (grouped.get(jk) ?? [])[0];
                const jkTitle = displayMarketTitle(jkFirstStep?.journey_title, jk);
                const jkLabel = jk === "partner" || jk === "b2b" || jk === "b2b_cafe"
                  ? "Partner"
                  : jk === "customer" || jk === "primary"
                  ? "Customer"
                  : jkTitle || (jk.charAt(0).toUpperCase() + jk.slice(1));
                const isActive = jk === activeJK;
                return (
                  <button
                    key={jk}
                    type="button"
                    onClick={() => {
                      setActiveSetKey(jk);
                      setActiveHierarchyIdx(0);
                    }}
                    style={{
                      fontFamily: D.mono,
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: isActive ? D.ink : D.inkFaint,
                      background: isActive ? "rgba(17,17,17,0.06)" : "transparent",
                      border: "none",
                      borderRadius: 3,
                      padding: "5px 12px",
                      cursor: "pointer",
                      fontWeight: isActive ? 600 : 400,
                      transition: "background 0.1s, color 0.1s",
                    }}
                  >
                    {jkLabel}
                  </button>
                );
              })}
            </div>
          )}

          {headerControls && (
            <div style={{ marginBottom: 16 }}>{headerControls}</div>
          )}

          {/* Horizontal step tab bar */}
          <div className="crpv-jobmap-tabbar" style={{ marginLeft: -48, marginRight: -48, paddingLeft: 40 }}>
            {allPrimarySteps.map((step, idx) => {
              const odi = odiLabel(idx);
              const posture = step._synthetic ? null : stepPosture(step);
              const hasGap = !step._synthetic && step.has_gap;
              return (
                <button
                  key={step.id}
                  type="button"
                  className={`crpv-jobmap-tab${safeIdx === idx ? " active" : ""}`}
                  style={
                    stepRollups[idx].underserved > 0
                      ? { background: "rgba(255,91,41,0.07)" }
                      : posture?.label === "Weak signal" && safeIdx !== idx
                      ? { background: "rgba(255,91,41,0.06)" }
                      : undefined
                  }
                  onClick={() => setActiveHierarchyIdx(idx)}
                >
                  <span className="crpv-jobmap-tab-num">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="crpv-jobmap-tab-label">{odi}</span>
                  {posture && (
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: hasGap ? "#c2410c" : posture.color, display: "block", marginTop: 3, opacity: 0.7 }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div className="crpv-jobmap-detail" style={{ padding: "40px 48px 80px" }}>
          {activeTabStep ? renderStepDetail(activeTabStep, safeIdx) : null}
        </div>

        {/* Internal operations (if any) — shown below the primary detail as a collapsible section */}
        {internalKeys.length > 0 && (
          <div style={{ padding: "0 48px 40px", borderTop: `1px solid ${D.hairline}` }}>
            <p style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: D.inkFaint, margin: "20px 0 16px" }}>
              Internal Operations
            </p>
            {internalKeys.flatMap((jk) => normalizeSetSteps(grouped.get(jk)! as JobStepRowExt[])).map((step, idx) => {
              const odi = odiLabel(idx);
              const posture = step._synthetic ? { label: "Emerging", color: "#6d28d9", bg: "#f5f3ff" } : stepPosture(step);
              const stepLabel = displayStepLabel(step);
              return (
                <div key={step.id} style={{ display: "grid", gridTemplateColumns: "52px 1fr auto", alignItems: "start", gap: "0 12px", borderBottom: `1px solid ${D.hairlineFaint}`, padding: "12px 0" }}>
                  <span style={{ fontFamily: D.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: D.inkFaint, paddingTop: 3 }}>
                    {odi}
                  </span>
                  <p style={{ fontFamily: D.sans, fontSize: 13, color: D.ink, margin: "0", lineHeight: 1.4 }}>{stepLabel}</p>
                  <span style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: posture.color, background: posture.bg, padding: "2px 6px", borderRadius: 3, whiteSpace: "nowrap" }}>
                    {posture.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Legacy layout ────────────────────────────────────────────────────────
  function renderJourneySection(jk: string, isFirst: boolean) {
    const jSteps = grouped.get(jk)!;
    const first = jSteps[0];
    const title = displayMarketTitle(first?.journey_title, first?.journey_key ?? "");
    const subtitle = first?.journey_subtitle ?? null;

    const gapCount = jSteps.filter((s) => s.has_gap).length;
    const evidencedCount = jSteps.filter((s) => s.evidence_status === "evidenced").length;
    const suggestedStep = jSteps.find((s) => s.id === suggestedId);

    const summaryParts: string[] = [];
    if (gapCount > 0) summaryParts.push(`${gapCount} gap${gapCount !== 1 ? "s" : ""} across the system`);
    if (evidencedCount > 0) summaryParts.push(`${evidencedCount} evidenced checkpoint${evidencedCount !== 1 ? "s" : ""}`);
    if (suggestedStep) summaryParts.push(`suggested focus: ${displayStepLabel(suggestedStep)}`);

    return (
      <JourneySection
        key={jk}
        jk={jk}
        jSteps={jSteps}
        title={title}
        subtitle={subtitle}
        summaryParts={summaryParts}
        suggestedId={suggestedId}
        activeStepId={activeStepId}
        onSelectStep={onSelectStep}
        routes={routes ?? []}
        routesReady={routesReady}
        activeRoute={activeRoute}
        headerControls={isFirst ? headerControls : undefined}
      />
    );
  }

  return (
    <>
      <div className="crpv-ws-jobmap-outer">
        {primaryKeys.map((jk, i) => renderJourneySection(jk, i === 0))}

        {internalKeys.length > 0 && (
          <>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              margin: "32px 0 8px",
              padding: "0 4px",
            }}>
              <div style={{ flex: 1, height: 1, background: "#e5e9f0" }} />
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#8a9bb0",
                whiteSpace: "nowrap",
              }}>
                Internal — how the organization supports this job
              </span>
              <div style={{ flex: 1, height: 1, background: "#e5e9f0" }} />
            </div>
            {internalKeys.map((jk) => renderJourneySection(jk, false))}
          </>
        )}

        {routesReady && routes && routes.length > 0 && (
          <JobMapRoutesSection routes={routes} activeStep={activeStep ?? null} />
        )}
      </div>
      <JobStepInspectPanel
        open={Boolean(inspectStep)}
        step={inspectStep}
        onClose={() => {
          if (inspectStep?.id) onSelectStep(inspectStep.id);
        }}
      />
    </>
  );
}
