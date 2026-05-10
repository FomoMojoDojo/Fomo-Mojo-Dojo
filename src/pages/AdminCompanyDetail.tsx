import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCompany } from "@/hooks/useCompany";
import { PublicBaselinePanel } from "@/components/PublicBaselinePanel";
import FrameworkProvenancePanel from "@/components/admin/FrameworkProvenancePanel";
import CompanyFilesPanel from "@/components/admin/CompanyFilesPanel";
import CouncilRecommendationsPanel from "@/components/admin/CouncilRecommendationsPanel";
import EvidenceInspectorPanel from "@/components/admin/EvidenceInspectorPanel";
import StrategicHypothesesPanel from "@/components/admin/StrategicHypothesesPanel";
import PublicSourceFiltersPanel from "@/components/admin/PublicSourceFiltersPanel";
import AiBoundaryNote from "@/components/AiBoundaryNote";
import TopNav from "@/components/layout/TopNav";
import { ArrowLeft, ArrowRight, Building2, Globe } from "lucide-react";

const c = {
  bg: "#070d20",
  panel: "rgba(255,255,255,0.04)",
  paper: "rgba(255,255,255,0.04)",
  line: "rgba(136, 163, 218, 0.24)",
  charcoal: "#eef4ff",
  secondary: "#c1cceb",
  muted: "#95a6d3",
};

function normalizeUrl(url?: string) {
  const u = (url ?? "").trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `https://${u}`;
}

export default function AdminCompanyDetail() {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const { companies, activeCompany, setActiveCompanyId, loading, refetch } = useCompany();

  const company = companies.find((entry) => entry.id === companyId) ?? null;

  useEffect(() => {
    if (company && activeCompany?.id !== company.id) {
      setActiveCompanyId(company.id);
    }
  }, [company, activeCompany?.id, setActiveCompanyId]);

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: c.bg }}>
        <TopNav />
        <div className="flex items-center justify-center py-16">
          <div className="font-mono text-[12px] tracking-[0.06em]" style={{ color: c.muted }}>
            Loading company…
          </div>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen" style={{ background: c.bg }}>
        <TopNav />
        <div className="max-w-5xl mx-auto px-6 py-10">
          <Link
            to="/admin/companies"
            className="font-mono text-[11px] tracking-[0.06em] inline-flex items-center gap-1"
            style={{ color: c.secondary }}
          >
            <ArrowLeft className="w-3 h-3" />
            Back to Companies
          </Link>
          <div className="mt-6 rounded-2xl border p-6" style={{ borderColor: c.line, background: c.panel }}>
            <div className="font-sans text-[18px] font-semibold" style={{ color: c.charcoal }}>
              Company not found
            </div>
            <div className="mt-2 font-sans text-[14px]" style={{ color: c.secondary }}>
              This company may have been deleted or the link is no longer valid.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: c.bg,
        backgroundImage:
          "radial-gradient(1200px 500px at 18% -12%, rgba(52,210,190,0.16), transparent), radial-gradient(900px 420px at 92% 2%, rgba(255,140,75,0.12), transparent), linear-gradient(180deg,#070d20 0%, #0b1530 100%)",
      }}
    >
      <TopNav />
      <div
        className="border-b backdrop-blur-sm"
        style={{ borderColor: c.line, background: "rgba(10,16,39,0.92)" }}
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
                {company.name}
              </div>
              <div className="font-mono text-[11px] tracking-[0.08em]" style={{ color: c.muted }}>
                Company Research Detail
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/admin/companies")}
              className="font-mono text-[11px] tracking-[0.06em] px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1"
              style={{ color: c.secondary, borderColor: c.line, background: c.panel }}
            >
              <ArrowLeft className="w-3 h-3" />
              Back to Companies
            </button>

            <button
              type="button"
              onClick={() => navigate("/")}
              className="font-mono text-[11px] tracking-[0.06em] px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1"
              style={{ color: c.charcoal, borderColor: c.line, background: c.panel }}
            >
              View Map
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        <AiBoundaryNote
          label="Public Research"
          tone="public"
          detail="Baseline, Research, and Baseline + Research prioritize company website + public web evidence. When public evidence is weak, research now falls back to uploaded company files."
        />

        <section
          className="rounded-2xl p-5 shadow-sm"
          style={{ background: c.panel, border: `1px solid ${c.line}`, boxShadow: "0 20px 48px -38px rgba(0,0,0,0.9)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-sans text-[20px] font-semibold" style={{ color: c.charcoal }}>
                {company.name}
              </div>
              <div className="mt-2 font-mono text-[11px] tracking-[0.06em]" style={{ color: c.muted }}>
                Company ID: <span style={{ color: c.secondary }}>{company.id}</span>
              </div>
              {company.website ? (
                <a
                  href={normalizeUrl(company.website)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.04em] break-all"
                  style={{ color: c.secondary }}
                >
                  <Globe className="w-3 h-3" />
                  {company.website}
                </a>
              ) : (
                <div className="mt-3 font-mono text-[11px] tracking-[0.06em]" style={{ color: c.muted }}>
                  No website saved
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="rounded-full border px-3 py-1 font-mono text-[11px] tracking-[0.06em]" style={{ color: c.secondary, borderColor: c.line, background: c.paper }}>
                Mojo {company.mojo_score ?? "—"}
              </div>
              <div className="rounded-full border px-3 py-1 font-mono text-[11px] tracking-[0.06em]" style={{ color: c.secondary, borderColor: c.line, background: c.paper }}>
                Reachable {company.potential_score ?? "—"}
              </div>
              <div className="rounded-full border px-3 py-1 font-mono text-[11px] tracking-[0.06em]" style={{ color: c.secondary, borderColor: c.line, background: c.paper }}>
                Evidence {company.evidence_status ?? "unknown"}
              </div>
            </div>
          </div>
        </section>

        <PublicBaselinePanel companyId={company.id} />

        <PublicSourceFiltersPanel
          companyId={company.id}
          initialFiltersJson={company.public_source_filters_json}
          onSaved={refetch}
        />

        <EvidenceInspectorPanel companyId={company.id} />

        <StrategicHypothesesPanel companyId={company.id} />

        <CompanyFilesPanel companyId={company.id} companyName={company.name} mode="preview" />

        <CouncilRecommendationsPanel companyId={company.id} companyName={company.name} />

        <FrameworkProvenancePanel companyId={company.id} companyName={company.name} />
      </div>
    </div>
  );
}
