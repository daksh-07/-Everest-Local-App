-- Service taxonomy + delivery modes.
-- Reuses public.categories as the hierarchical taxonomy root/subcategory layer.
-- public.services remains the business-specific offering layer.

create type public.service_delivery_mode as enum ('LOCAL','REMOTE','BOTH');

create table public.service_definitions (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete restrict,
  name text not null,
  slug text not null unique,
  description text,
  default_delivery_mode public.service_delivery_mode not null default 'LOCAL',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(category_id,name)
);

alter table public.services
  add column service_definition_id uuid references public.service_definitions(id) on delete restrict,
  add column delivery_mode public.service_delivery_mode not null default 'LOCAL';

alter table public.service_requests
  add column delivery_mode public.service_delivery_mode not null default 'LOCAL',
  alter column suburb drop not null,
  alter column city drop not null,
  alter column state drop not null;

create index service_definitions_category_idx on public.service_definitions(category_id,active,name);
create index service_definitions_name_idx on public.service_definitions(name);
create index services_delivery_mode_idx on public.services(delivery_mode,active);
create index services_definition_idx on public.services(service_definition_id,active);
create index requests_delivery_mode_idx on public.service_requests(delivery_mode,status,created_at desc);
create index categories_parent_active_idx on public.categories(parent_id,active,name);

alter table public.service_definitions enable row level security;
create policy service_definitions_public_read on public.service_definitions
for select to anon, authenticated using (active=true or public.is_admin());
create policy service_definitions_admin_write on public.service_definitions
for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert,update,delete on public.service_definitions from anon, authenticated;
grant select on public.service_definitions to anon, authenticated;
grant insert,update,delete on public.service_definitions to authenticated;

-- The old RPC remains compatible. New callers can provide a definition and delivery mode.
create or replace function public.create_service(
  p_business_id uuid,p_name text,p_description text default null,p_category_id uuid default null,
  p_base_price numeric default null,p_duration_minutes integer default null
) returns uuid language plpgsql security definer set search_path=public as $$
begin
  return public.create_service(p_business_id,p_name,p_description,p_category_id,p_base_price,p_duration_minutes,
    null,'LOCAL'::public.service_delivery_mode);
end; $$;

create or replace function public.create_service(
  p_business_id uuid,p_name text,p_description text default null,p_category_id uuid default null,
  p_base_price numeric default null,p_duration_minutes integer default null,
  p_service_definition_id uuid default null,p_delivery_mode public.service_delivery_mode default 'LOCAL'
) returns uuid language plpgsql security definer set search_path=public as $$
declare sid uuid; definition_category uuid;
begin
  if not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
  if length(trim(p_name))<2 or length(trim(p_name))>120 then raise exception 'Invalid service name'; end if;
  if p_base_price is not null and p_base_price<0 then raise exception 'Invalid base price'; end if;
  if p_duration_minutes is not null and (p_duration_minutes<1 or p_duration_minutes>1440) then raise exception 'Invalid duration'; end if;
  if p_service_definition_id is not null then
    select category_id into definition_category from public.service_definitions
    where id=p_service_definition_id and active=true;
    if definition_category is null then raise exception 'Invalid service definition'; end if;
    if p_category_id is not null and p_category_id <> definition_category then
      raise exception 'Service definition does not belong to the selected category';
    end if;
    p_category_id := definition_category;
  end if;
  insert into public.services(business_id,name,description,category_id,service_definition_id,delivery_mode,base_price,duration_minutes,active)
  values(p_business_id,trim(p_name),nullif(trim(p_description),''),p_category_id,p_service_definition_id,p_delivery_mode,p_base_price,p_duration_minutes,false)
  returning id into sid;
  return sid;
end; $$;

grant execute on function public.create_service(uuid,text,text,uuid,numeric,integer) to authenticated;
grant execute on function public.create_service(uuid,text,text,uuid,numeric,integer,uuid,public.service_delivery_mode) to authenticated;

