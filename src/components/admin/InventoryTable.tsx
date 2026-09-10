// ADMIN COMPANIES — the inventory table (Gate 1, 2026-09-10).
//
// READ-ONLY INVENTORY. /preview/client-refine/* is the only operator surface, so nothing here starts
// a baseline, a fill or a read. The page reports; acting stays where acting lives.
//
// FROZEN ROWS ARE PROTECTED. `companies.frozen` (plus the enforce_company_freeze trigger) is the DB
// authority. Until now this page did not even select the column, so CB1 rendered like any other row
// with a live Delete — a click the trigger would refuse and the UI would surface as a raw error.
import { useState } from "react";
import { Link } from "react-router-dom";
import type { Company } from "@/hooks/useCompany";
import type { CompanyInventoryRow } from "@/lib/admin/companiesInventory";
import { formatScoreDelta, scoreDeltaTone } from "@/lib/mojoScore/delta";

// The page palette (AdminCompanies.tsx:122) — this shell is DARK. A light-theme palette here renders
// the company name and the fill status as near-black on near-black, i.e. invisible.
const c = {
  charcoal: "#eef4ff", secondary: "#c1cceb", muted: "#95a6d3",
  line: "rgba(136, 163, 218, 0.24)", teal: "#34d2be", red: "#ff8c4b", amber: "#ffca7b",
  frozenBg: "rgba(255,255,255,0.03)", frozenText: "#7c8bb5",
  // Δ tones — the signed palette: lime up, electric down, ink flat.
  lime: "#9cbe6e", electric: "#e8358b",
};

