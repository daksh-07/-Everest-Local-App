-- Phase 3 outbound communications safety foundation.
-- This migration does not send messages and leaves the messaging feature flag OFF.

create table public.external_business_contacts (
 id uuid primary key default gen_random_uuid(),
 reference_id uuid not null references public.external_business_references(id) on delete cascade,
 channel text not null check (channel in ('EMAIL','SMS')),
 destination text not null check (length(destination) between 3 and 320),
 destination_hash bytea generated always as (public.digest(lower(trim(destination)),'sha256')) stored,
 provenance text not null check (provenance in ('PROVIDER_SUPPLIED','WEBSITE_SUPPLIED','CUSTOMER_SUPPLIED','ADMIN_VERIFIED','EVEREST_VERIFIED')),
 verification_status text not null default 'UNVERIFIED' check (verification_status in ('UNVERIFIED','VERIFIED','REJECTED')),
 verified_at timestamptz,
 verified_by uuid references auth.users(id) on delete set null,
 suppressed_at timestamptz,
 suppression_reason text check (suppression_reason is null or length(suppression_reason)<=500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(reference_id,channel,destination_hash),
 constraint external_contact_verification_consistency check ((verification_status='VERIFIED')=(verified_at is not null))
);
create index external_business_contacts_reference_idx on public.external_business_contacts(reference_id,channel) where suppressed_at is null;
alter table public.external_business_contacts enable row level security;
revoke all on public.external_business_contacts from public,anon,authenticated;
grant select on public.external_business_contacts to service_role;

alter table public.external_enquiries add column if not exists recipient_contact_id uuid references public.external_business_contacts(id) on delete restrict;

create table public.external_contact_suppressions (
 id uuid primary key default gen_random_uuid(),
 channel text not null check (channel in ('EMAIL','SMS')),
 destination_hash bytea not null,
 reason text not null check (length(reason) between 1 and 500),
 source text not null check (source in ('BUSINESS_OPTOUT','BOUNCE','COMPLAINT','ADMIN','PROVIDER')),
 created_at timestamptz not null default now(),
 unique(channel,destination_hash)
);
alter table public.external_contact_suppressions enable row level security;
revoke all on public.external_contact_suppressions from public,anon,authenticated;
grant select on public.external_contact_suppressions to service_role;

create table public.external_message_deliveries (
 id uuid primary key default gen_random_uuid(),
 enquiry_id uuid not null references public.external_enquiries(id) on delete restrict,
 contact_id uuid not null references public.external_business_contacts(id) on delete restrict,
 channel text not null check (channel in ('EMAIL','SMS')),
 status text not null default 'QUEUED' check (status in ('QUEUED','PROCESSING','SANDBOXED','SENT','DELIVERED','FAILED','SUPPRESSED')),
 idempotency_key uuid not null default gen_random_uuid(),
 attempt_count integer not null default 0 check (attempt_count between 0 and 5),
 next_attempt_at timestamptz not null default now(),
 provider_message_id text,
 last_error_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(enquiry_id,channel),
 unique(idempotency_key)
);
create index external_message_deliveries_queue_idx on public.external_message_deliveries(status,next_attempt_at) where status in ('QUEUED','FAILED');
alter table public.external_message_deliveries enable row level security;
revoke all on public.external_message_deliveries from public,anon,authenticated;
grant select on public.external_message_deliveries to service_role;

-- Phase 2 accepted only a channel label. Remove direct client execution so a
-- gateway cannot be prepared without binding the enquiry to a verified contact.
revoke execute on function public.prepare_external_gateway(uuid,text) from authenticated;

create or replace function public.register_external_business_contact(
 p_reference_id uuid,p_channel text,p_destination text,p_provenance text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_channel text:=upper(trim(p_channel)); v_destination text:=trim(p_destination);
begin
 if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
 if v_channel not in ('EMAIL','SMS') or p_provenance not in ('PROVIDER_SUPPLIED','WEBSITE_SUPPLIED','CUSTOMER_SUPPLIED','ADMIN_VERIFIED','EVEREST_VERIFIED') then raise exception 'Invalid contact'; end if;
 if not exists(select 1 from public.external_business_references where id=p_reference_id and status='UNLINKED') then raise exception 'External business unavailable'; end if;
 if v_channel='EMAIL' and (length(v_destination)>320 or v_destination !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid email'; end if;
 if v_channel='SMS' and (length(v_destination)>32 or v_destination !~ '^\+?[0-9][0-9 ()-]{7,30}$') then raise exception 'Invalid phone'; end if;
 insert into public.external_business_contacts(reference_id,channel,destination,provenance)
 values(p_reference_id,v_channel,v_destination,p_provenance)
 on conflict(reference_id,channel,destination_hash) do update set provenance=excluded.provenance,updated_at=now()
 returning id into v_id;
 return v_id;
end; $$;
revoke all on function public.register_external_business_contact(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.register_external_business_contact(uuid,text,text,text) to service_role;

create or replace function public.verify_external_business_contact(p_contact_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_admin() then raise exception 'Admin verification required'; end if;
 update public.external_business_contacts c set verification_status='VERIFIED',verified_at=now(),verified_by=auth.uid(),updated_at=now()
 where c.id=p_contact_id and c.suppressed_at is null
 and not exists(select 1 from public.external_contact_suppressions s where s.channel=c.channel and s.destination_hash=c.destination_hash)
 returning c.id into v_id;
 return v_id is not null;
end; $$;
revoke all on function public.verify_external_business_contact(uuid) from public,anon;
grant execute on function public.verify_external_business_contact(uuid) to authenticated;

create or replace function public.prepare_external_gateway_for_contact(p_enquiry_id uuid,p_contact_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.is_admin() then raise exception 'Admin verification required'; end if;
 update public.external_enquiries e set status='READY',recipient_contact_id=p_contact_id,updated_at=now()
 where e.id=p_enquiry_id and e.status='AUTHORISED' and e.expires_at>now()
 and exists(select 1 from public.external_business_contacts c
   where c.id=p_contact_id and c.reference_id=e.reference_id and c.verification_status='VERIFIED' and c.suppressed_at is null
   and not exists(select 1 from public.external_contact_suppressions s where s.channel=c.channel and s.destination_hash=c.destination_hash))
 and exists(select 1 from public.external_business_references r where r.id=e.reference_id and r.status='UNLINKED')
 returning e.id into v_id;
 if v_id is null then return false; end if;
 insert into public.external_enquiry_events(enquiry_id,actor_id,event,channel)
 select v_id,auth.uid(),'RECIPIENT_CONTACT_BOUND',channel from public.external_business_contacts where id=p_contact_id;
 return true;
end; $$;
revoke all on function public.prepare_external_gateway_for_contact(uuid,uuid) from public,anon;
grant execute on function public.prepare_external_gateway_for_contact(uuid,uuid) to authenticated;

create or replace function public.suppress_external_contact(p_channel text,p_destination text,p_reason text,p_source text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_channel text:=upper(trim(p_channel)); v_hash bytea:=public.digest(lower(trim(p_destination)),'sha256');
begin
 if auth.role()<>'service_role' and not public.is_admin() then raise exception 'Not authorised'; end if;
 if v_channel not in ('EMAIL','SMS') or p_source not in ('BUSINESS_OPTOUT','BOUNCE','COMPLAINT','ADMIN','PROVIDER') or length(trim(p_reason)) not between 1 and 500 then raise exception 'Invalid suppression'; end if;
 insert into public.external_contact_suppressions(channel,destination_hash,reason,source) values(v_channel,v_hash,trim(p_reason),p_source)
 on conflict(channel,destination_hash) do update set reason=excluded.reason,source=excluded.source,created_at=now();
 update public.external_business_contacts set suppressed_at=coalesce(suppressed_at,now()),suppression_reason=trim(p_reason),updated_at=now()
 where channel=v_channel and destination_hash=v_hash;
 update public.external_enquiries e set status='SUPPRESSED',updated_at=now()
 where e.recipient_contact_id in (select id from public.external_business_contacts where channel=v_channel and destination_hash=v_hash)
 and e.status in ('AUTHORISED','READY','SENT','DELIVERED','OPENED');
 update public.external_gateway_tokens t set revoked_at=coalesce(revoked_at,now())
 where t.enquiry_id in (select id from public.external_enquiries where recipient_contact_id in (select id from public.external_business_contacts where channel=v_channel and destination_hash=v_hash));
 update public.external_message_deliveries d set status='SUPPRESSED',updated_at=now()
 where d.contact_id in (select id from public.external_business_contacts where channel=v_channel and destination_hash=v_hash) and d.status in ('QUEUED','PROCESSING','FAILED');
 return true;
end; $$;
revoke all on function public.suppress_external_contact(text,text,text,text) from public,anon,authenticated;
grant execute on function public.suppress_external_contact(text,text,text,text) to service_role;

create or replace function public.enqueue_external_enquiry_delivery(p_enquiry_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_delivery uuid; v_contact public.external_business_contacts; v_enquiry public.external_enquiries;
begin
 if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
 if not exists(select 1 from public.external_feature_flags where name='messaging' and enabled) then raise exception 'External messaging disabled'; end if;
 select * into v_enquiry from public.external_enquiries where id=p_enquiry_id and status='READY' and expires_at>now() for update;
 if not found or v_enquiry.recipient_contact_id is null then raise exception 'Enquiry unavailable'; end if;
 select * into v_contact from public.external_business_contacts where id=v_enquiry.recipient_contact_id and reference_id=v_enquiry.reference_id and verification_status='VERIFIED' and suppressed_at is null;
 if not found or exists(select 1 from public.external_contact_suppressions where channel=v_contact.channel and destination_hash=v_contact.destination_hash) then raise exception 'Recipient suppressed'; end if;
 if exists(select 1 from public.external_message_deliveries d join public.external_business_contacts c on c.id=d.contact_id where c.destination_hash=v_contact.destination_hash and c.channel=v_contact.channel and d.created_at>now()-interval '24 hours' and d.status not in ('FAILED','SUPPRESSED')) then raise exception 'Recipient cooldown active'; end if;
 insert into public.external_message_deliveries(enquiry_id,contact_id,channel) values(v_enquiry.id,v_contact.id,v_contact.channel)
 on conflict(enquiry_id,channel) do update set updated_at=now() returning id into v_delivery;
 insert into public.external_enquiry_events(enquiry_id,event,channel) values(v_enquiry.id,'MESSAGE_QUEUED',v_contact.channel);
 return v_delivery;
end; $$;
revoke all on function public.enqueue_external_enquiry_delivery(uuid) from public,anon,authenticated;
grant execute on function public.enqueue_external_enquiry_delivery(uuid) to service_role;

-- A worker may claim only one eligible item at a time. Production transports are
-- deliberately not implemented in this phase; the Edge worker accepts SANDBOX only.
create or replace function public.claim_external_message_delivery()
returns table(delivery_id uuid,enquiry_id uuid,channel text,destination text,request_snapshot jsonb,gateway_token text)
language plpgsql security definer set search_path='' as $$
declare v_row public.external_message_deliveries; v_contact public.external_business_contacts; v_enquiry public.external_enquiries; v_token text;
begin
 if auth.role()<>'service_role' then raise exception 'Service role required'; end if;
 select * into v_row from public.external_message_deliveries where status in ('QUEUED','FAILED') and next_attempt_at<=now() and attempt_count<5 order by created_at for update skip locked limit 1;
 if not found then return; end if;
 select * into v_contact from public.external_business_contacts where id=v_row.contact_id and verification_status='VERIFIED' and suppressed_at is null;
 select * into v_enquiry from public.external_enquiries where id=v_row.enquiry_id and status='READY' and expires_at>now();
 if not found or v_contact.id is null or exists(select 1 from public.external_contact_suppressions where channel=v_contact.channel and destination_hash=v_contact.destination_hash) then
   update public.external_message_deliveries set status='SUPPRESSED',updated_at=now() where id=v_row.id; return;
 end if;
 select encode(t.token_hash,'hex') into v_token from public.external_gateway_tokens t where t.enquiry_id=v_enquiry.id and t.revoked_at is null and t.used_at is null and t.expires_at>now();
 -- Hashes cannot reconstruct bearer tokens. A dispatcher must receive the raw token only at issuance time.
 -- Therefore automated production delivery remains intentionally blocked until token handoff is redesigned safely.
 update public.external_message_deliveries set status='SANDBOXED',attempt_count=attempt_count+1,updated_at=now(),last_error_code='RAW_TOKEN_HANDOFF_NOT_IMPLEMENTED' where id=v_row.id;
 insert into public.external_enquiry_events(enquiry_id,event,channel) values(v_enquiry.id,'MESSAGE_SANDBOX_BLOCKED',v_contact.channel);
 return query select v_row.id,v_enquiry.id,v_contact.channel,'[redacted]'::text,v_enquiry.request_snapshot,null::text;
end; $$;
revoke all on function public.claim_external_message_delivery() from public,anon,authenticated;
grant execute on function public.claim_external_message_delivery() to service_role;
