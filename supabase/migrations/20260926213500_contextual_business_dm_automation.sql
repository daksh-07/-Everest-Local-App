-- Product/service inquiry conversations and business DM automation.
-- Adds context-aware marketplace chat without replacing the existing request/quote/booking conversation path.

alter table public.conversations
  add column if not exists context_type text not null default 'GENERAL',
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists service_id uuid references public.services(id) on delete set null,
  add column if not exists context_title text;

do $$ begin
  alter table public.conversations
    add constraint conversations_context_type_check
    check (context_type in ('GENERAL','PRODUCT','SERVICE'));
exception when duplicate_object then null; end $$;

create unique index if not exists conversations_product_inquiry_unique
  on public.conversations(customer_id,business_id,product_id)
  where context_type='PRODUCT' and product_id is not null;

create unique index if not exists conversations_service_inquiry_unique
  on public.conversations(customer_id,business_id,service_id)
  where context_type='SERVICE' and service_id is not null;

create index if not exists conversations_business_context_idx
  on public.conversations(business_id,context_type,created_at desc);


alter table public.messages
  add column if not exists is_automated boolean not null default false,
  add column if not exists automation_source text;

do $ begin
  alter table public.messages
    add constraint messages_automation_source_check
    check (automation_source is null or automation_source in ('FAQ','EVEREST_AI'));
exception when duplicate_object then null; end $;

