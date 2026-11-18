-- Fase 3: caixa do dia (Start), trocas e devoluções (Pro), importar produtos (Pro).
-- Leitor de código de barras e exportar planilha são só no app.

-- ============ CAIXA DO DIA ============
create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  opened_by uuid not null default auth.uid(),
  opened_at timestamptz not null default now(),
  opening_amount numeric(12,2) not null check (opening_amount >= 0),
  closed_by uuid,
  closed_at timestamptz,
  expected_amount numeric(12,2),
  counted_amount numeric(12,2) check (counted_amount is null or counted_amount >= 0),
  notes text
);
create unique index if not exists cash_sessions_one_open on public.cash_sessions(store_id) where closed_at is null;
create index if not exists cash_sessions_store on public.cash_sessions(store_id, opened_at desc);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  session_id uuid not null references public.cash_sessions(id) on delete cascade,
  kind text not null check (kind in ('in', 'out')), -- in = reforço, out = sangria/retirada
  amount numeric(12,2) not null check (amount > 0),
  note text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
create policy cash_sessions_select on public.cash_sessions for select to authenticated using (public.is_store_member(store_id));
create policy cash_movements_select on public.cash_movements for select to authenticated using (public.is_store_member(store_id));
revoke insert, update, delete on public.cash_sessions, public.cash_movements from authenticated, anon;

-- ============ DEVOLUÇÕES ============
create table if not exists public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  customer_id uuid references public.customers(id),
  refund_method text not null check (refund_method in ('cash', 'pix', 'card', 'credit')), -- credit = vale/crédito na loja
  refund_amount numeric(12,2) not null check (refund_amount >= 0),
  cost_amount numeric(12,2) not null default 0,
  reason text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  return_id uuid not null references public.sale_returns(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id),
  quantity numeric(12,3) not null check (quantity > 0),
  amount numeric(12,2) not null
);
create index if not exists sale_returns_sale on public.sale_returns(sale_id);
create index if not exists sale_returns_store on public.sale_returns(store_id, created_at);
create index if not exists sale_return_items_item on public.sale_return_items(sale_item_id);
alter table public.sale_returns enable row level security;
alter table public.sale_return_items enable row level security;
create policy sale_returns_select on public.sale_returns for select to authenticated using (public.is_store_member(store_id));
create policy sale_return_items_select on public.sale_return_items for select to authenticated using (public.is_store_member(store_id));
revoke insert, update, delete on public.sale_returns, public.sale_return_items from authenticated, anon;

-- venda com devolução não pode ser cancelada (o estoque voltaria duas vezes)
create or replace function public.forbid_cancel_with_returns() returns trigger
language plpgsql set search_path to 'public' as $$
begin
  if exists (select 1 from public.sale_returns where sale_id = new.sale_id) then
    raise exception 'sale_has_returns' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists sale_cancellations_no_returns on public.sale_cancellations;
create trigger sale_cancellations_no_returns before insert on public.sale_cancellations
  for each row execute function public.forbid_cancel_with_returns();

-- _items: [{sale_item_id, quantity}]
create or replace function public.return_sale_items(_sale_id uuid, _items jsonb, _refund_method text, _reason text default null)
returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare s public.sales%rowtype; _uid uuid := auth.uid(); _rid uuid; e jsonb; it public.sale_items%rowtype;
  _q numeric; _ja numeric; _valor numeric; _total numeric := 0; _custo numeric := 0; _fator numeric;
