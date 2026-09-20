-- Social discovery foundation: real follows, public profiles, and marketplace-linked posts.
-- No seed/fake content is created.

alter table public.profiles
  add column if not exists bio text;

create table if not exists public.public_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  visibility text not null default 'PUBLIC'
    check (visibility in ('PUBLIC','PRIVATE')),
  updated_at timestamptz not null default now()
);

create index if not exists public_profiles_visibility_idx
  on public.public_profiles(visibility, updated_at desc);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_user_id uuid references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (followed_user_id is not null and business_id is null)
    or
    (followed_user_id is null and business_id is not null)
  ),
  check (followed_user_id is null or followed_user_id <> follower_id)
);

create unique index if not exists follows_user_unique_idx
  on public.follows(follower_id, followed_user_id)
  where followed_user_id is not null;

create unique index if not exists follows_business_unique_idx
  on public.follows(follower_id, business_id)
  where business_id is not null;

create index if not exists follows_followed_user_idx
  on public.follows(followed_user_id, created_at desc)
  where followed_user_id is not null;

create index if not exists follows_business_idx
  on public.follows(business_id, created_at desc)
  where business_id is not null;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  caption text,
  post_type text not null default 'UPDATE'
    check (post_type in ('UPDATE','COMPLETED_WORK','BEFORE_AFTER','PROMOTION','ANNOUNCEMENT','OFFER','AVAILABILITY','TIP','QUESTION','RECOMMENDATION','EXPERIENCE')),
  visibility text not null default 'PUBLIC'
    check (visibility in ('PUBLIC','FOLLOWERS')),
  service_id uuid references public.services(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  status text not null default 'PUBLISHED'
    check (status in ('DRAFT','PUBLISHED','HIDDEN','REMOVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (caption is not null or service_id is not null or product_id is not null),
  check (
    business_id is null
    or exists (
      select 1
      from public.services s
      where s.id = service_id
        and s.business_id = posts.business_id
    )
    or service_id is null
  ),
  check (
    business_id is null
    or exists (
      select 1
      from public.products p
      where p.id = product_id
        and p.business_id = posts.business_id
    )
    or product_id is null
  )
);

create index if not exists posts_public_feed_idx
  on public.posts(status, visibility, created_at desc);

create index if not exists posts_business_feed_idx
  on public.posts(business_id, status, created_at desc);

create index if not exists posts_author_feed_idx
  on public.posts(author_id, status, created_at desc);

create index if not exists posts_service_idx
  on public.posts(service_id, created_at desc)
  where service_id is not null;

create index if not exists posts_product_idx
  on public.posts(product_id, created_at desc)
  where product_id is not null;

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  media_type text not null check (media_type in ('IMAGE','VIDEO')),
  storage_path text not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique(post_id, storage_path)
);

create index if not exists post_media_post_idx
  on public.post_media(post_id, sort_order, created_at);

alter table public.public_profiles enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;

drop policy if exists public_profiles_self on public.public_profiles;
create policy public_profiles_self
  on public.public_profiles
  for all
  to authenticated
  using ((select auth.uid()) = id or public.is_admin())
  with check ((select auth.uid()) = id or public.is_admin());

drop policy if exists follows_owner_access on public.follows;
create policy follows_owner_access
  on public.follows
  for all
  to authenticated
  using ((select auth.uid()) = follower_id or (select auth.uid()) = followed_user_id or public.is_admin())
  with check ((select auth.uid()) = follower_id or public.is_admin());

drop policy if exists posts_public_read on public.posts;
create policy posts_public_read
  on public.posts
  for select
  to anon, authenticated
  using (
    status = 'PUBLISHED'
    and visibility = 'PUBLIC'
    and (
      business_id is null
      or exists (
        select 1
        from public.businesses b
        where b.id = posts.business_id
          and b.status = 'ACTIVE'
          and b.verification_status = 'VERIFIED'
      )
    )
  );

drop policy if exists posts_owner_read on public.posts;
create policy posts_owner_read
  on public.posts
  for select
  to authenticated
  using (
    author_id = (select auth.uid())
    or public.is_admin()
    or (
      status = 'PUBLISHED'
      and visibility = 'FOLLOWERS'
      and (
        exists (
          select 1
          from public.follows f
          where f.follower_id = (select auth.uid())
            and (
              (f.followed_user_id = posts.author_id and posts.business_id is null)
              or f.business_id = posts.business_id
            )
        )
      )
    )
  );

drop policy if exists posts_author_insert on public.posts;
create policy posts_author_insert
  on public.posts
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      business_id is null
      or public.is_business_member(business_id)
    )
  );

