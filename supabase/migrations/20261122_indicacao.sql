-- Indique e ganhe (versão 1, 22/11/2026)
-- Cada loja tem um código. Quem cria a loja por um link com ?ref=CODIGO ganha
-- teste maior (platform_settings.referral_trial_days, padrão 14) e a indicação fica
-- registrada em store_referrals. O prêmio de quem indica (dias grátis quando o indicado
-- pagar) ainda NÃO está ligado: os campos reward_* já existem para a versão 2.

alter table public.platform_settings add column if not exists referral_trial_days int not null default 14
  check (referral_trial_days between 1 and 90);

alter table public.stores add column if not exists referral_code text unique
  check (referral_code ~ '^[A-Z2-9]{6}$');

create or replace function public.gerar_codigo_indicacao()
 returns text language plpgsql volatile set search_path to 'public', 'pg_temp'
as $$
declare _alfa text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; _c text; _i int;
begin
  loop
    _c := '';
    for _i in 1..6 loop _c := _c || substr(_alfa, 1 + floor(random() * length(_alfa))::int, 1); end loop;
    exit when not exists (select 1 from public.stores where referral_code = _c);
  end loop;
  return _c;
end $$;
revoke execute on function public.gerar_codigo_indicacao() from public, anon, authenticated;

update public.stores set referral_code = public.gerar_codigo_indicacao() where referral_code is null;

create or replace function public.stores_set_referral_code()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$ begin
  if new.referral_code is null then new.referral_code := public.gerar_codigo_indicacao(); end if;
  return new;
end $$;
drop trigger if exists stores_referral_code on public.stores;
create trigger stores_referral_code before insert on public.stores for each row execute function public.stores_set_referral_code();

create table public.store_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_store_id uuid not null references public.stores(id) on delete cascade,
  referred_store_id uuid not null unique references public.stores(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  reward_status text not null default 'pendente' check (reward_status in ('pendente', 'liberado', 'negado')),
  reward_days int,
  rewarded_at timestamptz,
  check (referrer_store_id <> referred_store_id)
);
create index store_referrals_referrer_idx on public.store_referrals (referrer_store_id, created_at desc);
alter table public.store_referrals enable row level security;
-- leitura só pelas funções abaixo (o indicador vê nome e situação, nada além)
revoke all on public.store_referrals from anon, authenticated;

-- Página pública: nome da loja que indicou e dias de teste
create or replace function public.get_referral_info(_code text)
 returns json language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select json_build_object('store', s.name, 'trial_days', (select referral_trial_days from public.platform_settings where id))
  from public.stores s where s.referral_code = upper(btrim(_code));
$$;
revoke execute on function public.get_referral_info(text) from public;
grant execute on function public.get_referral_info(text) to anon, authenticated;

-- Criar loja agora aceita o código de indicação
drop function if exists public.create_store(text, text);
create or replace function public.create_store(_name text, _document text default null, _ref text default null)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  _uid uuid := auth.uid();
  _store_id uuid;
  _referrer uuid;
  _dias int;
begin
  if _uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if _name is null or length(btrim(_name)) = 0 then raise exception 'store_name_required' using errcode = '22023'; end if;

  insert into public.profiles (id) values (_uid) on conflict (id) do nothing;

  insert into public.stores (name, document, created_by)
  values (btrim(_name), nullif(btrim(_document), ''), _uid)
  returning id into _store_id;

  insert into public.store_settings (store_id) values (_store_id);
  insert into public.store_members (store_id, user_id, role) values (_store_id, _uid, 'owner');

  -- indicação: código válido, de outra loja da qual a pessoa não faz parte
  if _ref is not null and length(btrim(_ref)) > 0 then
    select s.id into _referrer from public.stores s where s.referral_code = upper(btrim(_ref));
    if _referrer is not null and _referrer <> _store_id
       and not exists (select 1 from public.store_members m where m.store_id = _referrer and m.user_id = _uid) then
      insert into public.store_referrals (referrer_store_id, referred_store_id, code)
      values (_referrer, _store_id, upper(btrim(_ref))) on conflict (referred_store_id) do nothing;
      select referral_trial_days into _dias from public.platform_settings where id;
      update public.store_subscriptions
         set trial_ends_at = greatest(trial_ends_at, now() + make_interval(days => coalesce(_dias, 14)))
       where store_id = _store_id and status = 'trial';
    end if;
  end if;

  return _store_id;
end; $function$;
revoke execute on function public.create_store(text, text, text) from public, anon;
grant execute on function public.create_store(text, text, text) to authenticated;

-- Tela "Indique e ganhe": código da loja e lojas indicadas (dono e gerente)
create or replace function public.get_my_referrals(_store_id uuid)
 returns json language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
declare _code text;
begin
  if auth.uid() is null or not public.has_store_role(_store_id, array['owner','manager']::public.store_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select referral_code into _code from public.stores where id = _store_id;
  return json_build_object(
    'code', _code,
    'trial_days', (select referral_trial_days from public.platform_settings where id),
    'referrals', coalesce((
      select json_agg(json_build_object(
        'store', s.name,
        'created_at', r.created_at,
        'status', case
          when ss.status = 'active' then 'assinou'
          when ss.status = 'trial' and ss.trial_ends_at > now() then 'testando'
          when ss.status = 'free' then 'testando'
          else 'nao_assinou' end,
        'reward_status', r.reward_status,
        'reward_days', r.reward_days
      ) order by r.created_at desc)
      from public.store_referrals r
      join public.stores s on s.id = r.referred_store_id
      left join public.store_subscriptions ss on ss.store_id = r.referred_store_id
      where r.referrer_store_id = _store_id), '[]'::json)
  );
end $$;
revoke execute on function public.get_my_referrals(uuid) from public, anon;
grant execute on function public.get_my_referrals(uuid) to authenticated;
