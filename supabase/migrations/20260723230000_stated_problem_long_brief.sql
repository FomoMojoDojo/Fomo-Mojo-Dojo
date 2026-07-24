-- V2-3 (Part 2) — Act 1 long-brief parseability + a sign-to-publish lifecycle.
--
-- Two changes, both additive:
--   1. supporting_points: for a LONG declared brief, the distillation is a short
--      headline (kept in `statement`) PLUS up to 4 short supporting points. A short
--      brief keeps the single statement and an empty points array.
--   2. status ('signed' | 'pending'): a regenerated shape must NOT overwrite the row
--      the client is currently shown. Generation writes a 'pending' row; the operator
--      signs to promote it to 'signed'. A signed row and a pending row COEXIST for one
--      company (UNIQUE(company_id, status)), so the old signed statement stays live
--      until the new shape is signed. The client render reads status='signed' only.

alter table public.first_read_stated_problem
  add column if not exists supporting_points jsonb not null default '[]'::jsonb,
  add column if not exists status text not null default 'pending';

-- at most 4 supporting points, and only for a real (non-empty) headline set
alter table public.first_read_stated_problem
  drop constraint if exists fr_stated_problem_points_cap;
alter table public.first_read_stated_problem
  add constraint fr_stated_problem_points_cap
  check (jsonb_typeof(supporting_points) = 'array' and jsonb_array_length(supporting_points) <= 4);

alter table public.first_read_stated_problem
  drop constraint if exists fr_stated_problem_status_check;
alter table public.first_read_stated_problem
  add constraint fr_stated_problem_status_check
  check (status in ('signed', 'pending'));

-- the currently-shown Edgewood row (and any pre-existing row) is already operator-signed
update public.first_read_stated_problem set status = 'signed' where status = 'pending';

-- swap the one-row-per-company key for one-signed + one-pending-per-company
alter table public.first_read_stated_problem
  drop constraint if exists first_read_stated_problem_company_id_key;
alter table public.first_read_stated_problem
  drop constraint if exists first_read_stated_problem_company_status_key;
alter table public.first_read_stated_problem
  add constraint first_read_stated_problem_company_status_key unique (company_id, status);
