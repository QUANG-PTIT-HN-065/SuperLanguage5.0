-- Premium plan catalog extensions.
-- Keeps the legacy plans and adds independently configurable billing variants.

alter table public.plans
  add column if not exists billing_period text
    check (billing_period in ('free', 'monthly', 'yearly')),
  add column if not exists price_usd numeric(10, 2) not null default 0
    check (price_usd >= 0),
  add column if not exists description text;

update public.plans
set billing_period = case
  when id = 'free' then 'free'
  else 'monthly'
end
where billing_period is null;

insert into public.plans (
  id, name, daily_lesson_limit, max_hearts, video_access, is_active,
  sort_order, billing_period, price_usd, description
) values
  (
    'premium_monthly', 'Premium tháng', null, null, true, true,
    10, 'monthly', 9.99, 'Truy cập Premium theo tháng.'
  ),
  (
    'premium_yearly', 'Premium năm', null, null, true, true,
    11, 'yearly', 79.99, 'Truy cập Premium theo năm với mức giá tiết kiệm hơn.'
  )
on conflict (id) do update set
  billing_period = excluded.billing_period,
  description = excluded.description;
