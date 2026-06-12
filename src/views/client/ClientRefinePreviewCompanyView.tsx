import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany, type Company, type ExcludedSignal } from "@/hooks/useCompany";
import { usePositioningCanvas } from "@/hooks/usePositioningCanvas";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useRoutes } from "@/views/Routes/useRoutes";
import { useSignalLandscape } from "@/hooks/useSignalLandscape";
import { useDirectionEvidence } from "@/hooks/useDirectionEvidence";
import { useFoundationStatus, type FoundationStatus } from "@/hooks/useFoundationStatus";
import { WorkshopSidebar, type SidebarTabKey } from "@/components/client/WorkshopSidebar";
import { getPhaseDefinition, type EngagementPhase } from "@/lib/engagementPhase";
import { relativeTime } from "@/views/client/workshop/helpers";
import {
  CLIENT_REFINE_PREVIEW_ROUTE,
  CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE,
  CLIENT_REFINE_PREVIEW_COMPANY_ROUTE,
} from "@/lib/clientRefinePreview";
import "@/styles/client-refine-preview.css";

// ── Design tokens (hardcoded — outside .crpv-page vars where portals can't reach) ──
const C = {
  ink:      "#111111",
  inkSoft:  "#555555",
  inkFaint: "#999999",
  line:     "#d9d9d9",
  lineSoft: "#ededed",
  paper2:   "#efefec",
  canvas:   "#f6f6f4",
  warm:     "#C4503D",
  signal:   "#ff5b29",
  mono:     '"JetBrains Mono", ui-monospace, monospace',
  inter:    '"Inter", system-ui, sans-serif',
};

// ── Provenance data fetched via one-shot queries ──────────────────────────────

type ProvenanceData = {
  cascadeSource:    string | null;
  cascadeUpdatedAt: string | null;
  posSource:        string | null;
  posUpdatedAt:     string | null;
  routeUpdatedAt:   string | null;
  needsTotal:       number;
  needsDualForm:    number;
  needsLastAt:      string | null;
  lastRunAt:        string | null;
};

function useCompanyProvenance(companyId: string | undefined, refreshKey = 0): ProvenanceData | null {
  const [data, setData] = useState<ProvenanceData | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    Promise.all([
      supabase.from("strategy_cascades")
        .select("source, updated_at")
        .eq("company_id", companyId)
        .eq("artifact_role", "market_read")
        .maybeSingle(),
      supabase.from("positioning_canvases")
        .select("source, updated_at")
        .eq("company_id", companyId)
        .eq("artifact_role", "market_read")
        .maybeSingle(),
      supabase.from("routes")
        .select("updated_at")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("odi_needs")
        .select("created_at, odi_canonical_statement")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase.from("research_artifact_runs")
        .select("created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(([cascade, pos, route, needs, lastRun]) => {
      if (cancelled) return;
      const needsRows = (needs.data ?? []) as Array<{ created_at: string; odi_canonical_statement: string | null }>;
      setData({
        cascadeSource:    (cascade.data as { source?: string | null } | null)?.source ?? null,
        cascadeUpdatedAt: (cascade.data as { updated_at?: string | null } | null)?.updated_at ?? null,
        posSource:        (pos.data as { source?: string | null } | null)?.source ?? null,
        posUpdatedAt:     (pos.data as { updated_at?: string | null } | null)?.updated_at ?? null,
        routeUpdatedAt:   (route.data as { updated_at?: string | null } | null)?.updated_at ?? null,
        needsTotal:       needsRows.length,
        needsDualForm:    needsRows.filter(n => n.odi_canonical_statement != null && n.odi_canonical_statement !== "").length,
        needsLastAt:      needsRows[0]?.created_at ?? null,
        lastRunAt:        (lastRun.data as { created_at?: string | null } | null)?.created_at ?? null,
      });
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, refreshKey]);

  return data;
}

// ── Strategic problem brief hook ──────────────────────────────────────────────

type BriefState = {
  value: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

function useStrategicBrief(companyId: string | undefined) {
  const [state, setState] = useState<BriefState>({ value: null, loading: true, saving: false, error: null });

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    supabase.from("companies")
      .select("strategic_problem_brief")
      .eq("id", companyId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ value: null, loading: false, saving: false, error: error.message });
        } else {
          setState({ value: (data as { strategic_problem_brief: string | null } | null)?.strategic_problem_brief ?? null, loading: false, saving: false, error: null });
        }
      });
    return () => { cancelled = true; };
  }, [companyId]);

  async function save(next: string | null) {
    if (!companyId) return;
    setState(s => ({ ...s, saving: true, error: null }));
    const { error } = await supabase.from("companies")
      .update({ strategic_problem_brief: next })
      .eq("id", companyId);
    if (error) {
      setState(s => ({ ...s, saving: false, error: error.message }));
    } else {
      setState(s => ({ ...s, value: next, saving: false, error: null }));
    }
  }

  return { ...state, save };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Cap({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: 0, fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.13em", color: C.inkFaint }}>
      {children}
    </p>
  );
}

function StatRow({ label, value, faint }: { label: string; value: React.ReactNode; faint?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: `1px solid ${C.lineSoft}`, gap: 12 }}>
      <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.10em", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12, color: faint ? C.inkFaint : C.ink, textAlign: "right", lineHeight: 1.4 }}>{value ?? "—"}</span>
    </div>
  );
}

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
      <Cap>{title}</Cap>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>{children}</div>
    </div>
  );
}

