-- 18: Thuộc từ vựng chỉ sau MỘT lần trả lời đúng (user chốt 2026-11-25).
-- Luật cũ: mỗi lần đúng cộng +1/5 và từ bị hẹn ôn 1 ngày -> phải rất lâu mới đủ 5 lần.
-- Luật mới: 'Tốt'/'Dễ' nhảy thẳng mastery 5 (đã thuộc), 'Khó' về 0 (chưa thuộc).
-- Chỉ thay DDL (function + trigger), KHÔNG UPDATE/DELETE dữ liệu cũ:
-- các từ đang học dở (mastery 1..4) vẫn giữ nguyên số liệu, backend tính là đã thuộc.

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
    -- Sai là trở lại chưa thuộc, nhưng vẫn giữ lịch ôn ngắn để từ quay lại sớm.
    v_next_mastery := 0;
    v_interval := interval '10 minutes';
  else
    -- Đúng một lần là thuộc luôn; lịch ôn dài hạn chỉ còn là nhắc lại.
    v_next_mastery := 5;
    v_interval := case when p_rating = 'Dễ' then interval '60 days' else interval '30 days' end;
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

revoke all on function public.review_vocabulary_word(uuid, bigint, uuid, text)
  from public, anon, authenticated;
grant execute on function public.review_vocabulary_word(uuid, bigint, uuid, text) to service_role;

-- words_learned chỉ tăng LẦN ĐẦU một từ đạt mốc thuộc.
-- Luật mới cho phép rớt về 0 rồi lên lại 5, nếu không chặn thì thống kê đếm trùng.
create or replace function public.update_user_words_learned_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mastery_level = 5
     and (TG_OP = 'INSERT' or old.mastery_level < 5)
     and not exists (
       select 1 from public.user_word_review_events as counted
       where counted.user_id = new.user_id
         and counted.word_id = new.word_id
         and counted.mastery_level = 5
     ) then
    update public.user_stats
    set words_learned = words_learned + 1
    where user_id = new.user_id;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
