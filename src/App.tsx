import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider, useCompany } from "@/hooks/useCompany";
import { PresentationModeProvider, usePresentationMode } from "@/hooks/usePresentationMode";
import AdminGuard from "@/components/AdminGuard";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import MapView from "./views/MapView";
import InputsView from "./views/Inputs";
import JobStepsView from "./views/JobSteps";
import StrategyView from "./views/Strategy";
import OpportunitiesView from "./views/Opportunities";
import PositioningView from "./views/Positioning";
import AnalyticsView from "./views/Analytics";
import RoutesView from "./views/Routes";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import AdminCompanies from "./pages/AdminCompanies";
import AdminCompanyDetail from "./pages/AdminCompanyDetail";
import AdminCompanyFiles from "./pages/AdminCompanyFiles";
import AdminPageEditor from "./pages/AdminPageEditor";
import MethodologyPage from "./pages/MethodologyPage";
import MojoMapPage from "./pages/MojoMapPage";
import ResetPassword from "./pages/ResetPassword";
import FilesRepository from "./pages/FilesRepository";
import NotFound from "./pages/NotFound";
import MapSignalPrototype from "./pages/MapSignalPrototype";
import ClientOnboardingMojoMap from "./pages/ClientOnboardingMojoMap";
import ClientOnboardingMojoMapEditor from "./pages/ClientOnboardingMojoMapEditor";
import ClientViewVisibilityAuditPage from "./pages/ClientViewVisibilityAudit";
import ClientDecisionSystemView from "./views/client/ClientDecisionSystemView";
import type { ClientSystemPhase } from "./hooks/useClientMapInteractionState";
import { dispatchClientPhaseChange, writeStoredClientPhase } from "./hooks/useClientMapInteractionState";
import { isClientPhasePath } from "./lib/clientPhaseRoutes";
import { CLIENT_VIEW_VISIBILITY_AUDIT_ROUTE } from "./lib/clientViewVisibilityAudit";
import {
  CLIENT_ONBOARDING_MOJOMAP_EDITOR_ROUTE,
  CLIENT_ONBOARDING_MOJOMAP_ROUTE,
} from "./lib/clientOnboardingMojoMapConfig";

const queryClient = new QueryClient();

function InternalViewOnlyRoute({ children }: { children: JSX.Element }) {
  const { mode } = usePresentationMode();
  if (mode === "client") return <Navigate to="/" replace />;
  return children;
}

function ModeAwareMapRoute() {
  const { mode } = usePresentationMode();
  return mode === "client" ? <ClientDecisionSystemView /> : <MapView />;
}

function ClientModePathSync() {
  const { mode } = usePresentationMode();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (mode !== "client") return;
    if (isClientPhasePath(location.pathname)) return;
    // Client mode is a single-page experience; always route to root.
    navigate("/", { replace: true });
  }, [location.pathname, mode, navigate]);

  return null;
}

function ClientPhaseAliasRoute({
  phase,
  fallbackPath,
}: {
  phase: ClientSystemPhase;
  fallbackPath: string;
}) {
  const { mode } = usePresentationMode();
  const { activeCompany, loading } = useCompany();
  const navigate = useNavigate();

  useEffect(() => {
    if (mode !== "client" || loading) return;
    writeStoredClientPhase(activeCompany?.id, phase);
    dispatchClientPhaseChange(activeCompany?.id, phase);
    navigate("/", { replace: true });
  }, [activeCompany?.id, loading, mode, navigate, phase]);

  if (mode !== "client") return <Navigate to={fallbackPath} replace />;
  return null;
}

function ModeAwareFocusRoute() {
  const { mode } = usePresentationMode();
  return mode === "client" ? <Navigate to="/" replace /> : <OpportunitiesView />;
}

function ModeAwareScoreRoute() {
  const { mode } = usePresentationMode();
  return mode === "client" ? <Navigate to="/" replace /> : <AnalyticsView />;
}

function ModeAwareStrategyRoute() {
  const { mode } = usePresentationMode();
  return mode === "client" ? <Navigate to="/" replace /> : <StrategyView />;
}

