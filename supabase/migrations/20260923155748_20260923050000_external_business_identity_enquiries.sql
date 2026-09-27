-- External identities are provider identifiers and Everest-owned state only.
-- Provider names, addresses, photographs and reviews are never persisted here.
create table public.external_business_references (
 id uuid primary key default gen_random_uuid(),
 provider text not null check (provider in ('google_places')),
 provider_identifier text not null check (length(provider_identifier) between 2 and 255),
 status text not null default 'UNLINKED' check (status in ('UNLINKED','LINK_CANDIDATE','LINKED','SUPPRESSED')),
 claimed_business_id uuid references public.businesses(id) on delete restrict,
 created_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 suppressed_at timestamptz,
 constraint external_reference_unique_source unique (provider,provider_identifier),
 constraint external_reference_link_consistency check ((status='LINKED')=(claimed_business_id is not null))
);
create index external_references_claimed_idx on public.external_business_references(claimed_business_id) where claimed_business_id is not null;
alter table public.external_business_references enable row level security;
create policy external_references_admin_read on public.external_business_references for select to authenticated using (public.is_admin());
revoke all on public.external_business_references from anon,authenticated;
grant select on public.external_business_references to authenticated;

create table public.external_feature_flags (
 name text primary key check (name in ('discovery','enquiries','gateway','messaging','claiming')),
 enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into public.external_feature_flags(name) values ('discovery'),('enquiries'),('gateway'),('messaging'),('claiming');
alter table public.external_feature_flags enable row level security;
create policy external_feature_flags_admin on public.external_feature_flags for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.external_feature_flags from anon,authenticated;
grant select,update on public.external_feature_flags to authenticated;

create table public.external_discovery_quota (
 user_id uuid not null references auth.users(id) on delete cascade,
 window_start timestamptz not null,
 requests integer not null default 0 check(requests between 0 and 20),
 primary key(user_id,window_start)
);
alter table public.external_discovery_quota enable row level security;
revoke all on public.external_discovery_quota from anon,authenticated;

create or replace function public.consume_external_discovery_quota()
returns boolean language plpgsql security definer set search_path='' as $$
declare v_count integer; v_window timestamptz := date_trunc('hour',now());
begin
 if auth.uid() is null or not exists(select 1 from public.external_feature_flags where name='discovery' and enabled) then return false; end if;
 delete from public.external_discovery_quota where user_id=auth.uid() and window_start<now()-interval '7 days';
 insert into public.external_discovery_quota(user_id,window_start,requests) values(auth.uid(),v_window,1)
 on conflict(user_id,window_start) do update set requests=public.external_discovery_quota.requests+1
 where public.external_discovery_quota.requests<10
 returning requests into v_count;
 return v_count is not null;
end; $$;
revoke all on function public.consume_external_discovery_quota() from public,anon;
grant execute on function public.consume_external_discovery_quota() to authenticated;

create table public.external_enquiries (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.service_requests(id) on delete restrict,
 customer_id uuid not null references auth.users(id) on delete restrict,
 reference_id uuid not null references public.external_business_references(id) on delete restrict,
 status text not null default 'AUTHORISED' check (status in ('AUTHORISED','READY','SENT','DELIVERED','OPENED','QUOTE_SUBMITTED','EXPIRED','REVOKED','FAILED','SUPPRESSED')),
 request_snapshot jsonb not null,
 approved_email text,
 approved_phone text,
 authorised_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '14 days'),
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(request_id,reference_id)
);
create index external_enquiries_customer_idx on public.external_enquiries(customer_id,created_at desc);
create index external_enquiries_reference_idx on public.external_enquiries(reference_id,created_at desc);
alter table public.external_enquiries enable row level security;
create policy external_enquiries_customer_read on public.external_enquiries for select to authenticated using (customer_id=auth.uid() or public.is_admin());
revoke all on public.external_enquiries from anon,authenticated;
grant select on public.external_enquiries to authenticated;

