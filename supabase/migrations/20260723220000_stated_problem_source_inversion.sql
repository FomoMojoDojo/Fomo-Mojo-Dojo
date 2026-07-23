-- V2-2b — Act 1 source inversion. The stated problem comes FIRST from the company's
-- OWN declared brief (companies.strategic_problem_brief — internal register, the
-- problem the client brought at creation); only when that's blank is it INFERRED from
-- their public site (public register). The two NEVER blend; the row is stamped with
-- which register fired.
--
-- register widens from the V2-2 lock ('client_voice') to the two source registers:
--   'internal_declared' = company_declared (the brief)
--   'public_observed'   = site_inferred   (the V2-2 public-signal pipeline)
-- descriptive_fallback: true when a site-inferred read could only support a
-- description of what they do (not a problem framing) — the render labels it honestly.

alter table public.first_read_stated_problem drop constraint fr_stated_problem_register_check;

-- Migrate the V2-2 rows (all were site-inferred) to the new vocabulary before the CHECK.
update public.first_read_stated_problem set register = 'public_observed' where register = 'client_voice';

alter table public.first_read_stated_problem alter column register set default 'public_observed';
alter table public.first_read_stated_problem
  add constraint fr_stated_problem_register_check check (register in ('internal_declared', 'public_observed'));

alter table public.first_read_stated_problem
  add column if not exists descriptive_fallback boolean not null default false;
