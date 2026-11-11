# Creating an account (U6-60, signed 2026-11-11)

Sign-up is closed (U6-58). `enable_signup = false` in `supabase/config.toml`, and the auth service
answers a sign-up POST with `422 signup_disabled`. There is no self-registration, so **every account
is created by an operator running the command below**.

## The command

```bash
export SERVICE_ROLE_KEY=$(npx supabase status --output env | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2-)
bash scripts/operator/create-account.sh \
  --email person@their-company.com \
  --company <company-uuid> \
  --role member
```

It prints the user id, the company's name, the role and — when you did not pass `--password` — a
generated 32-character password, **once**. Nothing stores it. Give it to the person over a channel
you trust.

### Where a "Forgot password?" email goes on this stack — measured 2026-11-11

**Nowhere the person can reach.** The control on `/login` works and the API returns 200, but this
stack has no outbound SMTP: `supabase/config.toml` carries no SMTP keys, and the auth container
points at the bundled catcher. The mail lands in **Mailpit at <http://127.0.0.1:54324>**, on this
machine, and is never delivered.

Measured end to end: mailbox empty → `POST /auth/v1/recover` → HTTP 200 → one message,
*"Reset Your Password"*, addressed to the account, sitting in Mailpit.

So on this stack a reset is an **operator-assisted** step, not a self-service one. Telling a client
to "use Forgot password" would have them waiting for an email that does not exist.

## Setting a password (U6-79)

```bash
export SERVICE_ROLE_KEY=$(npx supabase status --output env | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2-)
bash scripts/operator/set-password.sh --email person@their-company.com
```

It prints a generated 32-character password once, or takes `--password`. It changes that one field on
that one account — no membership, no role, no company — and refuses unless exactly one account
carries the address.

**Proven once, 2026-11-11**, on a throwaway account, with the before/after that makes it a proof
rather than a demonstration:

```
before   old password → HTTP 200      new password → HTTP 400
         bash scripts/operator/set-password.sh --email <throwaway> --password <new>
after    new password → HTTP 200      old password → HTTP 400
```

The throwaway was retired the same minute, per E2: `fixture_hold` stamped FIRST, membership deleted,
account deleted, company kept. `auth.users` 15, `profiles` 15, 0 orphans, `company_members` 9 —
each back to the pre-restart figure.

A real password path for people outside this machine — actual mail delivery, or a self-service reset
a client can complete alone — is **not built and not in scope** (U6-73).

`--role` is one of `sponsor`, `decision_owner`, `contributor`, `participant`, `observer`, `member`
(the `company_members_role_check` constraint). `--admin` additionally inserts a `user_roles` admin
row; that makes an operator, not a client, and an operator sees every company.

### Why the service-role key and not your own session

`company_members`' INSERT policy is
`has_capability(auth.uid(), 'workspace.member.assignRole', company_id)`. An admin signed in as
`authenticated` does not satisfy that for a company they are not already seated on, so the service
role is the only caller that can seat a company's **first** member.

It must be the **legacy JWT** key — the `eyJ…` value from `supabase status --output env`. The
`sb_secret_…` value printed in the Authentication Keys panel is refused by the functions gateway and
the script rejects it up front rather than failing three calls later.

## What the person gets

Three rows: an `auth.users` row (email pre-confirmed, because there is no mail service locally), a
`profiles` row written by the `on_auth_user_created` trigger, and one `company_members` row. No
`user_roles` row unless you passed `--admin`.

They sign in at `/login` and land on their own company — `/start` resolves it: the Diagnose home if
the inside read has started, else the First Read, else S-U6-6 ("…isn't ready to open yet"). They
reach no other company; `MemberCompanyGate` refuses a foreign company id in words (S-U6-2) with a
link back to their own.

## Retiring an account

The script creates; this reverses. Membership first, then the user — `profiles` cascades with it.

```bash
export SERVICE_ROLE_KEY=$(npx supabase status --output env | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2-)
UID=<the user id the script printed>
docker exec -i supabase_db_dzlgyxcvuwiulgifbmew psql -U postgres -d postgres \
  -c "delete from company_members where user_id='$UID';"
curl -s -X DELETE "http://127.0.0.1:54321/auth/v1/admin/users/$UID" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

**Never delete the company.** A company is retired by stamping `fixture_hold`, not by deletion —
see `docs/held-fixtures.md` and the E2 design.

## Proven once, 2026-11-11

Run against a throwaway company (`zz u6-60 proof 1794411818`) and a throwaway address:
`auth.users` 1, `profiles` 1 (display_name = the email), `company_members` 1 with `role=member`,
`user_roles` 0, and the new account signed in at `/auth/v1/token` with HTTP 200.

Its refusals were exercised too: an unknown company id and a role outside the CHECK each stop the
run before any write (verified: `auth.users` unchanged).

### One gap found while proving it, filed not fixed

The held-fixture refusal reads `companies.fixture_hold`, and **`66666666-6666-4666-8666-666666666601`
("zz first-read-rls member co") carries no hold** — so the guard let a throwaway account be seated on
it. That write was reversed immediately (membership deleted, user deleted, `company_members` on that
company back to 1). The refusal is only as good as the stamping, and several fixture companies are
unstamped. Filed as **U6-66**: stamp the guard-fixture companies, after checking what
`first-read-rls-guard` asserts about their shape.
