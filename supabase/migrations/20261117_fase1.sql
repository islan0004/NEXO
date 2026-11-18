-- Fase 1: planos (Start/Pro/Black), taxa da maquininha, despesas e lucro líquido,
-- convite de equipe e catálogo online com pedido pelo WhatsApp.

-- ===== Planos =====
create type public.plan_tier as enum ('start', 'pro', 'black');
alter table public.store_subscriptions add column plan public.plan_tier not null default 'start';
alter table public.platform_settings
  add column price_start numeric(12,2) not null default 29.90,
  add column price_pro numeric(12,2) not null default 49.90,
  add column price_black numeric(12,2) not null default 79.90,
  add column support_whatsapp text check (support_whatsapp is null or length(support_whatsapp) <= 20);

create or replace function public.plan_rank(_p public.plan_tier) returns int language sql immutable as $$
  select case _p when 'start' then 1 when 'pro' then 2 else 3 end;
$$;

-- Plano efetivo: em teste ou cortesia, a loja usa tudo (Black); depois, o plano contratado
create or replace function public.store_plan(_store_id uuid) returns public.plan_tier
 language sql stable security definer set search_path to 'public' as $$
  select case
    when ss.status = 'free' then 'black'::public.plan_tier
    when ss.status = 'trial' and (ss.trial_ends_at is null or ss.trial_ends_at > now()) then 'black'::public.plan_tier
    else coalesce(ss.plan, 'start'::public.plan_tier) end
  from public.store_subscriptions ss where ss.store_id = _store_id
  union all select 'black'::public.plan_tier where not exists (select 1 from public.store_subscriptions where store_id = _store_id)
  limit 1;
$$;

create or replace function public.store_has_plan(_store_id uuid, _min public.plan_tier) returns boolean
 language sql stable security definer set search_path to 'public' as $$
  select public.plan_rank(public.store_plan(_store_id)) >= public.plan_rank(_min);
$$;

create or replace function public.get_my_subscription(_store_id uuid) returns jsonb
 language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare r jsonb;
