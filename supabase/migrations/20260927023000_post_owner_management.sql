-- Owner controls for social posts: archived content remains private but manageable by its author.
drop policy if exists "posts_owner_select" on public.posts;
create policy "posts_owner_select"
on public.posts
for select
to authenticated
using (auth.uid() = author_id);

drop policy if exists "posts_owner_update" on public.posts;
create policy "posts_owner_update"
on public.posts
for update
to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);
