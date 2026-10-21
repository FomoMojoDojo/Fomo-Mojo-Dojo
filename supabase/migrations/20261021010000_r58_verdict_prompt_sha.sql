-- R58 (operator ruling 2026-10-21): a stored judge verdict replays only when its OWN recorded prompt sha (and model)
-- equal the current ones, so every judge writer stores the prompt sha beside its verdict from now on. Two stores keep
-- verdicts in columns rather than in raw_payload: the restamp audit (judge_model already, prompt sha new) and the
-- durable syndication verdicts (neither model nor prompt sha until now; written for local_llm verdicts only).
-- Nullable, no default, no backfill: verdicts made before R58 never recorded their prompt, and R58 says a verdict
-- without one is re-asked, not reconstructed. Reversible: drop the three columns.
alter table public.signal_voice_restamps add column judge_prompt_sha text;
alter table public.syndication_verdicts add column model text;
alter table public.syndication_verdicts add column prompt_sha text;
