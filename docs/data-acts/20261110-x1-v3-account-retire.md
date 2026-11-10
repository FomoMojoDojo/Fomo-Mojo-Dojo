# Data act — retire the fixture admin grant, ban the seven unreferenced fixtures (2026-11-10)

Operator-ruled (X1 + V3, signed 2026-11-09), as ONE audited act after the W1–W3 account audit. The
CV5 investigation found that until the `20261110050000_cv5_member_read` migration, any signed-in
account could read and write 33,370 rows across all 44 companies (seven tables carried no row
security and `authenticated` held INSERT/UPDATE/DELETE on all of them). W1 then inventoried who could
have held such a session: ten non-admin accounts, of which eight failed every "known throwaway"
criterion. This act retires the two kinds of standing access that audit exposed.

**Two stages, both recorded.** The act first revoked the admin grant by DEMOTION to `role='user'`
(`run_ref x1-v3-20261110`), reading the ruling's "no deletes" as covering the grant row. The ruling
was then restated: V3 as signed means **delete the `user_roles` row**, and that was done as a second
audited act (`run_ref v3-delete-20261110`). The first audit row is kept, not amended — it is how the
demotion is still legible. **No auth user was ever deleted**, and none of the seven was removed; they
are banned. `auth.users` holds 15 rows throughout, `company_members` 9, `companies` 44. `user_roles`
went 5 → 4.

- Backup BEFORE the act: `backups/pre-data-act-x1-v3-accounts-20261110T053446Z.sql` — 18,772 bytes,
  20 `INSERT` statements (15 `auth.users` + 5 `public.user_roles`), `pg_dump` exit 0, empty stderr.
- Audit: **8 `integrity_runs` rows**, `run_ref = 'x1-v3-20261110'`, `component =
  'operator_retire_account'`, `system_scope = true` (no company — `CHECK (company_id IS NOT NULL OR
  system_scope)`), each carrying `rows[].before` / `rows[].after`, the backup path, the ruling and its
  own `reversal` SQL. 7 at `surface_type = 'auth_users'` / action `ban`; 1 at `'user_roles'` / action
  `revoke_admin_by_demotion`.

## X1 — the fixture admin grant

`throwaway-srctag-gate@local.test` (`abd4e267-4258-48f5-84dd-3bd1cc4a4b85`) held one of the five
`user_roles` admin rows. It is a fixture account on a non-routable domain, named in no `backups/*.env`
file; its only repo references are a comment in `scripts/guards/fixture-hold-guard.sh` naming it as the
creator of a held gate fixture, and `docs/data-acts/20260820-mojoscore-rls.md` recording it as the
"admin non-owner" that proved the `mojo_scores` admin arm. No guard or spec signs in as it.

```sql
-- stage 1, run_ref x1-v3-20261110 (kept for the record)
update public.user_roles set role='user'
where user_id='abd4e267-4258-48f5-84dd-3bd1cc4a4b85' and role='admin';   -- 1 row

-- stage 2, run_ref v3-delete-20261110 — V3 as signed
delete from public.user_roles where user_id='abd4e267-4258-48f5-84dd-3bd1cc4a4b85';   -- 1 row
```

**Why it took two stages.** `user_roles` is `(id, user_id, role)` with no soft-delete column, so
revoking the grant means removing the row. Stage 1 read the ruling's "no deletes" as covering that row
and demoted instead, to `role='user'` — which grants nothing (**0 policies** and **0 functions** in
`public` reference `'user'::app_role`, no application code reads it beyond the generated enum in
`src/integrations/supabase/types.ts`, and `has_capability` falls through to its `company_members`
branch where this account has no row). It left one real cost: the only `role='user'` row in the table,
where every other non-admin has no row at all. Stage 2 removed it, as signed, and that anomaly is
gone — `user_roles` is 4 rows, all `admin`.

The stage-2 audit row carries the pre-delete state (`role='user'`), `supersedes_run_ref:
x1-v3-20261110`, `pre_x1_role: admin`, and a reversal that re-inserts the row, noting that restoring
the **pre-X1** state means `role='admin'` rather than `'user'`.

Its created company (`de40cfd7-e351-44bc-a1e1-d63808e47bb9`, the held Heart Coffee Roasters gate
fixture) is untouched — `created_by` still names the account, and the company's own rows are unchanged.

## V3 — the seven unreferenced fixtures

Banned to `2099-01-01 00:00:00+00`. All seven had `banned_until` NULL, no `user_roles` row, 0
memberships and 0 companies created, were confirmed and unbanned, and held a password that is in no
env file in the repo. None is referenced anywhere in `scripts/`, `tests/`, `supabase/`, `docs/` or
`src/`.

