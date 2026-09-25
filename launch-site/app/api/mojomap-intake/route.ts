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
  contact_name?: string;
  contact_email?: string;
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
// R7: the forward now runs BEFORE the email, so this timeout is latency the person waits
// through on the quiz. 6s still clears a cold Supabase Edge Function.
const AUTORUN_TIMEOUT_MS = 6000;
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

// Shape check only. A malformed address is KEPT and flagged — an optional field must
// never cost us the whole submission.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const contactEmailDisplay = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return "Not provided";
  return EMAIL_SHAPE.test(trimmed) ? trimmed : `${trimmed} (unverified)`;
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

// R4: every intake is forwarded to the hosted receiver. `requested` records whether the
// person ticked the optional public-signal pass — it is a STORED FIELD, never the gate on
// whether the mailbox row gets written. (Before this, unticking the box silently threw the
// row away while the email still went out.)
type ForwardResult = {
  requested: boolean;
  attempted: boolean;
  triggered: boolean;
  timedOut: boolean;
  status: number | null;
  message: string;
};

// R7: the banner asks one question — is this submission in the mailbox? Anything that is not
// `triggered` is not stored, including the case where we never even tried because the webhook
// URL is unconfigured. A receiver answering `duplicate: true` reports triggered:true, so a
// deduped retry is stored, not flagged.
const forwardFailed = (forward: ForwardResult) => !forward.triggered;

const forwardFailureReason = (forward: ForwardResult) => {
  if (forward.timedOut) return "timed out";
  if (forward.status !== null) return `receiver returned ${forward.status}`;
  return forward.message || "unknown error";
};

