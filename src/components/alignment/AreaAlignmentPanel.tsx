import type { LocalAlignmentArea, LocalAlignmentRun } from "@/hooks/useLocalAlignment";

type Props = {
  title: string;
  area: LocalAlignmentArea | null | undefined;
  run: LocalAlignmentRun | null | undefined;
  lineColor: string;
  panelColor: string;
  textColor: string;
  mutedColor: string;
};

function sectionLabel(text: string, mutedColor: string) {
  return (
    <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: mutedColor }}>
      {text}
    </p>
  );
}

function impactTone(impact: "low" | "medium" | "high") {
  if (impact === "high") return { fg: "#A53F2B", bg: "#FFEDE7", border: "#F5C2B5" };
  if (impact === "low") return { fg: "#2E6B52", bg: "#EEF7F2", border: "#CDE2D8" };
  return { fg: "#916404", bg: "#FFF7DD", border: "#F0DB94" };
}

function checkTone(status: "pass" | "partial" | "fail") {
  if (status === "pass") return { fg: "#2E6B52", bg: "#EEF7F2", border: "#CDE2D8" };
  if (status === "fail") return { fg: "#A53F2B", bg: "#FFEDE7", border: "#F5C2B5" };
  return { fg: "#916404", bg: "#FFF7DD", border: "#F0DB94" };
}

