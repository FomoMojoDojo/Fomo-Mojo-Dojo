/**
 * InspectionShell — single Sheet container for the local inspection stack.
 *
 * Owns exactly one Sheet. Renders a BackBar when the stack has depth > 1.
 * Content is delegated to renderRoute / renderNeed callbacks provided by the caller.
 * Escape pops the stack when depth > 1; at depth 1 Radix closes the Sheet naturally.
 */

import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { InspectionFrame } from "@/lib/inspectionStack";

const c = {
  surface: "#FFFFFF",
  muted:   "#6E847F",
  line:    "#DDE6D1",
};
const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace';

function BackBar({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <div style={{
      padding: "9px 52px 9px 20px",
      borderBottom: `1px solid ${c.line}`,
      background: "transparent",
      flexShrink: 0,
    }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          textTransform: "uppercase",
          letterSpacing: "0.10em",
          color: c.muted,
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        ← Back to {label}
      </button>
    </div>
  );
}

export type InspectionShellProps = {
  stack: InspectionFrame[];
  onPop: () => void;
  onClear: () => void;
  renderRoute: (frame: Extract<InspectionFrame, { kind: "route" }>) => React.ReactNode;
  renderNeed: (frame: Extract<InspectionFrame, { kind: "need" }>) => React.ReactNode;
  renderDirection?: (frame: Extract<InspectionFrame, { kind: "direction" }>) => React.ReactNode;
};

export default function InspectionShell({
  stack,
  onPop,
  onClear,
  renderRoute,
  renderNeed,
  renderDirection,
}: InspectionShellProps) {
  const top  = stack.length > 0 ? stack[stack.length - 1] : null;
  const prev = stack.length > 1 ? stack[stack.length - 2] : null;

  const prevLabel = prev
    ? (prev.kind === "route" ? "Route" : prev.kind === "direction" ? "Strategic direction" : "Need")
    : "Back";

  const ariaLabel = top
    ? (top.kind === "route" ? "Route inspection" : top.kind === "direction" ? "Strategic direction inspection" : "Need inspection")
    : "Strategic object inspection";

  return (
    <Sheet open={stack.length > 0} onOpenChange={(v) => { if (!v) onClear(); }}>
      <SheetContent
        side="right"
        className="sm:max-w-[600px] flex flex-col p-0 overflow-hidden"
        aria-label={ariaLabel}
        onEscapeKeyDown={(e) => {
          if (stack.length > 1) {
            e.preventDefault();
            onPop();
          }
        }}
      >
        {top && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {stack.length > 1 && (
              <BackBar label={prevLabel} onBack={onPop} />
            )}
            {top.kind === "route"      && renderRoute(top as Extract<InspectionFrame, { kind: "route" }>)}
            {top.kind === "need"       && renderNeed(top as Extract<InspectionFrame, { kind: "need" }>)}
            {top.kind === "direction"  && renderDirection?.(top as Extract<InspectionFrame, { kind: "direction" }>)}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
