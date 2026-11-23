alter table public.profiles
  add column if not exists deletion_warning_at timestamptz,
  add column if not exists deletion_scheduled_at timestamptz;

create index if not exists profiles_inactive_deletion_idx
  on public.profiles (deletion_scheduled_at)
  where deletion_scheduled_at is not null and deleted_at is null;
