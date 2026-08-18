// Edit-company-name (design gate 2026-08-18; in-place ruling after live use) —
// admin-only rename on the Company page identity header. The pencil swaps the
// large <h1> for an input styled to match it: committing the edit IS the
// confirmation — no dialog, no second ceremony. Enter or Done commits; Escape
// or blur-without-change cancels; empty/unchanged input is a no-op cancel.
//
// Commit path: trim/non-empty → collision soft-warn if it fires (interposed —
// the two-Edgewoods guard; proceed/cancel) → UPDATE companies.name →
// strategic_events audit row (reason omitted; column stays nullable) → toast.
//
// FROZEN PATH IS THE DATABASE'S: no client-side frozen pre-check. The attempt
// runs and enforce_frozen_company_row's refusal message is rendered VERBATIM
// as returned (operator ruling: the trigger is the authority).
//
// Renames never rewrite stored artifacts, filenames, or storage paths — past
// documents keep the historical name (verbatim-or-nothing law). Signed strings
// are byte-exact; string 2's ceremony question is deleted with the dialog, its
// preservation sentence survives as the editing caption.

import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyIfAvailable } from "@/hooks/useCompany";
import { findCompanyCollision, type CompanyCollision } from "@/lib/companyCollision";

// ── operator-signed strings (byte-exact) ────────────────────────────────────
export const RENAME_LABEL = "Edit company name"; // string 1 (aria-label/title on the pencil)
export const RENAME_CAPTION =
  "Existing documents and generated analysis keep the name as it was written at the time."; // string 2 (caption while editing)
export const collisionWarnText = (name: string, website: string | null) =>
  `Another company is already named "${name}" (${website ?? "no website"}). Renaming will make these indistinguishable by name.`; // string 3
// string 4 = the DB trigger's refusal, rendered verbatim as returned
export const RENAME_SUCCESS_TOAST = "Company renamed. Past documents keep the historical name."; // string 5

type Deps = {
  findCollision: (name: string) => Promise<CompanyCollision | null>;
  renameCompany: (companyId: string, name: string) => Promise<string | null>; // error message or null
  recordRenameEvent: (args: {
    companyId: string;
    previousName: string;
    newName: string;
    actorId: string | null;
  }) => Promise<string | null>; // error message or null
  notifySuccess: (message: string) => void;
};

const defaultDeps: Deps = {
  findCollision: (name) => findCompanyCollision(name),
  renameCompany: async (companyId, name) => {
    const { error } = await supabase.from("companies").update({ name }).eq("id", companyId);
    return error ? error.message || "Rename failed." : null;
  },
  recordRenameEvent: async ({ companyId, previousName, newName, actorId }) => {
    const { error } = await supabase.from("strategic_events").insert({
      company_id: companyId,
      event_type: "company_renamed",
      actor_type: actorId ? "user" : "system",
      actor_id: actorId,
      source_run_id: null,
      object_type: "company",
      object_id: companyId,
      previous_value: { name: previousName },
      new_value: { name: newName },
      reason: null,
    });
    return error ? error.message || "Failed to record rename event." : null;
  },
  notifySuccess: (message) => toast.success(message),
};

export function CompanyRenameControlBase({
  companyId,
  companyName,
  headerStyle,
  actorId,
  refetchCompany,
  deps = defaultDeps,
}: {
  companyId: string;
  companyName: string;
  /** Style of the identity header the input must visually match. */
  headerStyle?: React.CSSProperties;
  actorId: string | null;
  refetchCompany?: () => void | Promise<void>;
  /** Injectable for tests; production uses supabase + sonner. */
  deps?: Deps;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [collision, setCollision] = useState<CompanyCollision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mono = { fontFamily: "monospace", fontSize: 10 } as const;

  const reset = () => {
    setEditing(false);
    setDraft("");
    setCollision(null);
    setError(null);
  };

  const startEdit = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setDraft(companyName);
    setError(null);
    setCollision(null);
    setEditing(true);
  };

  // The rename itself — runs after the collision gate (or straight through).
  const doRename = async (newName: string) => {
    setBusy(true);
    setError(null);
    try {
      const renameError = await deps.renameCompany(companyId, newName);
      if (renameError) {
        // includes the frozen trigger's refusal — rendered verbatim as returned
        setError(renameError);
        setCollision(null);
        return;
      }
      const auditError = await deps.recordRenameEvent({
        companyId,
        previousName: companyName,
        newName,
        actorId,
      });
      if (auditError) {
        // rename landed but the audit write failed — say so honestly
        setError(`Renamed, but the audit event failed: ${auditError}`);
      } else {
        deps.notifySuccess(RENAME_SUCCESS_TOAST);
      }
      await refetchCompany?.();
      reset();
    } finally {
      setBusy(false);
    }
  };

  // Commit = the confirmation. Empty/unchanged → no-op cancel. A collision
  // interposes the two-Edgewoods warn once; proceed commits, cancel keeps editing.
  const commit = async () => {
    if (busy) return;
    const newName = draft.trim();
    if (!newName || newName === companyName) {
      reset();
      return;
    }
    const found = await deps.findCollision(newName);
    const other = found && found.id !== companyId ? found : null;
    if (other) {
      setCollision(other);
      return;
    }
    await doRename(newName);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      reset();
    }
  };

  const onBlur = () => {
    // blur-without-change cancels; a changed draft stays open for Enter/Done
    if (!collision && !busy && (draft.trim() === companyName || !draft.trim())) reset();
  };

  if (!editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, ...headerStyle }}>{companyName}</h1>
        <a
          href="#rename-company"
          onClick={startEdit}
          aria-label={RENAME_LABEL}
          title={RENAME_LABEL}
          style={{ color: "#2f6b3a", fontSize: 15, lineHeight: 1, textDecoration: "none", cursor: "pointer" }}
        >
          ✎
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input
          aria-label="New company name"
          autoFocus
          value={draft}
          disabled={busy}
          onChange={(e) => {
            setDraft(e.target.value);
            setCollision(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          style={{
            // the name being edited looks like the name
            ...headerStyle,
            margin: 0,
            padding: "0 2px",
            border: "none",
            borderBottom: "2px solid #2f6b3a",
            outline: "none",
            background: "transparent",
            minWidth: 280,
          }}
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault() /* keep input from blur-cancelling first */}
          onClick={() => void commit()}
          disabled={busy}
          style={{ ...mono, cursor: busy ? "default" : "pointer" }}
        >
          {busy ? "Renaming…" : "Done"}
        </button>
      </div>
      <span style={{ ...mono, color: "#999" }}>{RENAME_CAPTION}</span>
      {collision && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ ...mono, color: "#8a6d00" }}>
            {collisionWarnText(collision.name, collision.website)}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => void doRename(draft.trim())}
              disabled={busy}
              style={{ ...mono, cursor: busy ? "default" : "pointer" }}
            >
              Rename anyway
            </button>
            <button type="button" onClick={reset} disabled={busy} style={{ ...mono, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <span style={{ ...mono, color: "#a33" }}>{error}</span>}
    </div>
  );
}

// Production wrapper: wires the signed-in user (audit actor) and the company
// context refetch so the header reflects the new name immediately.
export default function CompanyRenameControl(props: {
  companyId: string;
  companyName: string;
  headerStyle?: React.CSSProperties;
}) {
  const { user } = useAuth();
  const company = useCompanyIfAvailable();
  return <CompanyRenameControlBase {...props} actorId={user?.id ?? null} refetchCompany={company?.refetch} />;
}
