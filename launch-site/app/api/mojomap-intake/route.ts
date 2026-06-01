import { NextResponse } from "next/server";

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

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FALLBACK_FROM_EMAIL = "FomoMojoDojo Intake <onboarding@resend.dev>";
const AUTORUN_TIMEOUT_MS = 12000;
const DEFAULT_RECEIVER_EMAIL = "dojocho@fomomojodojo.com";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://fomomojodojo-launch.vercel.app",
  "https://happy-file-hugger-main.vercel.app",
  "https://www.fomomojodojo.com",
  "https://fomomojodojo.com",
];

const present = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Not provided";
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const normalizeWebhookUrl = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return null;
  }
};

const isAllowedOrigin = (origin: string) => {
  if (!origin) return false;

  if (DEFAULT_ALLOWED_ORIGINS.includes(origin)) return true;

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".lovable.app") ||
      hostname.endsWith(".lovableproject.com")
    );
  } catch {
    return false;
  }
};

const buildCorsHeaders = (origin?: string | null) => {
  const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : DEFAULT_ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
};

const jsonWithCors = (
  body: Record<string, unknown>,
  init: { status?: number; headers?: HeadersInit } = {},
  origin?: string | null,
) =>
  NextResponse.json(body, {
    ...init,
    headers: {
      ...buildCorsHeaders(origin),
      ...(init.headers ?? {}),
    },
  });

type AutorunResult = {
  requested: boolean;
  attempted: boolean;
  triggered: boolean;
  status: number | null;
  message: string;
};