function AdminModeRoute({ children }: { children: JSX.Element }) {
  const { mode } = usePresentationMode();
  if (mode === "client") return <Navigate to="/" replace />;
  return <AdminGuard>{children}</AdminGuard>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppErrorBoundary>
          <AuthProvider>
            <PresentationModeProvider>
              <CompanyProvider>
                <ClientModePathSync />
                <Routes>
                <Route path="/" element={<ModeAwareMapRoute />} />
                <Route path="/foundation" element={<ClientPhaseAliasRoute phase="outside" fallbackPath="/" />} />
                <Route path="/diagnosis" element={<ClientPhaseAliasRoute phase="diagnosis" fallbackPath="/" />} />
                <Route path="/decision" element={<ClientPhaseAliasRoute phase="focus" fallbackPath="/strategy" />} />
                <Route path="/execution" element={<ClientPhaseAliasRoute phase="execution" fallbackPath="/opportunities" />} />
                <Route path="/learning" element={<ClientPhaseAliasRoute phase="execution" fallbackPath="/analytics" />} />
                <Route path="/inputs" element={<InternalViewOnlyRoute><InputsView /></InternalViewOnlyRoute>} />
                <Route path="/files" element={<InternalViewOnlyRoute><FilesRepository /></InternalViewOnlyRoute>} />
                <Route path="/job-steps" element={<InternalViewOnlyRoute><JobStepsView /></InternalViewOnlyRoute>} />
                <Route path="/strategy" element={<ModeAwareStrategyRoute />} />
                <Route path="/opportunities" element={<ModeAwareFocusRoute />} />
                <Route path="/positioning" element={<InternalViewOnlyRoute><PositioningView /></InternalViewOnlyRoute>} />
                <Route path="/analytics" element={<ModeAwareScoreRoute />} />
                <Route path="/routes" element={<InternalViewOnlyRoute><RoutesView /></InternalViewOnlyRoute>} />
                <Route path="/login" element={<Login />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/admin" element={<AdminModeRoute><AdminDashboard /></AdminModeRoute>} />
                <Route path="/admin/companies" element={<AdminModeRoute><AdminCompanies /></AdminModeRoute>} />
                <Route path="/admin/companies/:companyId" element={<AdminModeRoute><AdminCompanyDetail /></AdminModeRoute>} />
                <Route path="/admin/companies/:companyId/files" element={<AdminModeRoute><AdminCompanyFiles /></AdminModeRoute>} />
                <Route path="/admin/new" element={<AdminModeRoute><AdminPageEditor /></AdminModeRoute>} />
                <Route path="/admin/edit/:id" element={<AdminModeRoute><AdminPageEditor /></AdminModeRoute>} />
                <Route path="/process/:slug" element={<InternalViewOnlyRoute><MethodologyPage /></InternalViewOnlyRoute>} />
                <Route path="/process/mojomap" element={<InternalViewOnlyRoute><MojoMapPage /></InternalViewOnlyRoute>} />
                <Route path={CLIENT_ONBOARDING_MOJOMAP_ROUTE} element={<AdminGuard><ClientOnboardingMojoMap /></AdminGuard>} />
                <Route path={CLIENT_ONBOARDING_MOJOMAP_EDITOR_ROUTE} element={<AdminGuard><ClientOnboardingMojoMapEditor /></AdminGuard>} />
                <Route
                  path={CLIENT_VIEW_VISIBILITY_AUDIT_ROUTE}
                  element={
                    <AdminModeRoute>
                      <InternalViewOnlyRoute>
                        <ClientViewVisibilityAuditPage />
                      </InternalViewOnlyRoute>
                    </AdminModeRoute>
                  }
                />
                <Route path="/map-signal-prototype" element={<InternalViewOnlyRoute><MapSignalPrototype /></InternalViewOnlyRoute>} />
                <Route path="*" element={<NotFound />} />
                </Routes>
              </CompanyProvider>
            </PresentationModeProvider>
          </AuthProvider>
        </AppErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
