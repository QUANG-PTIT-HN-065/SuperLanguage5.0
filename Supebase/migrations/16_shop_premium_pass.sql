-- 16_shop_premium_pass.sql
-- Thêm vật phẩm "Premium 1 Ngày" (500 Coin) vào cửa hàng:
--   * Mua là kích hoạt NGAY (không nằm trong kho đồ): profiles.plan_id = 'premium'
--     và plan_expires_at = hiện tại + 1 ngày (mua lại khi còn hạn sẽ cộng dồn thêm 1 ngày).
--   * Hiệu ứng: mở 50% bài học còn lại (nửa sau lộ trình) + 50% từ vựng chưa được học
--     và TIM VÔ HẠN (plans.premium.max_hearts = NULL), theo đúng cổng kiểm soát
--     is_premium_profile() đang có sẵn trong backend.
--   * Giới hạn mua: 1 lượt/ngày.
-- Yêu cầu: 01_schema.sql, 12_shop_and_leaderboard.sql đã chạy trước.

do $$
begin
  if to_regclass('public.shop_catalog') is null
    or to_regclass('public.shop_transactions') is null
    or to_regclass('public.profiles') is null
  then
    raise exception
      'Premium pass prerequisites are missing. Run 01_schema.sql and 12_shop_and_leaderboard.sql first.';
  end if;
  if to_regclass('public.plans') is null
    or not exists (select 1 from public.plans where id = 'premium')
  then
    raise exception 'The premium plan row is missing from public.plans.';
  end if;
end;
$$;

-- 1. Cho phép nhóm vật phẩm mới 'premium' trong danh mục cửa hàng.
alter table public.shop_catalog
  drop constraint if exists shop_catalog_category_check;
alter table public.shop_catalog
  add constraint shop_catalog_category_check
  check (category in ('boost', 'heal', 'shield', 'premium'));

-- 2. Vật phẩm Premium 1 Ngày - 500 Coin.
insert into public.shop_catalog (
  id, title, description, cost_coins, icon, badge, badge_class,
  category, limit_period, limit_count, non_stacking, sort_order
)
values
  (
    'premium_1day', 'Premium 1 Ngày (👑)',
    'Kích hoạt ngay khi mua: mở toàn bộ 50% bài học còn lại của lộ trình, 50% từ vựng đang bị khóa và TIM VÔ HẠN trong 1 ngày.', 500,
    'fa-solid fa-crown', 'Thử Premium', 'badge-premium',
    'premium', 'daily', 1, false, 0
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

-- 3. purchase_shop_item: vật phẩm nhóm 'premium' kích hoạt thẳng vào hồ sơ, không vào kho.
--    Bản nền: 12_shop_and_leaderboard.sql (giữ nguyên luồng exchange/vật phẩm thường).
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
  v_premium_until timestamptz;
  v_title text;
  v_details text;
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

  if v_item.category = 'premium' then
    -- UPDATE đơn lệnh nên phép cộng dồn hạn là nguyên tử với truy cập đồng thời.
    update public.profiles
    set plan_id = 'premium',
        plan_expires_at =
          greatest(now(), coalesce(plan_expires_at, now())) + interval '1 day'
    where id = p_user_id
    returning plan_expires_at into v_premium_until;
    if not found then
      raise exception 'Active profile not found' using errcode = 'P0002';
    end if;
    v_title := format('Mua Premium 1 Ngày (%s Coin)', v_item.cost_coins);
    v_details := format(
      'Premium có hiệu lực đến %s (giờ của bạn).',
      to_char(v_premium_until at time zone v_timezone, 'DD/MM/YYYY HH24:MI')
    );
  else
    v_title := format('Mua %s', v_item.title);
    v_details := 'Vật phẩm đã được ghi vào kho đồ của bạn.';
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
    v_title,
    v_details
  );

  if v_item.category <> 'premium' then
    insert into public.shop_inventory(user_id, shop_item_id, quantity)
    values (p_user_id, v_item.id, 1)
    on conflict (user_id, shop_item_id) do update set
      quantity = public.shop_inventory.quantity + 1,
      updated_at = now();
  end if;

  return public.get_shop_state(p_user_id);
end;
$$;

-- 4. get_shop_state: bổ sung trạng thái premium để frontend hiển thị.
--    Bản nền: 12_shop_and_leaderboard.sql (giữ nguyên các khối items/inventory/transactions).
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
  v_plan_id text;
  v_plan_expires_at timestamptz;
  v_items jsonb;
  v_inventory jsonb;
  v_transactions jsonb;
begin
  select coalesce(stats.xp_total, 0), coalesce(profile.timezone, 'UTC'),
         profile.plan_id, profile.plan_expires_at
  into v_xp_total, v_timezone, v_plan_id, v_plan_expires_at
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
    'premium_active', v_plan_id = 'premium'
      and (v_plan_expires_at is null or v_plan_expires_at > now()),
    'premium_until', case
      when v_plan_id = 'premium'
        and v_plan_expires_at is not null
        and v_plan_expires_at > now()
      then v_plan_expires_at
      else null
    end,
    'items', v_items,
    'inventory', v_inventory,
    'transactions', v_transactions
  );
end;
$$;

revoke all on function public.purchase_shop_item(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_shop_state(uuid)
  from public, anon, authenticated;
grant execute on function public.purchase_shop_item(uuid, uuid, text) to service_role;
grant execute on function public.get_shop_state(uuid) to service_role;

notify pgrst, 'reload schema';
