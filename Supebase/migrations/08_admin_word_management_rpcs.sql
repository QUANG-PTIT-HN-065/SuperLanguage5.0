do $$
begin
  if to_regclass('public.words') is null
    or to_regclass('public.word_topics') is null
    or to_regclass('public.topics') is null
    or to_regtype('public.cefr_level') is null
  then
    raise exception
      'Admin word RPC prerequisites are missing. Run 01_schema.sql first.';
  end if;
end;
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
    p_word ->> 'audio_url',
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

revoke all on function public.admin_create_word(jsonb, bigint[])
  from public, anon, authenticated;
revoke all on function public.admin_update_word(bigint, jsonb, bigint[])
  from public, anon, authenticated;
revoke all on function public.admin_delete_word(bigint)
  from public, anon, authenticated;

grant execute on function public.admin_create_word(jsonb, bigint[]) to service_role;
grant execute on function public.admin_update_word(bigint, jsonb, bigint[]) to service_role;
grant execute on function public.admin_delete_word(bigint) to service_role;

notify pgrst, 'reload schema';
