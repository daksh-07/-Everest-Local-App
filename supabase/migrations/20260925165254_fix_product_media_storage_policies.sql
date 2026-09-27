-- Fix product-media storage policies so folder parsing targets storage.objects.name,
-- not the products.name column introduced by the nested policy subquery.

drop policy if exists product_media_member_insert on storage.objects;
create policy product_media_member_insert on storage.objects
for insert to authenticated
with check(
  bucket_id='product-media'
  and exists(
    select 1 from public.products p
    where p.id=(storage.foldername(storage.objects.name))[2]::uuid
      and p.business_id=(storage.foldername(storage.objects.name))[1]::uuid
      and public.is_business_member(p.business_id)
  )
);

drop policy if exists product_media_member_select on storage.objects;
create policy product_media_member_select on storage.objects
for select to anon,authenticated
using(
  bucket_id='product-media'
  and exists(
    select 1 from public.products p
    where p.id=(storage.foldername(storage.objects.name))[2]::uuid
      and (
        public.is_business_member(p.business_id)
        or exists(
          select 1 from public.businesses b
          where b.id=p.business_id
            and b.status='ACTIVE'
            and b.verification_status='VERIFIED'
            and p.status in ('ACTIVE','OUT_OF_STOCK')
        )
      )
  )
);

drop policy if exists product_media_member_update on storage.objects;
create policy product_media_member_update on storage.objects
for update to authenticated
using(
  bucket_id='product-media'
  and exists(
    select 1 from public.products p
    where p.id=(storage.foldername(storage.objects.name))[2]::uuid
      and public.is_business_member(p.business_id)
  )
)
with check(
  bucket_id='product-media'
  and exists(
    select 1 from public.products p
    where p.id=(storage.foldername(storage.objects.name))[2]::uuid
      and public.is_business_member(p.business_id)
  )
);

drop policy if exists product_media_member_delete on storage.objects;
create policy product_media_member_delete on storage.objects
for delete to authenticated
using(
  bucket_id='product-media'
  and exists(
    select 1 from public.products p
    where p.id=(storage.foldername(storage.objects.name))[2]::uuid
      and public.is_business_member(p.business_id)
  )
);
