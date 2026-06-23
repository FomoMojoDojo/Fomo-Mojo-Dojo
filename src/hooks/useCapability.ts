// useCapability — the ONE capability-check authority for the UI.
//
// Composes the two role families into a single boolean:
//   • platform (global): useAuth().isAdmin → the Steward bundle.
//   • client (per-company): company_members.role for (companyId, user) → its bundle.
// Resolution itself lives in src/lib/capabilities.ts (the pure single-source
// resolver); this hook only fetches the per-company role and delegates. No other
// module should query roles or map roles→caps inline — they call this hook.
//
// CHECKPOINT 1 (DARK): pure read. No writes, no effects, gates nothing yet.
// Consumers (gating handlers / controls) arrive in checkpoint 3.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { hasCapability, type Capability } from "@/lib/capabilities";

/**
 * Returns whether the current user holds `cap`.
 * @param cap        a registered capability name.
 * @param companyId  the active company for per-company (client) role resolution;
 *                   omit/null to evaluate global (platform) capabilities only.
 */
export function useCapability(cap: Capability, companyId?: string | null): boolean {
  const { user, isAdmin } = useAuth();
  const [clientRole, setClientRole] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!companyId || !user?.id) {
      setClientRole(null);
      return;
    }
    supabase
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setClientRole((data as { role?: string | null } | null)?.role ?? null);
      });
    return () => {
      active = false;
    };
  }, [companyId, user?.id]);

  return hasCapability(cap, { isAdmin, clientRole });
}
