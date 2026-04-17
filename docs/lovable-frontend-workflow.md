# Lovable Frontend-Only Workflow

## Branches
- Working branch for Lovable edits: `lovable-frontend-only`
- Primary product branch (human-controlled): `codex/mojo-map` (or your current main integration branch)

## GitHub Required Settings
1. Open repository settings -> Branches.
2. Add a branch protection rule for `lovable-frontend-only`.
3. Enable:
- Require a pull request before merging
- Require approvals (at least 1)
- Require review from Code Owners
- Restrict who can push to matching branches (optional, recommended)
- Require status checks to pass and include:
  - `Lovable Frontend Guard / block-backend-paths`

## CODEOWNERS
- `.github/CODEOWNERS` maps frontend and backend paths to human owners.
- Replace `@fomomojodojo` with your exact GitHub username/team if needed.

## What Lovable Should Be Told
Use this instruction in Lovable project context:

> Edit frontend only. Allowed paths: `src/**`, `public/**`, `index.html`, `vite.config.ts`, `tailwind.config.ts`, `postcss.config.js`, `components.json`.
> Do not edit `supabase/**`, `sql/**`, `scripts/**`, `launch-site/**`, `Client_Files/**`, or migrations.

## Merge Policy
- Do not auto-merge Lovable PRs.
- Human review required before merging to any integration branch.
- If a Lovable PR touches forbidden paths, reject and request a frontend-only revision.
