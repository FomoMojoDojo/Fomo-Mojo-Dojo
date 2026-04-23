import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import {
  type ClientSystemPhase,
  dispatchClientPhaseChange,
  readStoredClientPhase,
  writeStoredClientPhase,
} from "@/hooks/useClientMapInteractionState";
import { useLlmTraceDebug } from "@/hooks/useLlmTraceDebug";
import { usePresentationMode } from "@/hooks/usePresentationMode";
import { isClientPhasePath } from "@/lib/clientPhaseRoutes";
import { CLIENT_VIEW_VISIBILITY_AUDIT_ROUTE } from "@/lib/clientViewVisibilityAudit";
import { safeLocalStorageGet, safeLocalStorageSet } from "@/lib/safeLocalStorage";
import {
  CLIENT_ONBOARDING_MOJOMAP_EDITOR_ROUTE,
  CLIENT_ONBOARDING_MOJOMAP_ROUTE,
} from "@/lib/clientOnboardingMojoMapConfig";
import { MOCK_NAV_CONFIG } from "@/lib/mockData";
import {
  BarChart3,
  Building2,
  ChevronDown,
  Compass,
  FileText,
  FilePenLine,
  FolderKanban,
  Home,
  ListChecks,
  Map,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import mojoLogo from "@/assets/mojomap-logo-white.svg";

const SIDEBAR_OPEN_STORAGE_KEY = "mojo.sidebar.open";
const TOOLING_OPEN_STORAGE_KEY = "mojo.sidebar.admin.tooling.open";
const OUTSIDE_PHASE_DEFAULT_MIGRATION_KEY = "mojo.client.phase.default.outside.v1";

const PHASE_OPTIONS: Array<{ value: ClientSystemPhase; label: string }> = [
  { value: "outside", label: "Outside" },
  { value: "diagnosis", label: "Diagnose" },
  { value: "focus", label: "Focus" },
  { value: "execution", label: "Flow" },
];

type NavFlag = keyof typeof MOCK_NAV_CONFIG;
type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  flag?: NavFlag;
  adminOnly?: boolean;
};

const coreItems: NavItem[] = [
  { label: "MojoMap", path: "/", icon: Home },
  { label: "Positioning", path: "/positioning", icon: FileText },
  { label: "Opportunities", path: "/opportunities", icon: TrendingUp },
  { label: "Routes", path: "/routes", icon: Map },
  { label: "Strategy", path: "/strategy", icon: Compass },
];

const clientCoreItems: NavItem[] = [
  { label: "Decision Path", path: "/", icon: Home },
];

const resourceItems: NavItem[] = [
  { label: "Artifacts", path: "/files", icon: FolderKanban },
  { label: "Inputs", path: "/inputs", icon: ListChecks },
  { label: "Checkpoints", path: "/job-steps", icon: Sparkles, flag: "show_job_steps" },
  { label: "Analytics", path: "/analytics", icon: BarChart3, flag: "show_analytics" },
];

const adminItems: NavItem[] = [
  { label: "Methodology Pages", path: "/admin", icon: Shield },
  { label: "Company Pages", path: "/admin/companies", icon: Building2 },
];

const adminToolingItems: NavItem[] = [
  { label: "Client View Audit", path: CLIENT_VIEW_VISIBILITY_AUDIT_ROUTE, icon: BarChart3, adminOnly: true },
  { label: "Client Onboarding MojoMap", path: CLIENT_ONBOARDING_MOJOMAP_ROUTE, icon: Compass, adminOnly: true },
  { label: "Onboarding Map Editor", path: CLIENT_ONBOARDING_MOJOMAP_EDITOR_ROUTE, icon: FilePenLine, adminOnly: true },
  { label: "Signal Map", path: "/map-signal-prototype", icon: Map, adminOnly: true },
];

