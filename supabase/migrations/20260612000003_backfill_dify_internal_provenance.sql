-- Gate 2b (operator-approved): stamp internal_derived ONLY where a writer-stamped
-- marker proves internal origin — frameworks_used containing 'dify_mojo_analysis'
-- means the row was written by run-mojo-analysis (the internal pipeline; Gate 1
-- stamps its new writes internal_derived). Marker alone, no name filter: Edgewood's
-- customer journey is included deliberately (consequence accepted on record).
-- After this, zero NULL internal-named rows exist; name predicates are deleted at
-- protection sites. Remaining NULLs stay NULL per Gate 1 law (unprovable).
update public.job_steps
set provenance_type = 'internal_derived'
where provenance_type is null
  and frameworks_used @> array['dify_mojo_analysis'];
