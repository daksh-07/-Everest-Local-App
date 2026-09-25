-- Everest Local Professional Business CRM V2
-- Additive migration: separates durable contacts from sales opportunities while preserving
-- the P0 CRM tables and native Everest marketplace records as authoritative sources.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter table public.business_contacts add column if not exists archived_at timestamptz;
alter table public.business_contacts add column if not exists archived_by uuid references public.profiles(id) on delete set null;
alter table public.business_contacts add column if not exists merged_into_id uuid references public.business_contacts(id) on delete set null;
alter table public.business_contacts add column if not exists last_activity_at timestamptz;
create index if not exists business_contacts_active_idx on public.business_contacts(business_id,updated_at desc) where archived_at is null;
create index if not exists business_contacts_last_activity_idx on public.business_contacts(business_id,last_activity_at desc) where archived_at is null;

create table if not exists public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  is_default boolean not null default false,
  is_archived boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,business_id),
  unique (business_id,name)
);
create unique index if not exists crm_pipelines_one_default_idx on public.crm_pipelines(business_id) where is_default and not is_archived;

create table if not exists public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  pipeline_id uuid not null references public.crm_pipelines(id) on delete cascade,
  stage_key text not null,
  label text not null check (length(trim(label)) between 1 and 80),
  position integer not null check (position >= 0),
  stage_type text not null default 'OPEN' check (stage_type in ('OPEN','WON','LOST')),
  probability numeric check (probability is null or (probability >= 0 and probability <= 100)),
  color_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,business_id),
  unique (pipeline_id,stage_key),
  unique (pipeline_id,position),
  foreign key (pipeline_id,business_id) references public.crm_pipelines(id,business_id) on delete cascade
);
create index if not exists crm_pipeline_stages_order_idx on public.crm_pipeline_stages(business_id,pipeline_id,position);

create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null references public.business_contacts(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 240),
  service_id uuid references public.services(id) on delete set null,
  service_label text,
  source text not null default 'MANUAL' check (source in ('EVEREST','GOOGLE','FACEBOOK','INSTAGRAM','WEBSITE','REFERRAL','PHONE','WALK_IN','EMAIL','MANUAL','IMPORT','OTHER')),
  source_detail text,
  pipeline_id uuid not null references public.crm_pipelines(id) on delete restrict,
  stage_id uuid not null references public.crm_pipeline_stages(id) on delete restrict,
  status text not null default 'OPEN' check (status in ('OPEN','WON','LOST')),
  estimated_value numeric check (estimated_value is null or estimated_value >= 0),
  currency text not null default 'AUD' check (length(currency)=3),
  probability numeric check (probability is null or (probability >= 0 and probability <= 100)),
  expected_close_date date,
  won_at timestamptz,
  lost_at timestamptz,
  lost_reason text,
  linked_service_request_id uuid references public.service_requests(id) on delete set null,
  linked_marketplace_opportunity_id uuid references public.opportunities(id) on delete set null,
  linked_marketplace_quote_id uuid references public.quotes(id) on delete set null,
  linked_marketplace_booking_id uuid references public.bookings(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,business_id),
  foreign key (contact_id,business_id) references public.business_contacts(id,business_id) on delete restrict,
  foreign key (pipeline_id,business_id) references public.crm_pipelines(id,business_id) on delete restrict,
  foreign key (stage_id,business_id) references public.crm_pipeline_stages(id,business_id) on delete restrict,
  check ((status='OPEN' and won_at is null and lost_at is null) or status<>'OPEN'),
  check (not (won_at is not null and lost_at is not null))
);
create index if not exists crm_opportunities_pipeline_idx on public.crm_opportunities(business_id,pipeline_id,stage_id,status,updated_at desc);
create index if not exists crm_opportunities_contact_idx on public.crm_opportunities(business_id,contact_id,created_at desc);
create index if not exists crm_opportunities_source_idx on public.crm_opportunities(business_id,source,created_at desc);
create index if not exists crm_opportunities_activity_idx on public.crm_opportunities(business_id,status,last_activity_at);
create unique index if not exists crm_opportunities_service_request_uidx on public.crm_opportunities(business_id,linked_service_request_id) where linked_service_request_id is not null;
create unique index if not exists crm_opportunities_marketplace_opportunity_uidx on public.crm_opportunities(business_id,linked_marketplace_opportunity_id) where linked_marketplace_opportunity_id is not null;

alter table public.crm_tasks add column if not exists opportunity_id uuid;
alter table public.crm_tasks add column if not exists task_type text not null default 'GENERAL';
alter table public.crm_tasks add column if not exists notes text;
alter table public.crm_tasks add column if not exists reminder_at timestamptz;
alter table public.crm_tasks drop constraint if exists crm_tasks_task_type_check;
alter table public.crm_tasks add constraint crm_tasks_task_type_check check (task_type in ('CALL','EMAIL','MESSAGE','FOLLOW_UP','APPOINTMENT','GENERAL'));
alter table public.crm_tasks drop constraint if exists crm_tasks_opportunity_business_fk;
alter table public.crm_tasks add constraint crm_tasks_opportunity_business_fk foreign key(opportunity_id,business_id) references public.crm_opportunities(id,business_id) on delete cascade;
create index if not exists crm_tasks_opportunity_idx on public.crm_tasks(business_id,opportunity_id,status,due_at);

alter table public.crm_activities add column if not exists opportunity_id uuid;
alter table public.crm_activities add column if not exists channel text;
alter table public.crm_activities add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.crm_activities drop constraint if exists crm_activities_opportunity_business_fk;
alter table public.crm_activities add constraint crm_activities_opportunity_business_fk foreign key(opportunity_id,business_id) references public.crm_opportunities(id,business_id) on delete cascade;
create index if not exists crm_activities_opportunity_time_idx on public.crm_activities(business_id,opportunity_id,occurred_at desc);

create table if not exists public.crm_tags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  color_token text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id,business_id)
);
create unique index if not exists crm_tags_name_uidx on public.crm_tags(business_id,lower(name));

create table if not exists public.crm_contact_tags (
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null references public.business_contacts(id) on delete cascade,
  tag_id uuid not null references public.crm_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (contact_id,tag_id),
  foreign key (contact_id,business_id) references public.business_contacts(id,business_id) on delete cascade,
  foreign key (tag_id,business_id) references public.crm_tags(id,business_id) on delete cascade
);
create index if not exists crm_contact_tags_business_idx on public.crm_contact_tags(business_id,tag_id,contact_id);

