-- Notify the customer and business owner when a real delivery changes state.
create or replace function public.notify_delivery_change() returns trigger
language plpgsql security definer set search_path=public as $$
declare customer_id uuid; owner_id uuid; label text;
begin
  if tg_op='INSERT' or old.status is distinct from new.status then
    select o.customer_id,b.owner_id into customer_id,owner_id from public.orders o join public.businesses b on b.id=o.business_id where o.id=new.order_id;
    label:=replace(new.status::text,'_',' ');
    if customer_id is not null then insert into public.notifications(user_id,kind,title,body,data) values(customer_id,'DELIVERY_UPDATE','Delivery update','Your delivery is now '||label||'.',jsonb_build_object('delivery_id',new.id,'order_id',new.order_id,'status',new.status)); end if;
    if owner_id is not null and owner_id<>customer_id then insert into public.notifications(user_id,kind,title,body,data) values(owner_id,'DELIVERY_UPDATE','Delivery update','A customer delivery is now '||label||'.',jsonb_build_object('delivery_id',new.id,'order_id',new.order_id,'status',new.status)); end if;
  end if;
  return new;
end; $$;

drop trigger if exists deliveries_notify on public.deliveries;
create trigger deliveries_notify after insert or update on public.deliveries for each row execute function public.notify_delivery_change();
