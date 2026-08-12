// ============================================================================
// intakeWrites — VERBATIM slice of launch-site-intake's reusable write helpers
// (design gate 2026-08-12, R6). These functions are copied byte-for-byte from
// supabase/functions/launch-site-intake/index.ts so the new importer
// (import-intake-submissions) reproduces its writes EXACTLY. launch-site-intake
// itself is the untouched original — it still defines these inline; this module
// is a copy, and a verbatim-slice check asserts the two match.
//
// Deliberately NOT copied: findOrCreateCompany (the importer replaces it with a
// Fix-A frozen-excluding, deterministic-tiebreaker match), and the handler-only
// helpers (json, getIntakeAutomationMode, corsHeaders).
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type IntakeRequest = {
  where_stuck?: string;
  where_stuck_other?: string;
  decision_slowdowns?: string[];
  customer_confidence?: string;
  last_customer_input?: string;
  momentum_drag?: string;
  momentum_drag_other?: string;
  explicit_strategic_problem?: string;
  desired_outcome?: string;
  desired_outcome_other?: string;
  success_definition?: string;
  company_name?: string;
  website_url?: string;
  industry?: string;
  notes?: string;
  run_initial_public_signal_pass?: boolean;
  submitted_at?: string;
  mojo_snapshot?: {
    starting_mode?: string;
    primary_friction?: string;
    customer_truth_signal?: string;
    top_focus_areas?: string[];
  };
};

type AutomationResult = {
  attempted: boolean;
  triggered: boolean;
  status: number | null;
  message: string;
  payload?: unknown;
};

function present(value?: string | null) {
  const trimmed = String(value || "").trim();
  return trimmed || "Not provided";
}

function normalizeWebsite(value?: string | null) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed;
  }
}

function slugify(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "company";
}

