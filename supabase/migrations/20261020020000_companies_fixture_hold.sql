-- R40 (operator ruling 2026-10-20): a test fixture is HELD by a stored column, not by convention.
-- companies.fixture_hold carries the hold reason ("R39:test_fixture") and is null for every real client. Every
-- reader that feeds a fleet sweep or a client surface excludes a non-null row; the admin inventory marks it.
alter table public.companies add column if not exists fixture_hold text null;
comment on column public.companies.fixture_hold is 'R40: non-null holds the company out of fleet sweeps, product proof and client surfaces (reason string, e.g. R39:test_fixture). One integrity_runs row component fixture_hold per hold.';
notify pgrst, 'reload schema';
