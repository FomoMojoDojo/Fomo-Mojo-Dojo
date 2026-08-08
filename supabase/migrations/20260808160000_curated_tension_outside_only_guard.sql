-- First Read = OUTSIDE-ONLY (provenance gate) — curated_tensions AUTHORING guard.
--
-- The curated tension is Theme 1's flagship exhibit; it points DIRECTLY at two claim ids (promise +
-- difficulty). A tension whose either side is uploaded-document-derived would render document
-- content on the First Read rail, bypassing the read-layer filter. This trigger refuses such a
-- curation AT WRITE TIME with an honest message — structural, independent of the write path.
--
-- Marker: a claim is document-derived iff a backing signal has source_type='uploaded_file'
-- (infer-by-absence, operator ruling). Guards only LIVE rows (removed_at IS NULL) so a soft-remove
-- is never blocked.

create or replace function public.reject_file_derived_curated_tension()
returns trigger
language plpgsql
as $$
begin
  if new.removed_at is not null then
    return new; -- soft-remove / already-removed rows are never blocked
  end if;
  if exists (
    select 1
    from public.claim_signal_refs csr
    join public.signals s on s.id = csr.signal_id
    where csr.claim_id in (new.promise_claim_id, new.difficulty_claim_id)
      and s.source_type = 'uploaded_file'
  ) then
    raise exception
      'This tension draws on an uploaded document — the First Read is the outside view only. Curate from public or told-us (declared) claims instead.';
  end if;
  return new;
end
$$;

create trigger curated_tensions_outside_only
  before insert or update on public.curated_tensions
  for each row execute function public.reject_file_derived_curated_tension();
