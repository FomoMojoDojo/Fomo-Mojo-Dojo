# FomoMojoDojo Launch Site

Standalone Next.js 15 launch site for MojoMap\u2122.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run start
```

## Optional environment overrides

Copy `.env.example` to `.env.local` and update values.

## Email Setup (MojoMap intake)

The quiz submission endpoint (`/api/mojomap-intake`) sends a formatted email to:

- `dojocho@fomomojodojo.com`

Required env vars in `launch-site/.env.local`:

```bash
RESEND_API_KEY=your_resend_api_key
MOJOMAP_FROM_EMAIL="FomoMojoDojo Intake <intake@fomomojodojo.com>"
MOJOMAP_TO_EMAIL=dojocho@fomomojodojo.com
```

Notes:

- `MOJOMAP_FROM_EMAIL` should use a sender/domain verified in Resend.
- `MOJOMAP_TO_EMAIL` can be changed if your Resend account is still in testing mode and only allows specific recipients.
- After updating env vars, restart the Next.js dev server.

## Optional: Auto-run MojoMap after intake

If you want submissions to automatically trigger a MojoMap run, set:

```bash
MOJOMAP_AUTORUN_WEBHOOK_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/launch-site-intake
MOJOMAP_AUTORUN_WEBHOOK_TOKEN=your_shared_secret_token
```

Behavior:

- After a successful intake email send, `/api/mojomap-intake` will POST intake data to the webhook.
- The recommended Supabase Edge Function target is `launch-site-intake`.
- That function can create or find the company, write the quiz submission into client files as an intake brief, store the strategic problem statement, and trigger the existing MojoMap generation flow.
- The payload includes `company_name`, `website_url`, strategic problem, `mojo_snapshot`, and full intake context.
- Intake success is not blocked if the autorun webhook fails; the route returns `autorun` status for observability.

### Supabase function secrets for `launch-site-intake`

Set these in the Supabase project that hosts the edge function:

```bash
MOJOMAP_AUTORUN_WEBHOOK_TOKEN=your_shared_secret_token
INTAKE_AUTORUN_MODE=full
INTAKE_AUTORUN_USER_EMAIL=admin@example.com
INTAKE_AUTORUN_USER_PASSWORD=your_password
```

Notes:

- `INTAKE_AUTORUN_MODE` controls how much happens after a successful quiz submission:
  - `full`: create/find company, create intake file/records, and attempt `run-agent-flow`
  - `intake_stub`: create/find company plus intake records, but do not start `run-agent-flow`
  - `company_only`: create/find company only
- `INTAKE_AUTORUN_USER_EMAIL` / `INTAKE_AUTORUN_USER_PASSWORD` should belong to an admin user in the main MojoMap app.
- If runner credentials are omitted, the webhook still creates the company and intake client file, but it will skip the automatic MojoMap generation stage.
