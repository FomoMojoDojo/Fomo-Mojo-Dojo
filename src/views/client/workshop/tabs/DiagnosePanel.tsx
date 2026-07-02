// Diagnose — candidate paths (v1). Read-only render of the pure derivation in
// src/lib/diagnoseAssessment.ts. Route-local: what's proven, what isn't, and the
// test that moves the barrier. No writes, no generation, no rank, no grouping.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RouteRow } from "@/hooks/useRoutes";
import {
  deriveDiagnoseAssessment,
  STATUS_QUO_CARD,
  type RouteAssessment,
  type TestRow,
} from "@/lib/diagnoseAssessment";

const C = {
  ink: "#111111",
  inkSoft: "rgba(17,17,17,0.62)",
  inkFaint: "rgba(17,17,17,0.4)",
  hair: "rgba(17,17,17,0.12)",
  hairFaint: "rgba(17,17,17,0.07)",
  signal: "#E5541F",
  metGreen: "#1f7a4d",
  sans: "Inter, system-ui, sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, monospace",
};

function Chip({ label, tone }: { label: string; tone: "met" | "unmet" | "neutral" }) {
  const color = tone === "met" ? C.metGreen : tone === "unmet" ? C.inkSoft : C.inkFaint;
  const border = tone === "met" ? "rgba(31,122,77,0.4)" : C.hair;
  return (
    <span style={{ fontFamily: C.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color, border: `1px solid ${border}`, borderRadius: 2, padding: "2px 6px", whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function RouteCard({ r }: { r: RouteAssessment }) {
  const ahead = r.metCount > 0;
  return (
    <div style={{ border: `1px solid ${C.hair}`, borderRadius: 6, padding: "18px 20px", background: "#fff", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header: title + met-count (partially-progressed routes read visibly ahead) */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, justifyContent: "space-between" }}>
        <h3 style={{ fontFamily: C.sans, fontSize: 17, fontWeight: 600, color: C.ink, margin: 0, lineHeight: 1.25, letterSpacing: "-0.01em" }}>{r.title}</h3>
        <span style={{
          flexShrink: 0, fontFamily: C.mono, fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
          color: ahead ? C.metGreen : C.inkFaint,
          border: `1px solid ${ahead ? "rgba(31,122,77,0.45)" : C.hair}`,
          background: ahead ? "rgba(31,122,77,0.07)" : "transparent",
          borderRadius: 4, padding: "3px 9px",
        }}>
          {r.metCount} / {r.totalCount} proven
        </span>
      </div>

      {/* Conditions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {r.conditions.map((c) => (
          <div key={c.index} style={{ borderTop: `1px solid ${C.hairFaint}`, paddingTop: 12 }}>
            {/* Meta row: barrier marker + state chips (compact), above the full-width condition */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 7 }}>
              {c.isBarrier && (
                <span style={{ fontFamily: C.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: C.signal, border: `1px solid ${C.signal}`, borderRadius: 2, padding: "2px 6px", whiteSpace: "nowrap" }} title="the condition to prove first">
                  Start here
                </span>
              )}
              <Chip label={c.met ? "Met" : "Not yet proven"} tone={c.met ? "met" : "unmet"} />
              <Chip label={c.testStateLabel} tone="neutral" />
            </div>
            <p style={{ fontFamily: C.sans, fontSize: 14, color: C.ink, lineHeight: 1.5, margin: 0 }}>{c.condition}</p>

            {/* Lever — only on the barrier, only if a test exists */}
            {c.isBarrier && c.hypothesis && (
              <div style={{ marginTop: 10, marginLeft: 2, paddingLeft: 12, borderLeft: `2px solid ${C.hair}`, display: "flex", flexDirection: "column", gap: 7 }}>
                <span style={{ fontFamily: C.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: C.inkFaint }}>The test that moves it:</span>
                <p style={{ fontFamily: C.sans, fontSize: 13, color: C.ink, margin: 0, lineHeight: 1.5 }}>{c.hypothesis}</p>
                {c.expectedPositiveSignal && (
                  <p style={{ fontFamily: C.sans, fontSize: 12.5, color: C.inkSoft, margin: 0, lineHeight: 1.45 }}>
                    <span style={{ fontFamily: C.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: C.inkFaint }}>If it's working, we'd see · </span>
                    {c.expectedPositiveSignal}
                  </p>
                )}
                {c.expectedNegativeSignal && (
                  <p style={{ fontFamily: C.sans, fontSize: 12.5, color: C.inkSoft, margin: 0, lineHeight: 1.45 }}>
                    <span style={{ fontFamily: C.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: C.inkFaint }}>If it's not, we'd see · </span>
                    {c.expectedNegativeSignal}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DiagnosePanel({ routes, companyId }: { routes: RouteRow[]; companyId?: string | null }) {
  const [tests, setTests] = useState<TestRow[]>([]);

  useEffect(() => {
    let active = true;
    if (!companyId) { setTests([]); return; }
    supabase
      .from("tests")
      .select("id, action_id, hypothesis, expected_positive_signal, expected_negative_signal, result, no_test_needed")
      .eq("company_id", companyId)
      .then(({ data }) => { if (active) setTests((data as TestRow[]) ?? []); });
    return () => { active = false; };
  }, [companyId]);

  const assessments = useMemo(
    () => deriveDiagnoseAssessment(routes as unknown as Parameters<typeof deriveDiagnoseAssessment>[0], tests),
    [routes, tests],
  );

  return (
    <div style={{ maxWidth: 860, padding: "8px 4px 40px" }}>
      <h2 style={{ fontFamily: C.sans, fontSize: 22, fontWeight: 700, color: C.ink, margin: "0 0 6px", letterSpacing: "-0.015em" }}>
        Diagnose — candidate paths
      </h2>
      <p style={{ fontFamily: C.sans, fontSize: 14, color: C.inkSoft, margin: "0 0 24px", lineHeight: 1.55, maxWidth: 640 }}>
        Each path to the outcome rests on conditions. See what's proven, what isn't, and the test that moves it.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {assessments.map((r) => <RouteCard key={r.routeId} r={r} />)}

        {/* Status-quo — synthesized global card, always present */}
        <div style={{ border: `1px dashed ${C.hair}`, borderRadius: 6, padding: "18px 20px", background: C.hairFaint }}>
          <h3 style={{ fontFamily: C.sans, fontSize: 17, fontWeight: 600, color: C.inkSoft, margin: "0 0 6px" }}>{STATUS_QUO_CARD.title}</h3>
          <p style={{ fontFamily: C.sans, fontSize: 14, color: C.inkSoft, margin: 0, lineHeight: 1.5 }}>{STATUS_QUO_CARD.body}</p>
        </div>
      </div>
    </div>
  );
}
