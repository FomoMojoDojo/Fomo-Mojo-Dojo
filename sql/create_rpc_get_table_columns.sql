-- Creates RPC helper used by scripts/check-companies-columns.mjs
-- Safe to run multiple times.

create or replace function public.get_table_columns(
  p_table text,
  p_schema text default 'public'
)
returns table(column_name text)
language sql
security definer
set search_path = public
as $$
  select c.column_name::text
  from information_schema.columns c
  where c.table_schema = p_schema
    and c.table_name = p_table
  order by c.ordinal_position
$$;

grant execute on function public.get_table_columns(text, text) to anon, authenticated;

