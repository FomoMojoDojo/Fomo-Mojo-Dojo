# Data Safety — Local Database

## WARNING: DO NOT RUN `supabase db reset --local` DIRECTLY

Running `supabase db reset --local` destroys **all local data** including `auth.users` (login accounts). It cannot be undone without a backup. This has caused two full data-loss incidents on this project.

**Use the safe wrapper instead:**

```sh
npm run db:reset:safe
```

This script shows you what will be lost, creates a backup, and requires you to type the exact phrase "RESET LOCAL DB AND DELETE WORKSPACE DATA" before proceeding.

---

## What Happened (May 2026)

`supabase db reset --local` was run directly from the CLI twice (Phase 76A and again in a later session). Each time it:

1. Dropped the entire `public` schema and all tables
2. Deleted all `auth.users` rows (login accounts are NOT in `public` — they live in a separate schema pg_dump cannot capture)
3. Re-ran all migrations from scratch with no data
4. Left all active workspace data (job_steps, odi_needs, routes, positioning canvases) permanently gone

Reconstructed data after the incident was partial — AI-generated seeds introduced wrong framing (B2C commuter instead of B2B specialty roaster for Cafe Barra). A second recovery pass was required using conversation screenshots.

---

## Safe Commands

| Task | Command | Safety level |
|------|---------|-------------|
| Back up current data | `npm run db:backup` | Safe — read-only |
| Restore from backup | `npm run db:restore <file.sql>` | Requires typed confirmation + auto pre-restore backup |
| Reset and re-migrate (destructive) | `npm run db:reset:safe` | Requires typed confirmation + auto backup |
| Scan SQL for unsafe statements | `npm run db:check-destructive` | Safe — read-only |

### DO NOT use
- `supabase db reset --local` — no confirmation, no backup, no recovery
- `supabase db reset` (without `--local`) — would target the production project

---

## How to Back Up

```sh
npm run db:backup
```

Creates a timestamped `.sql` file in `local-db-backups/` containing all `public` schema data as INSERT statements.

**Note:** `auth.users` are NOT in this backup. If you lose auth accounts, login is broken and must be repaired via the Supabase dashboard. See Recovery Procedure below.

**Note:** Files in the `input-files` storage bucket are NOT covered by this backup. pg_dump only captures table data, not storage objects. If you have uploaded client files locally, back up the bucket separately via the Supabase dashboard before any reset.

---

## How to Restore

```sh
npm run db:restore local-db-backups/backup_20260513_143200.sql
```

Shows available backups, requires exact typed confirmation "RESTORE LOCAL DB FROM BACKUP", creates a pre-restore safety backup automatically.

To see available backups without restoring:

```sh
npm run db:restore
```

---

## How to Run Migrations Safely

Adding a new migration:

1. Write the migration in `supabase/migrations/`
2. Run `npm run db:check-destructive` to confirm it doesn't have unguarded destructive statements
3. Apply it: `npx supabase db push --local`
4. If the migration fails and you need to reset: back up first with `npm run db:backup`, then use `npm run db:reset:safe`

---

## How to Seed Safely

All seed files must pass `npm run db:check-destructive`.

Any `DELETE FROM`, `TRUNCATE`, `DROP TABLE`, or sensitive `UPDATE` must be preceded (within 8 lines) by:

```sql
-- destructive-ok: <reason why this is safe, e.g. "targets fixed UUID only; does not touch other companies">
```

Use narrow targeting:
- Always filter by company name or UUID — never delete `WHERE 1=1` or without a WHERE clause
- Use CTEs to name the target company by name so the deletion scope is visible in code review
- Prefer idempotent seeds (delete-then-insert) over unconditional inserts

---

## Destructive SQL Checker

The checker scans all `.sql` and `.sh` files in:
- `supabase/seeds/`
- `supabase/migrations/`
- `sql/`
- `scripts/`

It enforces that any destructive statement has a `-- destructive-ok:` marker within 8 lines. Run it any time:

```sh
npm run db:check-destructive
```

It exits 0 (pass) or 1 (violations found).

---

## What Is Safe in Migrations

Migration files (`supabase/migrations/`) are automatically applied by `db reset` and `db push`. The checker does NOT flag sensitive UPDATEs in migration files — only in seeds and scripts — because migration UPDATEs are schema-structural by definition (e.g., backfilling a new column).

Destructive DDL (`DROP TABLE`, `ALTER TABLE...DROP COLUMN`, `TRUNCATE`) in migrations is still flagged and requires a marker.

---

## Recovery Procedure After Accidental Reset

If `supabase db reset --local` was run and data was lost:

1. **Restore from the latest backup:**
   ```sh
   npm run db:restore local-db-backups/<latest-backup>.sql
   ```

2. **If no backup exists**, check `local-db-backups/` for any pre-reset or pre-restore safety backups created automatically.

3. **Recreate auth.users** — pg_dump does not capture these. Go to your Supabase local dashboard (`http://localhost:54323`) → Authentication → Users → Add user. Or use the Supabase CLI:
   ```sh
   npx supabase auth admin create-user --email you@example.com --password yourpassword
   ```

4. **Re-run seeds if needed:**
   ```sh
   docker cp supabase/seeds/cafe_barra_reconstructed_workspace.sql supabase_db_dzlgyxcvuwiulgifbmew:/tmp/seed.sql
   docker exec supabase_db_dzlgyxcvuwiulgifbmew psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/seed.sql postgres
   ```

5. **Check recovery status** — see `docs/RECOVERY_STATUS.md` for what data has been reconstructed and what is still estimated.

---

## Latest Backup Location

`local-db-backups/` — sorted by timestamp, newest first.

This directory is `.gitignore`d and not committed to the repository.
