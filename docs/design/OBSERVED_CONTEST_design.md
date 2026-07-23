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
