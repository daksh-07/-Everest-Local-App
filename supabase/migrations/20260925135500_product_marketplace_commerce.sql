-- Product marketplace commerce expansion.
-- Extends the existing products/orders architecture; no duplicate checkout or dispatch system.

alter table public.products
  add column if not exists short_description text,
  add column if not exists condition text,
  add column if not exists brand text,
  add column if not exists key_features text[] not null default '{}',
  add column if not exists tags text[] not null default '{}',
  add column if not exists attributes jsonb not null default '{}'::jsonb,
  add column if not exists fulfillment jsonb not null default '{}'::jsonb,
  add column if not exists track_stock boolean not null default true,
  add column if not exists made_to_order boolean not null default false,
  add column if not exists shipping_available boolean not null default false,
  add column if not exists shipping_fee numeric(12,2),
  add column if not exists dispatch_days integer,
  add column if not exists listing_quality smallint not null default 0,
  add column if not exists published_at timestamptz;

alter table public.products drop constraint if exists products_condition_check;
alter table public.products add constraint products_condition_check
  check (condition is null or condition in ('NEW','MADE_TO_ORDER','USED_LIKE_NEW','USED_GOOD','USED_FAIR'));
alter table public.products drop constraint if exists products_listing_quality_check;
alter table public.products add constraint products_listing_quality_check check (listing_quality between 0 and 100);
alter table public.products drop constraint if exists products_shipping_fee_check;
alter table public.products add constraint products_shipping_fee_check check (shipping_fee is null or shipping_fee >= 0);
alter table public.products drop constraint if exists products_dispatch_days_check;
alter table public.products add constraint products_dispatch_days_check check (dispatch_days is null or dispatch_days between 0 and 90);

alter table public.product_images
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists is_primary boolean not null default false,
  add column if not exists variant_id uuid;

create table if not exists public.product_variants(
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  option_values jsonb not null default '{}'::jsonb,
  title text not null,
  sku text,
  price numeric(12,2),
  image_id uuid references public.product_images(id) on delete set null,
  stock_quantity integer not null default 0 check(stock_quantity>=0),
  reserved_quantity integer not null default 0 check(reserved_quantity>=0 and reserved_quantity<=stock_quantity),
  low_stock_threshold integer not null default 5 check(low_stock_threshold>=0),
  available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists product_variants_product_idx on public.product_variants(product_id,sort_order,id);
create unique index if not exists product_variants_product_title_key on public.product_variants(product_id,lower(title));

do $$ begin
  if not exists(select 1 from pg_constraint where conname='product_images_variant_id_fkey') then
    alter table public.product_images add constraint product_images_variant_id_fkey foreign key(variant_id) references public.product_variants(id) on delete set null;
  end if;
end $$;

alter table public.cart_items add column if not exists variant_id uuid references public.product_variants(id) on delete restrict;
alter table public.order_items add column if not exists variant_id uuid references public.product_variants(id) on delete set null;
alter table public.order_items add column if not exists variant_snapshot jsonb;

alter table public.cart_items drop constraint if exists cart_items_cart_id_product_id_key;
create unique index if not exists cart_items_cart_product_variant_key
  on public.cart_items(cart_id,product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid));

insert into public.categories(name,slug,kind,active) values
 ('Auto','product-auto','PRODUCT',true),
 ('Home','product-home','PRODUCT',true),
 ('Beauty','product-beauty','PRODUCT',true),
 ('Fashion','product-fashion','PRODUCT',true),
 ('Food','product-food','PRODUCT',true),
 ('Electronics','product-electronics','PRODUCT',true),
 ('Pets','product-pets','PRODUCT',true),
 ('Sports','product-sports','PRODUCT',true),
 ('Tools','product-tools','PRODUCT',true),
 ('Gifts','product-gifts','PRODUCT',true),
 ('Local Handmade','product-local-handmade','PRODUCT',true),
 ('Other','product-other','PRODUCT',true)
on conflict(slug) do update set name=excluded.name,kind='PRODUCT',active=true;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-media','product-media',false,12582912,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.product_variants enable row level security;

drop policy if exists product_variants_public_read on public.product_variants;
create policy product_variants_public_read on public.product_variants for select
to anon,authenticated
using(
  exists(
    select 1 from public.products p join public.businesses b on b.id=p.business_id
    where p.id=product_id
      and ((p.status in ('ACTIVE','OUT_OF_STOCK') and b.status='ACTIVE' and b.verification_status='VERIFIED')
        or public.is_business_member(p.business_id) or public.is_admin())
  )
);

drop policy if exists product_variants_business_write on public.product_variants;
create policy product_variants_business_write on public.product_variants for all
to authenticated
using(exists(select 1 from public.products p where p.id=product_id and (public.is_business_member(p.business_id) or public.is_admin())))
with check(exists(select 1 from public.products p where p.id=product_id and (public.is_business_member(p.business_id) or public.is_admin())));

drop policy if exists product_images_business_write on public.product_images;
create policy product_images_business_write on public.product_images for all
to authenticated
using(exists(select 1 from public.products p where p.id=product_id and (public.is_business_member(p.business_id) or public.is_admin())))
with check(exists(select 1 from public.products p where p.id=product_id and (public.is_business_member(p.business_id) or public.is_admin())));

