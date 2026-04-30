import { useMemo, useState, useRef, useEffect, Fragment } from "react";
import type { JobStepRow } from "@/hooks/useJobSteps";

const ODI_LABELS = ["DEFINE", "LOCATE", "PREPARE", "EXECUTE", "MONITOR", "MODIFY", "CONCLUDE", "EVALUATE"] as const;

function odiLabel(index: number): string {
  return ODI_LABELS[index % ODI_LABELS.length];
}

function suggestionScore(s: JobStepRow): number {
  let n = 0;
  if (s.has_gap) n += 3;
  if (s.evidence_status === "unclear") n += 2;
  else if (s.evidence_status === "implied") n += 1;
  const conf = s.evidence_confidence ?? 100;
  if (conf < 40) n += 2;
  else if (conf < 70) n += 1;
  return n;
}

function deriveSuggestedId(steps: JobStepRow[]): string | null {
  if (steps.length === 0) return null;
  const sorted = [...steps].sort((a, b) => suggestionScore(b) - suggestionScore(a));
  const top = sorted[0];
  return top && suggestionScore(top) > 0 ? top.id : null;
}

// Derives 1–2 supported bullets and 1–2 missing/weak bullets from existing checkpoint fields.
// "Missing or weak" intentionally avoids gap_note (already shown above in the tile).
function deriveSupportedGaps(step: JobStepRow): { supported: string[]; weak: string[] } {
  const supported: string[] = [];
  const weak: string[] = [];

  // --- Currently supported ---
  if (step.evidence_basis) {
    const text = step.evidence_basis.replace(/\n+/g, " ").trim();
    supported.push(text.length > 90 ? text.slice(0, 90) + "…" : text);
  }
  if (step.evidence_status === "evidenced" && supported.length < 2) {
    supported.push("Step is directly evidenced in customer research");
  } else if (step.evidence_status === "implied" && supported.length === 0) {
    supported.push("Some coverage at this step is implied by available research");
  }
  if (supported.length === 0) {
    supported.push("No direct evidence of current offering at this step");
  }

  // --- Missing or weak (derived from evidence quality, not gap_note) ---
  const conf = step.evidence_confidence ?? 100;
  if (step.evidence_status === "unclear") {
    weak.push("Evidence quality at this step is unclear");
  } else if (step.evidence_status === "implied") {
    weak.push("Support is inferred rather than directly evidenced");
  }
  if (conf < 50 && weak.length < 2) {
    weak.push("Low confidence in current evidence — direct customer validation needed");
  } else if (conf < 70 && weak.length < 2 && step.evidence_status !== "evidenced") {
    weak.push("Moderate confidence — more research would sharpen this signal");
  }
  if (!step.evidence_basis && weak.length < 2) {
    weak.push("No documented evidence basis for this checkpoint");
  }
  if (step.has_gap && weak.length < 2) {
    weak.push("Gap identified — customer need at this step is unmet");
  }
  if (weak.length === 0) {
    weak.push("No gaps flagged — monitor as customer context evolves");
  }

  return { supported: supported.slice(0, 2), weak: weak.slice(0, 2) };
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

function SuggestedTile({ step, odi, num }: { step: JobStepRow; odi: string; num: number }) {
  const { supported, weak } = deriveSupportedGaps(step);
  return (
    <div className="crpv-ws-jobmap-tile suggested expanded">
      <span className="crpv-ws-jobmap-tile-num">{String(num).padStart(2, "0")}</span>
      <span className="crpv-ws-jobmap-tile-odi">{odi}</span>
      <p className="crpv-ws-jobmap-tile-name">{step.step_label ?? "Untitled"}</p>
      {step.description && (
        <p className="crpv-ws-jobmap-tile-desc">{step.description}</p>
      )}
      <EvidenceStatus step={step} />
      {step.has_gap && step.gap_note && (
        <p className="crpv-ws-jobmap-tile-gap" style={{ marginTop: 8 }}>{step.gap_note}</p>
      )}
      <div className="crpv-ws-jobmap-tile-sw">
        <p className="cap crpv-ws-jobmap-tile-sw-lbl">Currently supported</p>
        {supported.map((item, i) => (
          <p key={i} className="crpv-ws-jobmap-tile-sw-item">
            <span className="crpv-ws-jobmap-tile-sw-dash" aria-hidden="true">–</span>
            <span>{item}</span>
          </p>
        ))}
        <p className="cap crpv-ws-jobmap-tile-sw-lbl crpv-ws-jobmap-tile-sw-lbl-gap">Missing or weak</p>
        {weak.map((item, i) => (
          <p key={i} className="crpv-ws-jobmap-tile-sw-item crpv-ws-jobmap-tile-sw-weak">
            <span className="crpv-ws-jobmap-tile-sw-dash" aria-hidden="true">–</span>
            <span>{item}</span>
          </p>
        ))}
      </div>
      {step.evidence_basis && (
        <p className="crpv-ws-jobmap-tile-basis">Evidence: {step.evidence_basis}</p>
      )}
      <p className="crpv-ws-jobmap-tile-focus cap">↑ Highest risk</p>
    </div>
  );
}

function RegularTile({
  step,
  odi,
  num,
  isExpanded,
  onToggleExpand,
}: {
  step: JobStepRow;
  odi: string;
  num: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const hasExtra = !!(step.description || step.evidence_basis || (step.has_gap && step.gap_note));

  return (
    <div className={`crpv-ws-jobmap-tile${isExpanded ? " expanded" : ""}`}>
      <div className="crpv-ws-jobmap-tile-hd">
        <span className="crpv-ws-jobmap-tile-num">{String(num).padStart(2, "0")}</span>
        <span className="crpv-ws-jobmap-tile-odi">{odi}</span>
      </div>
      <p className="crpv-ws-jobmap-tile-name">{step.step_label ?? "Untitled"}</p>
      <EvidenceStatus step={step} />
      {step.description && (
        <p className="crpv-ws-jobmap-tile-desc">{step.description}</p>
      )}
      {step.evidence_basis && (
        <p className="crpv-ws-jobmap-tile-basis">Evidence: {step.evidence_basis}</p>
      )}
      {isExpanded && step.has_gap && step.gap_note && (
        <p className="crpv-ws-jobmap-tile-gap">Gap: {step.gap_note}</p>
      )}
      {hasExtra && (
        <button
          type="button"
          className="crpv-ws-jobmap-tile-more"
          onClick={onToggleExpand}
          aria-expanded={isExpanded}
        >
          {isExpanded ? "less ↑" : "more →"}
        </button>
      )}
    </div>
  );
}

function JourneySection({
  jk,
  jSteps,
  title,
  subtitle,
  summaryParts,
  suggestedId,
  expandedId,
  toggleExpand,
}: {
  jk: string;
  jSteps: JobStepRow[];
  title: string;
  subtitle: string | null;
  summaryParts: string[];
  suggestedId: string | null;
  expandedId: string | null;
  toggleExpand: (id: string) => void;
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
        <p className="crpv-ws-jobmap-kicker cap">Checkpoint Map</p>
        {title && <h2 className="crpv-ws-jobmap-title">{title}</h2>}
        {subtitle && <p className="crpv-ws-jobmap-sub">{subtitle}</p>}
        {summaryParts.length > 0 && (
          <p className="crpv-ws-jobmap-summary">{summaryParts.join(" · ")}</p>
        )}
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
                    />
                  ) : (
                    <RegularTile
                      step={step}
                      odi={odiLabel(idx)}
                      num={step.step_number ?? idx + 1}
                      isExpanded={expandedId === step.id}
                      onToggleExpand={() => toggleExpand(step.id)}
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

export default function JobMapOrgPanel({
  steps,
  loading,
}: {
  steps: JobStepRow[];
  loading: boolean;
}) {
  const suggestedId = useMemo(() => deriveSuggestedId(steps), [steps]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

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

  return (
    <div className="crpv-ws-jobmap-outer">
      {journeyOrder.map((jk) => {
        const jSteps = grouped.get(jk)!;
        const first = jSteps[0];
        const title = first?.journey_title
          || (first ? first.journey_key.charAt(0).toUpperCase() + first.journey_key.slice(1) : "");
        const subtitle = first?.journey_subtitle ?? null;

        const gapCount = jSteps.filter((s) => s.has_gap).length;
        const evidencedCount = jSteps.filter((s) => s.evidence_status === "evidenced").length;
        const suggestedStep = jSteps.find((s) => s.id === suggestedId);

        const summaryParts: string[] = [];
        if (gapCount > 0) summaryParts.push(`${gapCount} gap${gapCount !== 1 ? "s" : ""} across the system`);
        if (evidencedCount > 0) summaryParts.push(`${evidencedCount} evidenced checkpoint${evidencedCount !== 1 ? "s" : ""}`);
        if (suggestedStep?.step_label) summaryParts.push(`suggested focus: ${suggestedStep.step_label}`);

        return (
          <JourneySection
            key={jk}
            jk={jk}
            jSteps={jSteps}
            title={title}
            subtitle={subtitle}
            summaryParts={summaryParts}
            suggestedId={suggestedId}
            expandedId={expandedId}
            toggleExpand={toggleExpand}
          />
        );
      })}
    </div>
  );
}
