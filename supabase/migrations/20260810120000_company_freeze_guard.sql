-- DB-LEVEL COMPANY FREEZE GUARD (operator ruling 2026-08-10).
--
-- CB1 (Cafe Barra, 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc) is a frozen reference fixture: its record
-- is preserved and is SELECT-only. The freeze had lived ONLY in code constants across ~55 write-
-- capable edge functions (just 2 guarded at their entry); the 2026-08-07 CB1 breach + the 2026-08-10
-- estate census proved a code-level guard leaks (any unguarded edge fn, any RPC, any direct SQL under
-- RLS could write around it). This makes the freeze STRUCTURAL:
--   - companies.frozen is the SOLE authority (client isFrozenCompany is now a cosmetic pre-check).
--   - a BEFORE INSERT/UPDATE/DELETE trigger on EVERY company_id-bearing table refuses any write to a
--     frozen company — no current or future entry point can write around it.
--   - lawful operator acts (the CB1-restore class) pass by setting the per-transaction GUC
--     app.freeze_override='on' (local=true), mirroring the sanctioned set_claim_status pattern
--     (app.claim_status_authority). Only trusted server/restore code sets it.
--   - long_runner_runs is EXCLUDED per ruling: the ledger records attempts (incl. refused ones); it
--     is not company substance.

-- (a) authority column — companies.frozen. companies has no company_id column and carries no freeze
--     trigger, so it stays writable (this UPDATE, and score writes, are unaffected).
alter table public.companies add column if not exists frozen boolean not null default false;
update public.companies set frozen = true where id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc';

-- (b) the guard function. Resolves the row's company_id (NEW on INSERT, OLD on DELETE, BOTH on
--     UPDATE — a row moving INTO or OUT OF a frozen company is a breach from either side). Skips when
--     company_id is NULL. Honors the per-transaction override door.
create or replace function public.enforce_company_freeze()
returns trigger
language plpgsql
as $$
declare
  is_frozen boolean;
  cid uuid;
begin
  -- override door: lawful operator / restore path sets this per-transaction (set_config(..., true)).
  if current_setting('app.freeze_override', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' then
    -- refuse a write to a row that currently belongs to a frozen company...
    if old.company_id is not null then
      select frozen into is_frozen from public.companies where id = old.company_id;
      if is_frozen then
        raise exception 'This is a frozen reference company — its record is preserved and is not modified.';
      end if;
    end if;
    -- ...and refuse MOVING a row INTO a frozen company.
    if new.company_id is not null and new.company_id is distinct from old.company_id then
      select frozen into is_frozen from public.companies where id = new.company_id;
      if is_frozen then
        raise exception 'This is a frozen reference company — its record is preserved and is not modified.';
      end if;
    end if;
    return new;
  end if;

  cid := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
  if cid is not null then
    select frozen into is_frozen from public.companies where id = cid;
    if is_frozen then
      raise exception 'This is a frozen reference company — its record is preserved and is not modified.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

-- (c) attach to every company_id-bearing base table in public EXCEPT long_runner_runs (ledger).
--     Idempotent (drop-if-exists first) so a re-run is a no-op.
do $$
declare r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_name = c.table_name and t.table_schema = c.table_schema
    where c.column_name = 'company_id'
      and c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.table_name <> 'long_runner_runs'
    order by c.table_name
  loop
    execute format('drop trigger if exists enforce_company_freeze on public.%I', r.table_name);
    execute format(
      'create trigger enforce_company_freeze before insert or update or delete on public.%I for each row execute function public.enforce_company_freeze()',
      r.table_name
    );
  end loop;
end
$$;
