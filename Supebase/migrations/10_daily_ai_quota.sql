create table if not exists public.daily_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (user_id, usage_date)
);

alter table public.daily_ai_usage enable row level security;
revoke all on public.daily_ai_usage from public, anon, authenticated;
grant all on public.daily_ai_usage to service_role;

create or replace function public.consume_daily_ai_calls(
  p_user_id uuid,
  p_usage_date date,
  p_daily_limit integer
)
returns table(allowed boolean, used integer, daily_limit integer, remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_count integer;
begin
  if p_user_id is null or p_usage_date is null or p_daily_limit not between 1 and 10000 then
    raise exception 'Invalid daily AI quota parameters' using errcode = '22023';
  end if;

  insert into public.daily_ai_usage as current_usage(user_id, usage_date, request_count)
  values (p_user_id, p_usage_date, 1)
  on conflict (user_id, usage_date) do update
  set request_count = current_usage.request_count + 1
  where current_usage.request_count < p_daily_limit
  returning request_count into v_request_count;

  if v_request_count is not null then
    return query
    select true, v_request_count, p_daily_limit, p_daily_limit - v_request_count;
    return;
  end if;

  select request_count
  into v_request_count
  from public.daily_ai_usage
  where user_id = p_user_id
    and usage_date = p_usage_date;

  return query
  select false, coalesce(v_request_count, 0), p_daily_limit, 0;
end;
$$;

revoke all on function public.consume_daily_ai_calls(uuid, date, integer)
  from public, anon, authenticated;
grant execute on function public.consume_daily_ai_calls(uuid, date, integer)
  to service_role;

notify pgrst, 'reload schema';
