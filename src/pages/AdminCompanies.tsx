import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompany";
import { useToast } from "@/hooks/use-toast";
import TopNav from "@/components/layout/TopNav";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import AiBoundaryNote from "@/components/AiBoundaryNote";
import {
  Building2,
  Plus,
  Globe,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  FileX,
  PanelRight,
  X,
} from "lucide-react";

type ReviewFinding = {
  artifact?: string;
  field?: string;
  issue?: string;
  suggestion?: string;
};

type ReviewEntry = {
  key?: string;
  review?: {
    pass?: boolean;
    severity?: string;
    summary?: string;
    findings?: ReviewFinding[];
  };
};

type ResearchReviewRun = {
  id: string;
  status: string;
  review_summary: string;
  reviews_json: ReviewEntry[];
  finalizer_applied: boolean;
  created_at: string;
  user_id: string;
};

type CompanyRunLock = {
  company_id: string;
  operation: string;
  started_at: string;
  expires_at: string;
  started_by: string;
};

type InvokeErrorDetails = {
  title: string;
  description: string;
  isTimeout?: boolean;
};

type ArtifactRunSummary = {
  positioning?: {
    market_category?: string;
    proposed_tagline?: string;
  };
  strategy?: {
    winning_aspiration?: string;
    where_to_play?: string;
  };
  counts?: {
    inputs?: number;
    journeys?: number;
    opportunities?: number;
    routes?: number;
  };
};

type ArtifactRunPayload = {
  routes?: Array<{ category?: string; title?: string; pts_value?: number }>;
};

type ResearchArtifactRun = {
  id: string;
  status: string;
  mojo_score: number | null;
  evidence_status: string | null;
  summary_json: ArtifactRunSummary;
  artifacts_json: ArtifactRunPayload;
  created_at: string;
  user_id: string;
};

const COMPANIES_REFRESH_MS = 15000;
const REVIEW_REFRESH_MS = 12000;
const LOCKS_REFRESH_MS = 8000;

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

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function titleCaseWords(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeDisplayName(raw: string | null | undefined) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const local = value.includes("@") ? value.split("@")[0] : value;
  const cleaned = local.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return titleCaseWords(cleaned);
}

async function describeResearchInvokeError(error: unknown) {
  const maybeContext = (() => {
    if (!error || typeof error !== "object") return null;
    const candidate = (error as { context?: { status?: number; text?: () => Promise<string> } }).context;
    if (!candidate || typeof candidate.text !== "function") return null;
    return candidate;
  })();

  if (error instanceof FunctionsHttpError || maybeContext) {
    const statusCode = maybeContext?.status ?? (error instanceof FunctionsHttpError ? error.context.status : 0);
    const payloadText = await (maybeContext?.text?.() ?? Promise.resolve("")).catch(() => "");
    const payload = (() => {
      if (!payloadText) return null;
      try {
        return JSON.parse(payloadText) as {
          error?: string;
          message?: string;
          status?: string;
          reason?: string;
          operation?: string;
          started_at?: string;
          reviews?: Array<{ key?: string; review?: { severity?: string; summary?: string } }>;
        };
      } catch {
        return null;
      }
    })() as {
      error?: string;
      message?: string;
      status?: string;
      reason?: string;
      operation?: string;
      started_at?: string;
      reviews?: Array<{ key?: string; review?: { severity?: string; summary?: string } }>;
    } | null;

    const status = String(payload?.status || "");
    const reason = String(payload?.reason || "");

    if (status === "company_locked") {
      const operation = String(payload?.operation || "another run");
      const startedAt = payload?.started_at ? new Date(payload.started_at).toLocaleTimeString() : "";
      return {
        title: "Company Busy",
        description: `${operation} is already running for this company${startedAt ? ` since ${startedAt}` : ""}. Wait for it to finish, then retry.`,
      } satisfies InvokeErrorDetails;
    }

    if (statusCode === 422) {
      if (
        status === "adjudication_blocked" ||
        status === "public_baseline_not_ready" ||
        status === "missing_evidence_context" ||
        status === "uploaded_context_requires_files" ||
        status === "website_required"
      ) {
        return {
          title: "Evidence Check Blocked",
          description:
            reason ||
            String(payload?.message || payload?.error || "The run stopped during adjudication because required evidence checks failed."),
        };
      }

      if (status === "ambiguous_public_evidence" || status === "insufficient_public_evidence") {
        return {
          title: "Baseline Review Needed",
          description:
            reason ||
            "Baseline evidence is too weak or ambiguous. Run Web Baseline and review the Public Baseline panel before retrying AI Research.",
        };
      }

      if (status === "review_blocked") {
        const summaries = Array.isArray(payload?.reviews)
          ? payload.reviews
              .map((item) => String(item?.review?.summary || "").trim())
              .filter(Boolean)
              .slice(0, 2)
          : [];

        return {
          title: "Draft Review Blocked Save",
          description:
            summaries.length > 0
              ? summaries.join(" ")
              : "The generated draft has high-severity consistency or positioning issues. Review the company context and rerun AI Research.",
        };
      }

      if (status === "job_map_selection_required" || status === "customer_job_map_required") {
        return {
          title: "Job Map Selection Required",
          description:
            status === "customer_job_map_required"
              ? "Define at least one customer job map in Job Steps before running full AI Research."
              : "Choose a job map in Job Steps before running full AI Research.",
        };
      }
    }

    const rawText = [
      String(payload?.error || ""),
      String(payload?.message || ""),
      String(payloadText || ""),
      String(error.message || ""),
    ]
      .join(" ")
      .toLowerCase();

    if (
      statusCode === 504 ||
      rawText.includes("upstream server is timing out") ||
      rawText.includes("gateway timeout") ||
      rawText.includes("timed out")
    ) {
      return {
        title: "Research Still Running",
        description:
          "The request timed out, but research may still be running in the background. Check the running badge and review panel in about 1-2 minutes.",
        isTimeout: true,
      } satisfies InvokeErrorDetails;
    }

    return {
      title: "Research Failed",
      description: String(payload?.message || payload?.error || payloadText || error.message),
    } satisfies InvokeErrorDetails;
  }

  const fallbackMessage = error instanceof Error ? error.message : String(error);
  const fallbackRawText = fallbackMessage.toLowerCase();
  if (
    fallbackRawText.includes("failed to fetch") ||
    fallbackRawText.includes("fetch failed") ||
    fallbackRawText.includes("networkerror") ||
    fallbackRawText.includes("econnrefused") ||
    fallbackRawText.includes("connection refused")
  ) {
    return {
      title: "Research Service Unavailable",
      description:
        "Could not reach the local research function runtime. Restart local Supabase services (especially edge runtime), then retry AI Research.",
    } satisfies InvokeErrorDetails;
  }

  return {
    title: "Research Failed",
    description: fallbackMessage,
  } satisfies InvokeErrorDetails;
}

