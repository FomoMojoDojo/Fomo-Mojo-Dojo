// MemberRolePanel — minimal admin-only "set this existing member's role" control.
// Lives on the dedicated Member Roles page (/preview/client-refine/members).
// NOT invites / add-member / email — just a per-member role dropdown writing
// company_members.role. Gated by workspace.member.assignRole (Steward/admin only);
// the write also has a server-side RLS backstop on company_members UPDATE.
// Members are identified by profiles.display_name (raw — a name, or the email
// captured at signup for nameless users), never the user_id UUID.
// Renders nothing when the capability is absent.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCapability } from "@/hooks/useCapability";

type MemberRow = { id: string; user_id: string; role: string };

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
  // user_id -> raw profiles.display_name (name, or email for nameless users).
  const [namesById, setNamesById] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!companyId || !canAssign) {
      setMembers([]);
      setNamesById({});
      return;
    }
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("company_members")
        .select("id,user_id,role")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });
      if (!active) return;
      const rows = (data as MemberRow[] | null) ?? [];
      setMembers(rows);

      // Resolve display_name for each member (profiles is readable to authenticated
      // users via the shipped "view profile names" policy). Raw value — no cleaning.
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      if (userIds.length === 0) {
        setNamesById({});
        return;
      }
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("user_id,display_name")
        .in("user_id", userIds);
      if (!active) return;
      const map: Record<string, string> = {};
      for (const p of (profileRows as { user_id: string; display_name: string | null }[] | null) ?? []) {
        const v = (p.display_name ?? "").trim();
        if (v) map[p.user_id] = v;
      }
      setNamesById(map);
    })();
    return () => {
      active = false;
    };
  }, [companyId, canAssign, refreshKey]);

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

  // Admin-only control: render nothing for anyone without the capability.
  if (!canAssign || !companyId) return null;

  return (
    <section style={{ maxWidth: 720 }}>
      <h1 style={{ margin: "0 0 6px", fontSize: 22, color: "#1e3340" }}>Member Roles</h1>
      <p style={{ margin: "0 0 20px", fontSize: 14, color: "#6e847f" }}>
        Set each member's role for this company.
      </p>
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
              const label = namesById[m.user_id] || "Unknown member";
              return (
                <tr key={m.id} style={{ borderBottom: "1px solid #f0ece8" }}>
                  <td style={{ padding: "10px 12px 10px 0", fontSize: 14, color: "#1e3340" }} title={m.user_id}>
                    {label}
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
