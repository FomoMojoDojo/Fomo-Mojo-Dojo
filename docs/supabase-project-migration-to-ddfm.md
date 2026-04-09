# Supabase Migration Prep: `dzlgyxcvuwiulgifbmew` -> `ddfmxxrrlzufqbtpsbks`

This repo is currently wired to Supabase project `dzlgyxcvuwiulgifbmew`.

Target project for migration:

- Current project ref: `dzlgyxcvuwiulgifbmew`
- Target project ref: `ddfmxxrrlzufqbtpsbks`
- Target hosted URL: `https://ddfmxxrrlzufqbtpsbks.supabase.co`

This document is the prep checklist for moving the app from the current project to the target project without losing track of required database schema, edge functions, storage, or deployment config.

## Recommendation

Use this migration path only if `ddfmxxrrlzufqbtpsbks` is the long-term home for the product.

If the old `dzl...` project contains real production data that matters, treat this as a data migration, not just a config change.

## Current Repo Coupling

The repo is explicitly linked to `dzl...` in:

- [supabase/config.toml](/Users/fomomojodojo/Downloads/happy-file-hugger-main/supabase/config.toml)

The runtime is also coupled through environment variables:

- Main app Vercel project `happy-file-hugger-main`
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
- Launch-site Vercel project `fomomojodojo-launch`
  - `MOJOMAP_AUTORUN_WEBHOOK_URL`
  - `MOJOMAP_AUTORUN_WEBHOOK_TOKEN`

## What Must Exist In The Target Project

### Database schema

The repo contains `45` SQL migrations in [supabase/migrations](/Users/fomomojodojo/Downloads/happy-file-hugger-main/supabase/migrations).

The app and edge functions currently touch these core tables:

- `agent_flow_runs`
- `agent_flow_stage_runs`
- `companies`
- `company_run_locks`
- `council_recommendations`
- `council_review_runs`
- `deep_dive_analyses`
- `input_files`
- `input_subitems`
- `inputs`
- `job_steps`
- `managed_outcomes`
- `mojo_maps`
- `odi_market_definitions`
- `odi_needs`
- `opportunities`
- `positioning_canvases`
- `profiles`
- `public_baseline_runs`
- `research_artifact_runs`
- `research_review_runs`
- `routes`
- `strategy_assumptions`
- `strategy_cascades`
- `strategy_problem_statements`
- `user_roles`

Also required:

- storage bucket `input-files`
- all RLS policies created by the migrations

### Edge functions

These functions exist in the repo and should be deployed to the target project:

- `analyze-file`
- `council-review`
- `generate-deep-dive`
- `launch-site-intake`
- `local-alignment`
- `maps`
- `public-baseline`
- `public-companies`
- `research-company`
- `run-agent-flow`
- `seed-inputs`

### Edge secrets / env required by functions

These secret names are referenced in the edge functions:

- `COUNCIL_OPENAI_MODEL`
- `INTAKE_AUTORUN_USER_EMAIL`
- `INTAKE_AUTORUN_USER_ID`
- `INTAKE_AUTORUN_USER_PASSWORD`
- `LOCAL_PARSER_URL`
- `MOJOMAP_AUTORUN_WEBHOOK_TOKEN`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `OPENAI_API_KEY`
- `OPENAI_FALLBACK_MODEL`
- `OPENAI_FALLBACK_MODELS`
- `OPENAI_MODEL`
- `SEARXNG_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL`

Notes:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are project-level values supplied by Supabase.
- The OpenAI, parser, autorun, and local-model settings must be recreated manually in the target project.

## Data Migration Scope

### Must preserve if old project has real data

- `auth.users`
- `profiles`
- `user_roles`
- `companies`
- `inputs`
- `input_subitems`
- `input_files`
- storage objects in bucket `input-files`
- `strategy_problem_statements`
- `strategy_assumptions`
- `public_baseline_runs`
- `research_review_runs`
- `research_artifact_runs`
- `job_steps`
- `opportunities`
- `routes`
- `managed_outcomes`
- `odi_market_definitions`
- `odi_needs`
- `positioning_canvases`
- `strategy_cascades`
- `council_review_runs`
- `council_recommendations`
- `deep_dive_analyses`
- `mojo_maps`
- `agent_flow_runs`
- `agent_flow_stage_runs`
- `company_run_locks`

### Can be recreated or regenerated

Depending on how much history you care about, these can often be regenerated from inputs instead of copied:

- `public_baseline_runs`
- `research_review_runs`
- `research_artifact_runs`
- `council_review_runs`
- `council_recommendations`
- `deep_dive_analyses`
- `agent_flow_runs`
- `agent_flow_stage_runs`

### Highest-risk loss areas

- Auth users and role assignments
- Uploaded files in storage bucket `input-files`
- Company records and their foreign-key graph
- Any admin-owned methodology or map content already curated in the old project

## Files And Deployments To Update During Cutover

### Repo config

Update:

- [supabase/config.toml](/Users/fomomojodojo/Downloads/happy-file-hugger-main/supabase/config.toml)

From:

```toml
project_id = "dzlgyxcvuwiulgifbmew"
```

To:

```toml
project_id = "ddfmxxrrlzufqbtpsbks"
```

### Main app Vercel project

Project:

- `happy-file-hugger-main`

Set:

- `VITE_SUPABASE_URL=https://ddfmxxrrlzufqbtpsbks.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=<target project anon/publishable key>`

### Launch-site Vercel project

Project:

- `fomomojodojo-launch`

Keep:

- `RESEND_API_KEY`
- `MOJOMAP_FROM_EMAIL`
- `MOJOMAP_TO_EMAIL`
- `NEXT_PUBLIC_SECONDARY_CTA_URL`

Update:

