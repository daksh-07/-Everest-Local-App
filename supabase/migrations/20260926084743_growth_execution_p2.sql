-- Growth execution P2. Idempotent database-owned rewards and explicit in-app campaign delivery.
create table public.business_reward_wallets(
 business_id uuid not null references public.businesses(id) on delete cascade,customer_id uuid not null references public.profiles(id) on delete cascade,
 credit_balance numeric not null default 0 check(credit_balance>=0),lifetime_earned numeric not null default 0 check(lifetime_earned>=0),updated_at timestamptz not null default now(),primary key(business_id,customer_id)
);
create table public.business_reward_ledger(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,customer_id uuid not null references public.profiles(id) on delete cascade,
 delta numeric not null,reason text not null,source_type text not null,source_id uuid,source_key text not null unique,created_at timestamptz not null default now()
);
create table public.campaign_deliveries(
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id) on delete cascade,campaign_id uuid not null references public.business_campaigns(id) on delete cascade,
 customer_id uuid not null references public.profiles(id) on delete cascade,channel text not null check(channel in ('IN_APP','EMAIL','SMS')),status text not null default 'DELIVERED' check(status in ('DELIVERED','FAILED','SKIPPED')),
 delivered_at timestamptz not null default now(),unique(campaign_id,customer_id,channel)
);
create table public.waitlist_offers(
 id uuid primary key default gen_random_uuid(),waitlist_id uuid not null references public.business_waitlist(id) on delete cascade,business_id uuid not null references public.businesses(id) on delete cascade,
 customer_id uuid not null references public.profiles(id) on delete cascade,available_from timestamptz not null,available_until timestamptz not null,status text not null default 'OFFERED' check(status in ('OFFERED','ACCEPTED','EXPIRED','DECLINED')),
 created_at timestamptz not null default now(),unique(waitlist_id,available_from,available_until),check(available_until>available_from)
);
create table public.growth_recommendation_dismissals(
 business_id uuid not null references public.businesses(id) on delete cascade,recommendation_key text not null,dismissed_by uuid not null references public.profiles(id),dismissed_at timestamptz not null default now(),primary key(business_id,recommendation_key)
);
alter table public.business_reward_wallets enable row level security;alter table public.business_reward_ledger enable row level security;alter table public.campaign_deliveries enable row level security;alter table public.waitlist_offers enable row level security;alter table public.growth_recommendation_dismissals enable row level security;
revoke all on public.business_reward_wallets,public.business_reward_ledger,public.campaign_deliveries,public.waitlist_offers,public.growth_recommendation_dismissals from public,anon,authenticated;
grant select on public.business_reward_wallets,public.business_reward_ledger,public.campaign_deliveries,public.waitlist_offers,public.growth_recommendation_dismissals to authenticated;
create policy reward_wallet_read on public.business_reward_wallets for select to authenticated using(customer_id=(select auth.uid()) or public.is_business_member(business_id));
create policy reward_ledger_read on public.business_reward_ledger for select to authenticated using(customer_id=(select auth.uid()) or public.is_business_member(business_id));
create policy campaign_delivery_member_read on public.campaign_deliveries for select to authenticated using(customer_id=(select auth.uid()) or public.is_business_member(business_id));
create policy waitlist_offer_read on public.waitlist_offers for select to authenticated using(customer_id=(select auth.uid()) or public.is_business_member(business_id));
create policy growth_dismissal_member_read on public.growth_recommendation_dismissals for select to authenticated using(public.is_business_member(business_id));

create or replace function private.credit_business_reward(p_business_id uuid,p_customer_id uuid,p_amount numeric,p_reason text,p_source_type text,p_source_id uuid,p_source_key text) returns boolean
language plpgsql security definer set search_path='' as $$ begin
 if p_amount<=0 then return false;end if;
 insert into public.business_reward_ledger(business_id,customer_id,delta,reason,source_type,source_id,source_key) values(p_business_id,p_customer_id,p_amount,p_reason,p_source_type,p_source_id,p_source_key) on conflict(source_key) do nothing;
 if not found then return false;end if;
 insert into public.business_reward_wallets(business_id,customer_id,credit_balance,lifetime_earned) values(p_business_id,p_customer_id,p_amount,p_amount)
 on conflict(business_id,customer_id) do update set credit_balance=public.business_reward_wallets.credit_balance+excluded.credit_balance,lifetime_earned=public.business_reward_wallets.lifetime_earned+excluded.lifetime_earned,updated_at=now();
 return true;end $$;
revoke all on function private.credit_business_reward(uuid,uuid,numeric,text,text,uuid,text) from public,anon,authenticated;

