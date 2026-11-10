// DIAGNOSE FLOW — the shell for /preview/client-refine/diagnose/:companyId/*.
//
// ONE READ, ELEVEN SCREENS. useDiagnoseData runs once here and every screen renders from it, so
// moving through the walk re-reads nothing and the screens stay pure.
//
// THE OPERATOR LAW (WorkspaceShell's, not the home's): the default render carries ZERO
// [data-fr-operator] nodes. This root deliberately does NOT carry a data-fr-operator attribute —
// the home does, which is why the home can never have zero. Operator affordances read
// OperatorControlsContext, which is null unless the glyph is on, so they are structurally absent by
// default rather than hidden by CSS.
//
// NO WRITE PATH. The only state is the page-state reducer in walk.tsx, and the only network calls
// are the SELECTs in useDiagnoseData. This route can therefore never reach evaluate-*, propose-*,
// refresh-*, assess-surface-drift or council-review.
import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { routeCompanyToActivate } from "@/lib/clientRefinePreview";
import { OperatorControlsContext, OperatorSwitch, type OperatorControls } from "@/views/client/firstReadPreview/operatorControls";
import "@/views/client/firstReadPreview/firstRead.css";
import "./diagnose.css";
import { PageStateProvider } from "./walk";
import { useDiagnoseData } from "./useDiagnoseData";
import { SendScreen } from "./screens/Send";
import { WelcomeScreen } from "./screens/Welcome";
import { W1Screen, W2Screen, W4Screen, W5Screen, W6Screen, W7Screen, W8Screen, W9Screen } from "./screens/gather";
import { HomeScreen } from "./home/Home";

export function DiagnoseFlowView() {
  const { companyId } = useParams<{ companyId: string }>();
  const { companies, activeCompany, setActiveCompanyId } = useCompany();

  // Same activation the First Read does for its own :companyId (FirstReadPreviewView:110).
  useEffect(() => {
    const next = routeCompanyToActivate({
      routeCompanyId: companyId,
      activeCompanyId: activeCompany?.id,
      knownCompanyIds: companies.map((c) => c.id),
    });
    if (next) setActiveCompanyId(next);
  }, [companyId, companies, activeCompany?.id, setActiveCompanyId]);

  const routeCompany = useMemo(
    () => companies.find((c) => c.id === companyId) ?? null,
    [companies, companyId],
  );
  const data = useDiagnoseData(companyId, routeCompany?.name ?? null);

  const [operatorOn, setOperatorOn] = useState(false);
  const operatorControls = useMemo<OperatorControls | null>(
    // Slice 1 has no operator WRITE — decide() is inert. The context's only job here is to admit the
    // operator-only nodes (the NULL-role market flag), which is what the glyph switch gates.
    () => (operatorOn ? { decide: async () => {} } : null),
    [operatorOn],
  );

  if (!companyId) return null;
  const props = { data, companyId };

  return (
    <OperatorControlsContext.Provider value={operatorControls}>
      <PageStateProvider>
        <div className="first-read">
          <Routes>
            <Route index element={<Navigate to="home" replace />} />
            <Route path="send" element={<SendScreen {...props} />} />
            <Route path="welcome" element={<WelcomeScreen {...props} />} />
            <Route path="w1" element={<W1Screen {...props} />} />
            <Route path="w2" element={<W2Screen {...props} />} />
            <Route path="w4" element={<W4Screen {...props} />} />
            <Route path="w5" element={<W5Screen {...props} />} />
            <Route path="w6" element={<W6Screen {...props} />} />
            <Route path="w7" element={<W7Screen {...props} />} />
            <Route path="w8" element={<W8Screen {...props} />} />
            <Route path="w9" element={<W9Screen {...props} />} />
            <Route path="home" element={<HomeScreen {...props} />} />
            <Route path="*" element={<Navigate to="home" replace />} />
          </Routes>
          <OperatorSwitch on={operatorOn} onToggle={() => setOperatorOn((v) => !v)} />
        </div>
      </PageStateProvider>
    </OperatorControlsContext.Provider>
  );
}

export default DiagnoseFlowView;
