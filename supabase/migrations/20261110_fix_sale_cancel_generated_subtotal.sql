-- Bug herdado do protótipo: subtotal é coluna gerada (total + discount_total) e chega NULL em NEW
-- dentro do BEFORE UPDATE, então nenhuma venda podia ser cancelada. Ignora a coluna na comparação.
CREATE OR REPLACE FUNCTION public.forbid_sale_change()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF TG_TABLE_NAME='sales' AND TG_OP='UPDATE' AND pg_trigger_depth()>1 THEN
  IF OLD.status='completed' AND NEW.status='canceled'
    AND (to_jsonb(NEW)-'status'-'subtotal')=(to_jsonb(OLD)-'status'-'subtotal')
    AND EXISTS(SELECT 1 FROM public.sale_cancellations c WHERE c.sale_id=OLD.id AND c.store_id=OLD.store_id AND c.created_by=auth.uid()) THEN
   RETURN NEW;
  END IF;
 END IF;
 RAISE EXCEPTION 'sales_are_immutable' USING ERRCODE='42501';
END $function$;
revoke execute on function public.forbid_sale_change() from public, anon, authenticated;
