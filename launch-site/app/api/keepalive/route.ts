// ============================================================================
// R6 — MAILBOX KEEPALIVE (intake gate 2026-09-25).
//
// The hosted mojomap-intake project runs on the Supabase FREE plan, which pauses
// a project after ~7 days of low activity. On 2026-09-25 it was found paused:
// two production submissions emailed fine and stored nothing.
//
// Supabase counts "a few user requests to the DATABASE each day" as activity
// (https://supabase.com/docs/guides/platform/free-project-pausing). Edge Function
// invocations are NOT named there, and receive-intake answers a non-POST with 405
// before touching Postgres — so a function ping would prove nothing. This route
// therefore does a PostgREST read with the ANON key: RLS on intake_submissions is
// enabled with zero policies, so the query runs in Postgres as role `anon` and
// comes back `200 []`. Real database activity, zero rows, no dedup_key effect.
//
// THIS ROUTE NEVER WRITES. Vercel Hobby allows one cron run per day
// (https://vercel.com/docs/cron-jobs/usage-and-pricing); see vercel.json.
// ============================================================================

const READ_TIMEOUT_MS = 8000;
const PING_TIMEOUT_MS = 3000;
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FALLBACK_FROM_EMAIL = "FomoMojoDojo Intake <onboarding@resend.dev>";
const DEFAULT_RECEIVER_EMAIL = "dojocho@fomomojodojo.com";

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

// Dead-man's switch. A keepalive that silently stops running looks exactly like one
// that succeeds, so success pings an external checker when one is configured; that
// checker is what notices the ABSENCE of a run. Optional: unset = skipped.
const pingHealthcheck = async (suffix: "" | "/fail") => {
  const base = process.env.HEALTHCHECK_PING_URL?.trim();
  if (!base) return "skipped (HEALTHCHECK_PING_URL unset)";

  try {
    const response = await fetchWithTimeout(
      `${base.replace(/\/+$/, "")}${suffix}`,
      { method: "GET" },
      PING_TIMEOUT_MS,
    );
    return `ping ${suffix || "(ok)"} -> ${response.status}`;
  } catch (error) {
    // A ping failure is never fatal: it must not turn a healthy mailbox into an alarm.
    // NAME ONLY, never the message: undici embeds the whole URL in its parse error, and
    // this string is returned in the response body and written to the runtime logs.
    const message = error instanceof Error ? error.name : "unknown ping error";
    console.warn("[keepalive] healthcheck ping failed (non-fatal)", { suffix, message });
    return `ping ${suffix || "(ok)"} failed: ${message}`;
  }
};

const sendFailureEmail = async (reason: string, checkedAt: string) => {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    console.error("[keepalive] cannot alert: RESEND_API_KEY is not configured");
    return "not sent (RESEND_API_KEY unset)";
  }

  const from = process.env.MOJOMAP_FROM_EMAIL?.trim() || FALLBACK_FROM_EMAIL;
  const to = process.env.MOJOMAP_TO_EMAIL?.trim() || DEFAULT_RECEIVER_EMAIL;
  const subject = "MojoMap mailbox keepalive FAILED — project may pause";
  const text = [
    "The daily keepalive read against the hosted intake mailbox did not succeed.",
    "",
    `Reason:     ${reason}`,
    `Checked at: ${checkedAt}`,
    "",
    "If this keeps failing the Supabase project will pause for inactivity, and",
    "intake submissions will email through but store nothing. Open the Supabase",
    "dashboard for the mojomap-intake project and check its status.",
  ].join("\n");

  try {
    const response = await fetchWithTimeout(
      RESEND_ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text,
          html: `<meta charset="utf-8" />
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:24px;background:#0b1220;">
              <div style="max-width:640px;margin:0 auto;padding:20px 24px;background:#fee2e2;border:2px solid #b91c1c;color:#7f1d1d;">
                <p style="margin:0 0 10px 0;font-size:16px;font-weight:700;">
                  MojoMap mailbox keepalive FAILED
                </p>
                <p style="margin:0 0 6px 0;font-size:14px;line-height:1.5;">
                  The daily read against the hosted intake mailbox did not succeed.
                </p>
                <p style="margin:0 0 4px 0;font-size:13px;"><strong>Reason:</strong> ${reason}</p>
                <p style="margin:0;font-size:13px;"><strong>Checked at:</strong> ${checkedAt}</p>
              </div>
              <div style="max-width:640px;margin:14px auto 0 auto;padding:16px 24px;background:#ffffff;border:1px solid #e5e7eb;font-size:13px;line-height:1.6;color:#111827;">
                If this keeps failing the Supabase project will pause for inactivity, and intake
                submissions will email through but store nothing. Open the Supabase dashboard for
                the <strong>mojomap-intake</strong> project and check its status.
              </div>
            </div>`,
        }),
      },
      READ_TIMEOUT_MS,
    );
    if (!response.ok) {
      console.error("[keepalive] alert email rejected", { status: response.status });
      return `not sent (resend ${response.status})`;
    }
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown email error";
    console.error("[keepalive] alert email threw", { message });
    return `not sent (${message})`;
  }
};

export async function GET(request: Request) {
  // Vercel sends CRON_SECRET as `Authorization: Bearer <secret>`
  // (https://vercel.com/docs/cron-jobs/manage-cron-jobs).
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const checkedAt = new Date().toISOString();
  const url = process.env.MOJOMAP_INTAKE_KEEPALIVE_URL?.trim();
  const anonKey = process.env.MOJOMAP_INTAKE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    const reason = "MOJOMAP_INTAKE_KEEPALIVE_URL or MOJOMAP_INTAKE_ANON_KEY is not configured";
    console.error("[keepalive] misconfigured", { reason, checkedAt });
    const alert = await sendFailureEmail(reason, checkedAt);
    const ping = await pingHealthcheck("/fail");
    return Response.json({ ok: false, reason, alert, ping, checked_at: checkedAt }, { status: 500 });
  }

  let status: number | null = null;
  let reason: string | null = null;

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      },
      READ_TIMEOUT_MS,
    );
    status = response.status;
    if (status !== 200) {
      // Body, not headers: it may carry a PostgREST error code. Never the key.
      const body = await response.text().catch(() => "");
      reason = `mailbox read returned ${status}${body ? ` ${body.slice(0, 200)}` : ""}`;
    }
  } catch (error) {
    reason = error instanceof Error ? error.message : "unknown read error";
  }

  if (reason === null) {
    const ping = await pingHealthcheck("");
    console.log("[keepalive] mailbox alive", { status, ping, checked_at: checkedAt });
    return Response.json({ ok: true, status, ping, checked_at: checkedAt });
  }

  console.error("[keepalive] mailbox read FAILED", { status, reason, checked_at: checkedAt });
  const alert = await sendFailureEmail(reason, checkedAt);
  const ping = await pingHealthcheck("/fail");
  return Response.json({ ok: false, status, reason, alert, ping, checked_at: checkedAt }, { status: 500 });
}
