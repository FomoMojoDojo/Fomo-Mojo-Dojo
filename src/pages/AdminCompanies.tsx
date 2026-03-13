import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { PublicBaselinePanel } from "@/components/PublicBaselinePanel";
import AiBoundaryNote from "@/components/AiBoundaryNote";
import FrameworkProvenancePanel from "@/components/admin/FrameworkProvenancePanel";
import {
  Building2,
  Plus,
  Globe,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  FileX,
} from "lucide-react";

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  paper: "#FFFFFF",
  line: "#DDE6D1",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  coral: "#FF7D2D",
  teal: "#5F9B8C",
};

function normalizeUrl(url?: string) {
  const u = (url ?? "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `https://${u}`;
}

function sanitizeWebsite(url?: string) {
  return (url ?? "").trim();
}

export default function AdminCompanies() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { companies, activeCompany, setActiveCompanyId, refetch, loading } =
    useCompany();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [creating, setCreating] = useState(false);

  const [researchingId, setResearchingId] = useState<string | null>(null);
  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [comboId, setComboId] = useState<string | null>(null);

  const handleCreate = async (useAI: boolean) => {
    if (!name.trim() || !user) return;

    setCreating(true);
    const sanitizedWebsite = sanitizeWebsite(website);

    const { data, error } = await supabase
      .from("companies")
      .insert({
        name: name.trim(),
        website: sanitizedWebsite || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      toast({
        title: "Create Failed",
        description: error.message,
        variant: "destructive",
      });
      setCreating(false);
      return;
    }

    if (data) {
      setActiveCompanyId(data.id);
      await refetch();
      if (useAI) {
        if (sanitizedWebsite) {
          await runBaselineAndResearch(data.id, data.name, sanitizedWebsite);
        } else {
          await runResearch(data.id, data.name, "");
        }
      }
    } else {
      await refetch();
    }

    setName("");
    setWebsite("");
    setShowCreate(false);
    setCreating(false);
  };

  const runResearch = async (
    companyId: string,
    companyName: string,
    companyWebsite: string
  ) => {
    setResearchingId(companyId);
    toast({
      title: "AI Research Started",
      description: `Analyzing ${companyName}…`,
    });

    const { error } = await supabase.functions.invoke("research-company", {
      body: {
        company_id: companyId,
        company_name: companyName,
        website: companyWebsite,
      },
    });

    setResearchingId(null);

    if (error) {
      toast({
        title: "Research Failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Research Complete",
        description: `Strategic inputs generated for ${companyName}`,
      });
      await refetch();
    }
  };

  const runPublicBaseline = async (
    companyId: string,
    companyName: string,
    companyWebsite: string
  ) => {
    if (!companyWebsite.trim()) {
      toast({
        title: "Website Required",
        description: `Add a website for ${companyName} before running the public baseline.`,
        variant: "destructive",
      });
      return false;
    }

    setBaselineId(companyId);
    toast({
      title: "Web Baseline Started",
      description: `Collecting public signals for ${companyName}…`,
    });

    const { error } = await supabase.functions.invoke("public-baseline", {
      body: {
        company_id: companyId,
        company_name: companyName,
        website: companyWebsite,
      },
    });

    setBaselineId(null);

    if (error) {
      toast({
        title: "Web Baseline Failed",
        description: error.message,
        variant: "destructive",
      });
      return false;
    } else {
      toast({
        title: "Web Baseline Complete",
        description: `Public baseline saved for ${companyName}`,
      });
      await refetch();
      return true;
    }
  };

  // NEW: One-click combo (Baseline -> Research -> Refetch)
  const runBaselineAndResearch = async (
    companyId: string,
    companyName: string,
    companyWebsite: string
  ) => {
    setComboId(companyId);

    toast({
      title: "Baseline + Research Started",
      description: `Running baseline then research for ${companyName}…`,
    });

    try {
      // 1) Baseline
      const ok = await runPublicBaseline(companyId, companyName, companyWebsite);
      if (!ok) {
        setComboId(null);
        return;
      }

      // 2) Research
      setResearchingId(companyId);
      const { error } = await supabase.functions.invoke("research-company", {
        body: {
          company_id: companyId,
          company_name: companyName,
          website: companyWebsite,
        },
      });
      setResearchingId(null);

      if (error) {
        toast({
          title: "Baseline OK, Research Failed",
          description: error.message,
          variant: "destructive",
        });
        setComboId(null);
        return;
      }

      // 3) Refresh + done
      await refetch();

      toast({
        title: "Baseline + Research Complete",
        description: `Mojo Map data + scores updated for ${companyName}`,
      });
    } catch (e: unknown) {
      toast({
        title: "Baseline + Research Failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setComboId(null);
      setResearchingId(null);
      setBaselineId(null);
    }
  };

  const handleDelete = async (id: string, companyName: string) => {
    if (!confirm(`Delete "${companyName}"? This cannot be undone.`)) return;

    const { error } = await supabase.from("companies").delete().eq("id", id);
    if (error) {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    await refetch();
  };

  return (
    <div className="min-h-screen" style={{ background: c.bg }}>
      {/* Map-view-ish header (light) */}
      <div
        className="border-b backdrop-blur-sm"
        style={{ borderColor: c.line, background: "rgba(255,255,255,0.88)" }}
      >
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
              style={{ background: c.panel, border: `1px solid ${c.line}` }}
            >
              <Building2 className="w-4 h-4" style={{ color: c.charcoal }} />
            </div>
            <div>
              <div className="font-sans text-[16px] font-semibold" style={{ color: c.charcoal }}>
                Companies
              </div>
              <div className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                Manage client instances
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1"
              style={{ color: c.secondary, borderColor: c.line, background: c.panel }}
            >
              <ArrowLeft className="w-3 h-3" />
              Back to Map
            </button>

            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1"
              style={{ color: c.charcoal, borderColor: c.line, background: c.panel }}
            >
              <Plus className="w-3 h-3" />
              New Company
            </button>

            <button
              type="button"
              onClick={signOut}
              className="font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors"
              style={{ color: c.secondary, borderColor: c.line, background: c.panel }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        <AiBoundaryNote
          label="Public Research"
          tone="public"
          detail="Baseline, Research, and Baseline + Research use the company website and public web evidence. They do not use uploaded client files or meeting notes."
        />

        {/* Create modal */}
        {showCreate && (
          <div className="rounded-2xl p-4 shadow-sm" style={{ background: c.panel, border: `1px solid ${c.line}` }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-sans text-[14px] font-semibold" style={{ color: c.charcoal }}>
                  Create company
                </div>
                <div className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                  Creates a new client instance
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="font-mono text-[10px]"
                style={{ color: c.secondary }}
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                  Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Company name"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                  Website
                </label>
                <Input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <button
                type="button"
                disabled={creating}
                onClick={() => handleCreate(false)}
                className="font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50"
                style={{ color: c.secondary, borderColor: c.line, background: c.panel }}
              >
                {creating ? "Creating…" : "Create"}
              </button>

              <button
                type="button"
                disabled={creating}
                onClick={() => handleCreate(true)}
                className="font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 flex items-center gap-1"
                style={{ color: c.charcoal, borderColor: c.line, background: c.panel }}
              >
                <Sparkles className="w-3 h-3" />
                {creating ? "Creating…" : "Create + AI Research"}
              </button>
            </div>
          </div>
        )}

        {/* Companies list card */}
        <div className="rounded-2xl p-4 shadow-sm" style={{ background: c.panel, border: `1px solid ${c.line}` }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-sans text-[14px] font-semibold" style={{ color: c.charcoal }}>
                Company Instances
              </div>
              <div className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                Select which client’s Mojo Map you want to work in
              </div>
            </div>

            {activeCompany && (
              <div className="font-mono text-[10px] uppercase tracking-wide flex items-center gap-1" style={{ color: c.muted }}>
                <Globe className="w-3 h-3" />
                Active:{" "}
                <span style={{ color: c.charcoal }}>{activeCompany.name}</span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
              Loading…
            </div>
          ) : companies.length === 0 ? (
            <div className="py-10 text-center">
              <FileX className="w-5 h-5 mx-auto mb-2" style={{ color: c.muted }} />
              <div className="font-sans text-[14px] font-semibold" style={{ color: c.charcoal }}>
                No companies yet
              </div>
              <div className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                Create one to get started
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {companies.map((company) => {
                const isActive = activeCompany?.id === company.id;
                const isResearching = researchingId === company.id;
                const isBaselining = baselineId === company.id;
                const isCombo = comboId === company.id;
                const hasWebsite = Boolean(company.website?.trim());

                const disabled = isResearching || isBaselining || isCombo;

                return (
                  <div
                    key={company.id}
                    className="p-3 rounded-xl border transition-colors"
                    style={{
                      borderColor: isActive ? c.teal : c.line,
                      background: c.paper,
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveCompanyId(company.id)}
                            className="font-sans text-[14px] font-semibold hover:underline"
                            style={{ color: c.charcoal }}
                          >
                            {company.name}
                          </button>

                          {company.website && (
                            <a
                              href={normalizeUrl(company.website)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="font-mono text-[10px] uppercase tracking-wide"
                              style={{ color: c.secondary }}
                              title={normalizeUrl(company.website)}
                            >
                              {company.website}
                            </a>
                          )}
                        </div>

                        <div className="font-mono text-[10px] mt-1 uppercase tracking-wide" style={{ color: c.muted }}>
                          ID:{" "}
                          <span style={{ color: c.secondary }}>{company.id}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveCompanyId(company.id);
                            navigate("/");
                          }}
                          className="font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1"
                          style={{ color: c.charcoal, borderColor: c.line, background: c.panel }}
                        >
                          View Map <ArrowRight className="w-3 h-3" />
                        </button>

                        {/* NEW: combo button */}
                        <button
                          type="button"
                          onClick={() =>
                            runBaselineAndResearch(
                              company.id,
                              company.name,
                              company.website || ""
                            )
                          }
                          disabled={disabled || !hasWebsite}
                          className="font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1 disabled:opacity-50"
                          style={{ color: c.charcoal, borderColor: c.line, background: c.panel }}
                          title={
                            hasWebsite
                              ? "Run public baseline, then AI research"
                              : "Add a website before running baseline + research"
                          }
                        >
                          <Sparkles className="w-3 h-3" />
                          <Globe className="w-3 h-3" />
                          {isCombo ? "Running…" : "Baseline + Research"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            runResearch(
                              company.id,
                              company.name,
                              company.website || ""
                            )
                          }
                          disabled={disabled}
                          className="font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1 disabled:opacity-50"
                          style={{ color: c.secondary, borderColor: c.line, background: c.panel }}
                        >
                          <Sparkles className="w-3 h-3" />
                          {isResearching ? "Researching…" : "AI Research"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            runPublicBaseline(
                              company.id,
                              company.name,
                              company.website || ""
                            )
                          }
                          disabled={disabled || !hasWebsite}
                          className="font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1 disabled:opacity-50"
                          style={{ color: c.secondary, borderColor: c.line, background: c.panel }}
                          title={
                            hasWebsite
                              ? "Run public baseline from the company website"
                              : "Add a website before running the public baseline"
                          }
                        >
                          <Globe className="w-3 h-3" />
                          {isBaselining ? "Baselining…" : "Web Baseline"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(company.id, company.name)}
                          className="font-mono text-[10px] uppercase tracking-wide hover:opacity-80 px-2 py-1"
                          style={{ color: c.coral }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Public baseline panel (light) */}
        {activeCompany?.id && <PublicBaselinePanel companyId={activeCompany.id} />}

        {activeCompany?.id && (
          <FrameworkProvenancePanel
            companyId={activeCompany.id}
            companyName={activeCompany.name}
          />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="font-mono text-[10px] uppercase tracking-wide"
            style={{ color: c.secondary }}
          >
            Back to Map
          </Link>
          <div className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
            {companies.length} compan{companies.length === 1 ? "y" : "ies"}
          </div>
        </div>
      </div>
    </div>
  );
}
