-- =====================================================================
-- SuperLanguage 5.0 - Schema tài khoản, hồ sơ, chuỗi ngày học
-- Chạy toàn bộ file trong: Supabase Dashboard -> SQL Editor
-- =====================================================================
-- Nếu trước đó đã chạy file auth_schema.sql cũ, bỏ comment 4 dòng dưới
-- (CẢNH BÁO: xóa dữ liệu bảng profiles cũ):
--
-- drop table if exists public.profiles cascade;
-- drop type  if exists public.user_role  cascade;
-- drop type  if exists public.cefr_level cascade;
-- drop function if exists public.handle_new_user() cascade;
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enum
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('learner', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_status as enum ('active', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.cefr_level as enum ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. Bảng tham chiếu: languages
--    Muốn mở thêm ngôn ngữ chỉ cần sửa dòng tương ứng, không đổi code.
-- ---------------------------------------------------------------------
create table if not exists public.languages (
  code                 text primary key check (code ~ '^[a-z]{2,3}$'),
  name                 text not null,
  native_name          text not null,
  is_learnable         boolean not null default false,  -- được chọn làm ngôn ngữ muốn học
  is_native_supported  boolean not null default false,  -- được chọn làm ngôn ngữ mẹ đẻ
  sort_order           smallint not null default 100
);

insert into public.languages (code, name, native_name, is_learnable, is_native_supported, sort_order) values
  ('vi', 'Vietnamese', 'Tiếng Việt', false, true,  1),
  ('en', 'English',    'English',    true,  false, 2),
  ('ja', 'Japanese',   '日本語',      false, false, 3),
  ('ko', 'Korean',     '한국어',      false, false, 4),
  ('zh', 'Chinese',    '中文',        false, false, 5)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------
-- 3. Bảng tham chiếu: plans (giá trị mẫu, sửa theo chính sách của bạn)
-- ---------------------------------------------------------------------
create table if not exists public.plans (
  id                  text primary key,
  name                text not null,
  daily_lesson_limit  integer check (daily_lesson_limit is null or daily_lesson_limit > 0), -- null = không giới hạn
  max_hearts          integer check (max_hearts is null or max_hearts > 0),                 -- null = không giới hạn
  video_access        boolean not null default false,
  is_active           boolean not null default true,
  sort_order          smallint not null default 100
);

insert into public.plans (id, name, daily_lesson_limit, max_hearts, video_access, sort_order) values
  ('free',    'Miễn phí', 5,    5,    false, 1),
  ('premium', 'Premium',  null, null, true,  2)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 4. Bảng profiles (1-1 với auth.users)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  email                    text,
  username                 text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name             text check (char_length(display_name) between 1 and 50),
  avatar_url               text check (char_length(avatar_url) <= 500),

  birth_year               smallint check (birth_year between 1900 and 2100),
  country_code             char(2) check (country_code ~ '^[A-Z]{2}$'),
  timezone                 text not null default 'Asia/Ho_Chi_Minh',

  native_language          text not null default 'vi' references public.languages (code),
  target_language          text not null default 'en' references public.languages (code),

  current_level            public.cefr_level,
  target_level             public.cefr_level,
  learning_goal            text check (learning_goal in ('travel','work','study','exam','hobby','other')),
  daily_goal_xp            smallint not null default 20 check (daily_goal_xp between 10 and 500),

  reminder_time            time,
  marketing_opt_in         boolean not null default false,
  show_on_leaderboard      boolean not null default true,

  terms_accepted_at        timestamptz,
  onboarding_completed_at  timestamptz,

  role                     public.user_role   not null default 'learner',
  status                   public.user_status not null default 'active',
  plan_id                  text not null default 'free' references public.plans (id),
  plan_expires_at          timestamptz,

  last_sign_in_at          timestamptz,
  deleted_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint profiles_languages_differ check (native_language <> target_language)
);

create unique index if not exists profiles_email_lower_key
  on public.profiles (lower(email)) where email is not null;

-- ---------------------------------------------------------------------
-- 5. Bảng user_stats: số liệu học tập + chuỗi ngày (chỉ backend ghi)
-- ---------------------------------------------------------------------
create table if not exists public.user_stats (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  xp_total              bigint  not null default 0 check (xp_total >= 0),
  words_learned         integer not null default 0 check (words_learned >= 0),
  lessons_completed     integer not null default 0 check (lessons_completed >= 0),

  current_streak        integer not null default 0 check (current_streak >= 0),
  streak_start_date     date,
  longest_streak        integer not null default 0 check (longest_streak >= 0),
  longest_streak_start  date,
  longest_streak_end    date,
  last_activity_date    date,
  streak_freezes        smallint not null default 0 check (streak_freezes >= 0), -- chừa sẵn, chưa dùng

  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Bảng daily_activity: mỗi người một dòng mỗi ngày học (vẽ lịch, BXH tuần)
-- ---------------------------------------------------------------------
create table if not exists public.daily_activity (
  user_id            uuid not null references public.profiles (id) on delete cascade,
  activity_date      date not null,
  xp_earned          integer  not null default 0 check (xp_earned >= 0),
  lessons_completed  integer  not null default 0 check (lessons_completed >= 0),
  goal_met           boolean  not null default false,
  primary key (user_id, activity_date)
);

-- ---------------------------------------------------------------------
-- 7. Bảng streak_history: các chuỗi đã kết thúc
-- ---------------------------------------------------------------------
create table if not exists public.streak_history (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  length      integer not null check (length >= 1),
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists streak_history_user_length_idx
  on public.streak_history (user_id, length desc);

-- ---------------------------------------------------------------------
-- 8. Trigger: tự cập nhật updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_user_stats_updated_at on public.user_stats;
create trigger trg_user_stats_updated_at
  before update on public.user_stats
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 9. Sinh username duy nhất từ email
-- ---------------------------------------------------------------------
create or replace function public.generate_username(p_email text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  base      text;
  candidate text;
begin
  base := left(
    regexp_replace(lower(split_part(coalesce(p_email, ''), '@', 1)), '[^a-z0-9_]', '', 'g'),
    20
  );
  if length(base) < 3 then
    base := 'user';
  end if;

  loop
    candidate := base || '_' || substr(md5(random()::text || clock_timestamp()::text), 1, 5);
    exit when not exists (select 1 from public.profiles where username = candidate);
  end loop;

  return candidate;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Trigger: tạo profiles + user_stats khi có user mới ở auth.users
--     Nếu hàm này lỗi, đăng ký sẽ báo "Database error saving new user".
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, username, display_name, avatar_url)
  values (
    new.id,
    new.email,
    public.generate_username(new.email),
    left(
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'Learner'
      ),
      50
    ),
    left(new.raw_user_meta_data ->> 'avatar_url', 500)
  )
  on conflict (id) do nothing;

  insert into public.user_stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 11. Trigger: đồng bộ email khi user đổi email
-- ---------------------------------------------------------------------
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------
-- 12. Hàm ghi nhận hoàn thành bài học + tính chuỗi ngày
--     Backend gọi qua RPC (service_role). Toàn bộ chạy trong 1 transaction,
--     khóa dòng user_stats nên 2 request đồng thời không làm sai chuỗi.
--     Quy tắc: một ngày được tính khi hoàn thành >= 1 bài, theo timezone của user.
-- ---------------------------------------------------------------------
create or replace function public.record_lesson_activity(
  p_user_id uuid,
  p_xp      integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz         text;
  v_goal       smallint;
  v_today      date;
  s            public.user_stats%rowtype;
  v_streak     integer;
  v_start      date;
  v_longest    integer;
  v_l_start    date;
  v_l_end      date;
  v_increased  boolean := false;
  v_day_xp     integer;
begin
  if p_xp < 0 then
    raise exception 'p_xp must be >= 0';
  end if;

  select timezone, daily_goal_xp into v_tz, v_goal
  from public.profiles where id = p_user_id;
  if not found then
    raise exception 'profile % not found', p_user_id;
  end if;

  v_today := (now() at time zone v_tz)::date;

  insert into public.user_stats (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select * into s from public.user_stats where user_id = p_user_id for update;

  insert into public.daily_activity as d (user_id, activity_date, xp_earned, lessons_completed, goal_met)
  values (p_user_id, v_today, p_xp, 1, p_xp >= v_goal)
  on conflict (user_id, activity_date) do update
    set xp_earned         = d.xp_earned + excluded.xp_earned,
        lessons_completed = d.lessons_completed + 1,
        goal_met          = (d.xp_earned + excluded.xp_earned) >= v_goal
  returning d.xp_earned into v_day_xp;

  v_streak  := s.current_streak;
  v_start   := s.streak_start_date;
  v_longest := s.longest_streak;
  v_l_start := s.longest_streak_start;
  v_l_end   := s.longest_streak_end;

  if s.last_activity_date is null or s.last_activity_date < v_today - 1 then
    -- Chuỗi cũ (nếu có) đã đứt: lưu vào lịch sử rồi bắt đầu chuỗi mới
    if s.current_streak > 0 and s.streak_start_date is not null and s.last_activity_date is not null then
      insert into public.streak_history (user_id, start_date, end_date, length)
      values (p_user_id, s.streak_start_date, s.last_activity_date, s.current_streak);
    end if;
    v_streak    := 1;
    v_start     := v_today;
    v_increased := true;
  elsif s.last_activity_date = v_today - 1 then
    -- Học liên tiếp hôm qua -> tăng chuỗi
    v_streak    := s.current_streak + 1;
    v_increased := true;
  end if;
  -- Đã học hôm nay: giữ nguyên chuỗi

  if v_streak > v_longest then
    v_longest := v_streak;
    v_l_start := v_start;
    v_l_end   := v_today;
  end if;

  update public.user_stats set
    xp_total              = xp_total + p_xp,
    lessons_completed     = lessons_completed + 1,
    current_streak        = v_streak,
    streak_start_date     = v_start,
    longest_streak        = v_longest,
    longest_streak_start  = v_l_start,
    longest_streak_end    = v_l_end,
    last_activity_date    = v_today
  where user_id = p_user_id;

  return jsonb_build_object(
    'current_streak',   v_streak,
    'longest_streak',   v_longest,
    'streak_increased', v_increased,
    'xp_today',         v_day_xp,
    'goal_met_today',   v_day_xp >= v_goal
  );
end;
$$;

revoke execute on function public.record_lesson_activity(uuid, integer) from public, anon, authenticated;
grant  execute on function public.record_lesson_activity(uuid, integer) to service_role;

-- ---------------------------------------------------------------------
-- 13. Bảng xếp hạng (view): chỉ lộ username, tên, avatar, XP
-- ---------------------------------------------------------------------
create or replace view public.leaderboard_all_time as
select
  p.id as user_id, p.username, p.display_name, p.avatar_url,
  s.xp_total,
  dense_rank() over (order by s.xp_total desc) as rank
from public.user_stats s
join public.profiles p on p.id = s.user_id
where p.show_on_leaderboard and p.status = 'active' and p.deleted_at is null;

create or replace view public.leaderboard_weekly as
select
  p.id as user_id, p.username, p.display_name, p.avatar_url,
  sum(d.xp_earned)::bigint as xp_week,
  dense_rank() over (order by sum(d.xp_earned) desc) as rank
from public.daily_activity d
join public.profiles p on p.id = d.user_id
where d.activity_date >= date_trunc('week', now())::date
  and p.show_on_leaderboard and p.status = 'active' and p.deleted_at is null
group by p.id, p.username, p.display_name, p.avatar_url;

-- ---------------------------------------------------------------------
-- 14. Row Level Security + phân quyền
-- ---------------------------------------------------------------------
alter table public.languages       enable row level security;
alter table public.plans           enable row level security;
alter table public.profiles        enable row level security;
alter table public.user_stats      enable row level security;
alter table public.daily_activity  enable row level security;
alter table public.streak_history  enable row level security;

-- Bảng tham chiếu: ai cũng đọc được (cần cho màn hình đăng ký)
drop policy if exists "languages_read_all" on public.languages;
create policy "languages_read_all" on public.languages for select to anon, authenticated using (true);

drop policy if exists "plans_read_all" on public.plans;
create policy "plans_read_all" on public.plans for select to anon, authenticated using (is_active);

-- Dữ liệu cá nhân: chỉ đọc dòng của mình
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "user_stats_select_own" on public.user_stats;
create policy "user_stats_select_own" on public.user_stats for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "daily_activity_select_own" on public.daily_activity;
create policy "daily_activity_select_own" on public.daily_activity for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "streak_history_select_own" on public.streak_history;
create policy "streak_history_select_own" on public.streak_history for select to authenticated
  using (user_id = (select auth.uid()));

-- Cấp quyền theo bảng/cột (service_role của backend vẫn toàn quyền)
revoke all on public.languages, public.plans from anon, authenticated;
grant select on public.languages, public.plans to anon, authenticated;

revoke all on public.profiles, public.user_stats, public.daily_activity, public.streak_history
  from anon, authenticated;
grant select on public.profiles, public.user_stats, public.daily_activity, public.streak_history
  to authenticated;

-- User chỉ được tự sửa các cột này. role/status/plan_*/terms/onboarding/username... do backend ghi.
grant update (
  display_name, avatar_url, birth_year, country_code, timezone,
  native_language, target_language, current_level, target_level,
  learning_goal, daily_goal_xp, reminder_time,
  marketing_opt_in, show_on_leaderboard
) on public.profiles to authenticated;

revoke all on public.leaderboard_all_time, public.leaderboard_weekly from anon, authenticated;
grant select on public.leaderboard_all_time, public.leaderboard_weekly to authenticated;

-- ---------------------------------------------------------------------
-- 15. Backfill cho user đã tồn tại trước khi có trigger
-- ---------------------------------------------------------------------
insert into public.profiles (id, email, username, display_name)
select
  u.id, u.email, public.generate_username(u.email),
  left(coalesce(nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'Learner'), 50)
from auth.users u
on conflict (id) do nothing;

insert into public.user_stats (user_id)
select id from public.profiles
on conflict (user_id) do nothing;
