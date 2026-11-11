-- Painel do dono da plataforma (administração do NEXO)
-- Assinaturas por loja, período de teste, pagamentos manuais e indicadores.

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security; -- sem políticas: só funções security definer leem

create table public.platform_settings (
  id boolean primary key default true check (id),
  default_trial_days int not null default 30 check (default_trial_days between 0 and 365),
  default_monthly_price numeric(12,2) check (default_monthly_price is null or default_monthly_price >= 0),
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (true);
alter table public.platform_settings enable row level security;

create type public.subscription_status as enum ('trial', 'active', 'past_due', 'canceled', 'free');

create table public.store_subscriptions (
  store_id uuid primary key references public.stores(id) on delete cascade,
  status public.subscription_status not null default 'trial',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  monthly_price numeric(12,2) check (monthly_price is null or monthly_price >= 0),
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger store_subscriptions_updated_at before update on public.store_subscriptions for each row execute function public.set_updated_at();
alter table public.store_subscriptions enable row level security;

create table public.platform_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('pix', 'cash', 'card', 'transfer', 'other')),
  months int not null default 1 check (months between 1 and 24),
  note text check (note is null or length(note) <= 300),
  paid_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id)
);
create index platform_payments_store_idx on public.platform_payments (store_id, paid_at desc);
alter table public.platform_payments enable row level security;

create or replace function public.is_platform_admin() returns boolean
 language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- Toda loja nova nasce em teste
create or replace function public.create_store_subscription() returns trigger
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare _dias int;
begin
  select default_trial_days into _dias from public.platform_settings where id;
  insert into public.store_subscriptions (store_id, status, trial_ends_at, monthly_price)
  values (new.id, 'trial', now() + make_interval(days => coalesce(_dias, 30)), (select default_monthly_price from public.platform_settings where id))
  on conflict (store_id) do nothing;
  return new;
end $$;
create trigger stores_create_subscription after insert on public.stores for each row execute function public.create_store_subscription();

insert into public.store_subscriptions (store_id, status, trial_ends_at, created_at)
select s.id, 'trial', s.created_at + interval '30 days', s.created_at from public.stores s
on conflict (store_id) do nothing;

-- Lojista: situação da própria loja (para o aviso de teste)
create or replace function public.get_my_subscription(_store_id uuid) returns jsonb
 language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare r jsonb;
begin
  if not public.is_store_member(_store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object('status', status, 'trial_ends_at', trial_ends_at, 'current_period_end', current_period_end, 'monthly_price', monthly_price)
    into r from public.store_subscriptions where store_id = _store_id;
  return r;
end $$;

-- Admin: indicadores gerais
create or replace function public.admin_overview() returns jsonb
 language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare r jsonb; _ini_mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'users', (select count(*) from auth.users),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'stores', (select count(*) from public.stores),
    'stores_30d', (select count(*) from public.stores where created_at > now() - interval '30 days'),
    'active_7d', (select count(distinct store_id) from public.sales where status = 'completed' and sold_at > now() - interval '7 days'),
    'trial', (select count(*) from public.store_subscriptions where status = 'trial' and (trial_ends_at is null or trial_ends_at > now())),
    'trial_expired', (select count(*) from public.store_subscriptions where status = 'trial' and trial_ends_at <= now()),
    'paying', (select count(*) from public.store_subscriptions where status = 'active'),
    'past_due', (select count(*) from public.store_subscriptions where status = 'past_due' or (status = 'active' and current_period_end < now())),
    'free', (select count(*) from public.store_subscriptions where status = 'free'),
    'canceled', (select count(*) from public.store_subscriptions where status = 'canceled'),
    'mrr', (select coalesce(sum(monthly_price), 0) from public.store_subscriptions where status = 'active'),
    'received_month', (select coalesce(sum(amount), 0) from public.platform_payments where paid_at >= _ini_mes),
    'received_total', (select coalesce(sum(amount), 0) from public.platform_payments),
    'gmv_30d', (select coalesce(sum(total), 0) from public.sales where status = 'completed' and sold_at > now() - interval '30 days'),
    'sales_30d', (select count(*) from public.sales where status = 'completed' and sold_at > now() - interval '30 days'),
    'settings', (select to_jsonb(ps) - 'id' from public.platform_settings ps where id)
  ) into r;
  return r;
end $$;