begin
  select * into s from public.sales where id = _sale_id for update;
  if _uid is null or not found or not public.is_store_member(s.store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.store_has_plan(s.store_id, 'pro') then raise exception 'plan_required:pro' using errcode = '42501'; end if;
  if s.status <> 'completed' then raise exception 'sale_canceled' using errcode = '22023'; end if;
  if _refund_method not in ('cash', 'pix', 'card', 'credit') then raise exception 'invalid_refund' using errcode = '22023'; end if;
  if _refund_method = 'credit' and s.customer_id is null then raise exception 'customer_required_credit' using errcode = '22023'; end if;
  if _items is null or jsonb_typeof(_items) <> 'array' or jsonb_array_length(_items) = 0 then raise exception 'items_required' using errcode = '22023'; end if;

  -- desconto da venda é rateado proporcionalmente
  _fator := case when s.subtotal > 0 then s.total / s.subtotal else 1 end;
  insert into public.sale_returns (store_id, sale_id, customer_id, refund_method, refund_amount, reason)
  values (s.store_id, s.id, s.customer_id, _refund_method, 0, nullif(btrim(_reason), '')) returning id into _rid;

  for e in select value from jsonb_array_elements(_items) loop
    _q := (e->>'quantity')::numeric;
    select * into it from public.sale_items where id = (e->>'sale_item_id')::uuid and sale_id = s.id;
    if not found or _q is null or _q <= 0 then raise exception 'invalid_items' using errcode = '22023'; end if;
    select coalesce(sum(quantity), 0) into _ja from public.sale_return_items where sale_item_id = it.id;
    if _ja + _q > it.quantity then raise exception 'return_exceeds_sold' using errcode = '22023'; end if;
    _valor := round(_q * it.unit_price * _fator, 2);
    _total := _total + _valor;
    _custo := _custo + round(_q * it.unit_cost, 2);
    insert into public.sale_return_items (store_id, return_id, sale_item_id, quantity, amount) values (s.store_id, _rid, it.id, _q, _valor);
    if it.variant_id is not null then
      insert into public.stock_movements (store_id, variant_id, type, quantity, unit_cost, reason, reference_type, reference_id, created_by)
      values (s.store_id, it.variant_id, 'return', _q, it.unit_cost, 'Devolução da venda #' || s.number, 'return', _rid, _uid);
    end if;
  end loop;
  update public.sale_returns set refund_amount = _total, cost_amount = _custo where id = _rid;
  return _rid;
end $$;

-- crédito de devolução (vale) abate do saldo do cliente: entra como "pago" no fiado
create or replace function public.get_customer_balances(_store_id uuid)
 returns table(customer_id uuid, name text, phone text, active boolean, charged numeric, paid numeric, balance numeric, oldest_open_at timestamptz, due_at timestamptz)
 language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
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
    select x.customer_id, sum(x.amount) as total from (
      select cp.customer_id, cp.amount from public.customer_payments cp where cp.store_id = _store_id
      union all
      select r.customer_id, r.refund_amount from public.sale_returns r where r.store_id = _store_id and r.refund_method = 'credit'
    ) x group by x.customer_id
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
end $function$;

-- devoluções da venda (para a tela da venda)
create or replace function public.get_sale_returns(_sale_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare s public.sales%rowtype;
begin
  select * into s from public.sales where id = _sale_id;
  if not found or not public.is_store_member(s.store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'returns', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'created_at', r.created_at, 'refund_method', r.refund_method,
        'refund_amount', r.refund_amount, 'reason', r.reason, 'by', p.full_name,
        'items', (select jsonb_agg(jsonb_build_object('product_name', i.product_name, 'attributes', i.attributes, 'quantity', ri.quantity, 'amount', ri.amount))
                  from public.sale_return_items ri join public.sale_items i on i.id = ri.sale_item_id where ri.return_id = r.id))
      order by r.created_at) from public.sale_returns r left join public.profiles p on p.id = r.created_by where r.sale_id = s.id), '[]'::jsonb),
    'returned', coalesce((select jsonb_object_agg(sale_item_id, q) from (
        select ri.sale_item_id, sum(ri.quantity) q from public.sale_return_items ri join public.sale_returns r on r.id = ri.return_id
        where r.sale_id = s.id group by 1) x), '{}'::jsonb));
end $$;

