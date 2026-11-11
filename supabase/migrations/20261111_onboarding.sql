-- Onboarding: quiz inicial, tema de cores e tutorial (por usuário); perfil da loja (por loja)

alter table public.profiles
  add column onboarding_completed_at timestamptz,
  add column theme text not null default 'nexo' check (theme in ('nexo', 'noir', 'oceano', 'esmeralda', 'rose')),
  add column tour jsonb not null default '{}'::jsonb check (jsonb_typeof(tour) = 'object');

alter table public.stores
  add column segment text check (segment is null or length(segment) <= 60),
  add column onboarding jsonb check (onboarding is null or jsonb_typeof(onboarding) = 'object');

-- Conclui o quiz. Sem loja: cria a loja (o usuário vira dono). Com loja: atualiza (só o dono).
create or replace function public.complete_onboarding(_store_id uuid, _store_name text, _owner_name text, _answers jsonb)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare _uid uuid := auth.uid(); _id uuid := _store_id;
begin
  if _uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if _store_name is null or length(btrim(_store_name)) = 0 then raise exception 'store_name_required' using errcode = '22023'; end if;
  if _answers is not null and (jsonb_typeof(_answers) <> 'object' or length(_answers::text) > 4000) then raise exception 'invalid_answers' using errcode = '22023'; end if;

  if _id is null then
    _id := public.create_store(_store_name, null);
  elsif not public.has_store_role(_id, array['owner']::public.store_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.stores
     set name = left(btrim(_store_name), 120),
         segment = left(nullif(btrim(_answers->>'segmento'), ''), 60),
         onboarding = coalesce(_answers, '{}'::jsonb) || jsonb_build_object('respondido_em', now())
   where id = _id;

  insert into public.profiles (id) values (_uid) on conflict (id) do nothing;
  update public.profiles
     set full_name = coalesce(nullif(left(btrim(_owner_name), 120), ''), full_name),
         onboarding_completed_at = now()
   where id = _uid;
  return _id;
end $$;

-- Quem não é dono (vendedor/gerente) só marca o onboarding como feito
create or replace function public.skip_onboarding() returns void
 language sql security definer set search_path to 'public' as $$
  update public.profiles set onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = auth.uid();
$$;

revoke execute on function public.complete_onboarding(uuid, text, text, jsonb) from public, anon;
revoke execute on function public.skip_onboarding() from public, anon;
grant execute on function public.complete_onboarding(uuid, text, text, jsonb) to authenticated;
grant execute on function public.skip_onboarding() to authenticated;

-- Admin: mostrar segmento e faturamento informado no quiz
drop function if exists public.admin_stores();
create function public.admin_stores()
 returns table(store_id uuid, store_name text, owner_name text, owner_email text, owner_phone text, created_at timestamptz,
               status public.subscription_status, trial_ends_at timestamptz, current_period_end timestamptz, monthly_price numeric, notes text,
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
    s.created_at, ss.status, ss.trial_ends_at, ss.current_period_end, ss.monthly_price, ss.notes,
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

-- profiles usa permissão por coluna (só full_name). O usuário também pode mudar o próprio tema e o progresso do tutorial.
grant update (theme, tour) on public.profiles to authenticated;
