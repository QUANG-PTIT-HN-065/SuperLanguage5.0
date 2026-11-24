do $$
begin
  if to_regclass('public.user_stats') is null then
    raise exception
      'User hearts migration prerequisite is missing. Run 01_schema.sql first.';
  end if;
end;
$$;

alter table public.user_stats
  add column if not exists hearts_remaining smallint not null default 5,
  add column if not exists hearts_locked_until timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_stats_hearts_remaining_nonnegative'
      and conrelid = 'public.user_stats'::regclass
  ) then
    alter table public.user_stats
      add constraint user_stats_hearts_remaining_nonnegative
      check (hearts_remaining >= 0);
  end if;
end;
$$;

comment on column public.user_stats.hearts_remaining is
  'Current heart count for the user. The maximum is determined by the user plan.';

comment on column public.user_stats.hearts_locked_until is
  'Time when the user can play again after reaching zero hearts.';

notify pgrst, 'reload schema';