drop policy if exists product_media_member_insert on storage.objects;
create policy product_media_member_insert on storage.objects for insert to authenticated
with check(
  bucket_id='product-media'
  and exists(
    select 1 from public.products p
    where p.id=(storage.foldername(name))[2]::uuid
      and p.business_id=(storage.foldername(name))[1]::uuid
      and public.is_business_member(p.business_id)
  )
);
drop policy if exists product_media_member_select on storage.objects;
create policy product_media_member_select on storage.objects for select to authenticated
using(
  bucket_id='product-media'
  and exists(
    select 1 from public.products p
    where p.id=(storage.foldername(name))[2]::uuid
      and (
        public.is_business_member(p.business_id)
        or exists(select 1 from public.businesses b where b.id=p.business_id and b.status='ACTIVE' and b.verification_status='VERIFIED' and p.status in ('ACTIVE','OUT_OF_STOCK'))
      )
  )
);
drop policy if exists product_media_member_update on storage.objects;
create policy product_media_member_update on storage.objects for update to authenticated
using(bucket_id='product-media' and exists(select 1 from public.products p where p.id=(storage.foldername(name))[2]::uuid and public.is_business_member(p.business_id)))
with check(bucket_id='product-media' and exists(select 1 from public.products p where p.id=(storage.foldername(name))[2]::uuid and public.is_business_member(p.business_id)));
drop policy if exists product_media_member_delete on storage.objects;
create policy product_media_member_delete on storage.objects for delete to authenticated
using(bucket_id='product-media' and exists(select 1 from public.products p where p.id=(storage.foldername(name))[2]::uuid and public.is_business_member(p.business_id)));

create or replace function public.product_listing_quality(p_product_id uuid)
returns integer language sql stable security invoker set search_path=public as $$
 select least(100,
   (case when exists(select 1 from public.product_images i where i.product_id=p_product_id) then 25 else 0 end) +
   (case when length(coalesce(p.name,''))>=3 then 10 else 0 end) +
   (case when p.category_id is not null then 10 else 0 end) +
   (case when p.price>=0 then 10 else 0 end) +
   (case when length(coalesce(p.description,''))>=40 then 15 else 0 end) +
   (case when cardinality(p.key_features)>=3 then 10 else 0 end) +
   (case when p.pickup_available or p.delivery_eligible or p.shipping_available then 10 else 0 end) +
   (case when (select count(*) from public.product_images i where i.product_id=p_product_id)>=3 then 10 else 0 end)
 )::integer
 from public.products p where p.id=p_product_id
$$;

create or replace function public.create_product(
 p_business_id uuid,p_name text,p_description text,p_category_id uuid,p_price numeric,p_sale_price numeric,p_sku text,
 p_delivery_eligible boolean,p_pickup_available boolean,p_stock integer default 0
) returns uuid language plpgsql security definer set search_path=public as $$
declare pid uuid; base_slug text; new_slug text; n integer:=0;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Business access is required'; end if;
 if length(trim(coalesce(p_name,'')))<2 or length(trim(p_name))>160 then raise exception 'Invalid product name'; end if;
 if p_price is null or p_price<0 or (p_sale_price is not null and (p_sale_price<0 or p_sale_price>p_price)) then raise exception 'Invalid product price'; end if;
 if p_stock<0 then raise exception 'Inventory cannot be negative'; end if;
 base_slug:=regexp_replace(lower(trim(p_name)),'[^a-z0-9]+','-','g');
 if base_slug='' then base_slug:='product'; end if;
 new_slug:=base_slug;
 while exists(select 1 from public.products where slug=new_slug) loop n:=n+1;new_slug:=base_slug||'-'||n;end loop;
 insert into public.products(business_id,name,slug,description,category_id,price,sale_price,sku,status,delivery_eligible,pickup_available)
 values(p_business_id,trim(p_name),new_slug,nullif(trim(coalesce(p_description,'')),''),p_category_id,round(p_price,2),
  case when p_sale_price is null then null else round(p_sale_price,2) end,nullif(trim(coalesce(p_sku,'')),''),'DRAFT',coalesce(p_delivery_eligible,false),coalesce(p_pickup_available,true))
 returning id into pid;
 insert into public.inventory(product_id,stock_quantity) values(pid,p_stock);
 return pid;
end $$;

create or replace function public.update_product_v2(
 p_product_id uuid,p_name text,p_short_description text,p_description text,p_category_id uuid,p_price numeric,p_sale_price numeric,
 p_condition text,p_brand text,p_key_features text[],p_tags text[],p_attributes jsonb,p_fulfillment jsonb,
 p_track_stock boolean,p_made_to_order boolean,p_delivery_eligible boolean,p_pickup_available boolean,p_shipping_available boolean,
 p_shipping_fee numeric,p_dispatch_days integer,p_sku text
) returns boolean language plpgsql security definer set search_path=public as $$
declare bid uuid; q integer;
begin
 select business_id into bid from public.products where id=p_product_id for update;
 if bid is null or auth.uid() is null or not public.is_business_member(bid) then raise exception 'Not authorized'; end if;
 if length(trim(coalesce(p_name,'')))<2 or length(trim(p_name))>160 then raise exception 'Invalid product name'; end if;
 if p_price is null or p_price<0 or (p_sale_price is not null and (p_sale_price<0 or p_sale_price>p_price)) then raise exception 'Invalid product price'; end if;
 if not(coalesce(p_pickup_available,false) or coalesce(p_delivery_eligible,false) or coalesce(p_shipping_available,false)) then raise exception 'At least one fulfilment method is required'; end if;
 update public.products set
  name=trim(p_name),short_description=nullif(trim(coalesce(p_short_description,'')),''),
  description=nullif(trim(coalesce(p_description,'')),''),category_id=p_category_id,price=round(p_price,2),
  sale_price=case when p_sale_price is null then null else round(p_sale_price,2) end,
  condition=nullif(p_condition,''),brand=nullif(trim(coalesce(p_brand,'')),''),
  key_features=coalesce(p_key_features,'{}'),tags=coalesce(p_tags,'{}'),attributes=coalesce(p_attributes,'{}'::jsonb),
  fulfillment=coalesce(p_fulfillment,'{}'::jsonb),track_stock=coalesce(p_track_stock,true),made_to_order=coalesce(p_made_to_order,false),
  delivery_eligible=coalesce(p_delivery_eligible,false),pickup_available=coalesce(p_pickup_available,false),
  shipping_available=coalesce(p_shipping_available,false),shipping_fee=p_shipping_fee,dispatch_days=p_dispatch_days,
  sku=nullif(trim(coalesce(p_sku,'')),''),updated_at=now()
 where id=p_product_id;
 q:=public.product_listing_quality(p_product_id);
 update public.products set listing_quality=coalesce(q,0) where id=p_product_id;
 return true;
