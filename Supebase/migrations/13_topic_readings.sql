do $$
begin
  if to_regclass('public.topics') is null then
    raise exception 'Topic readings prerequisites are missing. Run 01_schema.sql first.';
  end if;
end;
$$;

alter table public.topics
  add column if not exists readings jsonb;

alter table public.topics
  drop constraint if exists topics_readings_five_check;
alter table public.topics
  add constraint topics_readings_five_check check (
    readings is null
    or (
      jsonb_typeof(readings) = 'array'
      and jsonb_array_length(readings) = 5
    )
  );

comment on column public.topics.readings is
  'Năm bài đọc theo tầng hầm ngục: [{title, passage, translation} x5]; null = chưa biên soạn, tầng 1 fallback về lessons.description.';

notify pgrst, 'reload schema';