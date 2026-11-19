-- SP-426 slice 1: give a signal the content identity that 16 other tables already carry.
--
-- WHY. Counters over `signals` count ROWS, and a document analysed more than once stores the same
-- sentence many times over (SP-F49). The retirement half of SP-426 removes the rows of superseded
-- analyses, but duplication also exists WITHIN one kept run — Charter's run f2aa597f holds 36 rows
-- for 15 distinct sentences — so retirement alone cannot make a count right. A counter must be able
-- to ask "how many distinct sentences", and that needs a stored identity.
--
-- THE VALUE IS WRITTEN IN TYPESCRIPT, NEVER IN SQL. _shared/contentIdentity.ts:6-9 records the
-- standing ruling: "A SQL re-implementation was rejected precisely because Postgres POSIX \s
-- diverges on Unicode whitespace; this TS helper is the only source." So there is no generated
-- column, no expression index and no DEFAULT here — `signalContentIdentity()` stamps the value at
-- mint and the backfill script writes it for existing rows.
--
-- NULL IS A REAL STATE AND IS NEVER FOLDED. A row with no excerpt, and every row on a company the
-- backfill does not touch (CB1 58b2b15b is never written, SP-426), keeps content_identity NULL.
-- Counters treat NULL as "no identity": such a row counts once, on its own id, and is never merged
-- with another. The fallback is therefore the pre-slice behaviour, never a silent collapse.

alter table public.signals add column if not exists content_identity text;

create index if not exists signals_content_identity
  on public.signals (company_id, content_identity)
  where content_identity is not null;