create or replace function private.growth_booking_completed() returns trigger language plpgsql security definer set search_path='' as $$
declare lp public.business_loyalty_programs;earned numeric;bal numeric;rp public.business_referral_programs;r public.referrals;
begin
 if new.status::text<>'COMPLETED' or (tg_op='UPDATE' and old.status::text='COMPLETED') then return new;end if;
 select * into lp from public.business_loyalty_programs where business_id=new.business_id and enabled;
 if lp.business_id is not null then
   earned:=case when lp.earn_type='SPEND' then greatest(0,new.price)*lp.earn_rate else lp.earn_rate end;
   insert into public.loyalty_ledger(business_id,customer_id,delta,reason,source_type,source_id,source_key) values(new.business_id,new.customer_id,earned,'Completed booking','BOOKING',new.id,'loyalty:booking:'||new.id) on conflict(source_key) do nothing;
   if found then
    insert into public.customer_loyalty_balances(business_id,customer_id,points,lifetime_points) values(new.business_id,new.customer_id,earned,earned) on conflict(business_id,customer_id) do update set points=public.customer_loyalty_balances.points+excluded.points,lifetime_points=public.customer_loyalty_balances.lifetime_points+excluded.lifetime_points,updated_at=now();
    select points into bal from public.customer_loyalty_balances where business_id=new.business_id and customer_id=new.customer_id;
    if lp.reward_type='CREDIT' and bal>=lp.reward_threshold then
      perform private.credit_business_reward(new.business_id,new.customer_id,lp.reward_value,'Loyalty reward','LOYALTY',new.id,'loyalty:reward:'||new.id);
      update public.customer_loyalty_balances set points=greatest(0,points-lp.reward_threshold),updated_at=now() where business_id=new.business_id and customer_id=new.customer_id;
      insert into public.notifications(user_id,kind,title,body,data) values(new.customer_id,'LOYALTY_REWARD','Loyalty reward unlocked','You earned a reward from a business you use on Everest.',jsonb_build_object('business_id',new.business_id,'booking_id',new.id,'reward_value',lp.reward_value));
    end if;
   end if;
 end if;
 select * into rp from public.business_referral_programs where business_id=new.business_id and enabled;
 if rp.business_id is not null then
  select * into r from public.referrals where business_id=new.business_id and referred_user_id=new.customer_id and status='PENDING' order by created_at limit 1 for update;
  if r.id is not null and (select count(*) from public.bookings where business_id=new.business_id and customer_id=new.customer_id and status='COMPLETED')>=rp.minimum_completed_jobs then
   update public.referrals set status='REWARDED',qualified_at=now(),rewarded_at=now() where id=r.id;
   perform private.credit_business_reward(new.business_id,r.referrer_id,rp.referrer_credit,'Referral reward','REFERRAL',r.id,'referral:referrer:'||r.id);
   perform private.credit_business_reward(new.business_id,new.customer_id,rp.friend_credit,'Referral welcome reward','REFERRAL',r.id,'referral:friend:'||r.id);
   insert into public.notifications(user_id,kind,title,body,data) values(r.referrer_id,'REFERRAL_REWARD','Referral reward earned','Your referral completed the required booking.',jsonb_build_object('business_id',new.business_id,'referral_id',r.id));
  end if;
 end if;return new;end $$;
revoke all on function private.growth_booking_completed() from public,anon,authenticated;
drop trigger if exists growth_booking_completed on public.bookings;create trigger growth_booking_completed after insert or update of status on public.bookings for each row execute function private.growth_booking_completed();

create or replace function private.growth_waitlist_slot_opened() returns trigger language plpgsql security definer set search_path='' as $$ declare w record; oid uuid;begin
 if new.status='AVAILABLE_NOW' and (tg_op='INSERT' or old.status is distinct from new.status or old.available_until is distinct from new.available_until) and new.available_until>now() then
  for w in select * from public.business_waitlist where business_id=new.business_id and status='WAITING' and (preferred_from is null or preferred_from<=new.available_until) and (preferred_to is null or preferred_to>=coalesce(new.available_from,now())) order by created_at limit 20 loop
   insert into public.waitlist_offers(waitlist_id,business_id,customer_id,available_from,available_until) values(w.id,new.business_id,w.customer_id,coalesce(new.available_from,now()),new.available_until) on conflict do nothing returning id into oid;
   if oid is not null then update public.business_waitlist set status='OFFERED',updated_at=now() where id=w.id;insert into public.notifications(user_id,kind,title,body,data) values(w.customer_id,'WAITLIST_SLOT','An earlier slot opened','A business on your waitlist has availability now.',jsonb_build_object('business_id',new.business_id,'waitlist_offer_id',oid));end if;
  end loop;
 end if;return new;end $$;
