import { useMemo, useState, useRef, useEffect, Fragment, type ReactNode } from "react";
import type { JobStepRow } from "@/hooks/useJobSteps";
import type { RouteRow } from "@/views/Routes/useRoutes";
import { useFoundationProvenance } from "@/hooks/useFoundationProvenance";
import { FoundationClaimSupport } from "@/components/evidence/FoundationClaimSupport";
import {
  checkpointForStepNumber,
  containsNonOdiProcessLanguage,
  containsSolutionPrescriptiveLanguage,
} from "@/lib/jtbdProcess";

const ODI_LABELS = ["DEFINE", "LOCATE", "PREPARE", "EXECUTE", "MONITOR", "MODIFY", "CONCLUDE", "EVALUATE"] as const;

function odiLabel(index: number): string {
  return ODI_LABELS[index % ODI_LABELS.length];
}

function displayStepLabel(step: JobStepRow): string {
  const raw = String(step.step_label || "").trim();
  const fallback = checkpointForStepNumber(step.step_number || 1).canonicalLabel;
  if (!raw) return fallback;
  return containsSolutionPrescriptiveLanguage(raw) || containsNonOdiProcessLanguage(raw) ? fallback : raw;
}

function displayJourneyTitle(value: string | null | undefined, fallbackKey = "") {
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

// Gap → resolved condition: strips negation, wraps the core noun as a requirement.
function condFromGap(gap_note: string, step_label: string): string {
  const core = coreOf(gap_note);
  if (core.length < 4) return `${step_label} requirements are documented before the step begins`;
  return `${ucFirst(trunc(core, 62))} is in place before ${gerundPhrase(step_label)} begins`;
}

const LEADING_SUBJECT_RE = /^(?:the\s+)?(?:teams?|staff|organization|company|we|vendor|supplier|partners?)\s+/i;
const LEADING_VERB_RE = /^(?:review|confirm|check|negotiate|prepare|finalize|sign|define|identify|assess|evaluate|plan|approve|execute|monitor|coordinate|document|process|manage|complete|establish|ensure|verify)\s+/i;

// Description → what's involved must be confirmed: prefers explicit noun lists, else first clause.
function condFromDescription(desc: string, step_label: string): string | null {
  const gp = gerundPhrase(step_label);
  const stripped = desc.replace(LEADING_SUBJECT_RE, "").replace(LEADING_VERB_RE, "").trim();
  if (stripped.length < 6) return null;
  const listRe = /\b([a-z][a-z\s-]{1,20}(?:,\s*[a-z][a-z\s-]{1,20})+(?:,?\s*and\s+[a-z][a-z\s-]{1,20})?)/i;
  const m = stripped.match(listRe);
  if (m) {
    const list = m[1].replace(/\s+(?:with|for|from|to|in|by|at|of)\s.*$/i, "").trim();
    if (list.length >= 6) return `${ucFirst(wordTrunc(list, 62))} are confirmed before ${gp} begins`;
  }
  const clause = stripped.replace(/[^\w\s.,]/g, "").split(/[.,]/)[0].trim();
  if (clause.length >= 10) return `${ucFirst(wordTrunc(clause, 68))} requirements are established`;
  return null;
}

// Evidence basis → what must stay tracked: strips research preamble, wraps the subject.
function condFromBasis(basis: string): string | null {
  if (/^no\s+direct\s+evidence/i.test(basis.trim())) {
    const subject = basis
      .replace(/^no\s+direct\s+evidence\s+(?:on|for|about|of)\s+/i, "")
      .replace(/\.?\s*$/, "")
      .trim();
    if (subject.length > 4) return `Evidence for ${subject.toLowerCase()} is captured before decisions are made`;
    return null;
  }
  const cleaned = basis
    .replace(/^(?:interviews?|surveys?|customer research|research|data|field data)(?:\s+data)?\s+(?:shows?|indicates?|suggests?|reveals?|found)\s+(?:gap in|lack of|limited|that)?\s*/i, "")
    .replace(/^(?:based on|from|per|according to)\s+/i, "")
    .replace(/^(?:gap in|lack of|limited|that)\s+/i, "")
    .replace(/\s+(?:is missing|are missing|is absent|not found|is unclear)\.?\s*$/i, "")
    .trim();
  if (cleaned.length < 6) return null;
  return `${ucFirst(trunc(cleaned, 68))} is tracked and current`;
}

// Ownership: uses the core noun from gap_note when available, else the step label.
function condOwnership(step_label: string, gap_note?: string | null): string {
  const noun = gap_note ? coreOf(gap_note) : "";
  const subject = noun.length > 4 ? trunc(noun, 45).toLowerCase() : step_label.toLowerCase();
  return `Ownership of ${subject} is named and documented`;
}

// ODI phase fallback — only used when all descriptive fields are empty.
const ODI_PHASE_COND: Record<string, (l: string) => string> = {
  DEFINE:   (l) => `The team can state what a successful ${l} looks like before starting`,
  LOCATE:   (l) => `Where to find what's needed for ${l} is documented, not held by one person`,
  PREPARE:  (l) => `What must be confirmed before ${l} starts is written down, not assumed`,
  EXECUTE:  (l) => `The person doing ${l} has the authority to act without escalating`,
  MONITOR:  (l) => `A named signal — not a gut check — indicates when ${l} is off track`,
  MODIFY:   (l) => `Changes made during ${l} go through an identified reviewer before taking effect`,
  CONCLUDE: (l) => `The output of ${l} is handed off in a form the next step can use without explanation`,
  EVALUATE: (l) => `After ${l}, someone updates the approach based on what happened`,
};

function deriveInternalConditions(step: JobStepRow, odiLabel: string, limit: number): string[] {
  const conditions: string[] = [];
  const l = displayStepLabel(step) || "this step";

  if (step.has_gap && step.gap_note)
    conditions.push(condFromGap(step.gap_note, l));

  if (step.description && conditions.length < limit) {
    const c = condFromDescription(step.description, l);
    if (c) conditions.push(c);
  }

  if (step.evidence_basis && conditions.length < limit) {
    const c = condFromBasis(step.evidence_basis);
    if (c) conditions.push(c);
  }

  if (conditions.length < limit)
    conditions.push(condOwnership(l, step.gap_note));

  if (conditions.length < limit) {
    const pc = ODI_PHASE_COND[odiLabel];
    if (pc) conditions.push(pc(l.toLowerCase()));
  }

  return conditions.slice(0, limit);
}

const EVIDENCE_DOT: Record<string, { label: string; color: string }> = {
  evidenced: { label: "Evidenced", color: "#16a34a" },
  implied:   { label: "Implied",   color: "#E8A317" },
  unclear:   { label: "Unclear",   color: "#ef4444" },
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

function InternalConditions({ conditions }: { conditions: string[] }) {
  if (conditions.length === 0) return null;
  return (
    <div className="crpv-ws-jobmap-tile-cap">
      <p className="cap crpv-ws-jobmap-tile-cap-lbl">What must be true (internally)</p>
      {conditions.map((cond, i) => (
        <p key={i} className="crpv-ws-jobmap-tile-cap-item">
          <span className="crpv-ws-jobmap-tile-sw-dash" aria-hidden="true">•</span>
          <span>{cond}</span>
        </p>
      ))}
    </div>
  );
}

function EvidenceDrawer({ step }: { step: JobStepRow }) {
  const ev = step.evidence_status ? EVIDENCE_DOT[step.evidence_status] : null;
  const dotColor = ev?.color ?? "#d1d5db";
  const basisClean = step.evidence_basis
    ? step.evidence_basis.replace(/^dify_mojo_analysis:[0-9-]+$/, "Generated by Dify analysis")
    : null;
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
        <p style={{ fontSize: 10, color: "#b45309", lineHeight: 1.4, margin: 0 }}>Gap: {step.gap_note}</p>
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
  step, odi, num, isActive, onSelect, routes, routesReady,
}: {
  step: JobStepRow; odi: string; num: number; isActive: boolean; onSelect: () => void;
  routes: RouteRow[];
  routesReady?: boolean;
}) {
  const conditions = deriveInternalConditions(step, odi, 4);
  const [showEvidence, setShowEvidence] = useState(false);

  return (
    <div
      className={`crpv-ws-jobmap-tile suggested expanded${isActive ? " active" : ""}`}
      onClick={onSelect}
      style={{ cursor: "pointer" }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span className="crpv-ws-jobmap-tile-num">{String(num).padStart(2, "0")}</span>
        <EvidenceToggle open={showEvidence} onToggle={(e) => { e.stopPropagation(); setShowEvidence((v) => !v); }} step={step} />
      </div>
      <span className="crpv-ws-jobmap-tile-odi">{odi}</span>
      <p className="crpv-ws-jobmap-tile-name">{displayStepLabel(step)}</p>
      {step.description && (
        <p className="crpv-ws-jobmap-tile-desc">{step.description}</p>
      )}
      <div className="crpv-ws-jobmap-tile-lower">
        <InternalConditions conditions={conditions} />
        {routesReady && routes.length > 0 && (
          <SuggestedRoutes routes={routes} step={step} conditions={conditions} />
        )}
      </div>
      <p className="crpv-ws-jobmap-tile-focus cap">↑ Highest risk</p>
      {showEvidence && <EvidenceDrawer step={step} />}
    </div>
  );
}

function RegularTile({
  step,
  odi,
  num,
  isActive,
  onSelect,
}: {
  step: JobStepRow;
  odi: string;
  num: number;
  isActive: boolean;
  onSelect: () => void;
}) {
  const conditions = deriveInternalConditions(step, odi, 2);
  const [showEvidence, setShowEvidence] = useState(false);

  return (
    <div
      className={`crpv-ws-jobmap-tile${isActive ? " active" : ""}`}
      onClick={onSelect}
      style={{ cursor: "pointer" }}
    >
      <div className="crpv-ws-jobmap-tile-hd">
        <span className="crpv-ws-jobmap-tile-num">{String(num).padStart(2, "0")}</span>
        <span className="crpv-ws-jobmap-tile-odi">{odi}</span>
        <EvidenceToggle open={showEvidence} onToggle={(e) => { e.stopPropagation(); setShowEvidence((v) => !v); }} step={step} />
      </div>
      <p className="crpv-ws-jobmap-tile-name">{displayStepLabel(step)}</p>
      {step.description && (
        <p className="crpv-ws-jobmap-tile-desc">{step.description}</p>
      )}
      {conditions.length > 0 && (
        <div className="crpv-ws-jobmap-tile-lower">
          <InternalConditions conditions={conditions} />
        </div>
      )}
      {showEvidence && <EvidenceDrawer step={step} />}
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
  conditions: string[],
  limit = 3,
): MatchedRoute[] {
  if (routes.length === 0) return [];

  const stepCorpus = [
    displayStepLabel(step),
    step.gap_note ?? "",
    step.description ?? "",
    ...conditions,
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

const CATEGORY_SHORT: Record<string, string> = { fix: "fix", improve: "improve", create: "create" };

function SuggestedRoutes({
  routes,
  step,
  conditions,
}: {
  routes: RouteRow[];
  step: JobStepRow;
  conditions: string[];
}) {
  const matched = matchRoutesToStep(routes, step, conditions, 3);
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
  jSteps,
  title,
  subtitle,
  summaryParts,
  suggestedId,
  activeStepId,
  onSelectStep,
  routes,
  routesReady,
  headerControls,
}: {
  jk: string;
  jSteps: JobStepRow[];
  title: string;
  subtitle: string | null;
  summaryParts: string[];
  suggestedId: string | null;
  activeStepId: string | null;
  onSelectStep: (id: string) => void;
  routes: RouteRow[];
  routesReady?: boolean;
  headerControls?: ReactNode;
}) {
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
            {subtitle && <p className="crpv-ws-jobmap-sub">{subtitle}</p>}
            {summaryParts.length > 0 && (
              <p className="crpv-ws-jobmap-summary">{summaryParts.join(" · ")}</p>
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
                  {step.id === suggestedId ? (
                    <SuggestedTile
                      step={step}
                      odi={odiLabel(idx)}
                      num={step.step_number ?? idx + 1}
                      isActive={activeStepId === step.id}
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

const CATEGORY_LABEL: Record<string, string> = { fix: "Fix", improve: "Improve", create: "Create" };
const CATEGORY_CONTEXT: Record<string, string> = {
  fix: "This step has gaps — Fix routes address known breakdowns.",
  improve: "Evidence is thin here — Improve routes build on what's working.",
  create: "This step looks solid — Create routes expand into new ground.",
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
          const pts = typeof route.pts_value === "number" ? Math.round(route.pts_value) : null;
          return (
            <div
              key={route.id}
              className={`crpv-ws-jobmap-route-row${isMatch && isFiltering ? " crpv-ws-jobmap-route-match" : ""}${!isMatch ? " crpv-ws-jobmap-route-muted" : ""}`}
            >
              <span className={`crpv-ws-jobmap-route-cat crpv-ws-jobmap-route-cat-${route.category}`}>
                {CATEGORY_LABEL[route.category] ?? route.category}
              </span>
              <span className="crpv-ws-jobmap-route-title">{route.title || "Untitled route"}</span>
              {pts !== null && (
                <span className="crpv-ws-jobmap-route-pts cap">{pts > 0 ? `+${pts}` : pts} pts</span>
              )}
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
            <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", display: "grid", gap: 16 }}>
              <section>
                <p style={{ margin: "0 0 10px", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#6E847F" }}>
                  Why this exists
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
  activeStep,
  routesReady,
  headerControls,
}: {
  steps: JobStepRow[];
  loading: boolean;
  activeStepId: string | null;
  onSelectStep: (id: string) => void;
  routes?: RouteRow[];
  activeStep?: JobStepRow | null;
  routesReady?: boolean;
  headerControls?: ReactNode;
}) {
  const suggestedId = useMemo(() => deriveSuggestedId(steps), [steps]);
  const inspectStep = useMemo(
    () => activeStep ?? steps.find((step) => step.id === activeStepId) ?? null,
    [activeStep, activeStepId, steps],
  );

  if (loading) return <div className="crpv-ws-placeholder cap">Loading…</div>;
  if (steps.length === 0) {
    return (
      <div className="crpv-ws-placeholder">
        No checkpoint map yet. Build the job map in the admin view.
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

  function isInternalJourneyKey(key: string): boolean {
    const k = key.toLowerCase().trim();
    return k === "internal" || k === "operations" || k.startsWith("internal-") || k.startsWith("internal_");
  }

  const primaryKeys  = journeyOrder.filter((k) => !isInternalJourneyKey(k));
  const internalKeys = journeyOrder.filter((k) =>  isInternalJourneyKey(k));

  function renderJourneySection(jk: string, isFirst: boolean) {
    const jSteps = grouped.get(jk)!;
    const first = jSteps[0];
    const title = displayJourneyTitle(first?.journey_title, first?.journey_key ?? "");
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
