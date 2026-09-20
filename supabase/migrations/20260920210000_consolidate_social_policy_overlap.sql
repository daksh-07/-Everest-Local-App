begin;

drop policy if exists posts_owner_read on public.posts;
drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts
for select
to anon, authenticated
using (
  (
    status = 'PUBLISHED'
    and visibility = 'PUBLIC'
    and (
      business_id is null
      or exists (
        select 1 from public.businesses b
        where b.id = posts.business_id
          and b.status = 'ACTIVE'
          and b.verification_status = 'VERIFIED'
      )
    )
  )
  or auth.uid() = author_id
  or is_admin()
  or (
    status = 'PUBLISHED'
    and visibility = 'FOLLOWERS'
    and exists (
      select 1 from public.follows f
      where f.follower_id = (select auth.uid())
        and (
          (f.followed_user_id = posts.author_id and posts.business_id is null)
          or f.business_id = posts.business_id
        )
    )
  )
);

drop policy if exists post_media_author_write on public.post_media;
create policy post_media_author_insert on public.post_media
for insert to authenticated
with check (exists (select 1 from public.posts p where p.id = post_media.post_id and (p.author_id = (select auth.uid()) or is_admin())));
create policy post_media_author_update on public.post_media
for update to authenticated
using (exists (select 1 from public.posts p where p.id = post_media.post_id and (p.author_id = (select auth.uid()) or is_admin())))
with check (exists (select 1 from public.posts p where p.id = post_media.post_id and (p.author_id = (select auth.uid()) or is_admin())));
create policy post_media_author_delete on public.post_media
for delete to authenticated
using (exists (select 1 from public.posts p where p.id = post_media.post_id and (p.author_id = (select auth.uid()) or is_admin())));

drop policy if exists public_profiles_self on public.public_profiles;
create policy public_profiles_self_insert on public.public_profiles
for insert to authenticated with check ((select auth.uid()) = id or is_admin());
create policy public_profiles_self_update on public.public_profiles
for update to authenticated using ((select auth.uid()) = id or is_admin()) with check ((select auth.uid()) = id or is_admin());
create policy public_profiles_self_delete on public.public_profiles
for delete to authenticated using ((select auth.uid()) = id or is_admin());

drop policy if exists service_definitions_admin_write on public.service_definitions;
create policy service_definitions_admin_insert on public.service_definitions
for insert to authenticated with check (is_admin());
create policy service_definitions_admin_update on public.service_definitions
for update to authenticated using (is_admin()) with check (is_admin());
create policy service_definitions_admin_delete on public.service_definitions
for delete to authenticated using (is_admin());

commit;