create or replace function public.create_service_request(
  p_category_id uuid default null,p_service_id uuid default null,p_description text default '',
  p_suburb text default null,p_city text default null,p_state text default null,
  p_preferred_date date default null,p_preferred_time time default null,p_budget numeric default null,
  p_media_urls text[] default '{}',p_delivery_mode public.service_delivery_mode default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid; effective_mode public.service_delivery_mode;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(p_description)) < 5 or length(trim(p_description)) > 5000 then raise exception 'Invalid service description'; end if;
  if p_budget is not null and p_budget < 0 then raise exception 'Invalid budget'; end if;
  if p_service_id is not null then
    select delivery_mode into effective_mode from public.services where id=p_service_id and active=true;
    if effective_mode is null then raise exception 'Selected service is not available'; end if;
    if p_delivery_mode is not null and p_delivery_mode <> effective_mode and effective_mode <> 'BOTH' then
      raise exception 'Requested delivery mode is not supported by this service';
    end if;
    if effective_mode='BOTH' and p_delivery_mode is not null then effective_mode:=p_delivery_mode; end if;
  else
    effective_mode := coalesce(p_delivery_mode,'LOCAL'::public.service_delivery_mode);
  end if;
  if effective_mode='REMOTE' then
    p_suburb:=null;p_city:=null;p_state:=null;
  elsif nullif(trim(coalesce(p_suburb,'')),'') is null
     or nullif(trim(coalesce(p_city,'')),'') is null
     or nullif(trim(coalesce(p_state,'')),'') is null then
    raise exception 'A service location is required for local work';
  end if;
  insert into public.service_requests(customer_id,category_id,service_id,delivery_mode,description,suburb,city,state,preferred_date,preferred_time,budget,media_urls,status)
  values(auth.uid(),p_category_id,p_service_id,effective_mode,trim(p_description),nullif(trim(p_suburb),''),nullif(trim(p_city),''),
    nullif(trim(p_state),''),p_preferred_date,p_preferred_time,p_budget,coalesce(p_media_urls,'{}'),'OPEN')
  returning id into rid;
  return rid;
end; $$;

grant execute on function public.create_service_request(uuid,uuid,text,text,text,text,date,time,numeric,text[],public.service_delivery_mode) to authenticated;

