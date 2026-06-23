// MemberRolePanel — admin-only member management for one company.
// Lives on the dedicated Member Roles page (/preview/client-refine/members).
//  • Add a member: pick an EXISTING user (a profile not already in this company)
//    and add them at the default role Participant. Backed by an admin-gated
//    company_members INSERT RLS policy (reuses the cp6 workspace.member.assignRole
//    capability). No invites / email / new-user creation — deferred.
//  • Set role: per-member dropdown writing company_members.role (cp6), backed by
//    the matching admin-gated UPDATE RLS policy.
// Members are identified by profiles.display_name (raw — a name, or the email
// captured at signup for nameless users), never the user_id UUID.
// Renders nothing when the capability is absent. Remove/DELETE stays deferred.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCapability } from "@/hooks/useCapability";

type MemberRow = { id: string; user_id: string; role: string };
type ProfileRow = { user_id: string; display_name: string | null };

// The five named client roles (stored form — matches the company_members.role CHECK).
const ROLE_VALUES = ["sponsor", "decision_owner", "contributor", "participant", "observer"] as const;
const ROLE_LABEL: Record<string, string> = {
  sponsor: "Sponsor",
  decision_owner: "Decision-Owner",
  contributor: "Contributor",
  participant: "Participant",
  observer: "Observer",
  member: "Member (legacy)",
};

export default function MemberRolePanel({ companyId }: { companyId?: string | null }) {
  const canAssign = useCapability("workspace.member.assignRole", companyId);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Add-a-member control state.
  const [addQuery, setAddQuery] = useState("");
  const [addSelectedId, setAddSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!companyId || !canAssign) {
      setMembers([]);
      setProfiles([]);
      return;
    }
    let active = true;
    (async () => {
      const { data: memberData } = await supabase
        .from("company_members")
        .select("id,user_id,role")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });
      if (!active) return;
      setMembers((memberData as MemberRow[] | null) ?? []);

      // All profiles — readable to authenticated users via the shipped "view profile
      // names" policy. Used both to label members and to populate the add picker.
      const { data: profileData } = await supabase
        .from("profiles")
        .select("user_id,display_name");
      if (!active) return;
      setProfiles((profileData as ProfileRow[] | null) ?? []);
    })();
    return () => {
      active = false;
    };
  }, [companyId, canAssign, refreshKey]);

  // user_id -> raw display_name (name, or email for nameless users).
  const nameOf = useCallback(
    (userId: string) => {
      const v = (profiles.find((p) => p.user_id === userId)?.display_name ?? "").trim();
      return v || "Unknown member";
    },
    [profiles],
  );

  const setRole = useCallback(
    async (member: MemberRow, role: string) => {
      if (!canAssign || !companyId || role === member.role) return;
      setSavingId(member.id);
      await supabase
        .from("company_members")
        .update({ role })
        .eq("id", member.id)
        .eq("company_id", companyId);
      setSavingId(null);
      setRefreshKey((k) => k + 1);
    },
    [canAssign, companyId],
  );

  const addMember = useCallback(
    async (userId: string) => {
      if (!canAssign || !companyId) return;
      setAdding(true);
      await supabase
        .from("company_members")
        .insert({ company_id: companyId, user_id: userId, role: "participant" });
      setAdding(false);
      setAddQuery("");
      setAddSelectedId(null);
      setRefreshKey((k) => k + 1); // person appears in the list at Participant
    },
    [canAssign, companyId],
  );

  // Admin-only control: render nothing for anyone without the capability.
  if (!canAssign || !companyId) return null;

  const memberIds = new Set(members.map((m) => m.user_id));
  const eligible = profiles.filter((p) => !memberIds.has(p.user_id));
  const q = addQuery.trim().toLowerCase();
  const matches = (q ? eligible.filter((p) => (p.display_name ?? "").toLowerCase().includes(q)) : eligible).slice(0, 8);

  return (
    <section style={{ maxWidth: 720 }}>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, color: "#1e3340" }}>Member Roles</h1>
      <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6e847f" }}>
        Set each member's role for this company.
      </p>

      {/* ── Add a member ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28, padding: 16, border: "1px solid #dde6d1", borderRadius: 12, background: "#fff" }}>
        <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#1e3340" }}>Add a member</p>
        {eligible.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#8a9a95" }}>No other users to add.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="text"
              value={addQuery}
              onChange={(e) => { setAddQuery(e.target.value); setAddSelectedId(null); }}
              placeholder="Search people by name…"
              style={{ width: "100%", border: "1px solid #dde6d1", borderRadius: 6, padding: "8px 10px", fontSize: 13 }}
            />
            {matches.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", border: "1px solid #f0ece8", borderRadius: 6, overflow: "hidden" }}>
                {matches.map((p) => {
                  const selected = p.user_id === addSelectedId;
                  return (
                    <button
                      key={p.user_id}
                      type="button"
                      onClick={() => setAddSelectedId(p.user_id)}
                      title={p.user_id}
                      style={{ textAlign: "left", fontSize: 14, color: "#1e3340", padding: "9px 12px", background: selected ? "#eef4ea" : "#fff", border: "none", borderBottom: "1px solid #f5f2ee", cursor: "pointer" }}
                    >
                      {(p.display_name ?? "").trim() || "Unknown member"}
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                type="button"
                onClick={() => addSelectedId && void addMember(addSelectedId)}
                disabled={!addSelectedId || adding}
                style={{ fontSize: 13, fontWeight: 600, color: !addSelectedId || adding ? "#9aaba5" : "#fff", background: !addSelectedId || adding ? "#eef1ed" : "#1e3340", border: "1px solid #1e3340", borderColor: !addSelectedId || adding ? "#dde6d1" : "#1e3340", borderRadius: 6, padding: "7px 16px", cursor: !addSelectedId || adding ? "default" : "pointer" }}
              >
                {adding ? "Adding…" : "Add to company"}
              </button>
              {addSelectedId && (
                <span style={{ fontSize: 13, color: "#6e847f" }}>{nameOf(addSelectedId)} — Participant</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Member list ──────────────────────────────────────────────────── */}
      {members.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "#8a9a95" }}>No members for this company yet.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #dde6d1" }}>
              <th style={{ padding: "8px 12px 8px 0", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a9a95", fontWeight: 600 }}>Member</th>
              <th style={{ padding: "8px 0", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8a9a95", fontWeight: 600 }}>Role</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const opts: string[] = (ROLE_VALUES as readonly string[]).includes(m.role)
                ? [...ROLE_VALUES]
                : [m.role, ...ROLE_VALUES];
              return (
                <tr key={m.id} style={{ borderBottom: "1px solid #f0ece8" }}>
                  <td style={{ padding: "10px 12px 10px 0", fontSize: 14, color: "#1e3340" }} title={m.user_id}>
                    {nameOf(m.user_id)}
                  </td>
                  <td style={{ padding: "10px 0", display: "flex", alignItems: "center", gap: 10 }}>
                    <select
                      value={m.role}
                      disabled={savingId === m.id}
                      onChange={(e) => void setRole(m, e.target.value)}
                      style={{ border: "1px solid #dde6d1", borderRadius: 6, padding: "5px 8px", fontSize: 13 }}
                    >
                      {opts.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r] ?? r}
                        </option>
                      ))}
                    </select>
                    {savingId === m.id && <span style={{ fontSize: 12, color: "#8a9a95" }}>Saving…</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
