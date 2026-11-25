-- 17_dungeon_progress.sql
-- Lưu tiến trình "các ải đã qua" của bản đồ hầm ngục theo TÀI KHOẢN.
-- Trước đây tiến trình chỉ nằm trong localStorage (key slanguage_dungeon_topic_*)
-- và bị clearLearnerCache() xoá sạch lúc đăng xuất → đăng nhập lại quay về đầu chủ đề.
--
-- Migration này CHỈ THÊM MỚI (create table/index/function + phân quyền), không sửa,
-- không xoá dữ liệu cũ. Chạy một lần trong Supabase SQL Editor.
-- Yêu cầu: 01_schema.sql (bảng public.profiles) đã chạy trước.

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception
      'Dungeon progress prerequisite is missing. Run 01_schema.sql first.';
  end if;
end;
$$;

create table if not exists public.dungeon_progress (
  user_id         uuid    not null references public.profiles (id) on delete cascade,
  topic_id        integer not null check (topic_id >= 1),
  completed_nodes jsonb   not null default '[]'::jsonb
    check (jsonb_typeof(completed_nodes) = 'array'),
  updated_at      timestamptz not null default now(),
  primary key (user_id, topic_id)
);

comment on table public.dungeon_progress is
  'Danh sách nút ải người dùng đã vượt trong bản đồ của một chủ đề.';
comment on column public.dungeon_progress.completed_nodes is
  'Mảng chuỗi định danh nút, ví dụ ["t12_s1_hub","t12_s1_easy"]. Backend kiểm soát định dạng.';

create index if not exists dungeon_progress_user_idx
  on public.dungeon_progress (user_id);

-- Chỉ service_role (backend) được chạm bảng này; frontend đi qua endpoint /api/v1/lessons.
alter table public.dungeon_progress enable row level security;
revoke all on public.dungeon_progress from public, anon, authenticated;
grant all on public.dungeon_progress to service_role;

-- Đọc tiến trình của một chủ đề. Không có dòng nào -> mảng rỗng.
create or replace function public.get_dungeon_progress(p_user_id uuid, p_topic_id integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(progress.completed_nodes, '[]'::jsonb)
  from public.dungeon_progress progress
  where progress.user_id = p_user_id
    and progress.topic_id = p_topic_id;
$$;

-- Ghi thêm các ải vừa vượt: hợp nhất (union) với danh sách đã lưu để hai thiết bị
-- cùng học không xoá mất tiến trình của nhau. Trả về danh sách sau hợp nhất.
create or replace function public.save_dungeon_progress(
  p_user_id uuid,
  p_topic_id integer,
  p_completed_nodes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merged jsonb;
begin
  if jsonb_typeof(p_completed_nodes) <> 'array' then
    raise exception 'p_completed_nodes must be a JSON array' using errcode = '22P02';
  end if;
  if jsonb_array_length(p_completed_nodes) > 40 then
    raise exception 'Too many completed nodes in one write' using errcode = '22023';
  end if;

  insert into public.dungeon_progress as current_progress (
    user_id, topic_id, completed_nodes, updated_at
  )
  values (p_user_id, p_topic_id, p_completed_nodes, now())
  on conflict (user_id, topic_id) do update set
    completed_nodes = (
      select coalesce(jsonb_agg(distinct merged.node), '[]'::jsonb)
      from jsonb_array_elements_text(
        current_progress.completed_nodes || excluded.completed_nodes
      ) as merged(node)
    ),
    updated_at = now()
  returning current_progress.completed_nodes into v_merged;

  return v_merged;
end;
$$;

revoke all on function public.get_dungeon_progress(uuid, integer) from public, anon, authenticated;
revoke all on function public.save_dungeon_progress(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.get_dungeon_progress(uuid, integer) to service_role;
grant execute on function public.save_dungeon_progress(uuid, integer, jsonb) to service_role;

notify pgrst, 'reload schema';
