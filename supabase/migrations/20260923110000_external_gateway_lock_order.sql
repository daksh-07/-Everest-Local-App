-- Keep the enquiry -> token lock order consistent across redemption, revocation and opt-out.
-- Hash lookup before locking is advisory; re-check the hash and validity after the enquiry lock.

create or replace function public.read_external_gateway(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_enquiry public.external_enquiries; v_token public.external_gateway_tokens; v_count integer; v_enquiry_id uuid;
begin
 if not exists(select 1 from public.external_feature_flags where name='gateway' and enabled) then return null; end if;
 insert into public.external_gateway_request_quota(window_start,attempts) values(date_trunc('minute',now()),1)
 on conflict(window_start) do update set attempts=public.external_gateway_request_quota.attempts+1
 where public.external_gateway_request_quota.attempts<100 returning attempts into v_count;
 if v_count is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 select enquiry_id into v_enquiry_id from public.external_gateway_tokens
 where token_hash=public.digest(p_token,'sha256');
 if v_enquiry_id is null then return null; end if;
 -- Customer revocation locks the enquiry first. Match that order in redemption.
 select * into v_enquiry from public.external_enquiries
 where id=v_enquiry_id and status in ('READY','SENT','DELIVERED','OPENED') and expires_at>now() for update;
 if not found then return null; end if;
 select * into v_token from public.external_gateway_tokens
 where enquiry_id=v_enquiry.id and token_hash=public.digest(p_token,'sha256') for update;
 if not found or v_token.revoked_at is not null or v_token.used_at is not null
    or v_token.expires_at<=now() or v_token.failed_attempts>=5 then return null; end if;
 if not found or not exists(select 1 from public.external_business_references where id=v_enquiry.reference_id and status='UNLINKED') then return null; end if;
 if not exists(select 1 from public.service_requests where id=v_enquiry.request_id and status not in ('CANCELLED','BOOKED','COMPLETED')) then return null; end if;
 update public.external_gateway_tokens set opened_at=coalesce(opened_at,now()) where enquiry_id=v_enquiry.id;
 update public.external_enquiries set status='OPENED',updated_at=now() where id=v_enquiry.id and status in ('READY','SENT','DELIVERED');
 insert into public.external_enquiry_events(enquiry_id,event) values(v_enquiry.id,'GATEWAY_OPENED');
 return v_enquiry.request_snapshot || jsonb_build_object('email',v_enquiry.approved_email,'phone',v_enquiry.approved_phone);
end; $$;

create or replace function public.submit_external_gateway_quote(p_token text,p_amount numeric,p_message text,p_availability text,p_valid_until timestamptz)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_token public.external_gateway_tokens; v_enquiry public.external_enquiries; v_id uuid; v_count integer; v_enquiry_id uuid;
begin
 if not exists(select 1 from public.external_feature_flags where name='gateway' and enabled) then return false; end if;
 insert into public.external_gateway_request_quota(window_start,attempts) values(date_trunc('minute',now()),1)
 on conflict(window_start) do update set attempts=public.external_gateway_request_quota.attempts+1
 where public.external_gateway_request_quota.attempts<100 returning attempts into v_count;
 if v_count is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
 select enquiry_id into v_enquiry_id from public.external_gateway_tokens
 where token_hash=public.digest(p_token,'sha256');
 if v_enquiry_id is null then return false; end if;
 -- Customer revocation locks the enquiry first. Match that order in redemption.
 select * into v_enquiry from public.external_enquiries
 where id=v_enquiry_id and status in ('READY','SENT','DELIVERED','OPENED') and expires_at>now() for update;
 if not found then return false; end if;
 select * into v_token from public.external_gateway_tokens
 where enquiry_id=v_enquiry.id and token_hash=public.digest(p_token,'sha256') for update;
 if not found or v_token.revoked_at is not null or v_token.used_at is not null
    or v_token.expires_at<=now() or v_token.failed_attempts>=5 then return false; end if;
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

create or replace function public.opt_out_external_gateway_contact(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.external_business_contacts;
  v_enquiry_id uuid;
  v_contact_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  select enquiry_id into v_enquiry_id from public.external_gateway_tokens
  where token_hash = public.digest(p_token,'sha256');
  if v_enquiry_id is null then return false; end if;

  select recipient_contact_id into v_contact_id from public.external_enquiries
  where id = v_enquiry_id and status in ('READY','SENT','DELIVERED','OPENED') for update;
  if v_contact_id is null then return false; end if;

  perform 1 from public.external_gateway_tokens
  where enquiry_id = v_enquiry_id and token_hash = public.digest(p_token,'sha256')
    and revoked_at is null and used_at is null and expires_at > now() for update;
  if not found then return false; end if;

  select * into v_contact
  from public.external_business_contacts
  where id = v_contact_id
  for update;
  if not found then return false; end if;

  perform public.suppress_external_contact(
    v_contact.channel,
    v_contact.destination,
    'Business opted out from the secure enquiry gateway',
    'BUSINESS_OPTOUT'
  );
  insert into public.external_enquiry_events(enquiry_id,reference_id,event,channel)
  values(v_enquiry_id,v_contact.reference_id,'BUSINESS_OPTOUT',v_contact.channel);
  return true;
end;
$$;
