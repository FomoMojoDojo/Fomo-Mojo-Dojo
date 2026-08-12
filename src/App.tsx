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
import MovementView from "./views/Movement";
import FMDStrategicField from "./views/FMDStrategicField";
import FirstReadView from "./views/FirstReadView";
import IntakeView from "./views/IntakeView";
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
import LandingPage4 from "./pages/LandingPage4";
import MojoMapLanding from "./pages/MojoMapLanding";
import ClientOnboardingMojoMap from "./pages/ClientOnboardingMojoMap";
import ClientOnboardingMojoMapEditor from "./pages/ClientOnboardingMojoMapEditor";
import ClientViewVisibilityAuditPage from "./pages/ClientViewVisibilityAudit";
import ClientDecisionSystemView from "./views/client/ClientDecisionSystemView";
import ClientStoryView from "./views/client/ClientStoryView";
import ClientRefinePreviewView from "./views/client/ClientRefinePreviewView";
import ClientRefinePreviewRoutesView from "./views/client/ClientRefinePreviewRoutesView";
import ClientRefinePreviewWorkshopView from "./views/client/ClientRefinePreviewWorkshopView";
import ClientRefinePreviewPathView from "./views/client/ClientRefinePreviewPathView";
import ClientRefinePreviewMembersView from "./views/client/ClientRefinePreviewMembersView";
import ClientRefinePreviewExtractsView from "./views/client/ClientRefinePreviewExtractsView";
import ClientRefinePreviewCompanyView from "./views/client/ClientRefinePreviewCompanyView";
import DriftInboxView from "./views/client/DriftInboxView";
import type { ClientSystemPhase } from "./hooks/useClientMapInteractionState";
import { dispatchClientPhaseChange, writeStoredClientPhase } from "./hooks/useClientMapInteractionState";
import { isClientPhasePath } from "./lib/clientPhaseRoutes";
import {
  CLIENT_REFINE_PREVIEW_ROUTE,
  CLIENT_REFINE_PREVIEW_ROUTES_ROUTE,
  CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE,
  CLIENT_REFINE_PREVIEW_PATH_ROUTE,
  CLIENT_REFINE_PREVIEW_COMPANY_ROUTE,
  CLIENT_REFINE_PREVIEW_INBOX_ROUTE,
  CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE,
  CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE,
} from "./lib/clientRefinePreview";
import { CLIENT_VIEW_VISIBILITY_AUDIT_ROUTE } from "./lib/clientViewVisibilityAudit";
import { CLIENT_VIEW_ROUTE } from "./lib/clientStoryView";
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
  if (mode === "client") return <ClientDecisionSystemView />;
  return <Navigate to={CLIENT_REFINE_PREVIEW_ROUTE} replace />;
}

function ClientModePathSync() {
  const { mode } = usePresentationMode();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (mode !== "client") return;
    if (location.pathname.startsWith("/admin")) return;
    if (location.pathname === "/login" || location.pathname === "/reset-password") return;
    if (location.pathname === CLIENT_VIEW_ROUTE) return; // client story surface is standalone
    if (isClientPhasePath(location.pathname)) return;
    // Client mode is a single-page experience; always route to root.
    navigate("/", { replace: true });
  }, [location.pathname, mode, navigate]);

  return null;
}

function CrpvBootClassSync() {
  const location = useLocation();

  useEffect(() => {
    document.documentElement.classList.toggle(
      "crpv-boot",
      location.pathname === CLIENT_REFINE_PREVIEW_ROUTE ||
        location.pathname.startsWith(`${CLIENT_REFINE_PREVIEW_ROUTE}/`),
    );
  }, [location.pathname]);

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
  return <AdminGuard>{children}</AdminGuard>;
}

function ClientRefinePreviewRoute() {
  return (
    <AdminModeRoute>
      <InternalViewOnlyRoute>
        <ClientRefinePreviewView />
      </InternalViewOnlyRoute>
    </AdminModeRoute>
  );
}

function ClientRefinePreviewRoutesRoute() {
  return (
    <AdminModeRoute>
      <InternalViewOnlyRoute>
        <ClientRefinePreviewRoutesView />
      </InternalViewOnlyRoute>
    </AdminModeRoute>
  );
}

function ClientRefinePreviewWorkshopRoute() {
  return (
    <AdminModeRoute>
      <InternalViewOnlyRoute>
        <ClientRefinePreviewWorkshopView />
      </InternalViewOnlyRoute>
    </AdminModeRoute>
  );
}

function ClientRefinePreviewPathRoute() {
  return (
    <AdminModeRoute>
      <InternalViewOnlyRoute>
        <ClientRefinePreviewPathView />
      </InternalViewOnlyRoute>
    </AdminModeRoute>
  );
}

function ClientRefinePreviewMembersRoute() {
  return (
    <AdminModeRoute>
      <InternalViewOnlyRoute>
        <ClientRefinePreviewMembersView />
      </InternalViewOnlyRoute>
    </AdminModeRoute>
  );
}

function ClientRefinePreviewExtractsRoute() {
  return (
    <AdminModeRoute>
      <InternalViewOnlyRoute>
        <ClientRefinePreviewExtractsView />
      </InternalViewOnlyRoute>
    </AdminModeRoute>
  );
}