function deriveCompanyName(payload: IntakeRequest, website: string) {
  const explicit = String(payload.company_name || "").trim();
  if (explicit) return explicit;

  if (website) {
    try {
      const hostname = new URL(website).hostname.replace(/^www\./i, "");
      const stem = hostname.split(".")[0] || hostname;
      return stem
        .split(/[-_]/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    } catch {
      // fall through
    }
  }

  return "New Intake Company";
}

function buildIntakeMarkdown(payload: IntakeRequest, companyName: string, website: string) {
  const slowdowns = (payload.decision_slowdowns || []).filter(Boolean).join(", ") || "Not provided";
  const focusAreas = (payload.mojo_snapshot?.top_focus_areas || []).filter(Boolean);
  const submittedAt = payload.submitted_at || new Date().toISOString();

  return [
    "# Launch-Site Intake Brief",
    "",
    `- Company: ${companyName}`,
    `- Website: ${present(website)}`,
    `- Industry: ${present(payload.industry)}`,
    `- Submitted: ${submittedAt}`,
    "",
    "## Strategic Problem",
    present(payload.explicit_strategic_problem),
    "",
    "## Desired Outcome",
    `- Outcome: ${present(payload.desired_outcome)}${payload.desired_outcome_other ? ` (${payload.desired_outcome_other})` : ""}`,
    `- Success definition: ${present(payload.success_definition)}`,
    "",
    "## Intake Signals",
    `- Where stuck: ${present(payload.where_stuck)}${payload.where_stuck_other ? ` (${payload.where_stuck_other})` : ""}`,
    `- Decision slowdowns: ${slowdowns}`,
    `- Customer confidence: ${present(payload.customer_confidence)}`,
    `- Last customer input: ${present(payload.last_customer_input)}`,
    `- Momentum drag: ${present(payload.momentum_drag)}${payload.momentum_drag_other ? ` (${payload.momentum_drag_other})` : ""}`,
    "",
    "## Mojo Snapshot",
    `- Starting mode: ${present(payload.mojo_snapshot?.starting_mode)}`,
    `- Primary friction: ${present(payload.mojo_snapshot?.primary_friction)}`,
    `- Customer truth signal: ${present(payload.mojo_snapshot?.customer_truth_signal)}`,
    `- Top focus areas: ${focusAreas.length ? focusAreas.join(", ") : "Not provided"}`,
    "",
    "## Additional Notes",
    present(payload.notes),
    "",
    `- Run initial public signal pass: ${payload.run_initial_public_signal_pass ? "Yes" : "No"}`,
  ].join("\n");
}

function buildExtractedText(payload: IntakeRequest, companyName: string, website: string) {
  const slowdowns = (payload.decision_slowdowns || []).filter(Boolean).join(", ") || "Not provided";
  const focusAreas = (payload.mojo_snapshot?.top_focus_areas || []).filter(Boolean).join(", ") || "Not provided";

  return [
    `Company: ${companyName}`,
    `Website: ${present(website)}`,
    `Industry: ${present(payload.industry)}`,
    `Strategic problem: ${present(payload.explicit_strategic_problem)}`,
    `Desired outcome: ${present(payload.desired_outcome)}${payload.desired_outcome_other ? ` (${payload.desired_outcome_other})` : ""}`,
    `Success definition: ${present(payload.success_definition)}`,
    `Where stuck: ${present(payload.where_stuck)}${payload.where_stuck_other ? ` (${payload.where_stuck_other})` : ""}`,
    `Decision slowdowns: ${slowdowns}`,
    `Customer confidence: ${present(payload.customer_confidence)}`,
    `Last customer input: ${present(payload.last_customer_input)}`,
    `Momentum drag: ${present(payload.momentum_drag)}${payload.momentum_drag_other ? ` (${payload.momentum_drag_other})` : ""}`,
    `Starting mode: ${present(payload.mojo_snapshot?.starting_mode)}`,
    `Primary friction: ${present(payload.mojo_snapshot?.primary_friction)}`,
    `Customer truth signal: ${present(payload.mojo_snapshot?.customer_truth_signal)}`,
    `Top focus areas: ${focusAreas}`,
    `Notes: ${present(payload.notes)}`,
  ].join("\n");
}

async function resolveActingUser(args: {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleClient: ReturnType<typeof createClient>;
}) {
  const explicitUserId = String(Deno.env.get("INTAKE_AUTORUN_USER_ID") || "").trim();
  if (explicitUserId) {
    return { userId: explicitUserId, authHeader: null as string | null, sessionReady: false };
  }

  const runnerEmail = String(Deno.env.get("INTAKE_AUTORUN_USER_EMAIL") || "").trim();
  const runnerPassword = String(Deno.env.get("INTAKE_AUTORUN_USER_PASSWORD") || "").trim();
  if (runnerEmail && runnerPassword) {
    const authClient = createClient(args.supabaseUrl, args.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await authClient.auth.signInWithPassword({
      email: runnerEmail,
      password: runnerPassword,
    });
    if (error || !data.user || !data.session?.access_token) {
      throw new Error(error?.message || "Could not sign in automation user.");
    }
    return {
      userId: data.user.id,
      authHeader: `Bearer ${data.session.access_token}`,
      sessionReady: true,
    };
  }

  const { data: adminRow, error } = await args.serviceRoleClient
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();
  if (error || !adminRow?.user_id) {
    throw new Error("Could not resolve automation user. Set INTAKE_AUTORUN_USER_ID or runner credentials.");
  }

  return {
    userId: String(adminRow.user_id),
    authHeader: null as string | null,
    sessionReady: false,
  };
}

async function ensureIntakeInput(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  userId: string;
}) {
  const { supabase, companyId, userId } = args;

  const { data: existing } = await supabase
    .from("inputs")
    .select("id")
    .eq("company_id", companyId)
    .eq("input_key", "customer-research")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) return String(existing.id);

  const { data, error } = await supabase
    .from("inputs")
    .insert({
      user_id: userId,
      company_id: companyId,
      input_key: "customer-research",
      input_label: "Client Intake Brief",
      group_key: "market_evidence",
      group_label: "Market Evidence",
      sub_group: "Launch-Site Intake",
      description: "Structured launch-site intake from the first client questionnaire and URL submission.",
      why_it_matters: "Gives the team the client-stated problem framing before deeper research and diagnosis.",
      completeness: 15,
      status: "partial",
      score_impact: 6,
      impact_tier: "med",
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message || "Failed to create intake input.");
  }

  await supabase.from("input_subitems").insert({
    input_id: data.id,
    name: "Review launch-site intake brief",
    done: false,
    sort_order: 0,
  });

  return String(data.id);
}

