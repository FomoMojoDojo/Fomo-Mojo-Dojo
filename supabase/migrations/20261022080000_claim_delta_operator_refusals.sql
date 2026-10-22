-- claim_delta_rule_refusals: the OPERATOR kind (operator ruling 8, 2026-10-22). An operator may refuse a judged
-- public_vs_public pair the rules let stand, with the operator's reason VERBATIM. Same append-only table, same audit row
-- before each write, same revert by pointer row. An active operator refusal ALWAYS WINS and the system never revisits
-- it: the rule planner (deltaRuleChecks.planRuleRefusals) skips any identity that holds an active refusal of either
-- kind, and a rule revert reverts only its own run's rows. Available to any company.
--   kind 'rule'      rule R1 | R2 | R3, actor a system writer
--   kind 'operator'  rule 'operator', outcome not_echoed, reason non-blank (verbatim), actor 'operator:<who>'

alter table public.claim_delta_rule_refusals add column kind text not null default 'rule' check (kind in ('rule', 'operator'));
alter table public.claim_delta_rule_refusals drop constraint claim_delta_rule_refusals_rule_check;
alter table public.claim_delta_rule_refusals add constraint claim_delta_rule_refusals_rule_check check (rule in ('R1', 'R2', 'R3', 'operator'));
alter table public.claim_delta_rule_refusals add constraint claim_delta_rule_refusals_kind_rule check ((kind = 'operator') = (rule = 'operator'));
alter table public.claim_delta_rule_refusals add constraint claim_delta_rule_refusals_operator_actor check (kind <> 'operator' or actor like 'operator:_%');
alter table public.claim_delta_rule_refusals add constraint claim_delta_rule_refusals_operator_outcome check (kind <> 'operator' or outcome = 'not_echoed');

alter table public.claim_delta_rule_refusal_audit drop constraint claim_delta_rule_refusal_audit_rule_check;
alter table public.claim_delta_rule_refusal_audit add constraint claim_delta_rule_refusal_audit_rule_check check (rule in ('R1', 'R2', 'R3', 'operator'));

-- the active set now names the kind and the actor (columns appended; same rows)
create or replace view public.claim_delta_rule_refusals_active with (security_invoker = true) as
  select r.id, r.company_id, r.delta_id, r.content_identity, r.delta_type, r.rule, r.outcome, r.reason, r.detail, r.rules_version, r.at,
         r.kind, r.actor
  from public.claim_delta_rule_refusals r
  where r.action = 'refuse'
    and not exists (select 1 from public.claim_delta_rule_refusals v where v.reverts = r.id);
revoke all on public.claim_delta_rule_refusals_active from anon;
-- destructive-ok: REVOKE of the TRUNCATE privilege (grant layer); nothing is truncated
revoke insert, update, delete, truncate, references, trigger on public.claim_delta_rule_refusals_active from authenticated;
