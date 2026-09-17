-- Everest Local production schema. Run in a Supabase Postgres project.
-- No seed/fake marketplace data is included.

create extension if not exists pgcrypto;

create type public.app_role as enum ('CUSTOMER','BUSINESS','ADMIN','DELIVERY_DRIVER');
create type public.verification_status as enum ('UNVERIFIED','PENDING','VERIFIED','REJECTED','SUSPENDED');
create type public.business_status as enum ('ACTIVE','PAUSED','SUSPENDED');
create type public.request_status as enum ('OPEN','MATCHING','QUOTING','BOOKED','COMPLETED','CANCELLED');
create type public.opportunity_status as enum ('OPEN','RESPONDED','DECLINED','EXPIRED');
create type public.quote_status as enum ('DRAFT','SENT','VIEWED','ACCEPTED','DECLINED','EXPIRED','CANCELLED');
create type public.booking_status as enum ('REQUESTED','PENDING_PAYMENT','CONFIRMED','UPCOMING','IN_PROGRESS','COMPLETED','CANCELLED','DISPUTED');
create type public.product_status as enum ('DRAFT','ACTIVE','OUT_OF_STOCK','PAUSED','ARCHIVED');
create type public.order_status as enum ('PENDING','PAYMENT_CONFIRMED','ACCEPTED','PREPARING','READY_FOR_PICKUP','OUT_FOR_DELIVERY','DELIVERED','COMPLETED','CANCELLED','REFUNDED');
create type public.payment_status as enum ('PENDING','REQUIRES_ACTION','SUCCEEDED','FAILED','REFUNDED','PARTIALLY_REFUNDED');
create type public.delivery_status as enum ('PENDING','ACCEPTED','PREPARING','READY_FOR_PICKUP','ASSIGNED','PICKED_UP','OUT_FOR_DELIVERY','DELIVERED','FAILED','CANCELLED');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'CUSTOMER',
  full_name text,
  phone text,
  suburb text,
  city text,
  state text,
  country text default 'Australia',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  cover_url text,
  category_id uuid,
  status public.business_status not null default 'ACTIVE',
  verification_status public.verification_status not null default 'UNVERIFIED',
  abn text,
  phone text,
  email text,
  address_line text,
  suburb text,
  city text,
  state text,
  postcode text,
  country text not null default 'Australia',
  latitude numeric,
  longitude numeric,
  opening_hours jsonb not null default '{}'::jsonb,
  accepts_requests boolean not null default true,
  accepts_orders boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'OWNER',
  created_at timestamptz not null default now(),
  primary key (business_id,user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  parent_id uuid references public.categories(id),
  kind text not null default 'SERVICE',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.businesses add constraint businesses_category_fk foreign key (category_id) references public.categories(id);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid references public.categories(id),
  name text not null,
  description text,
  base_price numeric(12,2),
  duration_minutes integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  country text not null default 'Australia',
  state text not null,
  city text not null,
  suburb text not null,
  postcode text,
  active boolean not null default true,
  unique(business_id, suburb, city, state)
);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id),
  category_id uuid references public.categories(id),
  service_id uuid references public.services(id),
  description text not null,
  suburb text not null,
  city text not null,
  state text not null,
  country text not null default 'Australia',
  preferred_date date,
  preferred_time time,
  budget numeric(12,2),
  media_urls text[] not null default '{}',
  status public.request_status not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.service_matches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  score integer not null default 0 check(score >= 0),
  reason jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(request_id,business_id)
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  status public.opportunity_status not null default 'OPEN',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique(request_id,business_id)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id),
  business_id uuid not null references public.businesses(id),
  customer_id uuid not null references auth.users(id),
  service_id uuid references public.services(id),
  description text not null,
  line_items jsonb not null default '[]'::jsonb,
  price numeric(12,2) not null check(price >= 0),
  deposit numeric(12,2) not null default 0 check(deposit >= 0),
  total numeric(12,2) not null check(total >= 0),
  proposed_date date,
  proposed_time time,
  valid_until timestamptz,
  terms text,
  status public.quote_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.service_requests(id),
  quote_id uuid unique references public.quotes(id),
  customer_id uuid not null references auth.users(id),
  business_id uuid not null references public.businesses(id),
  price numeric(12,2) not null check(price >= 0),
  scheduled_date date,
  scheduled_time time,
  status public.booking_status not null default 'REQUESTED',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid references public.categories(id),
  name text not null,
  slug text not null unique,
  description text,
  price numeric(12,2) not null check(price >= 0),
  sale_price numeric(12,2) check(sale_price is null or sale_price >= 0),
  sku text,
  status public.product_status not null default 'DRAFT',
  delivery_eligible boolean not null default false,
  pickup_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.inventory (
  product_id uuid primary key references public.products(id) on delete cascade,
  stock_quantity integer not null default 0 check(stock_quantity >= 0),
  reserved_quantity integer not null default 0 check(reserved_quantity >= 0 and reserved_quantity <= stock_quantity),
  low_stock_threshold integer not null default 5 check(low_stock_threshold >= 0),
  updated_at timestamptz not null default now()
);

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check(quantity > 0),
  created_at timestamptz not null default now(),
  unique(cart_id,product_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references auth.users(id),
  business_id uuid not null references public.businesses(id),
  status public.order_status not null default 'PENDING',
  payment_status public.payment_status not null default 'PENDING',
  subtotal numeric(12,2) not null default 0 check(subtotal >= 0),
  delivery_fee numeric(12,2) not null default 0 check(delivery_fee >= 0),
  marketplace_fee numeric(12,2) not null default 0 check(marketplace_fee >= 0),
  tax numeric(12,2) not null default 0 check(tax >= 0),
  total numeric(12,2) not null default 0 check(total >= 0),
  delivery_method text,
  delivery_address jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  unit_price numeric(12,2) not null check(unit_price >= 0),
  quantity integer not null check(quantity > 0),
  line_total numeric(12,2) not null check(line_total >= 0)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id),
  booking_id uuid references public.bookings(id),
  order_id uuid references public.orders(id),
  provider text not null default 'stripe',
  provider_payment_id text unique,
  amount numeric(12,2) not null check(amount >= 0),
  currency text not null default 'aud',
  status public.payment_status not null default 'PENDING',
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((booking_id is not null) or (order_id is not null))
);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  payment_id uuid references public.payments(id),
  gross_amount numeric(12,2) not null default 0 check(gross_amount >= 0),
  marketplace_fee numeric(12,2) not null default 0 check(marketplace_fee >= 0),
  delivery_fee numeric(12,2) not null default 0 check(delivery_fee >= 0),
  net_amount numeric(12,2) not null default 0 check(net_amount >= 0),
  status text not null default 'PENDING',
  created_at timestamptz not null default now()
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  status public.delivery_status not null default 'PENDING',
  pickup_location jsonb,
  customer_location jsonb,
  fee numeric(12,2) not null default 0 check(fee >= 0),
  eta timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  driver_id uuid not null references auth.users(id),
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  unique(delivery_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id),
  business_id uuid not null references public.businesses(id),
  request_id uuid references public.service_requests(id),
  booking_id uuid references public.bookings(id),
  quote_id uuid references public.quotes(id),
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  body text not null check(length(body) between 1 and 5000),
  attachment_urls text[] not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id),
  business_id uuid references public.businesses(id),
  product_id uuid references public.products(id),
  booking_id uuid references public.bookings(id),
  order_id uuid references public.orders(id),
  rating integer not null check(rating between 1 and 5),
  body text,
  photo_urls text[] not null default '{}',
  verified_transaction boolean not null default false,
  created_at timestamptz not null default now(),
  check ((booking_id is not null) <> (order_id is not null)),
  unique(author_id, booking_id),
  unique(author_id, order_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.saved_businesses (customer_id uuid references auth.users(id) on delete cascade, business_id uuid references public.businesses(id) on delete cascade, created_at timestamptz default now(), primary key(customer_id,business_id));
create table public.saved_products (customer_id uuid references auth.users(id) on delete cascade, product_id uuid references public.products(id) on delete cascade, created_at timestamptz default now(), primary key(customer_id,product_id));

create table public.business_verifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  submitted_by uuid not null references auth.users(id),
  status public.verification_status not null default 'PENDING',
  abn text,
  documents jsonb not null default '[]'::jsonb,
  admin_notes text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  state text not null,
  city text not null,
  suburbs text[] not null default '{}',
  fee numeric(12,2) not null default 0 check(fee >= 0),
  same_day_enabled boolean not null default false,
  cutoff_time time,
  operating_hours jsonb not null default '{}'::jsonb,
  active boolean not null default false
);

