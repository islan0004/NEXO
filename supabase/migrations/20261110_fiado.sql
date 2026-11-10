-- Etapa 5: fiado (clientes, vendas a prazo e recebimentos)
-- Requer: alter type public.sale_payment_method add value 'fiado' (migração fiado_enum)
--
-- Modelo: a dívida do cliente é DERIVADA das vendas concluídas pagas com 'fiado'
-- menos os recebimentos. Cancelar a venda tira a dívida automaticamente.
-- Recebimentos abatem as compras mais antigas primeiro (FIFO) para calcular atraso.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  phone text check (phone is null or length(phone) <= 30),
  notes text check (notes is null or length(notes) <= 500),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id)
);
create index customers_store_idx on public.customers (store_id, name);
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
alter table public.customers enable row level security;
create policy customers_select on public.customers for select to authenticated using (public.is_store_member(store_id));
create policy customers_insert on public.customers for insert to authenticated with check (public.is_store_member(store_id));
create policy customers_update on public.customers for update to authenticated using (public.is_store_member(store_id)) with check (public.is_store_member(store_id));

alter table public.sales add column customer_id uuid;
alter table public.sales add constraint sales_customer_fk foreign key (store_id, customer_id) references public.customers (store_id, id);
create index sales_customer_idx on public.sales (store_id, customer_id) where customer_id is not null;

create table public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  customer_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  method public.sale_payment_method not null check (method <> 'fiado'),
  note text check (note is null or length(note) <= 300),
  paid_at timestamptz not null default now(),
  idempotency_key uuid not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (store_id, customer_id) references public.customers (store_id, id),
  unique (store_id, idempotency_key)
);
create index customer_payments_customer_idx on public.customer_payments (store_id, customer_id, paid_at);
alter table public.customer_payments enable row level security;
create policy customer_payments_select on public.customer_payments for select to authenticated using (public.is_store_member(store_id));
create trigger customer_payments_immutable before update or delete on public.customer_payments for each row execute function public.forbid_stock_movement_change();

-- Venda com pagamentos (agora aceita 'fiado' vinculado a um cliente)
drop function if exists public.create_paid_sale(uuid, jsonb, jsonb, uuid, text, numeric, timestamptz);
create function public.create_paid_sale(_store_id uuid, _items jsonb, _payments jsonb, _idempotency_key uuid,
  _discount_type text default null, _discount_value numeric default 0, _sold_at timestamptz default null, _customer_id uuid default null)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
DECLARE
 _uid uuid := auth.uid(); _lines jsonb; _tenders jsonb; _e jsonb; _variant uuid; _quantity numeric; _price numeric; _amount numeric; _method text;
 _subtotal numeric(12,2); _discount numeric(12,2); _total numeric(12,2); _paid numeric; _hash text;
 _existing public.sales%ROWTYPE; _sale_id uuid; _number integer; _v record; _sold timestamptz; _has_fiado boolean := false;
