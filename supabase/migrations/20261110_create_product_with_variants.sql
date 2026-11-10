-- Cria produto + todas as variações + estoque inicial numa única transação.
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