create table public.external_quote_responses (
 id uuid primary key default gen_random_uuid(),
 enquiry_id uuid not null unique references public.external_enquiries(id) on delete restrict,
 amount numeric(12,2) not null check (amount >= 0 and amount <= 1000000),
 message text not null check (length(message) between 1 and 2000),
 availability text check (length(availability) <= 500),
 valid_until timestamptz,
 created_at timestamptz not null default now()
);
alter table public.external_quote_responses enable row level security;
create policy external_quotes_customer_read on public.external_quote_responses for select to authenticated
 using (exists(select 1 from public.external_enquiries e where e.id=enquiry_id and (e.customer_id=auth.uid() or public.is_admin())));
revoke all on public.external_quote_responses from anon,authenticated;
grant select on public.external_quote_responses to authenticated;

-- Only hashes are stored. Never expose this table through the Data API.
create table public.external_gateway_tokens (
 enquiry_id uuid primary key references public.external_enquiries(id) on delete cascade,
 token_hash bytea not null unique,
 issued_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 opened_at timestamptz,
 used_at timestamptz,
 failed_attempts integer not null default 0
);
alter table public.external_gateway_tokens enable row level security;
revoke all on public.external_gateway_tokens from anon,authenticated;

create table public.external_enquiry_events (
 id bigint generated always as identity primary key,
 enquiry_id uuid references public.external_enquiries(id) on delete set null,
 reference_id uuid references public.external_business_references(id) on delete set null,
 actor_id uuid,
 event text not null,
 channel text,
 occurred_at timestamptz not null default now()
);
alter table public.external_enquiry_events enable row level security;
create policy external_events_admin_read on public.external_enquiry_events for select to authenticated using (public.is_admin());
revoke all on public.external_enquiry_events from anon,authenticated;
grant select on public.external_enquiry_events to authenticated;

create or replace function public.record_external_business_selection(p_reference_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.external_business_references where id=p_reference_id and status='UNLINKED' and last_seen_at>now()-interval '15 minutes') then return; end if;
 if (select count(*) from public.external_enquiry_events where actor_id=auth.uid() and event='BUSINESS_SELECTED' and occurred_at>now()-interval '1 hour')>=20 then return; end if;
 insert into public.external_enquiry_events(reference_id,actor_id,event) values(p_reference_id,auth.uid(),'BUSINESS_SELECTED');
end; $$;
revoke all on function public.record_external_business_selection(uuid) from public,anon;
grant execute on function public.record_external_business_selection(uuid) to authenticated;