BEGIN
 IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
 IF NOT public.is_store_member(_store_id) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF _idempotency_key IS NULL THEN RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE='22023'; END IF;
 IF _items IS NULL OR jsonb_typeof(_items)<>'array' THEN RAISE EXCEPTION 'items_required' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(_items) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'invalid_item_count' USING ERRCODE='22023'; END IF;
 IF _payments IS NULL OR jsonb_typeof(_payments)<>'array' THEN RAISE EXCEPTION 'payments_required' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(_payments)>200 THEN RAISE EXCEPTION 'too_many_payments' USING ERRCODE='22023'; END IF;
 _sold:=COALESCE(_sold_at,now());
 IF NOT isfinite(_sold) OR _sold>now()+interval '5 minutes' THEN RAISE EXCEPTION 'invalid_sold_at' USING ERRCODE='22023'; END IF;
 FOR _e IN SELECT value FROM jsonb_array_elements(_items) LOOP
  _variant:=(_e->>'variant_id')::uuid; _quantity:=(_e->>'quantity')::numeric; _price:=(_e->>'unit_price')::numeric;
  IF _variant IS NULL OR _quantity IS NULL OR _quantity<=0 OR _quantity::text IN ('NaN','Infinity','-Infinity') OR _quantity<>round(_quantity,3) OR _price IS NULL OR _price<0 OR _price::text IN ('NaN','Infinity','-Infinity') OR _price<>round(_price,2) THEN RAISE EXCEPTION 'invalid_items' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF (SELECT count(*)<>count(DISTINCT value->>'variant_id') FROM jsonb_array_elements(_items)) THEN RAISE EXCEPTION 'duplicate_variant' USING ERRCODE='22023'; END IF;
 SELECT jsonb_agg(jsonb_build_object('variant_id',(value->>'variant_id')::uuid,'quantity',(value->>'quantity')::numeric(12,3),'unit_price',(value->>'unit_price')::numeric(12,2)) ORDER BY (value->>'variant_id')::uuid) INTO _lines FROM jsonb_array_elements(_items);
 SELECT sum(round((value->>'quantity')::numeric*(value->>'unit_price')::numeric,2)) INTO _subtotal FROM jsonb_array_elements(_lines);
 IF _discount_value IS NULL OR _discount_value<0 OR _discount_value::text IN ('NaN','Infinity','-Infinity') OR _discount_value<>round(_discount_value,4) THEN RAISE EXCEPTION 'invalid_discount' USING ERRCODE='22023'; END IF;
 IF _discount_type IS NULL THEN
  IF _discount_value<>0 THEN RAISE EXCEPTION 'discount_type_required' USING ERRCODE='22023'; END IF; _discount:=0;
 ELSIF _discount_type='fixed' THEN
  IF _discount_value<>round(_discount_value,2) THEN RAISE EXCEPTION 'invalid_discount' USING ERRCODE='22023'; END IF; _discount:=_discount_value;
 ELSIF _discount_type='percentage' THEN
  IF _discount_value>100 THEN RAISE EXCEPTION 'invalid_discount' USING ERRCODE='22023'; END IF; _discount:=round(_subtotal*_discount_value/100,2);
 ELSE RAISE EXCEPTION 'invalid_discount_type' USING ERRCODE='22023'; END IF;
 IF _discount>_subtotal THEN RAISE EXCEPTION 'discount_exceeds_subtotal' USING ERRCODE='22023'; END IF;
 _total:=_subtotal-_discount;
 FOR _e IN SELECT value FROM jsonb_array_elements(_payments) LOOP
  _method:=_e->>'method'; _amount:=(_e->>'amount')::numeric;
  IF _method IS NULL OR _method NOT IN ('cash','pix','debit_card','credit_card','fiado') OR _amount IS NULL OR _amount<=0 OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount<>round(_amount,2) THEN RAISE EXCEPTION 'invalid_payment' USING ERRCODE='22023'; END IF;
  IF _method='fiado' THEN _has_fiado:=true; END IF;
 END LOOP;
 IF _has_fiado AND _customer_id IS NULL THEN RAISE EXCEPTION 'customer_required' USING ERRCODE='22023'; END IF;
 IF _customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id=_customer_id AND c.store_id=_store_id AND c.active) THEN
  RAISE EXCEPTION 'invalid_customer' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('method',method,'amount',amount) ORDER BY method),'[]'::jsonb),COALESCE(sum(amount),0) INTO _tenders,_paid FROM (SELECT value->>'method' AS method,sum((value->>'amount')::numeric) AS amount FROM jsonb_array_elements(_payments) GROUP BY value->>'method') p;
 IF _paid<>_total THEN RAISE EXCEPTION 'payment_total_mismatch' USING ERRCODE='22023'; END IF;
 _hash:=md5(jsonb_build_object('operation','create_paid_sale','items',_lines,'payments',_tenders,'discount_type',_discount_type,'discount_value',_discount_value,'customer',_customer_id,'sold_at',CASE WHEN _sold_at IS NULL THEN NULL ELSE extract(epoch FROM _sold_at) END)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(_store_id::text||':'||_idempotency_key::text,0));
 SELECT * INTO _existing FROM public.sales WHERE store_id=_store_id AND idempotency_key=_idempotency_key;
 IF FOUND THEN
  IF _existing.created_by<>_uid OR _existing.request_hash<>_hash THEN RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE='23505'; END IF; RETURN _existing.id;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('sale_number:'||_store_id::text,0));
 PERFORM v.id FROM public.product_variants v WHERE v.store_id=_store_id AND v.id IN (SELECT (value->>'variant_id')::uuid FROM jsonb_array_elements(_lines)) ORDER BY v.id FOR UPDATE;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(_lines) l LEFT JOIN public.product_variants v ON v.id=(l.value->>'variant_id')::uuid AND v.store_id=_store_id LEFT JOIN public.products p ON p.id=v.product_id AND p.store_id=_store_id WHERE v.id IS NULL OR NOT v.active OR p.id IS NULL OR NOT p.active) THEN RAISE EXCEPTION 'invalid_variant' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(max(number),0)+1 INTO _number FROM public.sales WHERE store_id=_store_id;
 INSERT INTO public.sales(store_id,number,total,sold_at,idempotency_key,request_hash,created_by,discount_type,discount_value,discount_total,customer_id) VALUES (_store_id,_number,_total,_sold,_idempotency_key,_hash,_uid,_discount_type,_discount_value,_discount,_customer_id) RETURNING id INTO _sale_id;
 FOR _e IN SELECT value FROM jsonb_array_elements(_tenders) LOOP
  INSERT INTO public.sale_payments(store_id,sale_id,method,amount,created_by) VALUES (_store_id,_sale_id,(_e->>'method')::public.sale_payment_method,(_e->>'amount')::numeric,_uid);
 END LOOP;
 FOR _e IN SELECT value FROM jsonb_array_elements(_lines) LOOP
  SELECT v.unit_cost,v.attributes,p.name INTO _v FROM public.product_variants v JOIN public.products p ON p.id=v.product_id AND p.store_id=v.store_id WHERE v.id=(_e->>'variant_id')::uuid AND v.store_id=_store_id;
  INSERT INTO public.sale_items(store_id,sale_id,variant_id,product_name,attributes,quantity,unit_price,unit_cost,line_total) VALUES (_store_id,_sale_id,(_e->>'variant_id')::uuid,_v.name,_v.attributes,(_e->>'quantity')::numeric,(_e->>'unit_price')::numeric,_v.unit_cost,round((_e->>'quantity')::numeric*(_e->>'unit_price')::numeric,2));
  INSERT INTO public.stock_movements(store_id,variant_id,type,quantity,unit_cost,reason,reference_type,reference_id,created_by) VALUES (_store_id,(_e->>'variant_id')::uuid,'sale',-(_e->>'quantity')::numeric,_v.unit_cost,'Venda #'||_number,'sale',_sale_id,_uid);
 END LOOP;
 RETURN _sale_id;
