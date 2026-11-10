-- Etapa 6: relatório de vendas por período (dono/gerente)
-- _from/_to são datas no fuso da loja (store_settings.timezone), intervalo fechado.
create or replace function public.get_sales_report(_store_id uuid, _from date, _to date)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
declare _tz text; _ini timestamptz; _fim timestamptz; r jsonb;
begin
  if auth.uid() is null or not public.has_store_role(_store_id, array['owner','manager']::public.store_role[]) then
    raise exception 'forbidden' using errcode = '42501'; end if;
  if _from is null or _to is null or _to < _from or _to - _from > 731 then raise exception 'invalid_period' using errcode = '22023'; end if;
  select coalesce(timezone, 'America/Sao_Paulo') into _tz from public.store_settings where store_id = _store_id;
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
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', d.dia, 'revenue', coalesce(p.receita, 0), 'profit', coalesce(p.lucro, 0), 'sales', coalesce(p.vendas, 0)) order by d.dia), '[]')
               from dias d left join por_dia p on p.dia = d.dia),
    'by_method', (select coalesce(jsonb_agg(jsonb_build_object('method', method, 'total', total) order by total desc), '[]') from metodos),
    'top_products', (select coalesce(jsonb_agg(to_jsonb(x) order by x.receita desc), '[]') from (select * from produtos order by receita desc limit 15) x)
  ) into r;
  return r;
end $$;

revoke execute on function public.get_sales_report(uuid, date, date) from public, anon;
grant execute on function public.get_sales_report(uuid, date, date) to authenticated;
