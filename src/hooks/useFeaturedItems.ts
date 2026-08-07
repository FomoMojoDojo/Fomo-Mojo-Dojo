// First Read ROLLUP (Gate 2) — per-theme featured-item pointers.
//
// A recorded, reversible operator decision naming the one item a theme leads with (theme 2 =
// outside-raised, theme 3 = findings). Content-identity anchored, so a rebuild that re-mints the
// same item keeps the pointer; a vanished item degrades to the honest absent state. Writes are
// admin/service-role only (RLS) — a non-admin mutation returns an error, never a silent success.
//
// Mirrors the curated_tensions shape: live rows are removed_at IS NULL; picking a new item
// SOFT-REMOVES the prior live pointer (removed_reason='replaced') then inserts the new one — the
// (company, theme) live-unique index makes replace-not-duplicate the only valid path.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ThemeKey = "say_vs_see" | "outside_raised" | "findings";
export type FeaturedOrigin = "auto" | "operator" | "auto_judged";

export interface FeaturedPointer {
  itemIdentity: string;
  note: string | null;
  origin: FeaturedOrigin;      // LABEL HONESTY: choice-language leads render ONLY for 'operator'.
  judgeReason: string | null;  // theme-2 'auto_judged' one-liner (operator-facing).
}
export type FeaturedByTheme = Partial<Record<ThemeKey, FeaturedPointer>>;

const ALL_THEMES: ThemeKey[] = ["say_vs_see", "outside_raised", "findings"];

interface Row {
  theme_key: ThemeKey;
  item_identity: string;
  operator_note: string | null;
  origin: FeaturedOrigin;
  judge_reason: string | null;
}

// The table is not in the generated Database types yet; scope the loose typing to this hook.
const table = () => (supabase as unknown as {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
}).from("first_read_featured_items");

export function useFeaturedItems(companyId?: string) {
  const [featured, setFeatured] = useState<FeaturedByTheme>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!companyId) { setFeatured({}); setLoading(false); return; }
    setLoading(true);
    const { data, error: readErr } = await table()
      .select("theme_key, item_identity, operator_note, origin, judge_reason")
      .eq("company_id", companyId)
      .is("removed_at", null);
    if (readErr) { setError(readErr.message); setLoading(false); return; }
    const map: FeaturedByTheme = {};
    for (const r of ((data ?? []) as Row[])) map[r.theme_key] = { itemIdentity: r.item_identity, note: r.operator_note, origin: r.origin, judgeReason: r.judge_reason };
    setFeatured(map);
    setError(null);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void refetch(); }, [refetch]);

  // Pick (replace) the featured item for a theme. Returns null on success, or a short message.
  const feature = useCallback(
    async (themeKey: ThemeKey, itemIdentity: string, note?: string): Promise<string | null> => {
      if (!companyId) return "No company.";
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      // Soft-remove the prior live pointer for this (company, theme) — recorded, reversible.
      const { error: rmErr } = await table()
        .update({ removed_at: new Date().toISOString(), removed_by: uid, removed_reason: "replaced" })
        .eq("company_id", companyId).eq("theme_key", themeKey).is("removed_at", null);
      if (rmErr) return rmErr.message;
      const { error: insErr } = await table()
        .insert({ company_id: companyId, theme_key: themeKey, item_identity: itemIdentity, operator_note: note ?? null, created_by: uid, origin: "operator" });
      if (insErr) return insErr.message;
      await refetch();
      return null;
    },
    [companyId, refetch],
  );

  // RATIFY (one-click "keep"): flip the live pointer's origin to 'operator' — the auto default
  // becomes a recorded human decision and renders as chosen. In-place; no new row.
  const ratify = useCallback(
    async (themeKey: ThemeKey): Promise<string | null> => {
      if (!companyId) return "No company.";
      const { data: auth } = await supabase.auth.getUser();
      const { error: upErr } = await table()
        .update({ origin: "operator", created_by: auth?.user?.id ?? null })
        .eq("company_id", companyId).eq("theme_key", themeKey).is("removed_at", null);
      if (upErr) return upErr.message;
      await refetch();
      return null;
    },
    [companyId, refetch],
  );

  // Soft-remove the live pointer for a theme (back to the absent state; reversible in the row).
  const unfeature = useCallback(
    async (themeKey: ThemeKey): Promise<string | null> => {
      if (!companyId) return "No company.";
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      const { error: rmErr } = await table()
        .update({ removed_at: new Date().toISOString(), removed_by: uid, removed_reason: "unfeatured" })
        .eq("company_id", companyId).eq("theme_key", themeKey).is("removed_at", null);
      if (rmErr) return rmErr.message;
      await refetch();
      return null;
    },
    [companyId, refetch],
  );

  // ENSURE DEFAULTS (rail-open lazy): if any theme has no live pointer, invoke the compute edge
  // function ONCE, then refetch. Only the presenter (admin) should call this — the edge function
  // writes origin='auto'/'auto_judged' pointers ONLY where none live (never touches operator rows).
  const ensuredRef = useRef(false);
  const ensureDefaults = useCallback(async () => {
    if (!companyId || loading || ensuredRef.current) return;
    if (!ALL_THEMES.some((t) => !featured[t])) return; // all themes already pointed → nothing to do
    ensuredRef.current = true;
    await supabase.functions.invoke("compute-featured-defaults", { body: { company_id: companyId } });
    await refetch();
  }, [companyId, loading, featured, refetch]);

  return { featured, loading, error, feature, unfeature, ratify, ensureDefaults, refetch };
}
