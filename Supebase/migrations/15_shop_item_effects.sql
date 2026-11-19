-- 15_shop_item_effects.sql
-- Nối hiệu ứng vật phẩm cửa hàng vào luồng học:
--   * heal_hearts   : dùng để hồi +5 máu khi hết máu trong bài học.
--   * boost_xp_10   : +10% XP, tự kích hoạt khi vào bài học (thắng/thua đều tính đã dùng).
--   * double_xp     : x2 XP, ưu tiên cao hơn boost_xp_10 (không cộng dồn).
--   * streak_freeze : tự tiêu để giữ chuỗi khi bỏ lỡ ngày học.
-- Yêu cầu: 01_schema.sql, 06_learning_lessons.sql, 07_ordered_topic_quizzes.sql,
--          12_shop_and_leaderboard.sql đã chạy trước.

do $$
begin
  if to_regclass('public.shop_catalog') is null
    or to_regclass('public.shop_inventory') is null
    or to_regclass('public.user_stats') is null
    or to_regprocedure('public.complete_lesson(uuid,bigint)') is null
    or to_regprocedure('public.record_lesson_activity(uuid,integer)') is null
  then
    raise exception
      'Shop item effects prerequisites are missing. Run 01, 06, 07 and 12 first.';
  end if;
end;
$$;

create table if not exists public.shop_item_usages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  shop_item_id text not null references public.shop_catalog(id),
  request_id uuid,
  context text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index if not exists shop_item_usages_user_created_idx
  on public.shop_item_usages(user_id, created_at desc);

create table if not exists public.shop_active_boosts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  shop_item_id text not null references public.shop_catalog(id),
  multiplier numeric(4,2) not null check (multiplier > 1),
  activated_at timestamptz not null default now()
);

alter table public.shop_item_usages enable row level security;
alter table public.shop_active_boosts enable row level security;
revoke all on public.shop_item_usages, public.shop_active_boosts
  from public, anon, authenticated;
grant all on public.shop_item_usages, public.shop_active_boosts to service_role;