revoke all on function private.growth_waitlist_slot_opened() from public,anon,authenticated;
drop trigger if exists growth_waitlist_slot_opened on public.business_availability;create trigger growth_waitlist_slot_opened after insert or update of status,available_from,available_until on public.business_availability for each row execute function private.growth_waitlist_slot_opened();

create or replace function public.run_in_app_growth_campaign(p_campaign_id uuid) returns integer language plpgsql security definer set search_path='' as $$ declare c public.business_campaigns;o public.business_offers;u record;n integer:=0;begin
 select * into c from public.business_campaigns where id=p_campaign_id for update;if c.id is null or auth.uid() is null or not public.is_business_member(c.business_id) then raise exception 'Not authorized';end if;
 if c.channel<>'IN_APP' then raise exception 'External campaign channels require the connected consent-aware delivery service';end if;if c.status not in ('DRAFT','ACTIVE') then raise exception 'Campaign cannot be run';end if;
 if c.offer_id is not null then select * into o from public.business_offers where id=c.offer_id and business_id=c.business_id and status='ACTIVE' and starts_at<=now() and (ends_at is null or ends_at>now());end if;
 for u in
  select distinct bc.linked_everest_user_id uid from public.business_contacts bc where bc.business_id=c.business_id and bc.archived_at is null and bc.linked_everest_user_id is not null and (
   c.segment_key='ALL' or (c.segment_key='INACTIVE_60D' and coalesce(bc.last_activity_at,bc.created_at)<now()-interval '60 days') or
   (c.segment_key='QUOTE_PENDING_2D' and exists(select 1 from public.crm_quotes q where q.business_id=c.business_id and q.contact_id=bc.id and q.status in ('SENT','VIEWED') and q.created_at<now()-interval '2 days'))
  )
 loop
  insert into public.campaign_deliveries(business_id,campaign_id,customer_id,channel) values(c.business_id,c.id,u.uid,'IN_APP') on conflict do nothing;
  if found then insert into public.notifications(user_id,kind,title,body,data) values(u.uid,'BUSINESS_CAMPAIGN',c.name,coalesce(o.description,'A business you know has an update for you.'),jsonb_build_object('business_id',c.business_id,'campaign_id',c.id,'offer_id',c.offer_id));n:=n+1;end if;
 end loop;
 update public.business_campaigns set status='ACTIVE',updated_at=now() where id=c.id;return n;end $$;
revoke all on function public.run_in_app_growth_campaign(uuid) from public,anon;grant execute on function public.run_in_app_growth_campaign(uuid) to authenticated;

create or replace function public.get_growth_recommendations(p_business_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare arr jsonb:='[]'::jsonb;n integer;begin
 if auth.uid() is null or not public.is_business_member(p_business_id) then raise exception 'Not authorized';end if;
 select count(*) into n from public.business_contacts where business_id=p_business_id and archived_at is null and linked_everest_user_id is not null and coalesce(last_activity_at,created_at)<now()-interval '60 days';
 if n>0 then arr:=arr||jsonb_build_array(jsonb_build_object('key','win_back','title','Win back inactive customers','detail',n||' linked customers have been inactive for 60+ days.','action','CREATE_WIN_BACK'));end if;
 select count(*) into n from public.crm_quotes where business_id=p_business_id and status in ('SENT','VIEWED') and created_at<now()-interval '2 days';
 if n>0 then arr:=arr||jsonb_build_array(jsonb_build_object('key','quote_recovery','title','Recover open quotes','detail',n||' quotes have waited at least 2 days.','action','CREATE_QUOTE_RECOVERY'));end if;
 select count(*) into n from public.business_waitlist where business_id=p_business_id and status='WAITING';
 if n>0 then arr:=arr||jsonb_build_array(jsonb_build_object('key','waitlist','title','Fill the next open slot','detail',n||' customers are waiting for availability.','action','OPEN_AVAILABILITY'));end if;
 if not exists(select 1 from public.business_loyalty_programs where business_id=p_business_id and enabled) then arr:=arr||jsonb_build_array(jsonb_build_object('key','loyalty','title','Turn on loyalty','detail','Reward repeat customers automatically after completed bookings.','action','CONFIGURE_LOYALTY'));end if;
 return arr;end $$;
revoke all on function public.get_growth_recommendations(uuid) from public,anon;grant execute on function public.get_growth_recommendations(uuid) to authenticated;
