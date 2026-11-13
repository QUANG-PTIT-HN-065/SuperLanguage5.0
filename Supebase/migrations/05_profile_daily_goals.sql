-- Store daily learning targets as minutes and completed lessons.
alter table public.profiles
  add column if not exists daily_goal_minutes smallint not null default 15
    check (daily_goal_minutes between 5 and 240),
  add column if not exists daily_goal_lessons smallint not null default 1
    check (daily_goal_lessons between 1 and 20);