drop policy if exists posts_author_update on public.posts;
create policy posts_author_update
  on public.posts
  for update
  to authenticated
  using (
    author_id = (select auth.uid()) and (
      business_id is null
      or public.is_business_member(business_id)
    )
    or public.is_admin()
  )
  with check (
    author_id = (select auth.uid()) and (
      business_id is null
      or public.is_business_member(business_id)
    )
    or public.is_admin()
  );

drop policy if exists posts_author_delete on public.posts;
create policy posts_author_delete
  on public.posts
  for delete
  to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

drop policy if exists post_media_public_read on public.post_media;
create policy post_media_public_read
  on public.post_media
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_media.post_id
        and p.status = 'PUBLISHED'
        and p.visibility = 'PUBLIC'
    )
  );

drop policy if exists post_media_author_write on public.post_media;
create policy post_media_author_write
  on public.post_media
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_media.post_id
        and (p.author_id = (select auth.uid()) or public.is_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.posts p
      where p.id = post_media.post_id
        and (p.author_id = (select auth.uid()) or public.is_admin())
    )
  );

create or replace function public.sync_public_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.public_profiles(id, display_name, avatar_url, bio, updated_at)
  values (
    new.id,
    nullif(new.full_name, ''),
    new.avatar_url,
    new.bio,
    now()
  )
  on conflict (id) do update
  set display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      bio = excluded.bio,
      updated_at = now();
  return new;
end;
$$;

revoke execute on function public.sync_public_profile() from public, anon, authenticated;

drop trigger if exists sync_public_profile_trigger on public.profiles;
create trigger sync_public_profile_trigger
after insert or update of full_name, avatar_url, bio
on public.profiles
for each row execute function public.sync_public_profile();

insert into public.public_profiles(id, display_name, avatar_url, bio)
select p.id, nullif(p.full_name, ''), p.avatar_url, p.bio
from public.profiles p
on conflict (id) do update
set display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    bio = excluded.bio,
    updated_at = now();

create or replace function public.get_follow_counts(p_business_id uuid default null, p_user_id uuid default null)
returns table(follower_count bigint, following_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((
      select count(*)
      from public.follows f
      where (p_business_id is not null and f.business_id = p_business_id)
         or (p_user_id is not null and f.followed_user_id = p_user_id)
    ), 0)::bigint,
    coalesce((
      select count(*)
      from public.follows f
      where (p_user_id is not null and f.follower_id = p_user_id)
         or (p_business_id is not null and f.follower_id = (select b.owner_id from public.businesses b where b.id = p_business_id))
    ), 0)::bigint;
$$;

revoke all on function public.get_follow_counts(uuid, uuid) from public;
grant execute on function public.get_follow_counts(uuid, uuid) to anon, authenticated;

create or replace function public.is_following(p_business_id uuid default null, p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.follows f
    where f.follower_id = (select auth.uid())
      and (
        (p_business_id is not null and f.business_id = p_business_id)
        or (p_user_id is not null and f.followed_user_id = p_user_id)
      )
  );
$$;

revoke all on function public.is_following(uuid, uuid) from public;
grant execute on function public.is_following(uuid, uuid) to authenticated;

create or replace function public.follow_business(p_business_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.businesses b
    where b.id = p_business_id
      and b.status = 'ACTIVE'
      and b.verification_status = 'VERIFIED'
  ) then
    raise exception 'Business is not available for following';
  end if;

  insert into public.follows(follower_id, business_id)
  values ((select auth.uid()), p_business_id)
  on conflict do nothing;

  return true;
end;
$$;

create or replace function public.unfollow_business(p_business_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  delete from public.follows
  where follower_id = (select auth.uid())
    and business_id = p_business_id;
  select true;
$$;

create or replace function public.follow_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'You cannot follow yourself';
  end if;

  if not exists (
    select 1 from public.public_profiles pp
    where pp.id = p_user_id and pp.visibility = 'PUBLIC'
  ) then
    raise exception 'Profile is not available for following';
  end if;

  insert into public.follows(follower_id, followed_user_id)
  values ((select auth.uid()), p_user_id)
  on conflict do nothing;

  return true;
end;
$$;

create or replace function public.unfollow_user(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  delete from public.follows
  where follower_id = (select auth.uid())
    and followed_user_id = p_user_id;
  select true;
$$;

revoke all on function public.follow_business(uuid) from public;
grant execute on function public.follow_business(uuid) to authenticated;
revoke all on function public.unfollow_business(uuid) from public;
grant execute on function public.unfollow_business(uuid) to authenticated;
revoke all on function public.follow_user(uuid) from public;
grant execute on function public.follow_user(uuid) to authenticated;
revoke all on function public.unfollow_user(uuid) from public;
grant execute on function public.unfollow_user(uuid) to authenticated;

grant select on public.public_profiles to anon, authenticated;
grant select, insert, update, delete on public.follows to authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select on public.posts to anon;
grant select, insert, update, delete on public.post_media to authenticated;
grant select on public.post_media to anon;

