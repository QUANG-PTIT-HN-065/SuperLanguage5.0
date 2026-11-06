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