create table if not exists public.crm_quotes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null references public.business_contacts(id) on delete restrict,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  quote_number bigint generated by default as identity,
  title text,
  status text not null default 'DRAFT' check (status in ('DRAFT','SENT','VIEWED','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
  currency text not null default 'AUD' check (length(currency)=3),
  discount_amount numeric not null default 0 check (discount_amount >= 0),
  tax_amount numeric not null default 0 check (tax_amount >= 0),
  subtotal numeric not null default 0 check (subtotal >= 0),
  total numeric not null default 0 check (total >= 0),
  deposit_amount numeric not null default 0 check (deposit_amount >= 0),
  notes text,
  terms text,
  expires_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  legacy_external_quote_id uuid unique references public.crm_external_quotes(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,business_id),
  foreign key (contact_id,business_id) references public.business_contacts(id,business_id) on delete restrict,
  foreign key (opportunity_id,business_id) references public.crm_opportunities(id,business_id) on delete set null
);
create index if not exists crm_quotes_business_status_idx on public.crm_quotes(business_id,status,updated_at desc);
create index if not exists crm_quotes_contact_idx on public.crm_quotes(business_id,contact_id,created_at desc);
create index if not exists crm_quotes_opportunity_idx on public.crm_quotes(business_id,opportunity_id,created_at desc);

create table if not exists public.crm_quote_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  quote_id uuid not null references public.crm_quotes(id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 1000),
  quantity numeric not null default 1 check (quantity > 0),
  unit_price numeric not null default 0 check (unit_price >= 0),
  discount_amount numeric not null default 0 check (discount_amount >= 0),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  foreign key (quote_id,business_id) references public.crm_quotes(id,business_id) on delete cascade
);
create index if not exists crm_quote_items_order_idx on public.crm_quote_items(business_id,quote_id,position,id);

create table if not exists public.crm_bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_id uuid not null references public.business_contacts(id) on delete restrict,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  quote_id uuid references public.crm_quotes(id) on delete set null,
  service_id uuid references public.services(id) on delete set null,
  service_label text not null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  location_label text,
  price numeric check (price is null or price >= 0),
  currency text not null default 'AUD' check (length(currency)=3),
  status text not null default 'TENTATIVE' check (status in ('TENTATIVE','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW')),
  notes text,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  legacy_external_booking_id uuid unique references public.crm_external_bookings(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,business_id),
  foreign key (contact_id,business_id) references public.business_contacts(id,business_id) on delete restrict,
  foreign key (opportunity_id,business_id) references public.crm_opportunities(id,business_id) on delete set null,
  foreign key (quote_id,business_id) references public.crm_quotes(id,business_id) on delete set null,
  check (scheduled_end > scheduled_start)
);
create index if not exists crm_bookings_calendar_idx on public.crm_bookings(business_id,scheduled_start,scheduled_end,status);
create index if not exists crm_bookings_contact_idx on public.crm_bookings(business_id,contact_id,scheduled_start desc);
create index if not exists crm_bookings_opportunity_idx on public.crm_bookings(business_id,opportunity_id,scheduled_start desc);

alter table public.crm_opportunities add column if not exists linked_crm_quote_id uuid;
alter table public.crm_opportunities add column if not exists linked_crm_booking_id uuid;
alter table public.crm_opportunities drop constraint if exists crm_opportunities_crm_quote_business_fk;
alter table public.crm_opportunities add constraint crm_opportunities_crm_quote_business_fk foreign key(linked_crm_quote_id,business_id) references public.crm_quotes(id,business_id) on delete set null;
alter table public.crm_opportunities drop constraint if exists crm_opportunities_crm_booking_business_fk;
alter table public.crm_opportunities add constraint crm_opportunities_crm_booking_business_fk foreign key(linked_crm_booking_id,business_id) references public.crm_bookings(id,business_id) on delete set null;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_pipelines','crm_pipeline_stages','crm_opportunities','crm_tags','crm_contact_tags','crm_quotes','crm_quote_items','crm_bookings']
  LOOP
    EXECUTE format('alter table public.%I enable row level security',t);
    EXECUTE format('revoke all on public.%I from anon',t);
    EXECUTE format('revoke all on public.%I from authenticated',t);
    EXECUTE format('grant select,insert,update,delete on public.%I to authenticated',t);
  END LOOP;
END $$;

grant usage,select on sequence public.crm_quotes_quote_number_seq to authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_pipelines','crm_pipeline_stages','crm_opportunities','crm_tags','crm_contact_tags','crm_quotes','crm_quote_items','crm_bookings']
  LOOP
    EXECUTE format('drop policy if exists %I on public.%I',t||'_member_all',t);
    EXECUTE format('create policy %I on public.%I for all to authenticated using (public.is_business_member(business_id)) with check (public.is_business_member(business_id))',t||'_member_all',t);
  END LOOP;
END $$;

drop policy if exists business_contacts_member_all on public.business_contacts;
create policy business_contacts_member_all on public.business_contacts for all to authenticated
using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_pipelines','crm_pipeline_stages','crm_opportunities','crm_quotes','crm_bookings']
  LOOP
    EXECUTE format('drop trigger if exists %I on public.%I',t||'_touch',t);
    EXECUTE format('create trigger %I before update on public.%I for each row execute function public.crm_touch_updated_at()',t||'_touch',t);
  END LOOP;
END $$;

insert into public.crm_pipelines(business_id,name,is_default,created_by)
select b.id,'Sales Pipeline',true,null
from public.businesses b
where not exists(select 1 from public.crm_pipelines p where p.business_id=b.id and p.is_default and not p.is_archived)
on conflict (business_id,name) do update set is_default=true,is_archived=false;

insert into public.crm_pipeline_stages(business_id,pipeline_id,stage_key,label,position,stage_type,probability,color_token)
select p.business_id,p.id,v.stage_key,v.label,v.position,v.stage_type,v.probability,v.color_token
from public.crm_pipelines p
cross join (values
 ('NEW_LEAD','New lead',10,'OPEN',10::numeric,'neutral'),
 ('CONTACTED','Contacted',20,'OPEN',20::numeric,'info'),
 ('QUALIFIED','Qualified',30,'OPEN',40::numeric,'info'),
 ('QUOTE_SENT','Quote sent',40,'OPEN',60::numeric,'brand'),
 ('NEGOTIATION','Negotiation',50,'OPEN',75::numeric,'brand'),
 ('FOLLOW_UP','Follow-up',60,'OPEN',65::numeric,'warning'),
 ('WON','Won',90,'WON',100::numeric,'success'),
 ('LOST','Lost',100,'LOST',0::numeric,'danger')
) as v(stage_key,label,position,stage_type,probability,color_token)
where p.is_default and not p.is_archived
on conflict (pipeline_id,stage_key) do update set label=excluded.label,position=excluded.position,stage_type=excluded.stage_type,probability=excluded.probability,color_token=excluded.color_token;

insert into public.crm_opportunities(
 business_id,contact_id,title,source,source_detail,pipeline_id,stage_id,status,estimated_value,currency,created_by,last_activity_at,created_at,updated_at,won_at,lost_at
)
select c.business_id,c.id,
       coalesce(nullif(c.company,''),c.display_name)||' opportunity',
       case when c.source in ('EVEREST','GOOGLE','FACEBOOK','INSTAGRAM','WEBSITE','REFERRAL','PHONE','WALK_IN','EMAIL','MANUAL','IMPORT','OTHER') then c.source else 'OTHER' end,
       c.source_detail,p.id,s.id,
       case when c.lead_status='WON' then 'WON' when c.lead_status='LOST' then 'LOST' else 'OPEN' end,
       c.estimated_value,'AUD',c.created_by,coalesce(c.last_contact_at,c.updated_at),c.created_at,c.updated_at,
       case when c.lead_status='WON' then c.updated_at else null end,
       case when c.lead_status='LOST' then c.updated_at else null end
