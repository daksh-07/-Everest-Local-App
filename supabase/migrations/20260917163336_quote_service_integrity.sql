-- A quote may only reference a service owned by the responding business.
-- The quote RPC already authorizes the business through its opportunity; this
-- closes the remaining cross-business service-reference integrity gap.
do $$
begin
  if exists (
    select 1
    from public.quotes q
    where q.service_id is not null
      and not exists (
        select 1
        from public.services s
        where s.id=q.service_id
          and s.business_id=q.business_id
      )
  ) then
    raise exception 'Existing quote service references are inconsistent';
  end if;
end $$;

create or replace function public.send_quote(
  p_request_id uuid,
  p_service_id uuid,
  p_description text,
  p_line_items jsonb,
  p_price numeric,
  p_deposit numeric,
  p_total numeric,
  p_proposed_date date,
  p_proposed_time time,
  p_valid_until timestamptz,
  p_terms text
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare qid uuid; bid uuid; cid uuid;
begin
  select o.business_id, r.customer_id into bid,cid
  from public.opportunities o
  join public.service_requests r on r.id=o.request_id
  where o.request_id=p_request_id
    and o.business_id in (select business_id from public.business_members where user_id=auth.uid())
    and o.status='OPEN'
  limit 1;
  if bid is null then raise exception 'No authorized opportunity'; end if;

  if p_service_id is not null and not exists (
    select 1 from public.services s
    where s.id=p_service_id and s.business_id=bid and s.active
  ) then
    raise exception 'Selected service is not owned and active for this business';
  end if;

  if p_price < 0 or p_deposit < 0 or p_total < 0 or p_total < p_deposit then
    raise exception 'Invalid quote amounts';
  end if;

  insert into public.quotes(request_id,business_id,customer_id,service_id,description,line_items,price,deposit,total,proposed_date,proposed_time,valid_until,terms,status)
  values(p_request_id,bid,cid,p_service_id,trim(p_description),coalesce(p_line_items,'[]'::jsonb),p_price,p_deposit,p_total,p_proposed_date,p_proposed_time,p_valid_until,p_terms,'SENT')
  returning id into qid;
  update public.opportunities set status='RESPONDED' where request_id=p_request_id and business_id=bid;
  insert into public.notifications(user_id,kind,title,body,data)
  values(cid,'NEW_QUOTE','New quote received','A business has sent you a quote.',jsonb_build_object('quote_id',qid,'request_id',p_request_id));
  return qid;
end;
$$;

grant execute on function public.send_quote(uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time,timestamptz,text) to authenticated;
