import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { CompanyProvider } from "@/hooks/useCompany";
import AdminGuard from "@/components/AdminGuard";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <CompanyProvider>
            <Routes>
              <Route path="/" element={<MapView />} />
              <Route path="/inputs" element={<InputsView />} />
              <Route path="/files" element={<FilesRepository />} />
              <Route path="/job-steps" element={<JobStepsView />} />
              <Route path="/strategy" element={<StrategyView />} />
              <Route path="/opportunities" element={<OpportunitiesView />} />
              <Route path="/positioning" element={<PositioningView />} />
              <Route path="/analytics" element={<AnalyticsView />} />
              <Route path="/routes" element={<RoutesView />} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/admin" element={<AdminGuard><AdminDashboard /></AdminGuard>} />
              <Route path="/admin/companies" element={<AdminGuard><AdminCompanies /></AdminGuard>} />
              <Route path="/admin/companies/:companyId" element={<AdminGuard><AdminCompanyDetail /></AdminGuard>} />
              <Route path="/admin/companies/:companyId/files" element={<AdminGuard><AdminCompanyFiles /></AdminGuard>} />
              <Route path="/admin/new" element={<AdminGuard><AdminPageEditor /></AdminGuard>} />
              <Route path="/admin/edit/:id" element={<AdminGuard><AdminPageEditor /></AdminGuard>} />
              <Route path="/process/:slug" element={<MethodologyPage />} />
              <Route path="/process/mojomap" element={<MojoMapPage />} />
              <Route path="/map-signal-prototype" element={<MapSignalPrototype />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </CompanyProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