export function AreaAlignmentPanel({
  title,
  area,
  run,
  lineColor,
  panelColor,
  textColor,
  mutedColor,
}: Props) {
  if (!run || !area) {
    return (
      <section className="rounded-[20px] border px-5 py-4" style={{ borderColor: lineColor, background: panelColor }}>
        {sectionLabel(`${title} Alignment`, mutedColor)}
        <p className="mt-2 font-sans text-[13px] leading-[1.7]" style={{ color: textColor }}>
          No local alignment run yet for this area. Upload company files, then run local alignment to compare public vs internal evidence.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[20px] border px-5 py-4" style={{ borderColor: lineColor, background: panelColor }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {sectionLabel(`${title} Alignment`, mutedColor)}
          <p className="mt-1 font-sans text-[13px]" style={{ color: textColor }}>
            Side-by-side comparison of public baseline claims and uploaded internal evidence.
          </p>
        </div>
        <div className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ borderColor: lineColor, color: mutedColor }}>
          {new Date(run.created_at).toLocaleString()}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[14px] border px-3 py-3" style={{ borderColor: lineColor, background: "#FFFFFF" }}>
          {sectionLabel("Public Claims", mutedColor)}
          <div className="mt-2 space-y-2">
            {area.public_claims.length === 0 ? (
              <p className="font-sans text-[12px]" style={{ color: mutedColor }}>No public claims captured.</p>
            ) : (
              area.public_claims.slice(0, 5).map((claim, index) => (
                <div key={`${claim.source}-${index}`} className="rounded-[10px] border px-2.5 py-2" style={{ borderColor: lineColor }}>
                  <p className="font-sans text-[12px]" style={{ color: textColor }}>{claim.claim}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: mutedColor }}>
                    {claim.source} · {claim.confidence}% confidence
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[14px] border px-3 py-3" style={{ borderColor: lineColor, background: "#FFFFFF" }}>
          {sectionLabel("Internal Claims", mutedColor)}
          <div className="mt-2 space-y-2">
            {area.internal_claims.length === 0 ? (
              <p className="font-sans text-[12px]" style={{ color: mutedColor }}>No internal claims captured yet.</p>
            ) : (
              area.internal_claims.slice(0, 5).map((claim, index) => (
                <div key={`${claim.source}-${index}`} className="rounded-[10px] border px-2.5 py-2" style={{ borderColor: lineColor }}>
                  <p className="font-sans text-[12px]" style={{ color: textColor }}>{claim.claim}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: mutedColor }}>
                    {claim.source} · {claim.tier || "unknown"} · {claim.confidence}% confidence
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[14px] border px-3 py-3" style={{ borderColor: lineColor, background: "#FFFFFF" }}>
          {sectionLabel(`Overlaps (${area.overlaps.length})`, mutedColor)}
          <div className="mt-2 space-y-2">
            {area.overlaps.length === 0 ? (
              <p className="font-sans text-[12px]" style={{ color: mutedColor }}>No clear overlaps were detected.</p>
            ) : (
              area.overlaps.slice(0, 6).map((overlap, index) => (
                <div key={`${overlap.theme}-${index}`} className="rounded-[10px] border px-2.5 py-2" style={{ borderColor: lineColor }}>
                  <p className="font-sans text-[12px] font-semibold" style={{ color: textColor }}>{overlap.theme}</p>
                  <p className="mt-1 font-sans text-[12px]" style={{ color: textColor }}>
                    Public: {overlap.public_claim}
                  </p>
                  <p className="mt-1 font-sans text-[12px]" style={{ color: textColor }}>
                    Internal: {overlap.internal_claim}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[14px] border px-3 py-3" style={{ borderColor: lineColor, background: "#FFFFFF" }}>
          {sectionLabel(`Gaps (${area.gaps.length})`, mutedColor)}
          <div className="mt-2 space-y-2">
            {area.gaps.length === 0 ? (
              <p className="font-sans text-[12px]" style={{ color: mutedColor }}>No material gaps were flagged.</p>
            ) : (
              area.gaps.slice(0, 6).map((gap, index) => {
                const tone = impactTone(gap.impact);
                return (
                  <div key={`${gap.theme}-${index}`} className="rounded-[10px] border px-2.5 py-2" style={{ borderColor: tone.border, background: tone.bg }}>
                    <p className="font-sans text-[12px] font-semibold" style={{ color: tone.fg }}>
                      {gap.theme} · {gap.gap_type}
                    </p>
                    <p className="mt-1 font-sans text-[12px]" style={{ color: textColor }}>{gap.description}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[14px] border px-3 py-3" style={{ borderColor: lineColor, background: "#FFFFFF" }}>
          {sectionLabel("Why Gaps Likely Exist", mutedColor)}
          <div className="mt-2 space-y-2">
            {area.why_gaps_likely.length === 0 ? (
              <p className="font-sans text-[12px]" style={{ color: mutedColor }}>No causal hypotheses generated.</p>
            ) : (
              area.why_gaps_likely.slice(0, 5).map((entry, index) => (
                <p key={`${entry}-${index}`} className="font-sans text-[12px]" style={{ color: textColor }}>
                  {entry}
                </p>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[14px] border px-3 py-3" style={{ borderColor: lineColor, background: "#FFFFFF" }}>
          {sectionLabel("Recommended Actions", mutedColor)}
          <div className="mt-2 space-y-2">
            {area.actions.length === 0 ? (
              <p className="font-sans text-[12px]" style={{ color: mutedColor }}>No actions generated.</p>
            ) : (
              area.actions.slice(0, 5).map((action, index) => (
                <div key={`${action.action}-${index}`} className="rounded-[10px] border px-2.5 py-2" style={{ borderColor: lineColor }}>
                  <p className="font-sans text-[12px] font-semibold" style={{ color: textColor }}>
                    {action.action}
                  </p>
                  <p className="mt-1 font-sans text-[12px]" style={{ color: textColor }}>
                    Evidence needed: {action.evidence_needed}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[14px] border px-3 py-3" style={{ borderColor: lineColor, background: "#FFFFFF" }}>
        {sectionLabel("Likely Cross-Area Impact", mutedColor)}
        <div className="mt-2 flex flex-wrap gap-2">
          {area.applies_to_areas.length === 0 ? (
            <p className="font-sans text-[12px]" style={{ color: mutedColor }}>No downstream impact areas listed yet.</p>
          ) : (
            area.applies_to_areas.slice(0, 8).map((areaName, index) => (
              <span
                key={`${areaName}-${index}`}
                className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{ borderColor: lineColor, color: textColor, background: "#FFFFFF" }}
              >
                {areaName}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="mt-4 rounded-[14px] border px-3 py-3" style={{ borderColor: lineColor, background: "#FFFFFF" }}>
        {sectionLabel("Methodology Checks", mutedColor)}
        <div className="mt-2 flex flex-wrap gap-2">
          {area.approach_checks.length === 0 ? (
            <p className="font-sans text-[12px]" style={{ color: mutedColor }}>No checks available.</p>
          ) : (
            area.approach_checks.slice(0, 6).map((check, index) => {
              const tone = checkTone(check.status);
              return (
                <div key={`${check.check}-${index}`} className="rounded-full border px-3 py-1" style={{ borderColor: tone.border, background: tone.bg }}>
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: tone.fg }}>
                    {check.status}: {check.check}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
