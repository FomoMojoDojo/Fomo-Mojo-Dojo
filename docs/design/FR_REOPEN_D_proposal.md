# FR-REOPEN-D — operator Reopen for an issued First Read · design proposal

> **Status: PROPOSAL, awaiting operator ruling. No code in this gate.** An issued
> session freezes verdicts by design (the `first_read_responses_freeze` trigger).
> Today the only escape is `remove_first_read_session` (destroys the meeting). This
> proposes a **Reopen** affordance that unfreezes an issued session honestly —
> preserving the recorded issuance, reconciling contests, and resetting the cached
> flywheel stats — without weakening any standing law. Every new client-facing
> string is drafted PENDING SIGNATURE. Open questions (incl. the four hard ones)
> are listed at the end.

Investigated at head `17a4930`. Part A (this session) already tore down the
mis-issued Edgewood fixture via `remove_first_read_session`, audit row
`281664b9-77a0-4ad8-a9bf-ee052279912a` kept.

---

## What exists today
- `first_read_sessions.status`: `open → proposal_issued → accepted | declined`.
  The **transition guard** (`first_read_sessions_transition`) permits ONLY those
  edges — `proposal_issued → open` is currently **forbidden**.
- **Freeze:** `first_read_responses_freeze` refuses INSERT/UPDATE/DELETE on a
  response whenever the parent session's status `<> 'open'`. It keys purely off
  status — flip the status and it naturally allows writes again.
- **Proposal artifact:** persisted as `first_read_sessions.proposal_json` (jsonb,
  1:1) plus cached `confirmed_count / corrected_count / rejected_count` and
  `proposal_issued_at`. Issued proposals are **never regenerated** (the generator is
  idempotent-replay).
- **Contests:** `deriveContests` **skips any (session, claim) that already has a
  `claim_contests` row** — the idempotency backstop. `claim_contests` already has a
  delete-audit trigger + `app.contest_removal_reason` GUC (OC-1).
- **Authority precedents:** `set_claim_status` (GUC-gated `claims_status_guard`) and
  `remove_first_read_session` (reason-required RPC) are the discipline to mirror.
- **MO supersession:** `superseded_by_id` self-FK; **ordering law — a row supersedes
  only AFTER its replacement exists** (no dangling supersede).

---

## The six required decisions

### 1. Authority shape
- A new RPC **`reopen_first_read_session(p_session_id uuid, p_reason text)`** —
  `SECURITY DEFINER`, **reason required, non-empty, free-text** (ratified
  convention), mirroring `remove_first_read_session`.
- **Structurally impossible from client surfaces:** extend the transition guard to
  permit `proposal_issued → open` **only when a txn-local GUC
  `app.fr_reopen_authority = 'on'` is set** — which ONLY this RPC sets (the exact
  `claims_status_guard` / `app.claim_status_authority` pattern). A raw client UPDATE
  flipping status to `open` hard-fails the guard. (RLS member/admin scoping is a
  second layer, but the GUC gate is the structural lock.)
- The RPC writes an **audit row** (see §7 schema) — a reopen is a recorded decision.

### 2. The persisted proposal artifact — supersede, never delete (recommended)
- **Never delete a recorded issuance.** A proposal was shown to a prospect; that is
  evidence. Deletion-with-audit is *lawful in principle* (like session removal) but
  **not recommended** — supersession preserves the record; deletion erases it.
- **Schema change (either way):** move the proposal off the session column into a
  **`first_read_proposals`** table: `id`, `session_id` (FK), `proposal_json`,
  `issued_at`, `status` (`issued | superseded`), `superseded_by_id` (self-FK,
  `ON DELETE SET NULL`), plus the issuance-time counts (see §4). The existing
  `proposal_json` migrates in; `ProposalAct` / the generator / the export read from
  the table.
- **FK-ordered supersession (MO law):** the replacement must exist before the old
  row is marked superseded. At reopen the replacement does NOT exist yet (it is
  generated at the *next* issuance). So the **recommended** shape: on reopen the old
  proposal **stays `status='issued'`** but the session is `open` — and a session in
  `open` has no live proposal by definition; the old row flips to `superseded` with
  `superseded_by_id → new` only when the next issuance lands (strict MO ordering,
  never a dangling supersede). The alternative (an interim `reopened` proposal
  status at reopen) is flagged as a ruling.

### 3. Contest reconciliation — prune-with-audit on reopen (recommended)
- The problem is real: `deriveContests` skips existing (session, claim), so contests
  birthed from the *prior* issuance would become **permanent** even after verdicts
  change on reopen.
- **Prune the session's contests on reopen, audited:** the RPC sets
  `app.contest_removal_reason = 'session_reopened'` and deletes
  `claim_contests WHERE session_id = p_session_id` — every delete lands a
  `claim_contest_removals` row (OC-1 machinery, reused as-is). The next issuance's
  feed then re-derives cleanly from the changed verdicts.
- **Laws preserved:**
  - *attestation-wins* — untouched; pruning contests never touches
    `claim_delta_rejections`.
  - *struck-survives* — the prune removes ONLY `claim_contests` rows, **never**
    `claims.status`. When OC-3 lands, a contest that had been *resolved* to a strike
    (via `set_claim_status`) leaves the claim struck; reopen-prune does **not**
    auto-un-strike — a strike is a separate recorded decision, reversible only
    through `set_claim_status`. (Today, pre-OC-3, all contests are unresolved, so the
    prune is trivially safe; this caveat is forward-looking.)
