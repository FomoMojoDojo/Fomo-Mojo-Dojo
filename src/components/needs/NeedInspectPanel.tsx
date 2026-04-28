import { useMemo } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import TierAlignmentGrid from "@/components/inspect/TierAlignmentGrid";
import { needSignalTiers } from "@/lib/strategicObject";
import { computeNeedUnlockConditions } from "@/lib/evidenceBands";

const c = {
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  paper: "#F7FBF8",
  coral: "#FF7D2D",
  amber: "#FAC846",
  teal: "#5F9B8C",
};

function serviceStateLabel(state: string | null | undefined): { label: string; explanation: string } {
  const s = String(state || "").toLowerCase();
  if (s === "underserved") return { label: "Currently under-served", explanation: "This need is important to customers but not being met well enough." };
  if (s === "overserved") return { label: "Currently over-served", explanation: "Resources here may exceed what customers actually need — potential to redeploy effort." };
  return { label: "Appropriately served", explanation: "Customer importance and satisfaction are reasonably balanced for this need." };
}

function journeyLabel(key: string) {
  if (key === "customer") return "Customer";
  if (key === "revenue") return "Revenue";
  if (key === "operations") return "Operations";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function sourceSafeLabel(sourcePath: string | null | undefined) {
  const s = String(sourcePath || "").trim();
  if (!s) return "Unknown source";
  const lower = s.toLowerCase();
  if (lower.startsWith("public") || lower.includes("baseline") || lower.includes("benchmark")) {
    return `Public signals: ${s}`;
  }
  return `Uploaded data: ${s}`;
}

function scoreInterpretation(importance: number, satisfaction: number): string {
  if (importance >= 7 && satisfaction < 5) return "High-priority gap — important but not well served.";
  if (importance >= 7 && satisfaction >= 7) return "Well served — monitor for shifts in importance.";
  if (importance < 4) return "Lower priority — less critical to customer job success.";
  if (satisfaction >= 7) return "Adequately served — keep an eye on importance trends.";
  return "Moderate priority — strengthen service quality or re-evaluate importance.";
}

export default function NeedInspectPanel({
  open,
  onClose,
  need,
  staleNote,
}: {
  open: boolean;
  onClose: () => void;
  need: OdiNeedRow | null;
  staleNote?: string | null;
}) {
  if (!need) {
    return (
      <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <SheetContent side="right" className="sm:max-w-[480px]" />
      </Sheet>
    );
  }

  const importance = need.importance ?? 5;
  const satisfaction = need.satisfaction ?? 5;
  const oppScore = Math.round(Number(need.opportunity_score ?? 0));
  const stateInfo = serviceStateLabel(need.service_state);
  const stepContext = need.step_number ? `Checkpoint ${need.step_number}` : "Checkpoint —";
  const stepDetail = need.step_label ? ` · ${need.step_label}` : "";

  const changeBullets: string[] = [];
  if (satisfaction < 5) changeBullets.push("Improving how well this need is served would lower its score and move it off the focus list.");
  if (importance > 7) changeBullets.push("This need ranks as high-importance — validate the signal with more customer interviews.");
  if (String(need.service_state || "").toLowerCase() === "overserved") {
    changeBullets.push("Over-serving this need may indicate misallocated effort — review with strategy.");
  }
  if (changeBullets.length === 0) changeBullets.push("Run updated customer research to sharpen this signal.");

  const tierCells = needSignalTiers(need.source_path);

  const unlockConditions = useMemo(() => computeNeedUnlockConditions(
    {
      sourcePath: need.source_path,
      importance,
      satisfaction,
      serviceState: need.service_state,
    },
    false,
  ), [need.source_path, importance, satisfaction, need.service_state]);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-[480px] overflow-y-auto flex flex-col gap-0 p-0">
        <div className="flex flex-col h-full">

          {/* Stale banner */}
          {staleNote && (
            <div
              className="px-6 py-2 flex items-center gap-2 border-b"
              style={{ background: `${c.amber}18`, borderColor: c.amber }}
            >
              <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: c.amber }}>
                {staleNote}
              </span>
            </div>
          )}

          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: c.line }}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                {journeyLabel(need.journey_key)}
              </span>
              <span style={{ color: c.line }}>·</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                {stepContext}
              </span>
            </div>
            <h2 className="font-sans text-[17px] font-semibold leading-[1.4]" style={{ color: c.charcoal }}>
              {need.desired_outcome}
            </h2>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              {sourceSafeLabel(need.source_path)}
            </p>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

            {/* Section 0: What this claims */}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] mb-3" style={{ color: c.muted }}>
                What this claims
              </p>
              <p className="font-sans text-[13px] leading-[1.55] mb-1" style={{ color: c.secondary }}>
                {need.desired_outcome}
              </p>
              <p className="font-sans text-[12px] leading-[1.5] mb-3" style={{ color: c.muted }}>
                Claims this need is {stateInfo.label.toLowerCase()}.
              </p>
              <TierAlignmentGrid cells={tierCells} />
            </div>

            <div className="border-t" style={{ borderColor: c.line }} />

            {/* Section A: What this need is */}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] mb-3" style={{ color: c.muted }}>
                Service state
              </p>
              <div className="rounded-lg border p-3" style={{ borderColor: c.line, background: c.paper }}>
                <p className="font-sans text-[13px] font-semibold" style={{ color: c.charcoal }}>
                  {stateInfo.label}
                </p>
                <p className="mt-1 font-sans text-[12px] leading-[1.5]" style={{ color: c.secondary }}>
                  {stateInfo.explanation}
                </p>
                {stepDetail && (
                  <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                    {stepContext}{stepDetail}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t" style={{ borderColor: c.line }} />

            {/* Section B: How the score was calculated */}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] mb-3" style={{ color: c.muted }}>
                How this was scored
              </p>
              <p className="font-sans text-[24px] font-bold leading-none mb-1" style={{ color: c.charcoal }}>
                {oppScore}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] mb-3" style={{ color: c.muted }}>
                Opportunity score
              </p>
              <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: c.line, background: c.paper }}>
                <p className="font-sans text-[12px] leading-[1.5]" style={{ color: c.secondary }}>
                  Score = (how important it is − how well it's satisfied) × how important it is
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] w-[80px]" style={{ color: c.muted }}>
                      Importance
                    </span>
                    <div className="flex-1 h-[6px] rounded-full" style={{ background: c.lineFaint }}>
                      <div className="h-full rounded-full" style={{ width: `${importance * 10}%`, background: c.coral }} />
                    </div>
                    <span className="font-mono text-[11px] w-4 text-right" style={{ color: c.charcoal }}>{importance}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[9px] uppercase tracking-[0.1em] w-[80px]" style={{ color: c.muted }}>
                      Satisfaction
                    </span>
                    <div className="flex-1 h-[6px] rounded-full" style={{ background: c.lineFaint }}>
                      <div className="h-full rounded-full" style={{ width: `${satisfaction * 10}%`, background: c.teal }} />
                    </div>
                    <span className="font-mono text-[11px] w-4 text-right" style={{ color: c.charcoal }}>{satisfaction}</span>
                  </div>
                </div>
                <p className="font-sans text-[12px] leading-[1.5]" style={{ color: c.secondary }}>
                  {scoreInterpretation(importance, satisfaction)}
                </p>
              </div>
            </div>

            <div className="border-t" style={{ borderColor: c.line }} />

            {/* Section C: What would change this */}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] mb-3" style={{ color: c.muted }}>
                What would change this
              </p>
              <ul className="space-y-2">
                {changeBullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 font-sans text-[13px] leading-[1.55]" style={{ color: c.secondary }}>
                    <span style={{ color: c.muted, flexShrink: 0 }}>·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="border-t" style={{ borderColor: c.line }} />

            {/* Section D: What would strengthen this */}
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] mb-3" style={{ color: c.muted }}>
                What would strengthen this
              </p>

              {/* Current evidence state */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span
                  className="rounded px-2 py-[2px] font-mono text-[9px] uppercase tracking-[0.08em] border"
                  style={{ color: c.amber, borderColor: c.amber, background: `${c.amber}18` }}
                >
                  {unlockConditions.currentBandLabel}
                </span>
                {unlockConditions.nextBandLabel && (
                  <>
                    <span className="font-mono text-[10px]" style={{ color: c.muted }}>→</span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                      {unlockConditions.nextBandLabel}
                    </span>
                  </>
                )}
              </div>
              <p className="font-sans text-[12px] leading-[1.5] mb-3" style={{ color: c.secondary }}>
                {unlockConditions.currentStateDescription}
              </p>

              {/* Missing items */}
              {unlockConditions.missingItems.length > 0 && (
                <div className="mb-3">
                  <p className="font-mono text-[9px] uppercase tracking-[0.1em] mb-1.5" style={{ color: c.coral }}>
                    Current evidence state
                  </p>
                  <div className="space-y-1.5">
                    {unlockConditions.missingItems.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 font-sans text-[12px] leading-[1.5]" style={{ color: c.muted }}>
                        <span style={{ color: c.coral, flexShrink: 0 }}>○</span>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Restore items */}
              {unlockConditions.restoreItems.length > 0 && (
                <div className="mb-3">
                  <p className="font-mono text-[9px] uppercase tracking-[0.1em] mb-1.5" style={{ color: c.amber }}>
                    Restorable
                  </p>
                  <div className="space-y-1.5">
                    {unlockConditions.restoreItems.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 font-sans text-[12px] leading-[1.5]" style={{ color: c.amber }}>
                        <span style={{ flexShrink: 0 }}>↩</span>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unlock items — next evidence threshold */}
              {unlockConditions.unlockItems.length > 0 && (
                <div className="rounded border p-3 space-y-2" style={{ borderColor: c.line, borderStyle: "dashed" }}>
                  <p className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                    Next evidence threshold
                  </p>
                  {unlockConditions.unlockItems.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 font-sans text-[12px] leading-[1.5]" style={{ color: c.secondary }}>
                      <span style={{ color: c.teal, flexShrink: 0 }}>·</span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t" style={{ borderColor: c.line }}>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-full border py-2 font-mono text-[10px] uppercase tracking-[0.08em]"
              style={{ borderColor: c.line, color: c.secondary }}
            >
              Close
            </button>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
