do $$
begin
  if to_regclass('public.profiles') is null
    or to_regclass('public.user_stats') is null
    or to_regclass('public.daily_activity') is null
    or to_regclass('public.lesson_progress') is null
  then
    raise exception
      'Shop/leaderboard prerequisites are missing. Run 01_schema.sql and 06_learning_lessons.sql first.';
  end if;
end;
$$;

create table if not exists public.shop_catalog (
  id text primary key,
  title text not null,
  description text not null,
  cost_coins integer not null check (cost_coins > 0),
  icon text not null,
  badge text not null,
  badge_class text not null,
  category text not null check (category in ('boost', 'heal', 'shield')),
  limit_period text not null check (limit_period in ('daily', 'monthly')),
  limit_count integer not null check (limit_count > 0),
  non_stacking boolean not null default false,
  sort_order smallint not null default 100,
  is_active boolean not null default true
);

insert into public.shop_catalog (
  id, title, description, cost_coins, icon, badge, badge_class,
  category, limit_period, limit_count, non_stacking, sort_order
)
values
  (
    'heal_hearts', 'Hồi Phục Máu Siêu Tốc (+5 ❤️)',
    'Vật phẩm được lưu trong kho sau khi mua; hiệu ứng hồi phục chưa được kết nối với luồng học.', 25,
    'fa-solid fa-heart-pulse', 'Cứu Sinh', 'badge-heal',
    'heal', 'daily', 1, false, 1
  ),
  (
    'boost_xp_10', 'Tăng Cường Kinh Nghiệm (+10% XP)',
    'Vật phẩm được lưu trong kho sau khi mua; chưa tự động áp dụng vào bài học.', 30,
    'fa-solid fa-bolt-lightning', 'Bứt Phá XP', 'badge-boost',
    'boost', 'daily', 2, true, 2
  ),
  (
    'streak_freeze', 'Đóng Băng Chuỗi Học (Streak Freeze ❄️)',
    'Vật phẩm được lưu trong kho sau khi mua; chưa tự động bảo vệ chuỗi ngày học.', 250,
    'fa-solid fa-snowflake', 'Bảo Hộ Chuỗi', 'badge-shield',
    'shield', 'monthly', 1, false, 3
  ),
  (
    'double_xp', 'Gấp Đôi Kinh Nghiệm (x2 XP ⚡)',
    'Vật phẩm được lưu trong kho sau khi mua; chưa tự động áp dụng vào bài học.', 150,
    'fa-solid fa-star', 'Siêu Tăng Tốc', 'badge-boost',
    'boost', 'daily', 1, true, 4
  )
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  cost_coins = excluded.cost_coins,
  icon = excluded.icon,
  badge = excluded.badge,
  badge_class = excluded.badge_class,
  category = excluded.category,
  limit_period = excluded.limit_period,
  limit_count = excluded.limit_count,
  non_stacking = excluded.non_stacking,
  sort_order = excluded.sort_order,
  is_active = true;

create table if not exists public.shop_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  transaction_type text not null check (transaction_type in ('exchange', 'purchase')),
  shop_item_id text references public.shop_catalog(id),
  xp_delta bigint not null default 0,
  coin_delta bigint not null,
  title text not null,
  details text not null,
  created_at timestamptz not null default now(),
  unique (user_id, request_id),
  check (
    (transaction_type = 'exchange'
      and shop_item_id is null
      and xp_delta < 0
      and coin_delta > 0)
    or
    (transaction_type = 'purchase'
      and shop_item_id is not null
      and xp_delta = 0
      and coin_delta < 0)
  )
);

create index if not exists shop_transactions_user_created_idx
  on public.shop_transactions(user_id, created_at desc);
create index if not exists shop_transactions_user_item_created_idx
  on public.shop_transactions(user_id, shop_item_id, created_at desc)
  where transaction_type = 'purchase';

create table if not exists public.shop_inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  shop_item_id text not null references public.shop_catalog(id),
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, shop_item_id)
);

alter table public.shop_catalog enable row level security;
alter table public.shop_transactions enable row level security;
alter table public.shop_inventory enable row level security;
revoke all on public.shop_catalog, public.shop_transactions, public.shop_inventory
  from public, anon, authenticated;