async function describeBaselineInvokeError(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    const payloadText = await error.context.text().catch(() => "");
    const payload = (() => {
      if (!payloadText) return null;
      try {
        return JSON.parse(payloadText) as {
          error?: string;
          status?: string;
          operation?: string;
          started_at?: string;
        };
      } catch {
        return null;
      }
    })();

    if (error.context.status === 409 && payload?.status === "company_locked") {
      const operation = String(payload.operation || "another run");
      const startedAt = payload.started_at ? new Date(payload.started_at).toLocaleTimeString() : "";
      return {
        title: "Company Busy",
        description: `${operation} is already running for this company${startedAt ? ` since ${startedAt}` : ""}. Wait for it to finish, then retry.`,
      };
    }

    return {
      title: "Web Baseline Failed",
      description: String(payload?.error || payloadText || error.message),
    };
  }

  return {
    title: "Web Baseline Failed",
    description: error instanceof Error ? error.message : String(error),
  };
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
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name_asc" | "name_desc" | "score_desc" | "score_asc">("newest");

  const [researchingId, setResearchingId] = useState<string | null>(null);
  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [comboId, setComboId] = useState<string | null>(null);
  const [recentErrors, setRecentErrors] = useState<Array<{
    id: string;
    title: string;
    description: string;
    createdAt: string;
  }>>([]);
  const [reviewRuns, setReviewRuns] = useState<ResearchReviewRun[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewRefreshKey, setReviewRefreshKey] = useState(0);
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [selectedReviewRunId, setSelectedReviewRunId] = useState<string | null>(null);
  const [artifactRuns, setArtifactRuns] = useState<ResearchArtifactRun[]>([]);
  const [selectedArtifactRunId, setSelectedArtifactRunId] = useState<string | null>(null);
  const [runLocksByCompany, setRunLocksByCompany] = useState<Record<string, CompanyRunLock>>({});
  const [userNamesById, setUserNamesById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = window.sessionStorage.getItem("admin-companies-recent-errors");
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as Array<{
        id: string;
        title: string;
        description: string;
        createdAt: string;
      }>;
      if (Array.isArray(parsed)) {
        setRecentErrors(parsed.slice(0, 8));
      }
    } catch {
      window.sessionStorage.removeItem("admin-companies-recent-errors");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (recentErrors.length === 0) {
      window.sessionStorage.removeItem("admin-companies-recent-errors");
      return;
    }

    window.sessionStorage.setItem(
      "admin-companies-recent-errors",
      JSON.stringify(recentErrors),
    );
  }, [recentErrors]);

  useEffect(() => {
    const companyId = activeCompany?.id;

    if (!companyId) {
      setReviewRuns([]);
      setSelectedReviewRunId(null);
      setArtifactRuns([]);
      setSelectedArtifactRunId(null);
      return;
    }

    let cancelled = false;

    const loadLatestReviewRun = async () => {
      setReviewLoading(true);

      const [{ data: reviewData, error: reviewError }, { data: artifactData, error: artifactError }] =
        await Promise.all([
          supabase
            .from("research_review_runs")
            .select("id, status, review_summary, reviews_json, finalizer_applied, created_at, user_id")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("research_artifact_runs")
            .select("id, status, mojo_score, evidence_status, summary_json, artifacts_json, created_at, user_id")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

      if (cancelled) return;

      if (reviewError) {
        setReviewRuns([]);
        setSelectedReviewRunId(null);
      } else {
        const runs = Array.isArray(reviewData)
          ? reviewData.map((item) => ({
              id: item.id,
              status: item.status,
              review_summary: item.review_summary,
              reviews_json: Array.isArray(item.reviews_json) ? (item.reviews_json as ReviewEntry[]) : [],
              finalizer_applied: Boolean(item.finalizer_applied),
              created_at: item.created_at,
              user_id: item.user_id,
            }))
          : [];

        setReviewRuns(runs);
        setSelectedReviewRunId((current) =>
          current && runs.some((run) => run.id === current) ? current : runs[0]?.id ?? null,
        );
      }

      if (artifactError) {
        setArtifactRuns([]);
        setSelectedArtifactRunId(null);
      } else {
        const runs = Array.isArray(artifactData)
          ? artifactData.map((item) => ({
              id: item.id,
              status: item.status,
              mojo_score: item.mojo_score,
              evidence_status: item.evidence_status,
              summary_json: (item.summary_json as ArtifactRunSummary) ?? {},
              artifacts_json: (item.artifacts_json as ArtifactRunPayload) ?? {},
              created_at: item.created_at,
              user_id: item.user_id,
            }))
          : [];

        setArtifactRuns(runs);
        setSelectedArtifactRunId((current) =>
          current && runs.some((run) => run.id === current) ? current : runs[0]?.id ?? null,
        );
      }

      setReviewLoading(false);
    };

    void loadLatestReviewRun();
    const intervalId = window.setInterval(() => {
      void loadLatestReviewRun();
    }, REVIEW_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeCompany?.id, companies.length, reviewRefreshKey]);

  useEffect(() => {
    if (companies.length === 0) {
      setRunLocksByCompany({});
      return;
    }

    let cancelled = false;

    const loadRunLocks = async () => {
      const { data, error } = await supabase
        .from("company_run_locks")
        .select("company_id, operation, started_at, expires_at, started_by")
        .gt("expires_at", new Date().toISOString());

      if (cancelled) return;

      if (error || !Array.isArray(data)) {
        setRunLocksByCompany({});
        return;
      }

      const next: Record<string, CompanyRunLock> = {};
      for (const item of data) {
        next[item.company_id] = {
          company_id: item.company_id,
          operation: item.operation,
          started_at: item.started_at,
          expires_at: item.expires_at,
          started_by: item.started_by,
        };
      }
      setRunLocksByCompany(next);
    };

    void loadRunLocks();
    const intervalId = window.setInterval(() => {
      void loadRunLocks();
    }, LOCKS_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [companies.length, researchingId, baselineId, comboId, reviewRefreshKey]);

  useEffect(() => {
    const userIds = Array.from(
      new Set([
        ...reviewRuns.map((run) => run.user_id).filter(Boolean),
        ...artifactRuns.map((run) => run.user_id).filter(Boolean),
        ...Object.values(runLocksByCompany).map((lock) => lock.started_by).filter(Boolean),
      ]),
    );

    if (userIds.length === 0) {
      setUserNamesById({});
      return;
    }

    let cancelled = false;

    const loadNames = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);

      if (cancelled) return;

      if (error || !Array.isArray(data)) {
        return;
      }

      const next: Record<string, string> = {};
      for (const row of data) {
        const normalized = normalizeDisplayName(row.display_name);
        next[row.user_id] = normalized || "Team member";
      }

      setUserNamesById((current) => ({ ...current, ...next }));
    };

    void loadNames();
    return () => {
      cancelled = true;
    };
  }, [reviewRuns, artifactRuns, runLocksByCompany]);

  useEffect(() => {
    if (companies.length === 0) return;

    const intervalId = window.setInterval(() => {
      void refetch();
    }, COMPANIES_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [companies.length, refetch]);

  const showPersistentError = (title: string, description: string) => {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      description,
      createdAt: new Date().toLocaleString(),
    };

    setRecentErrors((current) => [entry, ...current].slice(0, 8));
    toast({
      title,
      description,
      variant: "destructive",
      duration: 86400000,
    });
  };

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
      showPersistentError("Create Failed", error.message);
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
      } else {
        toast({
          title: "Company Created",
          description:
            "Created without running research. Use Baseline + Research to populate scores, opportunities, and routes.",
        });
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

    const { error, data } = await supabase.functions.invoke("run-agent-flow", {
      body: {
        company_id: companyId,
        company_name: companyName,
        website: companyWebsite,
        mode: "hybrid",
        include_public_collection: false,
        include_local_alignment: true,
        apply_score_update: true,
        trigger: "admin_research",
        review_mode: "advisory",
        allow_review_block_save: true,
      },
    });

    setResearchingId(null);

    if (error) {
      const details = await describeResearchInvokeError(error);
      if (details.isTimeout) {
        toast({
          title: details.title,
          description: details.description,
        });
        await refetch();
      } else {
        showPersistentError(details.title, details.description);
      }
    } else {
      const flowResult = data && typeof data === "object"
        ? (data as { status?: string; local_alignment_error?: string | null })
        : null;
      toast({
        title: flowResult?.status === "partial" ? "Research Complete (With Warnings)" : "Research Complete",
        description:
          flowResult?.status === "partial"
            ? `Strategic outputs generated for ${companyName}. Output checks had warnings.`
            : `Strategic inputs generated for ${companyName}`,
      });
      await refetch();
    }

    setReviewRefreshKey((current) => current + 1);
  };

  const runPublicBaseline = async (
    companyId: string,
    companyName: string,
    companyWebsite: string
  ) => {
    if (!companyWebsite.trim()) {
      showPersistentError("Website Required", `Add a website for ${companyName} before running the public baseline.`);
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
      const details = await describeBaselineInvokeError(error);
      showPersistentError(details.title, details.description);
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
      setResearchingId(companyId);
      setBaselineId(companyId);
      const { error, data } = await supabase.functions.invoke("run-agent-flow", {
        body: {
          company_id: companyId,
          company_name: companyName,
          website: companyWebsite,
          mode: "hybrid",
          include_public_collection: true,
          include_local_alignment: true,
          apply_score_update: true,
          trigger: "admin_baseline_research",
          review_mode: "advisory",
          allow_review_block_save: true,
        },
      });

      setResearchingId(null);
      setBaselineId(null);

      if (error) {
        const details = await describeResearchInvokeError(error);
        if (details.isTimeout) {
          toast({
            title: details.title,
            description: details.description,
          });
          await refetch();
        } else {
          showPersistentError(details.title, details.description);
        }
        setComboId(null);
        setReviewRefreshKey((current) => current + 1);
        return;
      }

      await refetch();
      const flowResult = data && typeof data === "object"
        ? (data as { status?: string; local_alignment_error?: string | null })
        : null;

      toast({
        title: flowResult?.status === "partial"
          ? "Baseline + Research Complete (With Warnings)"
          : "Baseline + Research Complete",
        description: flowResult?.status === "partial"
          ? `Mojo Map data updated for ${companyName}. Output checks had warnings.`
          : `Mojo Map data + scores updated for ${companyName}`,
      });
      setReviewRefreshKey((current) => current + 1);
    } catch (e: unknown) {
      showPersistentError("Baseline + Research Failed", e instanceof Error ? e.message : String(e));
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
      showPersistentError("Delete Failed", error.message);
      return;
    }
    await refetch();
  };

  const handleCancelRunLock = async (companyId: string) => {
    const { error } = await supabase
      .from("company_run_locks")
      .delete()
      .eq("company_id", companyId)
      .eq("started_by", user?.id || "");

    if (error) {
      showPersistentError("Cancel Run Failed", error.message);
      return;
    }

    if (researchingId === companyId) setResearchingId(null);
    if (baselineId === companyId) setBaselineId(null);
    if (comboId === companyId) setComboId(null);

    toast({
      title: "Run Lock Cleared",
      description: "The company lock was removed. This clears a stuck run badge, but it does not forcibly stop a background function that is still executing.",
    });
    setReviewRefreshKey((current) => current + 1);
  };

  const severityTone = (severity?: string) => {
    const normalized = String(severity || "low").toLowerCase();
    if (normalized === "high") {
      return { border: "#E7C3A4", background: "#FFF7F0", color: "#A44D14" };
    }
    if (normalized === "medium") {
      return { border: "#E4D8AC", background: "#FFFBEA", color: "#8A6B12" };
    }
    return { border: c.line, background: "#F7FBF9", color: c.teal };
  };

  const statusLabel = (status?: string) => {
    const normalized = String(status || "saved");
    return normalized.replace(/_/g, " ");
  };

  const selectedReviewRun =
    reviewRuns.find((run) => run.id === selectedReviewRunId) ?? reviewRuns[0] ?? null;
  const selectedArtifactRun =
    artifactRuns.find((run) => run.id === selectedArtifactRunId) ?? artifactRuns[0] ?? null;

  const labelForUser = (userId?: string) => {
    if (!userId) return "Unknown";
    if (user?.id && userId === user.id) return "You";
    const name = userNamesById[userId];
    if (name) return name;
    return looksLikeUuid(userId) ? "Team member" : userId;
  };

  const filteredCompanies = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    const items = companies.filter((company) => {
      if (!needle) return true;
      return [
        company.name,
        company.website ?? "",
        company.id,
      ].some((value) => value.toLowerCase().includes(needle));
    });

    const sorted = [...items];
    sorted.sort((a, b) => {
      if (sortBy === "oldest") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (sortBy === "name_asc") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "name_desc") {
        return b.name.localeCompare(a.name);
      }
      if (sortBy === "score_desc") {
        return (b.mojo_score ?? -1) - (a.mojo_score ?? -1);
      }
      if (sortBy === "score_asc") {
        return (a.mojo_score ?? 101) - (b.mojo_score ?? 101);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return sorted;
  }, [companies, searchTerm, sortBy]);

  return (
    <div className="min-h-screen" style={{ background: c.bg }}>
      <TopNav />
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
        {recentErrors.length > 0 ? (
          <section
            className="rounded-[24px] border px-5 py-4"
            style={{ borderColor: "#E7C3A4", background: "#FFF7F0" }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-sans text-[18px] font-semibold" style={{ color: c.charcoal }}>
                  Recent Errors
                </h2>
                <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
                  Destructive errors stay here so you can review them even after closing the toast.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRecentErrors([])}
                className="font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full border"
                style={{ color: c.secondary, borderColor: c.line, background: c.panel }}
              >
                Clear
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {recentErrors.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border px-4 py-3"
                  style={{ borderColor: "#E7C3A4", background: "#FFFFFF" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-sans text-[14px] font-semibold" style={{ color: c.charcoal }}>
                        {entry.title}
                      </p>
                      <p className="mt-1 font-sans text-[13px] leading-[1.55]" style={{ color: c.secondary }}>
                        {entry.description}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-start gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                        {entry.createdAt}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setRecentErrors((current) => current.filter((item) => item.id !== entry.id))
                        }
                        className="rounded-full border p-1 transition-colors"
                        style={{ color: c.secondary, borderColor: c.line, background: c.panel }}
                        aria-label={`Dismiss ${entry.title}`}
                        title="Dismiss error"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <AiBoundaryNote
          label="Public Research"
          tone="public"
          detail="Baseline, Research, and Baseline + Research prioritize company website + public web evidence. When public evidence is weak, research now falls back to uploaded company files."
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
                onClick={() => handleCreate(true)}
                className="font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50"
                style={{ color: c.charcoal, borderColor: c.line, background: c.panel }}
              >
                {creating ? "Creating…" : "Create + AI Research"}
              </button>

              <button
                type="button"
                disabled={creating}
                onClick={() => handleCreate(false)}
                className="font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 flex items-center gap-1"
                style={{ color: c.secondary, borderColor: c.line, background: c.panel }}
              >
                <Sparkles className="w-3 h-3" />
                {creating ? "Creating…" : "Create only"}
              </button>
            </div>
          </div>
        )}

        {/* Companies list card */}
        <div className="rounded-2xl p-4 shadow-sm" style={{ background: c.panel, border: `1px solid ${c.line}` }}>
          <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
            <div>
              <div className="font-sans text-[14px] font-semibold" style={{ color: c.charcoal }}>
                Company Instances
              </div>
              <div className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                Sort and browse companies, then open a dedicated research detail page for each one
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeCompany && (
                <div className="font-mono text-[10px] uppercase tracking-wide flex items-center gap-1" style={{ color: c.muted }}>
                  <Globe className="w-3 h-3" />
                  Active:{" "}
                  <span style={{ color: c.charcoal }}>{activeCompany.name}</span>
                </div>
              )}
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search name, website, or id"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-full border px-3 py-2 font-mono text-[10px] uppercase tracking-wide"
                style={{ color: c.secondary, borderColor: c.line, background: c.panel }}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name_asc">Name A-Z</option>
                <option value="name_desc">Name Z-A</option>
                <option value="score_desc">Score High-Low</option>
                <option value="score_asc">Score Low-High</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
              Loading…
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="py-10 text-center">
              <FileX className="w-5 h-5 mx-auto mb-2" style={{ color: c.muted }} />
              <div className="font-sans text-[14px] font-semibold" style={{ color: c.charcoal }}>
                No matching companies
              </div>
              <div className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                Adjust your search or sort to find a company
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCompanies.map((company) => {
                const isActive = activeCompany?.id === company.id;
                const isResearching = researchingId === company.id;
                const isBaselining = baselineId === company.id;
                const isCombo = comboId === company.id;
                const hasWebsite = Boolean(company.website?.trim());
                const activeLock = runLocksByCompany[company.id];
                const isLocked = Boolean(activeLock);

                const disabled = isResearching || isBaselining || isCombo || isLocked;

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

                        <div className="mt-2">
                          <div className="flex flex-wrap items-center gap-3">
                            <Link
                              to={`/admin/companies/${company.id}`}
                              className="font-mono text-[10px] uppercase tracking-wide inline-flex items-center gap-1"
                              style={{ color: c.secondary }}
                            >
                              Open Company
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                            <Link
                              to={`/admin/companies/${company.id}/files`}
                              className="font-mono text-[10px] uppercase tracking-wide inline-flex items-center gap-1"
                              style={{ color: c.secondary }}
                            >
                              Files
                              <ArrowRight className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>

                        <div className="font-mono text-[10px] mt-1 uppercase tracking-wide" style={{ color: c.muted }}>
                          ID:{" "}
                          <span style={{ color: c.secondary }}>{company.id}</span>
                        </div>

                        {activeLock ? (
                          <div className="mt-2 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div
                                className="inline-flex rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide"
                                style={{ color: c.coral, borderColor: "#E7C3A4", background: "#FFF7F0" }}
                              >
                                {activeLock.operation} running
                              </div>
                              {user?.id && activeLock.started_by === user.id ? (
                                <button
                                  type="button"
                                  onClick={() => handleCancelRunLock(company.id)}
                                  className="font-mono text-[10px] uppercase tracking-wide px-3 py-1 rounded-full border transition-colors inline-flex items-center gap-1"
                                  style={{ color: c.secondary, borderColor: c.line, background: c.panel }}
                                  title="Clear a stuck lock that you started. This does not forcibly terminate a running background function."
                                >
                                  Cancel Run
                                </button>
                              ) : null}
                            </div>
                            <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                              Started by {labelForUser(activeLock.started_by)}
                            </p>
                          </div>
                        ) : null}

                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveCompanyId(company.id);
                              setReviewSheetOpen(true);
                              setReviewRefreshKey((current) => current + 1);
                            }}
                            className="font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors inline-flex items-center gap-1"
                            style={{ color: c.secondary, borderColor: c.line, background: c.panel }}
                          >
                            <PanelRight className="w-3 h-3" />
                            View Review
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveCompanyId(company.id);
                            navigate(`/admin/companies/${company.id}`);
                          }}
                          className="font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1"
                          style={{ color: c.charcoal, borderColor: c.line, background: c.panel }}
                        >
                          Open Company <ArrowRight className="w-3 h-3" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveCompanyId(company.id);
                            navigate(`/admin/companies/${company.id}/files`);
                          }}
                          className="font-mono text-[10px] uppercase tracking-wide px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1"
                          style={{ color: c.secondary, borderColor: c.line, background: c.panel }}
                        >
                          Files <ArrowRight className="w-3 h-3" />
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
                            isLocked
                              ? `${activeLock?.operation || "Another run"} is already in progress for this company`
                              : hasWebsite
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
                          title={
                            isLocked
                              ? `${activeLock?.operation || "Another run"} is already in progress for this company`
                              : "Run AI Research"
                          }
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
                            isLocked
                              ? `${activeLock?.operation || "Another run"} is already in progress for this company`
                              : hasWebsite
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

      <Sheet open={reviewSheetOpen} onOpenChange={setReviewSheetOpen}>
        <SheetContent
          side="right"
          className="w-[92vw] sm:max-w-[560px] overflow-y-auto"
          style={{ background: c.bg, borderColor: c.line }}
        >
          <SheetHeader className="pr-8">
            <SheetTitle style={{ color: c.charcoal }}>
              Latest Research Review
            </SheetTitle>
            <SheetDescription style={{ color: c.secondary }}>
              {activeCompany
                ? `Reviewer output for ${activeCompany.name}.`
                : "Select a company to inspect its latest research review."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {reviewLoading ? (
              <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
                Loading latest review…
              </p>
            ) : selectedReviewRun ? (
              <>
                {reviewRuns.length > 1 ? (
                  <div className="space-y-2">
                    <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                      Recent Runs
                    </p>
                    <div className="space-y-2">
                      {reviewRuns.map((run) => (
                        <button
                          key={run.id}
                          type="button"
                          onClick={() => setSelectedReviewRunId(run.id)}
                          className="w-full rounded-2xl border px-3 py-3 text-left transition-colors"
                          style={{
                            borderColor: run.id === selectedReviewRun.id ? c.teal : c.line,
                            background: run.id === selectedReviewRun.id ? "#F7FBF9" : "#FFFFFF",
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                                {new Date(run.created_at).toLocaleString()}
                              </span>
                              <p className="mt-1 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                                By {labelForUser(run.user_id)}
                              </p>
                            </div>
                            <span
                              className="rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-wide"
                              style={{
                                color:
                                  run.status === "review_blocked" ||
                                  run.status === "ambiguous_public_evidence" ||
                                  run.status === "insufficient_public_evidence"
                                    ? c.coral
                                    : c.teal,
                                borderColor: c.line,
                                background: "#FFFFFF",
                              }}
                            >
                              {statusLabel(run.status)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div
                  className="rounded-2xl border px-4 py-4"
                  style={{ borderColor: c.line, background: "#FCFDFB" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-sans text-[15px] font-semibold" style={{ color: c.charcoal }}>
                        {selectedReviewRun.review_summary || "No summary was recorded for this run."}
                      </p>
                      <p className="mt-2 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                        {selectedReviewRun.finalizer_applied ? "Repair pass applied" : "No repair pass needed"}
                      </p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                        Run by {labelForUser(selectedReviewRun.user_id)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div
                        className="inline-flex rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide"
                        style={{
                          color:
                            selectedReviewRun.status === "review_blocked" ||
                            selectedReviewRun.status === "ambiguous_public_evidence" ||
                            selectedReviewRun.status === "insufficient_public_evidence"
                              ? c.coral
                              : c.teal,
                          borderColor: c.line,
                          background: "#F8FBF7",
                        }}
                      >
                        {statusLabel(selectedReviewRun.status)}
                      </div>
                      <p className="mt-2 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                        {new Date(selectedReviewRun.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedReviewRun.reviews_json.map((entry, index) => {
                    const tone = severityTone(entry.review?.severity);
                    const findings = Array.isArray(entry.review?.findings)
                      ? entry.review.findings.filter((finding) => finding?.issue || finding?.suggestion).slice(0, 3)
                      : [];

                    return (
                      <div
                        key={`${entry.key || "review"}-${index}`}
                        className="rounded-2xl border px-4 py-3"
                        style={{ borderColor: tone.border, background: tone.background }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-sans text-[14px] font-semibold capitalize" style={{ color: c.charcoal }}>
                              {String(entry.key || "review").replace(/_/g, " ")}
                            </p>
                            <p className="mt-1 font-sans text-[13px] leading-[1.55]" style={{ color: c.secondary }}>
                              {entry.review?.summary || "No summary available."}
                            </p>
                          </div>
                          <span
                            className="shrink-0 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide"
                            style={{ color: tone.color, borderColor: tone.border, background: "#FFFFFF" }}
                          >
                            {String(entry.review?.severity || "low")}
                          </span>
                        </div>

                        {findings.length > 0 ? (
                          <div className="mt-3 space-y-2">
                            {findings.map((finding, findingIndex) => (
                              <div
                                key={`${entry.key || "review"}-finding-${findingIndex}`}
                                className="rounded-xl border px-3 py-2"
                                style={{ borderColor: c.line, background: "#FFFFFF" }}
                              >
                                <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                                  {finding.artifact || "artifact"}{finding.field ? ` · ${finding.field}` : ""}
                                </p>
                                <p className="mt-1 font-sans text-[13px]" style={{ color: c.charcoal }}>
                                  {finding.issue || "Issue noted."}
                                </p>
                                {finding.suggestion ? (
                                  <p className="mt-1 font-sans text-[12px]" style={{ color: c.secondary }}>
                                    Suggestion: {finding.suggestion}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 space-y-3">
                  <div>
                    <p className="font-sans text-[15px] font-semibold" style={{ color: c.charcoal }}>
                      Saved Output Runs
                    </p>
                    <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
                      Recent saved artifact snapshots for this company.
                    </p>
                  </div>

                  {artifactRuns.length > 0 ? (
                    <>
                      <div className="space-y-2">
                        {artifactRuns.map((run) => (
                          <button
                            key={run.id}
                            type="button"
                            onClick={() => setSelectedArtifactRunId(run.id)}
                            className="w-full rounded-2xl border px-3 py-3 text-left transition-colors"
                            style={{
                              borderColor: run.id === selectedArtifactRun?.id ? c.teal : c.line,
                              background: run.id === selectedArtifactRun?.id ? "#F7FBF9" : "#FFFFFF",
                            }}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                                  {new Date(run.created_at).toLocaleString()}
                                </span>
                                <p className="mt-1 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                                  By {labelForUser(run.user_id)}
                                </p>
                              </div>
                              <div className="text-right">
                                <span
                                  className="rounded-full border px-2 py-1 font-mono text-[10px] uppercase tracking-wide"
                                  style={{ color: c.teal, borderColor: c.line, background: "#FFFFFF" }}
                                >
                                  {statusLabel(run.status)}
                                </span>
                                {typeof run.mojo_score === "number" ? (
                                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.charcoal }}>
                                    Mojo {run.mojo_score}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>

                      {selectedArtifactRun ? (
                        <div
                          className="rounded-2xl border px-4 py-4"
                          style={{ borderColor: c.line, background: "#FCFDFB" }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-sans text-[15px] font-semibold" style={{ color: c.charcoal }}>
                                {selectedArtifactRun.summary_json?.positioning?.market_category || "No market category saved"}
                              </p>
                              <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
                                {selectedArtifactRun.summary_json?.positioning?.proposed_tagline || "No proposed tagline saved"}
                              </p>
                              <p className="mt-2 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                                Evidence: {selectedArtifactRun.evidence_status || "unknown"}
                              </p>
                            </div>
                            {typeof selectedArtifactRun.mojo_score === "number" ? (
                              <span
                                className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide"
                                style={{ color: c.charcoal, borderColor: c.line, background: "#FFFFFF" }}
                              >
                                Mojo {selectedArtifactRun.mojo_score}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="rounded-xl border px-3 py-2" style={{ borderColor: c.line, background: "#FFFFFF" }}>
                              <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                                Counts
                              </p>
                              <p className="mt-1 font-sans text-[13px]" style={{ color: c.charcoal }}>
                                {selectedArtifactRun.summary_json?.counts?.inputs ?? 0} inputs, {selectedArtifactRun.summary_json?.counts?.opportunities ?? 0} opportunities, {selectedArtifactRun.summary_json?.counts?.routes ?? 0} routes
                              </p>
                            </div>
                            <div className="rounded-xl border px-3 py-2" style={{ borderColor: c.line, background: "#FFFFFF" }}>
                              <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                                Strategy
                              </p>
                              <p className="mt-1 font-sans text-[13px]" style={{ color: c.charcoal }}>
                                {selectedArtifactRun.summary_json?.strategy?.where_to_play || "No where-to-play saved"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 space-y-2">
                            <p className="font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                              Top Routes
                            </p>
                            {(selectedArtifactRun.artifacts_json?.routes ?? []).slice(0, 3).map((route, index) => (
                              <div
                                key={`${selectedArtifactRun.id}-route-${index}`}
                                className="rounded-xl border px-3 py-2"
                                style={{ borderColor: c.line, background: "#FFFFFF" }}
                              >
                                <p className="font-sans text-[13px] font-semibold capitalize" style={{ color: c.charcoal }}>
                                  {route.title || "Untitled route"}
                                </p>
                                <p className="mt-1 font-mono text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                                  {route.category || "unknown"} · {route.pts_value ?? 0} pts
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div
                      className="rounded-2xl border px-4 py-4"
                      style={{ borderColor: c.line, background: "#FFFFFF" }}
                    >
                      <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
                        No saved artifact snapshots exist for this company yet.
                      </p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div
                className="rounded-2xl border px-4 py-4"
                style={{ borderColor: c.line, background: c.panel }}
              >
                <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
                  No research review has been saved for this company yet.
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