| account | email |
|---|---|
| `2ef695f6-e93f-44f7-90fe-c3018bd18b10` | v2-6c-throwaway-1784920487@example.com |
| `4e4ac6c0-acba-4d05-81e4-14575ecd7939` | v2-6d-throwaway-1784924307@example.com |
| `295f2589-cb9d-4c51-9db0-bb9dec5359f0` | oc2d-throwaway-1784927952@example.com |
| `b5a4c659-e558-4948-a454-31a0539e614e` | contested-ui-d-1784933293@example.com |
| `c0c8bf76-607e-4bc8-a786-b7e6ed1c834c` | oc3b-operator-shaped-1784934717@example.com |
| `e1e02297-da97-4563-a979-07cffa3b48ba` | oc3b-op-1784934746@example.com |
| `fbe251b0-d06f-43f2-b130-a50cbf88e23c` | sitecrawl-proof-20260819@throwaway.local |

## X2 — untouched, by ruling

`system@mojomap.internal` (`1a27cf29-554a-46e9-bab8-0e238f9dc088`), created by
`supabase/migrations/20260518000002_create_service_role_user.sql`, is unchanged: not banned, no
`user_roles` row, still the `created_by` on 16 of 44 companies. It has **no password at all**, so it
cannot be authenticated by any means and those 16 companies are not actually reachable through the
`created_by` arm that U3/U4 added (X3 keeps that arm for real client-created companies later).

The two `backups/*.env` throwaways — `zz-nonadmin-1789617937@local.test` and
`zz-member-1790552766@local.test` — are untouched, as the RLS specs and guards depend on them.

## Verification

Measured after the act, all read-only.

- **None of the seven can obtain a session.** A token grant for each, with a deliberately wrong
  password, returns `400 {"error_code":"user_banned","msg":"User is banned"}` — **7 of 7**. GoTrue
  evaluates the ban BEFORE the credential (the same request shape against a non-banned account returns
  `invalid_credentials`), so no password, correct or not, can mint a session for them.
- **The two env throwaways still can** — real passwords, both `SESSION MINTED`.
- **The admin logins are unaffected** — `bob2@` (the suite's storage state) `SESSION MINTED`.
  `banned_until` is NULL and `has_role(…,'admin')` is true for all four of bob@, bob2@, taylor@ and
  jim@. Admin rows: **5 → 4**, exactly the four `@fomomojodojo.com` logins.
- **On the partner hostname** `mojomap.tail7b863b.ts.net`, where the U1 bypass is off because the host
  is not loopback: the admin reads **44 company rows** with no refusal; the non-admin throwaway gets
  **"Access Denied"** and 0 rows. Before U1 that same non-admin rendered the front door.
- `throwaway-srctag-gate@local.test`: **no `user_roles` row**, `has_role(…,'admin')` **false**, and
  **0 rows at `role='user'`** fleet-wide. The AUTH USER IS INTACT — still present, not banned,
  password untouched, still `created_by` on its 1 held gate-fixture company; a wrong-password token
  grant returns `invalid_credentials`, not `user_banned`, which is how we know the account itself was
  not touched.
- `user_roles` 5 → **4**, all `admin`. `auth.users` **15**, `company_members` **9**, `companies`
  **44** — unchanged. Audit rows: 8 (stage 1) + 1 (stage 2) = **9**, none amended.

## Reversal

Each `integrity_runs` row carries its own statement. In full:

```sql
-- pre-X1 state: re-insert the row as admin (stage 2 deleted it; stage 1 had demoted it)
insert into public.user_roles (id, user_id, role)
values ('6858823b-e21a-42fa-883d-9f28cbfa498c','abd4e267-4258-48f5-84dd-3bd1cc4a4b85','admin'::app_role);
update auth.users set banned_until=null where id in (
  '2ef695f6-e93f-44f7-90fe-c3018bd18b10','4e4ac6c0-acba-4d05-81e4-14575ecd7939',
  '295f2589-cb9d-4c51-9db0-bb9dec5359f0','b5a4c659-e558-4948-a454-31a0539e614e',
  'c0c8bf76-607e-4bc8-a786-b7e6ed1c834c','e1e02297-da97-4563-a979-07cffa3b48ba',
  'fbe251b0-d06f-43f2-b130-a50cbf88e23c');
```

No row writes outside `auth.users.banned_until` (7 rows) and the one `public.user_roles` row
(demoted, then deleted). Backups: `backups/pre-data-act-x1-v3-accounts-20261110T053446Z.sql` before
stage 1 and `backups/pre-data-act-v3-delete-user-role-20261110T063306Z.sql` before stage 2.