const triggerMojoMapAutorun = async (payload: IntakeRequest): Promise<AutorunResult> => {
  const requested = Boolean(payload.run_initial_public_signal_pass);
  if (!requested) {
    return {
      requested: false,
      attempted: false,
      triggered: false,
      status: null,
      message: "Not requested by intake payload.",
    };
  }

  const webhookUrl = normalizeWebhookUrl(process.env.MOJOMAP_AUTORUN_WEBHOOK_URL);
  if (!webhookUrl) {
    return {
      requested: true,
      attempted: false,
      triggered: false,
      status: null,
      message: "MOJOMAP_AUTORUN_WEBHOOK_URL is not configured.",
    };
  }

  const webhookToken = process.env.MOJOMAP_AUTORUN_WEBHOOK_TOKEN?.trim();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTORUN_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {}),
      },
      body: JSON.stringify({
        source: "launch-site-mojomap-intake",
        submitted_at: payload.submitted_at || new Date().toISOString(),
        company_name: present(payload.company_name),
        website_url: present(payload.website_url),
        industry: present(payload.industry),
        explicit_strategic_problem: present(payload.explicit_strategic_problem),
        mojo_snapshot: payload.mojo_snapshot || null,
        intake: payload,
      }),
    });

    const rawBody = await response.text().catch(() => "");
    let parsedBody: Record<string, unknown> | null = null;
    if (rawBody) {
      try {
        const parsed = JSON.parse(rawBody);
        parsedBody = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
      } catch {
        parsedBody = null;
      }
    }

    if (!response.ok) {
      return {
        requested: true,
        attempted: true,
        triggered: false,
        status: response.status,
        message: `Webhook rejected request.${rawBody ? ` ${rawBody.slice(0, 240)}` : ""}`,
      };
    }

    const nestedAutorun = parsedBody?.autorun && typeof parsedBody.autorun === "object"
      ? (parsedBody.autorun as Record<string, unknown>)
      : null;
    const nestedTriggered = nestedAutorun?.triggered === true;
    const nestedStatus = typeof nestedAutorun?.status === "number" ? Number(nestedAutorun.status) : response.status;
    const nestedMessage = typeof nestedAutorun?.message === "string"
      ? nestedAutorun.message
      : (typeof parsedBody?.error === "string" ? parsedBody.error : "");

    if (parsedBody?.success === false || (nestedAutorun && !nestedTriggered)) {
      return {
        requested: true,
        attempted: true,
        triggered: false,
        status: nestedStatus,
        message: nestedMessage || "Autorun did not complete successfully.",
      };
    }

    return {
      requested: true,
      attempted: true,
      triggered: true,
      status: nestedStatus,
      message: "Autorun job accepted.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook error";
    return {
      requested: true,
      attempted: true,
      triggered: false,
      status: null,
      message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const buildPlainTextEmailBody = (payload: IntakeRequest) => {
  const focusAreas = (payload.mojo_snapshot?.top_focus_areas ?? [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  return [
    `New MojoMap Pre-Diagnosis — ${present(payload.company_name)}`,
    "",
    "COMPANY",
    `Company: ${present(payload.company_name)}`,
    `Website: ${present(payload.website_url)}`,
    `Industry: ${present(payload.industry)}`,
    "",
    "MAIN STRATEGIC PROBLEM",
    present(payload.explicit_strategic_problem),
    "",
    "DESIRED OUTCOME",
    `Outcome: ${present(payload.desired_outcome)}${payload.desired_outcome_other ? ` (${payload.desired_outcome_other})` : ""}`,
    `Success definition: ${present(payload.success_definition)}`,
    "",
    "QUIZ INPUTS",
    `Where stuck: ${present(payload.where_stuck)}${payload.where_stuck_other ? ` (${payload.where_stuck_other})` : ""}`,
    `Decision slowdowns: ${(payload.decision_slowdowns ?? []).join("; ") || "Not provided"}`,
    `Customer confidence: ${present(payload.customer_confidence)}`,
    `Last customer input: ${present(payload.last_customer_input)}`,
    `Biggest drag: ${present(payload.momentum_drag)}${payload.momentum_drag_other ? ` (${payload.momentum_drag_other})` : ""}`,
    "",
    "MOJOMAP™",
    `Starting mode: ${present(payload.mojo_snapshot?.starting_mode)}`,
    `Primary friction: ${present(payload.mojo_snapshot?.primary_friction)}`,
    `Customer truth signal: ${present(payload.mojo_snapshot?.customer_truth_signal)}`,
    "Top focus areas:",
    focusAreas || "Not provided",
    "",
    "ADDITIONAL CONTEXT",
    `Notes: ${present(payload.notes)}`,
    `Run initial public-information pass: ${payload.run_initial_public_signal_pass ? "Yes" : "No"}`,
    `Submitted at: ${payload.submitted_at || new Date().toISOString()}`,
  ].join("\n");
};

const buildHtmlEmailBody = (payload: IntakeRequest) => {
  const focusAreas = (payload.mojo_snapshot?.top_focus_areas ?? [])
    .map((item) => `<li style="margin:0 0 6px 0;">${escapeHtml(item)}</li>`)
    .join("");

  const submittedAt = payload.submitted_at || new Date().toISOString();

  return `
    <div style="margin:0;padding:24px;background:#0b1220;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;">
        <div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;background:#f8fafc;">
          <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#0f766e;font-weight:700;">
            MojoMap Pre-Diagnosis
          </p>
          <h1 style="margin:0;font-size:22px;line-height:1.2;color:#0f172a;">
            New Intake — ${escapeHtml(present(payload.company_name))}
          </h1>
        </div>

        <div style="padding:20px 24px;">
          <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 18px 0;">
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:600;width:180px;">Company</td>
              <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">${escapeHtml(present(payload.company_name))}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:600;">Website</td>
              <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">${escapeHtml(present(payload.website_url))}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:600;">Industry</td>
              <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">${escapeHtml(present(payload.industry))}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-weight:600;">Submitted</td>
              <td style="padding:8px 0;">${escapeHtml(submittedAt)}</td>
            </tr>
          </table>

          <h2 style="margin:0 0 10px 0;font-size:16px;color:#0f172a;">Main strategic problem</h2>
          <div style="margin:0 0 18px 0;padding:14px;border:1px solid #fdba74;background:#fff7ed;color:#7c2d12;line-height:1.5;">
            ${escapeHtml(present(payload.explicit_strategic_problem))}
          </div>

          <h2 style="margin:0 0 10px 0;font-size:16px;color:#0f172a;">Desired outcome</h2>
          <p style="margin:0 0 4px 0;line-height:1.5;">
            <strong>Outcome:</strong> ${escapeHtml(
              `${present(payload.desired_outcome)}${payload.desired_outcome_other ? ` (${payload.desired_outcome_other})` : ""}`,
            )}
          </p>
          <p style="margin:0 0 18px 0;line-height:1.5;">
            <strong>Success definition:</strong> ${escapeHtml(present(payload.success_definition))}
          </p>

          <h2 style="margin:0 0 10px 0;font-size:16px;color:#0f172a;">Quiz inputs</h2>
          <ul style="margin:0 0 18px 18px;padding:0;line-height:1.6;">
            <li><strong>Where stuck:</strong> ${escapeHtml(
              `${present(payload.where_stuck)}${payload.where_stuck_other ? ` (${payload.where_stuck_other})` : ""}`,
            )}</li>
            <li><strong>Decision slowdowns:</strong> ${escapeHtml(
              (payload.decision_slowdowns ?? []).join("; ") || "Not provided",
            )}</li>
            <li><strong>Customer confidence:</strong> ${escapeHtml(present(payload.customer_confidence))}</li>
            <li><strong>Last customer input:</strong> ${escapeHtml(present(payload.last_customer_input))}</li>
            <li><strong>Biggest drag:</strong> ${escapeHtml(
              `${present(payload.momentum_drag)}${payload.momentum_drag_other ? ` (${payload.momentum_drag_other})` : ""}`,
            )}</li>
          </ul>

          <h2 style="margin:0 0 10px 0;font-size:16px;color:#0f172a;">MOJOMAP™</h2>
          <ul style="margin:0 0 18px 18px;padding:0;line-height:1.6;">
            <li><strong>Starting mode:</strong> ${escapeHtml(present(payload.mojo_snapshot?.starting_mode))}</li>
            <li><strong>Primary friction:</strong> ${escapeHtml(
              present(payload.mojo_snapshot?.primary_friction),
            )}</li>
            <li><strong>Customer truth signal:</strong> ${escapeHtml(
              present(payload.mojo_snapshot?.customer_truth_signal),
            )}</li>
          </ul>
          <p style="margin:0 0 8px 0;font-weight:600;">Top focus areas</p>
          <ul style="margin:0 0 18px 18px;padding:0;line-height:1.6;">
            ${focusAreas || "<li>Not provided</li>"}
          </ul>

          <h2 style="margin:0 0 10px 0;font-size:16px;color:#0f172a;">Additional context</h2>
          <p style="margin:0 0 4px 0;line-height:1.5;">
            <strong>Run public-information pass:</strong> ${payload.run_initial_public_signal_pass ? "Yes" : "No"}
          </p>
          <p style="margin:0;line-height:1.5;">
            <strong>Notes:</strong> ${escapeHtml(present(payload.notes))}
          </p>
        </div>
      </div>
    </div>
  `;
};

const validatePayload = (payload: IntakeRequest) => {
  if (!payload.company_name?.trim()) return "Missing company_name";
  if (!payload.website_url?.trim()) return "Missing website_url";
  if (!payload.explicit_strategic_problem?.trim()) return "Missing explicit_strategic_problem";
  return null;
};

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  try {
    const payload = (await request.json()) as IntakeRequest;
    const validationError = validatePayload(payload);
    if (validationError) {
      return jsonWithCors({ success: false, error: validationError }, { status: 400 }, origin);
    }

    const resendApiKey = process.env.RESEND_API_KEY?.trim();
    const fromEmail = process.env.MOJOMAP_FROM_EMAIL?.trim() || FALLBACK_FROM_EMAIL;
    const receiverEmail =
      process.env.MOJOMAP_TO_EMAIL?.trim() || DEFAULT_RECEIVER_EMAIL;

    if (!resendApiKey) {
      return jsonWithCors(
        {
          success: false,
          error:
            "Missing RESEND_API_KEY. Add it to launch-site/.env.local, then restart the dev server.",
        },
        { status: 500 },
        origin,
      );
    }

    if (!resendApiKey.startsWith("re_")) {
      return jsonWithCors(
        {
          success: false,
          error:
            "RESEND_API_KEY format is invalid. Use a Resend API key that starts with re_.",
        },
        { status: 500 },
        origin,
      );
    }

    const subject = `New MojoMap Pre-Diagnosis — ${present(payload.company_name)}`;
    const text = buildPlainTextEmailBody(payload);
    const html = buildHtmlEmailBody(payload);

    const sendEmail = async (sender: string) => {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: sender,
          to: [receiverEmail],
          subject,
          text,
          html,
        }),
      });
      const body = await response.json().catch(() => null);
      return { response, body };
    };

    let { response: emailResponse, body: responseBody } = await sendEmail(fromEmail);

    const providerMessage =
      (responseBody && typeof responseBody === "object" && "message" in responseBody
        ? String((responseBody as { message?: unknown }).message ?? "")
        : "") || "";
    const providerMessageLower = providerMessage.toLowerCase();

    const shouldFallbackToOnboarding =
      !emailResponse.ok &&
      fromEmail !== FALLBACK_FROM_EMAIL &&
      (emailResponse.status === 403 || emailResponse.status === 422) &&
      (providerMessageLower.includes("domain is not verified") ||
        providerMessageLower.includes("verify a domain") ||
        providerMessageLower.includes("from address") ||
        providerMessageLower.includes("sender"));

    if (shouldFallbackToOnboarding) {
      console.warn("[mojomap-intake] sender domain not verified; retrying with onboarding@resend.dev");
      const retry = await sendEmail(FALLBACK_FROM_EMAIL);
      emailResponse = retry.response;
      responseBody = retry.body;
    }

    if (!emailResponse.ok) {
      console.error("[mojomap-intake] resend rejected request", {
        status: emailResponse.status,
        body: responseBody,
        to: receiverEmail,
        from: fromEmail,
      });
      const detailedMessage =
        (responseBody &&
        typeof responseBody === "object" &&
        "message" in responseBody &&
        typeof (responseBody as { message?: unknown }).message === "string"
          ? (responseBody as { message: string }).message
          : null) || "Email provider rejected the request.";
      const sandboxRecipientIssue =
        providerMessageLower.includes("testing emails") ||
        providerMessageLower.includes("own email address") ||
        providerMessageLower.includes("recipient") ||
        providerMessageLower.includes("not allowed to send to");
      const actionableError = sandboxRecipientIssue
        ? `${detailedMessage} Resend is likely still in testing mode. Verify ${receiverEmail} in Resend or set MOJOMAP_TO_EMAIL to an allowed inbox, then retry.`
        : `${detailedMessage} Check RESEND_API_KEY, sender verification, and recipient permissions in Resend.`;

      return jsonWithCors(
        {
          success: false,
          error: actionableError,
        },
        { status: 502 },
        origin,
      );
    }

    console.log("[mojomap-intake] email sent", {
      to: receiverEmail,
      id: responseBody?.id || null,
      company: payload.company_name || null,
    });

    const autorun = await triggerMojoMapAutorun(payload);
    console.log("[mojomap-intake] autorun", autorun);

    return jsonWithCors(
      {
        success: true,
        email_sent: true,
        email_id: responseBody?.id || null,
        autorun,
      },
      {},
      origin,
    );
  } catch (error) {
    console.error("[mojomap-intake] failed", error);
    return jsonWithCors(
      {
        success: false,
        error: "Unexpected server error while submitting intake.",
      },
      { status: 500 },
      origin,
    );
  }
}