begin
  if not public.is_store_member(_store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object('status', ss.status, 'plan', ss.plan, 'effective_plan', public.store_plan(_store_id),
      'trial_ends_at', ss.trial_ends_at, 'current_period_end', ss.current_period_end, 'monthly_price', ss.monthly_price,
      'prices', jsonb_build_object('start', ps.price_start, 'pro', ps.price_pro, 'black', ps.price_black),
      'support_whatsapp', ps.support_whatsapp)
    into r from public.store_subscriptions ss cross join public.platform_settings ps where ss.store_id = _store_id and ps.id;
  return r;
end $$;

drop function if exists public.admin_update_subscription(uuid, public.subscription_status, timestamptz, timestamptz, numeric, text);
create function public.admin_update_subscription(_store_id uuid, _status public.subscription_status, _plan public.plan_tier, _trial_ends_at timestamptz,
  _current_period_end timestamptz, _monthly_price numeric, _notes text) returns void
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare _preco numeric;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select case _plan when 'start' then price_start when 'pro' then price_pro else price_black end into _preco from public.platform_settings where id;
  insert into public.store_subscriptions (store_id, status, plan, trial_ends_at, current_period_end, monthly_price, notes)
  values (_store_id, _status, _plan, _trial_ends_at, _current_period_end, coalesce(_monthly_price, _preco), nullif(btrim(_notes), ''))
  on conflict (store_id) do update set status = excluded.status, plan = excluded.plan, trial_ends_at = excluded.trial_ends_at,
    current_period_end = excluded.current_period_end, monthly_price = excluded.monthly_price, notes = excluded.notes;
end $$;

drop function if exists public.admin_update_settings(int, numeric);
create function public.admin_update_settings(_default_trial_days int, _price_start numeric, _price_pro numeric, _price_black numeric, _support_whatsapp text) returns void
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.platform_settings set default_trial_days = _default_trial_days, price_start = _price_start, price_pro = _price_pro,
    price_black = _price_black, support_whatsapp = nullif(regexp_replace(coalesce(_support_whatsapp, ''), '\D', '', 'g'), ''), updated_at = now() where id;
end $$;

create or replace function public.get_sales_report(_store_id uuid, _from date, _to date)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
declare _tz text; _ini timestamptz; _fim timestamptz; r jsonb;
begin
  if auth.uid() is null or not public.has_store_role(_store_id, array['owner','manager']::public.store_role[]) then
    raise exception 'forbidden' using errcode = '42501'; end if;
  if _from is null or _to is null or _to < _from or _to - _from > 731 then raise exception 'invalid_period' using errcode = '22023'; end if;
  select coalesce(timezone, 'America/Sao_Paulo') into _tz from public.store_settings where store_id = _store_id;
  -- Plano Start: só o mês atual
  if not public.store_has_plan(_store_id, 'pro') and _from < date_trunc('month', now() at time zone _tz)::date then
    raise exception 'plan_required:pro' using errcode = '42501';
  end if;
  _ini := (_from::timestamp) at time zone _tz;
  _fim := ((_to + 1)::timestamp) at time zone _tz;

  with v as (
    select s.id, s.total, s.discount_total, s.sold_at,
           (select coalesce(sum(round(i.quantity * i.unit_cost, 2)), 0) from public.sale_items i where i.sale_id = s.id and i.store_id = s.store_id) as cost
    from public.sales s
    where s.store_id = _store_id and s.status = 'completed' and s.sold_at >= _ini and s.sold_at < _fim
  ), canceladas as (
    select count(*) n, coalesce(sum(total), 0) t from public.sales s
    where s.store_id = _store_id and s.status = 'canceled' and s.sold_at >= _ini and s.sold_at < _fim
  ), dias as (
    select d::date as dia from generate_series(_from::timestamp, _to::timestamp, interval '1 day') d
  ), por_dia as (
    select (v.sold_at at time zone _tz)::date as dia, sum(v.total) receita, sum(v.total - v.cost) lucro, count(*) vendas
    from v group by 1
  ), metodos as (
    select sp.method::text as method, sum(sp.amount) as total
    from public.sale_payments sp join v on v.id = sp.sale_id where sp.store_id = _store_id group by 1
  ), produtos as (
    select i.product_name, i.attributes, sum(i.quantity) qtd, sum(i.line_total) receita,
           sum(i.line_total - round(i.quantity * i.unit_cost, 2)) lucro
    from public.sale_items i join v on v.id = i.sale_id where i.store_id = _store_id
    group by i.product_name, i.attributes
  )
  select jsonb_build_object(
    'revenue', coalesce((select sum(total) from v), 0),
    'cost', coalesce((select sum(cost) from v), 0),
    'gross_profit', coalesce((select sum(total - cost) from v), 0),
    'discounts', coalesce((select sum(discount_total) from v), 0),
    'sales_count', (select count(*) from v),
    'canceled_count', (select n from canceladas),
    'canceled_total', (select t from canceladas),
    'card_fees', coalesce((select sum(sp.fee_amount) from public.sale_payments sp join v on v.id = sp.sale_id where sp.store_id = _store_id), 0),
    'expenses', coalesce((select sum(e.amount) from public.expenses e where e.store_id = _store_id and e.spent_on between _from and _to), 0),
    'expenses_by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', c, 'total', t) order by t desc), '[]') from (
        select coalesce(nullif(e.category, ''), 'Outros') c, sum(e.amount) t from public.expenses e
        where e.store_id = _store_id and e.spent_on between _from and _to group by 1) x),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d.dia, 'revenue', coalesce(p.receita, 0), 'profit', coalesce(p.lucro, 0), 'sales', coalesce(p.vendas, 0)) order by d.dia), '[]')
               from dias d left join por_dia p on p.dia = d.dia),
    'by_method', (select coalesce(jsonb_agg(jsonb_build_object('method', method, 'total', total) order by total desc), '[]') from metodos),
    'top_products', (select coalesce(jsonb_agg(to_jsonb(x) order by x.receita desc), '[]') from (select * from produtos order by receita desc limit 15) x)
  ) into r;
  return r;
end $$;

revoke execute on function public.get_sales_report(uuid, date, date) from public, anon;
grant execute on function public.get_sales_report(uuid, date, date) to authenticated;

create or replace function public.create_product_with_variants(
  _store_id uuid, _name text, _category_id uuid, _variants jsonb
) returns uuid
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare _uid uuid := auth.uid(); _product_id uuid; _variant_id uuid; _e jsonb; _i int := 0;
  _cost numeric; _price numeric; _init numeric; _min numeric; _attrs jsonb;
