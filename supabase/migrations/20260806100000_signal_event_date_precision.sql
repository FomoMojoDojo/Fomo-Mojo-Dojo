-- event_date precision (Option B date supply). Additive, non-destructive.
--
-- signals.event_date is a `date`, so a month-precision source date (YYYY-MM) must be
-- stored as YYYY-MM-01 — indistinguishable from a genuine first-of-month date. This column
-- records the precision so the (event_date, event_date_precision) PAIR is self-describing:
-- no consumer needs raw_payload to render the date honestly ("Apr 2026" vs "1 Apr 2026").
--
-- NOT NULL DEFAULT 'day': every existing row (and any NULL-date row) is day-precision by
-- default; the backfill sets 'month' only on the rows promoted from a YYYY-MM source date.
alter table public.signals
  add column if not exists event_date_precision text not null default 'day';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'signals_event_date_precision_check'
  ) then
    alter table public.signals
      add constraint signals_event_date_precision_check
      check (event_date_precision in ('day', 'month'));
  end if;
end $$;
