do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.languages') is null
    or to_regclass('public.topics') is null
    or to_regclass('public.words') is null
    or to_regclass('public.user_words') is null
    or to_regclass('public.user_stats') is null
    or to_regprocedure('public.record_lesson_activity(uuid,integer)') is null
  then
    raise exception
      'Learning migration prerequisites are missing. Run Supebase/migrations/01_schema.sql first, then rerun 06_learning_lessons.sql.';
  end if;
end;
$$;

create table if not exists public.lessons (
  id bigint generated always as identity primary key,
  topic_id bigint not null references public.topics(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 150),
  description text,
  sort_order smallint not null default 100,
  xp_reward integer not null default 20 check (xp_reward between 0 and 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists lessons_topic_order_idx
  on public.lessons(topic_id, sort_order, id) where is_active;

create table if not exists public.lesson_questions (
  id bigint generated always as identity primary key,
  lesson_id bigint not null references public.lessons(id) on delete cascade,
  prompt text not null check (char_length(btrim(prompt)) between 1 and 1000),
  options jsonb not null check (
    jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 6
  ),
  correct_option_id text not null,
  explanation text,
  sort_order smallint not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists lesson_questions_order_idx
  on public.lesson_questions(lesson_id, sort_order, id);

create table if not exists public.lesson_attempt_answers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id bigint not null references public.lesson_questions(id) on delete cascade,
  selected_option_id text not null,
  is_correct boolean not null,
  checked_at timestamptz not null default now(),
  primary key(user_id, question_id)
);

create table if not exists public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id bigint not null references public.lessons(id) on delete cascade,
  score integer not null check (score >= 0),
  question_count integer not null check (question_count > 0),
  xp_awarded integer not null check (xp_awarded >= 0),
  completed_at timestamptz not null default now(),
  primary key(user_id, lesson_id)
);

create table if not exists public.user_word_review_events (
  user_id uuid not null references public.profiles(id) on delete cascade,
  review_id uuid not null,
  word_id bigint not null references public.words(id) on delete cascade,
  rating text not null check (rating in ('Khó', 'Tốt', 'Dễ')),
  mastery_level smallint not null check (mastery_level between 0 and 5),
  review_count integer not null check (review_count > 0),
  last_reviewed_at timestamptz not null,
  next_review_at timestamptz not null,
  primary key(user_id, review_id)
);

alter table public.lessons enable row level security;
alter table public.lesson_questions enable row level security;
alter table public.lesson_attempt_answers enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.user_word_review_events enable row level security;

revoke all on public.lessons, public.lesson_questions, public.lesson_attempt_answers, public.lesson_progress,
  public.user_word_review_events
  from public, anon, authenticated;
grant all on public.lessons, public.lesson_questions, public.lesson_attempt_answers, public.lesson_progress,
  public.user_word_review_events
  to service_role;

create or replace function public.submit_lesson_answer(
  p_user_id uuid,
  p_question_id bigint,
  p_selected_option_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question public.lesson_questions%rowtype;
  v_saved public.lesson_attempt_answers%rowtype;
  v_inserted integer;
begin
  select q.* into v_question
  from public.lesson_questions q
  join public.lessons l on l.id = q.lesson_id and l.is_active
  join public.topics t on t.id = l.topic_id
  join public.profiles p on p.id = p_user_id and p.target_language = t.language_code
  where q.id = p_question_id;

  if not found then
    raise exception 'Question not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.lessons earlier
    where earlier.topic_id = (select topic_id from public.lessons where id = v_question.lesson_id)
      and earlier.is_active
      and (earlier.sort_order, earlier.id) < (
        select sort_order, id from public.lessons where id = v_question.lesson_id
      )
      and not exists (
        select 1 from public.lesson_progress completed
        where completed.user_id = p_user_id and completed.lesson_id = earlier.id
      )
  ) then
    raise exception 'Lesson is locked' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.lesson_questions earlier
    where earlier.lesson_id = v_question.lesson_id
      and (earlier.sort_order, earlier.id) < (v_question.sort_order, v_question.id)
      and not exists (
        select 1 from public.lesson_attempt_answers answered
        where answered.user_id = p_user_id and answered.question_id = earlier.id
      )
  ) then
    raise exception 'Answer the previous question first' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_question.options) option
    where option ->> 'id' = p_selected_option_id
  ) then
    raise exception 'Selected option is invalid' using errcode = '23514';
  end if;

  insert into public.lesson_attempt_answers(
    user_id, question_id, selected_option_id, is_correct
  )
  values (
    p_user_id,
    p_question_id,
    p_selected_option_id,
    p_selected_option_id = v_question.correct_option_id
  )
  on conflict (user_id, question_id) do nothing
  returning * into v_saved;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select * into v_saved
    from public.lesson_attempt_answers
    where user_id = p_user_id and question_id = p_question_id;
  end if;

  return jsonb_build_object(
    'question_id', p_question_id,
    'selected_option_id', v_saved.selected_option_id,
    'is_correct', v_saved.is_correct,
    'correct_option_id', v_question.correct_option_id,
    'explanation', v_question.explanation,
    'already_checked', v_inserted = 0
  );