create index businesses_owner_idx on public.businesses(owner_id);
create index businesses_location_idx on public.businesses(state,city,suburb,status,verification_status);
create index services_business_idx on public.services(business_id,active);
create index service_areas_lookup_idx on public.service_areas(state,city,suburb,active);
create index requests_customer_idx on public.service_requests(customer_id,created_at desc);
create index requests_match_idx on public.service_requests(category_id,state,city,suburb,status);
create index matches_business_idx on public.service_matches(business_id,created_at desc);
create index opportunities_business_idx on public.opportunities(business_id,status,created_at desc);
create index quotes_customer_idx on public.quotes(customer_id,status,created_at desc);
create index quotes_business_idx on public.quotes(business_id,status,created_at desc);
create index bookings_customer_idx on public.bookings(customer_id,status,scheduled_date);
create index bookings_business_idx on public.bookings(business_id,status,scheduled_date);
create index products_business_idx on public.products(business_id,status);
create index products_search_idx on public.products(status,category_id);
create index orders_customer_idx on public.orders(customer_id,created_at desc);
create index orders_business_idx on public.orders(business_id,status,created_at desc);
create index messages_conversation_idx on public.messages(conversation_id,created_at);
create index notifications_user_idx on public.notifications(user_id,created_at desc);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='ADMIN'); $$;
create or replace function public.is_business_member(p_business_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.business_members where business_id=p_business_id and user_id=auth.uid()); $$;

