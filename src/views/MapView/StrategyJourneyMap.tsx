import React from "react";

type Props = {
  currentScore?: number;
  potentialScore?: number;
};

function safeNum(n: unknown, fallback = 0) {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export default function StrategyJourneyMap({ currentScore, potentialScore }: Props) {
  const current = Math.round(safeNum(currentScore, 0));
  const potential = Math.round(safeNum(potentialScore, 0));

  return (
    <div className="bg-white border border-border rounded-2xl p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-sans text-[13px] font-bold text-foreground uppercase tracking-wide">
            Strategy Journey Map
          </div>
          <div className="font-mono text-[10px] text-muted-foreground mt-1">
            DB-backed scores (no Edgewood mock fallbacks)
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-border bg-cream px-3 py-2">
            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Current Reality
            </div>
            <div className="font-sans text-[16px] font-bold text-foreground leading-none mt-1">
              {current}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-cream px-3 py-2">
            <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
              Projected Outcome
            </div>
            <div className="font-sans text-[16px] font-bold text-foreground leading-none mt-1">
              {potential}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <div className="font-mono text-[10px] text-muted-foreground">
          Routes / readiness tiles will appear here once they’re DB-backed.
        </div>
      </div>
    </div>
  );
}
