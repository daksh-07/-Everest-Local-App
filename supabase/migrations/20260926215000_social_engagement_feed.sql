-- Social engagement for Explore feed: likes, comments, saves, and creator comment controls.
alter table public.posts
  add column if not exists comments_enabled boolean not null default true;

create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'LIKE' check (reaction in ('LIKE')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_reactions_post_idx on public.post_reactions(post_id, created_at desc);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  parent_id uuid references public.post_comments(id) on delete cascade,
  status text not null default 'VISIBLE' check (status in ('VISIBLE','HIDDEN','REMOVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments(post_id, status, created_at asc);
create index if not exists post_comments_author_idx on public.post_comments(author_id, created_at desc);

create table if not exists public.saved_posts (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists saved_posts_user_idx on public.saved_posts(user_id, created_at desc);

alter table public.post_reactions enable row level security;
alter table public.post_comments enable row level security;
alter table public.saved_posts enable row level security;

drop policy if exists post_reactions_read on public.post_reactions;
create policy post_reactions_read on public.post_reactions for select to anon, authenticated
using (exists (select 1 from public.posts p where p.id=post_reactions.post_id and p.status='PUBLISHED' and (p.visibility='PUBLIC' or p.author_id=(select auth.uid()) or (p.visibility='FOLLOWERS' and exists (select 1 from public.follows f where f.follower_id=(select auth.uid()) and ((p.business_id is null and f.followed_user_id=p.author_id) or f.business_id=p.business_id))))));

drop policy if exists post_reactions_write on public.post_reactions;
create policy post_reactions_write on public.post_reactions for all to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id and exists (select 1 from public.posts p where p.id=post_reactions.post_id and p.status='PUBLISHED'));

drop policy if exists post_comments_read on public.post_comments;
create policy post_comments_read on public.post_comments for select to anon, authenticated
using (status='VISIBLE' and exists (select 1 from public.posts p where p.id=post_comments.post_id and p.status='PUBLISHED' and (p.visibility='PUBLIC' or p.author_id=(select auth.uid()) or (p.visibility='FOLLOWERS' and exists (select 1 from public.follows f where f.follower_id=(select auth.uid()) and ((p.business_id is null and f.followed_user_id=p.author_id) or f.business_id=p.business_id))))));

drop policy if exists post_comments_insert on public.post_comments;
create policy post_comments_insert on public.post_comments for insert to authenticated
with check ((select auth.uid())=author_id and exists (select 1 from public.posts p where p.id=post_comments.post_id and p.status='PUBLISHED' and p.comments_enabled=true));

drop policy if exists post_comments_update on public.post_comments;
create policy post_comments_update on public.post_comments for update to authenticated
using ((select auth.uid())=author_id or exists (select 1 from public.posts p where p.id=post_comments.post_id and p.author_id=(select auth.uid())) or public.is_admin())
with check ((select auth.uid())=author_id or exists (select 1 from public.posts p where p.id=post_comments.post_id and p.author_id=(select auth.uid())) or public.is_admin());

drop policy if exists saved_posts_owner on public.saved_posts;
create policy saved_posts_owner on public.saved_posts for all to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

grant select on public.post_reactions to anon, authenticated;
grant insert, update, delete on public.post_reactions to authenticated;
grant select on public.post_comments to anon, authenticated;
grant insert, update on public.post_comments to authenticated;
grant select, insert, delete on public.saved_posts to authenticated;
