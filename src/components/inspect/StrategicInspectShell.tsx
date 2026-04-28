import type { ReactNode } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

// crpv-aligned neutral palette — matches client-refine-preview inspect panel design
const c = {
  ink: "#111111",
  inkSoft: "#555555",
  inkFaint: "#999999",
  line: "#d9d9d9",
  lineSoft: "#ededed",
  paper: "#ffffff",
};

const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace';

interface StrategicInspectShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  metaBadges?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export default function StrategicInspectShell({
  open,
  onClose,
  title,
  subtitle,
  metaBadges,
  children,
  footer,
}: StrategicInspectShellProps) {
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="sm:max-w-[480px] overflow-y-auto flex flex-col gap-0 p-0">
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: c.paper }}>

          {/* Header */}
          <div style={{ padding: "24px 24px 16px", borderBottom: `1px solid ${c.line}` }}>
            {metaBadges && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {metaBadges}
              </div>
            )}
            <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: c.ink, lineHeight: 1.3 }}>
              {title}
            </p>
            {subtitle && (
              <p style={{
                margin: "4px 0 0",
                fontFamily: MONO,
                fontSize: 9,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                color: c.inkFaint,
              }}>
                {subtitle}
              </p>
            )}
          </div>

          {/* Scrollable body */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}>
            {children}
          </div>

          {/* Footer */}
          <div style={{ padding: "16px 24px", borderTop: `1px solid ${c.line}` }}>
            {footer ?? (
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: "100%",
                  padding: "8px",
                  background: "none",
                  border: `1px solid ${c.line}`,
                  borderRadius: 0,
                  fontFamily: MONO,
                  fontSize: 9,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: c.inkSoft,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = c.lineSoft; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
              >
                Close
              </button>
            )}
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
