# Future Client Portal Architecture

This document describes the intended future state for giving clients secure, logged-in access to their MojoMap without requiring VPN access.

The goal is to add client access without weakening the current privacy principle:

- private client files stay private
- internal analysis stays in the private system
- local LLM processing remains local
- clients see a curated MojoMap experience, not the raw operator workspace

## Core Principle

The future client portal should expose a published, client-safe view of MojoMap.

It should not expose:

- the full internal app
- raw uploaded files by default
- operator notes and scratch work
- private prompts, traces, or internal workflow runs
- direct access to internal analysis lanes

In other words:

- internal system creates truth
- client portal presents approved truth

## Target Three-Zone Architecture

### 1. Public acquisition layer

Purpose:

- marketing
- quiz
- email intake
- Calendly booking

Examples:

- `launch-site`

No client login is required here.
No private workspace data should live here.

### 2. Private operator system

Purpose:

- internal strategists manage companies
- upload and review client files
- run analysis
- produce and update MojoMap artifacts
- use local parser and local LLM tools

Examples:

- local/private MojoMap app
- local/private Supabase
- local Ollama and parser services

This remains the source of truth for private work.

### 3. Secure client portal

Purpose:

- clients log in over the public internet
- clients see only their company’s approved MojoMap
- no VPN required
- no access to internal/private workspace data

This portal is a client-facing delivery layer, not the operator system itself.

## Product Boundary

The portal should show:

- client-safe Outside / Diagnose / Focus / Flow views
- published routes and route ranking
- approved evidence summaries
- approved Mojo Score state and trajectory
- selected methodology pages or explanatory notes
- curated next-step guidance

The portal should not show by default:

- raw uploaded files
- file extraction sidecars
- internal review runs
- council review traces
- unpublished routes or work-in-progress hypotheses
- internal admin comments
- operator-only scoring controls
- full database-backed editing interfaces

## Data Model Direction

The cleanest design is to add an explicit publish layer rather than reuse the raw internal tables directly.

### Recommended approach

Add one of these:

1. dedicated published tables
2. database views backed by internal tables
3. published snapshots stored separately from operator records

Recommended default:

- use published snapshots for client-facing objects

Why:

- stronger control over exactly what becomes visible
- easier audit trail
- safer rollback if something was published too early
- cleaner separation between internal and client-safe language

### Example future objects

- `client_portal_memberships`
- `client_portal_sessions` or normal auth session handling
- `published_mojomaps`
- `published_routes`
- `published_route_evidence`
- `published_focus_priorities`
- `published_flow_signals`
- `published_methodology_notes`

These do not have to be the final names, but the pattern matters:

- internal records remain mutable and rich
- published records are deliberate and safe to display

## Auth Model

Clients should have their own role, separate from internal users.

### Recommended roles

- `admin`
- `internal_strategist` or existing internal operator role
- `client`

### Recommended membership model

Each client user should be tied to one or more companies through an explicit membership table.

Example shape:

- `user_id`
- `company_id`
- `role`
- `status`

The portal then enforces:

- client users can read only published records for companies they belong to
- internal users can access broader operator data according to internal roles

## RLS Direction

The client portal should rely on company-scoped row-level security.

The rules should look like:

- client can `SELECT` only published records where they are a member of the company
- client cannot `INSERT`, `UPDATE`, or `DELETE` internal strategy artifacts
- internal roles can manage both internal and published layers according to role

This reuses a pattern already present in the app:

- several tables already moved toward company-scoped visibility
- published methodology content already uses an `is_published` flag

That means the portal should extend an existing direction, not create a separate one-off auth model.

## Deployment Model

The client portal should be internet-accessible but still privacy-preserving.

### Recommended hosting model

- host the client portal on a secure public domain
- require login
- back it with a secure hosted or private-access API layer
- keep private operator processing separate

### Important distinction

No-VPN access does not mean exposing the internal local stack directly.

Instead:

- internal system continues doing the private work
- published client-safe data is synced or pushed to the portal-accessible backend

This gives you:

- secure client access
- no VPN burden
- no need to expose the internal private runtime directly to clients

## Recommended Privacy Pattern

Use a dual-store model for the long term:

### Private store

Contains:

- raw files
- internal notes
- operator workflows
- local analysis outputs
- non-client-safe artifacts

### Client-safe store or client-safe layer

Contains:

- approved snapshots
- curated summaries
- selected evidence statements
- route states meant for client discussion

That second layer can be:

- separate schema
- separate project
- or a strict subset with strong RLS and publish controls

If privacy is the top priority, separate storage for published outputs is the safest option.

## File Access Policy

Default client portal rule:

- clients do not get raw file access

Optional future capability:

- individual files can be explicitly shared when needed

If that is added later, it should require:

- per-file sharing intent
- signed URLs
- expiration
- auditability

But the default should remain:

- file upload is private
- client portal is for published insights, not raw evidence storage

## Publishing Workflow

Recommended operator workflow:

1. strategist updates internal MojoMap
2. strategist reviews what is client-safe
3. strategist publishes or refreshes the client view
4. client portal reads the latest published snapshot

This can be implemented first as a manual publish button.

Later enhancements can include:

- diff view before publish
- preview-as-client
- publish notes
- version history
- rollback to previous published version

## MVP Rollout Path

### Phase 1: Access foundation

- add client role
- add company membership table
- add client login flow
- create basic portal shell

### Phase 2: Published MojoMap layer

- define first published snapshot model
- publish only Outside / Diagnose / Focus / Flow summaries
- make portal read-only

### Phase 3: Evidence and route detail

- add approved route detail
- add approved evidence summaries
- add approved score trajectory and signal updates

### Phase 4: Collaboration enhancements

- comments
- acknowledgements
- meeting-ready views
- selected downloadable artifacts

## What Should Stay Internal Even After Portal Launch

- raw files
- extracted file text sidecars
- local parser outputs
- local LLM prompts and traces
- operator-only scoring mechanics
- internal workflow logs
- unpublished hypotheses
- private diagnostic scratch space

## Technical Decision Rule

Before exposing any data to the client portal, ask:

1. Is this already approved for direct client discussion?
2. Would sharing this leak raw client material or operator-only reasoning?
3. Can this be represented as a curated summary instead?

If there is any doubt, keep it in the internal system.

## Recommended Next Design Step

When implementation starts, define a first published object for the client experience.

A strong MVP is:

- one `published_mojomap` per company
- one published set of ranked routes
- one published set of evidence states
- one published focus state
- one published flow state

That is enough to give clients meaningful secure access without opening the whole internal system.