function ClientRefinePreviewCompanyRoute() {
  return (
    <AdminModeRoute>
      <InternalViewOnlyRoute>
        <ClientRefinePreviewCompanyView />
      </InternalViewOnlyRoute>
    </AdminModeRoute>
  );
}

function ClientRefinePreviewInboxRoute() {
  return (
    <AdminModeRoute>
      <InternalViewOnlyRoute>
        <DriftInboxView />
      </InternalViewOnlyRoute>
    </AdminModeRoute>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppErrorBoundary>
          <AuthProvider>
            <PresentationModeProvider>
              <CompanyProvider>
                <ClientModePathSync />
                <CrpvBootClassSync />
                <Routes>
                <Route path="/" element={<ModeAwareMapRoute />} />
                <Route path="/foundation" element={<ClientPhaseAliasRoute phase="outside" fallbackPath="/" />} />
                <Route path="/diagnosis" element={<ClientPhaseAliasRoute phase="diagnosis" fallbackPath="/" />} />
                <Route path="/decision" element={<ClientPhaseAliasRoute phase="focus" fallbackPath="/strategy" />} />
                <Route path="/execution" element={<ClientPhaseAliasRoute phase="execution" fallbackPath="/opportunities" />} />
                <Route path="/learning" element={<ClientPhaseAliasRoute phase="execution" fallbackPath="/analytics" />} />
                {/* Surface A — MojoMap (product) */}
                <Route path={CLIENT_REFINE_PREVIEW_ROUTE} element={<ClientRefinePreviewRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_ROUTES_ROUTE} element={<ClientRefinePreviewRoutesRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE} element={<ClientRefinePreviewWorkshopRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_PATH_ROUTE} element={<ClientRefinePreviewPathRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_COMPANY_ROUTE} element={<ClientRefinePreviewCompanyRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_INBOX_ROUTE} element={<ClientRefinePreviewInboxRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE} element={<ClientRefinePreviewMembersRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE} element={<ClientRefinePreviewExtractsRoute />} />
                {/* Surface B — Legacy prototype (frozen, not maintained) */}
                <Route path="/legacy/map" element={<InternalViewOnlyRoute><MapView /></InternalViewOnlyRoute>} />
                <Route path="/legacy/strategy" element={<ModeAwareStrategyRoute />} />
                <Route path="/legacy/opportunities" element={<ModeAwareFocusRoute />} />
                <Route path="/legacy/positioning" element={<InternalViewOnlyRoute><PositioningView /></InternalViewOnlyRoute>} />
                <Route path="/legacy/analytics" element={<ModeAwareScoreRoute />} />
                <Route path="/legacy/routes" element={<InternalViewOnlyRoute><RoutesView /></InternalViewOnlyRoute>} />
                <Route path="/legacy/movement" element={<InternalViewOnlyRoute><MovementView /></InternalViewOnlyRoute>} />
                <Route path="/legacy/fmd" element={<AdminModeRoute><FMDStrategicField /></AdminModeRoute>} />
                {/* First Read — presenter-driven five-act first-meeting rail. Admin-gated (presenter-driven; client never logs in). */}
                <Route path="/first-read/:companyId" element={<AdminModeRoute><FirstReadView /></AdminModeRoute>} />
                <Route path="/intake/:companyId" element={<AdminModeRoute><IntakeView /></AdminModeRoute>} />
                <Route path="/legacy/inputs" element={<InternalViewOnlyRoute><InputsView /></InternalViewOnlyRoute>} />
                <Route path="/legacy/files" element={<InternalViewOnlyRoute><FilesRepository /></InternalViewOnlyRoute>} />
                <Route path="/legacy/job-steps" element={<InternalViewOnlyRoute><JobStepsView /></InternalViewOnlyRoute>} />
                {/* Old Surface B paths — redirect to /legacy/* so bookmarks still resolve */}
                <Route path="/strategy" element={<Navigate to="/legacy/strategy" replace />} />
                <Route path="/opportunities" element={<Navigate to="/legacy/opportunities" replace />} />
                <Route path="/positioning" element={<Navigate to="/legacy/positioning" replace />} />
                <Route path="/analytics" element={<Navigate to="/legacy/analytics" replace />} />
                <Route path="/routes" element={<Navigate to="/legacy/routes" replace />} />
                <Route path="/movement" element={<Navigate to="/legacy/movement" replace />} />
                <Route path="/fmd" element={<Navigate to="/legacy/fmd" replace />} />
                <Route path="/inputs" element={<Navigate to="/legacy/inputs" replace />} />
                <Route path="/files" element={<Navigate to="/legacy/files" replace />} />
                <Route path="/job-steps" element={<Navigate to="/legacy/job-steps" replace />} />
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
                {/* Client story mode (CV-0 chrome shell) — admin-gated during build */}
                <Route path={CLIENT_VIEW_ROUTE} element={<AdminModeRoute><ClientStoryView /></AdminModeRoute>} />
                <Route path="/map-signal-prototype" element={<InternalViewOnlyRoute><MapSignalPrototype /></InternalViewOnlyRoute>} />
                <Route path="/landing-page" element={<LandingPage4 />} />
                <Route path="/mojomap-landing" element={<MojoMapLanding />} />
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
