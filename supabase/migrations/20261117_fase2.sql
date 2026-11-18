-- Fase 2: clientes sumidos/aniversariantes e cartão fidelidade (Black),
-- produtos parados e meta do mês (Pro).

alter table public.customers add column if not exists birthday date; -- ano 2000 quando só dia/mês
alter table public.store_settings add column if not exists monthly_goal numeric(12,2) check (monthly_goal is null or monthly_goal > 0);
alter table public.store_settings add column if not exists loyalty jsonb not null
  default '{"enabled": false, "every": 10, "min_value": 0, "reward": ""}'::jsonb;
grant update (monthly_goal, loyalty) on public.store_settings to authenticated;

-- resgates do cartão fidelidade: zeram a contagem do cliente
create table if not exists public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reward text not null,
  redeemed_by uuid default auth.uid(),
  redeemed_at timestamptz not null default now()
);
create index if not exists loyalty_redemptions_customer on public.loyalty_redemptions(customer_id, redeemed_at desc);
alter table public.loyalty_redemptions enable row level security;
create policy loyalty_select on public.loyalty_redemptions for select to authenticated using (public.is_store_member(store_id));
revoke insert, update, delete on public.loyalty_redemptions from authenticated, anon;

-- Situação do cartão de um cliente
create or replace function public.get_loyalty(_customer_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare c public.customers%rowtype; cfg jsonb; desde timestamptz; n int;
begin
  select * into c from public.customers where id = _customer_id;
  if not found or not public.is_store_member(c.store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select loyalty into cfg from public.store_settings where store_id = c.store_id;
  if not public.store_has_plan(c.store_id, 'black') or not coalesce((cfg->>'enabled')::boolean, false) then
    return jsonb_build_object('enabled', false);
  end if;
  select max(redeemed_at) into desde from public.loyalty_redemptions where customer_id = _customer_id;
  select count(*) into n from public.sales s
   where s.customer_id = _customer_id and s.status = 'completed'
     and s.total >= coalesce((cfg->>'min_value')::numeric, 0)
     and (desde is null or s.sold_at > desde);
  return jsonb_build_object('enabled', true, 'count', n, 'every', (cfg->>'every')::int,
    'reward', cfg->>'reward', 'min_value', coalesce((cfg->>'min_value')::numeric, 0),
    'ready', n >= (cfg->>'every')::int, 'last_redeemed', desde);
end $$;

create or replace function public.redeem_loyalty(_customer_id uuid) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare c public.customers%rowtype; info jsonb;
begin
  select * into c from public.customers where id = _customer_id for update;
  if not found or not public.is_store_member(c.store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  info := public.get_loyalty(_customer_id);
  if not coalesce((info->>'ready')::boolean, false) then raise exception 'loyalty_not_ready' using errcode = '22023'; end if;
  insert into public.loyalty_redemptions (store_id, customer_id, reward) values (c.store_id, _customer_id, coalesce(info->>'reward', ''));
end $$;

create or replace function public.update_loyalty(_store_id uuid, _enabled boolean, _every int, _min_value numeric, _reward text) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not public.has_store_role(_store_id, array['owner','manager']::public.store_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.store_has_plan(_store_id, 'black') then raise exception 'plan_required:black' using errcode = '42501'; end if;
  if _every is null or _every < 2 or _every > 50 then raise exception 'invalid_every' using errcode = '22023'; end if;
  if _enabled and coalesce(trim(_reward), '') = '' then raise exception 'reward_required' using errcode = '22023'; end if;
  update public.store_settings set loyalty = jsonb_build_object('enabled', _enabled, 'every', _every,
    'min_value', greatest(coalesce(_min_value, 0), 0), 'reward', coalesce(trim(_reward), ''))
  where store_id = _store_id;
end $$;

-- Clientes sumidos e aniversariantes do mês
create or replace function public.get_customer_insights(_store_id uuid, _days int default 45) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare hoje date := (now() at time zone 'America/Sao_Paulo')::date; r jsonb;
begin
  if not public.is_store_member(_store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.store_has_plan(_store_id, 'black') then raise exception 'plan_required:black' using errcode = '42501'; end if;
  with compras as (
    select s.customer_id, max(s.sold_at) ultima, count(*) qtd, sum(s.total) total
    from public.sales s where s.store_id = _store_id and s.status = 'completed' and s.customer_id is not null
    group by s.customer_id
  )
  select jsonb_build_object(
    'sumidos', coalesce((select jsonb_agg(x order by x->>'last_sale') from (
      select jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone, 'last_sale', k.ultima,
        'days', hoje - (k.ultima at time zone 'America/Sao_Paulo')::date, 'purchases', k.qtd, 'total', k.total) x
      from public.customers c join compras k on k.customer_id = c.id
      where c.store_id = _store_id and c.active and k.ultima < now() - make_interval(days => _days)
      order by k.total desc limit 100) t), '[]'::jsonb),
    'aniversariantes', coalesce((select jsonb_agg(x order by (x->>'day')::int) from (
      select jsonb_build_object('id', c.id, 'name', c.name, 'phone', c.phone,
        'day', extract(day from c.birthday)::int, 'today', extract(day from c.birthday) = extract(day from hoje)) x
      from public.customers c
      where c.store_id = _store_id and c.active and c.birthday is not null
        and extract(month from c.birthday) = extract(month from hoje)) t), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Produtos parados: têm estoque e não vendem há _days dias (ou nunca, e existem há mais que isso)
create or replace function public.get_stale_products(_store_id uuid, _days int default 60) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare r jsonb;
begin
  if not public.has_store_role(_store_id, array['owner','manager']::public.store_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.store_has_plan(_store_id, 'pro') then raise exception 'plan_required:pro' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(x order by (x->>'value_cost')::numeric desc), '[]'::jsonb) into r from (
    select jsonb_build_object('product_id', p.id, 'name', p.name, 'attributes', v.attributes,
      'stock', v.stock_quantity, 'price', v.sale_price, 'value_cost', v.stock_quantity * coalesce(v.unit_cost, 0),
      'value_price', v.stock_quantity * v.sale_price, 'last_sale', ls.ultima,
      'days', ((now() at time zone 'America/Sao_Paulo')::date - (coalesce(ls.ultima, v.created_at) at time zone 'America/Sao_Paulo')::date)) x
    from public.product_variants v
    join public.products p on p.id = v.product_id
    left join lateral (
      select max(s.sold_at) ultima from public.sale_items i join public.sales s on s.id = i.sale_id
      where i.variant_id = v.id and s.status = 'completed') ls on true
    where v.store_id = _store_id and v.active and p.active and v.stock_quantity > 0
      and coalesce(ls.ultima, v.created_at) < now() - make_interval(days => _days)
    limit 200) t;
  return r;
end $$;

create or replace function public.update_monthly_goal(_store_id uuid, _goal numeric) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not public.has_store_role(_store_id, array['owner','manager']::public.store_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.store_has_plan(_store_id, 'pro') then raise exception 'plan_required:pro' using errcode = '42501'; end if;
  update public.store_settings set monthly_goal = case when _goal is null or _goal <= 0 then null else _goal end where store_id = _store_id;
end $$;

revoke execute on function public.get_loyalty(uuid), public.redeem_loyalty(uuid),
  public.update_loyalty(uuid, boolean, int, numeric, text), public.get_customer_insights(uuid, int),
  public.get_stale_products(uuid, int), public.update_monthly_goal(uuid, numeric) from public, anon;
grant execute on function public.get_loyalty(uuid), public.redeem_loyalty(uuid),
  public.update_loyalty(uuid, boolean, int, numeric, text), public.get_customer_insights(uuid, int),
  public.get_stale_products(uuid, int), public.update_monthly_goal(uuid, numeric) to authenticated;
