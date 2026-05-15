import { useState, useEffect } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import type { ClaimState } from "@/lib/claimState";

// ── Canonical labels per MojoMap snapshot §5 ─────────────────────────────────

const LABEL: Record<ClaimState, string> = {
  outside_view: "Outside view",
  diagnose:     "Diagnose",
  focus:        "Focus",
  flow:         "Flow",
};

const ORIENT: Record<ClaimState, string> = {
  outside_view: "Inferred from public signals — not yet grounded internally.",
  diagnose:     "Grounded through internal evidence — not yet customer-validated.",
  focus:        "Customer-validated through primary research.",
  flow:         "Committed and acting, with monitoring in place.",
};

// Hardcoded hex so portal-rendered content (Radix Popover) is not subject
// to CSS custom property scoping issues.
const VISUAL: Record<ClaimState, {
  color:   string;
  border:  string;
  bg:      string;
  weight:  number;
  italic:  boolean;
}> = {
  outside_view: { color: "#6E8CA0", border: "rgba(110,140,160,0.22)", bg: "rgba(110,140,160,0.06)", weight: 400, italic: true  },
  diagnose:     { color: "#B87019", border: "rgba(184,112,25,0.28)",  bg: "rgba(184,112,25,0.07)",  weight: 500, italic: false },
  focus:        { color: "#3A6B28", border: "rgba(58,107,40,0.30)",   bg: "rgba(58,107,40,0.07)",   weight: 500, italic: false },
  flow:         { color: "#234D1A", border: "rgba(35,77,26,0.42)",    bg: "rgba(35,77,26,0.09)",    weight: 600, italic: false },
};

const NEXT_REQ: Record<ClaimState, string | null> = {
  outside_view: "To advance to Diagnose: attach at least one internal organizational signal and one additional supporting signal.",
  diagnose:     "To advance to Focus: attach a customer-sourced signal and resolve any open contradictions.",
  focus:        "To advance to Flow: assign an action category (Fix / Improve / Create) and link a route with at least one step started.",
  flow:         null,
};

// ── Inspect data (fetched lazily when popover opens) ─────────────────────────

type InspectData = {
  outside_support_count:     number;
  organization_support_count: number;
  customer_support_count:    number;
  updated_at:                string | null;
};

// ── Props ────────────────────────────────────────────────────────────────────

export type ClaimStateBadgeProps = {
  state:     ClaimState;
  claimId?:  string | null;
  size?:     "sm" | "md";
  variant?:  "badge" | "pill" | "inline";
  className?: string;
};

// ── Component ────────────────────────────────────────────────────────────────

