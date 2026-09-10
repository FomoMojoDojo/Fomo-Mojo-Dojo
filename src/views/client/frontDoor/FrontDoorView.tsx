// FRONT DOOR (2026-09-09) — the post-login landing at /preview/client-refine.
//
// WHAT IT IS. The companies inventory, drawn on the First Read ground (paper/slate/lime, Space
// Grotesk / JetBrains Mono). The former landing — the MojoMap home — moved to
// /preview/client-refine/home and every "Home" nav link points there; this page is reached by
// "All companies".
//
// READ-ONLY INVENTORY LAW. Nothing here starts a baseline, a fill or a read. The table is mounted in
// the "frontDoor" variant, which renders no action column at all: an action that cannot be taken
// should not be drawn. The only click that leaves a trace is a row click, and all it does is set the
// active company before handing off to that company's First Read.
//
// NO ACTIVE-COMPANY DEPENDENCE. The rows come from the inventory query alone (`fetchCompaniesInventory
// Result`), never from useCompany's list — so the page renders the same whether or not a company is
// selected, and rendering it selects nothing. useCompany is consulted for `setActiveCompanyId` only,
// which is called on click and never on load.
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { InventoryTable } from "@/components/admin/InventoryTable";
import {
  fetchCompaniesInventoryResult,
  type CompanyInventoryRow,
} from "@/lib/admin/companiesInventory";
import { useCompany } from "@/hooks/useCompany";
import { clientRefineFirstReadPath } from "@/lib/clientRefinePreview";
import "../firstReadPreview/firstRead.css";

/** The legacy door. Explicit, not via "/" — the bare path now lands back here. */
export const LEGACY_SITE_ROUTE = "/admin/companies";

export default function FrontDoorView() {
  const navigate = useNavigate();
  // `setActiveCompanyId` only. The companies list and the active company are deliberately not read:
  // the front door is not an active-company surface.
  const { setActiveCompanyId } = useCompany();

  const [rows, setRows] = useState<CompanyInventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchCompaniesInventoryResult()
      .then((res) => {
        if (cancelled) return;
        // A failed query renders the banner over an EMPTY table. It never falls back to a default
        // company, and it never writes one: an empty read is not a selection.
        setLoadFailed(res.error !== null);
        setRows(res.error !== null ? [] : res.rows);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[front-door] inventory fetch failed:", err);
        setLoadFailed(true);
        setRows([]);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const inventory = new Map(rows.map((r) => [r.id, r]));
  const count = rows.length;

  return (
    <div className="first-read fr-front-door-page">
      <header className="fr-shell-header">
        <div className="fr-shell-header-inner">
          <div className="fr-shell-id fr-mono">
            <span className="fr-shell-title">All companies</span>
            {/* The identity slot carries the count, in the wording the old page's footer already
                used — the First Read header's "{company} · {host}" has no meaning on a fleet page. */}
            <span className="fr-shell-identity" data-testid="front-door-count">
              {count} compan{count === 1 ? "y" : "ies"}
            </span>
          </div>
          <div className="fr-shell-progress">
            {/* The right-hand slot is where First Read puts its counter; here it is the legacy door. */}
            <Link to={LEGACY_SITE_ROUTE} className="fr-shell-link fr-mono" data-testid="legacy-door">
              Legacy site
            </Link>
          </div>
        </div>
      </header>

      <div className="first-read-shell">
        <div className="fr-beat">
          {loadFailed ? (
            <p className="fr-front-door-banner fr-mono" data-testid="front-door-banner">
              Couldn't load companies — try reloading.
            </p>
          ) : null}

          <InventoryTable
            variant="frontDoor"
            companies={rows}
            inventory={inventory}
            inventoryLoading={loading}
            // Never highlights a row: this page does not read the active company.
            activeCompanyId={null}
            runLocksByCompany={{}}
            userId={null}
            labelForUser={(id) => id}
            busyIds={{ researchingId: null, baselineId: null, comboId: null }}
            onSelect={() => {}}
            onCancelLock={() => {}}
            onRowClick={(id) => {
              setActiveCompanyId(id);
              navigate(clientRefineFirstReadPath(id));
            }}
          />
        </div>
      </div>
    </div>
  );
}
