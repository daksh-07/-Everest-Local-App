-- Everest Local: restore public (guest) reads and enforce blocks in both directions.
--
-- 20260920240000_secure_single_account_admin_mfa revoked EXECUTE on is_admin()
-- from anon. Every public-read RLS policy calls is_admin(), and PostgreSQL checks
-- function/table privileges for the whole policy expression even when an earlier
-- branch short-circuits. Result: every guest read of businesses, categories,
-- services, products, posts, comments and post media failed with 42501, so the
-- signed-out app showed empty home, search, shop and feed screens.
--
-- Both helpers below are SECURITY DEFINER and only compare rows against
-- auth.uid(); for a guest auth.uid() is null so they always return false.
grant execute on function public.is_admin() to anon;
grant execute on function public.is_business_member(uuid) to anon;

-- Follower/connection branches of the post visibility policy are guarded by
-- auth.uid() is not null, but still need SELECT privilege to plan. Their RLS
-- policies are TO authenticated only, so anon still reads zero rows.
grant select on public.follows, public.user_connections to anon;

-- Block checks: user_blocks RLS only exposes rows to the blocker, so the inline
-- "blocked_id = me and blocker_id = author" branch could never match and a user
-- blocked by an author still saw that author's posts and media. This helper only
-- answers for the current viewer, so it cannot be used to probe other pairs.
create or replace function public.viewer_blocked_with(p_other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_other is not null
    and exists (
      select 1
      from public.user_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p_other)
         or (b.blocker_id = p_other and b.blocked_id = auth.uid())
    );
$$;

revoke all on function public.viewer_blocked_with(uuid) from public;
grant execute on function public.viewer_blocked_with(uuid) to anon, authenticated, service_role;

drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts
for select to anon, authenticated
using (
  (select auth.uid()) = author_id
  or public.is_admin()
  or (
    status = 'PUBLISHED'
    and not public.viewer_blocked_with(author_id)
    and (
      (
        visibility = 'PUBLIC'
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
      or (
        visibility = 'FOLLOWERS'
        and (select auth.uid()) is not null
        and (
          exists (
            select 1 from public.follows f
            where f.follower_id = (select auth.uid())
              and (
                (posts.business_id is null and f.followed_user_id = posts.author_id)
                or f.business_id = posts.business_id
              )
          )
          or exists (
            select 1 from public.user_connections uc
            where (uc.user_a = (select auth.uid()) and uc.user_b = posts.author_id)
               or (uc.user_b = (select auth.uid()) and uc.user_a = posts.author_id)
          )
          or exists (
            select 1 from public.post_collaborators pc
            where pc.post_id = posts.id
              and pc.status = 'ACCEPTED'
              and (
                (
                  pc.collaborator_user_id is not null
                  and (
                    exists (
                      select 1 from public.follows f
                      where f.follower_id = (select auth.uid())
                        and f.followed_user_id = pc.collaborator_user_id
                    )
                    or exists (
                      select 1 from public.user_connections uc
                      where (uc.user_a = (select auth.uid()) and uc.user_b = pc.collaborator_user_id)
                         or (uc.user_b = (select auth.uid()) and uc.user_a = pc.collaborator_user_id)
                    )
                  )
                )
                or (
                  pc.collaborator_business_id is not null
                  and exists (
                    select 1 from public.follows f
                    where f.follower_id = (select auth.uid())
                      and f.business_id = pc.collaborator_business_id
                  )
                )
              )
          )
        )
      )
    )
  )
);

drop policy if exists story_highlights_read on public.story_highlights;
create policy story_highlights_read on public.story_highlights
for select to anon, authenticated
using (
  owner_id = (select auth.uid())
  or public.is_admin()
  or (
    not public.viewer_blocked_with(owner_id)
    and (
      (
        business_id is not null
        and exists (
          select 1 from public.businesses b
          where b.id = story_highlights.business_id
            and b.status = 'ACTIVE'
            and b.verification_status = 'VERIFIED'
        )
      )
      or (
        business_id is null
        and exists (
          select 1 from public.public_profiles pp
          where pp.id = story_highlights.owner_id
            and pp.visibility = 'PUBLIC'
        )
      )
    )
  )
);

-- Storage media follows the same rule. Each policy reads public.posts, whose own
-- RLS already applies visibility; the explicit checks are kept for defence in depth.
drop policy if exists post_media_visible_select on storage.objects;
create policy post_media_visible_select on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'post-media'
  and exists (
    select 1 from public.posts p
    where p.id = ((storage.foldername(objects.name))[2])::uuid
      and (
        p.author_id = (select auth.uid())
        or public.is_admin()
        or (
          p.status = 'PUBLISHED'
          and not public.viewer_blocked_with(p.author_id)
          and (
            (
              p.visibility = 'PUBLIC'
              and (
                p.business_id is null
                or exists (
                  select 1 from public.businesses b
                  where b.id = p.business_id
                    and b.status = 'ACTIVE'
                    and b.verification_status = 'VERIFIED'
                )
              )
            )
            or (
              p.visibility = 'FOLLOWERS'
              and exists (
                select 1 from public.follows f
                where f.follower_id = (select auth.uid())
                  and (
                    (p.business_id is null and f.followed_user_id = p.author_id)
                    or f.business_id = p.business_id
                  )
              )
            )
          )
        )
      )
  )
);

