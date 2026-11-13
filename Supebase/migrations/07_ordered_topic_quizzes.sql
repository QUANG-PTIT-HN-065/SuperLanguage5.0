do $$
begin
  if to_regclass('public.lessons') is null
    or to_regclass('public.lesson_questions') is null
    or to_regclass('public.lesson_attempt_answers') is null
    or to_regclass('public.lesson_progress') is null
    or to_regclass('public.topics') is null
    or to_regclass('public.words') is null
    or to_regclass('public.word_topics') is null
  then
    raise exception
      'Ordered topic quiz prerequisites are missing. Run 01_schema.sql and 06_learning_lessons.sql first.';
  end if;
end;
$$;

create table if not exists public.learning_paths (
  id bigint generated always as identity primary key,
  language_code text not null references public.languages(code) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 150),
  description text,
  sort_order smallint not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists learning_paths_language_order_idx
  on public.learning_paths(language_code, sort_order, id);

create table if not exists public.learning_path_topics (
  learning_path_id bigint not null references public.learning_paths(id) on delete cascade,
  topic_id bigint not null references public.topics(id) on delete cascade,
  sort_order smallint not null,
  primary key (learning_path_id, topic_id)
);

create index if not exists learning_path_topics_order_idx
  on public.learning_path_topics(learning_path_id, sort_order, topic_id);

alter table public.learning_paths enable row level security;
alter table public.learning_path_topics enable row level security;
revoke all on public.learning_paths, public.learning_path_topics from public, anon, authenticated;
grant all on public.learning_paths, public.learning_path_topics to service_role;

create or replace function public.admin_save_learning_path(
  p_path_id bigint,
  p_language_code text,
  p_name text,
  p_description text,
  p_sort_order integer,
  p_topic_ids bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path_id bigint;
  v_topic_count integer;
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 150 then
    raise exception 'Path name is required' using errcode = '23514';
  end if;
  if p_sort_order not between 1 and 32767 then
    raise exception 'Invalid path sort order' using errcode = '23514';
  end if;
  if p_topic_ids is null or cardinality(p_topic_ids) not between 1 and 100 then
    raise exception 'Select between 1 and 100 topics' using errcode = '23514';
  end if;

  select count(distinct selected.topic_id)
  into v_topic_count
  from unnest(p_topic_ids) as selected(topic_id);
  if v_topic_count <> cardinality(p_topic_ids) then
    raise exception 'A topic may only appear once in a path' using errcode = '23514';
  end if;

  select count(*)
  into v_topic_count
  from public.topics topic
  where topic.id = any(p_topic_ids)
    and topic.language_code = p_language_code;
  if v_topic_count <> cardinality(p_topic_ids) then
    raise exception 'All path topics must use the path language' using errcode = '23514';
  end if;

  if p_path_id is null then
    insert into public.learning_paths(language_code, name, description, sort_order)
    values (p_language_code, btrim(p_name), nullif(btrim(p_description), ''), p_sort_order)
    returning id into v_path_id;
  else
    update public.learning_paths
    set language_code = p_language_code,
        name = btrim(p_name),
        description = nullif(btrim(p_description), ''),
        sort_order = p_sort_order
    where id = p_path_id
    returning id into v_path_id;
    if not found then
      raise exception 'Learning path not found' using errcode = 'P0002';
    end if;
  end if;

  delete from public.learning_path_topics
  where learning_path_id = v_path_id;

  insert into public.learning_path_topics(learning_path_id, topic_id, sort_order)
  select v_path_id, selected.topic_id, selected.position::smallint
  from unnest(p_topic_ids) with ordinality as selected(topic_id, position);

  return jsonb_build_object(
    'id', v_path_id,
    'language_code', p_language_code,
    'name', btrim(p_name),
    'description', nullif(btrim(p_description), ''),
    'sort_order', p_sort_order
  );
end;
$$;

revoke all on function public.admin_save_learning_path(bigint, text, text, text, integer, bigint[])
  from public, anon, authenticated;
grant execute on function public.admin_save_learning_path(bigint, text, text, text, integer, bigint[])
  to service_role;

alter table public.lessons
  add column if not exists learning_path_id bigint
    references public.learning_paths(id) on delete cascade;
alter table public.lessons
  add column if not exists is_topic_quiz boolean not null default false;
alter table public.lesson_questions
  add column if not exists question_type text not null default 'multiple_choice';

alter table public.lesson_questions
  drop constraint if exists lesson_questions_options_check;
alter table public.lesson_questions
  add constraint lesson_questions_options_check check (
    case question_type
      when 'multiple_choice' then
        jsonb_typeof(options) = 'array'
        and jsonb_array_length(options) between 2 and 6
      when 'fill_in' then
        options = '[]'::jsonb
      else false
    end
  );

create unique index if not exists lessons_one_topic_quiz_per_path_idx
  on public.lessons(learning_path_id, topic_id)
  where is_topic_quiz and is_active;

create or replace function public.is_path_topic_unlocked(
  p_user_id uuid,
  p_path_id bigint,
  p_topic_id bigint
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.learning_path_topics current_topic
    where current_topic.learning_path_id = p_path_id
      and current_topic.topic_id = p_topic_id
      and not exists (
        select 1
        from public.learning_path_topics earlier_topic
        where earlier_topic.learning_path_id = p_path_id
          and (earlier_topic.sort_order, earlier_topic.topic_id)
            < (current_topic.sort_order, current_topic.topic_id)
          and not exists (
            select 1
            from public.lessons quiz
            join public.lesson_progress progress
              on progress.lesson_id = quiz.id
             and progress.user_id = p_user_id
             and progress.score = progress.question_count
            where quiz.learning_path_id = p_path_id
              and quiz.topic_id = earlier_topic.topic_id
              and quiz.is_topic_quiz
              and quiz.is_active
          )
      )
  );
$$;

revoke all on function public.is_path_topic_unlocked(uuid, bigint, bigint)
  from public, anon, authenticated;
grant execute on function public.is_path_topic_unlocked(uuid, bigint, bigint)
  to service_role;

create or replace function public.admin_create_topic_quiz(
  p_path_id bigint,
  p_topic_id bigint,
  p_questions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lesson_id bigint;
begin
  if p_questions is null or jsonb_typeof(p_questions) is distinct from 'array' then
    raise exception 'Quiz questions must be an array' using errcode = '23514';
  end if;
  if jsonb_array_length(p_questions) <> 4 then
    raise exception 'A topic quiz must contain exactly four questions' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.learning_path_topics link
    join public.learning_paths path on path.id = link.learning_path_id
    join public.topics topic
      on topic.id = link.topic_id and topic.language_code = path.language_code
    where link.learning_path_id = p_path_id
      and link.topic_id = p_topic_id
  ) then
    raise exception 'Topic does not belong to this learning path' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_path_id::text || ':' || p_topic_id::text, 0)
  );

  select id into v_lesson_id
  from public.lessons
  where learning_path_id = p_path_id
    and topic_id = p_topic_id
    and is_topic_quiz
    and is_active
  limit 1;

  if found then
    return jsonb_build_object('lesson_id', v_lesson_id, 'already_created', true);
  end if;

  insert into public.lessons(
    learning_path_id, topic_id, title, description, sort_order, xp_reward, is_topic_quiz
  )
  values (
    p_path_id, p_topic_id, 'Kiểm tra từ vựng', '4 câu hỏi · cần đạt 4/4 để mở chủ đề tiếp theo',
    1, 20, true
  )
  returning id into v_lesson_id;

  insert into public.lesson_questions(
    lesson_id, prompt, question_type, options, correct_option_id, explanation, sort_order
  )
  select
    v_lesson_id,
    question.prompt,
    question.question_type,
    question.options,
    question.correct_option_id,
    question.explanation,
    question.sort_order
  from jsonb_to_recordset(p_questions) as question(
    prompt text,
    question_type text,
    options jsonb,
    correct_option_id text,
    explanation text,
    sort_order smallint
  );

  return jsonb_build_object('lesson_id', v_lesson_id, 'already_created', false);
