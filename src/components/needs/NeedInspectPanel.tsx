import { useEffect, useMemo, useRef, useState } from "react";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { RouteRow } from "@/views/Routes/useRoutes";
import type { EngagementPhase } from "@/lib/engagementPhase";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { StrategicEvent } from "@/lib/strategicGraphDomain";
import { useFoundationProvenance } from "@/hooks/useFoundationProvenance";
import { FoundationClaimSupport } from "@/components/evidence/FoundationClaimSupport";

const c = {
  panel:     "#FAF7F6",
  card:      "#FFFFFF",
  line:      "#DDE6D1",
  charcoal:  "#233C4B",
  secondary: "#46606D",
  muted:     "#6E847F",
  coral:     "#FF7D2D",
  teal:      "#5F9B8C",
  amber:     "#FAC846",
};

const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace';

function serviceStateInfo(state: string | null | undefined): { label: string; observation: string } {
  const s = String(state || "").toLowerCase();
  if (s === "underserved") return {
    label: "Underserved",
    observation: "There appears to be a gap between how important customers find this and how well it's currently being met. If that gap is real, it's worth paying attention to.",
  };
  if (s === "overserved") return {
    label: "Over-served",
    observation: "The signal suggests customers may be getting more than they need here. That's usually a sign effort could be redirected somewhere with more leverage.",
  };
  return {
    label: "Appropriately served",
    observation: "The pattern here looks balanced — importance and delivery are roughly in line. Worth monitoring, but probably not the most urgent priority right now.",
  };
}

function journeyLabel(key: string): string {
  const map: Record<string, string> = { customer: "Customer", revenue: "Revenue", operations: "Operations" };
  return map[key] ?? (key.charAt(0).toUpperCase() + key.slice(1));
}

const SectionLabel = ({ children }: { children: string }) => (
  <p style={{ margin: "0 0 10px", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: c.muted }}>
    {children}
  </p>
);

const Divider = () => (
  <div style={{ borderTop: `1px solid ${c.line}` }} />
);

