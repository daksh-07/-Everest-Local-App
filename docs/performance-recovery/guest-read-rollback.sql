-- Exact pre-recovery SELECT policies and anon ACL rollback; no data changes.
begin;
drop policy if exists "posts_public_read" on "public"."posts";
create policy "posts_public_read" on "public"."posts" as PERMISSIVE for SELECT to "anon", "authenticated" using (((( SELECT auth.uid() AS uid) = author_id) OR is_admin() OR ((status = 'PUBLISHED'::text) AND ((( SELECT auth.uid() AS uid) IS NULL) OR (NOT (EXISTS ( SELECT 1
   FROM user_blocks ub
  WHERE (((ub.blocker_id = ( SELECT auth.uid() AS uid)) AND (ub.blocked_id = posts.author_id)) OR ((ub.blocked_id = ( SELECT auth.uid() AS uid)) AND (ub.blocker_id = posts.author_id))))))) AND (((visibility = 'PUBLIC'::text) AND ((business_id IS NULL) OR (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = posts.business_id) AND (b.status = 'ACTIVE'::business_status) AND (b.verification_status = 'VERIFIED'::verification_status)))))) OR ((visibility = 'FOLLOWERS'::text) AND (( SELECT auth.uid() AS uid) IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM follows f
  WHERE ((f.follower_id = ( SELECT auth.uid() AS uid)) AND (((posts.business_id IS NULL) AND (f.followed_user_id = posts.author_id)) OR (f.business_id = posts.business_id))))) OR (EXISTS ( SELECT 1
   FROM user_connections uc
  WHERE (((uc.user_a = ( SELECT auth.uid() AS uid)) AND (uc.user_b = posts.author_id)) OR ((uc.user_b = ( SELECT auth.uid() AS uid)) AND (uc.user_a = posts.author_id))))) OR (EXISTS ( SELECT 1
   FROM post_collaborators pc
  WHERE ((pc.post_id = posts.id) AND (pc.status = 'ACCEPTED'::text) AND (((pc.collaborator_user_id IS NOT NULL) AND ((EXISTS ( SELECT 1
           FROM follows f
          WHERE ((f.follower_id = ( SELECT auth.uid() AS uid)) AND (f.followed_user_id = pc.collaborator_user_id)))) OR (EXISTS ( SELECT 1
           FROM user_connections uc
          WHERE (((uc.user_a = ( SELECT auth.uid() AS uid)) AND (uc.user_b = pc.collaborator_user_id)) OR ((uc.user_b = ( SELECT auth.uid() AS uid)) AND (uc.user_a = pc.collaborator_user_id))))))) OR ((pc.collaborator_business_id IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM follows f
          WHERE ((f.follower_id = ( SELECT auth.uid() AS uid)) AND (f.business_id = pc.collaborator_business_id)))))))))))))));
drop policy if exists "story_highlights_read" on "public"."story_highlights";
create policy "story_highlights_read" on "public"."story_highlights" as PERMISSIVE for SELECT to "anon", "authenticated" using (((owner_id = ( SELECT auth.uid() AS uid)) OR is_admin() OR (((( SELECT auth.uid() AS uid) IS NULL) OR (NOT users_blocked(( SELECT auth.uid() AS uid), owner_id))) AND (((business_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM businesses b
  WHERE ((b.id = story_highlights.business_id) AND (b.status = 'ACTIVE'::business_status) AND (b.verification_status = 'VERIFIED'::verification_status))))) OR ((business_id IS NULL) AND (EXISTS ( SELECT 1
   FROM public_profiles pp
  WHERE ((pp.id = story_highlights.owner_id) AND (pp.visibility = 'PUBLIC'::text)))))))));