begin
  if _uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if not public.has_store_role(_store_id, array['owner','manager']::public.store_role[]) then
    raise exception 'forbidden' using errcode = '42501'; end if;
  if _name is null or length(btrim(_name)) = 0 then raise exception 'product_name_required' using errcode = '22023'; end if;
  if _variants is null or jsonb_typeof(_variants) <> 'array' or jsonb_array_length(_variants) not between 1 and 100 then
    raise exception 'invalid_variants' using errcode = '22023'; end if;
  -- Tamanhos/cores (variações) a partir do plano Pro
  if (jsonb_array_length(_variants) > 1 or exists (select 1 from jsonb_array_elements(_variants) where coalesce(value->'attributes','{}'::jsonb) <> '{}'::jsonb))
     and not public.store_has_plan(_store_id, 'pro') then
    raise exception 'plan_required:pro' using errcode = '42501';
  end if;
  if (select count(*) <> count(distinct coalesce(value->'attributes','{}'::jsonb)) from jsonb_array_elements(_variants)) then
    raise exception 'duplicate_variant' using errcode = '22023'; end if;

  insert into public.products (store_id, category_id, name)
  values (_store_id, _category_id, btrim(_name)) returning id into _product_id;

  for _e in select value from jsonb_array_elements(_variants) loop
    _attrs := coalesce(_e->'attributes', '{}'::jsonb);
    if jsonb_typeof(_attrs) <> 'object' then raise exception 'invalid_variants' using errcode = '22023'; end if;
    _cost := coalesce((_e->>'unit_cost')::numeric, 0);
    _price := coalesce((_e->>'sale_price')::numeric, 0);
    _init := coalesce((_e->>'initial_stock')::numeric, 0);
    _min := coalesce((_e->>'min_stock')::numeric, 0);
    if _cost < 0 or _price < 0 or _init < 0 or _min < 0 then raise exception 'invalid_variants' using errcode = '22023'; end if;

    insert into public.product_variants (store_id, product_id, is_default, sku, attributes, unit_cost, sale_price, min_stock)
    values (_store_id, _product_id, _i = 0, nullif(btrim(_e->>'sku'), ''), _attrs, _cost, _price, _min)
    returning id into _variant_id;

    if _init > 0 then
      insert into public.stock_movements (store_id, variant_id, type, quantity, unit_cost, reason, created_by)
      values (_store_id, _variant_id, 'initial', _init, _cost, 'Estoque inicial', _uid);
    end if;
    _i := _i + 1;
  end loop;
  return _product_id;
end $$;

revoke execute on function public.create_product_with_variants(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.create_product_with_variants(uuid, text, uuid, jsonb) to authenticated;


-- ===== Taxa da maquininha =====
alter table public.store_settings add column card_fees jsonb not null default '{"pix":0,"cash":0,"debit_card":0,"credit_card":0}'::jsonb
  check (jsonb_typeof(card_fees) = 'object');
grant update (card_fees) on public.store_settings to authenticated;
alter table public.sale_payments add column fee_amount numeric(12,2) not null default 0;

create or replace function public.set_payment_fee() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare _pct numeric;
begin
  select coalesce((card_fees->>(new.method::text))::numeric, 0) into _pct from public.store_settings where store_id = new.store_id;
  new.fee_amount := round(new.amount * greatest(least(coalesce(_pct, 0), 100), 0) / 100, 2);
  return new;
end $$;
revoke execute on function public.set_payment_fee() from public, anon, authenticated;
create trigger sale_payments_fee before insert on public.sale_payments for each row execute function public.set_payment_fee();

-- ===== Despesas (Pro) =====
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  description text not null check (length(btrim(description)) between 1 and 120),
  category text check (category is null or length(category) <= 60),
  amount numeric(12,2) not null check (amount > 0),
  spent_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index expenses_store_idx on public.expenses (store_id, spent_on desc);
alter table public.expenses enable row level security;
create policy expenses_select on public.expenses for select to authenticated
  using (public.has_store_role(store_id, array['owner','manager']::public.store_role[]));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.has_store_role(store_id, array['owner','manager']::public.store_role[]) and public.store_has_plan(store_id, 'pro'));
