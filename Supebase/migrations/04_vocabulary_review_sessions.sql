create table if not exists public.vocabulary_review_sessions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  reviewed_count integer not null check (reviewed_count between 1 and 100),
  known_count integer not null check (known_count between 0 and reviewed_count),
  xp_awarded integer not null check (xp_awarded >= 0),
  completed_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

alter table public.vocabulary_review_sessions enable row level security;
revoke all on public.vocabulary_review_sessions from public, anon, authenticated;
grant all on public.vocabulary_review_sessions to service_role;

create or replace function public.complete_vocabulary_review_session(
  p_user_id uuid,
  p_session_id uuid,
  p_reviewed_count integer,
  p_known_count integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.vocabulary_review_sessions%rowtype;
  v_activity jsonb := '{}'::jsonb;
  v_inserted integer;
  v_duplicate boolean := false;
  v_xp_total bigint;
  v_current_streak integer;
  v_longest_streak integer;
begin
  if p_reviewed_count < 1 or p_reviewed_count > 100 then
    raise exception 'p_reviewed_count must be between 1 and 100';
  end if;
  if p_known_count < 0 or p_known_count > p_reviewed_count then
    raise exception 'p_known_count must be between 0 and p_reviewed_count';
  end if;

  insert into public.vocabulary_review_sessions (
    user_id,
    session_id,
    reviewed_count,
    known_count,
    xp_awarded
  )
  values (
    p_user_id,
    p_session_id,
    p_reviewed_count,
    p_known_count,
    p_known_count * 15
  )
  on conflict (user_id, session_id) do nothing
  returning * into v_session;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select * into v_session
    from public.vocabulary_review_sessions
    where user_id = p_user_id and session_id = p_session_id;
    v_duplicate := true;
  else
    v_activity := public.record_lesson_activity(p_user_id, v_session.xp_awarded);
  end if;

  select xp_total, current_streak, longest_streak
  into v_xp_total, v_current_streak, v_longest_streak
  from public.user_stats
  where user_id = p_user_id;

  return jsonb_build_object(
    'session_id', v_session.session_id,
    'reviewed_count', v_session.reviewed_count,
    'known_count', v_session.known_count,
    'xp_awarded', v_session.xp_awarded,
    'xp_total', v_xp_total,
    'current_streak', v_current_streak,
    'longest_streak', v_longest_streak,
    'already_completed', v_duplicate,
    'xp_today', case
      when v_activity ? 'xp_today' then (v_activity ->> 'xp_today')::integer
      else null
    end,
    'goal_met_today', case
      when v_activity ? 'goal_met_today' then (v_activity ->> 'goal_met_today')::boolean
      else null
    end
  );
end;
$$;

revoke all on function public.complete_vocabulary_review_session(uuid, uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.complete_vocabulary_review_session(uuid, uuid, integer, integer)
  to service_role;