drop policy if exists "inventory_public_read" on "public"."inventory";
drop policy if exists "post_media_visible_select" on "storage"."objects";
create policy "post_media_visible_select" on "storage"."objects" as PERMISSIVE for SELECT to public using (((bucket_id = 'post-media'::text) AND (EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = ((storage.foldername(objects.name))[2])::uuid) AND ((p.author_id = ( SELECT auth.uid() AS uid)) OR is_admin() OR ((p.status = 'PUBLISHED'::text) AND (NOT (EXISTS ( SELECT 1
           FROM user_blocks ub
          WHERE (((ub.blocker_id = ( SELECT auth.uid() AS uid)) AND (ub.blocked_id = p.author_id)) OR ((ub.blocked_id = ( SELECT auth.uid() AS uid)) AND (ub.blocker_id = p.author_id)))))) AND (((p.visibility = 'PUBLIC'::text) AND ((p.business_id IS NULL) OR (EXISTS ( SELECT 1
           FROM businesses b
          WHERE ((b.id = p.business_id) AND (b.status = 'ACTIVE'::business_status) AND (b.verification_status = 'VERIFIED'::verification_status)))))) OR ((p.visibility = 'FOLLOWERS'::text) AND (EXISTS ( SELECT 1
           FROM follows f
          WHERE ((f.follower_id = ( SELECT auth.uid() AS uid)) AND (((p.business_id IS NULL) AND (f.followed_user_id = p.author_id)) OR (f.business_id = p.business_id))))))))))))));
drop policy if exists "clip_media_visible_select" on "storage"."objects";
create policy "clip_media_visible_select" on "storage"."objects" as PERMISSIVE for SELECT to "anon", "authenticated" using (((bucket_id = 'clip-media'::text) AND (EXISTS ( SELECT 1
   FROM posts p
  WHERE ((p.id = ((storage.foldername(objects.name))[2])::uuid) AND ((p.author_id = auth.uid()) OR is_admin() OR ((p.status = 'PUBLISHED'::text) AND (p.visibility = 'PUBLIC'::text) AND ((p.business_id IS NULL) OR (EXISTS ( SELECT 1
           FROM businesses b
          WHERE ((b.id = p.business_id) AND (b.status = 'ACTIVE'::business_status) AND (b.verification_status = 'VERIFIED'::verification_status))))) AND (NOT (EXISTS ( SELECT 1
           FROM user_blocks ub
          WHERE (((ub.blocker_id = auth.uid()) AND (ub.blocked_id = p.author_id)) OR ((ub.blocked_id = auth.uid()) AND (ub.blocker_id = p.author_id)))))))))))));
drop policy if exists "user_audio_visible_select" on "storage"."objects";
create policy "user_audio_visible_select" on "storage"."objects" as PERMISSIVE for SELECT to "anon", "authenticated" using (((bucket_id = 'user-audio'::text) AND (EXISTS ( SELECT 1
   FROM audio_assets a
  WHERE ((a.storage_bucket = 'user-audio'::text) AND (a.storage_path = objects.name) AND ((a.owner_id = auth.uid()) OR is_admin() OR (EXISTS ( SELECT 1
           FROM (post_audio_tracks pat
             JOIN posts p ON ((p.id = pat.post_id)))
          WHERE ((pat.audio_asset_id = a.id) AND (p.status = 'PUBLISHED'::text) AND (NOT (EXISTS ( SELECT 1
                   FROM user_blocks ub
                  WHERE (((ub.blocker_id = auth.uid()) AND (ub.blocked_id = p.author_id)) OR ((ub.blocked_id = auth.uid()) AND (ub.blocker_id = p.author_id)))))) AND (((p.visibility = 'PUBLIC'::text) AND ((p.business_id IS NULL) OR (EXISTS ( SELECT 1
                   FROM businesses b
                  WHERE ((b.id = p.business_id) AND (b.status = 'ACTIVE'::business_status) AND (b.verification_status = 'VERIFIED'::verification_status)))))) OR ((p.visibility = 'FOLLOWERS'::text) AND (EXISTS ( SELECT 1
                   FROM follows f
                  WHERE ((f.follower_id = auth.uid()) AND (((p.business_id IS NULL) AND (f.followed_user_id = p.author_id)) OR (f.business_id = p.business_id))))))))))))))));
revoke execute on function public.is_admin(),public.is_business_member(uuid) from anon;
revoke select on public.follows,public.user_connections,public.inventory from anon;
drop function if exists public.viewer_blocked_with(uuid);
commit;