- `MOJOMAP_AUTORUN_WEBHOOK_URL=https://ddfmxxrrlzufqbtpsbks.supabase.co/functions/v1/launch-site-intake`
- `MOJOMAP_AUTORUN_WEBHOOK_TOKEN=<shared secret also set in target Supabase>`

## Safe Migration Order

### Phase 1: Prepare target Supabase project

1. Confirm you can see and administer `ddfmxxrrlzufqbtpsbks`.
2. Authenticate Supabase CLI with the account that owns that project.
3. Link the repo to the target only after you are ready to push schema and functions.

Suggested checks:

```bash
supabase login
supabase projects list
supabase functions list --project-ref ddfmxxrrlzufqbtpsbks
```

### Phase 2: Push schema

From the repo root:

```bash
cd /Users/fomomojodojo/Downloads/happy-file-hugger-main
supabase db push --project-ref ddfmxxrrlzufqbtpsbks
```

This should create the tables, enums, policies, and the `input-files` bucket defined in migrations.

### Phase 3: Deploy edge functions

Deploy all functions the app relies on:

```bash
supabase functions deploy analyze-file --project-ref ddfmxxrrlzufqbtpsbks --use-api
supabase functions deploy council-review --project-ref ddfmxxrrlzufqbtpsbks --use-api
supabase functions deploy generate-deep-dive --project-ref ddfmxxrrlzufqbtpsbks --use-api
supabase functions deploy launch-site-intake --project-ref ddfmxxrrlzufqbtpsbks --use-api
supabase functions deploy local-alignment --project-ref ddfmxxrrlzufqbtpsbks --use-api
supabase functions deploy maps --project-ref ddfmxxrrlzufqbtpsbks --use-api
supabase functions deploy public-baseline --project-ref ddfmxxrrlzufqbtpsbks --use-api
supabase functions deploy public-companies --project-ref ddfmxxrrlzufqbtpsbks --use-api
supabase functions deploy research-company --project-ref ddfmxxrrlzufqbtpsbks --use-api
supabase functions deploy run-agent-flow --project-ref ddfmxxrrlzufqbtpsbks --use-api
supabase functions deploy seed-inputs --project-ref ddfmxxrrlzufqbtpsbks --use-api
```

### Phase 4: Set target Supabase secrets

At minimum, recreate the non-default secrets used in the functions:

```bash
supabase secrets set \
  OPENAI_API_KEY=... \
  OPENAI_MODEL=... \
  COUNCIL_OPENAI_MODEL=... \
  OPENAI_FALLBACK_MODEL=... \
  OPENAI_FALLBACK_MODELS=... \
  SEARXNG_URL=... \
  OLLAMA_BASE_URL=... \
  OLLAMA_MODEL=... \
  LOCAL_PARSER_URL=... \
  MOJOMAP_AUTORUN_WEBHOOK_TOKEN=... \
  INTAKE_AUTORUN_USER_ID=... \
  INTAKE_AUTORUN_USER_EMAIL=... \
  INTAKE_AUTORUN_USER_PASSWORD=... \
  --project-ref ddfmxxrrlzufqbtpsbks
```

Use only the values you actually need. Some of these may be optional depending on which features are active in the target environment.

### Phase 5: Migrate data if needed

If the old `dzl...` project has live data, export/import before cutover.

Minimum data categories to migrate:

- auth users
- profiles and roles
- companies
- company-linked records
- input file metadata
- storage objects in `input-files`

Do not change Vercel to the new project until the target has either:

- the required live data, or
- an intentionally clean empty state you are comfortable going live with

### Phase 6: Flip runtime config

After target Supabase is ready:

1. Update [supabase/config.toml](/Users/fomomojodojo/Downloads/happy-file-hugger-main/supabase/config.toml) to `ddfmxxrrlzufqbtpsbks`
2. Update Vercel envs for:
   - main app project
   - launch-site project
3. Redeploy both projects

Suggested Vercel commands:

```bash
cd /Users/fomomojodojo/Downloads/happy-file-hugger-main
npx vercel env add VITE_SUPABASE_URL production --value "https://ddfmxxrrlzufqbtpsbks.supabase.co" --yes --force
npx vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production --value "<target_publishable_key>" --yes --force
npx vercel --prod --yes
```

```bash
cd /Users/fomomojodojo/Downloads/happy-file-hugger-main/launch-site
npx vercel env add MOJOMAP_AUTORUN_WEBHOOK_URL production --value "https://ddfmxxrrlzufqbtpsbks.supabase.co/functions/v1/launch-site-intake" --yes --force
npx vercel env add MOJOMAP_AUTORUN_WEBHOOK_TOKEN production --value "<shared_secret>" --yes --force
npx vercel --prod --yes
```

## Smoke Tests After Cutover

### Main app

- app loads without Supabase init errors
- login works
- companies page loads
- inputs and files load
- file upload reaches `input-files`
- routes/opportunities/focus artifacts load
- client view renders
- maps endpoint works

### Launch-site

- quiz submit returns `success: true`
- email is sent
- autorun returns `triggered: true`
- company is created or found
- intake file lands in storage and `input_files`
- strategic problem statement is inserted

## Known Current Blockers

- We do not currently have CLI access to deploy functions into `dzl...`
- We do not currently know whether `ddfm...` already contains the needed schema or data
- Without access to `dzl...`, we cannot export or compare existing data from the old project

## Practical Decision Rule

Choose one of these before doing the actual cutover:

1. `dzl...` contains important live data
   - Gain access and export/migrate that data first.
2. `dzl...` is disposable or stale
   - Treat `ddfm...` as a fresh canonical backend and migrate only code, schema, functions, secrets, and the minimum seed/admin setup.

## Repo Status After Prep

This prep does not change the live backend. It documents the full migration surface so the actual cutover can be done deliberately instead of piecemeal.
