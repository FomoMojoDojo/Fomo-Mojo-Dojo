-- ONB-F3 S4: flow_type column on agent_flow_runs
--
-- NULL = existing omnibus orchestrator run (no backfill — intended semantic).
-- Named discrete flows (S5+) will write their own agent_flow_runs rows
-- with flow_type set (e.g. 'public_research', 'framework_diagnosis').
-- No CHECK constraint per Option A — callers set their own label without
-- requiring a migration when new flow types are introduced.

ALTER TABLE agent_flow_runs
  ADD COLUMN flow_type text;
