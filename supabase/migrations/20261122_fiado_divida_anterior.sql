-- Fiado: dívida anterior (saldo que o cliente já devia antes do Komando, ex.: caderno).
-- Entra no saldo, no extrato e na cobrança do cliente, mas NÃO é venda:
-- não conta em faturamento, lucro, caixa nem estoque.
-- Só dono e gerente lançam ou excluem. Excluir é lógico (canceled_at) e só vale
-- se o saldo do cliente não ficar negativo (se já houve pagamento, não exclui).
-- Também corrige receive_customer_payment, que não descontava vales de devolução do saldo.

create table public.customer_opening_debts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  customer_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  note text check (note is null or length(note) <= 300),
  occurred_at timestamptz not null default now(),
  idempotency_key uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  canceled_at timestamptz,
  canceled_by uuid references auth.users(id),
  foreign key (store_id, customer_id) references public.customers (store_id, id),
  unique (store_id, idempotency_key)
);
create index customer_opening_debts_customer_idx on public.customer_opening_debts (store_id, customer_id, occurred_at);
alter table public.customer_opening_debts enable row level security;
create policy customer_opening_debts_select on public.customer_opening_debts for select to authenticated using (public.is_store_member(store_id));
-- sem políticas de insert/update/delete: só pelas funções abaixo
revoke insert, update, delete on public.customer_opening_debts from anon, authenticated;

-- Saldo de um cliente (compras fiado + dívidas anteriores − pagamentos − vales de devolução)
create or replace function public.customer_balance(_store uuid, _customer uuid)
 returns numeric language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce((select sum(sp.amount) from public.sales s join public.sale_payments sp on sp.sale_id = s.id and sp.store_id = s.store_id
                   where s.store_id = _store and s.customer_id = _customer and s.status = 'completed' and sp.method = 'fiado'), 0)
       + coalesce((select sum(amount) from public.customer_opening_debts where store_id = _store and customer_id = _customer and canceled_at is null), 0)
       - coalesce((select sum(amount) from public.customer_payments where store_id = _store and customer_id = _customer), 0)
       - coalesce((select sum(refund_amount) from public.sale_returns where store_id = _store and customer_id = _customer and refund_method = 'credit'), 0);
$$;
revoke execute on function public.customer_balance(uuid, uuid) from public, anon, authenticated;

create or replace function public.add_customer_opening_debt(_customer_id uuid, _amount numeric, _idempotency_key uuid,
  _note text default null, _occurred_on date default null)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare _uid uuid := auth.uid(); _store uuid; _existing public.customer_opening_debts%rowtype; _id uuid; _quando timestamptz;
begin
  if _uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select store_id into _store from public.customers where id = _customer_id;
  if _store is null or not public.has_store_role(_store, array['owner','manager']::public.store_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _idempotency_key is null then raise exception 'idempotency_key_required' using errcode = '22023'; end if;
  if _amount is null or _amount <= 0 or _amount > 1000000 or _amount <> round(_amount, 2) then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if _occurred_on is not null and (_occurred_on > (now() at time zone 'America/Sao_Paulo')::date or _occurred_on < date '2000-01-01') then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  _quando := case when _occurred_on is null or _occurred_on = (now() at time zone 'America/Sao_Paulo')::date then now()
                  else (_occurred_on::timestamp + time '12:00') at time zone 'America/Sao_Paulo' end;

  perform pg_advisory_xact_lock(hashtextextended('customer:' || _customer_id::text, 0));
  select * into _existing from public.customer_opening_debts where store_id = _store and idempotency_key = _idempotency_key;
  if found then
    if _existing.customer_id <> _customer_id or _existing.amount <> _amount then raise exception 'idempotency_key_reused' using errcode = '23505'; end if;
    return _existing.id;
  end if;

  insert into public.customer_opening_debts (store_id, customer_id, amount, note, occurred_at, idempotency_key, created_by)
  values (_store, _customer_id, _amount, nullif(btrim(_note), ''), _quando, _idempotency_key, _uid) returning id into _id;
  return _id;
end $$;

create or replace function public.cancel_customer_opening_debt(_id uuid)
 returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare _uid uuid := auth.uid(); _d public.customer_opening_debts%rowtype;
begin
  if _uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into _d from public.customer_opening_debts where id = _id;
  if not found or not public.has_store_role(_d.store_id, array['owner','manager']::public.store_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('customer:' || _d.customer_id::text, 0));
  select * into _d from public.customer_opening_debts where id = _id;
  if _d.canceled_at is not null then return; end if;
  if public.customer_balance(_d.store_id, _d.customer_id) - _d.amount < 0 then raise exception 'debt_already_paid' using errcode = '22023'; end if;
  update public.customer_opening_debts set canceled_at = now(), canceled_by = _uid where id = _id;
end $$;

-- Recebimento: saldo agora considera dívidas anteriores e vales de devolução
create or replace function public.receive_customer_payment(_customer_id uuid, _amount numeric, _method sale_payment_method, _idempotency_key uuid, _note text default null)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare _uid uuid := auth.uid(); _store uuid; _balance numeric; _existing public.customer_payments%rowtype; _id uuid;
begin
  if _uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select store_id into _store from public.customers where id = _customer_id;
  if _store is null or not public.is_store_member(_store) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _idempotency_key is null then raise exception 'idempotency_key_required' using errcode = '22023'; end if;
  if _amount is null or _amount <= 0 or _amount <> round(_amount, 2) then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if _method is null or _method = 'fiado' then raise exception 'invalid_payment' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('customer:' || _customer_id::text, 0));
  select * into _existing from public.customer_payments where store_id = _store and idempotency_key = _idempotency_key;
  if found then
    if _existing.customer_id <> _customer_id or _existing.amount <> _amount then raise exception 'idempotency_key_reused' using errcode = '23505'; end if;
    return _existing.id;
  end if;

  _balance := public.customer_balance(_store, _customer_id);
  if _amount > _balance then raise exception 'amount_exceeds_balance' using errcode = '22023'; end if;

  insert into public.customer_payments (store_id, customer_id, amount, method, note, idempotency_key, created_by)
  values (_store, _customer_id, _amount, _method, nullif(btrim(_note), ''), _idempotency_key, _uid) returning id into _id;
  return _id;