create or replace function public.get_or_create_business_inquiry(
  p_business_id uuid,
  p_context_type text,
  p_context_id uuid
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_title text;
  v_conversation uuid;
  v_lock_key bigint;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if p_business_id is null or p_context_id is null then raise exception 'Business and item are required'; end if;
  if p_context_type not in ('PRODUCT','SERVICE') then raise exception 'Unsupported inquiry type'; end if;

  if not exists(
    select 1 from public.businesses b
    where b.id=p_business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'
  ) then raise exception 'Business is unavailable'; end if;

  if p_context_type='PRODUCT' then
    select p.name into v_title
    from public.products p
    where p.id=p_context_id and p.business_id=p_business_id and p.status in ('ACTIVE','OUT_OF_STOCK');
    if v_title is null then raise exception 'Product is unavailable'; end if;
  else
    select s.name into v_title
    from public.services s
    where s.id=p_context_id and s.business_id=p_business_id and s.active=true;
    if v_title is null then raise exception 'Service is unavailable'; end if;
  end if;

  v_lock_key := hashtextextended(v_user::text || ':' || p_business_id::text || ':' || p_context_type || ':' || p_context_id::text,0);
  perform pg_advisory_xact_lock(v_lock_key);

  if p_context_type='PRODUCT' then
    select c.id into v_conversation
    from public.conversations c
    where c.customer_id=v_user and c.business_id=p_business_id and c.context_type='PRODUCT' and c.product_id=p_context_id
    order by c.created_at asc limit 1;
  else
    select c.id into v_conversation
    from public.conversations c
    where c.customer_id=v_user and c.business_id=p_business_id and c.context_type='SERVICE' and c.service_id=p_context_id
    order by c.created_at asc limit 1;
  end if;

  if v_conversation is null then
    insert into public.conversations(customer_id,business_id,context_type,product_id,service_id,context_title)
    values(
      v_user,p_business_id,p_context_type,
      case when p_context_type='PRODUCT' then p_context_id else null end,
      case when p_context_type='SERVICE' then p_context_id else null end,
      v_title
    )
    returning id into v_conversation;
  end if;

  return v_conversation;
end;
$$;
revoke all on function public.get_or_create_business_inquiry(uuid,text,uuid) from public,anon;
grant execute on function public.get_or_create_business_inquiry(uuid,text,uuid) to authenticated;

create table if not exists public.business_dm_settings(
  business_id uuid primary key references public.businesses(id) on delete cascade,
  ai_enabled boolean not null default false,
  faq_enabled boolean not null default true,
  ai_tone text not null default 'HELPFUL' check(ai_tone in ('HELPFUL','CONCISE','FRIENDLY','PROFESSIONAL')),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_dm_faq(
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  context_type text not null default 'ALL' check(context_type in ('ALL','PRODUCT','SERVICE')),
  question text not null check(length(trim(question)) between 3 and 240),
  answer text not null check(length(trim(answer)) between 1 and 2000),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_dm_faq_lookup_idx
  on public.business_dm_faq(business_id,context_type,active,sort_order);

alter table public.business_dm_settings enable row level security;
alter table public.business_dm_faq enable row level security;

revoke all on public.business_dm_settings from anon,authenticated;
revoke all on public.business_dm_faq from anon,authenticated;
grant select,insert,update on public.business_dm_settings to authenticated;
grant select,insert,update,delete on public.business_dm_faq to authenticated;

drop policy if exists business_dm_settings_member_select on public.business_dm_settings;
create policy business_dm_settings_member_select on public.business_dm_settings
for select to authenticated using(public.is_business_member(business_id));

drop policy if exists business_dm_settings_member_insert on public.business_dm_settings;
create policy business_dm_settings_member_insert on public.business_dm_settings
for insert to authenticated with check(public.is_business_member(business_id));

drop policy if exists business_dm_settings_member_update on public.business_dm_settings;
create policy business_dm_settings_member_update on public.business_dm_settings
for update to authenticated using(public.is_business_member(business_id))
with check(public.is_business_member(business_id));

drop policy if exists business_dm_faq_member_select on public.business_dm_faq;
create policy business_dm_faq_member_select on public.business_dm_faq
for select to authenticated using(public.is_business_member(business_id));

drop policy if exists business_dm_faq_member_insert on public.business_dm_faq;
create policy business_dm_faq_member_insert on public.business_dm_faq
for insert to authenticated with check(public.is_business_member(business_id));

drop policy if exists business_dm_faq_member_update on public.business_dm_faq;
create policy business_dm_faq_member_update on public.business_dm_faq
for update to authenticated using(public.is_business_member(business_id))
with check(public.is_business_member(business_id));

drop policy if exists business_dm_faq_member_delete on public.business_dm_faq;
create policy business_dm_faq_member_delete on public.business_dm_faq
for delete to authenticated using(public.is_business_member(business_id));

create or replace function public.enforce_business_dm_faq_limit()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_count int;
begin
  if not public.is_business_member(new.business_id) then raise exception 'Not authorized'; end if;
  if tg_op='INSERT' then
    select count(*) into v_count from public.business_dm_faq where business_id=new.business_id;
    if v_count>=10 then raise exception 'Up to 10 automated answers are allowed'; end if;
  end if;
  new.updated_at:=now();
  return new;
end;
$$;

drop trigger if exists trg_business_dm_faq_limit on public.business_dm_faq;
create trigger trg_business_dm_faq_limit
before insert or update on public.business_dm_faq
for each row execute function public.enforce_business_dm_faq_limit();

create or replace function public.set_business_dm_ai(p_business_id uuid,p_enabled boolean,p_tone text default 'HELPFUL')
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
  if p_enabled and not public.business_has_pro(p_business_id) then
    raise exception 'Everest AI replies are included with Everest Pro';
  end if;
  if p_tone not in ('HELPFUL','CONCISE','FRIENDLY','PROFESSIONAL') then raise exception 'Invalid tone'; end if;
  insert into public.business_dm_settings(business_id,ai_enabled,faq_enabled,ai_tone,updated_at)
  values(p_business_id,p_enabled,true,p_tone,now())
  on conflict(business_id) do update set ai_enabled=excluded.ai_enabled,ai_tone=excluded.ai_tone,updated_at=now();
  return true;
end;
$$;
revoke all on function public.set_business_dm_ai(uuid,boolean,text) from public,anon;
grant execute on function public.set_business_dm_ai(uuid,boolean,text) to authenticated;


-- Free deterministic auto-answers run in the database so they remain reliable even if
-- an AI provider is unavailable. Matching is intentionally conservative to avoid
-- answering unrelated customer messages.
create or replace function public.reply_to_business_dm_faq()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_conversation public.conversations%rowtype;
  v_question text;
  v_answer text;
  v_owner uuid;
  v_faq_enabled boolean := true;
begin
  if new.is_automated or new.sender_id is null then return new; end if;

  select c.* into v_conversation
  from public.conversations c
  where c.id=new.conversation_id;

  if v_conversation.id is null
     or v_conversation.customer_id<>new.sender_id
     or v_conversation.context_type not in ('PRODUCT','SERVICE') then
    return new;
  end if;

  select coalesce(s.faq_enabled,true) into v_faq_enabled
  from public.business_dm_settings s
  where s.business_id=v_conversation.business_id;
  if found and not v_faq_enabled then return new; end if;

  v_question := trim(regexp_replace(lower(new.body),'[^a-z0-9 ]+',' ','g'));
  v_question := regexp_replace(v_question,'\s+',' ','g');
  if length(v_question)<3 then return new; end if;

  select f.answer into v_answer
  from public.business_dm_faq f
  where f.business_id=v_conversation.business_id
    and f.active=true
    and f.context_type in ('ALL',v_conversation.context_type)
    and (
      trim(regexp_replace(lower(f.question),'[^a-z0-9 ]+',' ','g'))=v_question
      or (
        length(v_question)>=8
        and position(trim(regexp_replace(lower(f.question),'[^a-z0-9 ]+',' ','g')) in v_question)>0
      )
    )
  order by
    case when trim(regexp_replace(lower(f.question),'[^a-z0-9 ]+',' ','g'))=v_question then 0 else 1 end,
    f.sort_order,
    f.created_at
  limit 1;

  if v_answer is null then return new; end if;

  select b.owner_id into v_owner
  from public.businesses b
  where b.id=v_conversation.business_id;
  if v_owner is null then return new; end if;

  insert into public.messages(conversation_id,sender_id,body,is_automated,automation_source)
  values(new.conversation_id,v_owner,v_answer,true,'FAQ');

  return new;
end;
$$;

drop trigger if exists trg_reply_to_business_dm_faq on public.messages;
create trigger trg_reply_to_business_dm_faq
after insert on public.messages
for each row execute function public.reply_to_business_dm_faq();

revoke all on function public.reply_to_business_dm_faq() from public,anon,authenticated;
