import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { resolveChosenSet, currentActor, clearStalePin, PIN_CLEARED_STALE_NOTE } from "@/lib/chosenJobStepSet";

/** The one home of the "On strategy" word (hoisted 2026-09-11; the workspace Job Map chip imports it). */
export const ON_STRATEGY_LABEL = "On strategy";

// On-strategy pin: a DISTINCT strategic assertion (which job-step set drives strategy),
// NOT the journey view-toggle next to it (that just switches what you're looking at). You
// can view one set while another is on-strategy. Persists to operator_primary_selection
// (domain='job_step_set', item_key=journey_key) — the single authority both the scorer and
// research-company read via resolve_primary_job_step_set. Mirrors the Findings primary
// control. Hidden for single-set companies (no choice to make).

// operator_primary_selection / the resolver aren't in the generated types.
// Loose: the audit table is outside the generated types until they are regenerated, and the typed
// builder recurses past TS's depth limit when it is mixed with the typed tables in one file.
const db = supabase as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

const MONO = '"IBM Plex Mono", ui-monospace, monospace';

export function OnStrategyPin({
  companyId,
  setOptions,
  viewedSetKey,
}: {
  companyId?: string;
  setOptions: { key: string; title: string }[];
  viewedSetKey: string | null;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["on-strategy-pin", companyId];

  const { data } = useQuery({
    queryKey,
    enabled: Boolean(companyId) && setOptions.length > 1,
    staleTime: 30_000,
    queryFn: async (): Promise<{ pinnedKey: string | null; clearedStale: boolean }> => {
      if (!companyId) return { pinnedKey: null, clearedStale: false };
      // The real operator choice ONLY — never a heuristic. An un-chosen set must not claim to be
      // on strategy. (resolve_primary_job_step_set, which used to answer with a guess, is dropped.)
      const pinRes = await db.from("operator_primary_selection")
        .select("item_key").eq("company_id", companyId).eq("domain", "job_step_set").maybeSingle();
      const pinned = (pinRes as { data?: { item_key?: unknown } | null }).data?.item_key;
      const key = typeof pinned === "string" ? pinned : null;
      // Gate E1 — a pin naming a set that no longer exists is CLEARED with an audit row, and the
      // operator is told once. Edgewood carried an invalid pin for six weeks because nothing did this.
      if (key && !setOptions.some((j) => j.key === key)) {
        await clearStalePin(companyId, key, await currentActor());
        return { pinnedKey: null, clearedStale: true };
      }
      return { pinnedKey: key, clearedStale: false };
    },
  });

  // Gate 5b (ruling g): the cleared-stale note PERSISTS until the operator's next choice. It used to
  // ride the query result, which refetches at 30s and returns clearedStale:false once the pin is
  // gone — so the note lasted ~30 seconds and the operator's screenshot missed it. Component state
  // latches it; pinFocused() is the only thing that clears it.
  const [clearedStale, setClearedStale] = useState(false);
  useEffect(() => { if (data?.clearedStale) setClearedStale(true); }, [data?.clearedStale]);

  // Single-set companies: nothing to choose — same hide rule as the journey toggle.
  if (!companyId || setOptions.length <= 1) return null;

  const pinnedKey = data?.pinnedKey ?? null;
  // The chosen set drives the chip via the shared rule (choice wins only if its
  // set still exists); otherwise no set is on strategy yet.
  const chosenKey = resolveChosenSet(pinnedKey, setOptions.map((j) => j.key)).chosenKey;
  const titleOf = (k: string | null) => setOptions.find((j) => j.key === k)?.title ?? k ?? "—";
  const focusIsOnStrategy = viewedSetKey != null && chosenKey === viewedSetKey;

  async function pinFocused() {
    if (!companyId || !viewedSetKey) return;
    // Gate E1 — a choice is a decision moment, and it is RECORDED: who made it, and an audit row.
    // chosen_by was NULL on every pin in the fleet before this; nothing could say who chose what.
    const actor = await currentActor();
    await db.from("operator_primary_selection").upsert(
      {
        company_id: companyId,
        domain: "job_step_set",
        item_key: viewedSetKey,
        item_id: null,
        chosen_by: actor,
        chosen_at: new Date().toISOString(),
      },
      { onConflict: "company_id,domain" },
    );
    await db.from("operator_primary_selection_audit").insert({
      company_id: companyId, domain: "job_step_set", item_key: viewedSetKey, action: "set", actor, reason: null,
    });
    setClearedStale(false);
    await queryClient.invalidateQueries({ queryKey });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "#8a7560", whiteSpace: "nowrap" }}>
        {ON_STRATEGY_LABEL}: <strong style={{ color: "#233c4b" }}>{chosenKey ? titleOf(chosenKey) : "not yet chosen"}</strong>
        {clearedStale ? <span data-testid="pin-cleared-note" style={{ marginLeft: 8, color: "#8a7560", textTransform: "none", letterSpacing: 0 }}>{PIN_CLEARED_STALE_NOTE}</span> : null}
      </span>
      {viewedSetKey && !focusIsOnStrategy && (
        <button
          type="button"
          onClick={pinFocused}
          style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.07em", color: "#c47a1c", background: "none", border: "1px solid #e3d3b8", borderRadius: 4, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
        >
          Choose this as the on-strategy set
        </button>
      )}
      {viewedSetKey && focusIsOnStrategy && (
        <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.07em", color: "#4a8f7f", whiteSpace: "nowrap" }}>
          ✓ {ON_STRATEGY_LABEL}
        </span>
      )}
    </div>
  );
}