from public.business_contacts c
join public.crm_pipelines p on p.business_id=c.business_id and p.is_default and not p.is_archived
join public.crm_pipeline_stages s on s.pipeline_id=p.id and s.stage_key=(case c.lead_status when 'WON' then 'WON' when 'LOST' then 'LOST' when 'QUOTE_SENT' then 'QUOTE_SENT' when 'FOLLOW_UP' then 'FOLLOW_UP' when 'QUALIFIED' then 'QUALIFIED' when 'CONTACTED' then 'CONTACTED' else 'NEW_LEAD' end)
where c.archived_at is null
  and not exists(select 1 from public.crm_opportunities o where o.business_id=c.business_id and o.contact_id=c.id);

insert into public.crm_tags(business_id,name,created_by)
select distinct c.business_id,trim(x.tag),c.created_by
from public.business_contacts c
cross join lateral unnest(c.tags) as x(tag)
where trim(x.tag)<>''
on conflict do nothing;

insert into public.crm_contact_tags(business_id,contact_id,tag_id)
select c.business_id,c.id,t.id
from public.business_contacts c
cross join lateral unnest(c.tags) as x(tag)
join public.crm_tags t on t.business_id=c.business_id and lower(t.name)=lower(trim(x.tag))
on conflict do nothing;

insert into public.crm_quotes(id,business_id,contact_id,status,subtotal,tax_amount,total,notes,expires_at,legacy_external_quote_id,created_by,created_at,updated_at)
select q.id,q.business_id,q.contact_id,
       case when q.status in ('DRAFT','SENT','VIEWED','ACCEPTED','DECLINED','EXPIRED') then q.status else 'DRAFT' end,
       q.subtotal,q.tax,q.total,q.notes,q.expires_at,q.id,q.created_by,q.created_at,q.updated_at
from public.crm_external_quotes q
on conflict (id) do nothing;

insert into public.crm_quote_items(id,business_id,quote_id,description,quantity,unit_price,position,created_at)
select i.id,i.business_id,i.quote_id,i.description,i.quantity,i.unit_price,
       row_number() over(partition by i.quote_id order by i.created_at,i.id)::integer,i.created_at
from public.crm_external_quote_items i
where exists(select 1 from public.crm_quotes q where q.id=i.quote_id)
on conflict (id) do nothing;

insert into public.crm_bookings(id,business_id,contact_id,quote_id,service_label,scheduled_start,scheduled_end,location_label,price,status,notes,legacy_external_booking_id,created_by,completed_at,cancelled_at,created_at,updated_at)
select b.id,b.business_id,b.contact_id,b.external_quote_id,b.service_label,b.scheduled_start,
       coalesce(b.scheduled_end,b.scheduled_start+interval '1 hour'),b.location_label,b.amount,
       case when b.status='PENDING' then 'TENTATIVE' when b.status in ('CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED') then b.status else 'TENTATIVE' end,
       b.notes,b.id,b.created_by,
       case when b.status='COMPLETED' then b.updated_at else null end,
       case when b.status='CANCELLED' then b.updated_at else null end,
       b.created_at,b.updated_at
from public.crm_external_bookings b
on conflict (id) do nothing;