-- Admin: lista de lojas
create or replace function public.admin_stores()
 returns table(store_id uuid, store_name text, owner_name text, owner_email text, owner_phone text, created_at timestamptz,
               status public.subscription_status, trial_ends_at timestamptz, current_period_end timestamptz, monthly_price numeric, notes text,
               members bigint, products bigint, sales_30d bigint, gmv_30d numeric, last_sale_at timestamptz, last_payment_at timestamptz, paid_total numeric)
 language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select s.id, s.name,
    (select p.full_name from public.store_members m join public.profiles p on p.id = m.user_id where m.store_id = s.id and m.role = 'owner' order by m.created_at limit 1),
    (select u.email::text from public.store_members m join auth.users u on u.id = m.user_id where m.store_id = s.id and m.role = 'owner' order by m.created_at limit 1),
    (select u.phone::text from public.store_members m join auth.users u on u.id = m.user_id where m.store_id = s.id and m.role = 'owner' order by m.created_at limit 1),
    s.created_at, ss.status, ss.trial_ends_at, ss.current_period_end, ss.monthly_price, ss.notes,
    (select count(*) from public.store_members m where m.store_id = s.id and m.active),
    (select count(*) from public.products p where p.store_id = s.id and p.active),
    (select count(*) from public.sales x where x.store_id = s.id and x.status = 'completed' and x.sold_at > now() - interval '30 days'),
    (select coalesce(sum(x.total), 0) from public.sales x where x.store_id = s.id and x.status = 'completed' and x.sold_at > now() - interval '30 days'),
    (select max(x.sold_at) from public.sales x where x.store_id = s.id and x.status = 'completed'),
    (select max(pp.paid_at) from public.platform_payments pp where pp.store_id = s.id),
    (select coalesce(sum(pp.amount), 0) from public.platform_payments pp where pp.store_id = s.id)
  from public.stores s left join public.store_subscriptions ss on ss.store_id = s.id
  order by s.created_at desc;
end $$;

create or replace function public.admin_update_subscription(_store_id uuid, _status public.subscription_status, _trial_ends_at timestamptz,
  _current_period_end timestamptz, _monthly_price numeric, _notes text) returns void
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.store_subscriptions (store_id, status, trial_ends_at, current_period_end, monthly_price, notes)
  values (_store_id, _status, _trial_ends_at, _current_period_end, _monthly_price, nullif(btrim(_notes), ''))
  on conflict (store_id) do update set status = excluded.status, trial_ends_at = excluded.trial_ends_at,
    current_period_end = excluded.current_period_end, monthly_price = excluded.monthly_price, notes = excluded.notes;
end $$;

-- Registra pagamento manual: ativa a assinatura e estende o período
create or replace function public.admin_register_payment(_store_id uuid, _amount numeric, _method text, _months int, _note text) returns uuid
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare _id uuid; _base timestamptz;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.platform_payments (store_id, amount, method, months, note, created_by)
  values (_store_id, _amount, _method, coalesce(_months, 1), nullif(btrim(_note), ''), auth.uid()) returning id into _id;
  select greatest(coalesce(current_period_end, now()), now()) into _base from public.store_subscriptions where store_id = _store_id;
  update public.store_subscriptions
     set status = 'active', current_period_end = coalesce(_base, now()) + make_interval(months => coalesce(_months, 1)),
         monthly_price = coalesce(monthly_price, round(_amount / coalesce(_months, 1), 2))
   where store_id = _store_id;
  return _id;
end $$;

create or replace function public.admin_store_payments(_store_id uuid)
 returns table(id uuid, amount numeric, method text, months int, note text, paid_at timestamptz)
 language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select p.id, p.amount, p.method, p.months, p.note, p.paid_at from public.platform_payments p where p.store_id = _store_id order by p.paid_at desc;
end $$;

create or replace function public.admin_update_settings(_default_trial_days int, _default_monthly_price numeric) returns void
 language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.platform_settings set default_trial_days = _default_trial_days, default_monthly_price = _default_monthly_price, updated_at = now() where id;
end $$;

revoke execute on function public.create_store_subscription() from public, anon, authenticated;
revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.get_my_subscription(uuid) from public, anon;
revoke execute on function public.admin_overview() from public, anon;
revoke execute on function public.admin_stores() from public, anon;
revoke execute on function public.admin_update_subscription(uuid, public.subscription_status, timestamptz, timestamptz, numeric, text) from public, anon;
revoke execute on function public.admin_register_payment(uuid, numeric, text, int, text) from public, anon;
revoke execute on function public.admin_store_payments(uuid) from public, anon;
revoke execute on function public.admin_update_settings(int, numeric) from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.get_my_subscription(uuid) to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_stores() to authenticated;
grant execute on function public.admin_update_subscription(uuid, public.subscription_status, timestamptz, timestamptz, numeric, text) to authenticated;
grant execute on function public.admin_register_payment(uuid, numeric, text, int, text) to authenticated;
grant execute on function public.admin_store_payments(uuid) to authenticated;
grant execute on function public.admin_update_settings(int, numeric) to authenticated;

-- Dono da plataforma: a conta real do Mat (a única que não é a conta de teste no momento da migração)
insert into public.platform_admins (user_id)
select id from auth.users where email <> 'teste.claude@nexo.test' order by created_at limit 1
on conflict do nothing;

-- Loja de teste interno não conta como cliente
update public.store_subscriptions ss set status = 'free', notes = 'Teste interno do Claude'
from public.store_members m join auth.users u on u.id = m.user_id
where m.store_id = ss.store_id and u.email = 'teste.claude@nexo.test';
