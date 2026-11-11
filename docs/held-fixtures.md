# Held fixtures — the standing record

A **held fixture** is a company carrying a non-null `companies.fixture_hold`. R40 defines that as
"outside every fleet sweep, product proof and client surface": nothing a held company holds is ever
read as evidence, counted in a baseline, or shown to anyone.

Holds exist because **some rows cannot be deleted.** `interview_records` is append-only —
`interview_records_immutable()` raises *"interview records are retracted, never deleted"* — and once
a record points at an `input_files` row, `interview_records_input_file_id_fkey` pins that too. A
guard that creates such rows therefore cannot clean up after itself. E2 (2026-11-07) settles what it
does instead: **stamp the hold first, delete every deletable child, never delete the company.**

Stamping the hold *first* is the load-bearing part. The 2026-11-07 fixture was left live because the
teardown aborted on an append-only child before it reached the hold.

## The families

| Tag | Count | Owner | Shape |
|---|---|---|---|
| `IUP:fixture` | 1 | `scripts/guards/interview-upload-path-guard.sh` | **one kept company, reused every run** |
| `IUP:spent-<run>` | 2 | — | retired one-offs from the U6-38 proof runs |
| `FA2:spent-<run>` | 18 | `scripts/guards/file-analysis-v2-guard.sh` | one company **per run** |
| `FA2:stuck-20261107` | 1 | — | the pre-E2 fixture that was left live and then held |
| `R39:test_fixture` | 3 | R39 | long-lived test companies |

25 held companies in all.

## The one the upload guard keeps

```
8507eb60-468a-4d90-83a1-eedd197a9cd1   ZZ interview upload path fixture (U6-38)   IUP:fixture
```

`scripts/guards/interview-upload-path-guard.sh` **reuses this company on every run** and never mints
another. It has to: each run uploads a transcript, so each run leaves behind one more retracted
`interview_records` row and the `input_files` row pinned beneath it, and neither can be deleted. One
company per run would leak one undeletable company per run, forever.

The guard asserts the fixture's shape before it does anything — the company exists, the hold reads
`IUP:fixture`, and it carries a `customer-research` input (R17: an interview file's only home). A
missing or un-held fixture is a FAIL, never a silent pass against some live company.

The accumulating rows are harmless and expected: the guard's own last check is that **no live
interview record is left on the fixture** — every record it creates is withdrawn in the same run.

To rebuild it from nothing:

```sql
insert into companies (id, name, created_by, fixture_hold)
values ('8507eb60-468a-4d90-83a1-eedd197a9cd1', 'ZZ interview upload path fixture (U6-38)',
        (select user_id from user_roles where role='admin' limit 1), 'IUP:fixture');
insert into inputs (company_id, user_id, input_key, input_label)
values ('8507eb60-468a-4d90-83a1-eedd197a9cd1',
        (select user_id from user_roles where role='admin' limit 1), 'customer-research', 'Customer research');
```

## U6-9 — the one live document on the member fixture company (2026-11-11)

`66666666-6666-4666-8666-666666666601` ("zz first-read-rls member co") now carries one `inputs` row
and one live `input_files` row:

| table | id |
|---|---|
| `inputs` | `fed73bf6-d278-4b07-9526-0c3992f1f82d` |
| `input_files` | `d43566f5-773c-4fea-8838-7f32de88632c` (`u6-9-fixture.txt`, `archived_at` null) |

**Why.** `isDiagnoseRunning` is true for a company with at least one live `input_file` or live
`interview_record` (`src/lib/diagnoseRunning.ts`). The landing resolver branches on it — Diagnose
home if running, else the First Read — and before this row that company had neither, so the Diagnose
branch could not be exercised against a real member session at all. One document is the smallest
thing that makes the branch real.

**It is a document in name only**: no bytes in storage, no analysis, no model call. `input_files` is
a metadata row; nothing reads the path.

**To undo it** (the First Read branch becomes the landing again):

```sql
delete from input_files where id = 'd43566f5-773c-4fea-8838-7f32de88632c';
delete from inputs      where id = 'fed73bf6-d278-4b07-9526-0c3992f1f82d';
```

**Note this company carries no `fixture_hold`.** It is a fixture by name and convention only, which
is why `scripts/operator/create-account.sh`'s held-company refusal did not fire on it during the
U6-60 proof — see U6-66 in `docs/operator-account-setup.md`.

## `U660:proof` — the U6-60 procedure's throwaway (2026-11-11, retired same day)

`73de19cf-5fc3-4635-819d-9bad7b88d427` ("zz u6-60 proof 1794411818"). Minted to prove
`scripts/operator/create-account.sh` end to end, then retired the same hour: `fixture_hold` stamped
FIRST, the membership deleted, the throwaway account deleted through the auth admin API. The company
stays, as every retired fixture does.

Final state afterwards: `auth.users` 15, `profiles` 15, 0 orphan profiles, `company_members` 9 — each
identical to the pre-U6-65 dump.

## `FA2:killed-*` — a guard killed by a watchdog leaves its company unheld (2026-11-11)

`7600cb38-e442-4124-9e24-9077a17cfa0c` ("ZZ throwaway v2 guard 20261111T164449Z-7600cb38"), held as
`FA2:killed-20261111T164449Z-7600cb38`.

**How it happened.** A session sweep ran `file-analysis-v2-guard.sh` under a 300-second watchdog.
That guard legitimately runs longer, so it was killed MID-RUN — after it had minted its company and
written 7 claims, 36 signals and 1 input, and before its teardown could stamp the hold. The guard is
not at fault: its teardown is an exit path, and SIGKILL has no exit path.

**What that means in practice.** An unheld `ZZ ` company is selectable: `pickDefaultCompanyId` skips
held rows and would have been free to pick this one. The hold is what makes a fixture invisible, so
a killed guard leaves exactly the gap the hold exists to close.

Retired here by hand, in the E2 order: `fixture_hold` stamped FIRST, then the deletable children
(claims, signals, input_files, inputs) removed, the company kept.

**The lesson for watchdogs**: a timeout that SIGKILLs a guard trades a hung sweep for unheld residue.
`file-analysis-v2` and the `deno`-dependent guards need a generous one — 900s is what this session
settled on — and any sweep should check for unheld `ZZ ` companies afterwards:

```sql
select id, name from companies where name ilike 'zz %' and fixture_hold is null;
```

## `U679:proof` — the set-password proof's throwaway (2026-11-11, retired same minute)

`b7e579b1-1dc8-4db3-b951-5d85b419ba02` ("zz u6-79 proof 1794422039"). Minted to prove
`scripts/operator/set-password.sh`, retired immediately: hold stamped FIRST, membership deleted,
account deleted through the auth admin API, company kept.

## A note on `FA2:spent-*`

`file-analysis-v2-guard.sh` mints a company per run by design — per-run uuids were how R35's
"teardown did not finish" collisions were fixed. The cost is visible above: 18 held companies in
three days. It creates append-only children of its own, so the same one-kept-company shape would
work there, and is worth considering the next time that guard is opened.

## Checking the record against the database

```sql
select fixture_hold, count(*), min(name)
from companies where fixture_hold is not null group by fixture_hold order by fixture_hold;
```
