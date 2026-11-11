import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { CompanyProvider, useCompany } from "@/hooks/useCompany";
import { PresentationModeProvider, usePresentationMode } from "@/hooks/usePresentationMode";
import AdminGuard from "@/components/AdminGuard";
import MemberCompanyGate from "@/components/MemberCompanyGate";
import { MemberToLanding, SignedInRoute } from "@/components/SignedInRoute";
import { loginPathFor } from "@/lib/authRedirect";
import { POST_SIGN_IN_ROUTE, isMemberLandingPath } from "@/lib/landing/landingResolver";
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
import StartRoute from "./pages/StartRoute";
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
import FrontDoorView from "./views/client/frontDoor/FrontDoorView";
import ClientRefinePreviewRoutesView from "./views/client/ClientRefinePreviewRoutesView";
import ClientRefinePreviewWorkshopView from "./views/client/ClientRefinePreviewWorkshopView";
import ClientRefinePreviewPathView from "./views/client/ClientRefinePreviewPathView";
import ClientRefinePreviewMembersView from "./views/client/ClientRefinePreviewMembersView";
import ClientRefinePreviewExtractsView from "./views/client/ClientRefinePreviewExtractsView";
import FirstReadPreviewView from "./views/client/firstReadPreview/FirstReadPreviewView";
import ClientRefinePreviewCompanyView from "./views/client/ClientRefinePreviewCompanyView";
import DriftInboxView from "./views/client/DriftInboxView";
import WorkspaceShell from "./views/client/workspace/WorkspaceShell";
import WorkspaceIndexPage from "./views/client/workspace/WorkspaceIndexPage";
import WorkspaceInputsPage from "./views/client/workspace/InputsPage";
import WorkspaceJobMapPage from "./views/client/workspace/JobMapPage";
import WorkspacePositioningPage from "./views/client/workspace/PositioningPage";
import WorkspaceStrategyPage from "./views/client/workspace/StrategyPage";
import WorkspaceMarketPage from "./views/client/workspace/MarketPage";
import WorkspaceOpportunitiesPage from "./views/client/workspace/OpportunitiesPage";
import WorkspaceRoutesPage from "./views/client/workspace/RoutesPage";
import WorkspaceCouncilPage from "./views/client/workspace/CouncilPage";
import { DiagnoseFlowView } from "./views/client/diagnoseFlow/DiagnoseFlowView";
import type { ClientSystemPhase } from "./hooks/useClientMapInteractionState";
import { dispatchClientPhaseChange, writeStoredClientPhase } from "./hooks/useClientMapInteractionState";
import { isClientPhasePath } from "./lib/clientPhaseRoutes";
import {
  CLIENT_REFINE_PREVIEW_ROUTE,
  CLIENT_REFINE_PREVIEW_HOME_ROUTE,
  CLIENT_REFINE_PREVIEW_ROUTES_ROUTE,
  CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE,
  CLIENT_REFINE_PREVIEW_PATH_ROUTE,
  CLIENT_REFINE_PREVIEW_COMPANY_ROUTE,
  CLIENT_REFINE_PREVIEW_COMPANY_ID_ROUTE,
  bareCompanyRedirect,
  CLIENT_REFINE_PREVIEW_INBOX_ROUTE,
  CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE,
  CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE,
  CLIENT_REFINE_PREVIEW_FIRSTREAD_ROUTE,
  CLIENT_REFINE_PREVIEW_DIAGNOSE_ROUTE,
  CLIENT_REFINE_PREVIEW_WORKSPACE_ROUTE,
} from "./lib/clientRefinePreview";
import { CLIENT_VIEW_VISIBILITY_AUDIT_ROUTE } from "./lib/clientViewVisibilityAudit";
import { CLIENT_VIEW_ROUTE } from "./lib/clientStoryView";
import {
  CLIENT_ONBOARDING_MOJOMAP_EDITOR_ROUTE,
  CLIENT_ONBOARDING_MOJOMAP_ROUTE,
} from "./lib/clientOnboardingMojoMapConfig";

const queryClient = new QueryClient();

