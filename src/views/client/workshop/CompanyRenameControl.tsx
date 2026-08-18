// Edit-company-name (design gate 2026-08-18) — admin-only inline rename on the
// workshop InputsTab. Parent gates on isAdmin (RLS backstops: companies writes
// are admin-only). Flow: pencil → inline edit → trim/non-empty → soft collision
// warn → confirm → UPDATE companies.name → strategic_events audit row → toast.
//
// FROZEN PATH IS THE DATABASE'S: no client-side frozen pre-check. The attempt
// runs and enforce_frozen_company_row's refusal message is rendered VERBATIM
// as returned (operator ruling: the trigger is the authority).
//
// Renames never rewrite stored artifacts, filenames, or storage paths — past
// documents keep the historical name (verbatim-or-nothing law). All strings
// below are operator-signed byte-exact (2026-08-18 ruling; NO matcher warning
// in the confirm string — matcher brittleness is a separately filed gate).

import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyIfAvailable } from "@/hooks/useCompany";
import { findCompanyCollision, type CompanyCollision } from "@/lib/companyCollision";

// ── operator-signed strings (byte-exact) ────────────────────────────────────
export const RENAME_LABEL = "Edit company name"; // string 1
export const renameConfirmText = (oldName: string, newName: string) =>
  `Rename "${oldName}" to "${newName}"? Existing documents and generated analysis keep the name as it was written at the time.`; // string 2
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
    reason: string;
  }) => Promise<string | null>; // error message or null
  notifySuccess: (message: string) => void;
};

const defaultDeps: Deps = {
  findCollision: (name) => findCompanyCollision(name),
  renameCompany: async (companyId, name) => {
    const { error } = await supabase.from("companies").update({ name }).eq("id", companyId);
    return error ? error.message || "Rename failed." : null;
  },
  recordRenameEvent: async ({ companyId, previousName, newName, actorId, reason }) => {
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
      reason: reason || null,
    });
    return error ? error.message || "Failed to record rename event." : null;
  },
  notifySuccess: (message) => toast.success(message),
};

export function CompanyRenameControlBase({
  companyId,
  companyName,
  dark,
  actorId,
  refetchCompany,
  deps = defaultDeps,
}: {
  companyId: string;
  companyName: string;
  dark?: boolean;
  actorId: string | null;
  refetchCompany?: () => void | Promise<void>;
  /** Injectable for tests; production uses supabase + sonner. */
  deps?: Deps;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState<null | { newName: string; collision: CompanyCollision | null }>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mono = { fontFamily: "monospace", fontSize: dark ? 9 : 10 } as const;
  const linkColor = dark ? "#7a9e90" : "#2f6b3a";
  const subColor = dark ? "rgba(246,246,244,0.6)" : "#666";

  const reset = () => {
    setEditing(false);
    setConfirming(null);
    setDraft("");
    setReason("");
    setError(null);
  };

  const startEdit = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setDraft(companyName);
    setError(null);
    setEditing(true);
  };

  const submitDraft = async () => {
    const newName = draft.trim();
    if (!newName) {
      setError("Company name cannot be empty.");
      return;
    }
    if (newName === companyName) {
      reset();
      return;
    }
    // soft collision check — warn, never block (fail-open on read hiccups)
    const found = await deps.findCollision(newName);
    const collision = found && found.id !== companyId ? found : null;
    setError(null);
    setConfirming({ newName, collision });
  };

  const confirmRename = async () => {
    if (!confirming || busy) return;
    setBusy(true);
    setError(null);
    try {
      const renameError = await deps.renameCompany(companyId, confirming.newName);
      if (renameError) {
        // includes the frozen trigger's refusal — rendered verbatim as returned
        setError(renameError);
        return;
      }
      const auditError = await deps.recordRenameEvent({
        companyId,
        previousName: companyName,
        newName: confirming.newName,
        actorId,
        reason: reason.trim(),
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: dark ? 16 : 12 }}>
      {!editing && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ ...mono, color: subColor }}>{companyName}</span>
          <a
            href="#rename-company"
            onClick={startEdit}
            style={{
              ...mono,
              letterSpacing: "0.06em",
              color: linkColor,
              textDecoration: "underline",
              textDecorationStyle: "dashed",
              textUnderlineOffset: 3,
              cursor: "pointer",
            }}
          >
            ✎ {RENAME_LABEL}
          </a>
        </div>
      )}

      {editing && !confirming && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            aria-label="New company name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ ...mono, padding: "2px 6px" }}
          />
          <button type="button" onClick={submitDraft} style={{ ...mono, cursor: "pointer" }}>
            Save
          </button>
          <button type="button" onClick={reset} style={{ ...mono, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      )}

      {confirming && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {confirming.collision && (
            <span style={{ ...mono, color: dark ? "#c9a227" : "#8a6d00" }}>
              {collisionWarnText(confirming.collision.name, confirming.collision.website)}
            </span>
          )}
          <span style={{ ...mono, color: subColor }}>{renameConfirmText(companyName, confirming.newName)}</span>
          <input
            aria-label="Rename reason (optional)"
            placeholder="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ ...mono, padding: "2px 6px", maxWidth: 360 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={confirmRename} disabled={busy} style={{ ...mono, cursor: busy ? "default" : "pointer" }}>
              {busy ? "Renaming…" : "Confirm rename"}
            </button>
            <button type="button" onClick={reset} disabled={busy} style={{ ...mono, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <span style={{ ...mono, color: dark ? "#d08c8c" : "#a33" }}>{error}</span>}
    </div>
  );
}

// Production wrapper: wires the signed-in user (audit actor) and the company
// context refetch so the workshop header reflects the new name immediately.
export default function CompanyRenameControl(props: {
  companyId: string;
  companyName: string;
  dark?: boolean;
}) {
  const { user } = useAuth();
  const company = useCompanyIfAvailable();
  return <CompanyRenameControlBase {...props} actorId={user?.id ?? null} refetchCompany={company?.refetch} />;
}