drop policy if exists clip_media_visible_select on storage.objects;
create policy clip_media_visible_select on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'clip-media'
  and exists (
    select 1 from public.posts p
    where p.id = ((storage.foldername(objects.name))[2])::uuid
      and (
        p.author_id = (select auth.uid())
        or public.is_admin()
        or (
          p.status = 'PUBLISHED'
          and p.visibility = 'PUBLIC'
          and not public.viewer_blocked_with(p.author_id)
          and (
            p.business_id is null
            or exists (
              select 1 from public.businesses b
              where b.id = p.business_id
                and b.status = 'ACTIVE'
                and b.verification_status = 'VERIFIED'
            )
          )
        )
      )
  )
);

drop policy if exists user_audio_visible_select on storage.objects;
create policy user_audio_visible_select on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'user-audio'
  and exists (
    select 1 from public.audio_assets a
    where a.storage_bucket = 'user-audio'
      and a.storage_path = objects.name
      and (
        a.owner_id = (select auth.uid())
        or public.is_admin()
        or exists (
          select 1
          from public.post_audio_tracks pat
          join public.posts p on p.id = pat.post_id
          where pat.audio_asset_id = a.id
            and p.status = 'PUBLISHED'
            and not public.viewer_blocked_with(p.author_id)
            and (
              (
                p.visibility = 'PUBLIC'
                and (
                  p.business_id is null
                  or exists (
                    select 1 from public.businesses b
                    where b.id = p.business_id
                      and b.status = 'ACTIVE'
                      and b.verification_status = 'VERIFIED'
                  )
                )
              )
              or (
                p.visibility = 'FOLLOWERS'
                and exists (
                  select 1 from public.follows f
                  where f.follower_id = (select auth.uid())
                    and (
                      (p.business_id is null and f.followed_user_id = p.author_id)
                      or f.business_id = p.business_id
                    )
                )
              )
            )
        )
      )
  )
);

-- Stock for publicly listed products. Variant stock is already public, but
-- single-SKU stock lived only in inventory, readable by business members. The
-- invoker-rights shop_products() therefore treated every tracked product as out
-- of stock for customers (and filtered it out of the shop), and the product page
-- embed of inventory failed outright for guests.
drop policy if exists inventory_public_read on public.inventory;
create policy inventory_public_read on public.inventory
for select to anon, authenticated
using (
  exists (
    select 1
    from public.products p
    join public.businesses b on b.id = p.business_id
    where p.id = inventory.product_id
      and p.status in ('ACTIVE', 'OUT_OF_STOCK')
      and b.status = 'ACTIVE'
      and b.verification_status = 'VERIFIED'
  )
);

grant select on public.inventory to anon;
