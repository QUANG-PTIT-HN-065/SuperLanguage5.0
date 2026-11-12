-- =====================================================================
-- SuperLanguage 5.0 - SCHEMA HOÀN CHỈNH (Tài khoản, Streak, Từ vựng, RLS)
-- Đã tối ưu hóa chống lỗi xung đột dữ liệu & Policy trùng lặp.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enum Types (Đã xử lý an toàn nếu đã tồn tại)
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
-- 2. Bảng tham chiếu: languages & plans
-- ---------------------------------------------------------------------
create table if not exists public.languages (
  code                text primary key check (code ~ '^[a-z]{2,3}$'),
  name                text not null,
  native_name         text not null,
  is_learnable        boolean not null default false,
  is_native_supported boolean not null default false,
  sort_order          smallint not null default 100
);

-- Upsert dữ liệu ngôn ngữ (Cập nhật is_learnable = true cho đa ngôn ngữ)
insert into public.languages (code, name, native_name, is_learnable, is_native_supported, sort_order) values
  ('vi', 'Vietnamese', 'Tiếng Việt', false, true,  1),
  ('en', 'English',    'English',    true,  false, 2),
  ('ja', 'Japanese',   '日本語',      true,  false, 3),
  ('ko', 'Korean',     '한국어',      true,  false, 4),
  ('zh', 'Chinese',    '中文',        true,  false, 5)
on conflict (code) do update set
  is_learnable = excluded.is_learnable,
  is_native_supported = excluded.is_native_supported;

create table if not exists public.plans (
  id                  text primary key,
  name                text not null,
  daily_lesson_limit  integer check (daily_lesson_limit is null or daily_lesson_limit > 0),
  max_hearts          integer check (max_hearts is null or max_hearts > 0),
  video_access        boolean not null default false,
  is_active           boolean not null default true,
  sort_order          smallint not null default 100
);

insert into public.plans (id, name, daily_lesson_limit, max_hearts, video_access, sort_order) values
  ('free',    'Miễn phí', 5,    5,    false, 1),
  ('premium', 'Premium',  null, null, true,  2)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Bảng Hồ sơ & Số liệu người dùng (profiles, user_stats, daily_activity)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text,
  username             text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name         text check (char_length(display_name) between 1 and 50),
  avatar_url           text check (char_length(avatar_url) <= 500),
  birth_year           smallint check (birth_year between 1900 and 2100),
  country_code         char(2) check (country_code ~ '^[A-Z]{2}$'),
  timezone             text not null default 'Asia/Ho_Chi_Minh',
  native_language      text not null default 'vi' references public.languages (code),
  target_language      text not null default 'en' references public.languages (code),
  current_level        public.cefr_level,
  target_level         public.cefr_level,
  learning_goal        text check (learning_goal in ('travel','work','study','exam','hobby','other')),
  daily_goal_xp        smallint not null default 20 check (daily_goal_xp between 10 and 500),
  daily_goal_minutes   smallint not null default 15 check (daily_goal_minutes between 5 and 240),
  daily_goal_lessons   smallint not null default 1 check (daily_goal_lessons between 1 and 20),
  reminder_time        time,
  marketing_opt_in     boolean not null default false,
  show_on_leaderboard  boolean not null default true,
  terms_accepted_at    timestamptz,
  onboarding_completed_at timestamptz,
  role                 public.user_role   not null default 'learner',
  status               public.user_status not null default 'active',
  plan_id              text not null default 'free' references public.plans (id),
  plan_expires_at      timestamptz,
  last_sign_in_at      timestamptz,
  deleted_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint profiles_languages_differ check (native_language <> target_language)
);

create unique index if not exists profiles_email_lower_key
  on public.profiles (lower(email)) where email is not null;

create table if not exists public.user_stats (
  user_id              uuid primary key references public.profiles (id) on delete cascade,
  xp_total             bigint  not null default 0 check (xp_total >= 0),
  words_learned        integer not null default 0 check (words_learned >= 0),
  lessons_completed    integer not null default 0 check (lessons_completed >= 0),
  current_streak       integer not null default 0 check (current_streak >= 0),
  streak_start_date    date,
  longest_streak       integer not null default 0 check (longest_streak >= 0),
  longest_streak_start date,
  longest_streak_end   date,
  last_activity_date   date,
  streak_freezes       smallint not null default 0 check (streak_freezes >= 0),
  updated_at           timestamptz not null default now()
);

