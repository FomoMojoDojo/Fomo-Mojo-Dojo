-- CLAIM_DELTAS.observed_own_host + host-aware override refusal (self-echo gate, step 2, 2026-09-03).
--
-- observed_own_host: stamped at pairing (claimDeltaSynthesis) from the single TS own-domain predicate
-- isOwnDomainUrl over every URL that backs the observed claim (refs' signals, else raw_payload.page_url).
-- After this gate an own-host observed claim never forms a pair, so the column is false by construction
-- on new rows; it exists for LEGACY rows (the 32 CB2 self-echoes, intentionally NOT back-stamped here —
-- they leave audited on the recompute) and for the readers' shared selector (isPairAdmissible).
-- set_relevance_override refuses any identity whose live delta row carries the marker.
-- Additive: default false, no existing row changes.

alter table public.claim_deltas
  add column observed_own_host boolean not null default false;
create index claim_deltas_observed_own_host_idx
  on public.claim_deltas (company_id) where observed_own_host;

CREATE OR REPLACE FUNCTION public.set_relevance_override(p_company_id uuid, p_pairing_kind text, p_content_identity text, p_verdict text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_frozen     boolean;
  v_prior_id   uuid;
  v_new_id     uuid;
  v_patched    integer := 0;
  v_superseded integer := 0;
begin
  if not (coalesce(auth.role(), '') = 'service_role'
          or session_user = 'postgres'
          or public.has_role(auth.uid(), 'admin'::app_role)) then
    raise exception 'set_relevance_override: admin only';
  end if;
  if p_verdict not in ('relevant', 'orthogonal', 'withdrawn') then
    raise exception 'set_relevance_override: verdict must be relevant | orthogonal | withdrawn';
  end if;
  if p_pairing_kind not in ('internal_vs_public', 'public_vs_public') then
    raise exception 'set_relevance_override: bad pairing_kind';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'set_relevance_override: a reason is required';
  end if;
  select frozen into v_frozen from public.companies where id = p_company_id;
  if v_frozen is null then
    raise exception 'set_relevance_override: company not found';
  end if;
  if v_frozen then
    raise exception 'This is a frozen reference company — its record is preserved and is not modified.';
  end if;

  -- SELF-ECHO GATE (2026-09-03): a pair whose observed side is the company's OWN site is not
  -- corroboration and can never be spared into it (or struck/withdrawn — it does not belong to the
  -- relevance overlay at all). The marker is stamped at pairing by the single TS own-domain predicate
  -- (isOwnDomainUrl) — never re-derived in SQL.
  if exists (
    select 1 from public.claim_deltas d
     where d.company_id = p_company_id and d.pairing_kind = p_pairing_kind
       and d.content_identity = p_content_identity and d.observed_own_host
  ) then
    raise exception 'This pair''s observed side is the company''s own site — own words cannot corroborate own words. No relevance override is accepted for it.';
  end if;

  select id into v_prior_id
    from public.claim_delta_relevance_overrides
   where company_id = p_company_id and pairing_kind = p_pairing_kind
     and content_identity = p_content_identity and superseded_by is null;

  -- Reversal is a NEW row. The prior live decision is superseded FIRST (pointing at the pre-generated
  -- new id — the deferred FK is checked at commit), so the live-uniqueness index never sees two live
  -- rows for the pair; then the new decision is inserted with that id.
  v_new_id := gen_random_uuid();
  if v_prior_id is not null then
    update public.claim_delta_relevance_overrides set superseded_by = v_new_id where id = v_prior_id;
    get diagnostics v_superseded = row_count;
  end if;
  insert into public.claim_delta_relevance_overrides
    (id, company_id, pairing_kind, content_identity, verdict, reason, decided_by)
  values (v_new_id, p_company_id, p_pairing_kind, p_content_identity, p_verdict, btrim(p_reason), auth.uid());

  if p_verdict in ('relevant', 'orthogonal') then
    -- The trigger derives the columns from the (now live) override; touching the row is enough.
    update public.claim_deltas
       set relevance_verdict = p_verdict
     where company_id = p_company_id and pairing_kind = p_pairing_kind and content_identity = p_content_identity;
    get diagnostics v_patched = row_count;
  else
    update public.claim_deltas
       set relevance_verdict = null, relevance_provider = null, relevance_model = null,
           relevance_reason = null, relevance_span = null, relevance_judged_at = null
     where company_id = p_company_id and pairing_kind = p_pairing_kind and content_identity = p_content_identity
       and relevance_provider = 'operator';
    get diagnostics v_patched = row_count;
  end if;

  return jsonb_build_object('override_id', v_new_id, 'superseded', v_superseded, 'patched', v_patched);
end;
$function$;
