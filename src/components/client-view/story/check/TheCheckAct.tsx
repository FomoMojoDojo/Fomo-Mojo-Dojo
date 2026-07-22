/*
 * First Read · Act 3 — The Check (content).
 *
 * Wires the Gate 2 capture surface (useFirstReadCapture + CheckItemRow +
 * CheckTally) to a REAL session for the route's company:
 *   - resume: if an open session already exists for this company, use it.
 *   - bootstrap: otherwise a pre-meeting intake form (the Gate 1 schema fields)
 *     creates one.
 * No lifecycle transitions here (Gate 4) — sessions stay 'open'. Act framing is
 * supplied by the rail; this renders the session bar, tally, and item list.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useFirstReadCapture, type CheckItem, type Verdict } from "@/hooks/useFirstReadCapture";
import CheckItemRow from "./CheckItemRow";
import CheckTally from "./CheckTally";

// ── Client-facing copy — PENDING OPERATOR SIGNATURE (Gate 3) ─────────────────
const INTAKE_TITLE = "Before the meeting";
const INTAKE_HINT = "A few notes for the room. Captured with this session, not shown to the client.";
const L_PRESENTER = "Presenter";
const L_TRIGGER = "Trigger event";
const L_ROOM = "Room roles (one per line: Name — Role)";
const L_LEGAL = "Legal name";
const L_DOMAINS = "Domains (comma-separated)";
const L_LANDMINES = "Known landmines";
const START_LABEL = "Start the read";
const FROZEN_MSG = "This session is locked — the proposal has been issued. Verdicts can no longer change.";
// ─────────────────────────────────────────────────────────────────────────────

function parseRoomRoles(raw: string): { name: string; role: string }[] | null {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  return lines.map((line) => {
    const m = line.split(/\s+[—–-]\s+|:\s*/);
    return m.length > 1
      ? { name: m[0].trim(), role: m.slice(1).join(" ").trim() }
      : { name: line, role: "" };
  });
}

function parseDomains(raw: string): string[] | null {
  const parts = raw
    .split(/[,\s]+/)
    .map((d) => d.trim())
    .filter(Boolean);
  return parts.length ? parts : null;
}

export default function TheCheckAct({ companyId }: { companyId: string }) {
  const [sessionId, setSessionId] = useState<string>("");
  const [resolving, setResolving] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intake, setIntake] = useState({
    presenter: "",
    trigger_event: "",
    room_roles: "",
    legal_name: "",
    domains: "",
    landmines: "",
  });

  // Resume: the latest OPEN session for this company, if any.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setResolving(true);
      const { data } = await supabase
        .from("first_read_sessions")
        .select("id")
        .eq("company_id", companyId)
        .eq("status", "open")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setSessionId((data as { id: string } | null)?.id ?? "");
        setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const { items, tally, loading, frozen, sessionStatus, setVerdict } = useFirstReadCapture(
    companyId,
    sessionId || undefined,
  );

  const createSession = async () => {
    setCreating(true);
    setError(null);
    const { data, error: insErr } = await supabase
      .from("first_read_sessions")
      .insert({
        company_id: companyId,
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
    setSessionId((data as { id: string }).id);
  };

  const onSet = async (item: CheckItem, v: Verdict, correction?: string) => {
    setError(await setVerdict(item, v, correction));
  };

  if (resolving) return <p className="cvs-support">Looking for an open session…</p>;

  // ── Bootstrap: intake form ────────────────────────────────────────────────
  if (!sessionId) {
    const field = (
      key: keyof typeof intake,
      label: string,
      opts?: { area?: boolean; placeholder?: string },
    ) => (
      <label className="cvs-fr-field">
        <span className="cvs-fr-field-label">{label}</span>
        {opts?.area ? (
          <textarea
            className="cvs-fr-field-input"
            rows={2}
            value={intake[key]}
            onChange={(e) => setIntake((s) => ({ ...s, [key]: e.target.value }))}
          />
        ) : (
          <input
            className="cvs-fr-field-input"
            value={intake[key]}
            onChange={(e) => setIntake((s) => ({ ...s, [key]: e.target.value }))}
          />
        )}
      </label>
    );

    return (
      <div className="cvs-fr-intake">
        <p className="cvs-fr-intake-title">{INTAKE_TITLE}</p>
        <p className="cvs-support cvs-fr-intake-hint">{INTAKE_HINT}</p>
        {field("presenter", L_PRESENTER)}
        {field("trigger_event", L_TRIGGER, { area: true })}
        {field("room_roles", L_ROOM, { area: true })}
        {field("legal_name", L_LEGAL)}
        {field("domains", L_DOMAINS)}
        {field("landmines", L_LANDMINES, { area: true })}
        {error && <p className="cvs-check-refusal">{error}</p>}
        <button type="button" className="cvs-pill-primary" onClick={createSession} disabled={creating}>
          {START_LABEL}
        </button>
      </div>
    );
  }

  // ── Capture surface ───────────────────────────────────────────────────────
  return (
    <div className="cvs-fr-check">
      <div className="cvs-check-session-bar">
        <span className="cvs-check-session-meta">
          session {sessionId.slice(0, 8)}… · status {sessionStatus ?? "…"}
        </span>
      </div>

      <CheckTally tally={tally} />

      {frozen && <p className="cvs-check-frozen">{FROZEN_MSG}</p>}
      {error && !frozen && <p className="cvs-check-refusal">{error}</p>}

      {loading ? (
        <p className="cvs-support">Loading items…</p>
      ) : items.length === 0 ? (
        <p className="cvs-support">No checkable items surfaced for this company yet.</p>
      ) : (
        <div className="cvs-check-list">
          {items.map((item) => (
            <CheckItemRow key={item.identity} item={item} onSet={onSet} disabled={frozen} />
          ))}
        </div>
      )}
    </div>
  );
}