function relative(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "never";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export type InventoryTableProps = {
  companies: Company[];
  inventory: Map<string, CompanyInventoryRow>;
  inventoryLoading: boolean;
  activeCompanyId: string | null;
  runLocksByCompany: Record<string, { operation: string; started_by: string } | undefined>;
  userId: string | null;
  labelForUser: (id: string) => string;
  busyIds: { researchingId: string | null; baselineId: string | null; comboId: string | null };
  onSelect: (id: string) => void;
  onCancelLock: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onOpenReview: (id: string) => void;
  navigate: (to: string) => void;
};

export function InventoryTable(props: InventoryTableProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" data-testid="inventory-table">
        <thead>
          <tr className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
            <th className="text-left py-2 pr-3">Company</th>
            <th className="text-left py-2 pr-3">Mojo Score</th>
            <th className="text-left py-2 pr-3">Δ since last run</th>
            <th className="text-left py-2 pr-3">Last update</th>
            <th className="text-left py-2 pr-3">Last run cost</th>
            <th className="text-left py-2 pr-3">Total cost</th>
            <th className="text-left py-2 pr-3">Fill status</th>
            <th className="text-left py-2 pr-3">State</th>
            <th className="text-right py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {props.companies.map((company) => {
            const inv = props.inventory.get(company.id) ?? null;
            // The DB column is the authority. `frozen` is now selected by useCompany; the inventory
            // row carries it too, and either saying frozen is enough to protect the row.
            const frozen = company.frozen === true || inv?.frozen === true;
            const lock = props.runLocksByCompany[company.id];
            const busy = props.busyIds.researchingId === company.id
              || props.busyIds.baselineId === company.id
              || props.busyIds.comboId === company.id
              || Boolean(lock);
            const isActive = props.activeCompanyId === company.id;
            const open = openId === company.id;
            return (
              <FragmentRow
                key={company.id}
                company={company}
                inv={inv}
                frozen={frozen}
                busy={busy}
                isActive={isActive}
                open={open}
                loading={props.inventoryLoading}
                lock={lock}
                userId={props.userId}
                labelForUser={props.labelForUser}
                onToggle={() => setOpenId(open ? null : company.id)}
                onSelect={props.onSelect}
                onCancelLock={props.onCancelLock}
                onDelete={props.onDelete}
                onOpenReview={props.onOpenReview}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow(p: {
  company: Company; inv: CompanyInventoryRow | null; frozen: boolean; busy: boolean;
  isActive: boolean; open: boolean; loading: boolean;
  lock?: { operation: string; started_by: string };
  userId: string | null; labelForUser: (id: string) => string;
  onToggle: () => void; onSelect: (id: string) => void; onCancelLock: (id: string) => void;
  onDelete: (id: string, name: string) => void; onOpenReview: (id: string) => void;
}) {
  const { company, inv, frozen } = p;
  const text = frozen ? c.frozenText : c.charcoal;
  return (
    <>
      <tr
        data-testid={`company-row-${company.id}`}
        data-frozen={frozen ? "true" : undefined}
        style={{
          borderTop: `1px solid ${c.line}`,
          background: frozen ? c.frozenBg : undefined,
          opacity: frozen ? 0.6 : 1,
        }}
      >
        <td className="py-3 pr-3 align-top">
          <button
            type="button"
            onClick={() => p.onSelect(company.id)}
            className="font-sans text-[13px] font-semibold text-left"
            style={{ color: p.isActive ? c.teal : text }}
          >
            {company.name}
          </button>
          <div className="font-mono text-[10px]" style={{ color: c.muted }}>{company.website ?? "—"}</div>
          {p.lock ? (
            <div className="font-mono text-[10px] mt-1" style={{ color: c.amber }}>
              {p.lock.operation} running · started by {p.labelForUser(p.lock.started_by)}
              {p.lock.started_by === p.userId ? (
                <button type="button" onClick={() => p.onCancelLock(company.id)} className="ml-2 underline">Cancel Run</button>
              ) : null}
            </div>
          ) : null}
        </td>

        {/* SCORE — the newest mojo_scores row, never companies.mojo_score (stale for 13 of 20). */}
        <td className="py-3 pr-3 align-top font-mono text-[12px]" style={{ color: text }} data-testid={`score-${company.id}`}>
          {p.loading ? "…" : inv?.score ? (
            <>
              {inv.score.value}
              <span className="ml-1 text-[10px]" style={{ color: c.muted }}>{inv.score.methodology}</span>
            </>
          ) : <span style={{ color: c.muted }}>—</span>}
        </td>

        {/* Δ — the newest score minus the previous row OF THE SAME METHODOLOGY. A single-row
            methodology has nothing to compare against, so it renders an em dash, never a 0. */}
        <td
          className="py-3 pr-3 align-top font-mono text-[12px]"
          data-testid={`delta-${company.id}`}
          data-tone={scoreDeltaTone(inv?.delta ?? null)}
          title={inv?.delta ? `vs ${inv.delta.previous} on ${new Date(inv.delta.previousAt).toISOString().slice(0, 10)}` : undefined}
          style={{
            color: inv?.delta
              ? (inv.delta.delta > 0 ? c.lime : inv.delta.delta < 0 ? c.electric : text)
              : c.muted,
          }}
        >
          {p.loading ? "…" : formatScoreDelta(inv?.delta ?? null)}
        </td>

        <td className="py-3 pr-3 align-top font-mono text-[11px]" style={{ color: text }} data-testid={`lastupdate-${company.id}`}>
          {p.loading ? "…" : relative(inv?.lastUpdate ?? null)}
        </td>

        {/* COST — Gate 3. "not captured yet" is the true empty; 0 would be a lie. */}
        <td className="py-3 pr-3 align-top font-mono text-[10px]" style={{ color: c.muted }} data-testid={`lastcost-${company.id}`}>
          {inv?.lastRunCost === null || inv?.lastRunCost === undefined ? "not captured yet" : `$${inv.lastRunCost}`}
        </td>
        <td className="py-3 pr-3 align-top font-mono text-[10px]" style={{ color: c.muted }} data-testid={`totalcost-${company.id}`}>
          {inv?.totalCost === null || inv?.totalCost === undefined ? "not captured yet" : `$${inv.totalCost}`}
        </td>

        {/* FILL STATUS — computed from ARTIFACTS. Ledger terminals live in the expander only. */}
        <td className="py-3 pr-3 align-top" data-testid={`fill-${company.id}`}>
          <button
            type="button"
            onClick={p.onToggle}
            className="font-mono text-[11px] underline-offset-2 hover:underline text-left"
            style={{ color: text }}
            aria-expanded={p.open}
          >
            {p.loading ? "…" : inv?.fillStatus ?? "—"}
          </button>
        </td>

        <td className="py-3 pr-3 align-top font-mono text-[10px] uppercase tracking-wide" data-testid={`state-${company.id}`}>
          {frozen ? <span style={{ color: c.frozenText }}>frozen</span> : <span style={{ color: c.teal }}>live</span>}
        </td>

        <td className="py-3 align-top text-right whitespace-nowrap">
          <Link to={`/admin/companies/${company.id}`} className="font-mono text-[10px] uppercase tracking-wide mr-3" style={{ color: c.secondary }}>
            Open
          </Link>
          <Link to={`/admin/companies/${company.id}/files`} className="font-mono text-[10px] uppercase tracking-wide mr-3" style={{ color: c.secondary }}>
            Files
          </Link>
          <button
            type="button"
            onClick={() => p.onOpenReview(company.id)}
            className="font-mono text-[10px] uppercase tracking-wide mr-3"
            style={{ color: c.secondary }}
          >
            Review
          </button>
          {/* The ONLY mutating action left on this page, and it is refused for a frozen company. */}
          <button
            type="button"
            data-testid={`delete-${company.id}`}
            disabled={frozen || p.busy}
            title={frozen ? "Frozen reference company — never written" : undefined}
            onClick={() => p.onDelete(company.id, company.name)}
            className="font-mono text-[10px] uppercase tracking-wide disabled:cursor-not-allowed"
            style={{ color: frozen || p.busy ? c.muted : c.red, opacity: frozen || p.busy ? 0.5 : 1 }}
          >
            Delete
          </button>
        </td>
      </tr>

      {p.open && inv ? (
        <tr style={{ background: c.frozenBg }} data-testid={`expander-${company.id}`}>
          <td colSpan={9} className="py-3 px-3 font-mono text-[10px]" style={{ color: c.secondary }}>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>baseline runs: {inv.stages.baselineRuns}</span>
              <span>own-words claims: {inv.stages.ownWordsClaims}</span>
              <span>deltas: {inv.stages.deltas} ({inv.stages.deltasStale ? `stale · ${inv.stages.deltasReason}` : "fresh"})</span>
              <span>reads current: {inv.stages.readsCurrent} of 4</span>
              <span>recurrence rows: {inv.stages.recurrenceRows}</span>
              <span>score rows: {inv.stages.scoreRows}</span>
              <span>
                {inv.delta
                  ? `Δ vs ${inv.delta.previous} on ${new Date(inv.delta.previousAt).toISOString().slice(0, 10)} (${inv.delta.methodology})`
                  : "Δ — single reading in this methodology, nothing to compare"}
              </span>
            </div>
            <div className="mt-1">
              reads —{" "}
              {inv.stages.reads.map((r) => (
                <span key={r.kind} className="mr-3">
                  {r.kind}: {r.current ? "current" : r.rejected ? `rejected${r.guard ? ` (${r.guard})` : ""}` : "missing"}
                </span>
              ))}
            </div>
            {/* SECONDARY. Ledger terminals explain history; they never decide the cell above — 12 of
                20 companies predate the chain and would read "broken" on a ledger-first status. */}
            <div className="mt-1" style={{ color: c.muted }}>
              ledger (secondary) — fr_own_words: {inv.stages.ledger.ownWordsTerminal ?? "no row"}
              {" · "}recurrence_step: {inv.stages.ledger.recurrenceTerminal ?? "no row"}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