create policy expenses_update on public.expenses for update to authenticated
  using (public.has_store_role(store_id, array['owner','manager']::public.store_role[]) and public.store_has_plan(store_id, 'pro'))
  with check (public.has_store_role(store_id, array['owner','manager']::public.store_role[]));
create policy expenses_delete on public.expenses for delete to authenticated
  using (public.has_store_role(store_id, array['owner','manager']::public.store_role[]));

-- ===== Equipe: convites =====
create table public.store_invites (
  code text primary key default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  store_id uuid not null references public.stores(id) on delete cascade,
  role public.store_role not null check (role in ('manager', 'seller')),
  created_by uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users(id),
  used_at timestamptz
);
alter table public.store_invites enable row level security;
create policy store_invites_select on public.store_invites for select to authenticated
  using (public.has_store_role(store_id, array['owner']::public.store_role[]));

create or replace function public.plan_user_limit(_store_id uuid) returns int
 language sql stable security definer set search_path to 'public' as $$
  select case public.store_plan(_store_id) when 'start' then 1 when 'pro' then 3 else 1000 end;
$$;

create or replace function public.create_invite(_store_id uuid, _role public.store_role) returns text
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare _code text;
begin
  if not public.has_store_role(_store_id, array['owner']::public.store_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _role not in ('manager', 'seller') then raise exception 'invalid_role' using errcode = '22023'; end if;
  if (select count(*) from public.store_members where store_id = _store_id and active) >= public.plan_user_limit(_store_id) then
    raise exception 'plan_user_limit' using errcode = '42501';
  end if;
  insert into public.store_invites (store_id, role) values (_store_id, _role) returning code into _code;
  return _code;
end $$;

create or replace function public.get_invite(_code text) returns jsonb
 language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('store_name', s.name, 'role', i.role,
    'valid', i.used_at is null and i.expires_at > now())
  from public.store_invites i join public.stores s on s.id = i.store_id where i.code = _code;
$$;

create or replace function public.accept_invite(_code text) returns uuid
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare _uid uuid := auth.uid(); i public.store_invites%rowtype;
begin
  if _uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into i from public.store_invites where code = _code for update;
  if not found or i.used_at is not null or i.expires_at <= now() then raise exception 'invite_invalid' using errcode = '22023'; end if;
  if exists (select 1 from public.store_members where store_id = i.store_id and user_id = _uid and active) then
    update public.store_invites set used_by = _uid, used_at = now() where code = _code;
    return i.store_id;
  end if;
  if (select count(*) from public.store_members where store_id = i.store_id and active) >= public.plan_user_limit(i.store_id) then
    raise exception 'plan_user_limit' using errcode = '42501';
  end if;
  insert into public.profiles (id) values (_uid) on conflict (id) do nothing;
  insert into public.store_members (store_id, user_id, role, active) values (i.store_id, _uid, i.role, true)
  on conflict (store_id, user_id) do update set role = excluded.role, active = true;
  update public.store_invites set used_by = _uid, used_at = now() where code = _code;
  return i.store_id;
end $$;

create or replace function public.get_team(_store_id uuid)
 returns table(user_id uuid, full_name text, role public.store_role, active boolean, joined_at timestamptz)
 language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not public.has_store_role(_store_id, array['owner','manager']::public.store_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select m.user_id, p.full_name, m.role, m.active, m.created_at
    from public.store_members m left join public.profiles p on p.id = m.user_id
    where m.store_id = _store_id order by m.active desc, m.created_at;
end $$;

create or replace function public.set_member(_store_id uuid, _user_id uuid, _role public.store_role, _active boolean) returns void
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not public.has_store_role(_store_id, array['owner']::public.store_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _user_id = auth.uid() then raise exception 'cannot_change_self' using errcode = '22023'; end if;
  if _role = 'owner' then raise exception 'invalid_role' using errcode = '22023'; end if;
  if _active and not exists (select 1 from public.store_members where store_id = _store_id and user_id = _user_id and active)
     and (select count(*) from public.store_members where store_id = _store_id and active) >= public.plan_user_limit(_store_id) then
    raise exception 'plan_user_limit' using errcode = '42501';
  end if;
  update public.store_members set role = _role, active = _active where store_id = _store_id and user_id = _user_id and role <> 'owner';
end $$;

-- ===== Catálogo online (Pro) =====
alter table public.stores
  add column slug text unique check (slug is null or slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$'),
  add column catalog_enabled boolean not null default false,
  add column catalog_whatsapp text check (catalog_whatsapp is null or length(catalog_whatsapp) <= 20),
  add column catalog_about text check (catalog_about is null or length(catalog_about) <= 300);
alter table public.products add column image_url text check (image_url is null or length(image_url) <= 500);
grant update (image_url) on public.products to authenticated;

create or replace function public.update_catalog(_store_id uuid, _enabled boolean, _slug text, _whatsapp text, _about text) returns void
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not public.has_store_role(_store_id, array['owner','manager']::public.store_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _enabled and not public.store_has_plan(_store_id, 'pro') then raise exception 'plan_required:pro' using errcode = '42501'; end if;
  if _slug is not null and exists (select 1 from public.stores where slug = lower(btrim(_slug)) and id <> _store_id) then
    raise exception 'slug_taken' using errcode = '23505';
  end if;
  update public.stores set catalog_enabled = coalesce(_enabled, false), slug = nullif(lower(btrim(_slug)), ''),
    catalog_whatsapp = nullif(regexp_replace(coalesce(_whatsapp, ''), '\D', '', 'g'), ''), catalog_about = nullif(btrim(_about), '')
  where id = _store_id;
end $$;

-- Público (sem login): vitrine da loja
create or replace function public.get_public_catalog(_slug text) returns jsonb
 language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'store', jsonb_build_object('name', s.name, 'whatsapp', s.catalog_whatsapp, 'about', s.catalog_about),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'image_url', p.image_url,
        'category', (select c.name from public.categories c where c.id = p.category_id),
        'variants', (select jsonb_agg(jsonb_build_object('id', v.id, 'attributes', v.attributes, 'price', v.sale_price, 'available', v.stock_quantity > 0)
                     order by v.is_default desc, v.created_at) from public.product_variants v where v.product_id = p.id and v.active and v.sale_price > 0)
      ) order by p.name)
      from public.products p where p.store_id = s.id and p.active
        and exists (select 1 from public.product_variants v where v.product_id = p.id and v.active and v.sale_price > 0)), '[]'::jsonb))
  from public.stores s
  where s.slug = lower(_slug) and s.catalog_enabled and public.store_has_plan(s.id, 'pro');
