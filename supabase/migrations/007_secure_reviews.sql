create or replace function public.create_transaction_review(p_business_id uuid,p_product_id uuid,p_booking_id uuid,p_order_id uuid,p_rating integer,p_body text default null,p_photo_urls text[] default '{}') returns uuid language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_rating<1 or p_rating>5 then raise exception 'Rating must be between 1 and 5'; end if;
 if p_booking_id is not null then
   if p_order_id is not null or p_product_id is not null then raise exception 'Invalid service review'; end if;
   if not exists(select 1 from public.bookings where id=p_booking_id and customer_id=auth.uid() and business_id=p_business_id and status='COMPLETED') then raise exception 'Booking is not eligible for review'; end if;
 elsif p_order_id is not null then
   if p_product_id is null then raise exception 'Product is required for a product review'; end if;
   if not exists(select 1 from public.orders o join public.order_items oi on oi.order_id=o.id where o.id=p_order_id and o.customer_id=auth.uid() and o.status='COMPLETED' and oi.product_id=p_product_id and o.business_id=p_business_id) then raise exception 'Order is not eligible for review'; end if;
 else raise exception 'Transaction reference required'; end if;
 insert into public.reviews(author_id,business_id,product_id,booking_id,order_id,rating,body,photo_urls,verified_transaction) values(auth.uid(),p_business_id,p_product_id,p_booking_id,p_order_id,p_rating,p_body,p_photo_urls,true) returning id into rid;
 return rid;
end; $$;
revoke insert on public.reviews from anon,authenticated;
grant execute on function public.create_transaction_review(uuid,uuid,uuid,uuid,integer,text,text[]) to authenticated;