- "Re-derive at next feed without pruning" does **not** work — the (session, claim)
  skip blocks re-derivation. Pruning is the enabling step.

### 4. Cached tally + flywheel stats
- The cached `*_count` values are the **frozen-at-issuance flywheel fact**. On reopen
  they are stale.
- **Preserve as history on the superseded proposal record** (the `first_read_proposals`
  row keeps its issuance-time counts / `bundle_summary`), and **reset the session's
  live cached counts to NULL** on reopen (re-cached at the next issuance). So the
  per-meeting confirmed/corrected/set-aside history accretes across issuances on the
  proposal rows; the session's live counts reflect only the current state.
- `mojo_score_at_open`: **keep the original** (it is the score at the *first* open;
  the proposal record carries the issuance-time score in `bundle_summary`). Whether
  a reopen re-snapshots it is a ruling (recommended: no).
- **Note (needs the not_important cache, FR-FLOW-3):** neither the session counts nor
  `bundle_summary` carry `not_important` today (the generator drops set-aside). That
  gap is FR-FLOW-3 scope; the reopen schema should provision a `not_important_count`
  column so it doesn't need a second migration.

### 5. The freeze trigger — flipped by status, not bypassed
- `first_read_responses_freeze` is **unchanged**. Reopen flips
  `status: proposal_issued → open` through the RPC (§1); the freeze then naturally
  allows writes because the session is `open` again. **No trigger bypass, no GUC on
  the freeze** — the freeze keeps reading status honestly. The only guard that
  changes is the *transition* guard (to admit the new edge, GUC-gated).

### 6. UI + confirmation
- **Location — operator surface law:** the control lives on **`/preview/client-refine/*`**
  (the workshop), not the client-facing rail. Natural home: the workshop **Inputs**
  tab, beside "Open First Read →" — an issued-session strip showing issued date +
  tally + contest count, with the Reopen affordance. (Whether it should instead live
  on the rail's Act 5 issued view is a ruling.)
- **Confirmation — consequences before the act (one-strategy-switch law):** a reopen
  is a deliberate decision moment. Tapping Reopen opens a confirmation that
  **renders the consequences before confirming** — the proposal withdrawal, the
  contest prune count, the tally reset, the unfreeze — plus a **required free-text
  reason**. Only then does it call `reopen_first_read_session`.

---

## Gate decomposition (sizes, order)

| # | Gate | Size | Depends on | Summary |
|---|------|------|-----------|---------|
| 1 | **FR-REOPEN-1 (schema)** | M | — | `first_read_proposals` table (migrate `proposal_json` off the session; status `issued/superseded` + `superseded_by_id` self-FK; issuance-time counts incl. provisioned `not_important_count`); `first_read_session_reopens` audit table; transition-guard extension admitting `proposal_issued→open` under `app.fr_reopen_authority`. Readers (`ProposalAct`, generator, export) repointed to the table. |
| 2 | **FR-REOPEN-2 (RPC)** | M | 1 | `reopen_first_read_session(id, reason)`: set GUC authority → status→open; prune session contests with audit (`app.contest_removal_reason='session_reopened'`); reset session cached counts; write the reopen audit row. Idempotent/guarded (only an issued session reopens). |
| 3 | **FR-REOPEN-3 (UI)** | S/M | 2 | Operator Reopen control on the workshop + consequences-before-act confirmation + required reason. No client-facing surface can reach it. |

**Order:** 1 → 2 → 3.

---

## Drafted client-facing strings — PENDING SIGNATURE
- Reopen affordance: `Reopen this read`
- Confirmation title: `Reopen the First Read?`
- Consequence lines:
  - `The issued proposal will be withdrawn — kept as a superseded record, never deleted.`
  - `{n} contest{s} recorded from this meeting will be removed (audited).`  *(hidden at 0)*
  - `The meeting tally resets, and the client's verdicts become editable again.`
- Reason field label: `Why are you reopening? (recorded)`
- Confirm / cancel: `Reopen` · `Cancel`

---

## Open questions for the operator

**The four hard ones (answered, ruling to confirm):**
1. **Proposal artifact** — supersede (recommended) vs delete-with-audit? And the
   interim state: old proposal stays `issued` until the next issuance completes the
   MO-ordered supersession (recommended), or a `reopened` proposal status at reopen?
2. **Contest reconciliation** — prune-with-audit on reopen (recommended) vs any other
   shape? Confirm the struck-survives caveat (reopen-prune never touches
   `claims.status`).
3. **Cached tally / flywheel** — reset session counts + preserve issuance snapshot on
   the proposal record (recommended)? Re-snapshot `mojo_score_at_open` on reopen (recommend no)?
4. **Freeze flip** — via the GUC-gated transition edge (recommended), freeze trigger
   untouched — confirm no appetite for a freeze-level override.

**Others:**
5. **Reopen scope** — only `proposal_issued` reopens (recommended), or may
   `accepted`/`declined` sessions reopen too (a bigger, resolution-reversing act)?
6. **Control location** — workshop Inputs strip (recommended) or the rail's Act 5?
7. **not_important cache** — provision `not_important_count` now (recommended) so
   FR-FLOW-3 needs no second migration, even though the generator won't populate it
   until then?
