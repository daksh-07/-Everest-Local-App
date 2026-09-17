create or replace function public.set_service_status(p_service_id uuid,p_active boolean) returns boolean language plpgsql security definer set search_path=public as $$
declare bid uuid; verified boolean;
begin
 select business_id into bid from public.services where id=p_service_id;
 if bid is null or not public.is_business_member(bid) then raise exception 'Not authorized'; end if;
 select verification_status='VERIFIED' into verified from public.businesses where id=bid;
 if p_active and not coalesce(verified,false) then raise exception 'Business verification is required before publishing services'; end if;
 update public.services set active=p_active,updated_at=now() where id=p_service_id;
 return found;
end; $$;
grant execute on function public.set_service_status(uuid,boolean) to authenticated;
