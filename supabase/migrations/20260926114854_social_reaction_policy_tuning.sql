-- Split reaction writes so authenticated SELECT uses only the public read policy.
drop policy if exists post_reactions_write on public.post_reactions;
drop policy if exists post_reactions_insert on public.post_reactions;
drop policy if exists post_reactions_delete on public.post_reactions;

create policy post_reactions_insert on public.post_reactions
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.posts p
    where p.id = post_reactions.post_id
      and p.status = 'PUBLISHED'
  )
);

create policy post_reactions_delete on public.post_reactions
for delete to authenticated
using ((select auth.uid()) = user_id);