-- New auth users get a customer profile. Role elevation is intentionally not possible from this trigger.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','')); return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Deterministic, server-side matching. Only businesses that are active, verified and explicitly serve the request suburb are matched.
create or replace function public.match_service_request(p_request_id uuid) returns integer language plpgsql security definer set search_path=public as $$
declare r public.service_requests; inserted_count integer := 0;
begin
 select * into r from public.service_requests where id=p_request_id;
 if r.id is null or (r.customer_id <> auth.uid() and not public.is_admin()) then raise exception 'Not authorized'; end if;
 update public.service_requests set status='MATCHING',updated_at=now() where id=r.id;
 insert into public.service_matches(request_id,business_id,score,reason)
 select r.id,b.id,
   (case when b.verification_status='VERIFIED' then 40 else 0 end) +
   (case when b.category_id=r.category_id then 30 else 0 end) +
   (case when s.id is not null then 20 else 0 end) +
   (case when b.accepts_requests then 10 else 0 end),
   jsonb_build_object('verified',b.verification_status='VERIFIED','category_match',b.category_id=r.category_id,'area_match',s.id is not null)
 from public.businesses b
 left join public.services svc on svc.business_id=b.id and svc.id=r.service_id and svc.active
 left join public.service_areas s on s.business_id=b.id and s.state=r.state and s.city=r.city and lower(s.suburb)=lower(r.suburb) and s.active
 where b.status='ACTIVE' and b.verification_status='VERIFIED' and b.accepts_requests and s.id is not null
 and (r.category_id is null or b.category_id=r.category_id or svc.id is not null)
 on conflict(request_id,business_id) do update set score=excluded.score,reason=excluded.reason;
 insert into public.opportunities(request_id,business_id,expires_at)
 select request_id,business_id,now()+interval '48 hours' from public.service_matches where request_id=r.id
 on conflict(request_id,business_id) do nothing;
 get diagnostics inserted_count = row_count;
 update public.service_requests set status='QUOTING',updated_at=now() where id=r.id;
 return inserted_count;
end; $$;

-- Lock-safe inventory reservation. Never trust client totals or stock values.
create or replace function public.reserve_inventory(p_product_id uuid,p_quantity integer) returns boolean language plpgsql security definer set search_path=public as $$
declare available integer;
begin
 if p_quantity <= 0 then raise exception 'Invalid quantity'; end if;
 select stock_quantity-reserved_quantity into available from public.inventory where product_id=p_product_id for update;
 if available is null or available < p_quantity then return false; end if;
 update public.inventory set reserved_quantity=reserved_quantity+p_quantity,updated_at=now() where product_id=p_product_id;
 return true;
