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
```

Notes:

- `MOJOMAP_FROM_EMAIL` should use a sender/domain verified in Resend.
- After updating env vars, restart the Next.js dev server.

## Optional: Auto-run MojoMap after intake

If you want submissions to automatically trigger a MojoMap run, set:

```bash
MOJOMAP_AUTORUN_WEBHOOK_URL=https://your-mojomap-backend.example.com/api/autorun
MOJOMAP_AUTORUN_WEBHOOK_TOKEN=your_shared_secret_token
```

Behavior:

- After a successful intake email send, `/api/mojomap-intake` will POST intake data to the webhook.
- The payload includes `company_name`, `website_url`, strategic problem, `mojo_snapshot`, and full intake context.
- Intake success is not blocked if the autorun webhook fails; the route returns `autorun` status for observability.
