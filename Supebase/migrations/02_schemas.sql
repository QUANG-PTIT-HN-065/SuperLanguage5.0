-- Kích hoạt extension hỗ trợ UUID nếu chưa có
create extension if not exists "uuid-ossp";

-- 1. Bảng Profiles (Mở rộng thông tin người dùng liên kết với Supabase Auth)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  role text default 'user' check (role in ('user', 'admin')),
  learning_goal text,
  level text default 'Beginner',
  xp_points int default 0,
  streak_count int default 0,
  last_active_date date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Bảng Courses (Quản lý khóa học)
create table public.courses (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  level_category text not null, -- Sơ cấp, Trung cấp, Cao cấp
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Bảng Lessons (Quản lý bài học)
create table public.lessons (
  id uuid default gen_random_uuid() primary key,
  course_id uuid references public.courses(id) on delete cascade not null,
  title text not null,
  type text not null, -- vocab, grammar, speaking
  order_index int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Bảng Questions (Ngân hàng câu hỏi bài tập)
create table public.questions (
  id uuid default gen_random_uuid() primary key,
  lesson_id uuid references public.lessons(id) on delete cascade not null,
  question_type text not null, -- multiple_choice, fill_in, drag_drop
  content text not null,
  options_json jsonb, -- Các lựa chọn trắc nghiệm dạng JSON
  correct_answer text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Bảng Lesson Attempts (Lịch sử làm bài & Tiến độ học viên)
create table public.lesson_attempts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  lesson_id uuid references public.lessons(id) on delete cascade not null,
  score float default 0,
  completion_percentage float default 0,
  completed_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. Bảng XP Logs (Nhật ký tích lũy điểm kinh nghiệm)
create table public.xp_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  xp_amount int not null,
  source text not null, -- complete_lesson, ai_speaking, etc.
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Bảng Streaks (Theo dõi chuỗi ngày học liên tục)
create table public.streaks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade unique not null,
  current_streak int default 0,
  last_active_date date
);

-- 8. Bảng Conversations (Phòng luyện nói / Chatbot AI - Chủ đề, ngôn ngữ)
create table public.conversations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null, -- Chủ đề phòng chat
  language_code text not null check (language_code in ('English', 'Japanese')), -- Ngôn ngữ học tập
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 9. Bảng Messages (Chi tiết hội thoại - Vai trò user/ai, nội dung, thời điểm)
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_type text not null check (sender_type in ('user', 'ai')), -- Vai trò người gửi
  content text not null, -- Nội dung tin nhắn / Transcript
  audio_url text, -- Đường dẫn file ghi âm (nếu có)
  ai_feedback text, -- Phân tích ngữ pháp, phát âm từ AI
  created_at timestamp with time zone default timezone('utc'::text, now()) not null -- Thời điểm gửi
);

-- 10. Trigger tự động tạo bản ghi trong bảng profiles khi có User đăng ký mới
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();