-- Notificações push para o admin da plataforma (Mat), 22/11/2026.
-- Eventos: loja nova, assinatura nova (status vira active) e pagamento recebido.
-- O banco chama a Edge Function `notificar` via pg_net (assíncrono, não trava o cadastro).
-- Chaves VAPID e token ficam em platform_secrets (VAPID_PUBLIC, VAPID_PRIVATE, NOTIFY_TOKEN).

create extension if not exists pg_net;

create table public.admin_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) < 1000),
  p256dh text not null check (length(p256dh) < 200),
  auth text not null check (length(auth) < 100),
  user_agent text check (user_agent is null or length(user_agent) < 400),
  created_at timestamptz not null default now()
);
alter table public.admin_push_subscriptions enable row level security;
revoke all on public.admin_push_subscriptions from anon, authenticated;

create or replace function public.admin_push_public_key()
 returns text language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$ begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select value from public.platform_secrets where name = 'VAPID_PUBLIC');
end $$;

create or replace function public.admin_save_push(_endpoint text, _p256dh text, _auth text, _user_agent text default null)
 returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$ begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into public.admin_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), _endpoint, _p256dh, _auth, left(_user_agent, 390))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
end $$;

create or replace function public.admin_remove_push(_endpoint text)
 returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$ begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.admin_push_subscriptions where endpoint = _endpoint;
end $$;

create or replace function public.admin_push_count()
 returns int language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$ begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select count(*) from public.admin_push_subscriptions);
end $$;

revoke execute on function public.admin_push_public_key() from public, anon;
revoke execute on function public.admin_save_push(text, text, text, text) from public, anon;
revoke execute on function public.admin_remove_push(text) from public, anon;
revoke execute on function public.admin_push_count() from public, anon;
grant execute on function public.admin_push_public_key() to authenticated;
grant execute on function public.admin_save_push(text, text, text, text) to authenticated;
grant execute on function public.admin_remove_push(text) to authenticated;
grant execute on function public.admin_push_count() to authenticated;

-- Envia para a Edge Function (só se houver alguém inscrito)
create or replace function public.notificar_admin(_titulo text, _corpo text, _url text default '/admin')
 returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare _token text;
begin
  if not exists (select 1 from public.admin_push_subscriptions) then return; end if;
  select value into _token from public.platform_secrets where name = 'NOTIFY_TOKEN';
  if _token is null then return; end if;
  perform net.http_post(
    url := 'https://mdnbpxwibkvxuzezobss.supabase.co/functions/v1/notificar',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-komando-token', _token),
    body := jsonb_build_object('titulo', _titulo, 'corpo', _corpo, 'url', _url)
  );
exception when others then
  null; -- aviso nunca pode quebrar cadastro nem pagamento
end $$;
revoke execute on function public.notificar_admin(text, text, text) from public, anon, authenticated;

-- Loja nova (no fim da transação, para já enxergar a indicação)
create or replace function public.trg_notificar_loja_nova()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare _ind text; _dono text;
begin
  select s.name into _ind from public.store_referrals r join public.stores s on s.id = r.referrer_store_id where r.referred_store_id = new.id;
  select coalesce(p.full_name, u.email) into _dono from auth.users u left join public.profiles p on p.id = u.id where u.id = new.created_by;
  perform public.notificar_admin('🆕 Nova loja no Komando',
    new.name || coalesce(' · ' || _dono, '') || coalesce(' · indicada por ' || _ind, ''), '/admin');
  return null;
end $$;
drop trigger if exists stores_notificar_admin on public.stores;
create constraint trigger stores_notificar_admin after insert on public.stores
  deferrable initially deferred for each row execute function public.trg_notificar_loja_nova();

-- Assinatura nova (status passa a active)
create or replace function public.trg_notificar_assinatura()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare _loja text;
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    select name into _loja from public.stores where id = new.store_id;
    perform public.notificar_admin('💜 Nova assinatura', coalesce(_loja, 'Loja') || ' · plano ' || initcap(coalesce(new.plan::text, 'start')), '/admin');
  end if;
  return null;
end $$;
drop trigger if exists store_subscriptions_notificar_admin on public.store_subscriptions;
create trigger store_subscriptions_notificar_admin after update of status on public.store_subscriptions
  for each row execute function public.trg_notificar_assinatura();

-- Pagamento recebido
create or replace function public.trg_notificar_pagamento()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare _loja text;
begin
  select name into _loja from public.stores where id = new.store_id;
  perform public.notificar_admin('💰 Pagamento recebido',
    'R$ ' || replace(to_char(new.amount, 'FM999999990.00'), '.', ',') || ' · ' || coalesce(_loja, 'Loja'), '/admin');
  return null;
end $$;
drop trigger if exists platform_payments_notificar_admin on public.platform_payments;
create trigger platform_payments_notificar_admin after insert on public.platform_payments
  for each row execute function public.trg_notificar_pagamento();