-- Hệ số nhân XP của từng vật phẩm boost (không cộng dồn: mỗi user 1 boost chờ).
create or replace function public.shop_boost_multiplier(p_item_id text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_item_id
    when 'double_xp' then 2.0::numeric
    when 'boost_xp_10' then 1.1::numeric
    else null::numeric
  end;
$$;

-- Vào bài học: tự lấy boost mạnh nhất trong kho, trừ kho ngay lập tức.
-- Thắng hay thua vật phẩm cũng đã được tính là sử dụng.
create or replace function public.activate_shop_boost(
  p_user_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active public.shop_active_boosts%rowtype;
  v_item_id text;
  v_title text;
  v_multiplier numeric;
begin
  perform 1 from public.profiles
  where id = p_user_id and status = 'active' and deleted_at is null;
  if not found then
    raise exception 'Active profile not found' using errcode = 'P0002';
  end if;

  perform 1 from public.user_stats where user_id = p_user_id for update;

  select * into v_active from public.shop_active_boosts where user_id = p_user_id;
  if found then
    select title into v_title from public.shop_catalog where id = v_active.shop_item_id;
    return jsonb_build_object(
      'item_id', v_active.shop_item_id,
      'title', v_title,
      'multiplier', v_active.multiplier,
      'already_active', true
    );
  end if;

  select inventory.shop_item_id, item.title, public.shop_boost_multiplier(inventory.shop_item_id)
  into v_item_id, v_title, v_multiplier
  from public.shop_inventory inventory
  join public.shop_catalog item on item.id = inventory.shop_item_id
  where inventory.user_id = p_user_id
    and inventory.quantity > 0
    and item.category = 'boost'
    and item.is_active
    and public.shop_boost_multiplier(inventory.shop_item_id) is not null
  order by public.shop_boost_multiplier(inventory.shop_item_id) desc
  limit 1
  for update of inventory;

  if not found then
    return null;
  end if;

  update public.shop_inventory
  set quantity = quantity - 1, updated_at = now()
  where user_id = p_user_id and shop_item_id = v_item_id;

  insert into public.shop_item_usages (user_id, shop_item_id, request_id, context)
  values (p_user_id, v_item_id, p_request_id, 'lesson_entry');

  insert into public.shop_active_boosts (user_id, shop_item_id, multiplier)
  values (p_user_id, v_item_id, v_multiplier);

  return jsonb_build_object(
    'item_id', v_item_id,
    'title', v_title,
    'multiplier', v_multiplier,
    'already_active', false
  );
end;
$$;

-- Dùng vật phẩm thường (hồi máu...): trừ kho, ghi nhận lượt dùng.
create or replace function public.use_shop_item(
  p_user_id uuid,
  p_item_id text,
  p_request_id uuid,
  p_context text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_quantity integer;
  v_existing public.shop_item_usages%rowtype;
begin
  perform 1 from public.profiles
  where id = p_user_id and status = 'active' and deleted_at is null;
  if not found then
    raise exception 'Active profile not found' using errcode = 'P0002';
  end if;

  perform 1 from public.user_stats where user_id = p_user_id for update;

  select * into v_existing
  from public.shop_item_usages
  where user_id = p_user_id and request_id = p_request_id;
  if found then
    select title into v_title from public.shop_catalog where id = v_existing.shop_item_id;
    return jsonb_build_object(
      'item_id', v_existing.shop_item_id,
      'title', v_title,
      'quantity_left', coalesce((
        select quantity from public.shop_inventory
        where user_id = p_user_id and shop_item_id = v_existing.shop_item_id
      ), 0),
      'already_used', true
    );
  end if;

  select title into v_title from public.shop_catalog where id = p_item_id and is_active;
  if not found then
    raise exception 'Shop item not found' using errcode = 'P0002';
  end if;

  select quantity into v_quantity
  from public.shop_inventory
  where user_id = p_user_id and shop_item_id = p_item_id
  for update;
  if not found or v_quantity < 1 then
    raise exception 'Item not in inventory' using errcode = '23514';
  end if;

  update public.shop_inventory
  set quantity = quantity - 1, updated_at = now()
  where user_id = p_user_id and shop_item_id = p_item_id;

  insert into public.shop_item_usages (user_id, shop_item_id, request_id, context)
  values (p_user_id, p_item_id, p_request_id, p_context);

  return jsonb_build_object(
    'item_id', p_item_id,
    'title', v_title,
    'quantity_left', v_quantity - 1,
    'already_used', false
  );
end;
$$;

-- Lấy boost đang chờ và xóa khỏi hàng chờ (áp dụng đúng 1 lần).
create or replace function public.consume_shop_boost(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active public.shop_active_boosts%rowtype;
  v_title text;
begin
  delete from public.shop_active_boosts
  where user_id = p_user_id
  returning * into v_active;
  if not found then
    return null;
  end if;

  select title into v_title from public.shop_catalog where id = v_active.shop_item_id;
  return jsonb_build_object(
    'item_id', v_active.shop_item_id,
    'title', v_title,
    'multiplier', v_active.multiplier
  );
end;
$$;

-- complete_lesson: áp boost đang chờ vào XP lần hoàn thành đầu tiên.
-- Bản nền: 07_ordered_topic_quizzes.sql (giữ nguyên luật topic quiz).
create or replace function public.complete_lesson(
  p_user_id uuid,
  p_lesson_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson public.lessons%rowtype;
  v_question_count integer;
  v_score integer;
  v_xp integer := 0;
  v_inserted integer;
  v_already_completed boolean := false;
  v_activity jsonb;
  v_xp_total bigint;
  v_streak integer;
  v_boost jsonb;
begin
  select l.* into v_lesson
  from public.lessons l
  join public.topics t on t.id = l.topic_id
  join public.profiles p on p.id = p_user_id and p.target_language = t.language_code
  where l.id = p_lesson_id and l.is_active;

  if not found then
    raise exception 'Lesson not found' using errcode = 'P0002';
  end if;

  if v_lesson.is_topic_quiz
    and not public.is_path_topic_unlocked(
      p_user_id, v_lesson.learning_path_id, v_lesson.topic_id
    )
  then
    raise exception 'Topic is locked' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.lessons earlier
    where earlier.topic_id = v_lesson.topic_id
      and earlier.learning_path_id is not distinct from v_lesson.learning_path_id
      and earlier.is_active
      and (earlier.sort_order, earlier.id) < (v_lesson.sort_order, v_lesson.id)
      and not exists (
        select 1 from public.lesson_progress completed
        where completed.user_id = p_user_id and completed.lesson_id = earlier.id
      )
  ) then
    raise exception 'Lesson is locked' using errcode = '42501';
  end if;

  select count(*), count(*) filter (where answer.is_correct)
  into v_question_count, v_score
  from public.lesson_questions question
  left join public.lesson_attempt_answers answer
    on answer.question_id = question.id and answer.user_id = p_user_id
  where question.lesson_id = p_lesson_id;

  if v_question_count = 0 then
    raise exception 'Lesson has no questions' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.lesson_questions question
    where question.lesson_id = p_lesson_id
      and not exists (
        select 1 from public.lesson_attempt_answers answer
        where answer.user_id = p_user_id and answer.question_id = question.id
      )
  ) then
    raise exception 'Lesson is not fully answered' using errcode = '23514';
  end if;

  if v_lesson.is_topic_quiz and v_score <> v_question_count then
    delete from public.lesson_attempt_answers
    where user_id = p_user_id
      and question_id in (
        select id from public.lesson_questions where lesson_id = p_lesson_id
      );
    -- Thua vẫn tính là đã dùng boost: tiêu hàng chờ, không nhân XP.
    v_boost := public.consume_shop_boost(p_user_id);
    select xp_total, current_streak
    into v_xp_total, v_streak
    from public.user_stats
    where user_id = p_user_id;

    return jsonb_build_object(
      'lesson_id', p_lesson_id,
      'score', v_score,
      'question_count', v_question_count,
      'passed', false,
      'xp_awarded', 0,
      'xp_total', v_xp_total,
      'level', floor(v_xp_total / 100)::integer + 1,
      'xp_into_level', mod(v_xp_total, 100)::integer,
      'current_streak', v_streak,
      'already_completed', false,
      'boost', v_boost
    );
  end if;

  v_xp := floor(v_lesson.xp_reward::numeric * v_score / v_question_count)::integer;

  insert into public.lesson_progress(
    user_id, lesson_id, score, question_count, xp_awarded
  )
  values (p_user_id, p_lesson_id, v_score, v_question_count, v_xp)
  on conflict (user_id, lesson_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    v_already_completed := true;
    select score, question_count, xp_awarded
    into v_score, v_question_count, v_xp
    from public.lesson_progress
    where user_id = p_user_id and lesson_id = p_lesson_id;
  else
    v_boost := public.consume_shop_boost(p_user_id);
    if v_boost is not null then
      v_xp := floor(v_xp * (v_boost ->> 'multiplier')::numeric)::integer;
      update public.lesson_progress
      set xp_awarded = v_xp
      where user_id = p_user_id and lesson_id = p_lesson_id;
    end if;
    v_activity := public.record_lesson_activity(p_user_id, v_xp);
  end if;

  select xp_total, current_streak
  into v_xp_total, v_streak
  from public.user_stats
  where user_id = p_user_id;

  return jsonb_build_object(
    'lesson_id', p_lesson_id,
    'score', v_score,
    'question_count', v_question_count,
    'passed', true,
    'xp_awarded', v_xp,
    'xp_total', v_xp_total,
    'level', floor(v_xp_total / 100)::integer + 1,
    'xp_into_level', mod(v_xp_total, 100)::integer,
    'current_streak', v_streak,
    'already_completed', v_already_completed,
    'boost', v_boost
  );
end;
$$;

-- record_lesson_activity: tự tiêu Đóng Băng Chuỗi cho mỗi ngày bỏ lỡ.
-- Đủ freeze cho toàn bộ ngày lỡ → chuỗi tiếp tục; thiếu → reset như cũ.
-- Bản nền: 01_schema.sql.
create or replace function public.record_lesson_activity(p_user_id uuid, p_xp integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_tz text; v_goal smallint; v_today date; s public.user_stats%rowtype;
  v_streak integer; v_start date; v_longest integer; v_l_start date; v_l_end date;
  v_increased boolean := false; v_day_xp integer;
  v_missed integer; v_freezes integer; v_freezes_used integer := 0;
begin
  if p_xp < 0 then raise exception 'p_xp must be >= 0'; end if;

  select timezone, daily_goal_xp into v_tz, v_goal from public.profiles where id = p_user_id;
  if not found then raise exception 'profile % not found', p_user_id; end if;

  v_today := (now() at time zone v_tz)::date;

  insert into public.user_stats (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into s from public.user_stats where user_id = p_user_id for update;

  insert into public.daily_activity as d (user_id, activity_date, xp_earned, lessons_completed, goal_met)
  values (p_user_id, v_today, p_xp, 1, p_xp >= v_goal)
  on conflict (user_id, activity_date) do update set
    xp_earned = d.xp_earned + excluded.xp_earned,
    lessons_completed = d.lessons_completed + 1,
    goal_met = (d.xp_earned + excluded.xp_earned) >= v_goal
  returning d.xp_earned into v_day_xp;

  v_streak := s.current_streak; v_start := s.streak_start_date;
  v_longest := s.longest_streak; v_l_start := s.longest_streak_start; v_l_end := s.longest_streak_end;

  if s.last_activity_date is null or s.last_activity_date < v_today - 1 then
    v_missed := case
      when s.last_activity_date is null then 0
      else (v_today - s.last_activity_date) - 1
    end;
    select quantity into v_freezes
    from public.shop_inventory
    where user_id = p_user_id and shop_item_id = 'streak_freeze'
    for update;
    v_freezes := coalesce(v_freezes, 0);

    if s.current_streak > 0 and v_missed > 0 and v_freezes >= v_missed then
      update public.shop_inventory
      set quantity = quantity - v_missed, updated_at = now()
      where user_id = p_user_id and shop_item_id = 'streak_freeze';

      insert into public.shop_item_usages (user_id, shop_item_id, context)
      select p_user_id, 'streak_freeze', 'streak_protection'
      from generate_series(1, v_missed);

      v_freezes_used := v_missed;
      v_streak := s.current_streak + 1;
      v_increased := true;
    else
      if s.current_streak > 0 and s.streak_start_date is not null and s.last_activity_date is not null then
        insert into public.streak_history (user_id, start_date, end_date, length)
        values (p_user_id, s.streak_start_date, s.last_activity_date, s.current_streak);
      end if;
      v_streak := 1; v_start := v_today; v_increased := true;
    end if;
  elsif s.last_activity_date = v_today - 1 then
    v_streak := s.current_streak + 1; v_increased := true;
  end if;

  if v_streak > v_longest then
    v_longest := v_streak; v_l_start := v_start; v_l_end := v_today;
  end if;

  update public.user_stats set
    xp_total = xp_total + p_xp,
    lessons_completed = lessons_completed + 1,
    current_streak = v_streak,
    streak_start_date = v_start,
    longest_streak = v_longest,
    longest_streak_start = v_l_start,
    longest_streak_end = v_l_end,
    last_activity_date = v_today,
    streak_freezes = s.streak_freezes + v_freezes_used
  where user_id = p_user_id;

  return jsonb_build_object(
    'current_streak', v_streak, 'longest_streak', v_longest,
    'streak_increased', v_increased, 'xp_today', v_day_xp, 'goal_met_today', v_day_xp >= v_goal,
    'freezes_used', v_freezes_used
  );
end;
$$;

revoke all on function public.shop_boost_multiplier(text) from public, anon, authenticated;
revoke all on function public.activate_shop_boost(uuid, uuid) from public, anon, authenticated;
revoke all on function public.use_shop_item(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.consume_shop_boost(uuid) from public, anon, authenticated;
revoke all on function public.complete_lesson(uuid, bigint) from public, anon, authenticated;
revoke all on function public.record_lesson_activity(uuid, integer) from public, anon, authenticated;
grant execute on function public.shop_boost_multiplier(text) to service_role;
grant execute on function public.activate_shop_boost(uuid, uuid) to service_role;
grant execute on function public.use_shop_item(uuid, text, uuid, text) to service_role;
grant execute on function public.consume_shop_boost(uuid) to service_role;
grant execute on function public.complete_lesson(uuid, bigint) to service_role;
grant execute on function public.record_lesson_activity(uuid, integer) to service_role;

notify pgrst, 'reload schema';