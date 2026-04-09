# Private/Public Architecture

This project now has a deliberate split between the public web presence and the private MojoMap working system.

The goal of that split is simple:

- public web can collect interest, explain the product, and schedule time
- private MojoMap can store client files, run analysis, and use local LLMs
- public systems should not have live access to private client work

## Source Of Truth

The source of truth for real client work is the private/local MojoMap stack.

That means:

- the MojoMap app running locally is the working system
- private client files belong in the private storage bucket
- private records belong in the private database
- local parser and local LLM endpoints are the only approved path for sensitive file analysis

Public cloud services are not the source of truth for sensitive MojoMap data.

## Current Intended Split

### Private MojoMap system

Use the local/private app for:

- authenticated internal access
- company records
- uploaded client files
- input metadata and file linkage
- route generation and analysis
- strategy/problem artifacts
- MojoMap resources
- local parser execution
- local Ollama execution

Core private components:

- main app at `localhost:8080`
- local/private Supabase runtime
- storage bucket `input-files`
- local parser service
- local Ollama service

### Public launch site

Use the public `launch-site` for:

- marketing page
- quiz/questionnaire
- intake email
- Calendly booking

It should not:

- create private client workspaces automatically
- upload private client documents into cloud storage
- trigger private MojoMap analysis pipelines in cloud environments

### Public main-app deployment

If the public main app exists at all, it should be treated as:

- a shell
- a login screen
- a non-working preview
- or a disabled surface

It should not have live credentials that connect it to the real client database.

## Privacy Principle

The system should preserve this rule:

- if a client uploads files, those files stay in private storage you control
- if a model reads private client material, that model must be local

In this repo, that principle already shows up in the function guardrails:

- [supabase/functions/analyze-file/index.ts](/Users/fomomojodojo/Downloads/happy-file-hugger-main/supabase/functions/analyze-file/index.ts)
- [supabase/functions/local-alignment/index.ts](/Users/fomomojodojo/Downloads/happy-file-hugger-main/supabase/functions/local-alignment/index.ts)

Those functions reject non-local parser/LLM URLs.

## Allowed Public Data Flow

The public flow is intentionally narrow:

1. visitor fills out questionnaire
2. Vercel route sends intake email
3. visitor books time through Calendly
4. internal team reviews intake and decides what to create in the private system

That preserves privacy because the public site is only collecting lightweight intake information.

## Disallowed Public Data Flow

The following should stay off by default:

- public webhook that creates companies in cloud Supabase
- public webhook that creates client files in cloud storage
- public webhook that triggers MojoMap generation against a hosted backend
- public site storing sensitive uploaded client documents
- public site sending private documents to hosted LLM APIs

## Configuration Policy

### Public `launch-site` Vercel project

Allowed envs:

- `RESEND_API_KEY`
- `MOJOMAP_FROM_EMAIL`
- `MOJOMAP_TO_EMAIL`
- `NEXT_PUBLIC_SECONDARY_CTA_URL`

Not allowed in the privacy-first default state:

- `MOJOMAP_AUTORUN_WEBHOOK_URL`
- `MOJOMAP_AUTORUN_WEBHOOK_TOKEN`

### Public main-app Vercel project

Not allowed in the privacy-first default state:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

If these are present in a public deployment, that deployment can point at a real database and should be treated as sensitive.

### Private local app

Allowed and expected:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for local scripts and private workflows
- local parser URL
- local Ollama URL

## Recommended Operating Model

### Intake

Public:

- use `launch-site` to gather signal and schedule a call

Private:

- create the actual company/workspace manually or through a private-only internal flow

### Files

Public:

- do not accept sensitive client file upload on the public website

Private:

- upload files only inside the private/local MojoMap app
- mirror to local folders if desired

See:

- [docs/client-files-local-workflow.md](/Users/fomomojodojo/Downloads/happy-file-hugger-main/docs/client-files-local-workflow.md)

### Analysis

Public:

- no private file analysis

Private:

- parse documents locally
- run LLM-assisted classification and analysis locally
- keep extracted sidecars and artifacts in private storage

## Why This Architecture Is The Right Fit

This preserves the original product intent:

- client work remains private
- local LLM policy is enforceable
- public web still does its job
- the cloud sites do not become accidental shadow backends

It also reduces operational confusion:

- one real backend for client work
- one public site for acquisition
- no split-brain between local, hosted testing projects, and production intake

## Practical Rule For Future Changes

Before adding any new feature, ask:

1. Does it touch private client files or private strategy data?
2. Does it require model processing of private content?
3. Does it need to create or mutate real MojoMap records?

If the answer to any of those is yes, it belongs in the private MojoMap system, not the public website.

## Current Policy Summary

- private/local MojoMap stack is canonical
- public `launch-site` is intake-only
- public main-app deployment does not get real database credentials
- private file uploads stay private
- private LLM work stays local
