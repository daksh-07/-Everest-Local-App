create or replace function public.notify_quote_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.status is distinct from new.status or old.id is null then
   insert into public.notifications(user_id,kind,title,body,data) values(new.customer_id,'QUOTE_UPDATE','Quote update','A business has updated a quote for your request.',jsonb_build_object('quote_id',new.id,'status',new.status));
 end if;
 return new;
end; $$;
drop trigger if exists quotes_notify on public.quotes;
create trigger quotes_notify after insert or update on public.quotes for each row execute function public.notify_quote_change();

create or replace function public.notify_booking_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.status is distinct from new.status or old.id is null then
   insert into public.notifications(user_id,kind,title,body,data) values(new.customer_id,'BOOKING_UPDATE','Booking update','Your booking status has changed.',jsonb_build_object('booking_id',new.id,'status',new.status));
 end if;
 return new;
end; $$;
drop trigger if exists bookings_notify on public.bookings;
create trigger bookings_notify after insert or update on public.bookings for each row execute function public.notify_booking_change();

create or replace function public.notify_opportunity_insert() returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid;
begin
 select user_id into owner_id from public.business_members where business_id=new.business_id and member_role='OWNER' limit 1;
 if owner_id is not null then insert into public.notifications(user_id,kind,title,body,data) values(owner_id,'NEW_OPPORTUNITY','New opportunity','A new customer request matched your business.',jsonb_build_object('opportunity_id',new.id,'request_id',new.request_id)); end if;
 return new;
end; $$;
drop trigger if exists opportunities_notify on public.opportunities;
create trigger opportunities_notify after insert on public.opportunities for each row execute function public.notify_opportunity_insert();
