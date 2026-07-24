# Observed Contest — design record

> **Provenance.** Reconstituted 2026-07-23 from the filed session record; the
> original uncommitted scratchpad draft was lost. This file is the design record
> going forward.

The **observed-contest** arc lets a client register a verdict *against* an
observed finding (a claim), on an axis **orthogonal** to the claim's own
lifecycle. The arc ships in gates:

- **OC-1 — schema only** (this record): `claim_contests` + `claim_contest_removals`.
- **OC-2 — feed** (later): the write path that records contests.
- **OC-3 — render + resolve** (later): the chip, the resolution RPC, the
  proposal-side reads.
- **OC-4 — supersede** (later): rebinding contests across claim regen.

---

## Adopted rulings

These eight rulings are the laws OC-1 encodes structurally (as stated in the OC-1
brief's GOAL). Ruling 9 (issued 2026-07-23) follows, verbatim.

1. **Orthogonal axis, never a status value.** A contest sits beside
   `claims.status`, it is never one of its values. A contested claim — of *either*
   kind — keeps counting everywhere (score, readiness, deltas, distribution). No
   trigger, default, or code path introduced by the schema gate writes
   `claims.status`.

2. **`contest_kind` is mandatory and closed.** A `contest_kind` column, `NOT NULL`,
   CHECK-constrained to exactly `('disputed','immaterial')`.

3. **Resolution present, write-machinery deferred to OC-3.** The resolution fields
   exist in the schema, but nothing writes them in OC-1. The allowed resolution
   vocabulary already covers all three sanctioned outcomes —
   `strike_resolved`, `dismissed`, `set_aside` — so OC-3 needs no schema change.
   > **CORRECTION (2026-07-24, OC-3):** This proved not-quite-true. OC-3 took ONE
   > schema change — widening the `claim_contests_resolution_kind` CHECK to admit
   > `(immaterial, dismissed)` per the operator amendment below. The *vocabulary* was
   > unchanged (`dismissed` already existed); only the kind→resolution *mapping* widened.

4. **One contest per (session, claim).** A unique constraint on
   `(session_id, claim_id)`: a client gives one verdict per finding per meeting;
   the kind is an attribute of that verdict, not a second row.

5. **FK-cascade to claims, and every delete is audited.** The contest carries a
   foreign key to `claims` with `ON DELETE CASCADE`, and every contest-row delete
   — direct *or* cascaded — leaves a `claim_contest_removals` audit row, per the
   strike-arc precedent (`claims_delete_audit` / `first_read_sessions_delete_audit`:
   a `BEFORE DELETE` trigger writes the audit on every path). The audit table
   carries no foreign keys on its scoping ids so it survives claim / session /
   company teardown.

6. **Auto-strike and auto-minimize are structurally impossible.** There is no path
   from a contest insert to any `claims.status` write. Minimize happens only at
   OC-3 resolution, through the existing sanctioned status authority
   (`set_claim_status`) — never from the contest schema.

7. **Unanchored rejections are not rows here.** A contest requires a real
   `claim_id`. A render-only rejection with no anchor is an OC-3 render concern; the
   schema never fabricates an anchor.

8. **RLS mirrors the ratified member+admin tenancy (RLS-2 model).** Members see
   only their own company; admins see everything. No `created_by` disjunct
   (RLS-2 deliberately dropped it). Member write policies are an OC-2 concern —
   the pipeline writes via service role, which bypasses RLS.

### Ruling 9 (2026-07-23), verbatim

> RULING 9 — A contest carries a KIND. Two values: 'disputed' (client says the
> finding is false) and 'immaterial' (client concedes it's true but says it
> doesn't matter to them). Resolutions differ: disputed → Strike/Dismiss as
> already designed; immaterial → a 'set_aside' resolution that flips the claim to
> status='minimized' via the existing sanctioned status authority (still counts,
> de-emphasized, reversible) — never strike, never a new status value. Immaterial
> contests are scope-reduction signal for the future proposal-reads-contests gate
> (queued after OC-3, not built here).

Ruling 9 is additionally encoded as a CHECK constraint
(`claim_contests_resolution_kind`): a `disputed` contest may resolve only to
`strike_resolved` or `dismissed`; an `immaterial` contest may resolve only to
`set_aside`; unresolved (`NULL`) is always permitted. OC-3 therefore cannot
misroute a resolution without a schema change.

---

## As-built schema (OC-1)

Migration: `supabase/migrations/20260723170000_observed_contest_schema.sql`.
Falsification-validated tests: `supabase/tests/oc1_observed_contest.test.sql`.

**Table names** (fixed by the brief): `claim_contests`, `claim_contest_removals`.

### `claim_contests`
| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `session_id` | uuid NOT NULL | FK → `first_read_sessions(id)` ON DELETE CASCADE (ownership) |
| `company_id` | uuid NOT NULL | denormalized (matches `first_read_responses`); no FK |
| `claim_id` | uuid NOT NULL | FK → `claims(id)` ON DELETE CASCADE — the contested finding |
| `claim_identity` | text NOT NULL | `sha256(normalizeForHash(statement))`; computed in TS, frozen at contest, carried into the audit |
| `contest_kind` | text NOT NULL | CHECK `in ('disputed','immaterial')` |
| `rationale` | text | optional, the client's stated reason (verbatim) |
| `source` | text NOT NULL default `'client_attested'` | CHECK `in ('client_attested')` |
| `resolution` | text | CHECK `in ('strike_resolved','dismissed','set_aside')`; NULL until OC-3 |
| `resolution_reason` | text | |
| `resolved_at` | timestamptz | |
| `resolved_by` | text | |
| `created_at` | timestamptz NOT NULL default now() | |

Constraints: `unique (session_id, claim_id)`; `claim_contests_resolution_kind`
(ruling 9). RLS enabled — member+admin (RLS-2).

### `claim_contest_removals`
Delete-audit, no FKs on scoping ids, RLS left off (mirrors `claim_removals` /
`first_read_session_removals`). Columns: `id`, `contest_id`, `session_id`,
`company_id`, `claim_id` (nullable — the claim may already be gone),
`claim_identity`, `contest_kind`, `resolution`, `reason` (explicit OC-3 RPC value
or `'unaudited_direct_delete'`), `removed_at`. Written by the `BEFORE DELETE`
trigger `claim_contests_delete_audit`, which reads only the OLD contest row and
never references `claims` or `claims.status`.

---

## OC-3 — render + resolve (as built, 2026-07-24)

Migration: `supabase/migrations/20260724120000_observed_contest_resolve.sql`.
SQL tests: `supabase/tests/oc3_contest_resolve.test.sql` (9 laws, each falsified in-line).
Render tests: `contestCopy.test.ts`, `contestedFindings.test.tsx`, `signalQuoteDecode.test.tsx`.

### Amendment (operator ruling 2026-07-24) — immaterial → Dismiss is lawful

Ruling 9 mapped immaterial → `set_aside` only. The OC-3 brief's GOAL 2 listed immaterial
→ set_aside **or** dismissed; the operator resolved the conflict by WIDENING the CHECK.
Rationale (verbatim):

> "A contest awaits the operator's judgment; a judgment that can only go one way isn't a
> judgment. Without Dismiss, an immaterial contest forces minimize — the client's word
> compelling a status change with the operator as rubber stamp, the exact auto-minimize
> the schema forbids. Dismiss = disagree-and-close: contest resolved, claim untouched,
> disagreement on record."

The CHECK now admits `(immaterial, set_aside)` **and** `(immaterial, dismissed)`; the two
cross-kind mismatches (`disputed→set_aside`, `immaterial→strike_resolved`) stay forbidden.

### As built

- **`resolve_contest(p_contest_id, p_resolution, p_reason)`** — the SOLE resolution path.
  Admin-only (`has_role(auth.uid(),'admin')`), reason-required, refuses re-resolving, and
  raises a clean kind-mismatch message before the CHECK backstop. Writes the contest
  resolution FIRST, then delegates the status consequence to `set_claim_status` (strike =
  `struck`, set_aside = `minimized`) — a SECOND resolution writer, never a second STATUS
  writer. Dismiss changes no status. `resolved_by` = `auth.uid()`.
- **External-strike auto-resolve** — trigger `claim_contests_auto_resolve_on_strike`
  (`after update of status on claims`, `when new.status='struck'`): open contests on the
  struck claim auto-resolve (disputed → `strike_resolved`, immaterial → `dismissed`).
  Status→contest only (ruling 1 intact); OPEN rows only, so a self-strike from
  `resolve_contest` — which resolved its own row first — is skipped. **This hook did NOT
  exist in OC-1; it is built here** (OC-1 was schema-only).
- **Company-teardown refusal** — trigger `companies_open_contest_guard`
  (`before delete on companies`): a company with OPEN contests cannot be torn down; it
  raises a plain-English message ("N open contest(s) await your judgment … resolve or
  dismiss them (Extracts → Contested) before removing it"). **TEARDOWN FINDING: OC-1 had
  NO refusal** — ruling 5's cascade+audit silently deleted+recorded open contests on
  teardown. OC-3 adds the refusal. It lives on `companies` (not the contest delete
  trigger) precisely so OC-1's audited-cascade of a *direct* contest delete — and its
  test — stand unchanged (verified: OC-1 + OC-2 SQL tests still green).
- **Render (operator surface, Extracts only)** — `ContestedFindings` (section
  "Contested — awaiting your judgment (N)", open-only queue with a per-claim kind chip +
  kind-appropriate controls + consequences-before-act; resolved contests in a trail below)
  via `useClaimContests`; kind→controls in the pure `contestCopy.ts`. All strings PENDING
  operator signature.
- **Rider** — `SignalQuote` gains `decodeQuoteEntities` (presentational HTML-entity decode;
  the stored quote stays byte-exact — the V2-6d `&amp;` case).

### Live proof (Edgewood, 2026-07-24)
No organic contests exist for Edgewood (its one session recorded no reject/not_important
verdicts; `claim_contests` is empty repo-wide). The resolve flow was proven against
Edgewood's real claims via a **rolled-back controlled proof**: seed disputed+immaterial →
render-query returns the open queue → `resolve_contest` (disputed→dismissed leaves the
claim `active`; immaterial→set_aside → `minimized`) → open queue empty, both in the trail →
ROLLBACK, zero residue (both claims back to `active`, 0 contests). The RPC/CHECK/auto-resolve/
teardown laws are additionally proven on the OC-1 fixture company by the SQL test.

---

## OC-3b — Contested render fix + error honesty (2026-07-24)

**The bug (CONTESTED-UI-D).** After OC-2d birthed 3 open contests, the operator saw NO
Contested section. Cause: `useClaimContests` embedded `first_read_sessions(created_at)` — a
column that does not exist (the session's date is `started_at`). PostgREST rejected the whole
query with `42703` **before RLS ran**; the hook threw, `open`/`resolved` collapsed to `[]`,
and `ContestedFindings` self-quieted — for every user. RLS was clean (all four operator
identities are Edgewood members AND admins). Fix: `started_at` in the embed, type, and mapping.

**Error honesty (adopted hardening).** The hook now surfaces `isError` distinctly from empty;
`ContestedFindings` renders an honest inline error ("Couldn't load contested findings — reload
or check access." — PENDING SIGNATURE) on failure instead of vanishing. Empty stays a
null-render. A failed query can never again masquerade as "no contests".

### STANDING VERIFICATION LAW (from CONTESTED-UI-D) — recorded here

> **An RLS/PostgREST-gated render hook is proven against the REAL authenticated PostgREST
> path — anon key + a member/admin-shaped JWT — never service-role SQL, and never only
> mocked.** A render proof run as superuser `psql` (as OC-3's "Act 4 renders" was) bypasses
> BOTH the PostgREST embed-parse layer AND RLS: it is an *unproven proof* for the actual
> query the browser runs. The falsification form: the same query on the wrong column must
> **fail loudly** (`42703`), not return green-with-empty.

**OC-3b proof of the law (2026-07-24).** A throwaway user was granted Edgewood membership
(operator-shaped), authenticated for a real JWT, and used to hit PostgREST directly:
- FIXED query (`…first_read_sessions(started_at)`) → **HTTP 200, 3 rows** (disputed, disputed,
  immaterial; open=3) — the Contested section renders "awaiting your judgment (3)".
- FALSIFICATION — old query (`…created_at`), SAME identity → **HTTP 400 `42703`** "column
  first_read_sessions_1.created_at does not exist" — the exact masquerade, now loud.
- Membership reverted (Edgewood back to its 4 real members); zero residue. pg_dump
  `backups/pre_oc3b_20260724.sql`.

**Rider (signed via the OC-3b paste).** When contests are born, the feed button appends
"{N} client pushback(s) recorded — decide each under Contested below." — so a zero-corrections
feed still points the operator at the queue. Single-sourced in `FeedCorrectionsButton`.
