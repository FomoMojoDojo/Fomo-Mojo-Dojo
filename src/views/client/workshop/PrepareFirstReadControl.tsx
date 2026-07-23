// FR-FLOW-1 — "Before the meeting" intake, moved OFF the rail to the operator
// workshop. Intake is prep, not performance: the presenter fills the session-scoped
// fields ahead of the meeting, minting an OPEN first_read_session. The rail then opens
// cold and resolves that session; it never renders this form. Lives on the Inputs tab
// beside "Open First Read →".
//
// Law unchanged: intake is OPERATOR-filled. Nothing here is collected from the
// prospect, so the Mirror's no-documents claim stays provably true.

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ── Copy — the intake strings carried forward from the rail (Gate 3, signed). The
//    entry-control label is NEW, PENDING OPERATOR SIGNATURE. ──────────────────────
const PREPARE_LABEL = "Prepare First Read →"; // NEW — PENDING OPERATOR SIGNATURE
const INTAKE_TITLE = "Before the meeting";
const INTAKE_HINT = "A few notes for the room. Captured with this session, not shown to the client.";
const L_PRESENTER = "Presenter";
const L_TRIGGER = "Trigger event";
const L_ROOM = "Room roles (one per line: Name — Role)";
const L_LEGAL = "Legal name";
const L_DOMAINS = "Domains (comma-separated)";
const L_LANDMINES = "Known landmines";
const START_LABEL = "Start the read";
const PREPARED_MSG = "Prepared. Open First Read → to run the meeting.";
// ─────────────────────────────────────────────────────────────────────────────────

function parseRoomRoles(raw: string): { name: string; role: string }[] | null {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return lines.map((line) => {
    const m = line.split(/\s+[—–-]\s+|:\s*/);
    return m.length > 1 ? { name: m[0].trim(), role: m.slice(1).join(" ").trim() } : { name: line, role: "" };
  });
}

function parseDomains(raw: string): string[] | null {
  const parts = raw.split(/[,\s]+/).map((d) => d.trim()).filter(Boolean);
  return parts.length ? parts : null;
}

export default function PrepareFirstReadControl({
  companyId,
  dark,
}: {
  companyId: string | null;
  dark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState(false);
  const [intake, setIntake] = useState({
    presenter: "",
    trigger_event: "",
    room_roles: "",
    legal_name: "",
    domains: "",
    landmines: "",
  });

  const linkColor = dark ? "#7a9e90" : "#2f6b3a";
  const muted = dark ? "rgba(246,246,244,0.35)" : "#aaa";

  const createSession = async () => {
    if (!companyId) return;
    setCreating(true);
    setError(null);
    const { error: insErr } = await supabase
      .from("first_read_sessions")
      .insert({
        company_id: companyId,
        status: "open",
        presenter: intake.presenter.trim() || null,
        trigger_event: intake.trigger_event.trim() || null,
        room_roles: parseRoomRoles(intake.room_roles),
        legal_name: intake.legal_name.trim() || null,
        domains: parseDomains(intake.domains),
        landmines: intake.landmines.trim() || null,
      })
      .select("id")
      .single();
    setCreating(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setPrepared(true);
    setOpen(false);
  };

  const field = (key: keyof typeof intake, label: string, area?: boolean) => (
    <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
      <span style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.04em", color: muted }}>{label}</span>
      {area ? (
        <textarea
          rows={2}
          value={intake[key]}
          onChange={(e) => setIntake((s) => ({ ...s, [key]: e.target.value }))}
          style={{ fontFamily: "inherit", fontSize: 13, padding: "6px 8px", borderRadius: 4, border: "1px solid rgba(17,17,17,0.2)" }}
        />
      ) : (
        <input
          value={intake[key]}
          onChange={(e) => setIntake((s) => ({ ...s, [key]: e.target.value }))}
          style={{ fontFamily: "inherit", fontSize: 13, padding: "6px 8px", borderRadius: 4, border: "1px solid rgba(17,17,17,0.2)" }}
        />
      )}
    </label>
  );

  return (
    <div style={{ marginTop: dark ? 16 : 12 }}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setPrepared(false); }}
        disabled={!companyId}
        style={{
          fontFamily: "monospace", fontSize: dark ? 9 : 10, letterSpacing: "0.06em",
          color: companyId ? linkColor : muted, background: "none", border: "none", padding: 0,
          cursor: companyId ? "pointer" : "default",
          textDecoration: "underline", textDecorationStyle: "dashed", textUnderlineOffset: 3,
        }}
      >
        {PREPARE_LABEL}
      </button>
      {prepared && !open && (
        <span style={{ marginLeft: 12, fontFamily: "monospace", fontSize: dark ? 9 : 10, color: muted }}>{PREPARED_MSG}</span>
      )}

      {open && (
        <div style={{ marginTop: 12, maxWidth: 460 }}>
          <p style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: muted, margin: "0 0 4px" }}>{INTAKE_TITLE}</p>
          <p style={{ fontFamily: "monospace", fontSize: 10, color: muted, margin: "0 0 12px" }}>{INTAKE_HINT}</p>
          {field("presenter", L_PRESENTER)}
          {field("trigger_event", L_TRIGGER, true)}
          {field("room_roles", L_ROOM, true)}
          {field("legal_name", L_LEGAL)}
          {field("domains", L_DOMAINS)}
          {field("landmines", L_LANDMINES, true)}
          {error && <p style={{ fontFamily: "monospace", fontSize: 11, color: "#b91c1c", margin: "0 0 8px" }}>{error}</p>}
          <button
            type="button"
            onClick={() => void createSession()}
            disabled={creating || !companyId}
            style={{
              fontFamily: "monospace", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase",
              fontWeight: 600, color: "#fff", background: creating ? "#999" : "#2d2d2d",
              border: "none", borderRadius: 4, padding: "8px 18px", cursor: creating ? "default" : "pointer",
            }}
          >
            {creating ? "Preparing…" : START_LABEL}
          </button>
        </div>
      )}
    </div>
  );
}