end $$;

create or replace function public.upsert_product_variant(
 p_product_id uuid,p_variant_id uuid,p_title text,p_option_values jsonb,p_price numeric,p_sku text,p_stock integer,
 p_low_stock_threshold integer,p_available boolean,p_sort_order integer
) returns uuid language plpgsql security definer set search_path=public as $$
declare bid uuid; vid uuid;
begin
 select business_id into bid from public.products where id=p_product_id;
 if bid is null or auth.uid() is null or not public.is_business_member(bid) then raise exception 'Not authorized'; end if;
 if length(trim(coalesce(p_title,'')))<1 then raise exception 'Variant title is required'; end if;
 if p_price is not null and p_price<0 then raise exception 'Invalid variant price'; end if;
 if coalesce(p_stock,0)<0 or coalesce(p_low_stock_threshold,0)<0 then raise exception 'Invalid stock'; end if;
 if p_variant_id is null then
  insert into public.product_variants(product_id,title,option_values,price,sku,stock_quantity,low_stock_threshold,available,sort_order)
  values(p_product_id,trim(p_title),coalesce(p_option_values,'{}'::jsonb),p_price,nullif(trim(coalesce(p_sku,'')),''),coalesce(p_stock,0),coalesce(p_low_stock_threshold,5),coalesce(p_available,true),coalesce(p_sort_order,0))
  returning id into vid;
 else
  update public.product_variants set title=trim(p_title),option_values=coalesce(p_option_values,'{}'::jsonb),price=p_price,
   sku=nullif(trim(coalesce(p_sku,'')),''),stock_quantity=greatest(coalesce(p_stock,0),reserved_quantity),
   low_stock_threshold=coalesce(p_low_stock_threshold,5),available=coalesce(p_available,true),sort_order=coalesce(p_sort_order,0),updated_at=now()
  where id=p_variant_id and product_id=p_product_id returning id into vid;
  if vid is null then raise exception 'Variant not found'; end if;
 end if;
 return vid;
end $$;

create or replace function public.set_product_status(p_product_id uuid,p_status public.product_status)
returns boolean language plpgsql security definer set search_path=public as $$
declare bid uuid; verified boolean; has_photo boolean; p record; has_stock boolean;
begin
 select * into p from public.products where id=p_product_id for update;
 bid:=p.business_id;
 if bid is null or auth.uid() is null or not public.is_business_member(bid) then raise exception 'Not authorized'; end if;
 if p_status='ACTIVE' then
  select verification_status='VERIFIED' into verified from public.businesses where id=bid and status='ACTIVE';
  select exists(select 1 from public.product_images where product_id=p_product_id) into has_photo;
  if not coalesce(verified,false) then raise exception 'Business verification is required before publishing products'; end if;
  if not has_photo then raise exception 'Add at least one product photo before publishing'; end if;
  if p.category_id is null or length(trim(coalesce(p.description,'')))<10 then raise exception 'Category and description are required before publishing'; end if;
  if not(p.pickup_available or p.delivery_eligible or p.shipping_available) then raise exception 'Choose at least one fulfilment method'; end if;
  if exists(select 1 from public.product_variants where product_id=p_product_id) then
    select exists(select 1 from public.product_variants where product_id=p_product_id and available and (not p.track_stock or stock_quantity-reserved_quantity>0 or p.made_to_order)) into has_stock;
  else
    select (not p.track_stock or p.made_to_order or exists(select 1 from public.inventory where product_id=p_product_id and stock_quantity-reserved_quantity>0)) into has_stock;
  end if;
  if not coalesce(has_stock,false) then raise exception 'Product has no available stock'; end if;
 end if;
 update public.products set status=p_status,published_at=case when p_status='ACTIVE' then coalesce(published_at,now()) else published_at end,
  listing_quality=coalesce(public.product_listing_quality(p_product_id),0),updated_at=now() where id=p_product_id;
 return found;
end $$;