end;
$$;

revoke all on function public.admin_create_topic_quiz(bigint, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_create_topic_quiz(bigint, bigint, jsonb)
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
  v_lesson public.lessons%rowtype;
  v_saved public.lesson_attempt_answers%rowtype;
  v_inserted integer;
  v_is_correct boolean;
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

  select * into v_lesson
  from public.lessons
  where id = v_question.lesson_id;

  if v_lesson.is_topic_quiz
    and not public.is_path_topic_unlocked(
      p_user_id, v_lesson.learning_path_id, v_lesson.topic_id
    )
  then
    raise exception 'Topic is locked' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.lessons earlier
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

  if exists (
    select 1 from public.lesson_questions earlier
    where earlier.lesson_id = v_lesson.id
      and (earlier.sort_order, earlier.id) < (v_question.sort_order, v_question.id)
      and not exists (
        select 1 from public.lesson_attempt_answers answered
        where answered.user_id = p_user_id and answered.question_id = earlier.id
      )
  ) then
    raise exception 'Answer the previous question first' using errcode = '23514';
  end if;

  if p_selected_option_id is null or btrim(p_selected_option_id) = '' then
    raise exception 'Answer is required' using errcode = '23514';
  end if;
  if v_question.question_type = 'multiple_choice' then
    if not exists (
      select 1 from jsonb_array_elements(v_question.options) option
      where option ->> 'id' = p_selected_option_id
    ) then
      raise exception 'Selected option is invalid' using errcode = '23514';
    end if;
    v_is_correct := p_selected_option_id = v_question.correct_option_id;
  elsif v_question.question_type = 'fill_in' then
    v_is_correct := lower(btrim(p_selected_option_id))
      = lower(btrim(v_question.correct_option_id));
  else
    raise exception 'Question type is invalid' using errcode = '23514';
  end if;

  insert into public.lesson_attempt_answers(
    user_id, question_id, selected_option_id, is_correct
  )
  values (p_user_id, p_question_id, btrim(p_selected_option_id), v_is_correct)
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
  v_xp integer := 0;
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
      'already_completed', false
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
    'already_completed', v_already_completed
  );
end;
$$;

revoke all on function public.submit_lesson_answer(uuid, bigint, text)
  from public, anon, authenticated;
grant execute on function public.submit_lesson_answer(uuid, bigint, text)
  to service_role;

revoke all on function public.complete_lesson(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.complete_lesson(uuid, bigint)
  to service_role;

notify pgrst, 'reload schema';
