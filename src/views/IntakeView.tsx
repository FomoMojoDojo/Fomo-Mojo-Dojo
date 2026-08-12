// Gate S — the Intake page. A per-company, operator-facing view of the structured intake capture:
// the client's own quiz answers, the completion context they saw on finishing (when present),
// the submission date, and a link to the verbatim markdown file. "Where we started" — easy to
// return to. The file stays the immutable record; this is the view. Latest submission by default,
// with a switcher for prior ones (a company can submit more than once over time).

import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useIntakeResponses, type IntakeResponseRow } from "@/hooks/useIntakeResponses";
import { useCompanyFiles } from "@/hooks/useCompanyFiles";
import { getFileSignedUrl } from "@/hooks/useInputs";

// OPERATOR-SIGNATURE PENDING (Gate S): shown when a submission carries no completion_view snapshot
// (e.g. the Cafe Barra backfill, or after the results page is simplified to just-show-answers).
export const COMPLETION_ABSENT_NOTE = "No completion snapshot was captured for this submission.";

const MONO = { fontFamily: "monospace" } as const;
const PAGE: React.CSSProperties = { maxWidth: 860, margin: "0 auto", padding: "32px 24px", color: "#333" };
const LABEL: React.CSSProperties = { ...MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#999" };
const H: React.CSSProperties = { ...MONO, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "#888", fontWeight: 600, margin: "0 0 6px" };
const VAL: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 15, lineHeight: 1.5, color: "#2a2a2a", margin: 0 };
const NONE = "—";

function Field({ label, value }: { label: string; value?: string | null }) {
  const v = String(value ?? "").trim();
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={LABEL}>{label}</div>
      <p style={{ ...VAL, color: v ? "#2a2a2a" : "#bbb" }}>{v || NONE}</p>
    </div>
  );
}

type MojoSnapshot = { starting_mode?: string; primary_friction?: string; customer_truth_signal?: string; top_focus_areas?: string[] };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: "1px solid #eee", paddingTop: 18, marginTop: 18 }}>
      <h2 style={H}>{title}</h2>
      {children}
    </section>
  );
}

