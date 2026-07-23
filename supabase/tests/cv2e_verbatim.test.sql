-- CV-2e verbatim-quote CHECK (rolled back — zero residue). A quote is admitted ONLY
-- as a byte-exact substring of retained source text; a one-char drift, or model text
-- not present in the source, is REFUSED loudly. Quote-less and undated rows are fine.
begin;
do $$
declare
  v_company uuid := 'd8feefb3-ce5a-43d9-bccb-f573bb95e88a';
  v_src text := 'The board voted to commoditise the shuttle service in 2016.';
  v_fired boolean;
  v_id uuid;
begin
  -- ACCEPT: quote is a verbatim substring of the source
  insert into public.signals (company_id, source_type, signal_band, evidence_type, claim_text,
                              quote, quote_source_text, event_date)
  values (v_company, 'public_baseline_run', 'outside', 'market_signal', 'model paraphrase of the finding',
          'commoditise the shuttle service', v_src, '2016-05-01')
  returning id into v_id;
  if v_id is null then raise exception 'CV2E-FAIL accept: verbatim quote was not stored'; end if;

  -- REFUSE: a ONE-CHAR DRIFT (commoditize vs commoditise) is not a substring
  v_fired := false;
  begin
    insert into public.signals (company_id, source_type, signal_band, evidence_type, claim_text,
                                quote, quote_source_text)
    values (v_company, 'public_baseline_run', 'outside', 'market_signal', 'x',
            'commoditize the shuttle service', v_src);  -- 'z' not in source
  exception when check_violation then v_fired := true;
  end;
  if not v_fired then raise exception 'CV2E-FAIL drift: a one-char-drifted quote was accepted'; end if;

  -- REFUSE: model text passed off as a quote (not present in source at all)
  v_fired := false;
  begin
    insert into public.signals (company_id, source_type, signal_band, evidence_type, claim_text,
                                quote, quote_source_text)
    values (v_company, 'public_baseline_run', 'outside', 'market_signal', 'x',
            'The company is commoditizing its services', v_src);
  exception when check_violation then v_fired := true;
  end;
  if not v_fired then raise exception 'CV2E-FAIL substitution: model text was accepted as a quote'; end if;

  -- REFUSE: a quote with NO retained source text (cannot be proven verbatim)
  v_fired := false;
  begin
    insert into public.signals (company_id, source_type, signal_band, evidence_type, claim_text, quote)
    values (v_company, 'public_baseline_run', 'outside', 'market_signal', 'x', 'some line');
  exception when check_violation then v_fired := true;
  end;
  if not v_fired then raise exception 'CV2E-FAIL no-source: a source-less quote was accepted'; end if;

  -- ACCEPT: quote-less signal (honest absence), undated
  insert into public.signals (company_id, source_type, signal_band, evidence_type, claim_text)
  values (v_company, 'public_baseline_run', 'outside', 'market_signal', 'a finding with no quotable line');

  raise notice 'CV2E PASS — verbatim substring accepted; drift / substitution / source-less refused; quote-less admitted';
end $$;
rollback;
