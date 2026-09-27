create or replace function public.send_quote(
  p_request_id uuid, p_service_id uuid, p_description text, p_line_items jsonb,
  p_price numeric, p_deposit numeric, p_total numeric, p_proposed_date date,
  p_proposed_time time without time zone, p_valid_until timestamp with time zone, p_terms text
)
returns uuid language plpgsql security definer set search_path to '' as $function$
declare
  qid uuid; bid uuid; cid uuid; request_status public.request_status; verified boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select r.customer_id, r.status into cid, request_status
  from public.service_requests r where r.id=p_request_id for update;
  if cid is null then raise exception 'Request not found'; end if;
  if request_status <> 'QUOTING' then raise exception 'Request is not accepting quotes'; end if;

  select o.business_id into bid
  from public.opportunities o
  where o.request_id=p_request_id
    and o.business_id in (select bm.business_id from public.business_members bm where bm.user_id=auth.uid())
    and o.status='OPEN'
  order by o.created_at asc limit 1 for update;
  if bid is null then raise exception 'No authorized opportunity'; end if;

  select b.verification_status='VERIFIED' into verified from public.businesses b where b.id=bid;
  if not coalesce(verified,false) then raise exception 'Verified business access is required'; end if;

  if p_service_id is not null and not exists (
    select 1 from public.services s where s.id=p_service_id and s.business_id=bid and s.active
  ) then raise exception 'Selected service is not owned and active for this business'; end if;

  if p_price is null or p_deposit is null or p_total is null
     or p_price<0 or p_deposit<0 or p_total<0 or p_total<p_deposit then
    raise exception 'Invalid quote amounts';
  end if;
  if p_valid_until is not null and p_valid_until<=now() then raise exception 'Quote expiry must be in the future'; end if;

  insert into public.quotes(request_id,business_id,customer_id,service_id,description,line_items,price,deposit,total,proposed_date,proposed_time,valid_until,terms,status)
  values(p_request_id,bid,cid,p_service_id,trim(coalesce(p_description,'')),coalesce(p_line_items,'[]'::jsonb),p_price,p_deposit,p_total,p_proposed_date,p_proposed_time,p_valid_until,p_terms,'SENT')
  returning id into qid;

  update public.opportunities set status='RESPONDED'
  where request_id=p_request_id and business_id=bid and status='OPEN';

  insert into public.notifications(user_id,kind,title,body,data)
  values(cid,'NEW_QUOTE','New quote received','A business has sent you a quote.',jsonb_build_object('quote_id',qid,'request_id',p_request_id));
  return qid;
end;
$function$;

revoke all on function public.send_quote(uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time without time zone,timestamp with time zone,text) from public, anon;
grant execute on function public.send_quote(uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time without time zone,timestamp with time zone,text) to authenticated;
