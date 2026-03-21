-- Relax rigid input grouping:
-- - Respect explicit group_key when provided (foundation/execution/market_evidence)
-- - Use key-based fallback only when missing
-- - Update fallback so outcome-data defaults to market_evidence

create or replace function public.enforce_input_group()
returns trigger
language plpgsql
as $function$
begin
  -- Respect caller-provided valid group_key; otherwise derive from input_key.
  if new.group_key is null then
    if new.input_key in ('comp-alt','unique-attr','val-prop','target-aud','market-cat','program-model','needs-assessment') then
      new.group_key := 'foundation'::public.input_group_key;
    elsif new.input_key in ('referral-map','brand-narrative','channel-strat') then
      new.group_key := 'execution'::public.input_group_key;
    elsif new.input_key in ('outcome-data','donor-retention','grant-pipeline','family-satisfaction') then
      new.group_key := 'market_evidence'::public.input_group_key;
    else
      new.group_key := 'foundation'::public.input_group_key;
    end if;
  end if;

  -- Keep label synchronized to key.
  if new.group_key = 'execution'::public.input_group_key then
    new.group_label := 'Execution';
  elsif new.group_key = 'market_evidence'::public.input_group_key then
    new.group_label := 'Market Evidence';
  else
    new.group_label := 'Foundation';
  end if;

  return new;
end;
$function$;