function PhaseBadge({ phase }: { phase: string }) {
  const def = getPhaseDefinition(phase as Parameters<typeof getPhaseDefinition>[0]);
  const isValidate = def.isValidate;
  return (
    <span style={{
      fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.12em",
      color: isValidate ? "#5f3a00" : C.ink,
      background: isValidate ? "#fff3c4" : C.paper2,
      padding: "2px 8px", display: "inline-block",
    }}>
      {def.label}
    </span>
  );
}

function FoundationBadge({ fs }: { fs: FoundationStatus }) {
  const pillars = [fs.positioningSet, fs.strategyMapped, fs.directionCount > 0, fs.wrapPresent].filter(Boolean).length;
  const { label, bg, color } = pillars >= 4
    ? { label: "MAPPED", bg: "#d4edda", color: "#1a5c30" }
    : pillars >= 2
      ? { label: "PARTIAL", bg: "#fff3c4", color: "#5f3a00" }
      : { label: "MINIMAL", bg: "#fde8e8", color: "#7a1a1a" };
  return (
    <span style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.12em", color, background: bg, padding: "2px 8px", display: "inline-block" }}>
      {label}
    </span>
  );
}

function BriefParagraphs({ text }: { text: string }) {
  const paras = text.split(/\n\n+/);
  return (
    <>
      {paras.map((p, i) => (
        <p key={i} style={{ margin: i === 0 ? 0 : "10px 0 0", fontFamily: C.inter, fontSize: 14, color: C.ink, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
          {p}
        </p>
      ))}
    </>
  );
}

function StrategicBriefSection({ companyId }: { companyId: string | undefined }) {
  const { value, loading, saving, error, save } = useStrategicBrief(companyId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const trimmed = value?.trim() ?? "";
  const isEmpty = trimmed === "";

  function openEdit() {
    setDraft(trimmed);
    setEditing(true);
  }

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  async function handleSave() {
    const next = draft.trim() || null;
    await save(next);
    setEditing(false);
  }

  function handleCancel() {
    setEditing(false);
    setDraft("");
  }

  const unchanged = draft.trim() === trimmed;

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <p style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.13em", color: C.inkFaint, margin: 0 }}>
          Strategic Problem Brief
        </p>
        {!editing && !isEmpty && (
          <button
            type="button"
            onClick={openEdit}
            style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: C.inkSoft, background: "none", border: `1px solid ${C.line}`, padding: "2px 10px", cursor: "pointer" }}
          >
            Edit
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ fontFamily: C.mono, fontSize: 11, color: C.inkFaint, margin: 0 }}>Loading…</p>
      ) : editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={6}
            disabled={saving}
            style={{
              width: "100%", fontFamily: C.inter, fontSize: 14, color: C.ink, background: C.canvas,
              border: `1px solid ${C.line}`, padding: "10px 12px", resize: "vertical", lineHeight: 1.65,
              boxSizing: "border-box",
            }}
          />
          {error && (
            <p style={{ fontFamily: C.mono, fontSize: 10, color: C.warm, margin: 0 }}>{error}</p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || unchanged}
              style={{
                fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
                color: saving || unchanged ? C.inkFaint : "#fff",
                background: saving || unchanged ? C.lineSoft : C.ink,
                border: "none", padding: "5px 14px", cursor: saving || unchanged ? "default" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              style={{
                fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
                color: C.inkSoft, background: "none", border: `1px solid ${C.line}`, padding: "5px 14px", cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : isEmpty ? (
        <div style={{ border: `1px solid ${C.lineSoft}`, padding: "20px 22px", background: C.canvas }}>
          <p style={{ fontFamily: C.inter, fontSize: 14, color: C.inkFaint, margin: "0 0 4px" }}>No strategic problem brief yet.</p>
          <p style={{ fontFamily: C.inter, fontSize: 13, color: C.inkFaint, margin: "0 0 14px" }}>Add one to anchor this engagement.</p>
          <button
            type="button"
            onClick={openEdit}
            style={{
              fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
              color: C.ink, background: "none", border: `1px solid ${C.line}`, padding: "4px 12px", cursor: "pointer",
            }}
          >
            Add brief
          </button>
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.line}`, padding: "16px 18px", background: "#fff" }}>
          <BriefParagraphs text={trimmed} />
        </div>
      )}
    </section>
  );
}

// ── Engagement start date (operator-editable) ─────────────────────────────────

function EngagementStartSection({
  companyId,
  currentValue,
  onSaved,
}: {
  companyId: string;
  currentValue: string | null | undefined;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentDate = currentValue ? currentValue.substring(0, 10) : "";
  const displayDate = currentValue
    ? new Date(currentValue).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  function openEdit() {
    setDraft(currentDate);
    setEditing(true);
    setError(null);
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("companies")
      .update({ engagement_started_at: new Date(draft).toISOString() })
      .eq("id", companyId);
    setSaving(false);
    if (err) {
      setError(err.message);
    } else {
      setEditing(false);
      onSaved();
    }
  }

  function handleCancel() {
    setEditing(false);
    setDraft("");
    setError(null);
  }

  const unchanged = draft === currentDate;

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <p style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.13em", color: C.inkFaint, margin: "0 0 2px" }}>
            Engagement Start
          </p>
          <p style={{ fontFamily: C.inter, fontSize: 12, color: C.inkFaint, margin: 0 }}>
            Sets the DAY counter throughout the workspace
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={openEdit}
            style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: C.inkSoft, background: "none", border: `1px solid ${C.line}`, padding: "2px 10px", cursor: "pointer" }}
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="date"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            max={new Date().toISOString().substring(0, 10)}
            disabled={saving}
            style={{
              fontFamily: C.mono, fontSize: 13, color: C.ink, background: C.canvas,
              border: `1px solid ${C.line}`, padding: "8px 12px", boxSizing: "border-box",
            }}
          />
          {error && (
            <p style={{ fontFamily: C.mono, fontSize: 10, color: C.warm, margin: 0 }}>{error}</p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || unchanged || !draft}
              style={{
                fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
                color: (saving || unchanged || !draft) ? C.inkFaint : "#fff",
                background: (saving || unchanged || !draft) ? C.lineSoft : C.ink,
                border: "none", padding: "5px 14px", cursor: (saving || unchanged || !draft) ? "default" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: C.inkSoft, background: "none", border: `1px solid ${C.line}`, padding: "5px 14px", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.line}`, padding: "12px 14px", background: "#fff" }}>
          <p style={{ fontFamily: C.mono, fontSize: 13, color: C.ink, margin: 0 }}>{displayDate}</p>
        </div>
      )}
    </section>
  );
}