end; $$;

-- RLS: users only see their own private records; business members see their business records; public discovery sees only active verified marketplace records.
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.categories enable row level security;
alter table public.services enable row level security;
alter table public.service_areas enable row level security;
alter table public.service_requests enable row level security;
alter table public.service_matches enable row level security;
alter table public.opportunities enable row level security;
alter table public.quotes enable row level security;
alter table public.bookings enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.payouts enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_assignments enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.saved_businesses enable row level security;
alter table public.saved_products enable row level security;
alter table public.business_verifications enable row level security;
alter table public.admin_actions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.delivery_zones enable row level security;

create policy profiles_self on public.profiles for all using(id=auth.uid() or public.is_admin()) with check(id=auth.uid() or public.is_admin());
create policy businesses_public_read on public.businesses for select using(status='ACTIVE' and verification_status='VERIFIED' or owner_id=auth.uid() or public.is_admin());
create policy businesses_owner_write on public.businesses for insert with check(owner_id=auth.uid());
create policy businesses_owner_update on public.businesses for update using(owner_id=auth.uid() or public.is_admin()) with check(owner_id=auth.uid() or public.is_admin());
create policy business_members_access on public.business_members for select using(user_id=auth.uid() or public.is_business_member(business_id) or public.is_admin());
create policy business_members_admin_insert on public.business_members for insert with check(user_id=auth.uid() and (member_role='OWNER') or public.is_admin());
create policy categories_read on public.categories for select using(active=true or public.is_admin());
create policy services_public_read on public.services for select using(active=true and exists(select 1 from public.businesses b where b.id=business_id and b.status='ACTIVE' and b.verification_status='VERIFIED') or public.is_business_member(business_id) or public.is_admin());
create policy services_business_write on public.services for all using(public.is_business_member(business_id) or public.is_admin()) with check(public.is_business_member(business_id) or public.is_admin());
create policy areas_public_read on public.service_areas for select using(active=true and exists(select 1 from public.businesses b where b.id=business_id and b.status='ACTIVE' and b.verification_status='VERIFIED') or public.is_business_member(business_id) or public.is_admin());
create policy areas_business_write on public.service_areas for all using(public.is_business_member(business_id) or public.is_admin()) with check(public.is_business_member(business_id) or public.is_admin());
create policy requests_customer_access on public.service_requests for all using(customer_id=auth.uid() or public.is_admin()) with check(customer_id=auth.uid() or public.is_admin());
create policy matches_participant_read on public.service_matches for select using(exists(select 1 from public.service_requests r where r.id=request_id and r.customer_id=auth.uid()) or public.is_business_member(business_id) or public.is_admin());
create policy opportunities_business_access on public.opportunities for select using(public.is_business_member(business_id) or exists(select 1 from public.service_requests r where r.id=request_id and r.customer_id=auth.uid()) or public.is_admin());
create policy opportunities_business_update on public.opportunities for update using(public.is_business_member(business_id) or public.is_admin()) with check(public.is_business_member(business_id) or public.is_admin());
create policy quotes_participant_access on public.quotes for select using(customer_id=auth.uid() or public.is_business_member(business_id) or public.is_admin());
create policy quotes_business_insert on public.quotes for insert with check(public.is_business_member(business_id) and customer_id=auth.uid() is not true);
create policy quotes_business_update on public.quotes for update using(public.is_business_member(business_id) or customer_id=auth.uid() or public.is_admin()) with check(public.is_business_member(business_id) or customer_id=auth.uid() or public.is_admin());
create policy bookings_participant_access on public.bookings for select using(customer_id=auth.uid() or public.is_business_member(business_id) or public.is_admin());
create policy products_public_read on public.products for select using(status in ('ACTIVE','OUT_OF_STOCK') and exists(select 1 from public.businesses b where b.id=business_id and b.status='ACTIVE' and b.verification_status='VERIFIED') or public.is_business_member(business_id) or public.is_admin());
create policy products_business_write on public.products for all using(public.is_business_member(business_id) or public.is_admin()) with check(public.is_business_member(business_id) or public.is_admin());
create policy product_images_public_read on public.product_images for select using(exists(select 1 from public.products p where p.id=product_id and p.status in ('ACTIVE','OUT_OF_STOCK')) or public.is_admin());
create policy inventory_business_access on public.inventory for select using(public.is_business_member((select business_id from public.products where id=product_id)) or public.is_admin());
create policy carts_owner on public.carts for all using(customer_id=auth.uid() or public.is_admin()) with check(customer_id=auth.uid() or public.is_admin());
create policy cart_items_owner on public.cart_items for all using(exists(select 1 from public.carts c where c.id=cart_id and c.customer_id=auth.uid()) or public.is_admin()) with check(exists(select 1 from public.carts c where c.id=cart_id and c.customer_id=auth.uid()) or public.is_admin());
create policy orders_participant on public.orders for select using(customer_id=auth.uid() or public.is_business_member(business_id) or public.is_admin());
create policy order_items_participant on public.order_items for select using(exists(select 1 from public.orders o where o.id=order_id and (o.customer_id=auth.uid() or public.is_business_member(o.business_id) or public.is_admin())));
create policy payments_customer_admin on public.payments for select using(customer_id=auth.uid() or public.is_admin());
create policy payouts_business_admin on public.payouts for select using(public.is_business_member(business_id) or public.is_admin());
create policy deliveries_participant on public.deliveries for select using(exists(select 1 from public.orders o where o.id=order_id and (o.customer_id=auth.uid() or public.is_business_member(o.business_id))) or public.is_admin());
create policy delivery_admin_write on public.deliveries for all using(public.is_admin()) with check(public.is_admin());
create policy delivery_assignments_participant on public.delivery_assignments for select using(driver_id=auth.uid() or public.is_admin());
create policy conversations_participant on public.conversations for select using(customer_id=auth.uid() or public.is_business_member(business_id) or public.is_admin());
create policy messages_participant on public.messages for all using(exists(select 1 from public.conversations c where c.id=conversation_id and (c.customer_id=auth.uid() or public.is_business_member(c.business_id) or public.is_admin()))) with check(sender_id=auth.uid() and exists(select 1 from public.conversations c where c.id=conversation_id and (c.customer_id=auth.uid() or public.is_business_member(c.business_id) or public.is_admin())));
create policy reviews_public_read on public.reviews for select using(true);
create policy reviews_author_insert on public.reviews for insert with check(author_id=auth.uid() and ((booking_id is not null and exists(select 1 from public.bookings b where b.id=booking_id and b.customer_id=auth.uid() and b.status='COMPLETED' and b.business_id=business_id)) or (order_id is not null and exists(select 1 from public.orders o where o.id=order_id and o.customer_id=auth.uid() and o.status='COMPLETED'))));
create policy notifications_owner on public.notifications for all using(user_id=auth.uid() or public.is_admin()) with check(user_id=auth.uid() or public.is_admin());
create policy saved_businesses_owner on public.saved_businesses for all using(customer_id=auth.uid()) with check(customer_id=auth.uid());
create policy saved_products_owner on public.saved_products for all using(customer_id=auth.uid()) with check(customer_id=auth.uid());
create policy verification_participant on public.business_verifications for select using(submitted_by=auth.uid() or public.is_business_member(business_id) or public.is_admin());
create policy verification_submit on public.business_verifications for insert with check(submitted_by=auth.uid() and public.is_business_member(business_id));
create policy verification_admin_update on public.business_verifications for update using(public.is_admin()) with check(public.is_admin());
create policy admin_actions_admin on public.admin_actions for all using(public.is_admin()) with check(public.is_admin());
create policy audit_admin_read on public.audit_logs for select using(public.is_admin());
create policy delivery_zones_public_read on public.delivery_zones for select using(active=true or public.is_admin());
create policy delivery_zones_admin_write on public.delivery_zones for all using(public.is_admin()) with check(public.is_admin());

-- Explicitly prevent clients from changing authoritative payment/order state through normal table writes.
revoke insert, update, delete on public.payments from anon, authenticated;
revoke insert, update, delete on public.payouts from anon, authenticated;
revoke insert, update, delete on public.admin_actions from anon, authenticated;
revoke insert, update, delete on public.audit_logs from anon, authenticated;