// U6-46 (2026-11-10): this used to check the MODE and never the user, and `internal` is the default
// for a visitor with no localStorage — so eleven routes behind it rendered to anyone with the URL,
// each one showing the fallback company's name. Measured signed out on 2026-11-10: /legacy/map,
// /legacy/strategy, /legacy/opportunities, /legacy/positioning, /legacy/analytics, /legacy/movement,
// /legacy/inputs, /legacy/files, /legacy/job-steps, /process/mojomap and /map-signal-prototype all
// rendered "Cafe Barra". The mode check stays (it is what sends a client-mode viewer home); the
// admin requirement is what closes the door.
function InternalViewOnlyRoute({ children }: { children: JSX.Element }) {
  const { mode } = usePresentationMode();
  return <AdminGuard>{mode === "client" ? <Navigate to="/" replace /> : children}</AdminGuard>;
}

// U6-46: "/" needs a SIGNED-IN account — not an admin, because this is where a member lands. It had
// no auth check at all, so a signed-out visitor with mojo.presentation.mode="client" already stored
// rendered the whole Decision Command Screen: measured 2026-11-10 with auth.getUser() returning null
// and the page showing the fallback company's name, website and score.
//
// U6-50 (2026-11-11): a NON-ADMIN never reaches ClientDecisionSystemView. It is an operator's
// rehearsal of the client story, and until this build it was also the one page a member landed on —
// reading a company that was not theirs, because the fallback supplied one. A member goes to /start,
// which resolves their own landing. The admin's two outcomes are untouched.
function ModeAwareMapRoute() {
  const { mode } = usePresentationMode();
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to={loginPathFor(`${location.pathname}${location.search}`)} replace />;
  if (!isAdmin) return <Navigate to={POST_SIGN_IN_ROUTE} replace />;
  if (mode === "client") return <ClientDecisionSystemView />;
  return <Navigate to={CLIENT_REFINE_PREVIEW_ROUTE} replace />;
}

// U6 part 1 — THIS SYNC IS AN OPERATOR'S TOOL, AND IT NOW SAYS SO.
//
// It bounces every path to "/" in client mode. It is a GLOBAL effect, not a route guard, so it runs
// before any guard can answer — and once a non-admin was forced into client presentation
// (usePresentationMode, U6 part 1) that made it the strongest authority in the app for exactly the
// people it was never written for. Measured 2026-11-11: a signed-in non-admin on /legacy/routes was
// bounced to "/" instead of meeting AdminGuard, so the role refusal U6-56 requires to stay distinct
// became unreachable for every member. It also swallowed both member landings, which with "/"
// sending a member to /start made a redirect loop.
//
// SO IT APPLIES TO ADMINS ONLY. "Client mode" is an operator rehearsing the client story on one
// page; a real member's doors are the route guards, which are stronger and legible in one place.
// Nothing about an admin's behaviour changes — the isAdmin test is what keeps it that way.
//
// THE LANDING EXEMPTION STAYS, AND IT IS NOT FREE (U6-72, measured 2026-11-11). With the sync now
// admin-only, the exemption can no longer be what saves a member — the isAdmin test above already
// did that. What it still does is change TWO ROUTE FAMILIES for an ADMIN in client presentation:
//
//   /preview/client-refine/first-read/:id   at 3af07eb1 → bounced to "/"   now → stays
//   /preview/client-refine/diagnose/:id/*   at 3af07eb1 → bounced to "/"   now → stays
//   /preview/client-refine/workshop         at 3af07eb1 → bounced to "/"   now → bounced (control)
//   /legacy/map                             at 3af07eb1 → bounced to "/"   now → bounced (control)
//
// That is the only admin behaviour this build changes, and it is kept deliberately: an operator in
// client presentation is rehearsing what a client sees, and these two families are the only pages a
// client has — bouncing an operator off the very screens they are reviewing was never the intent of
// a "single-page experience" rule written before those screens existed. It is also the belt if this
// sync is ever widened back to non-admins.
function ClientModePathSync() {
  const { mode } = usePresentationMode();
  const { isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (mode !== "client") return;
    if (!isAdmin) return; // a member is governed by the route guards, not by this
    if (location.pathname.startsWith("/admin")) return;
    if (location.pathname === "/login" || location.pathname === "/reset-password") return;
    if (location.pathname === CLIENT_VIEW_ROUTE) return; // client story surface is standalone
    if (isClientPhasePath(location.pathname)) return;
    if (isMemberLandingPath(location.pathname)) return; // a member's own landing
    // Client mode is a single-page experience; always route to root.
    navigate("/", { replace: true });
  }, [location.pathname, mode, navigate, isAdmin]);

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