END; $function$;

-- Saldos por cliente (com vencimento da compra mais antiga em aberto)
create or replace function public.get_customer_balances(_store_id uuid)
 returns table(customer_id uuid, name text, phone text, active boolean, charged numeric, paid numeric, balance numeric, oldest_open_at timestamptz, due_at timestamptz)
 language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
declare _days int;
begin
  if auth.uid() is null or not public.is_store_member(_store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select coalesce(default_credit_days, 30) into _days from public.store_settings where store_id = _store_id;
  return query
  with charges as (
    select s.customer_id, s.sold_at, sp.amount,
           sum(sp.amount) over (partition by s.customer_id order by s.sold_at, s.id) as running
    from public.sales s join public.sale_payments sp on sp.sale_id = s.id and sp.store_id = s.store_id
    where s.store_id = _store_id and s.status = 'completed' and sp.method = 'fiado'
  ), paid as (
    select cp.customer_id, sum(cp.amount) as total from public.customer_payments cp where cp.store_id = _store_id group by cp.customer_id
  ), tot as (
    select ch.customer_id, sum(ch.amount) as charged from charges ch group by ch.customer_id
  ), oldest as (
    select distinct on (ch.customer_id) ch.customer_id, ch.sold_at
    from charges ch left join paid p on p.customer_id = ch.customer_id
    where ch.running > coalesce(p.total, 0)
    order by ch.customer_id, ch.sold_at
  )
  select c.id, c.name, c.phone, c.active,
         coalesce(t.charged, 0)::numeric, coalesce(p.total, 0)::numeric,
         (coalesce(t.charged, 0) - coalesce(p.total, 0))::numeric,
         o.sold_at, o.sold_at + make_interval(days => _days)
  from public.customers c
  left join tot t on t.customer_id = c.id
  left join paid p on p.customer_id = c.id
  left join oldest o on o.customer_id = c.id
  where c.store_id = _store_id
  order by (coalesce(t.charged, 0) - coalesce(p.total, 0)) desc, c.name;
end $$;

-- Extrato do cliente: compras a prazo e recebimentos
create or replace function public.get_customer_statement(_customer_id uuid)
 returns table(kind text, ref_id uuid, sale_number int, amount numeric, method text, note text, happened_at timestamptz, canceled boolean)
 language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
declare _store uuid;
begin
  select store_id into _store from public.customers where id = _customer_id;
  if _store is null or auth.uid() is null or not public.is_store_member(_store) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select 'charge'::text, s.id, s.number, sp.amount, 'fiado'::text, null::text, s.sold_at, s.status = 'canceled'
  from public.sales s join public.sale_payments sp on sp.sale_id = s.id and sp.store_id = s.store_id and sp.method = 'fiado'
  where s.store_id = _store and s.customer_id = _customer_id
  union all
  select 'payment', cp.id, null, cp.amount, cp.method::text, cp.note, cp.paid_at, false
  from public.customer_payments cp where cp.store_id = _store and cp.customer_id = _customer_id
  order by 7 desc;
end $$;

-- Registrar recebimento (não deixa receber mais que a dívida)
create or replace function public.receive_customer_payment(_customer_id uuid, _amount numeric, _method public.sale_payment_method, _idempotency_key uuid, _note text default null)
 returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
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

  select coalesce((select sum(sp.amount) from public.sales s join public.sale_payments sp on sp.sale_id = s.id and sp.store_id = s.store_id
                   where s.store_id = _store and s.customer_id = _customer_id and s.status = 'completed' and sp.method = 'fiado'), 0)
       - coalesce((select sum(amount) from public.customer_payments where store_id = _store and customer_id = _customer_id), 0)
    into _balance;
  if _amount > _balance then raise exception 'amount_exceeds_balance' using errcode = '22023'; end if;

  insert into public.customer_payments (store_id, customer_id, amount, method, note, idempotency_key, created_by)
  values (_store, _customer_id, _amount, _method, nullif(btrim(_note), ''), _idempotency_key, _uid) returning id into _id;
  return _id;
end $$;

-- Totais de fiado da loja (para o dashboard)
create or replace function public.get_receivables_summary(_store_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
declare r jsonb;
begin
  if auth.uid() is null or not public.is_store_member(_store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select jsonb_build_object(
    'total', coalesce(sum(balance) filter (where balance > 0), 0),
    'overdue', coalesce(sum(balance) filter (where balance > 0 and due_at < now()), 0),
    'customers_open', count(*) filter (where balance > 0),
    'customers_overdue', count(*) filter (where balance > 0 and due_at < now()))
  into r from public.get_customer_balances(_store_id);
  return r;
end $$;

revoke execute on function public.create_paid_sale(uuid, jsonb, jsonb, uuid, text, numeric, timestamptz, uuid) from public, anon;
revoke execute on function public.get_customer_balances(uuid) from public, anon;
revoke execute on function public.get_customer_statement(uuid) from public, anon;
revoke execute on function public.receive_customer_payment(uuid, numeric, public.sale_payment_method, uuid, text) from public, anon;
revoke execute on function public.get_receivables_summary(uuid) from public, anon;
grant execute on function public.create_paid_sale(uuid, jsonb, jsonb, uuid, text, numeric, timestamptz, uuid) to authenticated;
grant execute on function public.get_customer_balances(uuid) to authenticated;
grant execute on function public.get_customer_statement(uuid) to authenticated;
grant execute on function public.receive_customer_payment(uuid, numeric, public.sale_payment_method, uuid, text) to authenticated;
grant execute on function public.get_receivables_summary(uuid) to authenticated;
