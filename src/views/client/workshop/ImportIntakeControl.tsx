// Fix B (design gate 2026-08-12) — admin-only trigger to import pending intake
// submissions from the HOSTED "dumb mailbox" into local pipeline rows.
//
// Manual (R2). Parent gates on isAdmin; the import-intake-submissions edge fn
// double-gates (verify_jwt + admin role). It passes allow_pipeline=false: the
// button imports inputs/files/problem only — running run-agent-flow is a
// separate, deliberate step (operator rider), never a side effect of import.
//
// Results are rendered honestly, one line per row (imported / failed + reason),
// including the "frozen reference company — import refused" refusal. `invoke` is
// injectable for tests; production calls supabase.functions.invoke.

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const IMPORT_INTAKE_LABEL = "Import intake submissions →"; // operator-signed (Fix B)

type RowResult = {
  id: string;
  status?: string;
  company_id?: string;
  company?: string;
  reason?: string;
  error?: string;
  pipeline?: string;
};
type ImportResponse = { processed?: number; results?: RowResult[]; error?: string };

type Invoke = (
  name: string,
  opts: { body: unknown },
) => Promise<{ data: ImportResponse | null; error: { message: string } | null }>;

const defaultInvoke: Invoke = (name, opts) =>
  supabase.functions.invoke(name, opts) as ReturnType<Invoke>;

export default function ImportIntakeControl({
  dark,
  invoke = defaultInvoke,
}: {
  dark?: boolean;
  /** Injectable for tests; production uses supabase.functions.invoke. */
  invoke?: Invoke;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);

  const onClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setResults(null);
    try {
      const { data, error } = await invoke("import-intake-submissions", {
        body: { allow_pipeline: false },
      });
      if (error) {
        setMessage(error.message || "Import failed.");
      } else if (data?.error) {
        setMessage(data.error);
      } else {
        const rows = data?.results ?? [];
        setResults(rows);
        setMessage(
          rows.length === 0
            ? "No pending submissions."
            : `Processed ${rows.length}: ` +
                `${rows.filter((r) => r.status === "imported").length} imported, ` +
                `${rows.filter((r) => r.status === "failed").length} failed.`,
        );
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const linkColor = dark ? "#7a9e90" : "#2f6b3a";
  const subColor = dark ? "rgba(246,246,244,0.35)" : "#aaa";
  const mono = { fontFamily: "monospace", fontSize: dark ? 9 : 10 } as const;

  const rowLine = (r: RowResult): string => {
    if (r.status === "imported") {
      return `✓ ${r.id.slice(0, 8)} → imported (${r.company_id?.slice(0, 8) ?? "?"}, pipeline ${r.pipeline ?? "skipped"})`;
    }
    if (r.reason === "frozen_match") {
      return `⦸ ${r.id.slice(0, 8)} → refused: frozen reference company ${r.company ?? ""}`.trim();
    }
    return `✕ ${r.id.slice(0, 8)} → failed: ${r.error ?? "unknown"}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: dark ? 16 : 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <a
          href="#import-intake"
          aria-disabled={busy}
          onClick={onClick}
          style={{
            ...mono,
            letterSpacing: "0.06em",
            color: busy ? (dark ? "rgba(246,246,244,0.25)" : "#bbb") : linkColor,
            background: "none",
            padding: 0,
            textDecoration: "underline",
            textDecorationStyle: "dashed",
            textUnderlineOffset: 3,
            pointerEvents: busy ? "none" : "auto",
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "Importing…" : IMPORT_INTAKE_LABEL}
        </a>
        <span style={{ ...mono, color: subColor }}>
          Pulls pending submissions from the hosted intake mailbox; does not run analysis.
        </span>
      </div>
      {message && (
        <span style={{ ...mono, color: dark ? "rgba(246,246,244,0.6)" : "#666" }}>{message}</span>
      )}
      {results && results.length > 0 && (
        <ul style={{ ...mono, color: dark ? "rgba(246,246,244,0.6)" : "#666", margin: 0, paddingLeft: 14 }}>
          {results.map((r) => (
            <li key={r.id}>{rowLine(r)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
