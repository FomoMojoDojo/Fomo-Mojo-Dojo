// FOCUS MARKET PANEL (F-1, 2026-11-17) — admin only, on /admin/companies/:id. Every live market of the
// company is offered (decision 3), with the evidence counts the system ranks it by. The operator picks
// one or more, orders them, and signs; the signature is public.sign_focus_markets (one write path,
// audited). Nothing here writes on open.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FOCUS_STRINGS, MAX_FOCUS_MARKETS, fetchFocusMarketOptions, fetchPendingFocusProposal, moveInOrder, proposeFocusMarkets,
  proposedIds, signFocusMarkets, signedFromOptions, type FocusMarketOption, type FocusProposal,
} from "@/lib/focusMarkets";

const c = { panel: "#FFFFFF", line: "#DDE6D1", ink: "#233C4B", muted: "#6E847F", soft: "#F7F6F2", good: "#285f53" };

export default function FocusMarketPanel({ companyId }: { companyId: string }) {
  const [options, setOptions] = useState<FocusMarketOption[] | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [proposal, setProposal] = useState<FocusProposal | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, prop] = await Promise.all([fetchFocusMarketOptions(companyId), fetchPendingFocusProposal(companyId)]);
      setOptions(rows);
      setProposal(prop);
      const signed = signedFromOptions(rows).map((r) => r.market_definition_id);
      // F-2: with nothing signed, the system's proposal is the starting order — the operator still signs it
      setOrder(signed.length > 0 ? signed : proposedIds(prop));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [companyId]);
  useEffect(() => { void load(); }, [load]);

  const byId = useMemo(() => new Map((options ?? []).map((o) => [o.market_definition_id, o])), [options]);
  const signedIds = useMemo(() => signedFromOptions(options ?? []).map((o) => o.market_definition_id), [options]);
  const changed = order.join(",") !== signedIds.join(",") || (proposal !== null && order.length > 0);

  const toggle = (id: string) =>
    setOrder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_FOCUS_MARKETS ? prev : [...prev, id]));

  const propose = async () => {
    try { await proposeFocusMarkets(companyId); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const sign = async () => {
    setSigning(true);
    try {
      await signFocusMarkets(companyId, order);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigning(false);
    }
  };

  return (
    <section data-testid="focus-market-panel" className="mt-6 rounded-xl border p-5" style={{ background: c.panel, borderColor: c.line }}>
      <h2 className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: c.ink }}>{FOCUS_STRINGS.title}</h2>
      {error ? <p className="mt-2 text-[12px]" style={{ color: "#a12318" }} data-testid="focus-market-error">{error}</p> : null}
      {proposal ? <p className="mt-2 text-[12px]" style={{ color: c.muted }} data-testid="focus-market-proposed">{FOCUS_STRINGS.proposedFrom(proposal.evidence_total)}</p> : null}
      {options === null ? null : (
        <>
          {order.length > 0 ? (
            <ol className="mt-3 space-y-1" data-testid="focus-market-order">
              {order.map((id, i) => {
                const o = byId.get(id);
                return (
                  <li key={id} className="flex items-center gap-2 text-[13px]" style={{ color: c.ink }}>
                    <span className="font-mono text-[11px]" style={{ color: c.muted }}>{i + 1}.</span>
                    <span>{o?.job_executor ?? o?.journey_key ?? id}</span>
                    <button type="button" aria-label="up" className="px-1 text-[11px]" onClick={() => setOrder((p) => moveInOrder(p, id, -1))}>↑</button>
                    <button type="button" aria-label="down" className="px-1 text-[11px]" onClick={() => setOrder((p) => moveInOrder(p, id, 1))}>↓</button>
                  </li>
                );
              })}
            </ol>
          ) : null}
          <table className="mt-3 w-full text-left text-[12px]" data-testid="focus-market-options">
            <thead style={{ color: c.muted }}>
              <tr><th /><th>Market</th><th>Needs</th><th>Job steps</th><th>Outcomes</th></tr>
            </thead>
            <tbody>
              {options.map((o) => (
                <tr key={o.market_definition_id} className="border-t" style={{ borderColor: c.line }} data-testid="focus-market-option">
                  <td className="py-1 pr-2">
                    <input type="checkbox" checked={order.includes(o.market_definition_id)} onChange={() => toggle(o.market_definition_id)} aria-label={o.job_executor ?? o.journey_key} />
                  </td>
                  <td className="py-1 pr-2" style={{ color: c.ink }}>
                    {o.job_executor ?? o.journey_key}
                    <span className="ml-2 font-mono text-[10px]" style={{ color: c.muted }}>{[o.relationship_kind, o.market_register].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td>{o.needs}</td><td>{o.job_steps}</td><td>{o.outcomes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" data-testid="focus-market-propose"
            className="mr-2 mt-3 rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em]"
            style={{ borderColor: c.line, color: c.muted }} onClick={() => void propose()}>
            Propose
          </button>
          <button type="button" data-testid="focus-market-sign" disabled={!changed || signing}
            className="mt-3 rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] disabled:opacity-50"
            style={{ borderColor: c.ink, color: c.ink }} onClick={() => void sign()}>
            Sign
          </button>
        </>
      )}
    </section>
  );
}