create or replace function public.match_service_request(p_request_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare r public.service_requests; inserted_count integer := 0;
begin
  select * into r from public.service_requests where id=p_request_id;
  if r.id is null or (r.customer_id <> auth.uid() and not public.is_admin()) then raise exception 'Not authorized'; end if;
  update public.service_requests set status='MATCHING',updated_at=now() where id=r.id;
  insert into public.service_matches(request_id,business_id,score,reason)
  select r.id,b.id,
    (case when b.verification_status='VERIFIED' then 40 else 0 end) +
    (case when b.category_id=r.category_id then 30 else 0 end) +
    (case when svc.id is not null then 20 else 0 end) +
    (case when area.id is not null then 10 else 0 end),
    jsonb_build_object('verified',true,'category_match',b.category_id=r.category_id,'service_match',svc.id is not null,'area_match',area.id is not null,'delivery_mode',r.delivery_mode)
  from public.businesses b
  join public.services svc on svc.business_id=b.id and svc.active
    and (r.service_id is null or svc.id=r.service_id)
    and (svc.delivery_mode=r.delivery_mode or svc.delivery_mode='BOTH')
  left join public.service_areas area on area.business_id=b.id and area.active
    and r.delivery_mode='LOCAL' and r.state is not null and r.city is not null and r.suburb is not null
    and lower(area.state)=lower(r.state) and lower(area.city)=lower(r.city) and lower(area.suburb)=lower(r.suburb)
  where b.status='ACTIVE' and b.verification_status='VERIFIED' and b.accepts_requests
    and (r.delivery_mode='REMOTE' or area.id is not null)
    and (r.category_id is null or b.category_id=r.category_id or svc.category_id=r.category_id)
  on conflict(request_id,business_id) do update set score=excluded.score,reason=excluded.reason;
  insert into public.opportunities(request_id,business_id,expires_at)
  select request_id,business_id,now()+interval '48 hours' from public.service_matches where request_id=r.id
  on conflict(request_id,business_id) do nothing;
  get diagnostics inserted_count=row_count;
  update public.service_requests set status='QUOTING',updated_at=now() where id=r.id;
  return inserted_count;
end; $$;
grant execute on function public.match_service_request(uuid) to authenticated;

with roots(name,slug) as (
 values ('Home & Property','home-property'),('Automotive','automotive'),('Business & Professional','business-professional'),
 ('Marketing & Creative','marketing-creative'),('Technology','technology'),('Education','education'),
 ('Personal & Lifestyle','personal-lifestyle'),('Remote / Online','remote-online')
)
insert into public.categories(name,slug,kind,active) select name,slug,'SERVICE',true from roots
on conflict(slug) do update set name=excluded.name,active=true;

with tree(root_slug,name,slug) as (
 values
 ('home-property','Cleaning','cleaning'),('home-property','Gardening','gardening'),('home-property','Landscaping','landscaping'),('home-property','Plumbing','plumbing'),('home-property','Electrical','electrical'),('home-property','Painting','painting'),('home-property','Handyman','handyman'),('home-property','Pest Control','pest-control'),('home-property','Removalists','removalists'),('home-property','Repairs','repairs'),('home-property','Maintenance','maintenance'),
 ('automotive','Car Detailing','car-detailing'),('automotive','Ceramic Coating','ceramic-coating'),('automotive','Paint Correction','paint-correction'),('automotive','Mechanics','mechanics'),('automotive','Auto Electrical','auto-electrical'),('automotive','Tyres','tyres'),('automotive','Towing','towing'),('automotive','Smash Repair','smash-repair'),('automotive','Vehicle Services','vehicle-services'),
 ('business-professional','Accounting','accounting'),('business-professional','Bookkeeping','bookkeeping'),('business-professional','Business Consulting','business-consulting'),('business-professional','Legal Services','legal-services'),('business-professional','Administration','administration'),('business-professional','Virtual Assistants','virtual-assistants'),('business-professional','HR Services','hr-services'),
 ('marketing-creative','Marketing','marketing'),('marketing-creative','Social Media Management','social-media-management'),('marketing-creative','Google Ads','google-ads'),('marketing-creative','Meta Ads','meta-ads'),('marketing-creative','Graphic Design','graphic-design'),('marketing-creative','Branding','branding'),('marketing-creative','Photography','photography'),('marketing-creative','Videography','videography'),('marketing-creative','Copywriting','copywriting'),('marketing-creative','Content Creation','content-creation'),
 ('technology','Web Development','web-development'),('technology','Software Development','software-development'),('technology','Mobile Development','mobile-development'),('technology','IT Support','it-support'),('technology','AI Services','ai-services'),('technology','Automation','automation'),('technology','Data Services','data-services'),('technology','Cybersecurity','cybersecurity'),
 ('education','Tutoring','tutoring'),('education','Language Teaching','language-teaching'),('education','Music','music'),('education','Academic Support','academic-support'),('education','Coaching','coaching'),
 ('personal-lifestyle','Fitness','fitness'),('personal-lifestyle','Personal Training','personal-training'),('personal-lifestyle','Beauty','beauty'),('personal-lifestyle','Hair','hair'),('personal-lifestyle','Events','events'),('personal-lifestyle','Personal Services','personal-services'),
 ('remote-online','Remote Consulting','remote-consulting'),('remote-online','Remote Development','remote-development'),('remote-online','Remote Design','remote-design'),('remote-online','Remote Marketing','remote-marketing'),('remote-online','Remote Administration','remote-administration'),('remote-online','Remote Support','remote-support'),('remote-online','Freelance Services','freelance-services')
)
insert into public.categories(name,slug,parent_id,kind,active)
select t.name,t.slug,c.id,'SERVICE',true from tree t join public.categories c on c.slug=t.root_slug
on conflict(slug) do update set name=excluded.name,parent_id=excluded.parent_id,active=true;

with defs(category_slug,name,slug,mode) as (
 values
 ('cleaning','Cleaning','service-cleaning','LOCAL'),('gardening','Gardening','service-gardening','LOCAL'),('landscaping','Landscaping','service-landscaping','LOCAL'),('plumbing','Plumbing','service-plumbing','LOCAL'),('electrical','Electrical','service-electrical','LOCAL'),('painting','Painting','service-painting','LOCAL'),('handyman','Handyman','service-handyman','LOCAL'),('pest-control','Pest Control','service-pest-control','LOCAL'),('removalists','Removalists','service-removalists','LOCAL'),('repairs','Repairs','service-repairs','LOCAL'),('maintenance','Maintenance','service-maintenance','LOCAL'),
 ('car-detailing','Car Detailing','service-car-detailing','LOCAL'),('ceramic-coating','Ceramic Coating','service-ceramic-coating','LOCAL'),('paint-correction','Paint Correction','service-paint-correction','LOCAL'),('mechanics','Mechanics','service-mechanics','LOCAL'),('auto-electrical','Auto Electrical','service-auto-electrical','LOCAL'),('tyres','Tyres','service-tyres','LOCAL'),('towing','Towing','service-towing','LOCAL'),('smash-repair','Smash Repair','service-smash-repair','LOCAL'),('vehicle-services','Vehicle Services','service-vehicle-services','LOCAL'),
 ('accounting','Accounting','service-accounting','REMOTE'),('bookkeeping','Bookkeeping','service-bookkeeping','REMOTE'),('business-consulting','Business Consulting','service-business-consulting','BOTH'),('legal-services','Legal Services','service-legal-services','REMOTE'),('administration','Administration','service-administration','REMOTE'),('virtual-assistants','Virtual Assistants','service-virtual-assistants','REMOTE'),('hr-services','HR Services','service-hr-services','BOTH'),
 ('marketing','Marketing','service-marketing','BOTH'),('social-media-management','Social Media Management','service-social-media-management','BOTH'),('google-ads','Google Ads','service-google-ads','REMOTE'),('meta-ads','Meta Ads','service-meta-ads','REMOTE'),('graphic-design','Graphic Design','service-graphic-design','REMOTE'),('branding','Branding','service-branding','REMOTE'),('photography','Photography','service-photography','BOTH'),('videography','Videography','service-videography','BOTH'),('copywriting','Copywriting','service-copywriting','REMOTE'),('content-creation','Content Creation','service-content-creation','BOTH'),
 ('web-development','Web Development','service-web-development','REMOTE'),('software-development','Software Development','service-software-development','REMOTE'),('mobile-development','Mobile Development','service-mobile-development','REMOTE'),('it-support','IT Support','service-it-support','BOTH'),('ai-services','AI Services','service-ai-services','REMOTE'),('automation','Automation','service-automation','REMOTE'),('data-services','Data Services','service-data-services','REMOTE'),('cybersecurity','Cybersecurity','service-cybersecurity','REMOTE'),
 ('tutoring','Tutoring','service-tutoring','BOTH'),('language-teaching','Language Teaching','service-language-teaching','BOTH'),('music','Music','service-music','BOTH'),('academic-support','Academic Support','service-academic-support','REMOTE'),('coaching','Coaching','service-coaching','BOTH'),
 ('fitness','Fitness','service-fitness','LOCAL'),('personal-training','Personal Training','service-personal-training','BOTH'),('beauty','Beauty','service-beauty','LOCAL'),('hair','Hair','service-hair','LOCAL'),('events','Events','service-events','BOTH'),('personal-services','Personal Services','service-personal-services','BOTH'),
 ('remote-consulting','Remote Consulting','service-remote-consulting','REMOTE'),('remote-development','Remote Development','service-remote-development','REMOTE'),('remote-design','Remote Design','service-remote-design','REMOTE'),('remote-marketing','Remote Marketing','service-remote-marketing','REMOTE'),('remote-administration','Remote Administration','service-remote-administration','REMOTE'),('remote-support','Remote Support','service-remote-support','REMOTE'),('freelance-services','Freelance Services','service-freelance-services','REMOTE')
)
insert into public.service_definitions(category_id,name,slug,default_delivery_mode,active)
select c.id,d.name,d.slug,d.mode::public.service_delivery_mode,true from defs d join public.categories c on c.slug=d.category_slug
on conflict(slug) do update set name=excluded.name,category_id=excluded.category_id,default_delivery_mode=excluded.default_delivery_mode,active=true;
