-- Business and delivery-driver authorization/onboarding hardening.
-- Applications are server-authorized; role elevation occurs only through admin approval.
create table if not exists public.driver_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  service_area text not null,
  suburb text,
  city text,
  state text,
  vehicle_type text not null,
  vehicle_registration text not null,
  availability text not null,
  notes text,
  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','ACTIVE','REJECTED','SUSPENDED')),
  admin_notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.driver_applications enable row level security;

drop policy if exists driver_applications_owner_read on public.driver_applications;
create policy driver_applications_owner_read
on public.driver_applications
for select to public
using (user_id = auth.uid() or public.is_admin());

drop policy if exists driver_applications_owner_insert on public.driver_applications;
create policy driver_applications_owner_insert
on public.driver_applications
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists driver_applications_owner_update on public.driver_applications;
create policy driver_applications_owner_update
on public.driver_applications
for update to authenticated
using (user_id = auth.uid() and status = 'REJECTED')
with check (user_id = auth.uid());

drop policy if exists driver_applications_admin_update on public.driver_applications;
create policy driver_applications_admin_update
on public.driver_applications
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

revoke insert, update, delete on public.driver_applications from anon, authenticated;

create or replace function public.create_driver_application(
  p_full_name text,
  p_phone text,
  p_suburb text,
  p_city text,
  p_state text,
  p_service_area text,
  p_vehicle_type text,
  p_vehicle_registration text,
  p_availability text,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  aid uuid;
  current_role public.app_role;
  existing public.driver_applications;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select role into current_role from public.profiles where id=auth.uid();
  if current_role = 'ADMIN' then raise exception 'Administrators cannot apply as delivery drivers'; end if;
  if current_role = 'DELIVERY_DRIVER' then raise exception 'This account is already a delivery driver'; end if;
  if length(trim(coalesce(p_full_name,''))) < 2 or length(trim(p_full_name)) > 120 then raise exception 'Enter your full name'; end if;
  if length(trim(coalesce(p_phone,''))) < 6 or length(trim(p_phone)) > 40 then raise exception 'Enter a valid phone number'; end if;
  if length(trim(coalesce(p_service_area,''))) < 2 or length(trim(p_service_area)) > 120 then raise exception 'Enter your delivery service area'; end if;
  if length(trim(coalesce(p_vehicle_type,''))) < 2 or length(trim(p_vehicle_type)) > 80 then raise exception 'Enter your vehicle type'; end if;
  if length(trim(coalesce(p_vehicle_registration,''))) < 2 or length(trim(p_vehicle_registration)) > 40 then raise exception 'Enter your vehicle registration'; end if;
  if length(trim(coalesce(p_availability,''))) < 2 or length(trim(p_availability)) > 120 then raise exception 'Enter your availability'; end if;

  select * into existing from public.driver_applications where user_id=auth.uid() for update;
  if existing.id is not null and existing.status in ('PENDING','APPROVED','ACTIVE') then
    raise exception 'A driver application already exists for this account';
  end if;

  perform public.update_my_profile(p_full_name,p_phone,p_suburb,p_city,p_state);

  if existing.id is null then
    insert into public.driver_applications(
      user_id,service_area,suburb,city,state,vehicle_type,vehicle_registration,availability,notes,status
    ) values (
      auth.uid(),trim(p_service_area),nullif(trim(p_suburb),''),nullif(trim(p_city),''),
      nullif(trim(p_state),''),trim(p_vehicle_type),upper(trim(p_vehicle_registration)),
      trim(p_availability),nullif(trim(coalesce(p_notes,'')),''),
      'PENDING'
    ) returning id into aid;
  else
    update public.driver_applications
      set service_area=trim(p_service_area),
          suburb=nullif(trim(p_suburb),''),
          city=nullif(trim(p_city),''),
          state=nullif(trim(p_state),''),
          vehicle_type=trim(p_vehicle_type),
          vehicle_registration=upper(trim(p_vehicle_registration)),
          availability=trim(p_availability),
          notes=nullif(trim(coalesce(p_notes,'')),''),
          status='PENDING',
          admin_notes=null,
          reviewed_at=null,
          reviewed_by=null,
          submitted_at=now(),
          updated_at=now()
    where id=existing.id
    returning id into aid;
  end if;

  return aid;
end;
$$;
revoke execute on function public.create_driver_application(text,text,text,text,text,text,text,text,text,text) from anon;
grant execute on function public.create_driver_application(text,text,text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.admin_set_driver_application(
  p_application_id uuid,
  p_status text,
  p_notes text default null
) returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  a public.driver_applications;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  if p_status not in ('PENDING','APPROVED','ACTIVE','REJECTED','SUSPENDED') then raise exception 'Invalid driver application status'; end if;
  select * into a from public.driver_applications where id=p_application_id for update;
  if a.id is null then raise exception 'Driver application not found'; end if;

  update public.driver_applications
    set status=p_status,
        admin_notes=nullif(trim(coalesce(p_notes,'')),''),
        reviewed_by=auth.uid(),
        reviewed_at=now(),
        updated_at=now()
  where id=a.id;

  if p_status in ('APPROVED','ACTIVE') then
    update public.profiles
      set role='DELIVERY_DRIVER',updated_at=now()
    where id=a.user_id and role <> 'ADMIN';
  end if;

  insert into public.admin_actions(admin_id,action,target_type,target_id,metadata)
  values(auth.uid(),'driver_application_status','driver_application',a.id,
         jsonb_build_object('status',p_status,'user_id',a.user_id));

  return true;
end;
$$;
revoke execute on function public.admin_set_driver_application(uuid,text,text) from anon;
grant execute on function public.admin_set_driver_application(uuid,text,text) to authenticated;

create or replace function public.get_my_access_context()
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  uid uuid := auth.uid();
  profile_role public.app_role;
  business_id uuid;
  business_name text;
  business_status public.business_status;
  business_verification public.verification_status;
  driver_status text;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select role into profile_role from public.profiles where id=uid;

  select b.id,b.name,b.status,b.verification_status
    into business_id,business_name,business_status,business_verification
  from public.business_members bm
  join public.businesses b on b.id=bm.business_id
  where bm.user_id=uid and bm.member_role='OWNER'
  order by b.created_at desc
  limit 1;

  select status into driver_status
  from public.driver_applications
  where user_id=uid;

  return jsonb_build_object(
    'profile_role',profile_role,
    'business_id',business_id,
    'business_name',business_name,
    'business_status',business_status,
    'business_verification_status',business_verification,
    'driver_application_status',driver_status,
    'is_business_member',exists(select 1 from public.business_members where user_id=uid),
    'is_verified_business',coalesce(business_verification='VERIFIED',false),
    'is_active_driver',coalesce(profile_role='DELIVERY_DRIVER' and driver_status='ACTIVE',false),
    'is_admin',coalesce(profile_role='ADMIN',false)
  );
end;
$$;
revoke execute on function public.get_my_access_context() from anon;
grant execute on function public.get_my_access_context() to authenticated;

-- Creating a business is an application/profile operation, not role elevation.
create or replace function public.create_business_profile(
  p_name text,p_description text,p_category_id uuid,p_abn text,p_phone text,p_email text,
  p_suburb text,p_city text,p_state text,p_postcode text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare bid uuid; slug_base text; new_slug text; n integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(p_name))<2 or length(trim(p_name))>120 then raise exception 'Invalid business name'; end if;
  if length(trim(coalesce(p_suburb,'')))<2 then raise exception 'Suburb is required'; end if;

  if exists(select 1 from public.business_members where user_id=auth.uid() and member_role='OWNER') then
    raise exception 'A business profile already exists for this account';
  end if;

  slug_base:=regexp_replace(lower(trim(p_name)),'[^a-z0-9]+','-','g');
  new_slug:=slug_base;
  while exists(select 1 from public.businesses where slug=new_slug) loop
    n:=n+1; new_slug:=slug_base||'-'||n;
  end loop;

  insert into public.businesses(
    owner_id,name,slug,description,category_id,abn,phone,email,suburb,city,state,postcode
  ) values (
    auth.uid(),trim(p_name),new_slug,trim(p_description),p_category_id,
    nullif(trim(p_abn),''),nullif(trim(p_phone),''),
    nullif(trim(p_email),''),trim(p_suburb),trim(p_city),trim(p_state),
    nullif(trim(p_postcode),'')
  ) returning id into bid;

  insert into public.business_members(business_id,user_id,member_role)
  values(bid,auth.uid(),'OWNER');

  return bid;
end;
$$;
revoke execute on function public.create_business_profile(text,text,uuid,text,text,text,text,text,text,text) from anon;
grant execute on function public.create_business_profile(text,text,uuid,text,text,text,text,text,text,text) to authenticated;

-- Verified business privileges are enforced server-side, not only by route guards.
create or replace function public.create_service(p_business_id uuid,p_name text,p_description text default null,p_category_id uuid default null,p_base_price numeric default null,p_duration_minutes integer default null) returns uuid language plpgsql security definer set search_path=public as $$
declare sid uuid; verified boolean;
begin
  select verification_status='VERIFIED' into verified from public.businesses where id=p_business_id;
  if not public.is_business_member(p_business_id) or not coalesce(verified,false) then raise exception 'Verified business access is required'; end if;
  if length(trim(p_name))<2 or length(trim(p_name))>120 then raise exception 'Invalid service name'; end if;
  if p_base_price is not null and p_base_price<0 then raise exception 'Invalid base price'; end if;
  if p_duration_minutes is not null and (p_duration_minutes<1 or p_duration_minutes>1440) then raise exception 'Invalid duration'; end if;
  insert into public.services(business_id,name,description,category_id,base_price,duration_minutes,active)
  values(p_business_id,trim(p_name),nullif(trim(p_description),''),p_category_id,p_base_price,p_duration_minutes,false)
  returning id into sid;
  return sid;
end;
$$;
grant execute on function public.create_service(uuid,text,text,uuid,numeric,integer) to authenticated;

create or replace function public.create_product(p_business_id uuid,p_name text,p_description text,p_category_id uuid,p_price numeric,p_sale_price numeric,p_sku text,p_delivery_eligible boolean,p_pickup_available boolean,p_stock integer default 0) returns uuid language plpgsql security definer set search_path=public as $$
declare pid uuid; base_slug text; new_slug text; n integer:=0; verified boolean;
begin
  select verification_status='VERIFIED' into verified from public.businesses where id=p_business_id;
  if not public.is_business_member(p_business_id) or not coalesce(verified,false) then raise exception 'Verified business access is required'; end if;
  if length(trim(p_name))<2 or length(trim(p_name))>160 then raise exception 'Invalid product name'; end if;
  if p_price<0 or (p_sale_price is not null and (p_sale_price<0 or p_sale_price>p_price)) then raise exception 'Invalid product price'; end if;
  if p_stock<0 then raise exception 'Inventory cannot be negative'; end if;
  base_slug:=regexp_replace(lower(trim(p_name)),'[^a-z0-9]+','-','g');
  if base_slug='' then raise exception 'Product name must contain letters or numbers'; end if;
  new_slug:=base_slug;
  while exists(select 1 from public.products where slug=new_slug) loop
    n:=n+1; new_slug:=base_slug||'-'||n;
  end loop;
  insert into public.products(business_id,name,slug,description,category_id,price,sale_price,sku,status,delivery_eligible,pickup_available)
  values(p_business_id,trim(p_name),new_slug,nullif(trim(p_description),''),p_category_id,p_price,p_sale_price,nullif(trim(p_sku),''),'DRAFT',p_delivery_eligible,p_pickup_available)
  returning id into pid;
  insert into public.inventory(product_id,stock_quantity) values(pid,p_stock);
  return pid;
end;
$$;
grant execute on function public.create_product(uuid,text,text,uuid,numeric,numeric,text,boolean,boolean,integer) to authenticated;

create or replace function public.add_service_area(p_business_id uuid,p_suburb text,p_city text,p_state text,p_postcode text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare aid uuid; verified boolean;
begin
  select verification_status='VERIFIED' into verified from public.businesses where id=p_business_id;
  if not public.is_business_member(p_business_id) or not coalesce(verified,false) then raise exception 'Verified business access is required'; end if;
  if length(trim(p_suburb))<2 or length(trim(p_city))<2 or length(trim(p_state))<2 then raise exception 'Invalid service area'; end if;
  insert into public.service_areas(business_id,suburb,city,state,postcode)
  values(p_business_id,trim(p_suburb),trim(p_city),trim(p_state),nullif(trim(p_postcode),''))
  on conflict(business_id,suburb,city,state) do update set active=true,postcode=excluded.postcode
  returning id into aid;
  return aid;
end;
$$;
grant execute on function public.add_service_area(uuid,text,text,text,text) to authenticated;

create or replace function public.update_product(
  p_product_id uuid,p_name text,p_description text,p_category_id uuid,p_price numeric,
  p_sale_price numeric,p_sku text,p_delivery_eligible boolean,p_pickup_available boolean
) returns boolean
language plpgsql security definer set search_path=public
as $$
declare bid uuid; verified boolean;
begin
  select business_id into bid from public.products where id=p_product_id for update;
  select verification_status='VERIFIED' into verified from public.businesses where id=bid;
  if bid is null or not public.is_business_member(bid) or not coalesce(verified,false) then raise exception 'Verified business access is required'; end if;
  if length(trim(p_name))<2 or length(trim(p_name))>160 then raise exception 'Product name must be between 2 and 160 characters'; end if;
  if p_price is null or p_price<0 then raise exception 'Invalid price'; end if;
  if p_sale_price is not null and (p_sale_price<0 or p_sale_price>p_price) then raise exception 'Invalid sale price'; end if;
  update public.products set name=trim(p_name),description=nullif(trim(coalesce(p_description,'')),''),category_id=p_category_id,
    price=round(p_price,2),sale_price=case when p_sale_price is null then null else round(p_sale_price,2) end,
    sku=nullif(trim(coalesce(p_sku,'')),''),delivery_eligible=coalesce(p_delivery_eligible,false),
    pickup_available=coalesce(p_pickup_available,true),updated_at=now() where id=p_product_id;
  return found;
end;
$$;
grant execute on function public.update_product(uuid,text,text,uuid,numeric,numeric,text,boolean,boolean) to authenticated;

create or replace function public.set_product_status(p_product_id uuid,p_status public.product_status) returns boolean language plpgsql security definer set search_path=public as $$
declare bid uuid; verified boolean;
begin
  select business_id into bid from public.products where id=p_product_id;
  select verification_status='VERIFIED' into verified from public.businesses where id=bid;
  if bid is null or not public.is_business_member(bid) or not coalesce(verified,false) then raise exception 'Verified business access is required'; end if;
  if p_status='ACTIVE' and not coalesce(verified,false) then raise exception 'Business verification is required before publishing products'; end if;
  update public.products set status=p_status,updated_at=now() where id=p_product_id;
  return found;
end;
$$;
grant execute on function public.set_product_status(uuid,public.product_status) to authenticated;

create or replace function public.set_service_status(p_service_id uuid,p_active boolean) returns boolean language plpgsql security definer set search_path=public as $$
declare bid uuid; verified boolean;
begin
  select business_id into bid from public.services where id=p_service_id;
  select verification_status='VERIFIED' into verified from public.businesses where id=bid;
  if bid is null or not public.is_business_member(bid) or not coalesce(verified,false) then raise exception 'Verified business access is required'; end if;
  update public.services set active=p_active,updated_at=now() where id=p_service_id;
  return found;
end;
$$;
grant execute on function public.set_service_status(uuid,boolean) to authenticated;

create or replace function public.update_booking_status(p_booking_id uuid,p_next public.booking_status) returns boolean
language plpgsql security definer set search_path=public
as $$
declare b public.bookings; allowed boolean:=false; caller_business boolean:=false; verified boolean:=false;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if b.id is null then raise exception 'Booking not found'; end if;
  caller_business:=public.is_business_member(b.business_id);
  select verification_status='VERIFIED' into verified from public.businesses where id=b.business_id;
  if not (b.customer_id=auth.uid() or caller_business or public.is_admin()) then raise exception 'Not authorized'; end if;
  if caller_business and not coalesce(verified,false) and not public.is_admin() then raise exception 'Verified business access is required'; end if;
  if public.is_admin() then allowed:=true;
  elsif caller_business then allowed:=(b.status,p_next) in (('REQUESTED','PENDING_PAYMENT'),('REQUESTED','CONFIRMED'),('PENDING_PAYMENT','CONFIRMED'),('CONFIRMED','UPCOMING'),('UPCOMING','IN_PROGRESS'),('IN_PROGRESS','COMPLETED'),('REQUESTED','CANCELLED'),('PENDING_PAYMENT','CANCELLED'),('CONFIRMED','CANCELLED'),('UPCOMING','CANCELLED'),('CONFIRMED','DISPUTED'),('UPCOMING','DISPUTED'),('IN_PROGRESS','DISPUTED'));
  else allowed:=(b.status,p_next) in (('REQUESTED','CANCELLED'),('PENDING_PAYMENT','CANCELLED'),('CONFIRMED','CANCELLED'),('UPCOMING','CANCELLED'),('CONFIRMED','DISPUTED'),('UPCOMING','DISPUTED'),('IN_PROGRESS','DISPUTED'));
  end if;
  if not allowed then raise exception 'Invalid booking transition'; end if;
  update public.bookings set status=p_next,completed_at=case when p_next='COMPLETED' then now() else completed_at end,updated_at=now() where id=p_booking_id;
  return true;
end;
$$;
grant execute on function public.update_booking_status(uuid,public.booking_status) to authenticated;

create or replace function public.update_order_status(p_order_id uuid,p_next public.order_status) returns boolean
language plpgsql security definer set search_path=public
as $$
declare o public.orders; allowed boolean:=false; verified boolean:=false;
begin
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null then raise exception 'Order not found'; end if;
  select verification_status='VERIFIED' into verified from public.businesses where id=o.business_id;
  if not (public.is_business_member(o.business_id) or public.is_admin()) then raise exception 'Not authorized'; end if;
  if public.is_business_member(o.business_id) and not coalesce(verified,false) and not public.is_admin() then raise exception 'Verified business access is required'; end if;
  if public.is_admin() then allowed:=true;
  else allowed:=(o.status,p_next) in (('PAYMENT_CONFIRMED','ACCEPTED'),('ACCEPTED','PREPARING'),('PREPARING','READY_FOR_PICKUP'),('READY_FOR_PICKUP','OUT_FOR_DELIVERY'),('PAYMENT_CONFIRMED','CANCELLED'),('ACCEPTED','CANCELLED'),('PREPARING','CANCELLED'),('READY_FOR_PICKUP','CANCELLED'));
  end if;
  if not allowed then raise exception 'Invalid order transition'; end if;
  update public.orders set status=p_next,updated_at=now() where id=p_order_id;
  return true;
end;
$$;
grant execute on function public.update_order_status(uuid,public.order_status) to authenticated;

-- Quote sending is a marketplace privilege and therefore requires verification.
create or replace function public.send_quote(
  p_request_id uuid,p_service_id uuid,p_description text,p_line_items jsonb,p_price numeric,
  p_deposit numeric,p_total numeric,p_proposed_date date,p_proposed_time time,
  p_valid_until timestamptz,p_terms text
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare qid uuid; bid uuid; cid uuid; verified boolean;
begin
  select o.business_id,r.customer_id into bid,cid
  from public.opportunities o
  join public.service_requests r on r.id=o.request_id
  where o.request_id=p_request_id
    and o.business_id in (select business_id from public.business_members where user_id=auth.uid())
    and o.status='OPEN'
  limit 1;
  if bid is null then raise exception 'No authorized opportunity'; end if;
  select verification_status='VERIFIED' into verified from public.businesses where id=bid;
  if not coalesce(verified,false) then raise exception 'Verified business access is required'; end if;
  if p_service_id is not null and not exists (
    select 1 from public.services s where s.id=p_service_id and s.business_id=bid and s.active
  ) then raise exception 'Selected service is not owned and active for this business'; end if;
  if p_price < 0 or p_deposit < 0 or p_total < 0 or p_total < p_deposit then raise exception 'Invalid quote amounts'; end if;
  insert into public.quotes(request_id,business_id,customer_id,service_id,description,line_items,price,deposit,total,proposed_date,proposed_time,valid_until,terms,status)
  values(p_request_id,bid,cid,p_service_id,trim(p_description),coalesce(p_line_items,'[]'::jsonb),p_price,p_deposit,p_total,p_proposed_date,p_proposed_time,p_valid_until,p_terms,'SENT')
  returning id into qid;
  update public.opportunities set status='RESPONDED' where request_id=p_request_id and business_id=bid;
  insert into public.notifications(user_id,kind,title,body,data)
  values(cid,'NEW_QUOTE','New quote received','A business has sent you a quote.',jsonb_build_object('quote_id',qid,'request_id',p_request_id));
  return qid;
end;
$$;
grant execute on function public.send_quote(uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time,timestamptz,text) to authenticated;

-- Driver assignment/update must require an active application, not merely a profile enum.
create or replace function public.assign_delivery_driver(p_delivery_id uuid,p_driver_id uuid) returns boolean
language plpgsql security definer set search_path=public
as $$
declare d public.deliveries; driver_role public.app_role; driver_status text;
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  select * into d from public.deliveries where id=p_delivery_id for update;
  if d.id is null then raise exception 'Delivery not found'; end if;
  if d.status <> 'READY_FOR_PICKUP' then raise exception 'Delivery must be ready for pickup before assignment'; end if;
  select role into driver_role from public.profiles where id=p_driver_id;
  select status into driver_status from public.driver_applications where user_id=p_driver_id;
  if driver_role <> 'DELIVERY_DRIVER' or driver_status <> 'ACTIVE' then raise exception 'Selected user is not an active delivery driver'; end if;
  insert into public.delivery_assignments(delivery_id,driver_id,assigned_at)
  values(d.id,p_driver_id,now())
  on conflict(delivery_id) do update set driver_id=excluded.driver_id,assigned_at=now(),accepted_at=null,completed_at=null;
  update public.deliveries set status='ASSIGNED',updated_at=now() where id=d.id;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'ASSIGN_DELIVERY_DRIVER','DELIVERY',d.id,jsonb_build_object('driver_id',p_driver_id));
  return true;
end;
$$;
grant execute on function public.assign_delivery_driver(uuid,uuid) to authenticated;

create or replace function public.update_delivery_status(p_delivery_id uuid,p_status public.delivery_status) returns boolean
language plpgsql security definer set search_path=public
as $$
declare d public.deliveries; is_driver boolean:=false; driver_active boolean:=false; valid boolean:=false;
begin
  select * into d from public.deliveries where id=p_delivery_id for update;
  if d.id is null then raise exception 'Delivery not found'; end if;
  is_driver:=exists(select 1 from public.delivery_assignments where delivery_id=d.id and driver_id=auth.uid());
  driver_active:=exists(select 1 from public.profiles p join public.driver_applications da on da.user_id=p.id where p.id=auth.uid() and p.role='DELIVERY_DRIVER' and da.status='ACTIVE');
  if not (public.is_admin() or (is_driver and driver_active)) then raise exception 'Not authorized'; end if;
  valid:=case
    when d.status='PENDING' and p_status in ('ACCEPTED','CANCELLED') then true
    when d.status='ACCEPTED' and p_status in ('PREPARING','CANCELLED') then true
    when d.status='PREPARING' and p_status in ('READY_FOR_PICKUP','CANCELLED') then true
    when d.status='ASSIGNED' and p_status in ('PICKED_UP','CANCELLED') then true
    when d.status='PICKED_UP' and p_status='OUT_FOR_DELIVERY' then true
    when d.status='OUT_FOR_DELIVERY' and p_status in ('DELIVERED','FAILED') then true
    else false end;
  if not valid then raise exception 'Invalid delivery transition'; end if;
  update public.deliveries set status=p_status,updated_at=now() where id=d.id;
  if p_status='PICKED_UP' then
    update public.delivery_assignments set accepted_at=coalesce(accepted_at,now()) where delivery_id=d.id;
    update public.orders set status='OUT_FOR_DELIVERY',updated_at=now() where id=d.order_id and status='READY_FOR_PICKUP';
  elsif p_status='OUT_FOR_DELIVERY' then
    update public.orders set status='OUT_FOR_DELIVERY',updated_at=now() where id=d.order_id and status in ('READY_FOR_PICKUP','OUT_FOR_DELIVERY');
  elsif p_status='DELIVERED' then
    update public.delivery_assignments set completed_at=now() where delivery_id=d.id;
    update public.orders set status='DELIVERED',updated_at=now() where id=d.order_id and status='OUT_FOR_DELIVERY';
  elsif p_status='FAILED' then
    update public.orders set status='CANCELLED',updated_at=now() where id=d.order_id and status not in ('DELIVERED','COMPLETED','REFUNDED');
  elsif p_status='CANCELLED' then
    update public.orders set status='CANCELLED',updated_at=now() where id=d.order_id and status not in ('DELIVERED','COMPLETED','REFUNDED');
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'UPDATE_DELIVERY_STATUS','DELIVERY',d.id,jsonb_build_object('from',d.status,'to',p_status));
  return true;
end;
$$;
grant execute on function public.update_delivery_status(uuid,public.delivery_status) to authenticated;

-- Admin verification is the only business role elevation path.
create or replace function public.admin_set_verification(p_business_id uuid,p_status public.verification_status,p_notes text default null) returns boolean
language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'Admin authorization required'; end if;
  update public.businesses set verification_status=p_status,updated_at=now() where id=p_business_id;
  update public.business_verifications
    set status=p_status,admin_notes=p_notes,reviewed_by=auth.uid(),reviewed_at=now()
    where id=(select id from public.business_verifications where business_id=p_business_id order by created_at desc limit 1);
  if p_status='VERIFIED' then
    update public.profiles
      set role='BUSINESS',updated_at=now()
    where id in (select user_id from public.business_members where business_id=p_business_id)
      and role='CUSTOMER';
  end if;
  insert into public.admin_actions(admin_id,action,target_type,target_id,metadata)
  values(auth.uid(),'business_verification','business',p_business_id,jsonb_build_object('status',p_status));
  return true;
end;
$$;
grant execute on function public.admin_set_verification(uuid,public.verification_status,text) to authenticated;