// U6 part 1 (2026-11-11): THE GUARD IS OUTSIDE THE MODE CHECK, as it is in InternalViewOnlyRoute.
// The mode check used to come first, and once a signed-in non-admin was forced into client
// presentation that bounced them to "/" BEFORE AdminGuard could refuse them — so three of the eleven
// legacy routes stopped giving a role refusal and started redirecting, which is exactly the
// conflation U6-56 forbids. Order restored: no session → redirect, wrong role → "Access Denied",
// and only then does an ADMIN in client presentation get sent home.
function ModeAwareFocusRoute() {
  const { mode } = usePresentationMode();
  return <AdminGuard>{mode === "client" ? <Navigate to="/" replace /> : <OpportunitiesView />}</AdminGuard>;
}

// U6 part 1 (2026-11-11): THE GUARD IS OUTSIDE THE MODE CHECK, as it is in InternalViewOnlyRoute.
// The mode check used to come first, and once a signed-in non-admin was forced into client
// presentation that bounced them to "/" BEFORE AdminGuard could refuse them — so three of the eleven
// legacy routes stopped giving a role refusal and started redirecting, which is exactly the
// conflation U6-56 forbids. Order restored: no session → redirect, wrong role → "Access Denied",
// and only then does an ADMIN in client presentation get sent home.
function ModeAwareScoreRoute() {
  const { mode } = usePresentationMode();
  return <AdminGuard>{mode === "client" ? <Navigate to="/" replace /> : <AnalyticsView />}</AdminGuard>;
}

// U6 part 1 (2026-11-11): THE GUARD IS OUTSIDE THE MODE CHECK, as it is in InternalViewOnlyRoute.
// The mode check used to come first, and once a signed-in non-admin was forced into client
// presentation that bounced them to "/" BEFORE AdminGuard could refuse them — so three of the eleven
// legacy routes stopped giving a role refusal and started redirecting, which is exactly the
// conflation U6-56 forbids. Order restored: no session → redirect, wrong role → "Access Denied",
// and only then does an ADMIN in client presentation get sent home.
function ModeAwareStrategyRoute() {
  const { mode } = usePresentationMode();
  return <AdminGuard>{mode === "client" ? <Navigate to="/" replace /> : <StrategyView />}</AdminGuard>;
}

function AdminModeRoute({ children }: { children: JSX.Element }) {
  return <AdminGuard>{children}</AdminGuard>;
}

// The front door — the bare path. U6-50: a signed-in MEMBER who arrives here (a bookmark, the logo,
// an old link) is sent to their own landing rather than shown "Access Denied" on the product's front
// page. Every other client-refine surface keeps the admin-or-denied gate.
function FrontDoorRoute() {
  return (
    <MemberToLanding>
      <AdminModeRoute>
        <InternalViewOnlyRoute>
          <FrontDoorView />
        </InternalViewOnlyRoute>
      </AdminModeRoute>
    </MemberToLanding>
  );
}

// The former landing, one level down at /home. Guards unchanged.
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

// THE TWO MEMBER-REACHABLE FAMILIES (U6 part 1, 2026-11-11).
//
// These are the only two surfaces a client is sent to, and they are the two whose company comes from
// the URL — which is why MemberCompanyGate can key on it. The gate replaces BOTH old wrappers:
// AdminModeRoute would refuse the member outright, and InternalViewOnlyRoute would bounce them, since
// a non-admin is always client presentation now.
//
// A SESSION IS STILL REQUIRED and is still the first thing checked, so a signed-out visitor is
// redirected to /login carrying the path (U6-45) rather than meeting a membership refusal.
function ClientRefinePreviewDiagnoseRoute() {
  return (
    <SignedInRoute>
      <MemberCompanyGate>
        <DiagnoseFlowView />
      </MemberCompanyGate>
    </SignedInRoute>
  );
}