end $function$;

-- Saldos: dívidas anteriores entram como cobrança (na data informada)
create or replace function public.get_customer_balances(_store_id uuid)
 returns table(customer_id uuid, name text, phone text, active boolean, charged numeric, paid numeric, balance numeric, oldest_open_at timestamptz, due_at timestamptz)
 language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare _days int;
begin
  if auth.uid() is null or not public.is_store_member(_store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(default_credit_days, 30) into _days from public.store_settings where store_id = _store_id;
  _days := coalesce(_days, 30);
  return query
  with base as (
    select s.customer_id, s.sold_at as quando, s.id as ref, sp.amount
    from public.sales s join public.sale_payments sp on sp.sale_id = s.id and sp.store_id = s.store_id
    where s.store_id = _store_id and s.status = 'completed' and sp.method = 'fiado'
    union all
    select d.customer_id, d.occurred_at, d.id, d.amount
    from public.customer_opening_debts d where d.store_id = _store_id and d.canceled_at is null
  ), charges as (
    select b.customer_id, b.quando, b.amount,
           sum(b.amount) over (partition by b.customer_id order by b.quando, b.ref) as running
    from base b
  ), paid as (
    select x.customer_id, sum(x.amount) as total from (
      select cp.customer_id, cp.amount from public.customer_payments cp where cp.store_id = _store_id
      union all
      select r.customer_id, r.refund_amount from public.sale_returns r where r.store_id = _store_id and r.refund_method = 'credit'
    ) x group by x.customer_id
  ), tot as (
    select ch.customer_id, sum(ch.amount) as charged from charges ch group by ch.customer_id
  ), oldest as (
    select distinct on (ch.customer_id) ch.customer_id, ch.quando
    from charges ch left join paid p on p.customer_id = ch.customer_id
    where ch.running > coalesce(p.total, 0)
    order by ch.customer_id, ch.quando
  )
  select c.id, c.name, c.phone, c.active,
         coalesce(t.charged, 0)::numeric, coalesce(p.total, 0)::numeric,
         (coalesce(t.charged, 0) - coalesce(p.total, 0))::numeric,
         o.quando, o.quando + make_interval(days => _days)
  from public.customers c
  left join tot t on t.customer_id = c.id
  left join paid p on p.customer_id = c.id
  left join oldest o on o.customer_id = c.id
  where c.store_id = _store_id
  order by (coalesce(t.charged, 0) - coalesce(p.total, 0)) desc, c.name;
end $function$;

-- Extrato: novo tipo 'opening' (dívida anterior)
create or replace function public.get_customer_statement(_customer_id uuid)
 returns table(kind text, ref_id uuid, sale_number integer, amount numeric, method text, note text, happened_at timestamptz, canceled boolean)
 language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $function$
declare _store uuid;
begin
  select store_id into _store from public.customers where id = _customer_id;
  if _store is null or auth.uid() is null or not public.is_store_member(_store) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select 'charge'::text, s.id, s.number, sp.amount, 'fiado'::text, null::text, s.sold_at, s.status = 'canceled'
  from public.sales s join public.sale_payments sp on sp.sale_id = s.id and sp.store_id = s.store_id and sp.method = 'fiado'
  where s.store_id = _store and s.customer_id = _customer_id
  union all
  select 'opening', d.id, null, d.amount, 'divida_anterior', d.note, d.occurred_at, d.canceled_at is not null
  from public.customer_opening_debts d where d.store_id = _store and d.customer_id = _customer_id
  union all
  select 'payment', cp.id, null, cp.amount, cp.method::text, cp.note, cp.paid_at, false
  from public.customer_payments cp where cp.store_id = _store and cp.customer_id = _customer_id
  union all
  select 'payment', r.id, s.number, r.refund_amount, 'Vale de devolução'::text, r.reason, r.created_at, false
  from public.sale_returns r join public.sales s on s.id = r.sale_id
  where r.store_id = _store and r.customer_id = _customer_id and r.refund_method = 'credit'
  order by 7 desc;
end $function$;

revoke execute on function public.add_customer_opening_debt(uuid, numeric, uuid, text, date) from public, anon;
revoke execute on function public.cancel_customer_opening_debt(uuid) from public, anon;
grant execute on function public.add_customer_opening_debt(uuid, numeric, uuid, text, date) to authenticated;
grant execute on function public.cancel_customer_opening_debt(uuid) to authenticated;
