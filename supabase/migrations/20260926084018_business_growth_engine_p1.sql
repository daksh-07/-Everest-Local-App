-- Business Growth Engine P1: offers, campaigns, segments, loyalty, referrals, waitlist and retention insights.
create table public.business_offers(
 id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120), description text, offer_type text not null check(offer_type in ('PERCENT','FIXED','CREDIT','MEMBER_ONLY')),
 discount_value numeric not null default 0 check(discount_value>=0), minimum_spend numeric, starts_at timestamptz not null default now(), ends_at timestamptz,
 audience text not null default 'ALL' check(audience in ('ALL','NEW','RETURNING','INACTIVE','VIP','MEMBERS')),
 usage_limit integer check(usage_limit is null or usage_limit>0), per_customer_limit integer not null default 1 check(per_customer_limit between 1 and 100),
 status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','PAUSED','EXPIRED')), created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(ends_at is null or ends_at>starts_at), check((offer_type='PERCENT' and discount_value<=100) or offer_type<>'PERCENT')
);
create index business_offers_active_idx on public.business_offers(business_id,status,starts_at,ends_at);

create table public.business_campaigns(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,name text not null check(length(trim(name)) between 1 and 120),
 objective text not null check(objective in ('WELCOME','REBOOK','WIN_BACK','QUOTE_RECOVERY','REVIEW','FILL_SCHEDULE','GENERAL')),
 segment_key text not null default 'ALL',offer_id uuid references public.business_offers(id) on delete set null,
 channel text not null default 'IN_APP' check(channel in ('IN_APP','EMAIL','SMS')),status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','PAUSED','COMPLETED')),
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index business_campaigns_idx on public.business_campaigns(business_id,status,objective);

create table public.business_loyalty_programs(
 business_id uuid primary key references public.businesses(id) on delete cascade,enabled boolean not null default false,
 earn_type text not null default 'VISIT' check(earn_type in ('VISIT','SPEND')),earn_rate numeric not null default 1 check(earn_rate>0),
 reward_threshold numeric not null default 5 check(reward_threshold>0),reward_type text not null default 'CREDIT' check(reward_type in ('CREDIT','PERCENT','FIXED')),
 reward_value numeric not null default 10 check(reward_value>0),updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now()
);
create table public.customer_loyalty_balances(
 business_id uuid not null references public.businesses(id) on delete cascade,customer_id uuid not null references public.profiles(id) on delete cascade,
 points numeric not null default 0 check(points>=0),lifetime_points numeric not null default 0 check(lifetime_points>=0),updated_at timestamptz not null default now(),primary key(business_id,customer_id)
);
create table public.loyalty_ledger(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,customer_id uuid not null references public.profiles(id) on delete cascade,
 delta numeric not null,reason text not null,source_type text,source_id uuid,source_key text not null unique,created_at timestamptz not null default now()
);

create table public.business_waitlist(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,customer_id uuid not null references public.profiles(id) on delete cascade,
 service_id uuid references public.services(id) on delete set null,preferred_from timestamptz,preferred_to timestamptz,status text not null default 'WAITING' check(status in ('WAITING','OFFERED','BOOKED','EXPIRED','CANCELLED')),
 notes text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(preferred_to is null or preferred_from is null or preferred_to>preferred_from)
);
create index business_waitlist_active_idx on public.business_waitlist(business_id,status,created_at);

create table public.business_referral_programs(
 business_id uuid primary key references public.businesses(id) on delete cascade,enabled boolean not null default false,
 referrer_credit numeric not null default 0 check(referrer_credit>=0),friend_credit numeric not null default 0 check(friend_credit>=0),
 minimum_completed_jobs integer not null default 1 check(minimum_completed_jobs between 1 and 100),updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now()
);
create table public.referrals(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,referrer_id uuid not null references public.profiles(id) on delete cascade,
 referred_user_id uuid references public.profiles(id) on delete set null,code text not null unique,status text not null default 'PENDING' check(status in ('PENDING','QUALIFIED','REWARDED','EXPIRED')),
 qualified_at timestamptz,rewarded_at timestamptz,created_at timestamptz not null default now()
);

alter table public.business_offers enable row level security;alter table public.business_campaigns enable row level security;alter table public.business_loyalty_programs enable row level security;alter table public.customer_loyalty_balances enable row level security;alter table public.loyalty_ledger enable row level security;alter table public.business_waitlist enable row level security;alter table public.business_referral_programs enable row level security;alter table public.referrals enable row level security;
revoke all on public.business_offers,public.business_campaigns,public.business_loyalty_programs,public.customer_loyalty_balances,public.loyalty_ledger,public.business_waitlist,public.business_referral_programs,public.referrals from anon,authenticated;
grant select on public.business_offers,public.business_campaigns,public.business_loyalty_programs,public.customer_loyalty_balances,public.loyalty_ledger,public.business_waitlist,public.business_referral_programs,public.referrals to authenticated;
create policy offers_member_read on public.business_offers for select to authenticated using(public.is_business_member(business_id) or (status='ACTIVE' and starts_at<=now() and (ends_at is null or ends_at>now())));
create policy campaigns_member_read on public.business_campaigns for select to authenticated using(public.is_business_member(business_id));
create policy loyalty_program_read on public.business_loyalty_programs for select to authenticated using(public.is_business_member(business_id) or enabled);
create policy loyalty_balance_read on public.customer_loyalty_balances for select to authenticated using(customer_id=(select auth.uid()) or public.is_business_member(business_id));
create policy loyalty_ledger_read on public.loyalty_ledger for select to authenticated using(customer_id=(select auth.uid()) or public.is_business_member(business_id));
create policy waitlist_read on public.business_waitlist for select to authenticated using(customer_id=(select auth.uid()) or public.is_business_member(business_id));
create policy referral_program_read on public.business_referral_programs for select to authenticated using(public.is_business_member(business_id) or enabled);
create policy referrals_read on public.referrals for select to authenticated using(referrer_id=(select auth.uid()) or referred_user_id=(select auth.uid()) or public.is_business_member(business_id));

create or replace function public.create_business_offer(p_business_id uuid,p_name text,p_description text,p_offer_type text,p_discount_value numeric,p_audience text,p_ends_at timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$ declare rid uuid; begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized';end if;
 if p_offer_type not in ('PERCENT','FIXED','CREDIT','MEMBER_ONLY') or p_audience not in ('ALL','NEW','RETURNING','INACTIVE','VIP','MEMBERS') then raise exception 'Invalid offer configuration';end if;
 if coalesce(p_discount_value,-1)<0 or (p_offer_type='PERCENT' and p_discount_value>100) then raise exception 'Invalid discount';end if;
 insert into public.business_offers(business_id,name,description,offer_type,discount_value,audience,ends_at,created_by) values(p_business_id,trim(p_name),nullif(trim(coalesce(p_description,'')),''),p_offer_type,p_discount_value,p_audience,p_ends_at,auth.uid()) returning id into rid;return rid;end $$;
create or replace function public.set_business_offer_status(p_offer_id uuid,p_status text) returns boolean language plpgsql security definer set search_path='' as $$ declare bid uuid;begin
 select business_id into bid from public.business_offers where id=p_offer_id for update;if bid is null or auth.uid() is null or not public.is_business_member(bid) then raise exception 'Not authorized';end if;
 if p_status not in ('DRAFT','ACTIVE','PAUSED','EXPIRED') then raise exception 'Invalid status';end if;update public.business_offers set status=p_status,updated_at=now() where id=p_offer_id;return true;end $$;
create or replace function public.create_business_campaign(p_business_id uuid,p_name text,p_objective text,p_segment_key text,p_offer_id uuid default null,p_channel text default 'IN_APP')
returns uuid language plpgsql security definer set search_path='' as $$ declare rid uuid;begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized';end if;
 if p_objective not in ('WELCOME','REBOOK','WIN_BACK','QUOTE_RECOVERY','REVIEW','FILL_SCHEDULE','GENERAL') or p_channel not in ('IN_APP','EMAIL','SMS') then raise exception 'Invalid campaign configuration';end if;
 if p_offer_id is not null and not exists(select 1 from public.business_offers where id=p_offer_id and business_id=p_business_id) then raise exception 'Offer does not belong to business';end if;
 insert into public.business_campaigns(business_id,name,objective,segment_key,offer_id,channel,created_by) values(p_business_id,trim(p_name),p_objective,coalesce(nullif(trim(p_segment_key),''),'ALL'),p_offer_id,p_channel,auth.uid()) returning id into rid;return rid;end $$;
create or replace function public.configure_business_loyalty(p_business_id uuid,p_enabled boolean,p_earn_type text,p_earn_rate numeric,p_reward_threshold numeric,p_reward_type text,p_reward_value numeric)
returns boolean language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized';end if;
 if p_earn_type not in ('VISIT','SPEND') or p_reward_type not in ('CREDIT','PERCENT','FIXED') or p_earn_rate<=0 or p_reward_threshold<=0 or p_reward_value<=0 then raise exception 'Invalid loyalty configuration';end if;
 insert into public.business_loyalty_programs(business_id,enabled,earn_type,earn_rate,reward_threshold,reward_type,reward_value,updated_by) values(p_business_id,p_enabled,p_earn_type,p_earn_rate,p_reward_threshold,p_reward_type,p_reward_value,auth.uid())
 on conflict(business_id) do update set enabled=excluded.enabled,earn_type=excluded.earn_type,earn_rate=excluded.earn_rate,reward_threshold=excluded.reward_threshold,reward_type=excluded.reward_type,reward_value=excluded.reward_value,updated_by=auth.uid(),updated_at=now();return true;end $$;
create or replace function public.configure_business_referrals(p_business_id uuid,p_enabled boolean,p_referrer_credit numeric,p_friend_credit numeric)
returns boolean language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized';end if;if p_referrer_credit<0 or p_friend_credit<0 then raise exception 'Invalid credit';end if;
 insert into public.business_referral_programs(business_id,enabled,referrer_credit,friend_credit,updated_by) values(p_business_id,p_enabled,p_referrer_credit,p_friend_credit,auth.uid())
 on conflict(business_id) do update set enabled=excluded.enabled,referrer_credit=excluded.referrer_credit,friend_credit=excluded.friend_credit,updated_by=auth.uid(),updated_at=now();return true;end $$;

create or replace function public.get_business_growth_p1_metrics(p_business_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare result jsonb;begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized';end if;
 select jsonb_build_object(
 'active_offers',(select count(*) from public.business_offers where business_id=p_business_id and status='ACTIVE' and starts_at<=now() and (ends_at is null or ends_at>now())),
 'active_campaigns',(select count(*) from public.business_campaigns where business_id=p_business_id and status='ACTIVE'),
 'waitlist',(select count(*) from public.business_waitlist where business_id=p_business_id and status='WAITING'),
 'repeat_customers',(select count(*) from (select customer_id from public.bookings where business_id=p_business_id and status='COMPLETED' group by customer_id having count(*)>1)x),
 'inactive_contacts',(select count(*) from public.business_contacts where business_id=p_business_id and archived_at is null and coalesce(last_activity_at,created_at)<now()-interval '60 days'),
 'quotes_to_recover',(select count(*) from public.crm_quotes where business_id=p_business_id and status in ('SENT','VIEWED') and created_at<now()-interval '2 days'),
 'completed_30d',(select count(*) from public.bookings where business_id=p_business_id and status='COMPLETED' and completed_at>=now()-interval '30 days'),
 'revenue_30d',(select coalesce(sum(price),0) from public.bookings where business_id=p_business_id and status='COMPLETED' and completed_at>=now()-interval '30 days')
 ) into result;return result;end $$;

revoke all on function public.create_business_offer(uuid,text,text,text,numeric,text,timestamptz),public.set_business_offer_status(uuid,text),public.create_business_campaign(uuid,text,text,text,uuid,text),public.configure_business_loyalty(uuid,boolean,text,numeric,numeric,text,numeric),public.configure_business_referrals(uuid,boolean,numeric,numeric),public.get_business_growth_p1_metrics(uuid) from public,anon,authenticated;
grant execute on function public.create_business_offer(uuid,text,text,text,numeric,text,timestamptz),public.set_business_offer_status(uuid,text),public.create_business_campaign(uuid,text,text,text,uuid,text),public.configure_business_loyalty(uuid,boolean,text,numeric,numeric,text,numeric),public.configure_business_referrals(uuid,boolean,numeric,numeric),public.get_business_growth_p1_metrics(uuid) to authenticated;