create or replace function public.crm_ensure_default_pipeline(p_business_id uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare pid uuid;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 select id into pid from public.crm_pipelines where business_id=p_business_id and is_default and not is_archived order by created_at limit 1;
 if pid is null then
  insert into public.crm_pipelines(business_id,name,is_default,created_by) values(p_business_id,'Sales Pipeline',true,auth.uid()) returning id into pid;
  insert into public.crm_pipeline_stages(business_id,pipeline_id,stage_key,label,position,stage_type,probability,color_token) values
   (p_business_id,pid,'NEW_LEAD','New lead',10,'OPEN',10,'neutral'),
   (p_business_id,pid,'CONTACTED','Contacted',20,'OPEN',20,'info'),
   (p_business_id,pid,'QUALIFIED','Qualified',30,'OPEN',40,'info'),
   (p_business_id,pid,'QUOTE_SENT','Quote sent',40,'OPEN',60,'brand'),
   (p_business_id,pid,'NEGOTIATION','Negotiation',50,'OPEN',75,'brand'),
   (p_business_id,pid,'FOLLOW_UP','Follow-up',60,'OPEN',65,'warning'),
   (p_business_id,pid,'WON','Won',90,'WON',100,'success'),
   (p_business_id,pid,'LOST','Lost',100,'LOST',0,'danger');
 end if;
 return pid;
end $$;
revoke all on function public.crm_ensure_default_pipeline(uuid) from public,anon;
grant execute on function public.crm_ensure_default_pipeline(uuid) to authenticated;

create or replace function public.crm_create_opportunity(
 p_business_id uuid,p_contact_id uuid,p_title text,p_source text default 'MANUAL',p_service_label text default null,
 p_estimated_value numeric default null,p_expected_close_date date default null,p_source_detail text default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare pid uuid; sid uuid; oid uuid;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if not exists(select 1 from public.business_contacts c where c.id=p_contact_id and c.business_id=p_business_id and c.archived_at is null) then raise exception 'Contact not available'; end if;
 if length(trim(coalesce(p_title,'')))<1 then raise exception 'Deal title is required'; end if;
 if p_estimated_value is not null and p_estimated_value<0 then raise exception 'Invalid estimated value'; end if;
 if p_source not in ('EVEREST','GOOGLE','FACEBOOK','INSTAGRAM','WEBSITE','REFERRAL','PHONE','WALK_IN','EMAIL','MANUAL','IMPORT','OTHER') then raise exception 'Invalid source'; end if;
 pid:=public.crm_ensure_default_pipeline(p_business_id);
 select id into sid from public.crm_pipeline_stages where business_id=p_business_id and pipeline_id=pid and stage_key='NEW_LEAD';
 insert into public.crm_opportunities(business_id,contact_id,title,source,source_detail,pipeline_id,stage_id,estimated_value,expected_close_date,service_label,owner_id,created_by)
 values(p_business_id,p_contact_id,trim(p_title),p_source,nullif(trim(p_source_detail),''),pid,sid,p_estimated_value,p_expected_close_date,nullif(trim(p_service_label),''),auth.uid(),auth.uid()) returning id into oid;
 insert into public.crm_activities(business_id,contact_id,opportunity_id,kind,title,detail,source_record_type,source_record_id,created_by)
 values(p_business_id,p_contact_id,oid,'DEAL_CREATED','Deal created',trim(p_title),'CRM_OPPORTUNITY',oid,auth.uid());
 update public.business_contacts set last_activity_at=now() where id=p_contact_id and business_id=p_business_id;
 return oid;
end $$;
revoke all on function public.crm_create_opportunity(uuid,uuid,text,text,text,numeric,date,text) from public,anon;
grant execute on function public.crm_create_opportunity(uuid,uuid,text,text,text,numeric,date,text) to authenticated;

create or replace function public.crm_move_opportunity(p_business_id uuid,p_opportunity_id uuid,p_stage_id uuid,p_lost_reason text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare o public.crm_opportunities; s public.crm_pipeline_stages; old_label text;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 select * into o from public.crm_opportunities where id=p_opportunity_id and business_id=p_business_id for update;
 if o.id is null then raise exception 'Deal not found'; end if;
 select * into s from public.crm_pipeline_stages where id=p_stage_id and business_id=p_business_id and pipeline_id=o.pipeline_id;
 if s.id is null then raise exception 'Stage not available'; end if;
 select label into old_label from public.crm_pipeline_stages where id=o.stage_id;
 update public.crm_opportunities set
   stage_id=s.id,
   status=case s.stage_type when 'WON' then 'WON' when 'LOST' then 'LOST' else 'OPEN' end,
   won_at=case when s.stage_type='WON' then coalesce(o.won_at,now()) else null end,
   lost_at=case when s.stage_type='LOST' then coalesce(o.lost_at,now()) else null end,
   lost_reason=case when s.stage_type='LOST' then nullif(trim(p_lost_reason),'') else null end,
   probability=coalesce(o.probability,s.probability),
   last_activity_at=now()
 where id=o.id;
 insert into public.crm_activities(business_id,contact_id,opportunity_id,kind,title,detail,source_record_type,source_record_id,created_by)
 values(p_business_id,o.contact_id,o.id,'DEAL_STAGE_CHANGED','Deal moved to '||s.label,coalesce(old_label,'Previous stage')||' → '||s.label,'CRM_OPPORTUNITY',o.id,auth.uid());
 update public.business_contacts set last_activity_at=now(),lifecycle_stage=case when s.stage_type='WON' then 'CUSTOMER' else lifecycle_stage end where id=o.contact_id and business_id=p_business_id;
 return true;
end $$;
revoke all on function public.crm_move_opportunity(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.crm_move_opportunity(uuid,uuid,uuid,text) to authenticated;

create or replace function public.crm_complete_task(p_business_id uuid,p_task_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare t public.crm_tasks;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 update public.crm_tasks set status='DONE',completed_at=now() where id=p_task_id and business_id=p_business_id and status='OPEN' returning * into t;
 if t.id is null then return false; end if;
 if t.contact_id is not null then
  insert into public.crm_activities(business_id,contact_id,opportunity_id,kind,title,detail,source_record_type,source_record_id,created_by)
  values(p_business_id,t.contact_id,t.opportunity_id,'TASK_COMPLETED','Task completed',t.task,'CRM_TASK',t.id,auth.uid());
  update public.business_contacts set last_activity_at=now() where id=t.contact_id and business_id=p_business_id;
 end if;
 return true;
end $$;
revoke all on function public.crm_complete_task(uuid,uuid) from public,anon;
grant execute on function public.crm_complete_task(uuid,uuid) to authenticated;

create or replace function public.crm_archive_contact(p_business_id uuid,p_contact_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 update public.business_contacts set archived_at=now(),archived_by=auth.uid(),lifecycle_stage='ARCHIVED' where id=p_contact_id and business_id=p_business_id and archived_at is null;
 if not found then return false; end if;
 insert into public.crm_activities(business_id,contact_id,kind,title,created_by) values(p_business_id,p_contact_id,'CONTACT_ARCHIVED','Contact archived',auth.uid());
 return true;
end $$;
revoke all on function public.crm_archive_contact(uuid,uuid) from public,anon;
grant execute on function public.crm_archive_contact(uuid,uuid) to authenticated;

create or replace function public.crm_merge_contacts(p_business_id uuid,p_primary_contact_id uuid,p_secondary_contact_id uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare p public.business_contacts; s public.business_contacts;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if p_primary_contact_id=p_secondary_contact_id then raise exception 'Choose two different contacts'; end if;
 select * into p from public.business_contacts where id=p_primary_contact_id and business_id=p_business_id for update;
 select * into s from public.business_contacts where id=p_secondary_contact_id and business_id=p_business_id for update;
 if p.id is null or s.id is null then raise exception 'Contact not found'; end if;
 if p.linked_everest_user_id is not null and s.linked_everest_user_id is not null and p.linked_everest_user_id<>s.linked_everest_user_id then raise exception 'Contacts are linked to different Everest users'; end if;
 update public.crm_opportunities set contact_id=p.id where business_id=p_business_id and contact_id=s.id;
 update public.crm_tasks set contact_id=p.id where business_id=p_business_id and contact_id=s.id;
 update public.crm_notes set contact_id=p.id where business_id=p_business_id and contact_id=s.id;
 update public.crm_activities set contact_id=p.id where business_id=p_business_id and contact_id=s.id;
 update public.crm_quotes set contact_id=p.id where business_id=p_business_id and contact_id=s.id;
 update public.crm_bookings set contact_id=p.id where business_id=p_business_id and contact_id=s.id;
 insert into public.crm_contact_tags(business_id,contact_id,tag_id)
   select p_business_id,p.id,ct.tag_id from public.crm_contact_tags ct where ct.business_id=p_business_id and ct.contact_id=s.id
   on conflict do nothing;
 delete from public.crm_contact_tags where business_id=p_business_id and contact_id=s.id;
 update public.business_contacts set
   phone=coalesce(p.phone,s.phone),email=coalesce(p.email,s.email),company=coalesce(p.company,s.company),
   suburb=coalesce(p.suburb,s.suburb),city=coalesce(p.city,s.city),state=coalesce(p.state,s.state),country=coalesce(p.country,s.country),
   linked_everest_user_id=coalesce(p.linked_everest_user_id,s.linked_everest_user_id),
   last_activity_at=greatest(coalesce(p.last_activity_at,'epoch'::timestamptz),coalesce(s.last_activity_at,'epoch'::timestamptz))
 where id=p.id and business_id=p_business_id;
 update public.business_contacts set archived_at=now(),archived_by=auth.uid(),merged_into_id=p.id,lifecycle_stage='ARCHIVED' where id=s.id and business_id=p_business_id;
 insert into public.crm_activities(business_id,contact_id,kind,title,detail,created_by)
 values(p_business_id,p.id,'CONTACT_MERGED','Contacts merged','Merged '||s.display_name||' into '||p.display_name,auth.uid());
 return true;
end $$;
revoke all on function public.crm_merge_contacts(uuid,uuid,uuid) from public,anon;
grant execute on function public.crm_merge_contacts(uuid,uuid,uuid) to authenticated;

create or replace function public.crm_convert_quote_to_booking(
 p_business_id uuid,p_quote_id uuid,p_scheduled_start timestamptz,p_duration_minutes integer default 60,p_location_label text default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare q public.crm_quotes; bid uuid;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if p_duration_minutes<15 or p_duration_minutes>1440 then raise exception 'Invalid duration'; end if;
 select * into q from public.crm_quotes where id=p_quote_id and business_id=p_business_id for update;
 if q.id is null then raise exception 'Quote not found'; end if;
 if q.status<>'ACCEPTED' then raise exception 'Only accepted quotes can be converted to bookings'; end if;
 if exists(select 1 from public.crm_bookings b where b.business_id=p_business_id and b.status not in ('CANCELLED','NO_SHOW') and tstzrange(b.scheduled_start,b.scheduled_end,'[)') && tstzrange(p_scheduled_start,p_scheduled_start+make_interval(mins=>p_duration_minutes),'[)')) then raise exception 'Booking conflicts with an existing CRM booking'; end if;
 insert into public.crm_bookings(business_id,contact_id,opportunity_id,quote_id,service_label,scheduled_start,scheduled_end,location_label,price,status,created_by)
 values(p_business_id,q.contact_id,q.opportunity_id,q.id,coalesce(nullif(q.title,''),'Booked service'),p_scheduled_start,p_scheduled_start+make_interval(mins=>p_duration_minutes),nullif(trim(p_location_label),''),q.total,'CONFIRMED',auth.uid()) returning id into bid;
 if q.opportunity_id is not null then update public.crm_opportunities set linked_crm_quote_id=q.id,linked_crm_booking_id=bid,last_activity_at=now() where id=q.opportunity_id and business_id=p_business_id; end if;
 insert into public.crm_activities(business_id,contact_id,opportunity_id,kind,title,detail,source_record_type,source_record_id,created_by)
 values(p_business_id,q.contact_id,q.opportunity_id,'BOOKING_CREATED','Booking created from quote',coalesce(q.title,'CRM quote'),'CRM_BOOKING',bid,auth.uid());
 return bid;
end $$;
revoke all on function public.crm_convert_quote_to_booking(uuid,uuid,timestamptz,integer,text) from public,anon;
grant execute on function public.crm_convert_quote_to_booking(uuid,uuid,timestamptz,integer,text) to authenticated;

create or replace function private.crm_sync_marketplace_opportunity()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.service_requests; p public.profiles; cid uuid; pid uuid; sid uuid; oid uuid; value_est numeric;
begin
 select * into r from public.service_requests where id=new.request_id;
 if r.id is null then return new; end if;
 select * into p from public.profiles where id=r.customer_id;
 insert into public.business_contacts(business_id,linked_everest_user_id,display_name,phone,source,source_detail,suburb,city,state,country,lifecycle_stage,last_activity_at,created_by)
 values(new.business_id,r.customer_id,coalesce(nullif(trim(p.full_name),''),'Everest customer'),p.phone,'EVEREST','Marketplace request',r.suburb,r.city,r.state,r.country,'LEAD',now(),null)
 on conflict (business_id,linked_everest_user_id) where linked_everest_user_id is not null do update set
   display_name=coalesce(nullif(excluded.display_name,'Everest customer'),public.business_contacts.display_name),
   phone=coalesce(public.business_contacts.phone,excluded.phone),suburb=coalesce(excluded.suburb,public.business_contacts.suburb),city=coalesce(excluded.city,public.business_contacts.city),state=coalesce(excluded.state,public.business_contacts.state),country=coalesce(excluded.country,public.business_contacts.country),last_activity_at=now()
 returning id into cid;
 select id into pid from public.crm_pipelines where business_id=new.business_id and is_default and not is_archived order by created_at limit 1;
 if pid is null then
  insert into public.crm_pipelines(business_id,name,is_default) values(new.business_id,'Sales Pipeline',true) returning id into pid;
  insert into public.crm_pipeline_stages(business_id,pipeline_id,stage_key,label,position,stage_type,probability,color_token) values
   (new.business_id,pid,'NEW_LEAD','New lead',10,'OPEN',10,'neutral'),(new.business_id,pid,'CONTACTED','Contacted',20,'OPEN',20,'info'),
   (new.business_id,pid,'QUALIFIED','Qualified',30,'OPEN',40,'info'),(new.business_id,pid,'QUOTE_SENT','Quote sent',40,'OPEN',60,'brand'),
   (new.business_id,pid,'NEGOTIATION','Negotiation',50,'OPEN',75,'brand'),(new.business_id,pid,'FOLLOW_UP','Follow-up',60,'OPEN',65,'warning'),
   (new.business_id,pid,'WON','Won',90,'WON',100,'success'),(new.business_id,pid,'LOST','Lost',100,'LOST',0,'danger');
 end if;
 select id into sid from public.crm_pipeline_stages where pipeline_id=pid and stage_key='NEW_LEAD';
 value_est:=coalesce(r.budget,case when r.budget_min is not null and r.budget_max is not null then (r.budget_min+r.budget_max)/2 else coalesce(r.budget_min,r.budget_max) end);
 select id into oid from public.crm_opportunities where business_id=new.business_id and linked_service_request_id=r.id;
 if oid is null then
  insert into public.crm_opportunities(business_id,contact_id,title,service_id,service_label,source,source_detail,pipeline_id,stage_id,estimated_value,linked_service_request_id,linked_marketplace_opportunity_id,last_activity_at)
  values(new.business_id,cid,left(r.description,240),r.service_id,left(r.description,120),'EVEREST','Everest marketplace',pid,sid,value_est,r.id,new.id,now()) returning id into oid;
  insert into public.crm_activities(business_id,contact_id,opportunity_id,kind,title,detail,source_record_type,source_record_id)
  values(new.business_id,cid,oid,'MARKETPLACE_LEAD_RECEIVED','Everest lead received',left(r.description,240),'SERVICE_REQUEST',r.id);
 else
  update public.crm_opportunities set linked_marketplace_opportunity_id=new.id,last_activity_at=now() where id=oid;
 end if;
 return new;
end $$;
revoke all on function private.crm_sync_marketplace_opportunity() from public,anon,authenticated;

drop trigger if exists opportunities_crm_sync on public.opportunities;
create trigger opportunities_crm_sync after insert or update on public.opportunities for each row execute function private.crm_sync_marketplace_opportunity();

create or replace function private.crm_sync_marketplace_quote()
returns trigger language plpgsql security definer set search_path='' as $$
declare o public.crm_opportunities; sid uuid;
begin
 select * into o from public.crm_opportunities where business_id=new.business_id and linked_service_request_id=new.request_id order by created_at limit 1;
 if o.id is null then return new; end if;
 if new.status in ('SENT','VIEWED') then
  select id into sid from public.crm_pipeline_stages where pipeline_id=o.pipeline_id and stage_key='QUOTE_SENT';
  update public.crm_opportunities set stage_id=coalesce(sid,stage_id),linked_marketplace_quote_id=new.id,last_activity_at=now() where id=o.id;
 else
  update public.crm_opportunities set linked_marketplace_quote_id=new.id,last_activity_at=now() where id=o.id;
 end if;
 insert into public.crm_activities(business_id,contact_id,opportunity_id,kind,title,detail,source_record_type,source_record_id)
 values(new.business_id,o.contact_id,o.id,'MARKETPLACE_QUOTE_'||new.status,'Everest quote '||lower(new.status::text),'$'||new.total::text,'QUOTE',new.id);
 return new;
end $$;
revoke all on function private.crm_sync_marketplace_quote() from public,anon,authenticated;

drop trigger if exists quotes_crm_sync on public.quotes;
create trigger quotes_crm_sync after insert or update of status,total on public.quotes for each row execute function private.crm_sync_marketplace_quote();

create or replace function private.crm_sync_marketplace_booking()
returns trigger language plpgsql security definer set search_path='' as $$
declare o public.crm_opportunities; sid uuid;
begin
 if new.request_id is null then return new; end if;
 select * into o from public.crm_opportunities where business_id=new.business_id and linked_service_request_id=new.request_id order by created_at limit 1;
 if o.id is null then return new; end if;
 update public.crm_opportunities set linked_marketplace_booking_id=new.id,last_activity_at=now() where id=o.id;
 if new.status='COMPLETED' then
  select id into sid from public.crm_pipeline_stages where pipeline_id=o.pipeline_id and stage_key='WON';
  update public.crm_opportunities set stage_id=coalesce(sid,stage_id),status='WON',won_at=coalesce(won_at,coalesce(new.completed_at,now())),lost_at=null,lost_reason=null,last_activity_at=now() where id=o.id;
  update public.business_contacts set lifecycle_stage='CUSTOMER',last_activity_at=now() where id=o.contact_id and business_id=new.business_id;
 end if;
 insert into public.crm_activities(business_id,contact_id,opportunity_id,kind,title,detail,source_record_type,source_record_id)
 values(new.business_id,o.contact_id,o.id,'MARKETPLACE_BOOKING_'||new.status,'Everest booking '||lower(replace(new.status::text,'_',' ')),'$'||new.price::text,'BOOKING',new.id);
 return new;
end $$;
revoke all on function private.crm_sync_marketplace_booking() from public,anon,authenticated;

drop trigger if exists bookings_crm_sync on public.bookings;
create trigger bookings_crm_sync after insert or update of status,price,scheduled_date,scheduled_time on public.bookings for each row execute function private.crm_sync_marketplace_booking();

revoke all on public.crm_pipelines,public.crm_pipeline_stages,public.crm_opportunities,public.crm_tags,public.crm_contact_tags,public.crm_quotes,public.crm_quote_items,public.crm_bookings from anon;


-- Business-member RPCs used by the CRM client. Calculated totals and tenant relationships
-- are enforced server-side instead of trusting client-provided business identifiers or totals.
create or replace function public.crm_create_contact(
 p_business_id uuid,p_display_name text,p_phone text default null,p_email text default null,p_company text default null,
 p_source text default 'MANUAL',p_source_detail text default null,p_suburb text default null,p_city text default null,
 p_state text default null,p_country text default null,p_notes text default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare cid uuid;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if length(trim(coalesce(p_display_name,'')))<1 then raise exception 'Contact name is required'; end if;
 if p_source not in ('EVEREST','GOOGLE','FACEBOOK','INSTAGRAM','WEBSITE','REFERRAL','PHONE','WALK_IN','EMAIL','MANUAL','IMPORT','OTHER') then raise exception 'Invalid source'; end if;
 insert into public.business_contacts(
   business_id,display_name,phone,email,company,source,source_detail,suburb,city,state,country,notes,lifecycle_stage,created_by,last_activity_at
 ) values(
   p_business_id,trim(p_display_name),nullif(trim(p_phone),''),nullif(lower(trim(p_email)),''),nullif(trim(p_company),''),
   p_source,nullif(trim(p_source_detail),''),nullif(trim(p_suburb),''),nullif(trim(p_city),''),nullif(trim(p_state),''),
   nullif(trim(p_country),''),nullif(trim(p_notes),''),'LEAD',auth.uid(),now()
 ) returning id into cid;
 insert into public.crm_activities(business_id,contact_id,kind,title,detail,created_by)
 values(p_business_id,cid,'CONTACT_CREATED','Contact created','Source: '||replace(p_source,'_',' '),auth.uid());
 return cid;
end $$;
revoke all on function public.crm_create_contact(uuid,text,text,text,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.crm_create_contact(uuid,text,text,text,text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.crm_create_task(
 p_business_id uuid,p_contact_id uuid,p_opportunity_id uuid,p_title text,p_type text,p_due_at timestamptz,
 p_priority text default 'NORMAL',p_notes text default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare tid uuid; oid_contact uuid;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if length(trim(coalesce(p_title,'')))<1 then raise exception 'Task title is required'; end if;
 if p_type not in ('CALL','EMAIL','MESSAGE','FOLLOW_UP','APPOINTMENT','GENERAL') then raise exception 'Invalid task type'; end if;
 if p_priority not in ('LOW','NORMAL','HIGH') then raise exception 'Invalid priority'; end if;
 if p_contact_id is not null and not exists(select 1 from public.business_contacts c where c.id=p_contact_id and c.business_id=p_business_id and c.archived_at is null) then raise exception 'Contact not available'; end if;
 if p_opportunity_id is not null then
   select contact_id into oid_contact from public.crm_opportunities where id=p_opportunity_id and business_id=p_business_id;
   if oid_contact is null then raise exception 'Deal not available'; end if;
   if p_contact_id is not null and oid_contact<>p_contact_id then raise exception 'Task contact does not match deal'; end if;
 end if;
 insert into public.crm_tasks(business_id,contact_id,opportunity_id,task,task_type,due_at,priority,notes,owner_id,created_by)
 values(p_business_id,coalesce(p_contact_id,oid_contact),p_opportunity_id,trim(p_title),p_type,p_due_at,p_priority,nullif(trim(p_notes),''),auth.uid(),auth.uid())
 returning id into tid;
 if coalesce(p_contact_id,oid_contact) is not null then
   insert into public.crm_activities(business_id,contact_id,opportunity_id,kind,title,detail,source_record_type,source_record_id,created_by)
   values(p_business_id,coalesce(p_contact_id,oid_contact),p_opportunity_id,'TASK_CREATED','Task created',trim(p_title),'CRM_TASK',tid,auth.uid());
   update public.business_contacts set last_activity_at=now(),next_follow_up_at=
     case when next_follow_up_at is null or p_due_at<next_follow_up_at then p_due_at else next_follow_up_at end
   where id=coalesce(p_contact_id,oid_contact) and business_id=p_business_id;
 end if;
 return tid;
end $$;
revoke all on function public.crm_create_task(uuid,uuid,uuid,text,text,timestamptz,text,text) from public,anon;
grant execute on function public.crm_create_task(uuid,uuid,uuid,text,text,timestamptz,text,text) to authenticated;

create or replace function public.crm_create_quote(
 p_business_id uuid,p_contact_id uuid,p_opportunity_id uuid,p_title text,p_items jsonb,
 p_discount_amount numeric default 0,p_tax_amount numeric default 0,p_deposit_amount numeric default 0,
 p_notes text default null,p_terms text default null,p_expires_at timestamptz default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare qid uuid; item jsonb; item_desc text; qty numeric; unit numeric; item_discount numeric; gross numeric; calc_subtotal numeric:=0; calc_total numeric;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if not exists(select 1 from public.business_contacts c where c.id=p_contact_id and c.business_id=p_business_id and c.archived_at is null) then raise exception 'Contact not available'; end if;
 if p_opportunity_id is not null and not exists(select 1 from public.crm_opportunities o where o.id=p_opportunity_id and o.business_id=p_business_id and o.contact_id=p_contact_id) then raise exception 'Deal does not belong to this contact'; end if;
 if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then raise exception 'Add at least one line item'; end if;
 if coalesce(p_discount_amount,0)<0 or coalesce(p_tax_amount,0)<0 or coalesce(p_deposit_amount,0)<0 then raise exception 'Invalid pricing'; end if;
 for item in select value from jsonb_array_elements(p_items)
 loop
   item_desc:=trim(coalesce(item->>'description',''));
   qty:=coalesce(nullif(item->>'quantity','')::numeric,1);
   unit:=coalesce(nullif(item->>'unit_price','')::numeric,0);
   item_discount:=coalesce(nullif(item->>'discount_amount','')::numeric,0);
   if length(item_desc)<1 or qty<=0 or unit<0 or item_discount<0 then raise exception 'Invalid line item'; end if;
   gross:=qty*unit;
   if item_discount>gross then raise exception 'Line item discount exceeds line total'; end if;
   calc_subtotal:=calc_subtotal+gross-item_discount;
 end loop;
 if p_discount_amount>calc_subtotal then raise exception 'Discount exceeds subtotal'; end if;
 calc_total:=calc_subtotal-p_discount_amount+p_tax_amount;
 if p_deposit_amount>calc_total then raise exception 'Deposit exceeds total'; end if;
 insert into public.crm_quotes(
   business_id,contact_id,opportunity_id,title,discount_amount,tax_amount,subtotal,total,deposit_amount,notes,terms,expires_at,created_by
 ) values(
   p_business_id,p_contact_id,p_opportunity_id,nullif(trim(p_title),''),p_discount_amount,p_tax_amount,calc_subtotal,calc_total,p_deposit_amount,
   nullif(trim(p_notes),''),nullif(trim(p_terms),''),p_expires_at,auth.uid()
 ) returning id into qid;
 insert into public.crm_quote_items(business_id,quote_id,description,quantity,unit_price,discount_amount,position)
 select p_business_id,qid,trim(value->>'description'),
        coalesce(nullif(value->>'quantity','')::numeric,1),
        coalesce(nullif(value->>'unit_price','')::numeric,0),
        coalesce(nullif(value->>'discount_amount','')::numeric,0),
        (ordinality-1)::integer
 from jsonb_array_elements(p_items) with ordinality;
 insert into public.crm_activities(business_id,contact_id,opportunity_id,kind,title,detail,source_record_type,source_record_id,created_by)
 values(p_business_id,p_contact_id,p_opportunity_id,'QUOTE_CREATED','Quote created','$'||calc_total::text,'CRM_QUOTE',qid,auth.uid());
 if p_opportunity_id is not null then update public.crm_opportunities set linked_crm_quote_id=qid,last_activity_at=now() where id=p_opportunity_id and business_id=p_business_id; end if;
 update public.business_contacts set last_activity_at=now() where id=p_contact_id and business_id=p_business_id;
 return qid;
end $$;
revoke all on function public.crm_create_quote(uuid,uuid,uuid,text,jsonb,numeric,numeric,numeric,text,text,timestamptz) from public,anon;
grant execute on function public.crm_create_quote(uuid,uuid,uuid,text,jsonb,numeric,numeric,numeric,text,text,timestamptz) to authenticated;

create or replace function public.crm_set_quote_status(p_business_id uuid,p_quote_id uuid,p_status text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.crm_quotes; now_at timestamptz:=now();
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if p_status not in ('DRAFT','SENT','VIEWED','ACCEPTED','DECLINED','EXPIRED','CANCELLED') then raise exception 'Invalid quote status'; end if;
 select * into q from public.crm_quotes where id=p_quote_id and business_id=p_business_id for update;
 if q.id is null then raise exception 'Quote not found'; end if;
 update public.crm_quotes set status=p_status,
   sent_at=case when p_status='SENT' then coalesce(sent_at,now_at) else sent_at end,
   viewed_at=case when p_status='VIEWED' then coalesce(viewed_at,now_at) else viewed_at end,
   accepted_at=case when p_status='ACCEPTED' then coalesce(accepted_at,now_at) else accepted_at end,
   declined_at=case when p_status='DECLINED' then coalesce(declined_at,now_at) else declined_at end
 where id=q.id;
 insert into public.crm_activities(business_id,contact_id,opportunity_id,kind,title,detail,source_record_type,source_record_id,created_by)
 values(p_business_id,q.contact_id,q.opportunity_id,'QUOTE_'||p_status,'Quote '||lower(p_status),coalesce(q.title,'CRM quote'),'CRM_QUOTE',q.id,auth.uid());
 if q.opportunity_id is not null and p_status in ('SENT','VIEWED') then
   update public.crm_opportunities o set stage_id=s.id,last_activity_at=now_at
   from public.crm_pipeline_stages s where o.id=q.opportunity_id and o.business_id=p_business_id and s.pipeline_id=o.pipeline_id and s.stage_key='QUOTE_SENT';
 end if;
 return true;
end $$;
revoke all on function public.crm_set_quote_status(uuid,uuid,text) from public,anon;
grant execute on function public.crm_set_quote_status(uuid,uuid,text) to authenticated;

create or replace function public.crm_create_booking(
 p_business_id uuid,p_contact_id uuid,p_opportunity_id uuid,p_quote_id uuid,p_service_label text,
 p_scheduled_start timestamptz,p_duration_minutes integer default 60,p_location_label text default null,
 p_price numeric default null,p_status text default 'CONFIRMED',p_notes text default null
) returns uuid language plpgsql security invoker set search_path='' as $$
declare bid uuid; finish timestamptz;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if not exists(select 1 from public.business_contacts c where c.id=p_contact_id and c.business_id=p_business_id and c.archived_at is null) then raise exception 'Contact not available'; end if;
 if p_opportunity_id is not null and not exists(select 1 from public.crm_opportunities o where o.id=p_opportunity_id and o.business_id=p_business_id and o.contact_id=p_contact_id) then raise exception 'Deal does not belong to this contact'; end if;
 if p_quote_id is not null and not exists(select 1 from public.crm_quotes q where q.id=p_quote_id and q.business_id=p_business_id and q.contact_id=p_contact_id) then raise exception 'Quote does not belong to this contact'; end if;
 if length(trim(coalesce(p_service_label,'')))<1 then raise exception 'Service is required'; end if;
 if p_duration_minutes<15 or p_duration_minutes>1440 then raise exception 'Invalid duration'; end if;
 if p_price is not null and p_price<0 then raise exception 'Invalid price'; end if;
 if p_status not in ('TENTATIVE','CONFIRMED') then raise exception 'New bookings must be tentative or confirmed'; end if;
 finish:=p_scheduled_start+make_interval(mins=>p_duration_minutes);
 if exists(select 1 from public.crm_bookings b where b.business_id=p_business_id and b.status not in ('CANCELLED','NO_SHOW') and tstzrange(b.scheduled_start,b.scheduled_end,'[)') && tstzrange(p_scheduled_start,finish,'[)')) then raise exception 'Booking conflicts with an existing CRM booking'; end if;
 insert into public.crm_bookings(business_id,contact_id,opportunity_id,quote_id,service_label,scheduled_start,scheduled_end,location_label,price,status,notes,created_by)
 values(p_business_id,p_contact_id,p_opportunity_id,p_quote_id,trim(p_service_label),p_scheduled_start,finish,nullif(trim(p_location_label),''),p_price,p_status,nullif(trim(p_notes),''),auth.uid())
 returning id into bid;
 insert into public.crm_activities(business_id,contact_id,opportunity_id,kind,title,detail,source_record_type,source_record_id,created_by)
 values(p_business_id,p_contact_id,p_opportunity_id,'BOOKING_CREATED','Booking created',trim(p_service_label),'CRM_BOOKING',bid,auth.uid());
 if p_opportunity_id is not null then update public.crm_opportunities set linked_crm_booking_id=bid,last_activity_at=now() where id=p_opportunity_id and business_id=p_business_id; end if;
 update public.business_contacts set last_activity_at=now() where id=p_contact_id and business_id=p_business_id;
 return bid;
end $$;
revoke all on function public.crm_create_booking(uuid,uuid,uuid,uuid,text,timestamptz,integer,text,numeric,text,text) from public,anon;
grant execute on function public.crm_create_booking(uuid,uuid,uuid,uuid,text,timestamptz,integer,text,numeric,text,text) to authenticated;

create or replace function public.crm_set_booking_status(p_business_id uuid,p_booking_id uuid,p_status text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare b public.crm_bookings;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if p_status not in ('TENTATIVE','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED','NO_SHOW') then raise exception 'Invalid booking status'; end if;
 select * into b from public.crm_bookings where id=p_booking_id and business_id=p_business_id for update;
 if b.id is null then raise exception 'Booking not found'; end if;
 update public.crm_bookings set status=p_status,
   completed_at=case when p_status='COMPLETED' then coalesce(completed_at,now()) else completed_at end,
   cancelled_at=case when p_status='CANCELLED' then coalesce(cancelled_at,now()) else cancelled_at end
 where id=b.id;
 insert into public.crm_activities(business_id,contact_id,opportunity_id,kind,title,detail,source_record_type,source_record_id,created_by)
 values(p_business_id,b.contact_id,b.opportunity_id,'BOOKING_'||p_status,'Booking '||lower(replace(p_status,'_',' ')),b.service_label,'CRM_BOOKING',b.id,auth.uid());
 if p_status='COMPLETED' then update public.business_contacts set lifecycle_stage='CUSTOMER',last_activity_at=now() where id=b.contact_id and business_id=p_business_id; end if;
 return true;
end $$;
revoke all on function public.crm_set_booking_status(uuid,uuid,text) from public,anon;
grant execute on function public.crm_set_booking_status(uuid,uuid,text) to authenticated;

create or replace function public.crm_log_communication(
 p_business_id uuid,p_contact_id uuid,p_opportunity_id uuid,p_channel text,p_direction text,p_summary text
) returns uuid language plpgsql security invoker set search_path='' as $$
declare aid uuid;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if p_channel not in ('CALL','SMS','EMAIL','INSTAGRAM_DM','FACEBOOK_MESSAGE','OTHER') then raise exception 'Invalid communication channel'; end if;
 if p_direction not in ('INBOUND','OUTBOUND') then raise exception 'Invalid direction'; end if;
 if not exists(select 1 from public.business_contacts c where c.id=p_contact_id and c.business_id=p_business_id) then raise exception 'Contact not available'; end if;
 if p_opportunity_id is not null and not exists(select 1 from public.crm_opportunities o where o.id=p_opportunity_id and o.business_id=p_business_id and o.contact_id=p_contact_id) then raise exception 'Deal does not belong to this contact'; end if;
 insert into public.crm_activities(business_id,contact_id,opportunity_id,kind,title,detail,channel,metadata,created_by)
 values(p_business_id,p_contact_id,p_opportunity_id,'COMMUNICATION_LOGGED',replace(p_channel,'_',' ')||' logged',nullif(trim(p_summary),''),p_channel,jsonb_build_object('direction',p_direction),auth.uid())
 returning id into aid;
 update public.business_contacts set last_activity_at=now(),last_contact_at=now() where id=p_contact_id and business_id=p_business_id;
 if p_opportunity_id is not null then update public.crm_opportunities set last_activity_at=now() where id=p_opportunity_id and business_id=p_business_id; end if;
 return aid;
end $$;
revoke all on function public.crm_log_communication(uuid,uuid,uuid,text,text,text) from public,anon;
grant execute on function public.crm_log_communication(uuid,uuid,uuid,text,text,text) to authenticated;


-- Calendar-owned blocked time is private CRM data and tenant-isolated.
create table if not exists public.crm_calendar_blocks (
 id uuid primary key default gen_random_uuid(),
 business_id uuid not null references public.businesses(id) on delete cascade,
 title text not null default 'Blocked time' check (length(trim(title)) between 1 and 120),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check (ends_at>starts_at)
);
create index if not exists crm_calendar_blocks_time_idx on public.crm_calendar_blocks(business_id,starts_at,ends_at);
alter table public.crm_calendar_blocks enable row level security;
revoke all on public.crm_calendar_blocks from anon,authenticated;
grant select,insert,update,delete on public.crm_calendar_blocks to authenticated;
drop policy if exists crm_calendar_blocks_member_all on public.crm_calendar_blocks;
create policy crm_calendar_blocks_member_all on public.crm_calendar_blocks for all to authenticated
using (public.is_business_member(business_id)) with check (public.is_business_member(business_id));
drop trigger if exists crm_calendar_blocks_touch on public.crm_calendar_blocks;
create trigger crm_calendar_blocks_touch before update on public.crm_calendar_blocks for each row execute function public.crm_touch_updated_at();

create or replace function public.crm_create_calendar_block(
 p_business_id uuid,p_title text,p_starts_at timestamptz,p_ends_at timestamptz
) returns uuid language plpgsql security invoker set search_path='' as $$
declare bid uuid;
begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if p_ends_at<=p_starts_at then raise exception 'Invalid blocked time'; end if;
 insert into public.crm_calendar_blocks(business_id,title,starts_at,ends_at,created_by)
 values(p_business_id,coalesce(nullif(trim(p_title),''),'Blocked time'),p_starts_at,p_ends_at,auth.uid()) returning id into bid;
 return bid;
end $$;
revoke all on function public.crm_create_calendar_block(uuid,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.crm_create_calendar_block(uuid,text,timestamptz,timestamptz) to authenticated;
