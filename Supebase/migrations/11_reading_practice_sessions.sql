alter table public.conversations
  add column if not exists practice_mode text not null default 'free-chat';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_practice_mode_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_practice_mode_check
      check (practice_mode in ('free-chat', 'read-aloud'));
  end if;
end;
$$;

create table if not exists public.reading_practice_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  question text not null,
  sample_answer text not null,
  transcript text,
  ai_feedback jsonb check (
    ai_feedback is null or jsonb_typeof(ai_feedback) = 'object'
  ),
  created_at timestamptz not null default now()
);

create index if not exists reading_practice_turns_conversation_idx
  on public.reading_practice_turns (conversation_id, created_at asc);

alter table public.reading_practice_turns enable row level security;
revoke all on public.reading_practice_turns from public, anon, authenticated;
grant all on public.reading_practice_turns to service_role;

drop trigger if exists trg_update_conversation_timestamp_on_reading_turns
  on public.reading_practice_turns;
create trigger trg_update_conversation_timestamp_on_reading_turns
  after insert or update on public.reading_practice_turns
  for each row execute function public.update_conversation_timestamp();

notify pgrst, 'reload schema';