$$;

-- Fotos dos produtos: bucket público, só dono/gerente da loja envia (pasta = id da loja)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produtos', 'produtos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy produtos_fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'produtos' and public.has_store_role(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.store_role[]));
create policy produtos_fotos_update on storage.objects for update to authenticated
  using (bucket_id = 'produtos' and public.has_store_role(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.store_role[]));
create policy produtos_fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'produtos' and public.has_store_role(((storage.foldername(name))[1])::uuid, array['owner','manager']::public.store_role[]));

-- Variação avulsa também exige Pro
create or replace function public.create_variant(_product_id uuid, _sku text default null, _attributes jsonb default '{}'::jsonb, _unit_cost numeric default 0,
  _sale_price numeric default 0, _initial_stock numeric default 0, _min_stock numeric default 0)
 returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare _uid uuid := auth.uid(); _store_id uuid; _variant_id uuid;
begin
  if _uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select store_id into _store_id from public.products where id = _product_id;
  if _store_id is null or not public.has_store_role(_store_id, array['owner','manager']::public.store_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not public.store_has_plan(_store_id, 'pro') then raise exception 'plan_required:pro' using errcode = '42501'; end if;
  if coalesce(_initial_stock, 0) < 0 then raise exception 'invalid_initial_stock' using errcode = '22023'; end if;
  insert into public.product_variants (store_id, product_id, sku, attributes, unit_cost, sale_price, min_stock)
  values (_store_id, _product_id, nullif(btrim(_sku), ''), coalesce(_attributes,'{}'::jsonb), coalesce(_unit_cost,0), coalesce(_sale_price,0), coalesce(_min_stock,0))
  returning id into _variant_id;
  if coalesce(_initial_stock, 0) > 0 then
    insert into public.stock_movements (store_id, variant_id, type, quantity, unit_cost, reason, created_by)
    values (_store_id, _variant_id, 'initial', _initial_stock, coalesce(_unit_cost,0), 'Estoque inicial', _uid);
  end if;
  return _variant_id;
end; $function$;

drop function if exists public.admin_stores();
create function public.admin_stores()
 returns table(store_id uuid, store_name text, owner_name text, owner_email text, owner_phone text, created_at timestamptz,
               status public.subscription_status, plan public.plan_tier, trial_ends_at timestamptz, current_period_end timestamptz, monthly_price numeric, notes text,
               members bigint, products bigint, sales_30d bigint, gmv_30d numeric, last_sale_at timestamptz, last_payment_at timestamptz, paid_total numeric,
               segment text, onboarding jsonb)
 language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select s.id, s.name,
    (select p.full_name from public.store_members m join public.profiles p on p.id = m.user_id where m.store_id = s.id and m.role = 'owner' order by m.created_at limit 1),
    (select u.email::text from public.store_members m join auth.users u on u.id = m.user_id where m.store_id = s.id and m.role = 'owner' order by m.created_at limit 1),
    (select u.phone::text from public.store_members m join auth.users u on u.id = m.user_id where m.store_id = s.id and m.role = 'owner' order by m.created_at limit 1),
    s.created_at, ss.status, ss.plan, ss.trial_ends_at, ss.current_period_end, ss.monthly_price, ss.notes,
    (select count(*) from public.store_members m where m.store_id = s.id and m.active),
    (select count(*) from public.products p where p.store_id = s.id and p.active),
    (select count(*) from public.sales x where x.store_id = s.id and x.status = 'completed' and x.sold_at > now() - interval '30 days'),
    (select coalesce(sum(x.total), 0) from public.sales x where x.store_id = s.id and x.status = 'completed' and x.sold_at > now() - interval '30 days'),
    (select max(x.sold_at) from public.sales x where x.store_id = s.id and x.status = 'completed'),
    (select max(pp.paid_at) from public.platform_payments pp where pp.store_id = s.id),
    (select coalesce(sum(pp.amount), 0) from public.platform_payments pp where pp.store_id = s.id),
    s.segment, s.onboarding
  from public.stores s left join public.store_subscriptions ss on ss.store_id = s.id
  order by s.created_at desc;
end $$;
revoke execute on function public.admin_stores() from public, anon;
grant execute on function public.admin_stores() to authenticated;


-- ===== Permissões =====
revoke execute on function public.store_plan(uuid) from public, anon;
revoke execute on function public.store_has_plan(uuid, public.plan_tier) from public, anon;
revoke execute on function public.plan_user_limit(uuid) from public, anon;
revoke execute on function public.admin_update_subscription(uuid, public.subscription_status, public.plan_tier, timestamptz, timestamptz, numeric, text) from public, anon;
revoke execute on function public.admin_update_settings(int, numeric, numeric, numeric, text) from public, anon;
revoke execute on function public.create_invite(uuid, public.store_role) from public, anon;
revoke execute on function public.get_invite(text) from public, anon;
revoke execute on function public.accept_invite(text) from public, anon;
revoke execute on function public.get_team(uuid) from public, anon;
revoke execute on function public.set_member(uuid, uuid, public.store_role, boolean) from public, anon;
revoke execute on function public.update_catalog(uuid, boolean, text, text, text) from public, anon;
revoke execute on function public.create_variant(uuid, text, jsonb, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.store_plan(uuid) to authenticated;
grant execute on function public.store_has_plan(uuid, public.plan_tier) to authenticated;
grant execute on function public.plan_user_limit(uuid) to authenticated;
grant execute on function public.admin_update_subscription(uuid, public.subscription_status, public.plan_tier, timestamptz, timestamptz, numeric, text) to authenticated;
grant execute on function public.admin_update_settings(int, numeric, numeric, numeric, text) to authenticated;
grant execute on function public.create_invite(uuid, public.store_role) to authenticated;
grant execute on function public.get_invite(text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.get_team(uuid) to authenticated;
grant execute on function public.set_member(uuid, uuid, public.store_role, boolean) to authenticated;
grant execute on function public.update_catalog(uuid, boolean, text, text, text) to authenticated;
grant execute on function public.create_variant(uuid, text, jsonb, numeric, numeric, numeric, numeric) to authenticated;
-- A vitrine é pública
grant execute on function public.get_public_catalog(text) to anon, authenticated;
