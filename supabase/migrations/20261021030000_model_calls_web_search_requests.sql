-- model_calls.web_search_requests (operator ruling 2026-10-21, E3 brief ruling 1): every Claude web_search call is ledgered
-- with its search count (usage.server_tool_use.web_search_requests — the billed searches; errored searches are not billed).
-- NULL on every row that is not a web_search call, and on every row written before this column existed: an honest gap,
-- never a 0. usd on a web_search row = token cost + search cost (_shared/modelPricing.ts, the Anthropic table).
alter table public.model_calls add column if not exists web_search_requests int null;

comment on column public.model_calls.web_search_requests is
  'Claude web_search calls only: the billed search count (usage.server_tool_use.web_search_requests). NULL for every other call and for rows before 2026-10-21.';
