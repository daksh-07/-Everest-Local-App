-- Complete the business product management lifecycle without reopening direct table writes.
create or replace function public.update_product(
  p_product_id uuid,p_name text,p_description text,p_category_id uuid,p_price numeric,
  p_sale_price numeric,p_sku text,p_delivery_eligible boolean,p_pickup_available boolean
) returns boolean language plpgsql security definer set search_path=public as $$
declare bid uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select business_id into bid from public.products where id=p_product_id for update;
 if bid is null or not public.is_business_member(bid) then raise exception 'Not authorized'; end if;
 if length(trim(coalesce(p_name,'')))<2 or length(trim(p_name))>160 then raise exception 'Product name must be between 2 and 160 characters'; end if;
 if p_price is null or p_price<0 then raise exception 'Invalid price'; end if;
 if p_sale_price is not null and (p_sale_price<0 or p_sale_price>p_price) then raise exception 'Invalid sale price'; end if;
 update public.products set name=trim(p_name),description=nullif(trim(coalesce(p_description,'')),''),category_id=p_category_id,price=round(p_price,2),sale_price=case when p_sale_price is null then null else round(p_sale_price,2) end,sku=nullif(trim(coalesce(p_sku,'')),''),delivery_eligible=coalesce(p_delivery_eligible,false),pickup_available=coalesce(p_pickup_available,true),updated_at=now() where id=p_product_id;
 return found;
end; $$;
revoke execute on function public.update_product(uuid,text,text,uuid,numeric,numeric,text,boolean,boolean) from anon;
grant execute on function public.update_product(uuid,text,text,uuid,numeric,numeric,text,boolean,boolean) to authenticated;
