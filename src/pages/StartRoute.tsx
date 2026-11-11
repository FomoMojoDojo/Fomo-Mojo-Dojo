// /start — THE ONE PLACE THAT DECIDES WHERE A SIGNED-IN ACCOUNT GOES (U6 part 1, 2026-11-11).
//
// Every sign-in lands here and is redirected. Before this route there was no such place: Login sent
// everyone to the Front Door, AdminGuard refused the non-admins who arrived, and "/" answered with
// a stand-in company. Three components each held a piece of the answer and none of them asked what
// the account actually holds.
//
// IT RENDERS NOTHING OF ITS OWN except the two cases that have no destination — S-U6-1 (assigned to
// nothing) and S-U6-6 (their company, nothing opened yet). Both are honest ends, not errors, which
// is why they are shown here rather than redirected somewhere that would look empty.
//
// REPLACE, NOT PUSH. The redirect uses `replace` so Back from a member's landing goes to wherever
// they came from, not to /start, which would resolve again and bounce them forward — a trap that
// looks like a broken Back button.
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { carriedNextFrom, loginPathFor } from "@/lib/authRedirect";
import { fetchDiagnoseRunning } from "@/lib/diagnoseRunning";
import { fetchFirstReadReady } from "@/lib/landing/firstReadReady";
import { resolveLanding, type LandingDecision } from "@/lib/landing/landingResolver";
import { MemberNoticePanel, NoCompanyNotice, NotReadyNotice } from "@/components/MemberCompanyGate";
import { LANDING_STRINGS } from "@/lib/landing/landingStrings";

export default function StartRoute() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { companies, loading: companiesLoading, fetchError } = useCompany();
  const location = useLocation();
  const [decision, setDecision] = useState<LandingDecision | null>(null);
  const [probeFailed, setProbeFailed] = useState(false);

  const carriedNext = carriedNextFrom(location.search);
  const ids = companies.map((company) => company.id).join(",");

  useEffect(() => {
    // An admin's answer needs no reads at all, and a caller with no companies has no ids to ask
    // about — resolve both synchronously rather than waiting on a query whose result cannot matter.
    if (authLoading || companiesLoading || !user || fetchError) return;
    let cancelled = false;
    const companyIds = ids ? ids.split(",") : [];

    if (isAdmin || companyIds.length === 0) {
      setDecision(resolveLanding({ isAdmin, companies, diagnoseRunning: new Set(), firstReadReady: new Set(), carriedNext }));
      return;
    }

    (async () => {
      try {
        const [diagnoseRunning, firstReadReady] = await Promise.all([
          fetchDiagnoseRunning(companyIds),
          fetchFirstReadReady(companyIds),
        ]);
        if (cancelled) return;
        setDecision(resolveLanding({ isAdmin, companies, diagnoseRunning, firstReadReady, carriedNext }));
      } catch {
        // U6-54: the landing is a read, and a failed read is a failure. Guessing First Read here
        // would send a member to a page that may be empty for a reason nobody can see.
        if (!cancelled) setProbeFailed(true);
      }
    })();
    return () => { cancelled = true; };
    // `ids` stands in for `companies` so a refetch returning the same list does not re-run the probe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, companiesLoading, user, isAdmin, ids, carriedNext, fetchError]);

  if (authLoading) return null;
  if (!user) return <Navigate to={loginPathFor(null)} replace />;
  if (companiesLoading) return null;

  if (fetchError || probeFailed) {
    return (
      <MemberNoticePanel testId="notice-read-failed" line={LANDING_STRINGS.readFailed} />
    );
  }

  if (!decision) return null;
  if (decision.kind === "no_company") return <NoCompanyNotice />;
  if (decision.kind === "not_ready") return <NotReadyNotice organization={decision.organization} />;
  return <Navigate to={decision.path} replace />;
}