grant all on public.shop_catalog, public.shop_transactions, public.shop_inventory
  to service_role;

create or replace function public.get_shop_state(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_xp_total bigint;
  v_xp_spent bigint;
  v_coins bigint;
  v_timezone text;
  v_items jsonb;
  v_inventory jsonb;
  v_transactions jsonb;
begin
  select coalesce(stats.xp_total, 0), coalesce(profile.timezone, 'UTC')
  into v_xp_total, v_timezone
  from public.profiles profile
  left join public.user_stats stats on stats.user_id = profile.id
  where profile.id = p_user_id
    and profile.status = 'active'
    and profile.deleted_at is null;
  if not found then
    raise exception 'Active profile not found' using errcode = 'P0002';
  end if;

  select
    coalesce(-sum(transaction.xp_delta), 0),
    coalesce(sum(transaction.coin_delta), 0)
  into v_xp_spent, v_coins
  from public.shop_transactions transaction
  where transaction.user_id = p_user_id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', item.id,
      'title', item.title,
      'description', item.description,
      'cost_coins', item.cost_coins,
      'icon', item.icon,
      'badge', item.badge,
      'badge_class', item.badge_class,
      'category', item.category,
      'limit_period', item.limit_period,
      'limit_count', item.limit_count,
      'remaining_limit', greatest(
        0,
        item.limit_count - (
          select count(*)::integer
          from public.shop_transactions purchase
          where purchase.user_id = p_user_id
            and purchase.shop_item_id = item.id
            and purchase.transaction_type = 'purchase'
            and purchase.created_at >= case item.limit_period
              when 'daily' then
                date_trunc('day', now() at time zone v_timezone) at time zone v_timezone
              else
                date_trunc('month', now() at time zone v_timezone) at time zone v_timezone
            end
        )
      ),
      'non_stacking', item.non_stacking
    ) order by item.sort_order, item.id
  ), '[]'::jsonb)
  into v_items
  from public.shop_catalog item
  where item.is_active;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'item_id', item.id,
      'title', item.title,
      'icon', item.icon,
      'quantity', inventory.quantity
    ) order by item.sort_order, item.id
  ), '[]'::jsonb)
  into v_inventory
  from public.shop_inventory inventory
  join public.shop_catalog item on item.id = inventory.shop_item_id
  where inventory.user_id = p_user_id
    and inventory.quantity > 0;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', transactions.id,
      'type', transactions.transaction_type,
      'title', transactions.title,
      'details', transactions.details,
      'xp_delta', transactions.xp_delta,
      'coin_delta', transactions.coin_delta,
      'created_at', transactions.created_at
    ) order by transactions.created_at desc
  ), '[]'::jsonb)
  into v_transactions
  from (
    select *
    from public.shop_transactions
    where user_id = p_user_id
    order by created_at desc
    limit 20
  ) transactions;

  return jsonb_build_object(
    'xp_total', v_xp_total,
    'xp_balance', greatest(0, v_xp_total - v_xp_spent),
    'coin_balance', greatest(0, v_coins),
    'items', v_items,
    'inventory', v_inventory,
    'transactions', v_transactions
  );
end;
$$;

