// MemberRolePanel — minimal admin-only "set this existing member's role" control
// (checkpoint 6). NOT invites, NOT add-member, NOT email — just a per-member role
// dropdown writing company_members.role. Gated by workspace.member.assignRole
// (Steward/admin only); the write also has a server-side RLS backstop on
// company_members UPDATE. Renders nothing when the capability is absent.

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
  const [savingId, setSavingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!companyId || !canAssign) {
      setMembers([]);
      return;
    }
    let active = true;
    supabase
      .from("company_members")
      .select("id,user_id,role")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (active) setMembers((data as MemberRow[] | null) ?? []);
      });
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
    <section style={{ margin: "12px 24px 0", padding: 16, border: "1px solid #dde6d1", borderRadius: 12, background: "#fff" }}>
      <p className="cap" style={{ margin: "0 0 10px", color: "#6e847f" }}>Member roles</p>
      {members.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "#8a9a95" }}>No members for this company yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {members.map((m) => {
            const opts: string[] = (ROLE_VALUES as readonly string[]).includes(m.role)
              ? [...ROLE_VALUES]
              : [m.role, ...ROLE_VALUES];
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#46606d" }} title={m.user_id}>
                  {m.user_id.slice(0, 8)}…
                </span>
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
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