async function createIntakeFile(args: {
  supabase: ReturnType<typeof createClient>;
  inputId: string;
  userId: string;
  companyName: string;
  payload: IntakeRequest;
}) {
  const safeCompany = slugify(args.companyName);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${timestamp}-launch-site-intake.md`;
  const filePath = `${args.userId}/${safeCompany}/customer-research/${args.inputId}/${fileName}`;
  const markdown = buildIntakeMarkdown(
    args.payload,
    args.companyName,
    normalizeWebsite(args.payload.website_url),
  );
  const extractedText = buildExtractedText(
    args.payload,
    args.companyName,
    normalizeWebsite(args.payload.website_url),
  );

  const { error: uploadErr } = await args.supabase.storage
    .from("input-files")
    .upload(filePath, new Blob([markdown], { type: "text/markdown; charset=utf-8" }), {
      upsert: true,
      contentType: "text/markdown; charset=utf-8",
    });
  if (uploadErr) throw new Error(uploadErr.message || "Failed to upload intake file.");

  const { error: sidecarErr } = await args.supabase.storage
    .from("input-files")
    .upload(`${filePath}.extracted.txt`, new Blob([extractedText], { type: "text/plain; charset=utf-8" }), {
      upsert: true,
      contentType: "text/plain; charset=utf-8",
    });
  if (sidecarErr) throw new Error(sidecarErr.message || "Failed to upload intake sidecar.");

  const { data, error } = await args.supabase
    .from("input_files")
    .insert({
      input_id: args.inputId,
      file_name: fileName,
      file_type: "text/markdown",
      file_path: filePath,
      tags: ["Company", "Strategy", "Intake"],
    })
    .select("id,file_path")
    .single();
  if (error || !data?.id) {
    throw new Error(error?.message || "Failed to create intake file row.");
  }

  return {
    fileId: String(data.id),
    filePath: String(data.file_path),
  };
}

async function upsertStrategicProblem(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  userId: string;
  statement: string;
}) {
  const statement = String(args.statement || "").trim();
  if (!statement) return;

  const { data: existing } = await args.supabase
    .from("strategy_problem_statements")
    .select("id")
    .eq("company_id", args.companyId)
    .eq("source", "intake")
    .eq("statement", statement)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return;

  const { error } = await args.supabase.from("strategy_problem_statements").insert({
    company_id: args.companyId,
    user_id: args.userId,
    statement,
    source: "intake",
    status: "open",
  });
  if (error) {
    throw new Error(error.message || "Failed to store strategic problem.");
  }
}

async function invokeRunAgentFlow(args: {
  supabaseUrl: string;
  anonKey: string;
  authHeader: string | null;
  companyId: string;
  companyName: string;
  website: string;
  runRequested: boolean;
}): Promise<AutomationResult> {
  if (!args.runRequested) {
    return {
      attempted: false,
      triggered: false,
      status: null,
      message: "Automation not requested by intake payload.",
    };
  }

  if (!args.authHeader) {
    return {
      attempted: false,
      triggered: false,
      status: null,
      message: "Automation runner credentials are not configured. Company and intake file were created.",
    };
  }

  const body = {
    company_id: args.companyId,
    company_name: args.companyName,
    website: args.website,
    mode: args.website ? "hybrid" : "uploaded_only",
    include_public_collection: Boolean(args.website),
    include_local_alignment: true,
    apply_score_update: true,
    trigger: "launch_site_intake",
    review_mode: "advisory",
    allow_review_block_save: true,
  };

  const response = await fetch(`${args.supabaseUrl}/functions/v1/run-agent-flow`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: args.anonKey,
      Authorization: args.authHeader,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.error) {
    return {
      attempted: true,
      triggered: false,
      status: response.status,
      message: String(payload?.error || `run-agent-flow failed (${response.status})`),
      payload,
    };
  }

  return {
    attempted: true,
    triggered: true,
    status: response.status,
    message: String(payload?.message || "Agent flow started."),
    payload,
  };
}


export {
  present,
  normalizeWebsite,
  slugify,
  deriveCompanyName,
  buildIntakeMarkdown,
  buildExtractedText,
  resolveActingUser,
  ensureIntakeInput,
  createIntakeFile,
  upsertStrategicProblem,
  invokeRunAgentFlow,
};
export type { IntakeRequest, AutomationResult };