create or replace function public.exchange_shop_xp(
  p_user_id uuid,
  p_request_id uuid,
  p_xp_amount integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_xp_total bigint;
  v_xp_spent bigint;
  v_existing public.shop_transactions%rowtype;
begin
  if p_xp_amount < 5 or p_xp_amount % 5 <> 0 then
    raise exception 'XP amount must be a positive multiple of 5' using errcode = '22023';
  end if;

  select stats.xp_total
  into v_xp_total
  from public.user_stats stats
  join public.profiles profile on profile.id = stats.user_id
  where stats.user_id = p_user_id
    and profile.status = 'active'
    and profile.deleted_at is null
  for update of stats;
  if not found then
    raise exception 'Active profile not found' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.shop_transactions
  where user_id = p_user_id and request_id = p_request_id;
  if found then
    if v_existing.transaction_type <> 'exchange'
      or v_existing.xp_delta <> -p_xp_amount
    then
      raise exception 'Request ID was already used for a different transaction'
        using errcode = '23505';
    end if;
    return public.get_shop_state(p_user_id);
  end if;

  select coalesce(-sum(transaction.xp_delta), 0)
  into v_xp_spent
  from public.shop_transactions transaction
  where transaction.user_id = p_user_id;
  if v_xp_total - v_xp_spent < p_xp_amount then
    raise exception 'Not enough available XP' using errcode = '23514';
  end if;

  insert into public.shop_transactions (
    user_id, request_id, transaction_type, xp_delta, coin_delta, title, details
  )
  values (
    p_user_id,
    p_request_id,
    'exchange',
    -p_xp_amount,
    p_xp_amount / 5,
    format('Quy đổi %s XP lấy %s Coin', p_xp_amount, p_xp_amount / 5),
    'Tỷ lệ quy đổi 5 XP = 1 Coin'
  );

  return public.get_shop_state(p_user_id);
end;
$$;

create or replace function public.purchase_shop_item(
  p_user_id uuid,
  p_request_id uuid,
  p_shop_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.shop_catalog%rowtype;
  v_coins bigint;
  v_purchased integer;
  v_timezone text;
  v_period_start timestamptz;
  v_existing public.shop_transactions%rowtype;
begin
  select profile.timezone
  into v_timezone
  from public.profiles profile
  where profile.id = p_user_id
    and profile.status = 'active'
    and profile.deleted_at is null;
  if not found then
    raise exception 'Active profile not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.user_stats stats
  where stats.user_id = p_user_id
  for update;
  if not found then
    raise exception 'User statistics not found' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.shop_transactions
  where user_id = p_user_id and request_id = p_request_id;
  if found then
    if v_existing.transaction_type <> 'purchase'
      or v_existing.shop_item_id <> p_shop_item_id
    then
      raise exception 'Request ID was already used for a different transaction'
        using errcode = '23505';
    end if;
    return public.get_shop_state(p_user_id);
  end if;

  select * into v_item
  from public.shop_catalog
  where id = p_shop_item_id and is_active;
  if not found then
    raise exception 'Shop item not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(transaction.coin_delta), 0)
  into v_coins
  from public.shop_transactions transaction
  where transaction.user_id = p_user_id;
  if v_coins < v_item.cost_coins then
    raise exception 'Not enough coins' using errcode = '23514';
  end if;

  v_period_start := case v_item.limit_period
    when 'daily' then
      date_trunc('day', now() at time zone v_timezone) at time zone v_timezone
    else
      date_trunc('month', now() at time zone v_timezone) at time zone v_timezone
  end;
  select count(*)::integer
  into v_purchased
  from public.shop_transactions transaction
  where transaction.user_id = p_user_id
    and transaction.shop_item_id = v_item.id
    and transaction.transaction_type = 'purchase'
    and transaction.created_at >= v_period_start;
  if v_purchased >= v_item.limit_count then
    raise exception 'Purchase limit reached' using errcode = '23514';
  end if;

  insert into public.shop_transactions (
    user_id, request_id, transaction_type, shop_item_id,
    xp_delta, coin_delta, title, details
  )
  values (
    p_user_id,
    p_request_id,
    'purchase',
    v_item.id,
    0,
    -v_item.cost_coins,
    format('Mua %s', v_item.title),
    'Vật phẩm đã được ghi vào kho đồ của bạn.'
  );

  insert into public.shop_inventory(user_id, shop_item_id, quantity)
  values (p_user_id, v_item.id, 1)
  on conflict (user_id, shop_item_id) do update set
    quantity = public.shop_inventory.quantity + 1,
    updated_at = now();

  return public.get_shop_state(p_user_id);
end;
$$;

create or replace function public.get_leaderboard(
  p_user_id uuid,
  p_period text,
  p_language text,
  p_sort text,
  p_search text,
  p_limit integer,
  p_offset integer,
  p_today date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_period not in ('today', 'week', 'month', 'all')
    or p_sort not in ('xp', 'streak', 'lessons', 'accuracy')
    or (p_language <> 'all' and p_language !~ '^[a-z]{2,3}$')
    or p_limit not between 1 and 50
    or p_offset < 0
  then
    raise exception 'Invalid leaderboard query' using errcode = '22023';
  end if;

  with user_metrics as (
    select
      profile.id as user_id,
      profile.username,
      coalesce(profile.display_name, profile.username) as display_name,
      profile.avatar_url,
      profile.target_language,
      coalesce(stats.xp_total, 0)::bigint as xp_total,
      coalesce(stats.current_streak, 0)::integer as current_streak,
      coalesce(stats.lessons_completed, 0)::integer as lessons_completed,
      coalesce(period_activity.xp_period, 0)::bigint as xp_period,
      coalesce(accuracy.accuracy, 0)::numeric as accuracy
    from public.profiles profile
    join public.user_stats stats on stats.user_id = profile.id
    left join lateral (
      select sum(activity.xp_earned)::bigint as xp_period
      from public.daily_activity activity
      where activity.user_id = profile.id
        and case p_period
          when 'today' then activity.activity_date = p_today
          when 'week' then activity.activity_date >= date_trunc('week', p_today::timestamp)::date
            and activity.activity_date <= p_today
          when 'month' then activity.activity_date >= date_trunc('month', p_today::timestamp)::date
            and activity.activity_date <= p_today
          else true
        end
    ) period_activity on true
    left join lateral (
      select
        case
          when sum(progress.question_count) > 0
          then round(100.0 * sum(progress.score) / sum(progress.question_count), 2)
          else 0
        end as accuracy
      from public.lesson_progress progress
      where progress.user_id = profile.id
    ) accuracy on true
    where profile.show_on_leaderboard
      and profile.status = 'active'
      and profile.deleted_at is null
      and (p_language = 'all' or profile.target_language = p_language)
      and (
        nullif(btrim(p_search), '') is null
        or position(lower(btrim(p_search)) in lower(profile.username)) > 0
        or position(lower(btrim(p_search)) in lower(coalesce(profile.display_name, ''))) > 0
      )
  ),
  ranked as (
    select
      metrics.*,
      dense_rank() over (
        order by
          case when p_sort = 'xp' and p_period <> 'all' then metrics.xp_period end desc,
          case when p_sort = 'xp' and p_period = 'all' then metrics.xp_total end desc,
          case when p_sort = 'streak' then metrics.current_streak end desc,
          case when p_sort = 'lessons' then metrics.lessons_completed end desc,
          case when p_sort = 'accuracy' then metrics.accuracy end desc
      )::integer as rank,
      row_number() over (
        order by
          case when p_sort = 'xp' and p_period <> 'all' then metrics.xp_period end desc,
          case when p_sort = 'xp' and p_period = 'all' then metrics.xp_total end desc,
          case when p_sort = 'streak' then metrics.current_streak end desc,
          case when p_sort = 'lessons' then metrics.lessons_completed end desc,
          case when p_sort = 'accuracy' then metrics.accuracy end desc,
          metrics.username,
          metrics.user_id
      ) as position
    from user_metrics metrics
  ),
  page as (
    select *
    from ranked
    order by position
    limit p_limit
    offset p_offset
  )
  select jsonb_build_object(
    'items',
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', page.rank,
        'user_id', page.user_id,
        'username', page.username,
        'display_name', page.display_name,
        'avatar_url', page.avatar_url,
        'target_language', page.target_language,
        'xp', case when p_period = 'all' then page.xp_total else page.xp_period end,
        'current_streak', page.current_streak,
        'lessons_completed', page.lessons_completed,
        'accuracy', page.accuracy,
        'is_current_user', page.user_id = p_user_id
      ) order by page.position)
      from page
    ), '[]'::jsonb),
    'total',
    (select count(*) from ranked),
    'current_user',
    (
      select jsonb_build_object(
        'rank', ranked.rank,
        'xp', case when p_period = 'all' then ranked.xp_total else ranked.xp_period end
      )
      from ranked
      where ranked.user_id = p_user_id
    ),
    'period', p_period,
    'as_of', p_today
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_shop_state(uuid) from public, anon, authenticated;
revoke all on function public.exchange_shop_xp(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.purchase_shop_item(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.get_leaderboard(uuid, text, text, text, text, integer, integer, date)
  from public, anon, authenticated;
grant execute on function public.get_shop_state(uuid) to service_role;
grant execute on function public.exchange_shop_xp(uuid, uuid, integer) to service_role;
grant execute on function public.purchase_shop_item(uuid, uuid, text) to service_role;
grant execute on function public.get_leaderboard(uuid, text, text, text, text, integer, integer, date)
  to service_role;