-- ============ CAIXA: funções ============
create or replace function public.cash_expected(_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare c public.cash_sessions%rowtype; _fim timestamptz; v_vendas numeric; v_fiado numeric; v_in numeric; v_out numeric; v_dev numeric;
begin
  select * into c from public.cash_sessions where id = _session_id;
  if not found or not public.is_store_member(c.store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  _fim := coalesce(c.closed_at, now());
  select coalesce(sum(sp.amount), 0) into v_vendas from public.sale_payments sp join public.sales s on s.id = sp.sale_id
    where s.store_id = c.store_id and s.status = 'completed' and sp.method = 'cash' and s.sold_at >= c.opened_at and s.sold_at <= _fim;
  select coalesce(sum(amount), 0) into v_fiado from public.customer_payments
    where store_id = c.store_id and method = 'cash' and paid_at >= c.opened_at and paid_at <= _fim;
  select coalesce(sum(amount) filter (where kind = 'in'), 0), coalesce(sum(amount) filter (where kind = 'out'), 0) into v_in, v_out
    from public.cash_movements where session_id = c.id;
  select coalesce(sum(refund_amount), 0) into v_dev from public.sale_returns
    where store_id = c.store_id and refund_method = 'cash' and created_at >= c.opened_at and created_at <= _fim;
  return jsonb_build_object('opening', c.opening_amount, 'cash_sales', v_vendas, 'fiado_received', v_fiado,
    'cash_in', v_in, 'cash_out', v_out, 'refunds', v_dev,
    'expected', c.opening_amount + v_vendas + v_fiado + v_in - v_out - v_dev);
end $$;

create or replace function public.get_cash(_store_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare aberto public.cash_sessions%rowtype;
begin
  if not public.is_store_member(_store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into aberto from public.cash_sessions where store_id = _store_id and closed_at is null;
  return jsonb_build_object(
    'open', case when aberto.id is null then null else to_jsonb(aberto) || jsonb_build_object(
        'opened_by_name', (select full_name from public.profiles where id = aberto.opened_by),
        'totals', public.cash_expected(aberto.id),
        'movements', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at) from public.cash_movements m where m.session_id = aberto.id), '[]'::jsonb)) end,
    'history', coalesce((select jsonb_agg(x order by x->>'opened_at' desc) from (
        select to_jsonb(c) || jsonb_build_object('opened_by_name', p1.full_name, 'closed_by_name', p2.full_name) x
        from public.cash_sessions c left join public.profiles p1 on p1.id = c.opened_by left join public.profiles p2 on p2.id = c.closed_by
        where c.store_id = _store_id and c.closed_at is not null order by c.opened_at desc limit 15) t), '[]'::jsonb));
end $$;

create or replace function public.open_cash(_store_id uuid, _amount numeric) returns uuid
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare _id uuid;
begin
  if auth.uid() is null or not public.is_store_member(_store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if _amount is null or _amount < 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  if exists (select 1 from public.cash_sessions where store_id = _store_id and closed_at is null) then raise exception 'cash_already_open' using errcode = '22023'; end if;
  insert into public.cash_sessions (store_id, opening_amount) values (_store_id, round(_amount, 2)) returning id into _id;
  return _id;
end $$;

create or replace function public.cash_move(_session_id uuid, _kind text, _amount numeric, _note text) returns void
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare c public.cash_sessions%rowtype;
begin
  select * into c from public.cash_sessions where id = _session_id for update;
  if auth.uid() is null or not found or not public.is_store_member(c.store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.closed_at is not null then raise exception 'cash_closed' using errcode = '22023'; end if;
  if _kind not in ('in', 'out') or _amount is null or _amount <= 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  insert into public.cash_movements (store_id, session_id, kind, amount, note) values (c.store_id, c.id, _kind, round(_amount, 2), nullif(btrim(_note), ''));
end $$;

create or replace function public.close_cash(_session_id uuid, _counted numeric, _notes text) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare c public.cash_sessions%rowtype; t jsonb;
begin
  select * into c from public.cash_sessions where id = _session_id for update;
  if auth.uid() is null or not found or not public.is_store_member(c.store_id) then raise exception 'forbidden' using errcode = '42501'; end if;
  if c.closed_at is not null then raise exception 'cash_closed' using errcode = '22023'; end if;
  if _counted is null or _counted < 0 then raise exception 'invalid_amount' using errcode = '22023'; end if;
  t := public.cash_expected(c.id);
  update public.cash_sessions set closed_at = now(), closed_by = auth.uid(), counted_amount = round(_counted, 2),
    expected_amount = (t->>'expected')::numeric, notes = nullif(btrim(_notes), '') where id = c.id;
  return t || jsonb_build_object('counted', round(_counted, 2), 'difference', round(_counted, 2) - (t->>'expected')::numeric);
end $$;

-- ============ IMPORTAR PRODUTOS ============
-- _rows: [{name, price, stock, cost, sku, category}]
create or replace function public.import_products(_store_id uuid, _rows jsonb) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare e jsonb; _n int := 0; _pulados jsonb := '[]'::jsonb; _cat uuid; _nome text; _sku text; _linha int := 0;
begin
  if not public.has_store_role(_store_id, array['owner','manager']::public.store_role[]) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not public.store_has_plan(_store_id, 'pro') then raise exception 'plan_required:pro' using errcode = '42501'; end if;
  if _rows is null or jsonb_typeof(_rows) <> 'array' or jsonb_array_length(_rows) not between 1 and 1000 then raise exception 'invalid_rows' using errcode = '22023'; end if;
  for e in select value from jsonb_array_elements(_rows) loop
    _linha := _linha + 1;
    _nome := btrim(coalesce(e->>'name', ''));
    _sku := nullif(btrim(coalesce(e->>'sku', '')), '');
    if _nome = '' then _pulados := _pulados || jsonb_build_object('line', _linha, 'why', 'sem nome'); continue; end if;
    if exists (select 1 from public.products where store_id = _store_id and lower(name) = lower(_nome) and active) then
      _pulados := _pulados || jsonb_build_object('line', _linha, 'name', _nome, 'why', 'já existe'); continue; end if;
    if _sku is not null and exists (select 1 from public.product_variants where store_id = _store_id and sku = _sku) then
      _pulados := _pulados || jsonb_build_object('line', _linha, 'name', _nome, 'why', 'código repetido'); continue; end if;
    _cat := null;
    if nullif(btrim(coalesce(e->>'category', '')), '') is not null then
      select id into _cat from public.categories where store_id = _store_id and type = 'product' and lower(name) = lower(btrim(e->>'category'));
      if _cat is null then
        insert into public.categories (store_id, type, name) values (_store_id, 'product', btrim(e->>'category')) returning id into _cat;
      end if;
    end if;
    begin
      perform public.create_product_with_variants(_store_id, _nome, _cat, jsonb_build_array(jsonb_build_object(
        'sale_price', greatest(coalesce((e->>'price')::numeric, 0), 0), 'unit_cost', greatest(coalesce((e->>'cost')::numeric, 0), 0),
        'initial_stock', greatest(coalesce((e->>'stock')::numeric, 0), 0), 'sku', _sku, 'attributes', '{}'::jsonb)));
      _n := _n + 1;
    exception when others then
      _pulados := _pulados || jsonb_build_object('line', _linha, 'name', _nome, 'why', 'dados inválidos');
    end;
  end loop;
  return jsonb_build_object('created', _n, 'skipped', _pulados);
end $$;

revoke execute on function public.return_sale_items(uuid, jsonb, text, text), public.get_sale_returns(uuid),
  public.cash_expected(uuid), public.get_cash(uuid), public.open_cash(uuid, numeric), public.cash_move(uuid, text, numeric, text),
  public.close_cash(uuid, numeric, text), public.import_products(uuid, jsonb) from public, anon;
grant execute on function public.return_sale_items(uuid, jsonb, text, text), public.get_sale_returns(uuid),
  public.cash_expected(uuid), public.get_cash(uuid), public.open_cash(uuid, numeric), public.cash_move(uuid, text, numeric, text),
  public.close_cash(uuid, numeric, text), public.import_products(uuid, jsonb) to authenticated;

-- ============ RELATÓRIO: desconta devoluções ============
create or replace function public.get_sales_report(_store_id uuid, _from date, _to date)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
declare _tz text; _ini timestamptz; _fim timestamptz; r jsonb; _dev numeric; _dev_custo numeric;
begin
  if auth.uid() is null or not public.has_store_role(_store_id, array['owner','manager']::public.store_role[]) then
    raise exception 'forbidden' using errcode = '42501'; end if;
  if _from is null or _to is null or _to < _from or _to - _from > 731 then raise exception 'invalid_period' using errcode = '22023'; end if;
  select coalesce(timezone, 'America/Sao_Paulo') into _tz from public.store_settings where store_id = _store_id;
  if not public.store_has_plan(_store_id, 'pro') and _from < date_trunc('month', now() at time zone _tz)::date then
    raise exception 'plan_required:pro' using errcode = '42501';
  end if;
  _ini := (_from::timestamp) at time zone _tz;
  _fim := ((_to + 1)::timestamp) at time zone _tz;
  select coalesce(sum(refund_amount), 0), coalesce(sum(cost_amount), 0) into _dev, _dev_custo
    from public.sale_returns where store_id = _store_id and created_at >= _ini and created_at < _fim;

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
    'revenue', coalesce((select sum(total) from v), 0) - _dev,
    'cost', coalesce((select sum(cost) from v), 0) - _dev_custo,
    'gross_profit', coalesce((select sum(total - cost) from v), 0) - (_dev - _dev_custo),
    'returns', _dev,
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
end $function$;
