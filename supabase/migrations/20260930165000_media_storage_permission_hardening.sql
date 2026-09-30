-- Align private audio visibility with post visibility and require catalogue
-- permissions for product-media mutations.

drop policy if exists user_audio_visible_select on storage.objects;
create policy user_audio_visible_select on storage.objects
for select to anon,authenticated
using(
  bucket_id='user-audio'
  and exists(
    select 1
    from public.audio_assets a
    where a.storage_bucket='user-audio'
      and a.storage_path=storage.objects.name
      and (
        a.owner_id=auth.uid()
        or public.is_admin()
        or exists(
          select 1
          from public.post_audio_tracks pat
          join public.posts p on p.id=pat.post_id
          where pat.audio_asset_id=a.id
            and p.status='PUBLISHED'
            and not exists(
              select 1
              from public.user_blocks ub
              where (ub.blocker_id=auth.uid() and ub.blocked_id=p.author_id)
                 or (ub.blocked_id=auth.uid() and ub.blocker_id=p.author_id)
            )
            and (
              (
                p.visibility='PUBLIC'
                and (
                  p.business_id is null
                  or exists(
                    select 1 from public.businesses b
                    where b.id=p.business_id
                      and b.status='ACTIVE'
                      and b.verification_status='VERIFIED'
                  )
                )
              )
              or (
                p.visibility='FOLLOWERS'
                and exists(
                  select 1 from public.follows f
                  where f.follower_id=auth.uid()
                    and (
                      (p.business_id is null and f.followed_user_id=p.author_id)
                      or f.business_id=p.business_id
                    )
                )
              )
            )
        )
      )
  )
);

drop policy if exists product_media_member_insert on storage.objects;
create policy product_media_member_insert on storage.objects
for insert to authenticated
with check(
  bucket_id='product-media'
  and exists(
    select 1
    from public.products p
    where p.id=((storage.foldername(storage.objects.name))[2])::uuid
      and p.business_id=((storage.foldername(storage.objects.name))[1])::uuid
      and (
        public.has_business_permission(p.business_id,'CATALOG_MANAGE')
        or public.is_admin()
      )
  )
);

drop policy if exists product_media_member_update on storage.objects;
create policy product_media_member_update on storage.objects
for update to authenticated
using(
  bucket_id='product-media'
  and exists(
    select 1
    from public.products p
    where p.id=((storage.foldername(storage.objects.name))[2])::uuid
      and p.business_id=((storage.foldername(storage.objects.name))[1])::uuid
      and (
        public.has_business_permission(p.business_id,'CATALOG_MANAGE')
        or public.is_admin()
      )
  )
)
with check(
  bucket_id='product-media'
  and exists(
    select 1
    from public.products p
    where p.id=((storage.foldername(storage.objects.name))[2])::uuid
      and p.business_id=((storage.foldername(storage.objects.name))[1])::uuid
      and (
        public.has_business_permission(p.business_id,'CATALOG_MANAGE')
        or public.is_admin()
      )
  )
);

drop policy if exists product_media_member_delete on storage.objects;
create policy product_media_member_delete on storage.objects
for delete to authenticated
using(
  bucket_id='product-media'
  and exists(
    select 1
    from public.products p
    where p.id=((storage.foldername(storage.objects.name))[2])::uuid
      and p.business_id=((storage.foldername(storage.objects.name))[1])::uuid
      and (
        public.has_business_permission(p.business_id,'CATALOG_MANAGE')
        or public.is_admin()
      )
  )
);