// ── Industry vocabulary overrides ─────────────────────────────────────────────

type IndustryVocabState = {
  value: string[];
  loading: boolean;
  saving: boolean;
  error: string | null;
};

function useIndustryVocab(companyId: string | undefined) {
  const [state, setState] = useState<IndustryVocabState>({ value: [], loading: true, saving: false, error: null });

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    supabase.from("companies")
      .select("manual_industry_vocab")
      .eq("id", companyId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setState({ value: [], loading: false, saving: false, error: error.message });
        } else {
          const raw = (data as { manual_industry_vocab?: string[] } | null)?.manual_industry_vocab;
          setState({ value: Array.isArray(raw) ? raw : [], loading: false, saving: false, error: null });
        }
      });
    return () => { cancelled = true; };
  }, [companyId]);

  async function save(next: string[]) {
    if (!companyId) return;
    setState(s => ({ ...s, saving: true, error: null }));
    const { error } = await supabase.from("companies")
      .update({ manual_industry_vocab: next })
      .eq("id", companyId);
    if (error) {
      setState(s => ({ ...s, saving: false, error: error.message }));
    } else {
      setState(s => ({ ...s, value: next, saving: false, error: null }));
    }
  }

  return { ...state, save };
}

function IndustryVocabSection({ companyId }: { companyId: string | undefined }) {
  const { value, loading, saving, error, save } = useIndustryVocab(companyId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const displayValue = value.join(", ");
  const isEmpty = value.length === 0;

  function openEdit() {
    setDraft(displayValue);
    setEditing(true);
  }

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [editing]);

  async function handleSave() {
    const terms = draft.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    await save(terms);
    setEditing(false);
  }

  function handleCancel() {
    setEditing(false);
    setDraft("");
  }

  const unchanged = draft.split(",").map(t => t.trim().toLowerCase()).filter(Boolean).join(",") === value.join(",");

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <p style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.13em", color: C.inkFaint, margin: 0 }}>
          Industry Vocabulary Overrides
        </p>
        {!editing && !isEmpty && (
          <button
            type="button"
            onClick={openEdit}
            style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: C.inkSoft, background: "none", border: `1px solid ${C.line}`, padding: "2px 10px", cursor: "pointer" }}
          >
            Edit
          </button>
        )}
      </div>
      <p style={{ fontFamily: C.inter, fontSize: 12, color: C.inkFaint, margin: "0 0 12px" }}>
        Comma-separated terms from this company's domain that the job map validator should treat as neutral (e.g. <span style={{ fontFamily: C.mono }}>supplier, pricing, terms</span>)
      </p>

      {loading ? (
        <p style={{ fontFamily: C.mono, fontSize: 11, color: C.inkFaint, margin: 0 }}>Loading…</p>
      ) : editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            disabled={saving}
            style={{
              width: "100%", fontFamily: C.mono, fontSize: 12, color: C.ink, background: C.canvas,
              border: `1px solid ${C.line}`, padding: "10px 12px", resize: "vertical", lineHeight: 1.6,
              boxSizing: "border-box",
            }}
          />
          {error && (
            <p style={{ fontFamily: C.mono, fontSize: 10, color: C.warm, margin: 0 }}>{error}</p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || unchanged}
              style={{
                fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
                color: saving || unchanged ? C.inkFaint : "#fff",
                background: saving || unchanged ? C.lineSoft : C.ink,
                border: "none", padding: "5px 14px", cursor: saving || unchanged ? "default" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              style={{
                fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
                color: C.inkSoft, background: "none", border: `1px solid ${C.line}`, padding: "5px 14px", cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : isEmpty ? (
        <div style={{ border: `1px solid ${C.lineSoft}`, padding: "16px 18px", background: C.canvas }}>
          <p style={{ fontFamily: C.inter, fontSize: 13, color: C.inkFaint, margin: "0 0 12px" }}>No vocabulary overrides set.</p>
          <button
            type="button"
            onClick={openEdit}
            style={{
              fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em",
              color: C.ink, background: "none", border: `1px solid ${C.line}`, padding: "4px 12px", cursor: "pointer",
            }}
          >
            Add terms
          </button>
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.line}`, padding: "12px 14px", background: "#fff", display: "flex", flexWrap: "wrap", gap: 6 }}>
          {value.map(term => (
            <span key={term} style={{ fontFamily: C.mono, fontSize: 10, background: C.paper2, border: `1px solid ${C.line}`, padding: "2px 8px", color: C.ink }}>
              {term}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Exclusion filters ─────────────────────────────────────────────────────────

type PublicSourceFiltersData = {
  exclude_domains: string[];
  exclude_source_types: string[];
  include_domains: string[];
  [key: string]: unknown;
};

function parseSourceFilters(raw: Record<string, unknown> | null | undefined): PublicSourceFiltersData {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    ...r,
    exclude_domains: Array.isArray(r.exclude_domains) ? (r.exclude_domains as unknown[]).map(String).filter(Boolean) : [],
    exclude_source_types: Array.isArray(r.exclude_source_types) ? (r.exclude_source_types as unknown[]).map(String).filter(Boolean) : [],
    include_domains: Array.isArray(r.include_domains) ? (r.include_domains as unknown[]).map(String).filter(Boolean) : [],
  };
}

function normalizeDomain(val: string): string {
  return String(val).trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0];
}

function DomainChip({ domain, onRemove }: { domain: string; onRemove?: () => void }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: C.mono, fontSize: 10, background: C.paper2, border: `1px solid ${C.line}`, padding: "2px 8px", color: C.ink }}>
      {domain}
      {onRemove && (
        <button type="button" onClick={onRemove} style={{ background: "none", border: "none", padding: "0 0 0 2px", cursor: "pointer", color: C.inkFaint, fontSize: 11, lineHeight: 1 }} aria-label={`Remove ${domain}`}>×</button>
      )}
    </span>
  );
}

function PublicSourceFiltersBlock({
  companyId,
  initialJson,
  onSaved,
}: {
  companyId: string;
  initialJson: Record<string, unknown> | null | undefined;
  onSaved: () => void;
}) {
  const parsed = parseSourceFilters(initialJson);
  const [editing, setEditing] = useState(false);
  const [domains, setDomains] = useState<string[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function openEdit() {
    setDomains([...parsed.exclude_domains]);
    setInputVal("");
    setInputError(null);
    setSaveError(null);
    setEditing(true);
  }

  function addDomain() {
    const norm = normalizeDomain(inputVal);
    if (!norm) return;
    if (!norm.includes(".")) { setInputError("Enter a valid domain (e.g. squarespace.com)"); return; }
    if (domains.includes(norm)) { setInputError("Already in list"); return; }
    setDomains(d => [...d, norm]);
    setInputVal("");
    setInputError(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    // Flush a valid pending input so a typed domain isn't dropped on Save without Add/Enter.
    const pending = normalizeDomain(inputVal);
    const effectiveDomains = pending && pending.includes(".") && !domains.includes(pending)
      ? [...domains, pending]
      : domains;
    const merged: Record<string, unknown> = { ...(initialJson ?? {}), exclude_domains: effectiveDomains };
    const { error } = await supabase.from("companies")
      .update({ public_source_filters_json: merged })
      .eq("id", companyId);
    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    setDomains(effectiveDomains);
    setInputVal("");
    setEditing(false);
    onSaved();
  }

  function handleCancel() {
    setEditing(false);
    setInputVal("");
    setInputError(null);
    setSaveError(null);
  }

  const readDomains = parsed.exclude_domains;
  const readSourceTypes = parsed.exclude_source_types;
  const readIncludeDomains = parsed.include_domains;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <span style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.11em", color: C.inkSoft }}>Public source filters</span>
          <span style={{ fontFamily: C.inter, fontSize: 12, color: C.inkFaint, marginLeft: 10 }}>Domains excluded from public scraping</span>
        </div>
        {!editing && (
          <button type="button" onClick={openEdit} style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: C.inkSoft, background: "none", border: `1px solid ${C.line}`, padding: "2px 10px", cursor: "pointer" }}>
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 28 }}>
            {domains.length === 0
              ? <span style={{ fontFamily: C.inter, fontSize: 12, color: C.inkFaint }}>No domains excluded</span>
              : domains.map(d => <DomainChip key={d} domain={d} onRemove={() => setDomains(prev => prev.filter(x => x !== d))} />)
            }
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
              <input
                type="text"
                value={inputVal}
                onChange={e => { setInputVal(e.target.value); setInputError(null); }}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addDomain(); } }}
                placeholder="example.com"
                style={{ fontFamily: C.inter, fontSize: 13, color: C.ink, background: C.canvas, border: `1px solid ${C.line}`, padding: "5px 10px", width: "100%", boxSizing: "border-box" }}
              />
              {inputError && <span style={{ fontFamily: C.mono, fontSize: 10, color: C.warm }}>{inputError}</span>}
            </div>
            <button type="button" onClick={addDomain} style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: C.ink, background: "none", border: `1px solid ${C.line}`, padding: "5px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>
              Add
            </button>
          </div>
          {saveError && <p style={{ fontFamily: C.mono, fontSize: 10, color: C.warm, margin: 0 }}>{saveError}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={handleSave} disabled={saving} style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: saving ? C.inkFaint : "#fff", background: saving ? C.lineSoft : C.ink, border: "none", padding: "5px 14px", cursor: saving ? "default" : "pointer" }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={handleCancel} disabled={saving} style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: C.inkSoft, background: "none", border: `1px solid ${C.line}`, padding: "5px 14px", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      ) : readDomains.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: C.inter, fontSize: 13, color: C.inkFaint }}>No domains excluded</span>
          <button type="button" onClick={openEdit} style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: C.ink, background: "none", border: `1px solid ${C.line}`, padding: "2px 10px", cursor: "pointer" }}>
            Add domain
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {readDomains.map(d => <DomainChip key={d} domain={d} />)}
        </div>
      )}

      {/* Read-only other fields */}
      {!editing && (readSourceTypes.length > 0 || readIncludeDomains.length > 0) && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 0 }}>
          {readSourceTypes.length > 0 && (
            <StatRow label="Excl. source types" value={readSourceTypes.join(", ")} faint />
          )}
          {readIncludeDomains.length > 0 && (
            <StatRow label="Include domains" value={readIncludeDomains.join(", ")} faint />
          )}
        </div>
      )}
    </div>
  );
}

function humanReason(reason: string): string {
  return reason.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function ExcludedSignalsBlock({
  companyId,
  excluded,
  onSaved,
}: {
  companyId: string;
  excluded: ExcludedSignal[];
  onSaved: () => void;
}) {
  const [confirmingFp, setConfirmingFp] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeSignal(fp: string) {
    setSaving(true);
    setError(null);
    const next = excluded.filter(e => e.fingerprint !== fp);
    const { error: err } = await supabase.from("companies")
      .update({ excluded_signals_json: next as unknown as Record<string, unknown>[] })
      .eq("id", companyId);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setConfirmingFp(null);
    onSaved();
  }

  return (
    <div>
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.11em", color: C.inkSoft }}>Excluded signals</span>
        <span style={{ fontFamily: C.inter, fontSize: 12, color: C.inkFaint, marginLeft: 10 }}>Signals removed from analysis context</span>
      </div>

      {excluded.length === 0 ? (
        <p style={{ fontFamily: C.inter, fontSize: 13, color: C.inkFaint, margin: 0 }}>No signals excluded</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {error && <p style={{ fontFamily: C.mono, fontSize: 10, color: C.warm, margin: "0 0 6px" }}>{error}</p>}
          {excluded.map(entry => {
            const preview = entry.fingerprint.length > 80 ? entry.fingerprint.slice(0, 80) + "…" : entry.fingerprint;
            const isConfirming = confirmingFp === entry.fingerprint;
            return (
              <div key={entry.fingerprint} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: C.inter, fontSize: 12, color: C.ink, display: "block" }}>{preview}</span>
                  <span style={{ fontFamily: C.mono, fontSize: 9.5, color: C.inkFaint }}>
                    {humanReason(entry.reason)} · {relativeTime(entry.excluded_at)}
                  </span>
                </div>
                <div style={{ flexShrink: 0, display: "flex", gap: 6 }}>
                  {isConfirming ? (
                    <>
                      <button type="button" onClick={() => removeSignal(entry.fingerprint)} disabled={saving} style={{ fontFamily: C.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: saving ? C.inkFaint : C.warm, background: "none", border: `1px solid ${C.line}`, padding: "2px 8px", cursor: saving ? "default" : "pointer" }}>
                        Confirm
                      </button>
                      <button type="button" onClick={() => setConfirmingFp(null)} disabled={saving} style={{ fontFamily: C.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: C.inkSoft, background: "none", border: `1px solid ${C.line}`, padding: "2px 8px", cursor: "pointer" }}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmingFp(entry.fingerprint)} disabled={saving} style={{ fontFamily: C.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.10em", color: C.inkFaint, background: "none", border: `1px solid ${C.line}`, padding: "2px 8px", cursor: "pointer" }}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ExclusionFiltersSection({
  companyId,
  filtersJson,
  excluded,
  onSaved,
}: {
  companyId: string;
  filtersJson: Record<string, unknown> | null | undefined;
  excluded: ExcludedSignal[];
  onSaved: () => void;
}) {
  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.13em", color: C.inkFaint, margin: "0 0 2px" }}>
          Exclusion Filters
        </p>
        <p style={{ fontFamily: C.inter, fontSize: 12, color: C.inkFaint, margin: 0 }}>
          What this engagement should ignore
        </p>
      </div>
      <div style={{ border: `1px solid ${C.line}`, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 0 }}>
        <PublicSourceFiltersBlock companyId={companyId} initialJson={filtersJson} onSaved={onSaved} />
        <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 16 }}>
          <ExcludedSignalsBlock companyId={companyId} excluded={excluded} onSaved={onSaved} />
        </div>
      </div>
    </section>
  );
}

// ── Engagement phase override ─────────────────────────────────────────────────

type SelectablePhase = "diagnose" | "focus" | "flow";

const PHASE_OPTIONS: Array<{ key: SelectablePhase; label: string; tagline: string }> = [
  { key: "diagnose", label: "Diagnose", tagline: "Company docs · interviews · initial strategy draft" },
  { key: "focus",    label: "Focus",    tagline: "Customer needs · importance / satisfaction · prioritised solutions" },
  { key: "flow",     label: "Flow",     tagline: "Track · check in · clear next steps" },
];

const SELECTABLE_KEYS = new Set<string>(["diagnose", "focus", "flow"]);

function EngagementPhaseSection({
  companyId,
  currentPhase,
  onSaved,
}: {
  companyId: string;
  currentPhase: EngagementPhase;
  onSaved: () => void;
}) {
  const activeKey: SelectablePhase | null = SELECTABLE_KEYS.has(currentPhase) ? (currentPhase as SelectablePhase) : null;
  const [pending, setPending] = useState<SelectablePhase | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentDef = getPhaseDefinition(currentPhase);
  const pendingDef = pending ? PHASE_OPTIONS.find(p => p.key === pending) : null;

  function handleSelect(key: SelectablePhase) {
    if (key === activeKey) return;
    if (saving) return;
    setPending(key);
    setError(null);
  }

  async function handleConfirm() {
    if (!pending) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("companies")
      .update({ program_phase: pending })
      .eq("id", companyId);
    setSaving(false);
    if (err) { setError(err.message); return; }
    setPending(null);
    onSaved();
  }

  function handleCancel() {
    setPending(null);
    setError(null);
  }

  const displayKey = pending ?? activeKey;

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.13em", color: C.inkFaint, margin: "0 0 2px" }}>
          Engagement Phase
        </p>
        <p style={{ fontFamily: C.inter, fontSize: 12, color: C.inkFaint, margin: 0 }}>
          How this engagement is currently postured. Changing the phase affects what surfaces show across the app.
        </p>
      </div>

      {/* Phase selector */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        {PHASE_OPTIONS.map(opt => {
          const isActive = displayKey === opt.key;
          const isCurrent = activeKey === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => handleSelect(opt.key)}
              disabled={saving}
              style={{
                textAlign: "left",
                padding: "12px 14px",
                border: isActive ? `2px solid ${C.ink}` : `1px solid ${C.line}`,
                background: isActive ? C.paper2 : "#fff",
                cursor: isCurrent || saving ? "default" : "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span style={{ fontFamily: C.mono, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.10em", color: isActive ? C.ink : C.inkSoft, fontWeight: isActive ? 700 : 400 }}>
                {opt.label}
                {isCurrent && (
                  <span style={{ marginLeft: 6, fontFamily: C.mono, fontSize: 9, color: C.inkFaint, fontWeight: 400, letterSpacing: "0.08em" }}>current</span>
                )}
              </span>
              <span style={{ fontFamily: C.inter, fontSize: 11, color: C.inkFaint, lineHeight: 1.4 }}>{opt.tagline}</span>
            </button>
          );
        })}
      </div>

      {/* Current phase note when outside selectable set */}
      {!SELECTABLE_KEYS.has(currentPhase) && (
        <p style={{ fontFamily: C.mono, fontSize: 10, color: C.inkFaint, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.10em" }}>
          Currently in: {currentDef.label} (non-standard state)
        </p>
      )}

      {/* Inline confirmation */}
      {pending && (
        <div style={{ border: `1px solid ${C.line}`, padding: "12px 14px", background: C.canvas, display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontFamily: C.inter, fontSize: 13, color: C.ink, margin: 0 }}>
            Change engagement phase from <strong>{currentDef.label}</strong> to <strong>{pendingDef?.label}</strong>?
          </p>
          {error && <p style={{ fontFamily: C.mono, fontSize: 10, color: C.warm, margin: 0 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: saving ? C.inkFaint : "#fff", background: saving ? C.lineSoft : C.ink, border: "none", padding: "5px 14px", cursor: saving ? "default" : "pointer" }}
            >
              {saving ? "Saving…" : "Confirm"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: C.inkSoft, background: "none", border: `1px solid ${C.line}`, padding: "5px 14px", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Re-run research ───────────────────────────────────────────────────────────

const PRESERVED_ITEMS = [
  "Strategy cascade (manual_a28)",
  "Approved manual claims",
  "Strategic problem brief",
  "Exclusion filters",
  "Engagement phase",
];

const REGENERATED_ITEMS = [
  "Positioning canvas",
  "Inputs",
  "Public signals",
  "Journeys + outcomes",
  "Opportunities + ODI needs (both forms)",
  "Routes (with WRAP fields)",
];

function RerunResearchSection({
  companyId,
  companyName,
  companyWebsite,
  lastRunAt,
  onSuccess,
}: {
  companyId: string;
  companyName: string;
  companyWebsite: string | null;
  lastRunAt: string | null;
  onSuccess: () => void;
}) {
  type RunPhase = "idle" | "confirming" | "running" | "error";
  const [runPhase, setRunPhase] = useState<RunPhase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);

  async function handleConfirm() {
    setRunPhase("running");
    setErrorMsg(null);
    setStartedAt(new Date().toISOString());
    const { error } = await supabase.functions.invoke("research-company", {
      body: {
        company_id: companyId,
        company_name: companyName,
        website: companyWebsite ?? "",
        journey_key: "customer",
        review_mode: "advisory",
      },
    });
    if (error) {
      setRunPhase("error");
      setErrorMsg(error.message || "Research re-run failed.");
      return;
    }
    setRunPhase("idle");
    setStartedAt(null);
    onSuccess();
  }

  const isRunning = runPhase === "running";

  return (
    <section style={{ marginBottom: 36 }}>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.13em", color: C.inkFaint, margin: "0 0 2px" }}>
          Re-run Research
        </p>
        <p style={{ fontFamily: C.inter, fontSize: 12, color: C.inkFaint, margin: 0 }}>
          Refresh this engagement's research context against the latest public signals. Manual strategy cascade and approved claims are preserved; system-sourced artifacts are regenerated.
        </p>
      </div>

      {/* Primary button row */}
      <div style={{ marginBottom: 12 }}>
        <button
          type="button"
          disabled={isRunning}
          onClick={() => {
            if (runPhase === "confirming") return;
            setRunPhase("confirming");
            setErrorMsg(null);
          }}
          style={{
            fontFamily: C.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.10em",
            color: isRunning ? C.inkFaint : "#fff",
            background: isRunning ? C.lineSoft : C.ink,
            border: "none", padding: "8px 18px", cursor: isRunning ? "default" : "pointer",
            marginBottom: 8,
          }}
        >
          {isRunning ? "Running…" : "Re-run Research"}
        </button>
        <p style={{ fontFamily: C.inter, fontSize: 12, color: C.inkFaint, margin: 0 }}>
          {isRunning && startedAt
            ? `Started ${relativeTime(startedAt)}. This can take several minutes.`
            : lastRunAt
              ? `Takes several minutes. Last run: ${relativeTime(lastRunAt)}.`
              : "Takes several minutes. No prior runs."}
        </p>
      </div>

      {/* Error state */}
      {runPhase === "error" && errorMsg && (
        <p style={{ fontFamily: C.mono, fontSize: 10, color: C.warm, margin: "0 0 10px" }}>{errorMsg}</p>
      )}

      {/* Confirmation panel */}
      {runPhase === "confirming" && (
        <div style={{ border: `1px solid ${C.line}`, padding: "16px 18px", background: C.canvas, display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ fontFamily: C.inter, fontSize: 14, fontWeight: 600, color: C.ink, margin: 0 }}>
            Re-run research for {companyName}?
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <p style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.11em", color: "#1a5c30", margin: "0 0 8px" }}>
                Preserved
              </p>
              <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3 }}>
                {PRESERVED_ITEMS.map(item => (
                  <li key={item} style={{ fontFamily: C.inter, fontSize: 12, color: C.inkSoft }}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.11em", color: "#7a1a1a", margin: "0 0 8px" }}>
                Regenerated
              </p>
              <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 3 }}>
                {REGENERATED_ITEMS.map(item => (
                  <li key={item} style={{ fontFamily: C.inter, fontSize: 12, color: C.inkSoft }}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <p style={{ fontFamily: C.inter, fontSize: 12, color: C.inkSoft, fontStyle: "italic", margin: 0 }}>
            Takes several minutes. Don't close this tab while it's running.
          </p>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleConfirm}
              style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: "#fff", background: C.ink, border: "none", padding: "5px 14px", cursor: "pointer" }}
            >
              Re-run
            </button>
            <button
              type="button"
              onClick={() => { setRunPhase("idle"); setErrorMsg(null); }}
              style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.10em", color: C.inkSoft, background: "none", border: `1px solid ${C.line}`, padding: "5px 14px", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function sourceLabel(raw: string | null | undefined): string {
  if (!raw) return "—";
  if (raw === "manual_a28") return "manual (A28)";
  if (raw.startsWith("manual")) return "manual";
  if (raw === "system") return "system";
  return raw;
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function ClientRefinePreviewCompanyView() {
  const navigate = useNavigate();
  const { activeCompany, refetch } = useCompany() as { activeCompany: Company | null; refetch: () => Promise<void> };
  const companyId = activeCompany?.id;
  const [provenanceRefreshKey, setProvenanceRefreshKey] = useState(0);

  const { item: positioning } = usePositioningCanvas(companyId);
  const { item: cascade } = useStrategyCascade(companyId);
  const { items: routes } = useRoutes(companyId);
  const { landscape } = useSignalLandscape(companyId);
  const directionEvidence = useDirectionEvidence(companyId, routes);
  const foundationStatus = useFoundationStatus(companyId, positioning, cascade, routes, directionEvidence);
  const provenance = useCompanyProvenance(companyId, provenanceRefreshKey);

  const topLevelRoutes = routes.filter(r => r.level === "route");
  const wrapCount = topLevelRoutes.filter(r =>
    (r.rejected_alternatives?.length ?? 0) > 0 &&
    (r.what_would_have_to_be_true?.length ?? 0) > 0,
  ).length;

  function goTab(tab: SidebarTabKey) {
    navigate(`${CLIENT_REFINE_PREVIEW_WORKSHOP_ROUTE}?tab=${tab}`);
  }

  return (
    <div className="crpv-page" style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <div className="crpv-ws-body" style={{ flex: 1 }}>
        <WorkshopSidebar
          activeTab="__company__"
          onTabClick={goTab}
          onHome={() => navigate(CLIENT_REFINE_PREVIEW_ROUTE)}
          onCompany={() => navigate(CLIENT_REFINE_PREVIEW_COMPANY_ROUTE)}
        />

        <div className="crpv-ws-content-col" style={{ overflowY: "auto" }}>
          <div style={{ padding: "32px 36px", maxWidth: 860 }}>

            {/* ── Company essentials ── */}
            <section style={{ marginBottom: 36 }}>
              <p style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.13em", color: C.inkFaint, margin: "0 0 8px" }}>
                Company · Operator view
              </p>
              <h1 style={{ margin: "0 0 10px", fontFamily: C.inter, fontSize: 28, fontWeight: 700, color: C.ink, lineHeight: 1.2 }}>
                {activeCompany?.name ?? "—"}
              </h1>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                {activeCompany?.website && (
                  <a
                    href={activeCompany.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 13, color: C.inkSoft, textDecoration: "underline", fontFamily: C.inter }}
                  >
                    {activeCompany.website}
                  </a>
                )}
                {activeCompany && <PhaseBadge phase={activeCompany.engagement_phase} />}
                {provenance?.lastRunAt && (
                  <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.10em" }}>
                    Ran {relativeTime(provenance.lastRunAt)}
                  </span>
                )}
              </div>
            </section>

            {/* ── Engagement start date ── */}
            {companyId && (
              <EngagementStartSection
                companyId={companyId}
                currentValue={activeCompany?.engagement_started_at}
                onSaved={refetch}
              />
            )}

            {/* ── Strategic problem brief ── */}
            <StrategicBriefSection companyId={companyId} />

            {/* ── Industry vocabulary overrides ── */}
            <IndustryVocabSection companyId={companyId} />

            {/* ── Exclusion filters ── */}
            {companyId && (
              <ExclusionFiltersSection
                companyId={companyId}
                filtersJson={activeCompany?.public_source_filters_json ?? null}
                excluded={activeCompany?.excluded_signals_json ?? []}
                onSaved={refetch}
              />
            )}

            {/* ── Engagement phase ── */}
            {companyId && (
              <EngagementPhaseSection
                companyId={companyId}
                currentPhase={activeCompany.engagement_phase}
                onSaved={refetch}
              />
            )}

            {/* ── Re-run research ── */}
            {companyId && (
              <RerunResearchSection
                companyId={companyId}
                companyName={activeCompany.name}
                companyWebsite={activeCompany.website ?? null}
                lastRunAt={provenance?.lastRunAt ?? null}
                onSuccess={() => {
                  void refetch();
                  setProvenanceRefreshKey(k => k + 1);
                }}
              />
            )}

            {/* ── Artifact provenance ── */}
            <section>
              <p style={{ fontFamily: C.mono, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.13em", color: C.inkFaint, margin: "0 0 16px" }}>
                Artifact provenance
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

                {/* Cascade */}
                <PanelCard title="Cascade">
                  <StatRow label="Source" value={sourceLabel(provenance?.cascadeSource)} />
                  <StatRow label="Last updated" value={relativeTime(provenance?.cascadeUpdatedAt) || "—"} />
                  {cascade?.winning_aspiration && (
                    <StatRow
                      label="Aspiration"
                      value={cascade.winning_aspiration.length > 80
                        ? cascade.winning_aspiration.slice(0, 80) + "…"
                        : cascade.winning_aspiration}
                      faint
                    />
                  )}
                </PanelCard>

                {/* Positioning */}
                <PanelCard title="Positioning">
                  <StatRow label="Source" value={sourceLabel(provenance?.posSource)} />
                  <StatRow label="Last updated" value={relativeTime(provenance?.posUpdatedAt) || "—"} />
                  {positioning?.market_category && (
                    <StatRow
                      label="Category"
                      value={positioning.market_category.length > 80
                        ? positioning.market_category.slice(0, 80) + "…"
                        : positioning.market_category}
                      faint
                    />
                  )}
                </PanelCard>

                {/* Routes */}
                <PanelCard title="Routes">
                  <StatRow label="Top-level" value={topLevelRoutes.length} />
                  <StatRow
                    label="WRAP populated"
                    value={topLevelRoutes.length > 0
                      ? `${wrapCount} / ${topLevelRoutes.length}`
                      : "—"}
                  />
                  <StatRow label="Last updated" value={relativeTime(provenance?.routeUpdatedAt) || "—"} />
                </PanelCard>

                {/* Opportunities */}
                <PanelCard title="Opportunities">
                  <StatRow label="Total" value={provenance?.needsTotal ?? "—"} />
                  <StatRow
                    label="Dual-form"
                    value={provenance != null
                      ? `${provenance.needsDualForm} / ${provenance.needsTotal}`
                      : "—"}
                  />
                  <StatRow label="Last generated" value={relativeTime(provenance?.needsLastAt) || "—"} />
                </PanelCard>

                {/* Signals */}
                <PanelCard title="Signals">
                  <StatRow label="Customer" value={landscape?.byBand.customer.count ?? "—"} />
                  <StatRow label="Team / Org" value={landscape?.byBand.organization.count ?? "—"} />
                  <StatRow label="Public / Outside" value={landscape?.byBand.outside.count ?? "—"} />
                </PanelCard>

                {/* Foundation status */}
                <PanelCard title="Foundation status">
                  {foundationStatus ? (
                    <>
                      <div style={{ padding: "6px 0 10px" }}>
                        <FoundationBadge fs={foundationStatus} />
                      </div>
                      <StatRow label="Positioning" value={foundationStatus.positioningSet ? "Set" : "Incomplete"} faint={!foundationStatus.positioningSet} />
                      <StatRow label="Strategy" value={foundationStatus.strategyMapped ? "Mapped" : `${foundationStatus.cascadeElementCount} / 3`} faint={!foundationStatus.strategyMapped} />
                      <StatRow label="Directions" value={foundationStatus.directionCount > 0 ? foundationStatus.directionCount : "None"} faint={foundationStatus.directionCount === 0} />
                      <StatRow label="WRAP" value={foundationStatus.wrapPresent ? "Complete" : "Incomplete"} faint={!foundationStatus.wrapPresent} />
                    </>
                  ) : (
                    <StatRow label="Status" value="Loading…" faint />
                  )}
                </PanelCard>

              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