create or replace function public.set_my_cart_item_v2(p_product_id uuid,p_variant_id uuid,p_quantity integer)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();cid uuid;active_oid uuid;product_business uuid;other_business uuid;available_stock integer;has_variants boolean;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_product_id is null or p_quantity is null or p_quantity<0 or p_quantity>99 then raise exception 'Invalid cart quantity'; end if;
 select id,active_checkout_order_id into cid,active_oid from public.carts where customer_id=uid for update;
 if cid is null then insert into public.carts(customer_id) values(uid) on conflict(customer_id) do update set updated_at=now() returning id,active_checkout_order_id into cid,active_oid; end if;
 if p_quantity=0 then delete from public.cart_items where cart_id=cid and product_id=p_product_id and variant_id is not distinct from p_variant_id;return;end if;
 select p.business_id into product_business from public.products p join public.businesses b on b.id=p.business_id
 where p.id=p_product_id and p.status='ACTIVE' and b.status='ACTIVE' and b.verification_status='VERIFIED' and b.accepts_orders;
 if product_business is null then raise exception 'Product unavailable'; end if;
 select exists(select 1 from public.product_variants where product_id=p_product_id) into has_variants;
 if has_variants and p_variant_id is null then raise exception 'Select a product option'; end if;
 if p_variant_id is not null then
  select stock_quantity-reserved_quantity into available_stock from public.product_variants where id=p_variant_id and product_id=p_product_id and available for update;
  if available_stock is null then raise exception 'Variant unavailable'; end if;
 else
  select i.stock_quantity-i.reserved_quantity into available_stock from public.inventory i where i.product_id=p_product_id for update;
 end if;
 if (select track_stock from public.products where id=p_product_id) and not (select made_to_order from public.products where id=p_product_id) and coalesce(available_stock,0)<p_quantity then raise exception 'Insufficient stock'; end if;
 select p.business_id into other_business from public.cart_items ci join public.products p on p.id=ci.product_id where ci.cart_id=cid and ci.product_id<>p_product_id limit 1;
 if other_business is not null and other_business<>product_business then raise exception 'Cart can contain products from one business at a time'; end if;
 insert into public.cart_items(cart_id,product_id,variant_id,quantity) values(cid,p_product_id,p_variant_id,p_quantity)
 on conflict(cart_id,product_id,(coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)))
 do update set quantity=excluded.quantity;
 update public.carts set updated_at=now() where id=cid;
end $$;

create or replace function public.set_my_cart_item(p_product_id uuid,p_quantity integer)
returns void language plpgsql security definer set search_path=public as $$
begin perform public.set_my_cart_item_v2(p_product_id,null,p_quantity);end $$;

create or replace function public.shop_products(
 p_query text default null,p_category_id uuid default null,p_min_price numeric default null,p_max_price numeric default null,
 p_pickup boolean default null,p_delivery boolean default null,p_shipping boolean default null,p_in_stock boolean default true,
 p_limit integer default 24,p_offset integer default 0,p_business_id uuid default null
) returns table(
 id uuid,business_id uuid,category_id uuid,name text,short_description text,price numeric,sale_price numeric,status public.product_status,
 pickup_available boolean,delivery_eligible boolean,shipping_available boolean,brand text,created_at timestamptz,
 business_name text,suburb text,city text,state text,primary_image_path text,available_quantity integer,variant_count bigint
) language sql stable security invoker set search_path=public as $$
 select p.id,p.business_id,p.category_id,p.name,p.short_description,p.price,p.sale_price,p.status,p.pickup_available,p.delivery_eligible,p.shipping_available,p.brand,p.created_at,
  b.name,b.suburb,b.city,b.state,
  (select coalesce(i.storage_path,i.url) from public.product_images i where i.product_id=p.id order by i.is_primary desc,i.sort_order,i.created_at limit 1),
  case when exists(select 1 from public.product_variants v where v.product_id=p.id)
   then coalesce((select sum(greatest(0,v.stock_quantity-v.reserved_quantity))::int from public.product_variants v where v.product_id=p.id and v.available),0)
   else coalesce((select greatest(0,i.stock_quantity-i.reserved_quantity) from public.inventory i where i.product_id=p.id),0) end,
  (select count(*) from public.product_variants v where v.product_id=p.id)
 from public.products p join public.businesses b on b.id=p.business_id
 where p.status in ('ACTIVE','OUT_OF_STOCK') and b.status='ACTIVE' and b.verification_status='VERIFIED' and b.accepts_orders
  and (p_query is null or trim(p_query)='' or
    to_tsvector('simple',coalesce(p.name,'')||' '||coalesce(p.description,'')||' '||coalesce(p.brand,'')||' '||array_to_string(p.tags,' '))
    @@ plainto_tsquery('simple',p_query))
  and (p_category_id is null or p.category_id=p_category_id)
  and (p_business_id is null or p.business_id=p_business_id)
  and (p_min_price is null or coalesce(p.sale_price,p.price)>=p_min_price)
  and (p_max_price is null or coalesce(p.sale_price,p.price)<=p_max_price)
  and (p_pickup is null or p.pickup_available=p_pickup)
  and (p_delivery is null or p.delivery_eligible=p_delivery)
  and (p_shipping is null or p.shipping_available=p_shipping)
  and (not coalesce(p_in_stock,true) or p.made_to_order or not p.track_stock or
    case when exists(select 1 from public.product_variants v where v.product_id=p.id)
      then exists(select 1 from public.product_variants v where v.product_id=p.id and v.available and v.stock_quantity-v.reserved_quantity>0)
      else exists(select 1 from public.inventory i where i.product_id=p.id and i.stock_quantity-i.reserved_quantity>0) end)
 order by p.published_at desc nulls last,p.created_at desc
 limit greatest(1,least(coalesce(p_limit,24),60)) offset greatest(0,coalesce(p_offset,0))
$$;