-- Called only from the authenticated, quota-controlled discovery Edge Function.
-- Caller cannot mutate reference status, suppression or claimed ownership.
create or replace function public.register_external_reference(p_identifier text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if p_identifier is null or length(trim(p_identifier)) not between 2 and 255 then raise exception 'Invalid external reference'; end if;
 insert into public.external_business_references(provider,provider_identifier) values('google_places',trim(p_identifier))
 on conflict(provider,provider_identifier) do update set last_seen_at=now()
 returning id into v_id;
 return v_id;
end; $$;
-- This operation must never be exposed to users; Edge Function uses service_role.
revoke all on function public.register_external_reference(text) from public,anon,authenticated;
grant execute on function public.register_external_reference(text) to service_role;

create or replace function public.authorise_external_enquiry(p_request_id uuid,p_reference_id uuid,p_share_email boolean,p_share_phone boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_ref public.external_business_references; v_request public.service_requests; v_email text; v_phone text; v_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.external_feature_flags where name='enquiries' and enabled) then raise exception 'External enquiries are unavailable'; end if;
 select * into v_request from public.service_requests where id=p_request_id and customer_id=auth.uid() for update;
 if not found or v_request.status in ('CANCELLED','BOOKED','COMPLETED') then raise exception 'Request unavailable'; end if;
 select * into v_ref from public.external_business_references where id=p_reference_id for update;
 if not found or v_ref.status <> 'UNLINKED' or v_ref.last_seen_at < now()-interval '15 minutes' then raise exception 'External business unavailable'; end if;
 if (select count(*) from public.external_enquiries where request_id=p_request_id)>=3 then raise exception 'Recipient limit reached'; end if;
 if (select count(*) from public.external_enquiries where customer_id=auth.uid() and created_at>now()-interval '1 day')>=5 then raise exception 'Daily enquiry limit reached'; end if;
 if exists(select 1 from public.external_enquiries where reference_id=p_reference_id and customer_id=auth.uid() and created_at>now()-interval '30 days') then raise exception 'This business was contacted recently'; end if;
 if p_share_email is true then select email into v_email from auth.users where id=auth.uid(); end if;
 if p_share_phone is true then select phone into v_phone from public.profiles where id=auth.uid(); end if;
 insert into public.external_enquiries(request_id,customer_id,reference_id,request_snapshot,approved_email,approved_phone)
 values(p_request_id,auth.uid(),p_reference_id,jsonb_build_object('description',v_request.description,'suburb',v_request.suburb,'city',v_request.city,'state',v_request.state,'preferred_date',v_request.preferred_date,'preferred_time',v_request.preferred_time),v_email,v_phone) returning id into v_id;
 insert into public.external_enquiry_events(enquiry_id,actor_id,event) values(v_id,auth.uid(),'CUSTOMER_AUTHORISED');
 return v_id;
end; $$;
revoke all on function public.authorise_external_enquiry(uuid,uuid,boolean,boolean) from public,anon;
grant execute on function public.authorise_external_enquiry(uuid,uuid,boolean,boolean) to authenticated;

create or replace function public.revoke_external_enquiry(p_enquiry_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 update public.external_enquiries set status='REVOKED',revoked_at=now(),updated_at=now()
 where id=p_enquiry_id and customer_id=auth.uid() and status in ('AUTHORISED','READY','SENT','DELIVERED','OPENED')
 returning id into v_id;
 if v_id is null then return false; end if;
 update public.external_gateway_tokens set revoked_at=now() where enquiry_id=v_id;
 insert into public.external_enquiry_events(enquiry_id,actor_id,event) values(v_id,auth.uid(),'CUSTOMER_REVOKED');
 return true;
end; $$;
revoke all on function public.revoke_external_enquiry(uuid) from public,anon;
grant execute on function public.revoke_external_enquiry(uuid) to authenticated;

-- Administrative manual recipient validation is required before a bearer link
-- can be issued. No outbound communications are performed by this migration.
create or replace function public.prepare_external_gateway(p_enquiry_id uuid,p_channel text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_admin() or p_channel not in ('VERIFIED_EMAIL','VERIFIED_PHONE') then raise exception 'Admin verification required'; end if;
 update public.external_enquiries e set status='READY',updated_at=now()
 where e.id=p_enquiry_id and e.status='AUTHORISED' and e.expires_at>now()
 and exists(select 1 from public.external_business_references r where r.id=e.reference_id and r.status='UNLINKED')
 returning e.id into v_id;
 if v_id is null then return false; end if;
 insert into public.external_enquiry_events(enquiry_id,actor_id,event,channel) values(v_id,auth.uid(),'RECIPIENT_MANUALLY_VALIDATED',p_channel);
 return true;
end; $$;
revoke all on function public.prepare_external_gateway(uuid,text) from public,anon;
grant execute on function public.prepare_external_gateway(uuid,text) to authenticated;

create or replace function public.issue_external_gateway_token(p_enquiry_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_token text; v_ref uuid;
begin
 if not public.is_admin() or not exists(select 1 from public.external_feature_flags where name='gateway' and enabled) then raise exception 'Gateway unavailable'; end if;
 select reference_id into v_ref from public.external_enquiries
 where id=p_enquiry_id and status='READY' and expires_at>now() for update;
 if v_ref is null or not exists(select 1 from public.external_business_references where id=v_ref and status='UNLINKED') then raise exception 'Enquiry unavailable'; end if;
 v_token:=encode(public.gen_random_bytes(32),'hex');
 insert into public.external_gateway_tokens(enquiry_id,token_hash,expires_at)
 values(p_enquiry_id,public.digest(v_token,'sha256'),least(now()+interval '72 hours',(select expires_at from public.external_enquiries where id=p_enquiry_id)))
 on conflict(enquiry_id) do update set token_hash=excluded.token_hash,issued_at=now(),expires_at=excluded.expires_at,revoked_at=null,opened_at=null,used_at=null,failed_attempts=0;
 insert into public.external_enquiry_events(enquiry_id,actor_id,event) values(p_enquiry_id,auth.uid(),'TOKEN_ISSUED');
 return v_token;
end; $$;
revoke all on function public.issue_external_gateway_token(uuid) from public,anon;
grant execute on function public.issue_external_gateway_token(uuid) to authenticated;

create table public.external_gateway_request_quota (
 window_start timestamptz primary key,
 attempts integer not null default 0 check(attempts between 0 and 200)
);
alter table public.external_gateway_request_quota enable row level security;
revoke all on public.external_gateway_request_quota from anon,authenticated;

create or replace function public.read_external_gateway(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_enquiry public.external_enquiries; v_token public.external_gateway_tokens; v_count integer;
begin
 if not exists(select 1 from public.external_feature_flags where name='gateway' and enabled) then return null; end if;
 insert into public.external_gateway_request_quota(window_start,attempts) values(date_trunc('minute',now()),1)
 on conflict(window_start) do update set attempts=public.external_gateway_request_quota.attempts+1
 where public.external_gateway_request_quota.attempts<100 returning attempts into v_count;
 if v_count is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select * into v_token from public.external_gateway_tokens where token_hash=public.digest(p_token,'sha256') for update;
 if not found or v_token.revoked_at is not null or v_token.used_at is not null or v_token.expires_at<=now() or v_token.failed_attempts>=5 then return null; end if;
 select * into v_enquiry from public.external_enquiries where id=v_token.enquiry_id and status in ('READY','SENT','DELIVERED','OPENED') and expires_at>now() for update;
 if not found or not exists(select 1 from public.external_business_references where id=v_enquiry.reference_id and status='UNLINKED') then return null; end if;
 if not exists(select 1 from public.service_requests where id=v_enquiry.request_id and status not in ('CANCELLED','BOOKED','COMPLETED')) then return null; end if;
 update public.external_gateway_tokens set opened_at=coalesce(opened_at,now()) where enquiry_id=v_enquiry.id;
 update public.external_enquiries set status='OPENED',updated_at=now() where id=v_enquiry.id and status in ('READY','SENT','DELIVERED');
 insert into public.external_enquiry_events(enquiry_id,event) values(v_enquiry.id,'GATEWAY_OPENED');
 return v_enquiry.request_snapshot || jsonb_build_object('email',v_enquiry.approved_email,'phone',v_enquiry.approved_phone);
end; $$;
revoke all on function public.read_external_gateway(text) from public,anon,authenticated;
grant execute on function public.read_external_gateway(text) to service_role;

create or replace function public.submit_external_gateway_quote(p_token text,p_amount numeric,p_message text,p_availability text,p_valid_until timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_token public.external_gateway_tokens; v_enquiry public.external_enquiries; v_id uuid; v_count integer;
begin
 if not exists(select 1 from public.external_feature_flags where name='gateway' and enabled) then return false; end if;
 insert into public.external_gateway_request_quota(window_start,attempts) values(date_trunc('minute',now()),1)
 on conflict(window_start) do update set attempts=public.external_gateway_request_quota.attempts+1
 where public.external_gateway_request_quota.attempts<100 returning attempts into v_count;
 if v_count is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
 select * into v_token from public.external_gateway_tokens where token_hash=public.digest(p_token,'sha256') for update;
 if not found or v_token.revoked_at is not null or v_token.used_at is not null or v_token.expires_at<=now() or v_token.failed_attempts>=5 then return false; end if;
 select * into v_enquiry from public.external_enquiries where id=v_token.enquiry_id and status in ('READY','SENT','DELIVERED','OPENED') and expires_at>now() for update;
 if not found or not exists(select 1 from public.external_business_references where id=v_enquiry.reference_id and status='UNLINKED') then return false; end if;
 if not exists(select 1 from public.service_requests where id=v_enquiry.request_id and status not in ('CANCELLED','BOOKED','COMPLETED')) then return false; end if;
 if p_amount is null or p_amount<0 or p_amount>1000000 or length(trim(coalesce(p_message,''))) not between 1 and 2000
 or length(coalesce(p_availability,''))>500 or (p_valid_until is not null and (p_valid_until<=now() or p_valid_until>now()+interval '90 days')) then
  update public.external_gateway_tokens set failed_attempts=failed_attempts+1 where enquiry_id=v_enquiry.id;
  return false;
 end if;
 insert into public.external_quote_responses(enquiry_id,amount,message,availability,valid_until)
 values(v_enquiry.id,p_amount,trim(p_message),nullif(trim(p_availability),''),p_valid_until) returning id into v_id;
 update public.external_gateway_tokens set used_at=now() where enquiry_id=v_enquiry.id;
 update public.external_enquiries set status='QUOTE_SUBMITTED',updated_at=now() where id=v_enquiry.id;
 insert into public.external_enquiry_events(enquiry_id,event) values(v_enquiry.id,'QUOTE_SUBMITTED');
 insert into public.notifications(user_id,kind,title,body,data)
 values(v_enquiry.customer_id,'EXTERNAL_QUOTE','External quote received','An external business responded to your enquiry.',jsonb_build_object('external_enquiry_id',v_enquiry.id));
 return true;
end; $$;
revoke all on function public.submit_external_gateway_quote(text,numeric,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.submit_external_gateway_quote(text,numeric,text,text,timestamptz) to service_role;

create or replace function public.suppress_external_business(p_reference_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_admin() then raise exception 'Admin authorization required'; end if;
 update public.external_business_references set status='SUPPRESSED',suppressed_at=now()
 where id=p_reference_id and status in ('UNLINKED','LINK_CANDIDATE') returning id into v_id;
 if v_id is null then return false; end if;
 update public.external_gateway_tokens t set revoked_at=now() from public.external_enquiries e
 where t.enquiry_id=e.id and e.reference_id=v_id and t.used_at is null;
 update public.external_enquiries set status='SUPPRESSED',updated_at=now()
 where reference_id=v_id and status in ('AUTHORISED','READY','SENT','DELIVERED','OPENED');
 insert into public.external_enquiry_events(reference_id,actor_id,event) values(v_id,auth.uid(),'BUSINESS_SUPPRESSED');
 return true;
end; $$;
revoke all on function public.suppress_external_business(uuid) from public,anon;
grant execute on function public.suppress_external_business(uuid) to authenticated;

create table public.external_business_claim_requests (
 id uuid primary key default gen_random_uuid(),
 reference_id uuid not null references public.external_business_references(id) on delete restrict,
 business_id uuid not null references public.businesses(id) on delete restrict,
 requested_by uuid not null references auth.users(id) on delete restrict,
 status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),
 proof_method text check(proof_method in ('MANUAL_DOMAIN','MANUAL_EMAIL','MANUAL_PHONE','ABN_PLUS_CONTROL')),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(reference_id,business_id)
);
alter table public.external_business_claim_requests enable row level security;
create policy external_claims_own_read on public.external_business_claim_requests for select to authenticated
 using(requested_by=auth.uid() or public.is_admin());
revoke all on public.external_business_claim_requests from anon,authenticated;
grant select on public.external_business_claim_requests to authenticated;

create or replace function public.request_external_business_claim(p_reference_id uuid,p_business_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.external_feature_flags where name='claiming' and enabled) then raise exception 'Claiming unavailable'; end if;
 if not public.is_business_member(p_business_id) then raise exception 'Business membership required'; end if;
 if not exists(select 1 from public.businesses where id=p_business_id and status='ACTIVE' and verification_status='VERIFIED') then raise exception 'Business verification required'; end if;
 if not exists(select 1 from public.external_business_references where id=p_reference_id and status='UNLINKED') then raise exception 'Reference unavailable'; end if;
 insert into public.external_business_claim_requests(reference_id,business_id,requested_by)
 values(p_reference_id,p_business_id,auth.uid()) on conflict(reference_id,business_id) do update set id=public.external_business_claim_requests.id
 returning id into v_id;
 insert into public.external_enquiry_events(reference_id,actor_id,event) values(p_reference_id,auth.uid(),'CLAIM_REQUESTED');
 return v_id;
end; $$;
revoke all on function public.request_external_business_claim(uuid,uuid) from public,anon;
grant execute on function public.request_external_business_claim(uuid,uuid) to authenticated;

create or replace function public.approve_external_business_claim(p_claim_id uuid,p_proof_method text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_claim public.external_business_claim_requests; v_ref public.external_business_references;
begin
 if not public.is_admin() or p_proof_method not in ('MANUAL_DOMAIN','MANUAL_EMAIL','MANUAL_PHONE','ABN_PLUS_CONTROL') then raise exception 'Admin ownership review required'; end if;
 select * into v_claim from public.external_business_claim_requests where id=p_claim_id and status='PENDING' for update;
 if not found then return false; end if;
 select * into v_ref from public.external_business_references where id=v_claim.reference_id and status='UNLINKED' for update;
 if not found then return false; end if;
 if not exists(select 1 from public.businesses where id=v_claim.business_id and status='ACTIVE' and verification_status='VERIFIED' and abn is not null) then raise exception 'ABN and business verification required'; end if;
 update public.external_business_references set status='LINKED',claimed_business_id=v_claim.business_id where id=v_ref.id;
 update public.external_business_claim_requests set status='APPROVED',proof_method=p_proof_method,reviewed_by=auth.uid(),reviewed_at=now() where id=v_claim.id;
 update public.external_business_claim_requests set status='REJECTED',reviewed_by=auth.uid(),reviewed_at=now() where reference_id=v_ref.id and id<>v_claim.id and status='PENDING';
 update public.external_gateway_tokens t set revoked_at=now() from public.external_enquiries e where t.enquiry_id=e.id and e.reference_id=v_ref.id and t.used_at is null;
 update public.external_enquiries set status='REVOKED',revoked_at=now(),updated_at=now() where reference_id=v_ref.id and status in ('AUTHORISED','READY','SENT','DELIVERED','OPENED');
 insert into public.external_enquiry_events(reference_id,actor_id,event) values(v_ref.id,auth.uid(),'CLAIM_APPROVED');
 return true;
end; $$;
revoke all on function public.approve_external_business_claim(uuid,text) from public,anon;
grant execute on function public.approve_external_business_claim(uuid,text) to authenticated;

create or replace function public.expire_external_enquiries()
returns integer language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if auth.role() <> 'service_role' and not public.is_admin() then raise exception 'Not authorized'; end if;
 delete from public.external_gateway_request_quota where window_start<now()-interval '7 days';
 with expired as (
  update public.external_enquiries set status='EXPIRED',updated_at=now()
  where expires_at<=now() and status in ('AUTHORISED','READY','SENT','DELIVERED','OPENED')
  returning id
 ), revoked as (
  update public.external_gateway_tokens t set revoked_at=now() from expired e where t.enquiry_id=e.id and t.used_at is null
  returning t.enquiry_id
 )
 insert into public.external_enquiry_events(enquiry_id,event) select id,'ENQUIRY_EXPIRED' from expired;
 get diagnostics v_count=row_count;
 return v_count;
end; $$;
revoke all on function public.expire_external_enquiries() from public,anon,authenticated;
grant execute on function public.expire_external_enquiries() to service_role;