export default function NeedInspectPanel({
  open,
  onClose,
  need,
  staleNote,
  currentPhase = "outside_signals",
  reviewHighlighted = false,
  onMarkReviewed,
  onSendBackToReview,
  // kept for caller compatibility, not used
  routes: _routes,
  onRouteSelect: _onRouteSelect,
}: {
  open: boolean;
  onClose: () => void;
  need: OdiNeedRow | null;
  staleNote?: string | null;
  currentPhase?: EngagementPhase;
  reviewHighlighted?: boolean;
  onMarkReviewed?: (needId: string) => Promise<void>;
  onSendBackToReview?: (needId: string) => Promise<void>;
  routes?: RouteRow[];
  onRouteSelect?: (routeId: string) => void;
}) {
  const reviewSectionRef = useRef<HTMLDivElement | null>(null);
  const [relatedEvent, setRelatedEvent] = useState<StrategicEvent | null>(null);
  const [relatedStepEvent, setRelatedStepEvent] = useState<StrategicEvent | null>(null);
  const [reviewBusy, setReviewBusy] = useState<"reviewed" | "send_back" | null>(null);
  const { data: provenance, isLoading: provenanceLoading, error: provenanceError } = useFoundationProvenance({
    companyId: need?.company_id,
    objectType: "odi_need",
    objectId: need?.id,
    enabled: open && Boolean(need?.id),
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !need?.stale_since_event_id) {
      setRelatedEvent(null);
      setRelatedStepEvent(null);
      return;
    }

    let cancelled = false;

    (async () => {
      const eventRes = await supabase
        .from("strategic_events")
        .select("*")
        .eq("id", need.stale_since_event_id)
        .maybeSingle();

      if (cancelled) return;
      const baseEvent = (eventRes.data as StrategicEvent | null) ?? null;
      setRelatedEvent(baseEvent);

      if (!baseEvent?.source_run_id || !need.company_id) {
        setRelatedStepEvent(null);
        return;
      }

      const stepEventsRes = await supabase
        .from("strategic_events")
        .select("*")
        .eq("company_id", need.company_id)
        .eq("object_type", "job_step")
        .eq("source_run_id", baseEvent.source_run_id)
        .in("event_type", ["created", "updated", "deleted", "refreshed"])
        .order("created_at", { ascending: false })
        .limit(24);

      if (cancelled) return;
      const stepEvents = ((stepEventsRes.data ?? []) as StrategicEvent[]);
      const matchedStepEvent = stepEvents.find((event) => {
        const previous = (event.previous_value ?? {}) as Record<string, unknown>;
        const next = (event.new_value ?? {}) as Record<string, unknown>;
        const stepNumber = Number(next.step_number ?? previous.step_number ?? 0);
        const journeyKey = String(next.journey_key ?? previous.journey_key ?? "").trim().toLowerCase();
        return stepNumber === Number(need.step_number ?? 0) && journeyKey === String(need.journey_key ?? "").trim().toLowerCase();
      }) ?? null;
      setRelatedStepEvent(matchedStepEvent);
    })();

    return () => {
      cancelled = true;
    };
  }, [need?.company_id, need?.journey_key, need?.stale_since_event_id, need?.step_number, open]);

  useEffect(() => {
    if (!open || !reviewHighlighted || !reviewSectionRef.current) return;
    reviewSectionRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [open, reviewHighlighted, need?.id]);

  const stateInfo = serviceStateInfo(need?.service_state);

  const journeyKey = need?.journey_key ?? "";
  const stepNumber = need?.step_number ?? null;
  const stepLabel  = need?.step_label  ?? null;

  const contextParts = [
    journeyKey ? journeyLabel(journeyKey).toUpperCase() : null,
    stepNumber ? `CHECKPOINT ${stepNumber}` : null,
    stepLabel  ? stepLabel.toUpperCase() : null,
  ].filter(Boolean);
  const contextLine = contextParts.join(" · ");

  const sourcePath      = String(need?.source_path || "").toLowerCase();
  const isExternalOnly  = sourcePath.includes("baseline") || sourcePath.includes("public") || sourcePath.includes("benchmark");
  const state           = String(need?.service_state || "").toLowerCase();
  const dependencyState = String(need?.dependency_state || "").toLowerCase();
  const requiresReview = ["needs_review", "stale", "contradicted", "revalidate"].includes(dependencyState);
  const canSendBackToReview = dependencyState === "fresh" && Boolean(need?.last_reviewed_at) && Boolean(onSendBackToReview);
  const changedStepLabel = useMemo(() => {
    const event = relatedStepEvent;
    if (!event) return null;
    const previous = (event.previous_value ?? {}) as Record<string, unknown>;
    const next = (event.new_value ?? {}) as Record<string, unknown>;
    return String(next.step_label || previous.step_label || need?.step_label || "").trim() || null;
  }, [need?.step_label, relatedStepEvent]);

  const stillNeeded: string[] = [];
  if (isExternalOnly) {
    stillNeeded.push("This signal comes from outside research. Confirm it with customer interviews or internal data before acting on it.");
  }
  if (state === "underserved") {
    stillNeeded.push("Validate that this gap is consistent across customer segments — a single source can overstate it.");
  } else if (state === "overserved") {
    stillNeeded.push("Check whether this reflects a real pattern or a specific context. Over-served signals sometimes normalize over time.");
  }
  if (stillNeeded.length === 0) {
    stillNeeded.push("Additional customer research would help confirm or sharpen this read.");
  }

  async function handleReviewAction(kind: "reviewed" | "send_back") {
    if (!need?.id) return;
    const handler = kind === "reviewed" ? onMarkReviewed : onSendBackToReview;
    if (!handler) return;
    setReviewBusy(kind);
    try {
      await handler(need.id);
      toast.success(kind === "reviewed" ? "Need marked reviewed." : "Need sent back to review.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Need review update failed.");
    } finally {
      setReviewBusy(null);
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 40,
          background: "rgba(35,60,75,0.26)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.25s",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, zIndex: 50,
          display: "flex", flexDirection: "column",
          width: 520, maxWidth: "100vw", height: "100vh",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
          background: c.panel,
          borderLeft: `1px solid ${c.line}`,
        }}
      >
        {need && (
          <>
            {staleNote && (
              <div style={{ padding: "7px 20px", borderBottom: `1px solid ${c.line}`, background: `${c.amber}18` }}>
                <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: c.muted }}>
                  {staleNote}
                </span>
              </div>
            )}

            {/* Header */}
            <div style={{ position: "relative", padding: "20px 52px 16px 20px", borderBottom: `1px solid ${c.line}` }}>
              {contextLine && (
                <p style={{ margin: "0 0 6px", fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: c.muted }}>
                  {contextLine}
                </p>
              )}
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.3, color: c.charcoal }}>
                {need.desired_outcome}
              </h2>
              <button
                type="button" onClick={onClose} aria-label="Close"
                style={{
                  position: "absolute", top: 16, right: 16,
                  width: 32, height: 32,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1px solid ${c.line}`, borderRadius: 6,
                  background: c.card, color: c.secondary,
                  cursor: "pointer", fontSize: 13,
                }}
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px", display: "flex", flexDirection: "column", gap: 24 }}>

              {/* What we're noticing */}
              <section>
                <SectionLabel>What we're noticing</SectionLabel>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: c.secondary }}>
                  This need appears to be{" "}
                  <strong style={{ color: c.charcoal, fontWeight: 600 }}>{stateInfo.label.toLowerCase()}</strong>.
                </p>
              </section>

              <Divider />

              {/* Why it matters */}
              <section>
                <SectionLabel>Why it matters</SectionLabel>
                <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: c.secondary }}>
                  {stateInfo.observation}
                </p>
              </section>

              <Divider />

              <section>
                <SectionLabel>Supported by</SectionLabel>
                {provenanceLoading ? (
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: c.secondary }}>Loading claim support…</p>
                ) : provenanceError ? (
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#a12318" }}>
                    {provenanceError instanceof Error ? provenanceError.message : "Failed to load claim support."}
                  </p>
                ) : (
                  <FoundationClaimSupport claims={provenance?.claims ?? []} mode="odi_need" />
                )}
              </section>

              <Divider />

              {requiresReview && (
                <>
                  <section
                    ref={reviewSectionRef}
                    style={{
                      padding: "14px 16px",
                      border: `1px solid ${reviewHighlighted ? c.coral : c.line}`,
                      background: reviewHighlighted ? "#fff4ed" : c.card,
                      borderRadius: 8,
                    }}
                  >
                    <SectionLabel>Why this needs review</SectionLabel>
                    <p style={{ margin: "0 0 12px", fontSize: 13, lineHeight: 1.6, color: c.secondary }}>
                      This need may need to be checked because the job map changed.
                    </p>
                    <div style={{ display: "grid", gap: 8 }}>
                      <div>
                        <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>Needs review</p>
                        <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.55, color: c.charcoal }}>
                          {need.stale_reason || "Needs review"}
                        </p>
                      </div>
                      {relatedEvent?.created_at ? (
                        <div>
                          <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>Related change date</p>
                          <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.55, color: c.charcoal }}>
                            {new Date(relatedEvent.created_at).toLocaleString()}
                          </p>
                        </div>
                      ) : null}
                      {changedStepLabel ? (
                        <div>
                          <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>Changed checkpoint</p>
                          <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.55, color: c.charcoal }}>
                            {`Checkpoint ${need.step_number || "—"} · ${changedStepLabel}`}
                          </p>
                        </div>
                      ) : null}
                      {relatedEvent?.reason ? (
                        <div>
                          <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>Linked change</p>
                          <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.55, color: c.charcoal }}>
                            {relatedEvent.reason}
                          </p>
                        </div>
                      ) : null}
                      {need.stale_since_event_id ? (
                        <div>
                          <p style={{ margin: 0, fontFamily: MONO, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: c.muted }}>Event id</p>
                          <p style={{ margin: "4px 0 0", fontSize: 11, lineHeight: 1.55, color: c.secondary, wordBreak: "break-all" }}>
                            {need.stale_since_event_id}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                      {onMarkReviewed ? (
                        <button
                          type="button"
                          onClick={() => void handleReviewAction("reviewed")}
                          disabled={reviewBusy !== null}
                          style={{
                            padding: "10px 14px",
                            border: `1px solid ${c.line}`,
                            borderRadius: 6,
                            background: c.card,
                            color: c.charcoal,
                            fontFamily: MONO,
                            fontSize: 10,
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            cursor: reviewBusy !== null ? "default" : "pointer",
                          }}
                        >
                          {reviewBusy === "reviewed" ? "Saving…" : "Mark reviewed"}
                        </button>
                      ) : null}
                    </div>
                  </section>

                  <Divider />
                </>
              )}

              {/* What we still need */}
              <section>
                <SectionLabel>What we still need</SectionLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {stillNeeded.map((item, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ color: c.muted, flexShrink: 0, lineHeight: 1.6 }}>○</span>
                      <span style={{ fontSize: 13, lineHeight: 1.6, color: c.secondary }}>{item}</span>
                    </div>
                  ))}
                </div>
              </section>

            </div>

            {/* Footer */}
            <div style={{ padding: "16px 20px", borderTop: `1px solid ${c.line}`, display: "grid", gap: 10 }}>
              {canSendBackToReview ? (
                <button
                  type="button"
                  onClick={() => void handleReviewAction("send_back")}
                  disabled={reviewBusy !== null}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "10px 16px",
                    border: `1px solid ${c.line}`,
                    borderRadius: 6,
                    background: c.panel,
                    color: c.secondary,
                    fontFamily: MONO,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    cursor: reviewBusy !== null ? "default" : "pointer",
                  }}
                >
                  {reviewBusy === "send_back" ? "Saving…" : "Send back to review"}
                </button>
              ) : null}
              <button
                type="button" onClick={onClose}
                style={{
                  display: "block", width: "100%",
                  padding: "10px 16px",
                  border: `1px solid ${c.line}`, borderRadius: 6,
                  background: c.card, color: c.secondary,
                  fontFamily: MONO, fontSize: 10,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