end;
$$;

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
  v_xp integer;
  v_inserted integer;
  v_already_completed boolean := false;
  v_activity jsonb;
  v_xp_total bigint;
  v_streak integer;
begin
  select l.* into v_lesson
  from public.lessons l
  join public.topics t on t.id = l.topic_id
  join public.profiles p on p.id = p_user_id and p.target_language = t.language_code
  where l.id = p_lesson_id and l.is_active;

  if not found then
    raise exception 'Lesson not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.lessons earlier
    where earlier.topic_id = v_lesson.topic_id
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
    'xp_awarded', v_xp,
    'xp_total', v_xp_total,
    'level', floor(v_xp_total / 100)::integer + 1,
    'xp_into_level', mod(v_xp_total, 100)::integer,
    'current_streak', v_streak,
    'already_completed', v_already_completed
  );
end;
$$;

create or replace function public.review_vocabulary_word(
  p_user_id uuid,
  p_word_id bigint,
  p_review_id uuid,
  p_rating text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_language text;
  v_mastery integer := 0;
  v_next_mastery integer;
  v_review_count integer := 0;
  v_days integer;
  v_interval interval;
  v_now timestamptz := now();
  v_existing public.user_word_review_events%rowtype;
begin
  if p_rating not in ('Khó', 'Tốt', 'Dễ') then
    raise exception 'Invalid review rating' using errcode = '23514';
  end if;

  select target_language into v_language
  from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.words where id = p_word_id and language_code = v_language
  ) then
    raise exception 'Word not found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_word_id::text, 0)
  );
  select * into v_existing
  from public.user_word_review_events
  where user_id = p_user_id and review_id = p_review_id;
  if found then
    return jsonb_build_object(
      'word_id', v_existing.word_id,
      'review_id', v_existing.review_id,
      'rating', v_existing.rating,
      'mastery_level', v_existing.mastery_level,
      'review_count', v_existing.review_count,
      'last_reviewed_at', v_existing.last_reviewed_at,
      'next_review_at', v_existing.next_review_at,
      'already_applied', true
    );
  end if;

  select mastery_level, review_count
  into v_mastery, v_review_count
  from public.user_words
  where user_id = p_user_id and word_id = p_word_id
  for update;

  if not found then
    v_mastery := 0;
    v_review_count := 0;
  end if;

  if p_rating = 'Khó' then
    v_next_mastery := greatest(0, v_mastery - 1);
    v_interval := case
      when v_next_mastery = 0 then interval '10 minutes'
      when v_next_mastery = 1 then interval '1 day'
      when v_next_mastery = 2 then interval '2 days'
      when v_next_mastery = 3 then interval '4 days'
      else interval '7 days'
    end;
  elsif p_rating = 'Tốt' then
    v_next_mastery := least(5, v_mastery + 1);
    v_interval := case v_next_mastery
      when 1 then interval '1 day'
      when 2 then interval '3 days'
      when 3 then interval '7 days'
      when 4 then interval '14 days'
      else interval '30 days'
    end;
  else
    v_next_mastery := least(5, v_mastery + 2);
    v_interval := case
      when v_next_mastery <= 1 then interval '4 days'
      when v_next_mastery = 2 then interval '7 days'
      when v_next_mastery = 3 then interval '14 days'
      when v_next_mastery = 4 then interval '30 days'
      else interval '60 days'
    end;
  end if;

  insert into public.user_words(
    user_id, word_id, mastery_level, review_count, last_reviewed_at, next_review_at
  )
  values (
    p_user_id, p_word_id, v_next_mastery, v_review_count + 1, v_now, v_now + v_interval
  )
  on conflict (user_id, word_id) do update set
    mastery_level = excluded.mastery_level,
    review_count = excluded.review_count,
    last_reviewed_at = excluded.last_reviewed_at,
    next_review_at = excluded.next_review_at;

  insert into public.user_word_review_events(
    user_id, review_id, word_id, rating, mastery_level, review_count,
    last_reviewed_at, next_review_at
  )
  values (
    p_user_id, p_review_id, p_word_id, p_rating, v_next_mastery,
    v_review_count + 1, v_now, v_now + v_interval
  );

  return jsonb_build_object(
    'word_id', p_word_id,
    'review_id', p_review_id,
    'rating', p_rating,
    'mastery_level', v_next_mastery,
    'review_count', v_review_count + 1,
    'last_reviewed_at', v_now,
    'next_review_at', v_now + v_interval,
    'already_applied', false
  );
end;
$$;

revoke all on function public.submit_lesson_answer(uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.submit_lesson_answer(uuid, bigint, text) to service_role;

revoke all on function public.complete_lesson(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.complete_lesson(uuid, bigint) to service_role;

revoke all on function public.review_vocabulary_word(uuid, bigint, uuid, text)
  from public, anon, authenticated;
grant execute on function public.review_vocabulary_word(uuid, bigint, uuid, text) to service_role;

notify pgrst, 'reload schema';
