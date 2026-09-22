// First-read marks — the ONE reader/writer of the mark store (FM13 option A; the census keeps it here).
// Reads the company's LIVE marks (withdrawn_at NULL) with each mark's latest note version; writes only through
// the three RPCs (the actor is auth.uid() on the server; nothing about the actor leaves the browser). Every read
// is defensive: a client without `.from` (the vitest stubs of the view) yields no marks and no error.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WITHDRAW_REASON } from "./strings";
import type { AnchorKind } from "./anchors";

export type MarkKind = "client_reaction" | "our_mark";
export type MarkDisposition = "interesting" | "important" | "not_important";
export type LiveMark = {
  id: string;
  company_id: string;
  kind: MarkKind;
  beat_key: string;
  anchor_kind: AnchorKind;
  anchor_key: string;
  anchor_text: string;
  anchor_text_sha256: string;
  created_at: string;
  /** The latest note version (the current text and disposition). A version with no note reads as "". */
  version: number;
  note: string;
  disposition: MarkDisposition | null;
};
export type MarkWrite = { ok: true } | { ok: false; error: string };

// deno-lint-ignore no-explicit-any
type Loose = { from?: (t: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }> };
const client = () => supabase as unknown as Loose;

export const anchorId = (kind: string, key: string) => `${kind}|${key}`;
/** FM5: the note is optional — the client stores NULL for an empty one (the store refuses a blank string). */
export const emptyToNull = (note: string | null | undefined): string | null => { const t = (note ?? "").trim(); return t.length ? t : null; };

async function readLiveMarks(companyId: string): Promise<{ marks: LiveMark[]; frozen: boolean }> {
  const c = client();
  if (typeof c.from !== "function") return { marks: [], frozen: false };
  try {
    const [{ data: co }, { data: rows }] = await Promise.all([
      c.from("companies").select("frozen").eq("id", companyId).maybeSingle(),
      c.from("first_read_marks").select("id, company_id, kind, beat_key, anchor_kind, anchor_key, anchor_text, anchor_text_sha256, created_at").eq("company_id", companyId).is("withdrawn_at", null).order("created_at", { ascending: true }),
    ]);
    const marks = (Array.isArray(rows) ? rows : []) as Array<Omit<LiveMark, "version" | "note" | "disposition">>;
    if (marks.length === 0) return { marks: [], frozen: Boolean((co as { frozen?: boolean } | null)?.frozen) };
    const { data: notes } = await c.from("first_read_mark_notes").select("mark_id, version, note, disposition").in("mark_id", marks.map((m) => m.id)).order("version", { ascending: false });
    const latest = new Map<string, { version: number; note: string; disposition: MarkDisposition | null }>();
    for (const n of (Array.isArray(notes) ? notes : []) as Array<{ mark_id: string; version: number; note: string | null; disposition: MarkDisposition | null }>) {
      if (!latest.has(n.mark_id)) latest.set(n.mark_id, { version: n.version, note: n.note ?? "", disposition: n.disposition ?? null });
    }
    return {
      frozen: Boolean((co as { frozen?: boolean } | null)?.frozen),
      marks: marks.map((m) => ({ ...m, version: latest.get(m.id)?.version ?? 1, note: latest.get(m.id)?.note ?? "", disposition: latest.get(m.id)?.disposition ?? null })),
    };
  } catch {
    return { marks: [], frozen: false };
  }
}

const rpcError = (e: { message?: string; code?: string } | null | undefined) => String(e?.message ?? e?.code ?? "save_failed");

export function useFirstReadMarks(companyId?: string | null) {
  const [marks, setMarks] = useState<LiveMark[]>([]);
  const [frozen, setFrozen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!companyId) { setMarks([]); setFrozen(false); setLoaded(true); return; }
    let cancelled = false;
    (async () => {
      const r = await readLiveMarks(companyId);
      if (cancelled || !alive.current) return;
      setMarks(r.marks); setFrozen(r.frozen); setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [companyId, tick]);
  const refetch = useCallback(() => setTick((k) => k + 1), []);
  /** Live marks by anchor: up to one of each kind. */
  const byAnchor = useMemo(() => {
    const m = new Map<string, LiveMark[]>();
    for (const mk of marks) { const k = anchorId(mk.anchor_kind, mk.anchor_key); m.set(k, [...(m.get(k) ?? []), mk]); }
    return m;
  }, [marks]);

  const create = useCallback(async (args: { beatKey: string; anchor: { anchor_kind: AnchorKind; anchor_key: string; anchor_text: string; sha: string }; kind: MarkKind; disposition: MarkDisposition | null; note: string | null }): Promise<MarkWrite> => {
    const c = client();
    if (!companyId || typeof c.rpc !== "function") return { ok: false, error: "no_client" };
    const { error } = await c.rpc("create_first_read_mark", { p_company_id: companyId, p_kind: args.kind, p_disposition: args.disposition, p_beat_key: args.beatKey, p_anchor_kind: args.anchor.anchor_kind, p_anchor_key: args.anchor.anchor_key, p_anchor_text: args.anchor.anchor_text, p_anchor_text_sha256: args.anchor.sha, p_note: emptyToNull(args.note) });
    if (error) return { ok: false, error: rpcError(error) };
    refetch();
    return { ok: true };
  }, [companyId, refetch]);
  const append = useCallback(async (markId: string, note: string | null, disposition: MarkDisposition | null): Promise<MarkWrite> => {
    const c = client();
    if (typeof c.rpc !== "function") return { ok: false, error: "no_client" };
    const { error } = await c.rpc("append_first_read_mark_note", { p_mark_id: markId, p_note: emptyToNull(note), p_disposition: disposition });
    if (error) return { ok: false, error: rpcError(error) };
    refetch();
    return { ok: true };
  }, [refetch]);
  const withdraw = useCallback(async (markId: string): Promise<MarkWrite> => {
    const c = client();
    if (typeof c.rpc !== "function") return { ok: false, error: "no_client" };
    const { error } = await c.rpc("withdraw_first_read_mark", { p_mark_id: markId, p_reason: WITHDRAW_REASON });
    if (error) return { ok: false, error: rpcError(error) };
    refetch();
    return { ok: true };
  }, [refetch]);

  return { marks, byAnchor, frozen, loaded, refetch, create, append, withdraw };
}
