-- Correct social visibility aliasing and tighten/streamline hot-path RLS.
-- This migration preserves intended visibility while eliminating a tautological
-- business-follow condition introduced by unqualified policy column names.

drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts
for select to anon,authenticated
using (
  (select auth.uid())=posts.author_id
  or public.is_admin()
  or (
    posts.status='PUBLISHED'
    and (
      (select auth.uid()) is null
      or not exists (
        select 1
        from public.user_blocks ub
        where (ub.blocker_id=(select auth.uid()) and ub.blocked_id=posts.author_id)
           or (ub.blocked_id=(select auth.uid()) and ub.blocker_id=posts.author_id)
      )
    )
    and (
      (
        posts.visibility='PUBLIC'
        and (
          posts.business_id is null
          or exists (
            select 1
            from public.businesses b
            where b.id=posts.business_id
              and b.status='ACTIVE'
              and b.verification_status='VERIFIED'
          )
        )
      )
      or (
        posts.visibility='FOLLOWERS'
        and (select auth.uid()) is not null
        and (
          exists (
            select 1
            from public.follows f
            where f.follower_id=(select auth.uid())
              and (
                (posts.business_id is null and f.followed_user_id=posts.author_id)
                or f.business_id=posts.business_id
              )
          )
          or exists (
            select 1
            from public.user_connections uc
            where (uc.user_a=(select auth.uid()) and uc.user_b=posts.author_id)
               or (uc.user_b=(select auth.uid()) and uc.user_a=posts.author_id)
          )
          or exists (
            select 1
            from public.post_collaborators pc
            where pc.post_id=posts.id
              and pc.status='ACCEPTED'
              and (
                (
                  pc.collaborator_user_id is not null
                  and (
                    exists (
                      select 1 from public.follows f
                      where f.follower_id=(select auth.uid())
                        and f.followed_user_id=pc.collaborator_user_id
                    )
                    or exists (
                      select 1 from public.user_connections uc
                      where (uc.user_a=(select auth.uid()) and uc.user_b=pc.collaborator_user_id)
                         or (uc.user_b=(select auth.uid()) and uc.user_a=pc.collaborator_user_id)
                    )
                  )
                )
                or (
                  pc.collaborator_business_id is not null
                  and exists (
                    select 1 from public.follows f
                    where f.follower_id=(select auth.uid())
                      and f.business_id=pc.collaborator_business_id
                  )
                )
              )
          )
        )
      )
    )
  )
);

-- Media visibility must exactly follow the parent post visibility. Referencing
-- posts lets the posts RLS policy remain the single visibility authority and
-- prevents post/media policy drift as collaboration rules evolve.
drop policy if exists post_media_visible_read on public.post_media;
create policy post_media_visible_read on public.post_media
for select to anon,authenticated
using (
  exists (
    select 1
    from public.posts p
    where p.id=post_media.post_id
  )
);

-- Avoid two permissive SELECT policies for authenticated users while preserving
-- public availability discovery and private member access to their own row.
drop policy if exists business_availability_member_write on public.business_availability;
drop policy if exists business_availability_public_read on public.business_availability;
drop policy if exists business_availability_public_read_anon on public.business_availability;
drop policy if exists business_availability_authenticated_read on public.business_availability;
drop policy if exists business_availability_member_insert on public.business_availability;
drop policy if exists business_availability_member_update on public.business_availability;
drop policy if exists business_availability_member_delete on public.business_availability;

create policy business_availability_public_read_anon
on public.business_availability for select to anon
using (
  exists (
    select 1 from public.businesses b
    where b.id=business_availability.business_id
      and b.status='ACTIVE'
      and b.verification_status='VERIFIED'
  )
);

create policy business_availability_authenticated_read
on public.business_availability for select to authenticated
using (
  public.is_business_member(business_availability.business_id)
  or exists (
    select 1 from public.businesses b
    where b.id=business_availability.business_id
      and b.status='ACTIVE'
      and b.verification_status='VERIFIED'
  )
);

create policy business_availability_member_insert
on public.business_availability for insert to authenticated
with check (public.is_business_member(business_availability.business_id));

create policy business_availability_member_update
on public.business_availability for update to authenticated
using (public.is_business_member(business_availability.business_id))
with check (public.is_business_member(business_availability.business_id));

create policy business_availability_member_delete
on public.business_availability for delete to authenticated
using (public.is_business_member(business_availability.business_id));

-- Payment summaries contain booking financial data and should never be callable
-- by anonymous clients, even though the function also checks auth.uid().
revoke all on function public.service_booking_payment_summary(uuid) from public,anon;
grant execute on function public.service_booking_payment_summary(uuid) to authenticated,service_role;

notify pgrst,'reload schema';
