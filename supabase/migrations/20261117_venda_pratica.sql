-- Venda mais prática:
-- 1) item avulso, sem produto cadastrado (descrição + valor, custo opcional), que não mexe no estoque
-- 2) estoque não bloqueia mais a venda (pode ficar negativo; a tela avisa)
alter table public.sale_items alter column variant_id drop not null;
alter table public.store_settings alter column allow_negative_stock set default true;
update public.store_settings set allow_negative_stock = true;

create or replace function public.create_paid_sale(_store_id uuid, _items jsonb, _payments jsonb, _idempotency_key uuid,
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
  _variant:=NULLIF(_e->>'variant_id','')::uuid; _quantity:=(_e->>'quantity')::numeric; _price:=(_e->>'unit_price')::numeric;
  IF _variant IS NULL AND (length(coalesce(_e->>'description',''))>120 OR (_e ? 'unit_cost' AND ((_e->>'unit_cost')::numeric<0 OR (_e->>'unit_cost')::numeric<>round((_e->>'unit_cost')::numeric,2)))) THEN RAISE EXCEPTION 'invalid_items' USING ERRCODE='22023'; END IF;
  IF _quantity IS NULL OR _quantity<=0 OR _quantity::text IN ('NaN','Infinity','-Infinity') OR _quantity<>round(_quantity,3) OR _price IS NULL OR _price<0 OR _price::text IN ('NaN','Infinity','-Infinity') OR _price<>round(_price,2) THEN RAISE EXCEPTION 'invalid_items' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF (SELECT count(value->>'variant_id')<>count(DISTINCT value->>'variant_id') FROM jsonb_array_elements(_items) WHERE NULLIF(value->>'variant_id','') IS NOT NULL) THEN RAISE EXCEPTION 'duplicate_variant' USING ERRCODE='22023'; END IF;
 SELECT jsonb_agg(jsonb_build_object('variant_id',NULLIF(value->>'variant_id','')::uuid,'quantity',(value->>'quantity')::numeric(12,3),'unit_price',(value->>'unit_price')::numeric(12,2),
   'description',CASE WHEN NULLIF(value->>'variant_id','') IS NULL THEN COALESCE(NULLIF(btrim(value->>'description'),''),'Venda avulsa') END,
   'unit_cost',CASE WHEN NULLIF(value->>'variant_id','') IS NULL THEN COALESCE((value->>'unit_cost')::numeric(12,2),0) END)
   ORDER BY NULLIF(value->>'variant_id','')::uuid NULLS LAST, value->>'description', (value->>'unit_price')::numeric) INTO _lines FROM jsonb_array_elements(_items);
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
 PERFORM v.id FROM public.product_variants v WHERE v.store_id=_store_id AND v.id IN (SELECT (value->>'variant_id')::uuid FROM jsonb_array_elements(_lines) WHERE value->>'variant_id' IS NOT NULL) ORDER BY v.id FOR UPDATE;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(_lines) l LEFT JOIN public.product_variants v ON v.id=(l.value->>'variant_id')::uuid AND v.store_id=_store_id LEFT JOIN public.products p ON p.id=v.product_id AND p.store_id=_store_id WHERE l.value->>'variant_id' IS NOT NULL AND (v.id IS NULL OR NOT v.active OR p.id IS NULL OR NOT p.active)) THEN RAISE EXCEPTION 'invalid_variant' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(max(number),0)+1 INTO _number FROM public.sales WHERE store_id=_store_id;
 INSERT INTO public.sales(store_id,number,total,sold_at,idempotency_key,request_hash,created_by,discount_type,discount_value,discount_total,customer_id) VALUES (_store_id,_number,_total,_sold,_idempotency_key,_hash,_uid,_discount_type,_discount_value,_discount,_customer_id) RETURNING id INTO _sale_id;
 FOR _e IN SELECT value FROM jsonb_array_elements(_tenders) LOOP
  INSERT INTO public.sale_payments(store_id,sale_id,method,amount,created_by) VALUES (_store_id,_sale_id,(_e->>'method')::public.sale_payment_method,(_e->>'amount')::numeric,_uid);
 END LOOP;
 FOR _e IN SELECT value FROM jsonb_array_elements(_lines) LOOP
  IF _e->>'variant_id' IS NULL THEN
   INSERT INTO public.sale_items(store_id,sale_id,variant_id,product_name,attributes,quantity,unit_price,unit_cost,line_total) VALUES (_store_id,_sale_id,NULL,_e->>'description','{}'::jsonb,(_e->>'quantity')::numeric,(_e->>'unit_price')::numeric,(_e->>'unit_cost')::numeric,round((_e->>'quantity')::numeric*(_e->>'unit_price')::numeric,2));
  ELSE
   SELECT v.unit_cost,v.attributes,p.name INTO _v FROM public.product_variants v JOIN public.products p ON p.id=v.product_id AND p.store_id=v.store_id WHERE v.id=(_e->>'variant_id')::uuid AND v.store_id=_store_id;
   INSERT INTO public.sale_items(store_id,sale_id,variant_id,product_name,attributes,quantity,unit_price,unit_cost,line_total) VALUES (_store_id,_sale_id,(_e->>'variant_id')::uuid,_v.name,_v.attributes,(_e->>'quantity')::numeric,(_e->>'unit_price')::numeric,_v.unit_cost,round((_e->>'quantity')::numeric*(_e->>'unit_price')::numeric,2));
   INSERT INTO public.stock_movements(store_id,variant_id,type,quantity,unit_cost,reason,reference_type,reference_id,created_by) VALUES (_store_id,(_e->>'variant_id')::uuid,'sale',-(_e->>'quantity')::numeric,_v.unit_cost,'Venda #'||_number,'sale',_sale_id,_uid);
  END IF;
 END LOOP;
 RETURN _sale_id;
END; $function$;


CREATE OR REPLACE FUNCTION public.apply_sale_cancellation()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s public.sales%ROWTYPE; i record;
BEGIN
 IF auth.uid() IS NULL OR NEW.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.sales WHERE id=NEW.sale_id AND store_id=NEW.store_id FOR UPDATE;
 IF NOT FOUND OR NOT public.has_store_role(s.store_id,ARRAY['owner','manager']::public.store_role[]) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF s.status<>'completed' THEN RAISE EXCEPTION 'sale_already_canceled' USING ERRCODE='22023'; END IF;
 PERFORM v.id FROM public.product_variants v JOIN public.sale_items si ON si.variant_id=v.id AND si.store_id=v.store_id WHERE si.sale_id=s.id AND si.store_id=s.store_id ORDER BY v.id FOR UPDATE OF v;
 UPDATE public.sales SET status='canceled' WHERE id=s.id;
 -- Itens avulsos (sem produto) não mexem no estoque
 FOR i IN SELECT * FROM public.sale_items WHERE sale_id=s.id AND store_id=s.store_id AND variant_id IS NOT NULL ORDER BY variant_id LOOP
  INSERT INTO public.stock_movements(store_id,variant_id,type,quantity,unit_cost,reason,reference_type,reference_id,created_by)
  VALUES(s.store_id,i.variant_id,'sale_cancel',i.quantity,i.unit_cost,'Cancelamento da venda #'||s.number,'sale_cancellation',NEW.id,NEW.created_by);
 END LOOP;
 RETURN NEW;
END $function$;
revoke execute on function public.apply_sale_cancellation() from public, anon, authenticated;
