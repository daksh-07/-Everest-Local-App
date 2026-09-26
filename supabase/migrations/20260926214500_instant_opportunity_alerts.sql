-- Instant opportunity alerts: safe business decline action and richer notification routing.
create or replace function public.decline_opportunity(p_opportunity_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.opportunities set status='DECLINED'
 where id=p_opportunity_id and status='OPEN'
 and business_id in (select bm.business_id from public.business_members bm where bm.user_id=auth.uid());
 return found;
end; $$;
revoke all on function public.decline_opportunity(uuid) from public,anon;
grant execute on function public.decline_opportunity(uuid) to authenticated;

create or replace function public.notify_opportunity_insert()
returns trigger language plpgsql security definer set search_path='' as $$
declare member_id uuid;
begin
 for member_id in select bm.user_id from public.business_members bm where bm.business_id=new.business_id loop
  insert into public.notifications(user_id,kind,title,body,data)
  values(member_id,'NEW_OPPORTUNITY','New job near you','A customer request matched your business.',jsonb_build_object('opportunity_id',new.id,'request_id',new.request_id,'business_id',new.business_id,'route','/opportunities'));
 end loop;
 return new;
end; $$;
drop trigger if exists opportunities_notify on public.opportunities;
create trigger opportunities_notify after insert on public.opportunities for each row execute function public.notify_opportunity_insert();