export default function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, signOut } = useAuth();
  const { mode, setMode, isClientView } = usePresentationMode();
  const { enabled: llmTraceEnabled, toggle: toggleLlmTrace } = useLlmTraceDebug();
  const { companies, activeCompany, setActiveCompanyId } = useCompany();

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = safeLocalStorageGet(SIDEBAR_OPEN_STORAGE_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const [toolingOpen, setToolingOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = safeLocalStorageGet(TOOLING_OPEN_STORAGE_KEY);
    if (stored === "0") return false;
    if (stored === "1") return true;
    return true;
  });

  const [showSwitcher, setShowSwitcher] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const [selectedPhase, setSelectedPhase] = useState<ClientSystemPhase>(() =>
    readStoredClientPhase(activeCompany?.id),
  );

  const visibleCore = useMemo(() => (isClientView ? clientCoreItems : coreItems), [isClientView]);

  const visibleResources = useMemo(
    () =>
      isClientView
        ? []
        : resourceItems.filter(
            (item) => (!item.flag || MOCK_NAV_CONFIG[item.flag]) && (!item.adminOnly || isAdmin),
          ),
    [isAdmin, isClientView],
  );

  const companyName = activeCompany?.name?.trim() || "No company selected";
  const companyMeta = activeCompany
    ? [
        "Strategy Map",
        activeCompany.quarter?.trim() || "Quarter not set",
        activeCompany.archetype?.trim() || "Archetype not set",
      ].join(" · ")
    : "Select a company to view its map";

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setShowSwitcher(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    safeLocalStorageSet(SIDEBAR_OPEN_STORAGE_KEY, sidebarOpen ? "1" : "0");
  }, [sidebarOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    safeLocalStorageSet(TOOLING_OPEN_STORAGE_KEY, toolingOpen ? "1" : "0");
  }, [toolingOpen]);

  useEffect(() => {
    setSelectedPhase(readStoredClientPhase(activeCompany?.id));
  }, [activeCompany?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (safeLocalStorageGet(OUTSIDE_PHASE_DEFAULT_MIGRATION_KEY) === "1") return;

    try {
      const keysToMigrate: string[] = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);
        if (key && key.startsWith("mojo.client.interaction.")) keysToMigrate.push(key);
      }

      for (const key of keysToMigrate) {
        const companyId = key.replace("mojo.client.interaction.", "") || "no-company";
        writeStoredClientPhase(companyId, "outside");
      }
    } catch {
      // Ignore storage access issues in private mode or restricted contexts.
    } finally {
      safeLocalStorageSet(OUTSIDE_PHASE_DEFAULT_MIGRATION_KEY, "1");
      setSelectedPhase(readStoredClientPhase(activeCompany?.id));
      if (activeCompany?.id) {
        dispatchClientPhaseChange(activeCompany.id, readStoredClientPhase(activeCompany.id));
      }
    }
  }, [activeCompany?.id]);

  useEffect(() => {
    const body = document.body;
    body.classList.add("mojo-shell-mounted");
    body.classList.toggle("mojo-shell-sidebar-open", sidebarOpen);
    body.classList.toggle("mojo-shell-sidebar-collapsed", !sidebarOpen);
    return () => {
      body.classList.remove("mojo-shell-mounted");
      body.classList.remove("mojo-shell-sidebar-open");
      body.classList.remove("mojo-shell-sidebar-collapsed");
    };
  }, [sidebarOpen]);

  function isActive(path: string) {
    if (path === "/") return location.pathname === "/";
    if (path === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(path);
  }

  const isDesktop = () => window.matchMedia("(min-width: 1024px)").matches;

  const onNavFollow = () => {
    if (typeof window !== "undefined" && !isDesktop()) {
      setSidebarOpen(false);
    }
  };

  const onModeChange = (next: "internal" | "client") => {
    safeLocalStorageSet("mojo.presentation.mode", next);
    setMode(next);

    if (next === "client") {
      navigate("/", { replace: !isClientPhasePath(location.pathname) });
    }

    if (typeof window !== "undefined" && !isDesktop()) {
      setSidebarOpen(false);
    }
  };

  const onPhaseChange = (next: ClientSystemPhase) => {
    if (!isAdmin || !activeCompany?.id) return;
    setSelectedPhase(next);
    writeStoredClientPhase(activeCompany.id, next);
    dispatchClientPhaseChange(activeCompany.id, next);
  };

  useEffect(() => {
    if (!isClientView) return;
    if (!location.pathname.startsWith("/admin")) return;
    if (location.pathname === "/") return;
    navigate("/", { replace: true });
  }, [isClientView, location.pathname, navigate]);

  const navItemClass = (path: string) =>
    `group flex items-center rounded-lg py-2 transition-colors ${
      sidebarOpen ? "gap-3 px-3 text-[15px]" : "h-10 justify-center px-0 text-[13px]"
    } ${
      isActive(path)
        ? "bg-white/12 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
        : "text-[#c7cde4] hover:bg-white/8 hover:text-white"
    }`;

  const statusItems = [
    { label: "Company Selected", on: !!activeCompany?.id },
    { label: "Website Set", on: !!activeCompany?.website?.trim() },
    { label: "Scored", on: !!activeCompany?.last_scored_at },
  ];

  const renderGroup = (title: string, items: NavItem[]) => (
    <div>
      {sidebarOpen ? (
        <p className="px-3 pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#8f95af]">{title}</p>
      ) : null}
      <div className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.path} to={item.path} className={navItemClass(item.path)} onClick={onNavFollow}>
              <Icon className="h-4 w-4 opacity-90" />
              {sidebarOpen ? (
                <span className="font-medium">{item.label}</span>
              ) : (
                <span className="sr-only">{item.label}</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {!sidebarOpen ? (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="fixed left-4 top-4 z-[70] inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#2f3761] bg-[#1f2647] text-[#e9edfd] shadow-lg transition-colors hover:bg-[#29325a] lg:hidden"
          aria-label="Show navigation"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      ) : null}

      {sidebarOpen ? (
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          aria-label="Close navigation overlay"
        />
      ) : null}

      <nav
        className={`fixed inset-y-0 left-0 z-50 border-r border-white/10 bg-[#1f2647] text-white shadow-xl transition-[width,transform] duration-200 ${
          sidebarOpen ? "w-[260px] translate-x-0" : "w-[64px] -translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className={`border-b border-white/10 ${sidebarOpen ? "px-4 pb-3 pt-4" : "px-2 pb-2 pt-3"}`}>
            {sidebarOpen ? (
              <>
                <div className="flex items-center justify-between">
                  <Link to="/" className="inline-flex items-center -ml-2" onClick={onNavFollow}>
                    <img src={mojoLogo} alt="MojoMap" className="h-7 w-auto" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="hidden h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-white/5 text-[#d5dcf4] transition-colors hover:bg-white/10 lg:inline-flex"
                    aria-label="Collapse navigation"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-[13px] font-medium text-[#f3f6ff]">{companyName}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[#9fa7c7]">{companyMeta}</p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Link to="/" className="inline-flex items-center" onClick={onNavFollow}>
                  <img src={mojoLogo} alt="MojoMap" className="h-6 w-auto" />
                </Link>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="hidden h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-white/5 text-[#d5dcf4] transition-colors hover:bg-white/10 lg:inline-flex"
                  aria-label="Expand navigation"
                >
                  <PanelLeftOpen className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div className={`flex-1 space-y-6 overflow-y-auto ${sidebarOpen ? "px-3 py-5" : "px-2 py-3"}`}>
            {renderGroup("Core", visibleCore)}
            {visibleResources.length > 0 ? renderGroup("Resources", visibleResources) : null}

            {!isClientView && isAdmin ? (
              <div>
                {sidebarOpen ? (
                  <p className="px-3 pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#8f95af]">Admin</p>
                ) : null}
                <div className="space-y-1">
                  <Link to="/process/mojomap" className={navItemClass("/process/mojomap")} onClick={onNavFollow}>
                    <Sparkles className="h-4 w-4 opacity-90" />
                    {sidebarOpen ? (
                      <span className="font-medium">Our Process</span>
                    ) : (
                      <span className="sr-only">Our Process</span>
                    )}
                  </Link>
                  {adminItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link key={item.path} to={item.path} className={navItemClass(item.path)} onClick={onNavFollow}>
                        <Icon className="h-4 w-4 opacity-90" />
                        {sidebarOpen ? (
                          <span className="font-medium">{item.label}</span>
                        ) : (
                          <span className="sr-only">{item.label}</span>
                        )}
                      </Link>
                    );
                  })}
                </div>
                <div className="mt-4">
                  {sidebarOpen ? (
                    <div className="flex items-center justify-between px-3 pb-2">
                      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#7f87a8]">Tooling</p>
                      <button
                        type="button"
                        onClick={() => setToolingOpen((current) => !current)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[#9fa7c7] transition-colors hover:bg-white/8 hover:text-white"
                        aria-label={toolingOpen ? "Hide tooling links" : "Show tooling links"}
                      >
                        {toolingOpen ? "Hide" : "Show"}
                        <ChevronDown className={`h-3 w-3 transition-transform ${toolingOpen ? "" : "-rotate-90"}`} />
                      </button>
                    </div>
                  ) : null}
                  {toolingOpen ? (
                    <div className="space-y-1">
                      {adminToolingItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link key={item.path} to={item.path} className={navItemClass(item.path)} onClick={onNavFollow}>
                            <Icon className="h-4 w-4 opacity-90" />
                            {sidebarOpen ? (
                              <span className="font-medium">{item.label}</span>
                            ) : (
                              <span className="sr-only">{item.label}</span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {sidebarOpen ? (
              <div>
                <p className="px-3 pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#8f95af]">View</p>
                <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-1.5">
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => onModeChange("internal")}
                      className={`rounded-md px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                        mode === "internal"
                          ? "bg-white/12 text-white"
                          : "text-[#c7cde4] hover:bg-white/8"
                      }`}
                    >
                      Internal
                    </button>
                    <button
                      type="button"
                      onClick={() => onModeChange("client")}
                      className={`rounded-md px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                        mode === "client"
                          ? "bg-white/12 text-white"
                          : "text-[#c7cde4] hover:bg-white/8"
                      }`}
                    >
                      Client
                    </button>
                  </div>
                </div>
                {isAdmin ? (
                  <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#9ca5c7]">Stage</p>
                      <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#7f87a8]">Admin</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {PHASE_OPTIONS.map((phase) => (
                        <button
                          key={phase.value}
                          type="button"
                          onClick={() => onPhaseChange(phase.value)}
                          disabled={!activeCompany?.id}
                          className={`rounded-md px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                            selectedPhase === phase.value
                              ? "bg-white/14 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                              : "text-[#c7cde4] hover:bg-white/8"
                          } ${!activeCompany?.id ? "cursor-not-allowed opacity-60 hover:bg-transparent" : ""}`}
                          aria-label={`Set stage to ${phase.label}`}
                        >
                          {phase.label}
                        </button>
                      ))}
                    </div>
                    {!activeCompany?.id ? (
                      <p className="mt-2 px-1 text-[11px] text-[#98a1c3]">Select a company to set stage.</p>
                    ) : null}
                  </div>
                ) : null}
                <p className="px-3 pb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#8f95af]">Status</p>
                <div className="space-y-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  {statusItems.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 py-1">
                      <span
                        className={`h-2 w-2 rounded-full border border-white/30 ${
                          item.on ? "bg-[#34d399] border-[#34d399]" : "bg-transparent"
                        }`}
                      />
                      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#d4daf0]">{item.label}</span>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      if (isAdmin && !isClientView) toggleLlmTrace();
                    }}
                    disabled={!isAdmin || isClientView}
                    className={`mt-2 flex w-full items-center justify-between rounded-md border px-2 py-1.5 transition-colors ${
                      isAdmin && !isClientView
                        ? "border-white/20 bg-white/5 hover:bg-white/10"
                        : "border-white/10 bg-white/5 opacity-70"
                    }`}
                  >
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#d4daf0]">LLM</span>
                    <span
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        llmTraceEnabled ? "bg-[#34d399]" : "bg-[#5e647f]"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          llmTraceEnabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className={`border-t border-white/10 ${sidebarOpen ? "px-3 py-3" : "px-2 py-3"}`}>
            <div className="relative" ref={switcherRef}>
              <button
                onClick={() => companies.length > 1 && setShowSwitcher(!showSwitcher)}
                className={`w-full rounded-lg border border-white/10 bg-white/5 py-2 transition-colors ${
                  sidebarOpen ? "px-3 text-left" : "px-2 text-center"
                } ${companies.length > 1 ? "cursor-pointer hover:bg-white/10" : ""}`}
                title={!sidebarOpen ? companyName : undefined}
              >
                {sidebarOpen ? (
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-medium text-[#f2f5ff]">{companyName}</p>
                      <p className="mt-[2px] font-mono text-[10px] uppercase tracking-[0.08em] text-[#9ca5c7]">
                        Active company
                      </p>
                    </div>
                    {companies.length > 1 ? (
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-[#9ca5c7] transition-transform ${showSwitcher ? "rotate-180" : ""}`}
                      />
                    ) : null}
                  </div>
                ) : (
                  <img src={mojoLogo} alt="MojoMap" className="mx-auto h-5 w-auto opacity-90" />
                )}
              </button>

              {showSwitcher && sidebarOpen ? (
                <div className="absolute bottom-full left-0 right-0 z-[70] mb-2 rounded-lg border border-white/15 bg-[#1a2140] py-1 shadow-2xl">
                  {companies.map((company) => (
                    <button
                      key={company.id}
                      onClick={() => {
                        setActiveCompanyId(company.id);
                        setShowSwitcher(false);
                      }}
                      className={`w-full px-3 py-2 text-left transition-colors hover:bg-white/8 ${
                        company.id === activeCompany?.id ? "bg-white/10" : ""
                      }`}
                    >
                      <p className="text-[13px] text-[#eef2ff]">{company.name}</p>
                      <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#a0a8c9]">
                        {company.quarter} · {company.archetype}
                      </p>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {sidebarOpen ? (
              <div className="mt-3">
                {user ? (
                  <button
                    onClick={() => signOut()}
                    className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#aeb6d5] transition-colors hover:text-[#f3f6ff]"
                  >
                    Sign Out
                  </button>
                ) : (
                  <Link
                    to="/login"
                    className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#f2a38d] transition-colors hover:text-[#ffc2b2]"
                    onClick={onNavFollow}
                  >
                    Login
                  </Link>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </nav>
    </>
  );
}