create table if not exists public.daily_activity (
  user_id           uuid not null references public.profiles (id) on delete cascade,
  activity_date     date not null,
  xp_earned         integer  not null default 0 check (xp_earned >= 0),
  lessons_completed integer  not null default 0 check (lessons_completed >= 0),
  goal_met          boolean  not null default false,
  primary key (user_id, activity_date)
);

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
-- 4. KHO TỪ VỰNG & TIẾN TRÌNH HỌC (Vocabulary System)
-- ---------------------------------------------------------------------

-- Bảng kho từ vựng chung
create table if not exists public.words (
  id               bigint generated always as identity primary key,
  language_code    text not null references public.languages (code) on delete cascade,
  word             text not null,
  phonetic         text,
  meaning          text not null,
  part_of_speech   text check (part_of_speech in ('noun', 'verb', 'adjective', 'adverb', 'phrase', 'other')),
  audio_url        text,
  example_sentence text,
  example_meaning  text,
  level            public.cefr_level default 'A1',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists words_lang_word_idx on public.words (language_code, word);

-- Bảng chủ đề bài học
create table if not exists public.topics (
  id            bigint generated always as identity primary key,
  language_code text not null references public.languages (code) on delete cascade,
  name          text not null,
  description   text,
  icon_url      text,
  sort_order    smallint default 100
);

-- Bảng nối từ vựng với chủ đề
create table if not exists public.word_topics (
  word_id  bigint not null references public.words (id) on delete cascade,
  topic_id bigint not null references public.topics (id) on delete cascade,
  primary key (word_id, topic_id)
);

-- Bảng tiến trình học từ của từng User
create table if not exists public.user_words (
  user_id          uuid not null references public.profiles (id) on delete cascade,
  word_id          bigint not null references public.words (id) on delete cascade,
  mastery_level    smallint not null default 0 check (mastery_level between 0 and 5),
  review_count     integer not null default 0 check (review_count >= 0),
  last_reviewed_at timestamptz,
  next_review_at   timestamptz default now(),
  created_at       timestamptz not null default now(),
  primary key (user_id, word_id)
);

create index if not exists user_words_next_review_idx on public.user_words (user_id, next_review_at);

-- ---------------------------------------------------------------------
-- 5. Stored Functions & Triggers (Cập nhật safe replace)
-- ---------------------------------------------------------------------

-- Trigger tự cập nhật updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists trg_user_stats_updated_at on public.user_stats;
create trigger trg_user_stats_updated_at before update on public.user_stats
for each row execute function public.set_updated_at();

drop trigger if exists trg_words_updated_at on public.words;
create trigger trg_words_updated_at before update on public.words
for each row execute function public.set_updated_at();

-- Hàm sinh username duy nhất từ Email
create or replace function public.generate_username(p_email text)
returns text language plpgsql set search_path = '' as $$
declare
  base      text;
  candidate text;
begin
  base := left(regexp_replace(lower(split_part(coalesce(p_email, ''), '@', 1)), '[^a-z0-9_]', '', 'g'), 20);
  if length(base) < 3 then base := 'user'; end if;
  loop
    candidate := base || '_' || substr(md5(random()::text || clock_timestamp()::text), 1, 5);
    exit when not exists (select 1 from public.profiles where username = candidate);
  end loop;
  return candidate;
end;
$$;

-- Trigger tự động khởi tạo User khi đăng ký Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, username, display_name, avatar_url)
  values (
    new.id, new.email, public.generate_username(new.email),
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Learner'), 50),
    left(new.raw_user_meta_data ->> 'avatar_url', 500)
  ) on conflict (id) do nothing;

  insert into public.user_stats (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Trigger đồng bộ Email
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function public.handle_user_email_change();

-- Trigger tự động tăng words_learned khi đạt mốc thuộc từ (mastery_level = 5)
create or replace function public.update_user_words_learned_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (TG_OP = 'INSERT' and new.mastery_level = 5) or 
     (TG_OP = 'UPDATE' and new.mastery_level = 5 and old.mastery_level < 5) then
    update public.user_stats 
    set words_learned = words_learned + 1 
    where user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_update_words_learned on public.user_words;
create trigger trg_update_words_learned after insert or update on public.user_words
for each row execute function public.update_user_words_learned_count();

-- Function ghi nhận học bài & Chuỗi ngày học (Streak)
create or replace function public.record_lesson_activity(p_user_id uuid, p_xp integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_tz text; v_goal smallint; v_today date; s public.user_stats%rowtype;
  v_streak integer; v_start date; v_longest integer; v_l_start date; v_l_end date;
  v_increased boolean := false; v_day_xp integer;
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
    if s.current_streak > 0 and s.streak_start_date is not null and s.last_activity_date is not null then
      insert into public.streak_history (user_id, start_date, end_date, length)
      values (p_user_id, s.streak_start_date, s.last_activity_date, s.current_streak);
    end if;
    v_streak := 1; v_start := v_today; v_increased := true;
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
    last_activity_date = v_today
  where user_id = p_user_id;

  return jsonb_build_object(
    'current_streak', v_streak, 'longest_streak', v_longest,
    'streak_increased', v_increased, 'xp_today', v_day_xp, 'goal_met_today', v_day_xp >= v_goal
  );
end;
$$;

revoke execute on function public.record_lesson_activity(uuid, integer) from public, anon, authenticated;
grant execute on function public.record_lesson_activity(uuid, integer) to service_role;

-- ---------------------------------------------------------------------
-- 6. Views Bảng xếp hạng (Leaderboard)
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
-- 7. Row Level Security + Drop policies trùng lặp & Re-grant
-- ---------------------------------------------------------------------
alter table public.languages       enable row level security;
alter table public.plans           enable row level security;
alter table public.profiles        enable row level security;
alter table public.user_stats      enable row level security;
alter table public.daily_activity  enable row level security;
alter table public.streak_history  enable row level security;
alter table public.words            enable row level security;
alter table public.topics           enable row level security;
alter table public.word_topics      enable row level security;
alter table public.user_words       enable row level security;

create or replace function public.is_active_profile()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and p.deleted_at is null
  );
$$;

create or replace function public.is_active_premium()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.status = 'active'
      and p.deleted_at is null
      and p.plan_id = 'premium'
      and (p.plan_expires_at is null or p.plan_expires_at > now())
      and exists (
        select 1
        from public.plans pl
        where pl.id = p.plan_id
          and pl.is_active
      )
  );
