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
