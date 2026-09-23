-- Let a business suppress the verified destination bound to a valid gateway
-- token without creating an Everest account. The public Edge Function calls
-- this with service_role; the RPC itself is never exposed to browser roles.
create or replace function public.opt_out_external_gateway_contact(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact public.external_business_contacts;
  v_enquiry_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    return false;
  end if;

  select e.id, c.*
    into v_enquiry_id, v_contact
  from public.external_gateway_tokens t
  join public.external_enquiries e on e.id = t.enquiry_id
  join public.external_business_contacts c on c.id = e.recipient_contact_id
  where t.token_hash = public.digest(p_token,'sha256')
    and t.revoked_at is null
    and t.used_at is null
    and t.expires_at > now()
  for update of t, e, c;

  if v_enquiry_id is null or v_contact.id is null then
    return false;
  end if;

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

revoke all on function public.opt_out_external_gateway_contact(text) from public, anon, authenticated;
grant execute on function public.opt_out_external_gateway_contact(text) to service_role;