const forwardToIntakeReceiver = async (payload: IntakeRequest): Promise<ForwardResult> => {
  const requested = Boolean(payload.run_initial_public_signal_pass);

  const webhookUrl = normalizeWebhookUrl(process.env.MOJOMAP_AUTORUN_WEBHOOK_URL);
  if (!webhookUrl) {
    // Loud, because the operator gets an email and no mailbox row — a state that used to
    // pass in silence.
    console.warn(
      "[mojomap-intake] MOJOMAP_AUTORUN_WEBHOOK_URL is not configured — this submission was EMAILED but NOT stored in the intake mailbox.",
      {
        company: payload.company_name || null,
        submitted_at: payload.submitted_at || null,
      },
    );
    return {
      requested,
      attempted: false,
      triggered: false,
      timedOut: false,
      status: null,
      message:
        "MOJOMAP_AUTORUN_WEBHOOK_URL is not configured; submission emailed but not stored.",
    };
  }

  const webhookToken = process.env.MOJOMAP_AUTORUN_WEBHOOK_TOKEN?.trim();
  const intakeToken = process.env.INTAKE_SHARED_TOKEN?.trim();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTORUN_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {}),
        ...(intakeToken ? { "x-intake-token": intakeToken } : {}),
      },
      body: JSON.stringify({
        source: "launch-site-mojomap-intake",
        submitted_at: payload.submitted_at || new Date().toISOString(),
        company_name: present(payload.company_name),
        website_url: present(payload.website_url),
        industry: present(payload.industry),
        explicit_strategic_problem: present(payload.explicit_strategic_problem),
        contact_name: payload.contact_name?.trim() || "",
        contact_email: payload.contact_email?.trim() || "",
        run_initial_public_signal_pass: requested,
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
        requested,
        attempted: true,
        triggered: false,
        timedOut: false,
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
        requested,
        attempted: true,
        triggered: false,
        timedOut: false,
        status: nestedStatus,
        message: nestedMessage || "Autorun did not complete successfully.",
      };
    }

    return {
      requested,
      attempted: true,
      triggered: true,
      timedOut: false,
      status: nestedStatus,
      message:
        parsedBody?.duplicate === true
          ? "Receiver reported this submission as a duplicate."
          : "Submission stored by the intake receiver.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook error";
    // controller.signal.aborted is OUR timeout firing, not a network error.
    const timedOut = controller.signal.aborted;
    return {
      requested,
      attempted: true,
      triggered: false,
      timedOut,
      status: null,
      message: timedOut ? `Timed out after ${AUTORUN_TIMEOUT_MS}ms.` : message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
};

const buildPlainTextEmailBody = (payload: IntakeRequest, forward: ForwardResult) => {
  const focusAreas = (payload.mojo_snapshot?.top_focus_areas ?? [])
    .map((item, index) => `${index + 1}. ${item}`)
    .join("\n");

  // R7: the banner is the FIRST thing in the body when the row did not land, because the
  // operator has to import this submission by hand.
  const banner = forwardFailed(forward)
    ? [
        "*** NOT STORED IN THE INTAKE MAILBOX — IMPORT BY HAND ***",
        `Reason: ${forwardFailureReason(forward)}`,
        "",
      ]
    : [];

  return [
    ...banner,
    `New MojoMap Pre-Diagnosis — ${present(payload.company_name)}`,
    "",
    "CONTACT",
    `Name: ${present(payload.contact_name)}`,
    `Work email: ${contactEmailDisplay(payload.contact_email)}`,
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

const buildHtmlEmailBody = (payload: IntakeRequest, forward: ForwardResult) => {
  const focusAreas = (payload.mojo_snapshot?.top_focus_areas ?? [])
    .map((item) => `<li style="margin:0 0 6px 0;">${escapeHtml(item)}</li>`)
    .join("");

  const submittedAt = payload.submitted_at || new Date().toISOString();

  const banner = forwardFailed(forward)
    ? `<div style="max-width:760px;margin:0 auto 16px auto;padding:16px 20px;background:#fee2e2;border:2px solid #b91c1c;color:#7f1d1d;">
          <p style="margin:0 0 6px 0;font-size:15px;font-weight:700;letter-spacing:0.01em;">
            NOT STORED IN THE INTAKE MAILBOX — IMPORT BY HAND
          </p>
          <p style="margin:0;font-size:13px;line-height:1.5;">
            Reason: ${escapeHtml(forwardFailureReason(forward))}
          </p>
        </div>`
    : "";

  return `
    <meta charset="utf-8" />
    <div style="margin:0;padding:24px;background:#0b1220;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">
      ${banner}
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
              <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:600;width:180px;">Name</td>
              <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">${escapeHtml(present(payload.contact_name))}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:600;">Work email</td>
              <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">${escapeHtml(contactEmailDisplay(payload.contact_email))}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:600;">Company</td>
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

    // R7: forward BEFORE the email is built, so the email can state plainly whether the
    // submission actually landed in the mailbox. Storing is the durable half; the email is
    // the operator's copy, and a copy that claims more than it knows is worse than none.
    const autorun = await forwardToIntakeReceiver(payload);
    if (forwardFailed(autorun)) {
      console.warn("[mojomap-intake] forward to intake receiver FAILED", autorun);
    } else {
      console.log("[mojomap-intake] forward to intake receiver", autorun);
    }

    const subject = `New MojoMap Pre-Diagnosis — ${present(payload.company_name)}`;
    const text = buildPlainTextEmailBody(payload, autorun);
    const html = buildHtmlEmailBody(payload, autorun);

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

    return jsonWithCors(
      {
        success: true,
        email_sent: true,
        email_id: responseBody?.id || null,
        // R7: `stored` is the plain answer to "is it in the mailbox?". `autorun` is kept
        // unchanged for the existing client type.
        stored: autorun.triggered,
        storage: {
          attempted: autorun.attempted,
          stored: autorun.triggered,
          duplicate: autorun.message.toLowerCase().includes("duplicate"),
          status: autorun.status,
          reason: forwardFailed(autorun) ? forwardFailureReason(autorun) : null,
        },
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