function ClientRefinePreviewFirstReadRoute() {
  return (
    <SignedInRoute>
      <MemberCompanyGate>
        <FirstReadPreviewView />
      </MemberCompanyGate>
    </SignedInRoute>
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

// N1 — the BARE /preview/client-refine/company, kept as a redirect so nothing that already points
// at it breaks. It sends the operator to the active company's own address, preserving the query
// string (the Workshop's phase banner arrives here as ?advance=diagnose and the confirm flow on the
// far side reads it). `replace` so Back does not bounce through the redirect.
//
// NO ACTIVE COMPANY → the front door, not a guess. This route used to answer "whichever company
// this browser last selected", which on a fresh profile was pickDefaultCompanyId's choice; sending
// someone to a company they never picked is exactly the behaviour N1 exists to end.
//
// WHILE THE COMPANY LIST IS LOADING the answer is not yet knowable, so this renders nothing rather
// than bouncing to the front door on a race — activeCompany is null during the first fetch.
function ClientRefinePreviewCompanyRedirect() {
  const { activeCompany, loading } = useCompany();
  const location = useLocation();
  const to = bareCompanyRedirect({ loading, activeCompanyId: activeCompany?.id, search: location.search });
  return to ? <Navigate to={to} replace /> : null;
}

function ClientRefinePreviewCompanyBareRoute() {
  return (
    <AdminModeRoute>
      <InternalViewOnlyRoute>
        <ClientRefinePreviewCompanyRedirect />
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

// WORKSPACE (2026-09-11) — the one nested parent in this family: the shell renders <Outlet /> for
// its ten children. Same double gate as every other client-refine surface.
function ClientRefinePreviewWorkspaceRoute() {
  return (
    <AdminModeRoute>
      <InternalViewOnlyRoute>
        <WorkspaceShell />
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
                <Route path={CLIENT_REFINE_PREVIEW_ROUTE} element={<FrontDoorRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_HOME_ROUTE} element={<ClientRefinePreviewRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_ROUTES_ROUTE} element={<ClientRefinePreviewRoutesRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE} element={<ClientRefinePreviewWorkshopRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_PATH_ROUTE} element={<ClientRefinePreviewPathRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_COMPANY_ROUTE} element={<ClientRefinePreviewCompanyBareRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_COMPANY_ID_ROUTE} element={<ClientRefinePreviewCompanyRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_INBOX_ROUTE} element={<ClientRefinePreviewInboxRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_MEMBERS_ROUTE} element={<ClientRefinePreviewMembersRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_EXTRACTS_ROUTE} element={<ClientRefinePreviewExtractsRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_FIRSTREAD_ROUTE} element={<ClientRefinePreviewFirstReadRoute />} />
                <Route path={`${CLIENT_REFINE_PREVIEW_DIAGNOSE_ROUTE}/*`} element={<ClientRefinePreviewDiagnoseRoute />} />
                <Route path={CLIENT_REFINE_PREVIEW_WORKSPACE_ROUTE} element={<ClientRefinePreviewWorkspaceRoute />}>
                  <Route index element={<WorkspaceIndexPage />} />
                  <Route path="inputs" element={<WorkspaceInputsPage />} />
                  <Route path="job-map" element={<WorkspaceJobMapPage />} />
                  <Route path="positioning" element={<WorkspacePositioningPage />} />
                  <Route path="strategy" element={<WorkspaceStrategyPage />} />
                  <Route path="market" element={<WorkspaceMarketPage />} />
                  <Route path="opportunities" element={<WorkspaceOpportunitiesPage />} />
                  <Route path="routes" element={<WorkspaceRoutesPage />} />
                  <Route path="council" element={<WorkspaceCouncilPage />} />
                </Route>
                {/* Surface B — Legacy prototype (frozen, not maintained) */}
                <Route path="/legacy/map" element={<InternalViewOnlyRoute><MapView /></InternalViewOnlyRoute>} />
                <Route path="/legacy/strategy" element={<ModeAwareStrategyRoute />} />
                <Route path="/legacy/opportunities" element={<ModeAwareFocusRoute />} />
                <Route path="/legacy/positioning" element={<InternalViewOnlyRoute><PositioningView /></InternalViewOnlyRoute>} />
                <Route path="/legacy/analytics" element={<ModeAwareScoreRoute />} />
                {/* U5 (2026-11-09): admin-gated like the rest. This route mounts RouteInspectPanel, whose
                    handleSave fires refresh-mojo-score — an Option B path — and routes_select AND
                    routes_update both carry a company_members arm, so a client with a membership could
                    have driven it. InternalViewOnlyRoute checks the presentation mode, never the user. */}
                <Route path="/legacy/routes" element={<AdminModeRoute><InternalViewOnlyRoute><RoutesView /></InternalViewOnlyRoute></AdminModeRoute>} />
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
                <Route path={POST_SIGN_IN_ROUTE} element={<StartRoute />} />
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