export default function ClaimStateBadge({
  state,
  claimId,
  size    = "sm",
  variant = "badge",
  className,
}: ClaimStateBadgeProps) {
  const [orientVisible, setOrientVisible] = useState(false);
  const [inspectOpen,   setInspectOpen]   = useState(false);
  const [inspectData,   setInspectData]   = useState<InspectData | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  const v       = VISUAL[state];
  const label   = LABEL[state];
  const orient  = ORIENT[state];
  const nextReq = NEXT_REQ[state];

  const fontSize = size === "md" ? 12 : 11;
  const px       = size === "md" ? 8  : 6;
  const py       = size === "md" ? 4  : 2;

  // Lazy-fetch claim row when inspect popover opens
  useEffect(() => {
    if (!inspectOpen || !claimId) return;
    let cancelled = false;
    (async () => {
      setInspectLoading(true);
      const { data } = await supabase
        .from("claims")
        .select("outside_support_count, organization_support_count, customer_support_count, updated_at")
        .eq("id", claimId)
        .maybeSingle();
      if (!cancelled) {
        setInspectData(data as InspectData | null);
        setInspectLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [inspectOpen, claimId]);

  // ── Inline variant — text only, no border/bg ─────────────────────────────

  if (variant === "inline") {
    return (
      <span
        data-testid="claim-state-badge"
        style={{
          color:      v.color,
          fontWeight: v.weight,
          fontStyle:  v.italic ? "italic" : "normal",
          fontSize,
        }}
        aria-label={orient}
        className={className}
      >
        {label}
      </span>
    );
  }

  // ── Badge / pill trigger button ──────────────────────────────────────────

  const triggerStyle: React.CSSProperties = {
    display:         "inline-flex",
    alignItems:      "center",
    paddingLeft:     px,
    paddingRight:    px,
    paddingTop:      py,
    paddingBottom:   py,
    borderRadius:    variant === "pill" ? 12 : 4,
    border:          `1px solid ${v.border}`,
    background:      v.bg,
    fontSize,
    color:           v.color,
    fontWeight:      v.weight,
    fontStyle:       v.italic ? "italic" : "normal",
    fontFamily:      "inherit",
    cursor:          claimId ? "pointer" : "default",
    userSelect:      "none" as const,
    transition:      "background 120ms ease",
    whiteSpace:      "nowrap" as const,
  };

  const triggerEl = (
    <button
      type="button"
      data-testid="claim-state-badge"
      data-state={state}
      style={triggerStyle}
      aria-label={orient}
      aria-expanded={inspectOpen}
      onMouseEnter={() => { if (!inspectOpen) setOrientVisible(true); }}
      onMouseLeave={() => setOrientVisible(false)}
      onClick={(e) => {
        e.stopPropagation();
        setOrientVisible(false);
        if (claimId) setInspectOpen((prev) => !prev);
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      className={className}
    >
      {claimId ? (
        <Popover open={inspectOpen} onOpenChange={setInspectOpen}>
          <PopoverTrigger asChild>{triggerEl}</PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="start"
            sideOffset={6}
            style={{
              background:   "#FFFFFF",
              border:       "1px solid #DDE6D1",
              boxShadow:    "0 4px 12px rgba(0,0,0,0.08)",
              padding:      0,
              width:        280,
              borderRadius: 8,
            }}
            className="font-sans"
          >
            <InspectPanel
              state={state}
              label={label}
              orient={orient}
              visual={v}
              nextReq={nextReq}
              loading={inspectLoading}
              data={inspectData}
            />
          </PopoverContent>
        </Popover>
      ) : (
        triggerEl
      )}

      {/* Orient tooltip — shown on hover when popover is closed */}
      {orientVisible && !inspectOpen && (
        <div
          role="tooltip"
          style={{
            position:       "absolute",
            top:            "calc(100% + 5px)",
            left:           "50%",
            transform:      "translateX(-50%)",
            background:     "#FFFFFF",
            border:         "1px solid #DDE6D1",
            borderRadius:   6,
            boxShadow:      "0 2px 8px rgba(0,0,0,0.07)",
            padding:        "5px 9px",
            fontSize:       11,
            color:          "#46606D",
            fontStyle:      "normal",
            fontWeight:     400,
            whiteSpace:     "nowrap",
            zIndex:         50,
            maxWidth:       260,
            pointerEvents:  "none",
          }}
        >
          {orient}
        </div>
      )}
    </div>
  );
}

// ── Inspect panel (rendered inside Radix portal — no CSS vars) ────────────────

function InspectPanel({
  state,
  label,
  orient,
  visual,
  nextReq,
  loading,
  data,
}: {
  state:   ClaimState;
  label:   string;
  orient:  string;
  visual:  typeof VISUAL[ClaimState];
  nextReq: string | null;
  loading: boolean;
  data:    InspectData | null;
}) {
  const outside  = data?.outside_support_count      ?? 0;
  const org      = data?.organization_support_count ?? 0;
  const customer = data?.customer_support_count     ?? 0;
  const hasSignals = outside > 0 || org > 0 || customer > 0;

  const updatedAt = data?.updated_at
    ? new Date(data.updated_at).toLocaleDateString("en-US", {
        month: "short",
        day:   "numeric",
        year:  "numeric",
      })
    : null;

  return (
    <div data-testid="inspect-panel" style={{ fontFamily: "inherit" }}>
      {/* Header — state label + orient sentence */}
      <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid #EEF3E9" }}>
        <span
          style={{
            color:      visual.color,
            fontWeight: visual.weight,
            fontStyle:  visual.italic ? "italic" : "normal",
            fontSize:   12,
          }}
        >
          {label}
        </span>
        <p style={{ marginTop: 3, color: "#6E847F", fontSize: 11, lineHeight: 1.4, margin: "3px 0 0" }}>
          {orient}
        </p>
      </div>

      {/* Evidence section */}
      <div style={{ padding: "8px 14px", borderBottom: "1px solid #EEF3E9" }}>
        <p
          style={{
            color:          "#8EA89F",
            fontSize:       9.5,
            textTransform:  "uppercase",
            letterSpacing:  "0.08em",
            margin:         "0 0 5px",
          }}
        >
          Evidence accumulated
        </p>
        {loading ? (
          <p style={{ color: "#8EA89F", fontSize: 11, margin: 0 }}>Loading…</p>
        ) : !hasSignals ? (
          <p style={{ color: "#8EA89F", fontSize: 11, margin: 0 }}>No signals recorded yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {outside  > 0 && <EvidenceRow label="Outside signals"      count={outside}  />}
            {org      > 0 && <EvidenceRow label="Organization signals" count={org}      />}
            {customer > 0 && <EvidenceRow label="Customer signals"     count={customer} />}
          </div>
        )}
        {updatedAt && (
          <p style={{ color: "#8EA89F", fontSize: 10, margin: "5px 0 0" }}>
            Last updated {updatedAt}
          </p>
        )}
      </div>

      {/* What's needed to advance */}
      {nextReq && (
        <div style={{ padding: "8px 14px", borderBottom: "1px solid #EEF3E9" }}>
          <p
            style={{
              color:         "#8EA89F",
              fontSize:      9.5,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              margin:        "0 0 4px",
            }}
          >
            What's needed to advance
          </p>
          <p style={{ color: "#46606D", fontSize: 11, lineHeight: 1.5, margin: 0 }}>
            {nextReq}
          </p>
        </div>
      )}

      {/* Footer — placeholder claim detail link */}
      <div style={{ padding: "7px 14px" }}>
        <a
          href="#claim-detail"
          style={{ color: "#6E8CA0", fontSize: 11, textDecoration: "none" }}
          onClick={(e) => e.stopPropagation()}
        >
          View claim detail →
        </a>
      </div>
    </div>
  );
}

function EvidenceRow({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#46606D" }}>
      <span>{label}</span>
      <span style={{ fontWeight: 500, color: "#233C4B" }}>{count}</span>
    </div>
  );
}