$$;

create or replace function public.can_read_topic(p_topic_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_profile()
    and (
      public.is_active_premium()
      or exists (
        select 1
        from (
          select t.id,
                 row_number() over (partition by t.language_code order by t.id) as position,
                 count(*) over (partition by t.language_code) as total
          from public.topics t
        ) ranked
        where ranked.id = p_topic_id
          and ranked.position <= (ranked.total + 1) / 2
      )
    );
$$;

create or replace function public.can_read_word(p_word_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_profile()
    and (
      public.is_active_premium()
      or exists (
        select 1
        from (
          select w.id,
                 row_number() over (partition by w.language_code order by w.id) as position,
                 count(*) over (partition by w.language_code) as total
          from public.words w
        ) ranked
        where ranked.id = p_word_id
          and ranked.position <= (ranked.total + 1) / 2
      )
    );
$$;

create or replace function public.admin_create_word(p_word jsonb, p_topic_ids bigint[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_word public.words%rowtype;
  v_topic_count bigint;
begin
  if p_topic_ids is null or cardinality(p_topic_ids) = 0 then
    raise exception 'At least one topic is required' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.words w
    where w.language_code = p_word ->> 'language_code'
      and lower(w.word) = lower(p_word ->> 'word')
  ) then
    raise exception 'Word already exists' using errcode = '23505';
  end if;

  select count(*)
  into v_topic_count
  from public.topics t
  where t.id = any(p_topic_ids)
    and t.language_code = p_word ->> 'language_code';

  if v_topic_count <> cardinality(p_topic_ids) then
    raise exception 'Topic does not exist for the selected language' using errcode = '23503';
  end if;

  insert into public.words (
    language_code, word, phonetic, meaning, part_of_speech, audio_url,
    example_sentence, example_meaning, level
  )
  values (
    p_word ->> 'language_code',
    p_word ->> 'word',
    p_word ->> 'phonetic',
    p_word ->> 'meaning',
    p_word ->> 'part_of_speech',
    p_word ->> 'audio_url',+0+
    p_word ->> 'example_sentence',
    p_word ->> 'example_meaning',
    coalesce(p_word ->> 'level', 'A1')::public.cefr_level
  )
  returning * into v_word;

  insert into public.word_topics (word_id, topic_id)
  select v_word.id, topic_id
  from unnest(p_topic_ids) as topic_ids(topic_id);

  return to_jsonb(v_word);
end;
$$;

create or replace function public.admin_update_word(
  p_word_id bigint,
  p_word jsonb,
  p_topic_ids bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_word public.words%rowtype;
  v_topic_count bigint;
begin
  if p_topic_ids is null or cardinality(p_topic_ids) = 0 then
    raise exception 'At least one topic is required' using errcode = '23514';
  end if;

  select * into v_word
  from public.words
  where id = p_word_id
  for update;
  if not found then
    return null;
  end if;

  if exists (
    select 1
    from public.words w
    where w.id <> p_word_id
      and w.language_code = p_word ->> 'language_code'
      and lower(w.word) = lower(p_word ->> 'word')
  ) then
    raise exception 'Word already exists' using errcode = '23505';
  end if;

  select count(*) into v_topic_count
  from public.topics t
  where t.id = any(p_topic_ids)
    and t.language_code = p_word ->> 'language_code';
  if v_topic_count <> cardinality(p_topic_ids) then
    raise exception 'Topic does not exist for the selected language' using errcode = '23503';
  end if;

  update public.words set
    language_code = p_word ->> 'language_code',
    word = p_word ->> 'word',
    phonetic = p_word ->> 'phonetic',
    meaning = p_word ->> 'meaning',
    part_of_speech = p_word ->> 'part_of_speech',
    audio_url = p_word ->> 'audio_url',
    example_sentence = p_word ->> 'example_sentence',
    example_meaning = p_word ->> 'example_meaning',
    level = coalesce(p_word ->> 'level', 'A1')::public.cefr_level,
    updated_at = now()
  where id = p_word_id
  returning * into v_word;

  delete from public.word_topics where word_id = p_word_id;
  insert into public.word_topics (word_id, topic_id)
  select p_word_id, topic_id
  from unnest(p_topic_ids) as topic_ids(topic_id);

  return to_jsonb(v_word);
end;
$$;

create or replace function public.admin_delete_word(p_word_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_id bigint;
begin
  delete from public.words
  where id = p_word_id
  returning id into v_deleted_id;
  return v_deleted_id;
end;
$$;

create table if not exists public.login_rate_limits (
  bucket_key        text primary key,
  attempts          integer not null check (attempts >= 0),
  window_started_at timestamptz not null
);

create index if not exists login_rate_limits_window_started_idx
  on public.login_rate_limits (window_started_at);

alter table public.login_rate_limits enable row level security;
revoke all on public.login_rate_limits from public, anon, authenticated;
grant all on public.login_rate_limits to service_role;

create or replace function public.consume_login_attempts(
  p_email_ip_key text,
  p_ip_key text
)
returns table(allowed boolean, retry_after integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_email_attempts integer;
  v_email_started_at timestamptz;
  v_ip_attempts integer;
  v_ip_started_at timestamptz;
  v_email_retry integer;
  v_ip_retry integer;
begin
  if p_email_ip_key !~ '^[0-9a-f]{64}$' or p_ip_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid rate-limit bucket key' using errcode = '22023';
  end if;

  delete from public.login_rate_limits
  where window_started_at < v_now - interval '1 day';

  insert into public.login_rate_limits as current_bucket (
    bucket_key, attempts, window_started_at
  )
  values (p_email_ip_key, 1, v_now)
  on conflict (bucket_key) do update set
    attempts = case
      when current_bucket.window_started_at <= v_now - interval '15 minutes' then 1
      else least(current_bucket.attempts + 1, 6)
    end,
    window_started_at = case
      when current_bucket.window_started_at <= v_now - interval '15 minutes' then v_now
      else current_bucket.window_started_at
    end
  returning attempts, window_started_at
  into v_email_attempts, v_email_started_at;

  insert into public.login_rate_limits as current_bucket (
    bucket_key, attempts, window_started_at
  )
  values (p_ip_key, 1, v_now)
  on conflict (bucket_key) do update set
    attempts = case
      when current_bucket.window_started_at <= v_now - interval '15 minutes' then 1
      else least(current_bucket.attempts + 1, 21)
    end,
    window_started_at = case
      when current_bucket.window_started_at <= v_now - interval '15 minutes' then v_now
      else current_bucket.window_started_at
    end
  returning attempts, window_started_at
  into v_ip_attempts, v_ip_started_at;

  v_email_retry := greatest(
    0,
    ceil(extract(epoch from (v_email_started_at + interval '15 minutes' - v_now)))::integer
  );
  v_ip_retry := greatest(
    0,
    ceil(extract(epoch from (v_ip_started_at + interval '15 minutes' - v_now)))::integer
  );

  return query
  select v_email_attempts <= 5 and v_ip_attempts <= 20,
         greatest(v_email_retry, v_ip_retry);
end;
$$;

revoke all on function public.is_active_profile() from public, anon;
revoke all on function public.is_active_premium() from public, anon;
revoke all on function public.can_read_topic(bigint) from public, anon;
revoke all on function public.can_read_word(bigint) from public, anon;
revoke all on function public.admin_create_word(jsonb, bigint[]) from public, anon, authenticated;
revoke all on function public.admin_update_word(bigint, jsonb, bigint[]) from public, anon, authenticated;
revoke all on function public.admin_delete_word(bigint) from public, anon, authenticated;
revoke all on function public.consume_login_attempts(text, text) from public, anon, authenticated;
grant execute on function public.is_active_profile() to authenticated;
grant execute on function public.is_active_premium() to authenticated;
grant execute on function public.can_read_topic(bigint) to authenticated;
grant execute on function public.can_read_word(bigint) to authenticated;
grant execute on function public.admin_create_word(jsonb, bigint[]) to service_role;
grant execute on function public.admin_update_word(bigint, jsonb, bigint[]) to service_role;
grant execute on function public.admin_delete_word(bigint) to service_role;
grant execute on function public.consume_login_attempts(text, text) to service_role;

-- Xóa Policy cũ để tránh lỗi đã tồn tại
drop policy if exists "languages_read_all" on public.languages;
create policy "languages_read_all" on public.languages for select to anon, authenticated using (true);

drop policy if exists "plans_read_all" on public.plans;
create policy "plans_read_all" on public.plans for select to anon, authenticated using (is_active);

drop policy if exists "words_read_all" on public.words;
drop policy if exists "words_read_by_plan" on public.words;
create policy "words_read_by_plan" on public.words
  for select to authenticated using ((select public.can_read_word(id)));

drop policy if exists "topics_read_all" on public.topics;
drop policy if exists "topics_read_by_plan" on public.topics;
create policy "topics_read_by_plan" on public.topics
  for select to authenticated using ((select public.can_read_topic(id)));

drop policy if exists "word_topics_read_all" on public.word_topics;
drop policy if exists "word_topics_read_by_plan" on public.word_topics;
create policy "word_topics_read_by_plan" on public.word_topics
  for select to authenticated
  using (
    (select public.can_read_topic(topic_id))
    and (select public.can_read_word(word_id))
  );

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "user_stats_select_own" on public.user_stats;
create policy "user_stats_select_own" on public.user_stats for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "daily_activity_select_own" on public.daily_activity;
create policy "daily_activity_select_own" on public.daily_activity for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "streak_history_select_own" on public.streak_history;
create policy "streak_history_select_own" on public.streak_history for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "user_words_all_own" on public.user_words;
create policy "user_words_all_own" on public.user_words for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Cấp quyền (Grants)
revoke all on public.languages, public.plans from anon, authenticated;
grant select on public.languages, public.plans to anon, authenticated;

revoke all on public.words, public.topics, public.word_topics from anon, authenticated;
grant select on public.words, public.topics, public.word_topics to authenticated;

revoke all on public.profiles, public.user_stats, public.daily_activity, public.streak_history from anon, authenticated;
grant select on public.profiles, public.user_stats, public.daily_activity, public.streak_history to authenticated;

grant update (
  display_name, avatar_url, birth_year, country_code, timezone,
  native_language, target_language, current_level, target_level,
  learning_goal, daily_goal_xp, reminder_time,
  marketing_opt_in, show_on_leaderboard
) on public.profiles to authenticated;

grant select, insert, update, delete on public.user_words to authenticated;

revoke all on public.leaderboard_all_time, public.leaderboard_weekly from anon, authenticated;
grant select on public.leaderboard_all_time, public.leaderboard_weekly to authenticated;

-- ---------------------------------------------------------------------
-- 8. Backfill dữ liệu cho User cũ
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


-- ---------------------------------------------------------------------
-- 1. Bảng Conversations (Phòng chat / Chủ đề hội thoại)
-- ---------------------------------------------------------------------
create table if not exists public.conversations (
  id            uuid default gen_random_uuid() primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  title         text not null,                                           -- Ví dụ: "Order đồ ăn tại nhà hàng", "Phỏng vấn xin việc"
  language_code text not null references public.languages(code) on delete cascade, -- Ngôn ngữ đang luyện tập (en, ja, ko, zh...)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Index hỗ trợ lấy danh sách cuộc hội thoại của User nhanh hơn
create index if not exists conversations_user_idx on public.conversations (user_id, updated_at desc);

-- ---------------------------------------------------------------------
-- 2. Bảng Messages (Chi tiết tin nhắn & Phản hồi từ AI)
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id              uuid default gen_random_uuid() primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_type     text not null check (sender_type in ('user', 'ai')),      -- Kẻ gửi: 'user' hoặc 'ai'
  content         text not null,                                           -- Nội dung văn bản / Transcript giọng nói
  audio_url       text,                                                    -- Link file ghi âm (dùng cho Speech-to-Text / Text-to-Speech)
  ai_feedback     text,                                                    -- Phân tích sửa lỗi ngữ pháp, phát âm, từ vựng từ AI
  created_at      timestamptz not null default now()
);

-- Index lấy lịch sử tin nhắn theo cuộc hội thoại
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at asc);

-- ---------------------------------------------------------------------
-- 3. Trigger tự động cập nhật updated_at cho conversation khi có tin nhắn mới
-- ---------------------------------------------------------------------
create or replace function public.update_conversation_timestamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_update_conversation_timestamp on public.messages;
create trigger trg_update_conversation_timestamp
  after insert on public.messages
  for each row execute function public.update_conversation_timestamp();

-- ---------------------------------------------------------------------
-- 4. Bật bảo mật Row Level Security (RLS) & Phân quyền
-- ---------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

-- Policy cho Conversations: User chỉ xem/sửa/xóa cuộc hội thoại của chính mình
drop policy if exists "conversations_own" on public.conversations;
create policy "conversations_own" on public.conversations
  for all to authenticated 
  using (user_id = (select auth.uid())) 
  with check (user_id = (select auth.uid()));

-- Policy cho Messages: User chỉ xem/thêm tin nhắn thuộc cuộc hội thoại của mình
drop policy if exists "messages_own" on public.messages;
create policy "messages_own" on public.messages
  for all to authenticated 
  using (
    exists (
      select 1 from public.conversations c 
      where c.id = messages.conversation_id 
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.conversations c 
      where c.id = messages.conversation_id 
        and c.user_id = (select auth.uid())
    )
  );

-- Cấp quyền truy cập cho người dùng đã đăng nhập (authenticated)
grant select, insert, update, delete on public.conversations, public.messages to authenticated;