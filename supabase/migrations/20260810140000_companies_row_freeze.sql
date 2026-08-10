-- COMPANIES-ROW FREEZE (operator ruling 2026-08-10). Extends migration 20260810120000.
--
-- 20260810120000's guard keys on company_id, so it covers every child table but NOT the companies
-- row itself — a frozen company's own name and score stayed writable, and the 2026-08-07 breach was
-- partly a same-NAME collision. This freezes the companies row too: a frozen company's own row cannot
-- be modified or deleted, with exactly one lawful exception — flipping the frozen flag itself, via the
-- existing per-transaction app.freeze_override door (service-role / restore path). The door THAWS; it
-- does not permit edit-while-frozen.
--
-- No INSERT trigger: a brand-new row cannot be born frozen-and-preexisting, and freezing (setting
-- frozen=true on an unfrozen row) is always lawful.

create or replace function public.enforce_frozen_company_row()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.frozen then
      raise exception 'This is a frozen reference company — its record is preserved and is not modified.';
    end if;
    return old;
  end if;

  -- UPDATE. An unfrozen company is freely editable — including setting frozen=true (freezing is lawful).
  if not old.frozen then
    return new;
  end if;

  -- old.frozen = true: the row is immutable except for a lawful thaw of the frozen flag itself.
  -- Any change to a NON-frozen column is refused even WITH the override (the door thaws, it does not
  -- edit-while-frozen).
  if (to_jsonb(new) - 'frozen') is distinct from (to_jsonb(old) - 'frozen') then
    raise exception 'This is a frozen reference company — its record is preserved and is not modified.';
  end if;

  -- Only the frozen flag is (potentially) changing. A genuine flip is lawful only under the override.
  if new.frozen is distinct from old.frozen then
    if current_setting('app.freeze_override', true) = 'on' then
      return new;
    end if;
    raise exception 'This is a frozen reference company — its record is preserved and is not modified.';
  end if;

  -- No-op update (nothing changed) on a frozen row — still refused; a frozen row is immutable.
  raise exception 'This is a frozen reference company — its record is preserved and is not modified.';
end
$$;

drop trigger if exists enforce_frozen_company_row on public.companies;
create trigger enforce_frozen_company_row
  before update or delete on public.companies
  for each row execute function public.enforce_frozen_company_row();
