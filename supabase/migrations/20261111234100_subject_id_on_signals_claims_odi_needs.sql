-- subject_id on signals, claims and odi_needs — nullable, no default, no backfill (SP-50, SP-51).
--
-- WHAT THIS MIGRATION DOES NOT DO. It writes no row. Every existing signal (4186), claim (1662) and
-- need (273) keeps subject_id NULL, which under C1 reads as "about the client" — exactly what every
-- one of them means today. There is no backfill because there is nothing to infer from: the subject
-- of a past row was never recorded, and guessing it from a host would invent evidence. No reader
-- changes in this slice either; subjects-guard.sh (check g) asserts both, by counting non-null
-- subject_id fleet-wide and by proving `grep -rn subject_id src/` reaches only the generated types.
--
-- WHY A COMPOSITE FOREIGN KEY AND NOT A TRIGGER (SP-51). SP-11 requires that a row's subject belong
-- to the row's OWN company; otherwise company A's evidence could be attributed to a subject of
-- company B and a member of A would read a name they have no right to. A trigger could enforce it,
-- but a trigger is code that can be dropped, reordered or bypassed by a definer function, and it
-- costs a query per row. The composite key states the same law in the schema:
--
--     (subject_id, company_id) -> subjects (id, company_id)
--
-- and subjects.subjects_id_company is the unique constraint it points at.
--
-- MATCH SIMPLE (the default) IS THE WHOLE REASON TODAY'S ROWS ARE SAFE. Under MATCH SIMPLE a
-- composite foreign key is satisfied whenever ANY of its columns is NULL, so every row with
-- subject_id NULL skips the check entirely even though company_id is NOT NULL and set. MATCH FULL
-- would require all-or-nothing and would reject all 6121 existing rows. Do not change it.
--
-- ON DELETE RESTRICT, NOT SET NULL (SP-40). SET NULL on a subject's deletion would silently
-- re-attribute that subject's evidence to the client, which is the one answer that is always wrong.
-- A referenced subject cannot be deleted; it is retired with subjects.retired_at.
--
-- company_related_entities deliberately does NOT get a subject_id here - that is slice 5.

alter table public.signals    add column subject_id uuid;
alter table public.claims     add column subject_id uuid;
alter table public.odi_needs  add column subject_id uuid;

alter table public.signals
  add constraint signals_subject_fkey
  foreign key (subject_id, company_id) references public.subjects (id, company_id)
  on delete restrict;

alter table public.claims
  add constraint claims_subject_fkey
  foreign key (subject_id, company_id) references public.subjects (id, company_id)
  on delete restrict;

alter table public.odi_needs
  add constraint odi_needs_subject_fkey
  foreign key (subject_id, company_id) references public.subjects (id, company_id)
  on delete restrict;

create index signals_subject   on public.signals   (subject_id) where subject_id is not null;
create index claims_subject    on public.claims    (subject_id) where subject_id is not null;
create index odi_needs_subject on public.odi_needs (subject_id) where subject_id is not null;

comment on column public.signals.subject_id is
  'SP-11: who this signal is ABOUT. NULL = the client (C1). Independent of voice_class, which says who SPOKE (C2). Composite FK to subjects (id, company_id) keeps it inside this row''s own company.';
comment on column public.claims.subject_id is
  'SP-11: who this claim is ABOUT. NULL = the client (C1). Independent of voice_class (C2).';
comment on column public.odi_needs.subject_id is
  'SP-11: whose need this is. NULL = the client (C1). journey_key cannot carry this: research synthesis hardcodes journey_key customer for every subject (researchSynthesisWrite.ts:318).';
