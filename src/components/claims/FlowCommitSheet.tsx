import { useState, useEffect } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { transitionClaim } from "@/lib/claimState/machine";
import type { TensionForGate, ActionCategory } from "@/lib/claimState/types";

type UnclaimedRoute = {
  id: string;
  title: string;
  category: string;
  level: string | null;
  steps_json: Array<{ status: string }> | null;
  parent_id: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  claimId: string;
  claimStatement: string;
  companyId: string;
  onSuccess: () => void;
};

const CATEGORY_COLORS: Record<string, string> = {
  fix: "#D44F2C",
  improve: "#B87019",
  create: "#3A6B28",
};

const VALID_CATEGORIES = ["fix", "improve", "create"] as const;

export default function FlowCommitSheet({
  open,
  onOpenChange,
  claimId,
  claimStatement,
  companyId,
  onSuccess,
}: Props) {
  const [routes, setRoutes] = useState<UnclaimedRoute[]>([]);
  const [tensions, setTensions] = useState<TensionForGate[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [blockers, setBlockers] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setSelectedRouteId(null);
      setBlockers([]);
      return;
    }

    let cancelled = false;
    setLoadingData(true);

    Promise.all([
      supabase
        .from("routes")
        .select("id, title, category, level, steps_json, parent_id")
        .eq("company_id", companyId)
        .is("claim_id", null)
        .eq("relevance_state", "active")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(50),
      supabase
        .from("strategic_tensions")
        .select("id, is_commitment_blocker, blocked_commitments")
        .eq("company_id", companyId)
        .eq("is_commitment_blocker", true)
        .neq("status", "resolved")
        .neq("status", "retired"),
    ]).then(([routesResult, tensionsResult]) => {
      if (cancelled) return;
      setRoutes((routesResult.data ?? []) as UnclaimedRoute[]);
      setTensions(
        (tensionsResult.data ?? []).map((t) => ({
          is_commitment_blocker: Boolean(t.is_commitment_blocker),
          blocked_commitments: (t.blocked_commitments ?? []) as string[],
        })),
      );
      setLoadingData(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, companyId]);

  async function handleCommit() {
    if (!selectedRouteId) return;

    setCommitting(true);
    setBlockers([]);

    const { data: freshRow, error: fetchErr } = await supabase
      .from("routes")
      .select("id, category, steps_json, stale_reason, dependency_state, linked_need_ids")
      .eq("id", selectedRouteId)
      .maybeSingle();

    if (fetchErr || !freshRow) {
      setBlockers(["Route no longer available."]);
      setCommitting(false);
      return;
    }

    const categoryStr = String(freshRow.category ?? "").toLowerCase();
    if (!VALID_CATEGORIES.includes(categoryStr as ActionCategory)) {
      setBlockers([
        `Route category '${freshRow.category}' is not a valid action category (fix / improve / create).`,
      ]);
      setCommitting(false);
      return;
    }
    const actionCategory = categoryStr as ActionCategory;

    const linkedRoute = {
      id: freshRow.id as string,
      steps_json: (freshRow.steps_json ?? null) as Array<{ status: string }> | null,
      stale_reason: (freshRow.stale_reason ?? null) as string | null,
      dependency_state: (freshRow.dependency_state ?? null) as string | null,
      linked_need_ids: (freshRow.linked_need_ids ?? null) as string[] | null,
    };

    const result = await transitionClaim(supabase, claimId, "flow", {
      linkedRoute,
      actionCategory,
      activeTensions: tensions,
      managedOutcomes: [],
      triggeredBy: "route_picker",
    });

    setCommitting(false);

    if (result.success) {
      onSuccess();
      onOpenChange(false);
    } else {
      const msgs =
        result.gateResult.blockers.length > 0
          ? result.gateResult.blockers
          : result.error
            ? [result.error]
            : ["Commit failed. Please try again."];

      // Race: route claimed between list load and confirm
      if (msgs.some((b) => b.toLowerCase().includes("already"))) {
        setBlockers(["This route was just claimed by another commit. Choose a different route."]);
      } else {
        setBlockers(msgs);
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        style={{
          width: 520,
          maxWidth: "100vw",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          background: "#FFFFFF",
        }}
        aria-label="Commit claim to flow"
      >
        {/* Header */}
        <div style={{ padding: "24px 24px 16px", borderBottom: "1px solid #EEF3E9" }}>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "#3A6B28",
              margin: "0 0 8px",
            }}
          >
            Commit to Route
          </p>
          <p
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "#233C4B",
              margin: "0 0 6px",
              lineHeight: 1.4,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {claimStatement}
          </p>
          <p
            style={{
              fontFamily: "monospace",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "#6E847F",
              margin: 0,
            }}
          >
            Choose a route to commit this need to flow
          </p>
        </div>

        {/* Route list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {loadingData ? (
            <p style={{ fontSize: 13, color: "#6E847F", padding: "8px 0" }}>Loading routes…</p>
          ) : routes.length === 0 ? (
            <p style={{ fontSize: 13, color: "#6E847F", padding: "8px 0" }}>
              No unclaimed active routes. Add a route first.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {routes.map((route) => {
                const isSelected = selectedRouteId === route.id;
                const startedCount =
                  route.steps_json?.filter(
                    (s) => s.status === "in_progress" || s.status === "complete",
                  ).length ?? 0;
                const catKey = String(route.category).toLowerCase();
                const catColor = CATEGORY_COLORS[catKey] ?? "#6E847F";

                return (
                  <button
                    key={route.id}
                    type="button"
                    onClick={() => setSelectedRouteId(isSelected ? null : route.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: 6,
                      border: isSelected ? "1px solid #3A6B28" : "1px solid #DDE6D1",
                      background: isSelected ? "rgba(58,107,40,0.06)" : "#FFFFFF",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <span
                        style={{
                          flexShrink: 0,
                          fontSize: 9,
                          fontFamily: "monospace",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          color: catColor,
                          border: `1px solid ${catColor}`,
                          borderRadius: 3,
                          padding: "2px 5px",
                          lineHeight: 1.4,
                          marginTop: 1,
                        }}
                      >
                        {route.category}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                          style={{
                            fontSize: 14,
                            fontWeight: 500,
                            color: "#233C4B",
                            margin: 0,
                            lineHeight: 1.4,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {route.title}
                        </p>
                        <p
                          style={{
                            fontSize: 11,
                            color: startedCount > 0 ? "#46606D" : "#B87019",
                            margin: "3px 0 0",
                          }}
                        >
                          {startedCount > 0
                            ? `${startedCount} step${startedCount === 1 ? "" : "s"} started`
                            : "No steps started"}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Error banner */}
          {blockers.length > 0 && (
            <div
              style={{
                marginTop: 16,
                background: "#FEF3C7",
                border: "1px solid #F59E0B",
                borderRadius: 6,
                padding: "10px 14px",
              }}
            >
              {blockers.map((b, i) => (
                <p
                  key={i}
                  style={{ fontSize: 12, color: "#92400E", margin: i > 0 ? "4px 0 0" : 0 }}
                >
                  {b}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #EEF3E9",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            disabled={!selectedRouteId || committing}
            onClick={handleCommit}
            style={{
              background: selectedRouteId && !committing ? "#234D1A" : "#9AAF9A",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 6,
              padding: "9px 18px",
              fontSize: 13,
              fontWeight: 500,
              cursor: selectedRouteId && !committing ? "pointer" : "default",
            }}
          >
            {committing ? "Committing…" : "Commit to Flow"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
