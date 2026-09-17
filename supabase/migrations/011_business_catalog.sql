create unique index if not exists products_business_sku_unique on public.products(business_id,sku) where sku is not null;
create unique index if not exists service_areas_business_location_unique on public.service_areas(business_id,suburb,city,state);

create or replace function public.create_service(p_business_id uuid,p_name text,p_description text default null,p_category_id uuid default null,p_base_price numeric default null,p_duration_minutes integer default null) returns uuid language plpgsql security definer set search_path=public as $$
declare sid uuid;
begin
 if not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if length(trim(p_name))<2 or length(trim(p_name))>120 then raise exception 'Invalid service name'; end if;
 if p_base_price is not null and p_base_price<0 then raise exception 'Invalid base price'; end if;
 if p_duration_minutes is not null and (p_duration_minutes<1 or p_duration_minutes>1440) then raise exception 'Invalid duration'; end if;
 insert into public.services(business_id,name,description,category_id,base_price,duration_minutes,active) values(p_business_id,trim(p_name),nullif(trim(p_description),''),p_category_id,p_base_price,p_duration_minutes,false) returning id into sid;
 return sid;
end; $$;
grant execute on function public.create_service(uuid,text,text,uuid,numeric,integer) to authenticated;

create or replace function public.create_product(p_business_id uuid,p_name text,p_description text,p_category_id uuid,p_price numeric,p_sale_price numeric,p_sku text,p_delivery_eligible boolean,p_pickup_available boolean,p_stock integer default 0) returns uuid language plpgsql security definer set search_path=public as $$
declare pid uuid; base_slug text; new_slug text; n integer:=0;
begin
 if not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if length(trim(p_name))<2 or length(trim(p_name))>160 then raise exception 'Invalid product name'; end if;
 if p_price<0 or (p_sale_price is not null and (p_sale_price<0 or p_sale_price>p_price)) then raise exception 'Invalid product price'; end if;
 if p_stock<0 then raise exception 'Inventory cannot be negative'; end if;
 base_slug:=regexp_replace(lower(trim(p_name)),'[^a-z0-9]+','-','g');if base_slug='' then raise exception 'Product name must contain letters or numbers'; end if;new_slug:=base_slug;
 while exists(select 1 from public.products where slug=new_slug) loop n:=n+1;new_slug:=base_slug||'-'||n;end loop;
 insert into public.products(business_id,name,slug,description,category_id,price,sale_price,sku,status,delivery_eligible,pickup_available) values(p_business_id,trim(p_name),new_slug,nullif(trim(p_description),''),p_category_id,p_price,p_sale_price,nullif(trim(p_sku),''),'DRAFT',p_delivery_eligible,p_pickup_available) returning id into pid;
 insert into public.inventory(product_id,stock_quantity) values(pid,p_stock);
 return pid;
end; $$;
grant execute on function public.create_product(uuid,text,text,uuid,numeric,numeric,text,boolean,boolean,integer) to authenticated;

create or replace function public.set_product_status(p_product_id uuid,p_status public.product_status) returns boolean language plpgsql security definer set search_path=public as $$
declare bid uuid; verified boolean;
begin
 select business_id into bid from public.products where id=p_product_id;
 if bid is null or not public.is_business_member(bid) then raise exception 'Not authorized'; end if;
 select verification_status='VERIFIED' into verified from public.businesses where id=bid;
 if p_status='ACTIVE' and not coalesce(verified,false) then raise exception 'Business verification is required before publishing products'; end if;
 update public.products set status=p_status,updated_at=now() where id=p_product_id;
 return found;
end; $$;
grant execute on function public.set_product_status(uuid,public.product_status) to authenticated;

create or replace function public.add_service_area(p_business_id uuid,p_suburb text,p_city text,p_state text,p_postcode text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare aid uuid;
begin
 if not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if length(trim(p_suburb))<2 or length(trim(p_city))<2 or length(trim(p_state))<2 then raise exception 'Invalid service area'; end if;
 insert into public.service_areas(business_id,suburb,city,state,postcode) values(p_business_id,trim(p_suburb),trim(p_city),trim(p_state),nullif(trim(p_postcode),'')) on conflict(business_id,suburb,city,state) do update set active=true,postcode=excluded.postcode returning id into aid;
 return aid;
end; $$;
grant execute on function public.add_service_area(uuid,text,text,text,text) to authenticated;