revoke all on function public.update_product_v2(uuid,text,text,text,uuid,numeric,numeric,text,text,text[],text[],jsonb,jsonb,boolean,boolean,boolean,boolean,boolean,numeric,integer,text) from public,anon;
grant execute on function public.update_product_v2(uuid,text,text,text,uuid,numeric,numeric,text,text,text[],text[],jsonb,jsonb,boolean,boolean,boolean,boolean,boolean,numeric,integer,text) to authenticated;
revoke all on function public.upsert_product_variant(uuid,uuid,text,jsonb,numeric,text,integer,integer,boolean,integer) from public,anon;
grant execute on function public.upsert_product_variant(uuid,uuid,text,jsonb,numeric,text,integer,integer,boolean,integer) to authenticated;
revoke all on function public.set_my_cart_item_v2(uuid,uuid,integer) from public,anon;
grant execute on function public.set_my_cart_item_v2(uuid,uuid,integer) to authenticated;
grant execute on function public.shop_products(text,uuid,numeric,numeric,boolean,boolean,boolean,boolean,integer,integer,uuid) to anon,authenticated;
grant execute on function public.product_listing_quality(uuid) to authenticated;


-- Final variant-aware cart mutation: preserve pending-checkout cancellation/reservation release.
create or replace function public.set_my_cart_item_v2(p_product_id uuid,p_variant_id uuid,p_quantity integer)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();cid uuid;active_oid uuid;product_business uuid;other_business uuid;available_stock integer;has_variants boolean;track boolean;made boolean;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_product_id is null or p_quantity is null or p_quantity<0 or p_quantity>99 then raise exception 'Invalid cart quantity'; end if;
 select id,active_checkout_order_id into cid,active_oid from public.carts where customer_id=uid for update;
 if cid is null then insert into public.carts(customer_id) values(uid) on conflict(customer_id) do update set updated_at=now() returning id,active_checkout_order_id into cid,active_oid; end if;

 if active_oid is not null and exists(select 1 from public.orders where id=active_oid and customer_id=uid and status='PENDING' and payment_status='PENDING') then
  update public.product_variants v set reserved_quantity=greatest(0,v.reserved_quantity-oi.quantity),updated_at=now()
    from public.order_items oi where oi.order_id=active_oid and oi.variant_id=v.id;
  update public.inventory i set reserved_quantity=greatest(0,i.reserved_quantity-oi.quantity),updated_at=now()
    from public.order_items oi where oi.order_id=active_oid and oi.variant_id is null and oi.product_id=i.product_id;
  update public.orders set status='CANCELLED',payment_status='FAILED',updated_at=now() where id=active_oid and customer_id=uid and status='PENDING' and payment_status='PENDING';
  update public.payments set status='FAILED',updated_at=now() where order_id=active_oid and customer_id=uid and status='PENDING';
  update public.carts set active_checkout_order_id=null,updated_at=now() where id=cid;
 elsif active_oid is not null then
  update public.carts set active_checkout_order_id=null,updated_at=now() where id=cid;
 end if;

 if p_quantity=0 then delete from public.cart_items where cart_id=cid and product_id=p_product_id and variant_id is not distinct from p_variant_id;return;end if;
 select p.business_id,p.track_stock,p.made_to_order into product_business,track,made from public.products p join public.businesses b on b.id=p.business_id
 where p.id=p_product_id and p.status='ACTIVE' and b.status='ACTIVE' and b.verification_status='VERIFIED' and b.accepts_orders;
 if product_business is null then raise exception 'Product unavailable'; end if;
 select exists(select 1 from public.product_variants where product_id=p_product_id) into has_variants;
 if has_variants and p_variant_id is null then raise exception 'Select a product option'; end if;
 if p_variant_id is not null then
  select stock_quantity-reserved_quantity into available_stock from public.product_variants where id=p_variant_id and product_id=p_product_id and available for update;
  if available_stock is null then raise exception 'Variant unavailable'; end if;
 else
  select i.stock_quantity-i.reserved_quantity into available_stock from public.inventory i where i.product_id=p_product_id for update;
 end if;
 if track and not made and coalesce(available_stock,0)<p_quantity then raise exception 'Insufficient stock'; end if;
 select p.business_id into other_business from public.cart_items ci join public.products p on p.id=ci.product_id where ci.cart_id=cid and (ci.product_id<>p_product_id or ci.variant_id is distinct from p_variant_id) limit 1;
 if other_business is not null and other_business<>product_business then raise exception 'Cart can contain products from one business at a time'; end if;
 insert into public.cart_items(cart_id,product_id,variant_id,quantity) values(cid,p_product_id,p_variant_id,p_quantity)
 on conflict(cart_id,product_id,(coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)))
 do update set quantity=excluded.quantity;
 update public.carts set updated_at=now() where id=cid;
end $$;

