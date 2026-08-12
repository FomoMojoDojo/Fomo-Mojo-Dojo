import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-intake-token",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

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
  // Gate DH populates this from the DreamHost POST (Option B: what the client saw on finishing).
  // Absent/null-tolerant — the Cafe Barra backfill has none and the results page may be simplified.
  completion_view?: Record<string, unknown> | null;
};

type AutomationResult = {
  attempted: boolean;
  triggered: boolean;
  status: number | null;
  message: string;
  payload?: unknown;
};

type IntakeAutomationMode = "full" | "intake_stub" | "company_only";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

function getIntakeAutomationMode(): IntakeAutomationMode {
  const raw = String(Deno.env.get("INTAKE_AUTORUN_MODE") || "full").trim().toLowerCase();
  if (raw === "company_only") return "company_only";
  if (raw === "intake_stub") return "intake_stub";
  return "full";
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

async function findOrCreateCompany(args: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  companyName: string;
  website: string;
}) {
  const { supabase, userId, companyName, website } = args;

  let existing: { id: string; name: string; website: string | null } | null = null;

  if (website) {
    const { data } = await supabase
      .from("companies")
      .select("id,name,website")
      .eq("website", website)
      .limit(1)
      .maybeSingle();
    existing = (data as { id: string; name: string; website: string | null } | null) ?? null;
  }

  if (!existing) {
    const { data } = await supabase
      .from("companies")
      .select("id,name,website")
      .ilike("name", companyName)
      .limit(1)
      .maybeSingle();
    existing = (data as { id: string; name: string; website: string | null } | null) ?? null;
  }

  if (existing) {
    if (website && !String(existing.website || "").trim()) {
      await supabase.from("companies").update({ website }).eq("id", existing.id);
      existing.website = website;
    }
    return { companyId: existing.id, created: false };
  }

  const { data, error } = await supabase
    .from("companies")
    .insert({
      name: companyName,
      website,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message || "Failed to create company.");
  }

  return { companyId: String(data.id), created: true };
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
  const intakeDate = new Date().toISOString().slice(0, 10);
  // Human-readable DISPLAY name (Evidence Memory renders this); storage key stays ASCII-safe.
  const fileName = `Client Intake — ${args.companyName} — ${intakeDate}.md`;
  const storageName = `${timestamp}-client-intake.md`;
  const filePath = `${args.userId}/${safeCompany}/customer-research/${args.inputId}/${storageName}`;
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

// Gate S — store the quiz answers as structured data (one row per submission). Upsert on
// (company_id, submission_key) so a re-import is idempotent; a NULL submission_key is distinct in
// the UNIQUE, so multiple NULL-keyed submissions coexist. completion_view is stored when present.
async function insertIntakeResponse(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  userId: string;
  submissionKey: string | null;
  payload: IntakeRequest;
}) {
  const p = args.payload;
  const { error } = await args.supabase.from("intake_responses").upsert(
    {
      company_id: args.companyId,
      user_id: args.userId,
      submission_key: args.submissionKey,
      source: "intake",
      submitted_at: p.submitted_at || null,
      where_stuck: p.where_stuck || null,
      where_stuck_other: p.where_stuck_other || null,
      decision_slowdowns: (p.decision_slowdowns || []).filter(Boolean),
      customer_confidence: p.customer_confidence || null,
      last_customer_input: p.last_customer_input || null,
      momentum_drag: p.momentum_drag || null,
      momentum_drag_other: p.momentum_drag_other || null,
      explicit_strategic_problem: p.explicit_strategic_problem || null,
      desired_outcome: p.desired_outcome || null,
      desired_outcome_other: p.desired_outcome_other || null,
      success_definition: p.success_definition || null,
      notes: p.notes || null,
      run_initial_public_signal_pass:
        typeof p.run_initial_public_signal_pass === "boolean" ? p.run_initial_public_signal_pass : null,
      mojo_snapshot: p.mojo_snapshot ?? null,
      completion_view: p.completion_view ?? null,
    },
    { onConflict: "company_id,submission_key", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message || "Failed to store intake response.");
}

// R5 (Act-1 seam): seed companies.strategic_problem_brief from the intake's stated problem, but
// NEVER clobber an existing value — operator edits win forever. The reader
// (generate-first-read-stated-problem) is untouched; this only fills an empty field.
async function stampStrategicProblemBrief(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  problem: string;
}) {
  const problem = String(args.problem || "").trim();
  if (!problem) return;
  const { data } = await args.supabase
    .from("companies")
    .select("strategic_problem_brief")
    .eq("id", args.companyId)
    .single();
  const existing = String(
    (data as { strategic_problem_brief?: string | null } | null)?.strategic_problem_brief || "",
  ).trim();
  if (existing) return; // clobber guard — do not overwrite an operator edit
  const { error } = await args.supabase
    .from("companies")
    .update({ strategic_problem_brief: problem })
    .eq("id", args.companyId);
  if (error) throw new Error(error.message || "Failed to stamp strategic problem brief.");
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    // SHARED-TOKEN GATE (2026-08-10 ruling). This function stays verify_jwt=false so the public
    // marketing-site form (no user account) can reach it — but it is authorized here, before any
    // parse or write, by a shared secret. Primary gate: the dedicated `x-intake-token` header vs the
    // INTAKE_SHARED_TOKEN secret. Backward-compat: the pre-existing `Authorization: Bearer
    // <MOJOMAP_AUTORUN_WEBHOOK_TOKEN>` webhook token is still accepted so a live caller isn't broken
    // (operator TODO: migrate the form to send x-intake-token, then retire the legacy path). A request
    // is authorized iff it presents a non-empty, correct value for at least one configured secret.
    const intakeToken = String(Deno.env.get("INTAKE_SHARED_TOKEN") || "").trim();
    const legacyToken = String(Deno.env.get("MOJOMAP_AUTORUN_WEBHOOK_TOKEN") || "").trim();
    const receivedIntake = String(req.headers.get("x-intake-token") || "").trim();
    const authHeader = String(req.headers.get("Authorization") || "").trim();
    const receivedLegacy = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const intakeOk = intakeToken.length > 0 && receivedIntake === intakeToken;
    const legacyOk = legacyToken.length > 0 && receivedLegacy === legacyToken;
    if (!intakeOk && !legacyOk) {
      return json({ error: "Unauthorized intake request." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRole || !anonKey) {
      return json({ error: "Missing Supabase env vars." }, 500);
    }

    const payload = (await req.json().catch(() => ({}))) as IntakeRequest;
    const website = normalizeWebsite(payload.website_url);
    const companyName = deriveCompanyName(payload, website);
    const mode = getIntakeAutomationMode();
    if (!companyName) return json({ error: "company_name or website_url is required." }, 400);

    const supabase = createClient(supabaseUrl, serviceRole);
    const actingUser = await resolveActingUser({
      supabaseUrl,
      anonKey,
      serviceRoleClient: supabase,
    });

    const company = await findOrCreateCompany({
      supabase,
      userId: actingUser.userId,
      companyName,
      website,
    });

    let inputId: string | null = null;
    let intakeFile: { fileId: string; filePath: string } | null = null;

    if (mode !== "company_only") {
      inputId = await ensureIntakeInput({
        supabase,
        companyId: company.companyId,
        userId: actingUser.userId,
      });

      intakeFile = await createIntakeFile({
        supabase,
        inputId,
        userId: actingUser.userId,
        companyName,
        payload,
      });

      await upsertStrategicProblem({
        supabase,
        companyId: company.companyId,
        userId: actingUser.userId,
        statement: String(payload.explicit_strategic_problem || ""),
      });

      await insertIntakeResponse({
        supabase,
        companyId: company.companyId,
        userId: actingUser.userId,
        submissionKey: null,
        payload,
      });
      await stampStrategicProblemBrief({
        supabase,
        companyId: company.companyId,
        problem: String(payload.explicit_strategic_problem || ""),
      });
    }

    const automation = mode === "full"
      ? await invokeRunAgentFlow({
        supabaseUrl,
        anonKey,
        authHeader: actingUser.authHeader,
        companyId: company.companyId,
        companyName,
        website,
        runRequested: payload.run_initial_public_signal_pass !== false,
      })
      : {
        attempted: false,
        triggered: false,
        status: null,
        message: mode === "intake_stub"
          ? "INTAKE_AUTORUN_MODE=intake_stub. Company and intake records were created without starting agent flow."
          : "INTAKE_AUTORUN_MODE=company_only. Company was created without intake records or agent flow.",
      };

    return json({
      success: true,
      mode,
      company_id: company.companyId,
      company_created: company.created,
      intake_input_id: inputId,
      intake_file_id: intakeFile?.fileId ?? null,
      intake_file_path: intakeFile?.filePath ?? null,
      autorun: automation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected launch-site intake error.";
    console.error("[launch-site-intake] failed", message);
    return json({ error: message }, 500);
  }
});