function SubmissionBody({ r, companyId }: { r: IntakeResponseRow; companyId: string }) {
  const { data: files = [] } = useCompanyFiles(companyId);
  const intakeFile = useMemo(() => files.find((f) => (f.tags ?? []).includes("Intake")), [files]);
  const snap = (r.mojo_snapshot ?? {}) as MojoSnapshot;
  const focus = (snap.top_focus_areas ?? []).filter(Boolean);
  const slowdowns = (r.decision_slowdowns ?? []).filter(Boolean);
  const completion = r.completion_view as Record<string, unknown> | null;

  const openFile = async () => {
    if (!intakeFile) return;
    const url = await getFileSignedUrl(intakeFile.file_path);
    if (url) window.open(url, "_blank", "noopener");
  };

  return (
    <>
      <Section title="The problem you brought to us">
        <Field label="Strategic problem" value={r.explicit_strategic_problem} />
      </Section>

      <Section title="Where you're stuck">
        <Field label="Where stuck" value={[r.where_stuck, r.where_stuck_other].filter(Boolean).join(" — ")} />
        <div style={{ marginBottom: 14 }}>
          <div style={LABEL}>Decision slowdowns</div>
          {slowdowns.length ? (
            <ul style={{ ...VAL, paddingLeft: 18, margin: 0 }}>{slowdowns.map((s, i) => <li key={i}>{s}</li>)}</ul>
          ) : <p style={{ ...VAL, color: "#bbb" }}>{NONE}</p>}
        </div>
        <Field label="Customer confidence" value={r.customer_confidence} />
        <Field label="Last customer input" value={r.last_customer_input} />
        <Field label="Momentum drag" value={[r.momentum_drag, r.momentum_drag_other].filter(Boolean).join(" — ")} />
      </Section>

      <Section title="Where you're headed">
        <Field label="Desired outcome" value={[r.desired_outcome, r.desired_outcome_other].filter(Boolean).join(" — ")} />
        <Field label="Success definition" value={r.success_definition} />
      </Section>

      <Section title="MojoMap™ snapshot">
        <Field label="Starting mode" value={snap.starting_mode} />
        <Field label="Primary friction" value={snap.primary_friction} />
        <Field label="Customer truth signal" value={snap.customer_truth_signal} />
        <div style={{ marginBottom: 14 }}>
          <div style={LABEL}>Top focus areas</div>
          {focus.length ? (
            <ul style={{ ...VAL, paddingLeft: 18, margin: 0 }}>{focus.map((s, i) => <li key={i}>{s}</li>)}</ul>
          ) : <p style={{ ...VAL, color: "#bbb" }}>{NONE}</p>}
        </div>
      </Section>

      {String(r.notes ?? "").trim() && (
        <Section title="Additional context"><Field label="Notes" value={r.notes} /></Section>
      )}

      <Section title="Completion context">
        {completion && Object.keys(completion).length > 0 ? (
          <pre style={{ ...MONO, fontSize: 12, background: "#faf9f7", border: "1px solid #eee", borderRadius: 4, padding: 12, overflowX: "auto", color: "#444" }}>
            {JSON.stringify(completion, null, 2)}
          </pre>
        ) : (
          <p style={{ ...MONO, fontSize: 12, color: "#aaa" }}>{COMPLETION_ABSENT_NOTE}</p>
        )}
      </Section>

      <Section title="Source">
        {intakeFile ? (
          <button type="button" onClick={openFile} style={{ ...MONO, fontSize: 11, color: "#2f6b3a", background: "none", border: "none", padding: 0, textDecoration: "underline", textDecorationStyle: "dashed", cursor: "pointer" }}>
            View verbatim file ({intakeFile.file_name}) →
          </button>
        ) : <p style={{ ...MONO, fontSize: 11, color: "#bbb" }}>Verbatim file not found.</p>}
      </Section>
    </>
  );
}

export default function IntakeView() {
  const { companyId } = useParams<{ companyId: string }>();
  const { data: responses = [], isLoading } = useIntakeResponses(companyId);
  const [selected, setSelected] = useState(0);

  if (!companyId) return <div style={PAGE}><p style={MONO}>No company.</p></div>;
  if (isLoading) return <div style={PAGE}><p style={{ ...MONO, color: "#aaa" }}>Loading intake…</p></div>;
  if (responses.length === 0) {
    return <div style={PAGE}><div style={LABEL}>Intake</div><p style={{ ...VAL, color: "#bbb", marginTop: 8 }}>No intake submission has been captured for this company yet.</p></div>;
  }

  const idx = Math.min(selected, responses.length - 1);
  const r = responses[idx];
  const when = r.submitted_at || r.created_at;
  const dateStr = when ? new Date(when).toISOString().slice(0, 10) : "unknown date";

  return (
    <div style={PAGE}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={LABEL}>Intake — where we started</div>
          <div style={{ ...MONO, fontSize: 13, color: "#555", marginTop: 4 }}>Submitted {dateStr}</div>
        </div>
        {responses.length > 1 && (
          <select
            value={idx}
            onChange={(e) => setSelected(Number(e.target.value))}
            style={{ ...MONO, fontSize: 11, color: "#555", border: "1px solid #d9d9d9", borderRadius: 3, padding: "3px 8px", background: "#fff", cursor: "pointer" }}
          >
            {responses.map((row, i) => {
              const w = row.submitted_at || row.created_at;
              const d = w ? new Date(w).toISOString().slice(0, 10) : "unknown";
              return <option key={row.id} value={i}>{i === 0 ? `Latest · ${d}` : d}</option>;
            })}
          </select>
        )}
      </div>
      <SubmissionBody r={r} companyId={companyId} />
    </div>
  );
}