create or replace function public.create_order_from_cart(
  p_idempotency_key text,
  p_delivery_method text default 'PICKUP',
  p_delivery_address jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
 uid uuid:=auth.uid();cid uuid;active_oid uuid;active_status public.order_status;active_payment public.payment_status;
 item record;bid uuid;subtotal numeric:=0;total numeric;oid uuid;onum text;existing_status public.order_status;existing_payment public.payment_status;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if length(coalesce(p_idempotency_key,''))<12 or length(p_idempotency_key)>128 then raise exception 'Invalid idempotency key'; end if;
 if p_delivery_method not in ('PICKUP','EVEREST_DELIVERY','SAME_DAY') then raise exception 'Invalid delivery method'; end if;
 if p_delivery_method<>'PICKUP' and (p_delivery_address is null or jsonb_typeof(p_delivery_address)<>'object' or length(trim(coalesce(p_delivery_address->>'address_line','')))<5) then raise exception 'A valid delivery address is required'; end if;

 select p.order_id,o.status,o.payment_status into oid,existing_status,existing_payment from public.payments p join public.orders o on o.id=p.order_id where p.idempotency_key=p_idempotency_key and p.customer_id=uid limit 1;
 if oid is not null then
  if existing_status='PENDING' and existing_payment='PENDING' then select order_number into onum from public.orders where id=oid;return jsonb_build_object('order_id',oid,'order_number',onum,'reused',true);end if;
  raise exception 'Checkout attempt is no longer pending; start a new checkout attempt';
 end if;

 select id,active_checkout_order_id into cid,active_oid from public.carts where customer_id=uid for update;
 if cid is null then raise exception 'Cart is empty'; end if;
 if active_oid is not null then
  select status,payment_status into active_status,active_payment from public.orders where id=active_oid;
  if active_status='PENDING' and active_payment='PENDING' then select order_number into onum from public.orders where id=active_oid;return jsonb_build_object('order_id',active_oid,'order_number',onum,'reused',true);end if;
  update public.carts set active_checkout_order_id=null where id=cid;
 end if;

 create temporary table if not exists _checkout_items(
   cart_item_id uuid,product_id uuid,variant_id uuid,quantity integer,unit_price numeric,name text,business_id uuid,variant_snapshot jsonb,track_stock boolean,made_to_order boolean
 ) on commit drop;
 delete from _checkout_items;

 for item in
  select ci.id cart_item_id,ci.product_id,ci.variant_id,ci.quantity,p.name,p.price,p.sale_price,p.status,p.business_id,p.delivery_eligible,p.pickup_available,p.shipping_available,p.track_stock,p.made_to_order,
   b.status business_status,b.verification_status,b.accepts_orders,
   v.id v_id,v.title v_title,v.option_values v_options,v.price v_price,v.stock_quantity v_stock,v.reserved_quantity v_reserved,v.available v_available
  from public.cart_items ci
  join public.products p on p.id=ci.product_id
  join public.businesses b on b.id=p.business_id
  left join public.product_variants v on v.id=ci.variant_id and v.product_id=p.id
  where ci.cart_id=cid
 loop
  if item.status<>'ACTIVE' or item.business_status<>'ACTIVE' or item.verification_status<>'VERIFIED' or not item.accepts_orders then raise exception 'A product is no longer available for purchase'; end if;
  if p_delivery_method='PICKUP' and not item.pickup_available then raise exception 'A product in the cart is not available for pickup'; end if;
  if p_delivery_method in ('EVEREST_DELIVERY','SAME_DAY') and not item.delivery_eligible then raise exception 'A product in the cart is not eligible for delivery'; end if;
  if bid is null then bid:=item.business_id;elsif bid<>item.business_id then raise exception 'Checkout currently supports one business per order';end if;

  if item.variant_id is not null then
   if item.v_id is null or not item.v_available then raise exception 'A selected product option is unavailable';end if;
   if item.track_stock and not item.made_to_order then
    perform 1 from public.product_variants v where v.id=item.variant_id and v.product_id=item.product_id and v.available and v.stock_quantity-v.reserved_quantity>=item.quantity for update;
    if not found then raise exception 'Insufficient variant stock';end if;
   end if;
   item.unit_price:=coalesce(item.v_price,item.sale_price,item.price);
   insert into _checkout_items values(item.cart_item_id,item.product_id,item.variant_id,item.quantity,item.unit_price,item.name,item.business_id,jsonb_build_object('id',item.variant_id,'title',item.v_title,'options',item.v_options),item.track_stock,item.made_to_order);
  else
   if exists(select 1 from public.product_variants where product_id=item.product_id) then raise exception 'A product option must be selected';end if;
   if item.track_stock and not item.made_to_order then
    perform 1 from public.inventory i where i.product_id=item.product_id and i.stock_quantity-i.reserved_quantity>=item.quantity for update;
    if not found then raise exception 'Insufficient stock';end if;
   end if;
   item.unit_price:=coalesce(item.sale_price,item.price);
   insert into _checkout_items values(item.cart_item_id,item.product_id,null,item.quantity,item.unit_price,item.name,item.business_id,null,item.track_stock,item.made_to_order);
  end if;
  subtotal:=subtotal+(item.unit_price*item.quantity);
 end loop;
 if not exists(select 1 from _checkout_items) then raise exception 'Cart is empty';end if;

 total:=round(subtotal,2);onum:='EL-'||upper(substr(encode(gen_random_bytes(6),'hex'),1,10));
 insert into public.orders(order_number,customer_id,business_id,status,payment_status,subtotal,delivery_fee,marketplace_fee,tax,total,delivery_method,delivery_address)
 values(onum,uid,bid,'PENDING','PENDING',subtotal,0,0,0,total,p_delivery_method,p_delivery_address) returning id into oid;
 update public.carts set active_checkout_order_id=oid,updated_at=now() where id=cid;

 for item in select * from _checkout_items loop
  if item.track_stock and not item.made_to_order then
   if item.variant_id is not null then update public.product_variants set reserved_quantity=reserved_quantity+item.quantity,updated_at=now() where id=item.variant_id;
   else update public.inventory set reserved_quantity=reserved_quantity+item.quantity,updated_at=now() where product_id=item.product_id;end if;
  end if;
  insert into public.order_items(order_id,product_id,variant_id,variant_snapshot,product_name,unit_price,quantity,line_total,source_cart_item_id)
  values(oid,item.product_id,item.variant_id,item.variant_snapshot,item.name,item.unit_price,item.quantity,round(item.unit_price*item.quantity,2),item.cart_item_id);
 end loop;
 insert into public.payments(customer_id,order_id,amount,currency,status,idempotency_key) values(uid,oid,total,'aud','PENDING',p_idempotency_key);
 return jsonb_build_object('order_id',oid,'order_number',onum,'total',total,'reused',false);
end $$;

revoke all on function public.set_my_cart_item_v2(uuid,uuid,integer) from public,anon;
grant execute on function public.set_my_cart_item_v2(uuid,uuid,integer) to authenticated;
grant execute on function public.create_order_from_cart(text,text,jsonb) to authenticated;


-- Tighten public media rows to the same business publication boundary as products.
drop policy if exists product_images_public_read on public.product_images;
create policy product_images_public_read on public.product_images for select
to anon,authenticated
using(
  exists(
    select 1 from public.products p
    join public.businesses b on b.id=p.business_id
    where p.id=product_id
      and (
        (p.status in ('ACTIVE','OUT_OF_STOCK') and b.status='ACTIVE' and b.verification_status='VERIFIED')
        or public.is_business_member(p.business_id)
        or public.is_admin()
      )
  )
);

-- Business-friendly inventory setter for simple (non-variant) listings.
create or replace function public.set_product_inventory(p_product_id uuid,p_quantity integer,p_low_stock_threshold integer default 5)
returns boolean language plpgsql security definer set search_path=public as $$
declare bid uuid;reserved integer;
begin
 select p.business_id,i.reserved_quantity into bid,reserved
 from public.products p join public.inventory i on i.product_id=p.id
 where p.id=p_product_id for update of i;
 if bid is null or auth.uid() is null or not public.is_business_member(bid) then raise exception 'Not authorized'; end if;
 if p_quantity is null or p_quantity<coalesce(reserved,0) then raise exception 'Stock cannot be below reserved quantity'; end if;
 if p_low_stock_threshold is null or p_low_stock_threshold<0 then raise exception 'Invalid low stock threshold'; end if;
 update public.inventory set stock_quantity=p_quantity,low_stock_threshold=p_low_stock_threshold,updated_at=now() where product_id=p_product_id;
 update public.products set
  status=case
    when status='ACTIVE' and track_stock and not made_to_order and p_quantity-coalesce(reserved,0)<=0 then 'OUT_OF_STOCK'
    when status='OUT_OF_STOCK' and (not track_stock or made_to_order or p_quantity-coalesce(reserved,0)>0) then 'ACTIVE'
    else status end,
  updated_at=now()
 where id=p_product_id;
 return true;
end $$;

-- Variant media assignment must remain within the same product and business.
create or replace function public.set_product_variant_image(p_variant_id uuid,p_image_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare pid uuid;bid uuid;
begin
 select v.product_id,p.business_id into pid,bid from public.product_variants v join public.products p on p.id=v.product_id where v.id=p_variant_id;
 if pid is null or auth.uid() is null or not public.is_business_member(bid) then raise exception 'Not authorized'; end if;
 if p_image_id is not null and not exists(select 1 from public.product_images i where i.id=p_image_id and i.product_id=pid) then raise exception 'Image does not belong to this product'; end if;
 update public.product_variants set image_id=p_image_id,updated_at=now() where id=p_variant_id;
 return found;
end $$;

-- Shipping uses the existing order pipeline without inventing a carrier integration.
create or replace function public.create_order_from_cart(
  p_idempotency_key text,
  p_delivery_method text default 'PICKUP',
  p_delivery_address jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
 uid uuid:=auth.uid();cid uuid;active_oid uuid;active_status public.order_status;active_payment public.payment_status;
 item record;bid uuid;subtotal numeric:=0;delivery_total numeric:=0;total numeric;oid uuid;onum text;existing_status public.order_status;existing_payment public.payment_status;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if length(coalesce(p_idempotency_key,''))<12 or length(p_idempotency_key)>128 then raise exception 'Invalid idempotency key'; end if;
 if p_delivery_method not in ('PICKUP','EVEREST_DELIVERY','SAME_DAY','SHIPPING') then raise exception 'Invalid delivery method'; end if;
 if p_delivery_method<>'PICKUP' and (p_delivery_address is null or jsonb_typeof(p_delivery_address)<>'object' or length(trim(coalesce(p_delivery_address->>'address_line','')))<5) then raise exception 'A valid delivery address is required'; end if;

 select p.order_id,o.status,o.payment_status into oid,existing_status,existing_payment from public.payments p join public.orders o on o.id=p.order_id where p.idempotency_key=p_idempotency_key and p.customer_id=uid limit 1;
 if oid is not null then
  if existing_status='PENDING' and existing_payment='PENDING' then select order_number into onum from public.orders where id=oid;return jsonb_build_object('order_id',oid,'order_number',onum,'reused',true);end if;
  raise exception 'Checkout attempt is no longer pending; start a new checkout attempt';
 end if;

 select id,active_checkout_order_id into cid,active_oid from public.carts where customer_id=uid for update;
 if cid is null then raise exception 'Cart is empty'; end if;
 if active_oid is not null then
  select status,payment_status into active_status,active_payment from public.orders where id=active_oid;
  if active_status='PENDING' and active_payment='PENDING' then select order_number into onum from public.orders where id=active_oid;return jsonb_build_object('order_id',active_oid,'order_number',onum,'reused',true);end if;
  update public.carts set active_checkout_order_id=null where id=cid;
 end if;

 create temporary table if not exists _checkout_items(
   cart_item_id uuid,product_id uuid,variant_id uuid,quantity integer,unit_price numeric,name text,business_id uuid,variant_snapshot jsonb,track_stock boolean,made_to_order boolean
 ) on commit drop;
 delete from _checkout_items;

 for item in
  select ci.id cart_item_id,ci.product_id,ci.variant_id,ci.quantity,p.name,p.price,p.sale_price,p.status,p.business_id,
   p.delivery_eligible,p.pickup_available,p.shipping_available,p.shipping_fee,p.track_stock,p.made_to_order,
   b.status business_status,b.verification_status,b.accepts_orders,
   v.id v_id,v.title v_title,v.option_values v_options,v.price v_price,v.stock_quantity v_stock,v.reserved_quantity v_reserved,v.available v_available
  from public.cart_items ci
  join public.products p on p.id=ci.product_id
  join public.businesses b on b.id=p.business_id
  left join public.product_variants v on v.id=ci.variant_id and v.product_id=p.id
  where ci.cart_id=cid
 loop
  if item.status<>'ACTIVE' or item.business_status<>'ACTIVE' or item.verification_status<>'VERIFIED' or not item.accepts_orders then raise exception 'A product is no longer available for purchase'; end if;
  if p_delivery_method='PICKUP' and not item.pickup_available then raise exception 'A product in the cart is not available for pickup'; end if;
  if p_delivery_method in ('EVEREST_DELIVERY','SAME_DAY') and not item.delivery_eligible then raise exception 'A product in the cart is not eligible for local delivery'; end if;
  if p_delivery_method='SHIPPING' and not item.shipping_available then raise exception 'A product in the cart is not available for shipping'; end if;
  if bid is null then bid:=item.business_id;elsif bid<>item.business_id then raise exception 'Checkout currently supports one business per order';end if;

  if p_delivery_method='SHIPPING' then delivery_total:=greatest(delivery_total,coalesce(item.shipping_fee,0)); end if;

  if item.variant_id is not null then
   if item.v_id is null or not item.v_available then raise exception 'A selected product option is unavailable';end if;
   if item.track_stock and not item.made_to_order then
    perform 1 from public.product_variants v where v.id=item.variant_id and v.product_id=item.product_id and v.available and v.stock_quantity-v.reserved_quantity>=item.quantity for update;
    if not found then raise exception 'Insufficient variant stock';end if;
   end if;
   item.unit_price:=coalesce(item.v_price,item.sale_price,item.price);
   insert into _checkout_items values(item.cart_item_id,item.product_id,item.variant_id,item.quantity,item.unit_price,item.name,item.business_id,jsonb_build_object('id',item.variant_id,'title',item.v_title,'options',item.v_options),item.track_stock,item.made_to_order);
  else
   if exists(select 1 from public.product_variants where product_id=item.product_id) then raise exception 'A product option must be selected';end if;
   if item.track_stock and not item.made_to_order then
    perform 1 from public.inventory i where i.product_id=item.product_id and i.stock_quantity-i.reserved_quantity>=item.quantity for update;
    if not found then raise exception 'Insufficient stock';end if;
   end if;
   item.unit_price:=coalesce(item.sale_price,item.price);
   insert into _checkout_items values(item.cart_item_id,item.product_id,null,item.quantity,item.unit_price,item.name,item.business_id,null,item.track_stock,item.made_to_order);
  end if;
  subtotal:=subtotal+(item.unit_price*item.quantity);
 end loop;
 if not exists(select 1 from _checkout_items) then raise exception 'Cart is empty';end if;

 subtotal:=round(subtotal,2);delivery_total:=round(delivery_total,2);total:=round(subtotal+delivery_total,2);onum:='EL-'||upper(substr(encode(gen_random_bytes(6),'hex'),1,10));
 insert into public.orders(order_number,customer_id,business_id,status,payment_status,subtotal,delivery_fee,marketplace_fee,tax,total,delivery_method,delivery_address)
 values(onum,uid,bid,'PENDING','PENDING',subtotal,delivery_total,0,0,total,p_delivery_method,p_delivery_address) returning id into oid;
 update public.carts set active_checkout_order_id=oid,updated_at=now() where id=cid;

 for item in select * from _checkout_items loop
  if item.track_stock and not item.made_to_order then
   if item.variant_id is not null then update public.product_variants set reserved_quantity=reserved_quantity+item.quantity,updated_at=now() where id=item.variant_id;
   else update public.inventory set reserved_quantity=reserved_quantity+item.quantity,updated_at=now() where product_id=item.product_id;end if;
  end if;
  insert into public.order_items(order_id,product_id,variant_id,variant_snapshot,product_name,unit_price,quantity,line_total,source_cart_item_id)
  values(oid,item.product_id,item.variant_id,item.variant_snapshot,item.name,item.unit_price,item.quantity,round(item.unit_price*item.quantity,2),item.cart_item_id);
 end loop;
 insert into public.payments(customer_id,order_id,amount,currency,status,idempotency_key) values(uid,oid,total,'aud','PENDING',p_idempotency_key);
 return jsonb_build_object('order_id',oid,'order_number',onum,'subtotal',subtotal,'delivery_fee',delivery_total,'total',total,'reused',false);
end $$;

revoke all on function public.set_product_inventory(uuid,integer,integer) from public,anon;
grant execute on function public.set_product_inventory(uuid,integer,integer) to authenticated;
revoke all on function public.set_product_variant_image(uuid,uuid) from public,anon;
grant execute on function public.set_product_variant_image(uuid,uuid) to authenticated;

grant select on public.product_variants to anon,authenticated;
revoke insert,update,delete on public.product_variants from anon,authenticated;
