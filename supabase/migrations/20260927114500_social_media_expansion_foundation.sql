-- Everest Local social expansion foundation: Clips, Stories, Highlights, Everest Music, websites.
-- Additive and backward-compatible with the existing social/feed architecture.

-- ------------------------------------------------------------
-- Profile/business websites
-- ------------------------------------------------------------
alter table public.profiles add column if not exists website_url text;
alter table public.public_profiles add column if not exists website_url text;
alter table public.businesses add column if not exists website_url text;

do $$ begin
  alter table public.profiles add constraint profiles_website_url_safe
    check (website_url is null or (length(website_url)<=500 and website_url ~ '^https://[^[:space:]]+$'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.public_profiles add constraint public_profiles_website_url_safe
    check (website_url is null or (length(website_url)<=500 and website_url ~ '^https://[^[:space:]]+$'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.businesses add constraint businesses_website_url_safe
    check (website_url is null or (length(website_url)<=500 and website_url ~ '^https://[^[:space:]]+$'));
exception when duplicate_object then null; end $$;

create or replace function public.normalize_public_website(p_value text)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare value text:=nullif(trim(coalesce(p_value,'')),'');
begin
  if value is null then return null; end if;
  if value ~* '^(javascript|data|file|vbscript):' then raise exception 'Unsafe website URL'; end if;
  if value !~* '^https?://' then value:='https://'||value; end if;
  if value !~* '^https://[^[:space:]]+$' then raise exception 'Website must use HTTPS'; end if;
  if length(value)>500 then raise exception 'Website URL is too long'; end if;
  return value;
end
$$;
revoke all on function public.normalize_public_website(text) from public,anon,authenticated;

create or replace function public.set_my_profile_website(p_website_url text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=auth.uid(); clean_url text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  clean_url:=public.normalize_public_website(p_website_url);
  update public.profiles set website_url=clean_url,updated_at=now() where id=uid;
  update public.public_profiles set website_url=clean_url,updated_at=now() where id=uid;
  return true;
end
$$;
revoke all on function public.set_my_profile_website(text) from public,anon;
grant execute on function public.set_my_profile_website(text) to authenticated;

create or replace function public.set_business_website(p_business_id uuid,p_website_url text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare clean_url text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (public.is_business_member(p_business_id) or public.is_admin()) then raise exception 'Not authorized'; end if;
  clean_url:=public.normalize_public_website(p_website_url);
  update public.businesses set website_url=clean_url,updated_at=now() where id=p_business_id;
  if not found then raise exception 'Business not found'; end if;
  return true;
end
$$;
revoke all on function public.set_business_website(uuid,text) from public,anon;
grant execute on function public.set_business_website(uuid,text) to authenticated;

-- Keep the existing public-profile privacy contract and expose the website only
-- through the same guarded profile RPC.
create or replace function public.get_public_user_profile(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $
declare v jsonb; v_pref public.user_social_preferences; v_count bigint;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if public.users_blocked(auth.uid(),p_user) then return null; end if;
 select * into v_pref from public.user_social_preferences where user_id=p_user;
 if p_user<>auth.uid() and coalesce(v_pref.profile_visibility,'PUBLIC')='PRIVATE' then return null; end if;
 select count(*) into v_count from public.user_connections c where c.user_a=p_user or c.user_b=p_user;
 select jsonb_build_object(
   'id',pp.id,'display_name',pp.display_name,'username',pp.username,'avatar_url',pp.avatar_url,
   'bio',case when coalesce(v_pref.profile_visibility,'PUBLIC')='LIMITED' and p_user<>auth.uid() and not public.users_connected(auth.uid(),p_user) then null else pp.bio end,
   'website_url',case when coalesce(v_pref.profile_visibility,'PUBLIC')='LIMITED' and p_user<>auth.uid() and not public.users_connected(auth.uid(),p_user) then null else pp.website_url end,
   'suburb',case when coalesce(v_pref.show_location,false) and (coalesce(v_pref.profile_visibility,'PUBLIC')<>'LIMITED' or p_user=auth.uid() or public.users_connected(auth.uid(),p_user)) then pp.suburb else null end,
   'joined_at',pp.joined_at,'connection_count',v_count,'mutual_count',public.mutual_connection_count(p_user),
   'connection_state',case when p_user=auth.uid() then 'SELF' else public.get_connection_state(p_user) end
 ) into v from public.public_profiles pp where pp.id=p_user and (pp.visibility='PUBLIC' or pp.id=auth.uid());
 return v;
end
$;
revoke all on function public.get_public_user_profile(uuid) from public,anon;
grant execute on function public.get_public_user_profile(uuid) to authenticated;

-- ------------------------------------------------------------
-- Everest Music catalogue. Licensing/admin metadata is never granted to clients.
-- ------------------------------------------------------------
create table if not exists public.music_tracks(
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(trim(title)) between 1 and 120),
  artist text not null check(length(trim(artist)) between 1 and 120),
  storage_path text not null unique,
  artwork_path text,
  duration_ms integer not null check(duration_ms between 1000 and 900000),
  genre text,
  mood text,
  bpm integer check(bpm is null or bpm between 30 and 260),
  active boolean not null default false,
  license_reference text not null,
  license_notes text,
  rights_start_at timestamptz,
  rights_end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.music_tracks enable row level security;
revoke all on public.music_tracks from anon,authenticated;

drop policy if exists music_tracks_admin_all on public.music_tracks;
create policy music_tracks_admin_all on public.music_tracks
for all to authenticated
using(public.is_admin())
with check(public.is_admin());

create index if not exists music_tracks_active_idx on public.music_tracks(active,created_at desc);

create or replace function public.list_everest_music(p_query text default null,p_limit integer default 40)
returns table(
  id uuid,title text,artist text,storage_path text,artwork_path text,
  duration_ms integer,genre text,mood text
)
language sql
stable
security definer
set search_path=''
as $$
 select m.id,m.title,m.artist,m.storage_path,m.artwork_path,m.duration_ms,m.genre,m.mood
 from public.music_tracks m
 where m.active
   and (m.rights_start_at is null or m.rights_start_at<=now())
   and (m.rights_end_at is null or m.rights_end_at>now())
   and (
     nullif(trim(coalesce(p_query,'')),'') is null
     or m.title ilike '%'||trim(p_query)||'%'
     or m.artist ilike '%'||trim(p_query)||'%'
     or coalesce(m.genre,'') ilike '%'||trim(p_query)||'%'
     or coalesce(m.mood,'') ilike '%'||trim(p_query)||'%'
   )
 order by m.created_at desc
 limit greatest(1,least(coalesce(p_limit,40),80))
$$;
revoke all on function public.list_everest_music(text,integer) from public;
grant execute on function public.list_everest_music(text,integer) to anon,authenticated;

create or replace function public.is_active_music_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
 select exists(
   select 1 from public.music_tracks m
   where (m.storage_path=p_path or m.artwork_path=p_path)
     and m.active
     and (m.rights_start_at is null or m.rights_start_at<=now())
     and (m.rights_end_at is null or m.rights_end_at>now())
 )
$$;
revoke all on function public.is_active_music_path(text) from public;
grant execute on function public.is_active_music_path(text) to anon,authenticated;

-- ------------------------------------------------------------
-- Posts gain format/music metadata. Existing rows remain normal posts.
-- ------------------------------------------------------------
alter table public.posts add column if not exists content_format text not null default 'POST';
alter table public.posts add column if not exists music_track_id uuid references public.music_tracks(id) on delete set null;
alter table public.posts add column if not exists music_start_ms integer not null default 0;
alter table public.posts add column if not exists music_volume numeric(4,3) not null default 0.75;
alter table public.posts add column if not exists original_volume numeric(4,3) not null default 1;
alter table public.posts add column if not exists cover_storage_path text;

do $$ begin
 alter table public.posts add constraint posts_content_format_check check(content_format in ('POST','CLIP'));
exception when duplicate_object then null; end $$;
do $$ begin
 alter table public.posts add constraint posts_music_start_check check(music_start_ms>=0);
exception when duplicate_object then null; end $$;
do $$ begin
 alter table public.posts add constraint posts_music_volume_check check(music_volume between 0 and 1 and original_volume between 0 and 1);
exception when duplicate_object then null; end $$;

alter table public.post_media add column if not exists storage_bucket text not null default 'post-media';
alter table public.post_media add column if not exists duration_ms integer;
alter table public.post_media add column if not exists width integer;
alter table public.post_media add column if not exists height integer;
do $$ begin
 alter table public.post_media add constraint post_media_storage_bucket_check check(storage_bucket in ('post-media','clip-media'));
exception when duplicate_object then null; end $$;

create index if not exists posts_format_created_idx on public.posts(content_format,status,created_at desc);

alter table public.posts drop constraint if exists posts_check;
alter table public.posts add constraint posts_check
  check(caption is not null or service_id is not null or product_id is not null or content_format='CLIP');

create or replace function public.publish_clip(
  p_business_id uuid default null,
  p_caption text default null,
  p_visibility text default 'PUBLIC',
  p_location_label text default null,
  p_service_id uuid default null,
  p_product_id uuid default null,
  p_music_track_id uuid default null,
  p_music_start_ms integer default 0
) returns uuid
language plpgsql
security definer
set search_path=''
as $
declare uid uuid:=auth.uid(); post_id uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_business_id is not null and not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
  if p_visibility not in ('PUBLIC','FOLLOWERS') then raise exception 'Invalid visibility'; end if;
  if p_music_track_id is not null and not exists(
    select 1 from public.music_tracks m
    where m.id=p_music_track_id and m.active
      and (m.rights_start_at is null or m.rights_start_at<=now())
      and (m.rights_end_at is null or m.rights_end_at>now())
  ) then raise exception 'Music track unavailable'; end if;
  insert into public.posts(
    author_id,business_id,caption,post_type,visibility,service_id,product_id,location_label,
    status,content_format,music_track_id,music_start_ms
  ) values(
    uid,p_business_id,nullif(trim(coalesce(p_caption,'')),''),
    case when p_business_id is null then 'UPDATE' else 'COMPLETED_WORK' end,
    case when p_business_id is null then p_visibility else 'PUBLIC' end,
    p_service_id,p_product_id,nullif(trim(coalesce(p_location_label,'')),''),
    'PUBLISHED','CLIP',p_music_track_id,greatest(0,coalesce(p_music_start_ms,0))
  ) returning id into post_id;
  return post_id;
end
$;
revoke all on function public.publish_clip(uuid,text,text,text,uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.publish_clip(uuid,text,text,text,uuid,uuid,uuid,integer) to authenticated;

create or replace function public.set_post_music(
  p_post_id uuid,p_music_track_id uuid,p_music_start_ms integer default 0,
  p_music_volume numeric default 0.75,p_original_volume numeric default 1
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.posts p where p.id=p_post_id and p.author_id=auth.uid()) then raise exception 'Not authorized'; end if;
 if p_music_track_id is not null and not exists(
   select 1 from public.music_tracks m
   where m.id=p_music_track_id and m.active
     and (m.rights_start_at is null or m.rights_start_at<=now())
     and (m.rights_end_at is null or m.rights_end_at>now())
 ) then raise exception 'Music track unavailable'; end if;
 update public.posts
 set music_track_id=p_music_track_id,
     music_start_ms=greatest(0,coalesce(p_music_start_ms,0)),
     music_volume=greatest(0,least(coalesce(p_music_volume,0.75),1)),
     original_volume=greatest(0,least(coalesce(p_original_volume,1),1)),
     updated_at=now()
 where id=p_post_id;
 return true;
end
$$;
revoke all on function public.set_post_music(uuid,uuid,integer,numeric,numeric) from public,anon;
grant execute on function public.set_post_music(uuid,uuid,integer,numeric,numeric) to authenticated;

create or replace function public.list_discovery_clips(
 p_limit integer default 20,p_offset integer default 0,p_locality text default null
) returns table(
 id uuid,author_id uuid,business_id uuid,caption text,post_type text,visibility text,
 service_id uuid,product_id uuid,location_label text,status text,comments_enabled boolean,
 created_at timestamptz,updated_at timestamptz,music_track_id uuid,music_start_ms integer,
 music_volume numeric,original_volume numeric,cover_storage_path text,feed_score numeric
)
language sql
stable
security definer
set search_path=''
as $$
 select p.id,p.author_id,p.business_id,p.caption,p.post_type,p.visibility,p.service_id,p.product_id,
        p.location_label,p.status,p.comments_enabled,p.created_at,p.updated_at,p.music_track_id,
        p.music_start_ms,p.music_volume,p.original_volume,p.cover_storage_path,
        (
          greatest(0,24-greatest(0,extract(epoch from(now()-p.created_at))/3600)/3)
          + case when nullif(trim(coalesce(p_locality,'')),'') is not null
              and lower(coalesce(p.location_label,'')) like '%'||lower(trim(p_locality))||'%' then 24 else 0 end
          + least(30,(select count(*) from public.post_reactions r where r.post_id=p.id)
                       +2*(select count(*) from public.post_comments c where c.post_id=p.id and c.status='VISIBLE'))
        )::numeric as feed_score
 from public.posts p
 where p.content_format='CLIP'
   and p.status='PUBLISHED'
   and p.visibility='PUBLIC'
   and (p.business_id is null or exists(
     select 1 from public.businesses b where b.id=p.business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'
   ))
   and (auth.uid() is null or not exists(
     select 1 from public.user_blocks ub
     where (ub.blocker_id=auth.uid() and ub.blocked_id=p.author_id)
        or (ub.blocked_id=auth.uid() and ub.blocker_id=p.author_id)
   ))
 order by feed_score desc,p.created_at desc
 limit greatest(1,least(coalesce(p_limit,20),50))
 offset greatest(0,coalesce(p_offset,0))
$$;
revoke all on function public.list_discovery_clips(integer,integer,text) from public;
grant execute on function public.list_discovery_clips(integer,integer,text) to anon,authenticated;

-- ------------------------------------------------------------
-- Stories and archive lifecycle
-- ------------------------------------------------------------
create table if not exists public.stories(
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references auth.users(id) on delete cascade,
 business_id uuid references public.businesses(id) on delete cascade,
 caption text,
 visibility text not null default 'PUBLIC' check(visibility in ('PUBLIC','FOLLOWERS')),
 location_label text,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','ARCHIVED','REMOVED')),
 expires_at timestamptz not null default (now()+interval '24 hours'),
 archived_at timestamptz,
 music_track_id uuid references public.music_tracks(id) on delete set null,
 music_start_ms integer not null default 0 check(music_start_ms>=0),
 music_volume numeric(4,3) not null default 0.75 check(music_volume between 0 and 1),
 original_volume numeric(4,3) not null default 1 check(original_volume between 0 and 1),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(caption is null or length(caption)<=1000)
);
create index if not exists stories_active_idx on public.stories(status,expires_at desc,created_at desc);
create index if not exists stories_author_idx on public.stories(author_id,created_at desc);
alter table public.stories enable row level security;
grant select,insert,update,delete on public.stories to authenticated;
grant select on public.stories to anon;

create table if not exists public.story_media(
 id uuid primary key default gen_random_uuid(),
 story_id uuid not null references public.stories(id) on delete cascade,
 media_type text not null check(media_type in ('IMAGE','VIDEO')),
 storage_path text not null,
 duration_ms integer,
 sort_order integer not null default 0 check(sort_order>=0),
 created_at timestamptz not null default now(),
 unique(story_id,storage_path)
);
alter table public.story_media enable row level security;
grant select on public.story_media to anon,authenticated;
grant insert,update,delete on public.story_media to authenticated;

create table if not exists public.story_highlights(
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 business_id uuid references public.businesses(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 40),
 cover_story_id uuid references public.stories(id) on delete set null,
 sort_order integer not null default 0 check(sort_order>=0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists story_highlights_owner_idx on public.story_highlights(owner_id,sort_order,created_at);
alter table public.story_highlights enable row level security;
grant select on public.story_highlights to anon,authenticated;
grant insert,update,delete on public.story_highlights to authenticated;

create table if not exists public.story_highlight_items(
 id uuid primary key default gen_random_uuid(),
 highlight_id uuid not null references public.story_highlights(id) on delete cascade,
 story_id uuid not null references public.stories(id) on delete cascade,
 sort_order integer not null default 0 check(sort_order>=0),
 created_at timestamptz not null default now(),
 unique(highlight_id,story_id)
);
create index if not exists story_highlight_items_idx on public.story_highlight_items(highlight_id,sort_order);
alter table public.story_highlight_items enable row level security;
grant select on public.story_highlight_items to anon,authenticated;
grant insert,update,delete on public.story_highlight_items to authenticated;

create or replace function public.can_view_story(p_story_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
 select exists(
   select 1
   from public.stories s
   where s.id=p_story_id
     and s.status<>'REMOVED'
     and (
       s.author_id=auth.uid()
       or public.is_admin()
       or exists(
         select 1
         from public.story_highlight_items hi
         join public.story_highlights h on h.id=hi.highlight_id
         where hi.story_id=s.id
           and (
             (h.business_id is not null and exists(
               select 1 from public.businesses b
               where b.id=h.business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'
             ))
             or (h.business_id is null and exists(
               select 1 from public.public_profiles pp where pp.id=h.owner_id and pp.visibility='PUBLIC'
             ))
           )
       )
       or (
         s.status='ACTIVE' and s.expires_at>now()
         and not exists(
           select 1 from public.user_blocks ub
           where (ub.blocker_id=auth.uid() and ub.blocked_id=s.author_id)
              or (ub.blocked_id=auth.uid() and ub.blocker_id=s.author_id)
         )
         and (
           (s.visibility='PUBLIC' and (
             s.business_id is null or exists(
               select 1 from public.businesses b
               where b.id=s.business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'
             )
           ))
           or (
             s.visibility='FOLLOWERS' and auth.uid() is not null
             and exists(
               select 1 from public.follows f
               where f.follower_id=auth.uid()
                 and ((s.business_id is null and f.followed_user_id=s.author_id) or f.business_id=s.business_id)
             )
           )
         )
       )
     )
 )
$$;
revoke all on function public.can_view_story(uuid) from public;
grant execute on function public.can_view_story(uuid) to anon,authenticated;

drop policy if exists stories_read on public.stories;
create policy stories_read on public.stories for select to anon,authenticated
using(public.can_view_story(id));
drop policy if exists stories_owner_insert on public.stories;
create policy stories_owner_insert on public.stories for insert to authenticated
with check(author_id=auth.uid() and (business_id is null or public.is_business_member(business_id)));
drop policy if exists stories_owner_update on public.stories;
create policy stories_owner_update on public.stories for update to authenticated
using(author_id=auth.uid() or public.is_admin())
with check(author_id=auth.uid() or public.is_admin());
drop policy if exists stories_owner_delete on public.stories;
create policy stories_owner_delete on public.stories for delete to authenticated
using(author_id=auth.uid() or public.is_admin());

drop policy if exists story_media_read on public.story_media;
create policy story_media_read on public.story_media for select to anon,authenticated
using(public.can_view_story(story_id));
drop policy if exists story_media_owner_insert on public.story_media;
create policy story_media_owner_insert on public.story_media for insert to authenticated
with check(exists(select 1 from public.stories s where s.id=story_id and s.author_id=auth.uid()));
drop policy if exists story_media_owner_update on public.story_media;
create policy story_media_owner_update on public.story_media for update to authenticated
using(exists(select 1 from public.stories s where s.id=story_id and s.author_id=auth.uid()))
with check(exists(select 1 from public.stories s where s.id=story_id and s.author_id=auth.uid()));
drop policy if exists story_media_owner_delete on public.story_media;
create policy story_media_owner_delete on public.story_media for delete to authenticated
using(exists(select 1 from public.stories s where s.id=story_id and s.author_id=auth.uid()));

drop policy if exists story_highlights_read on public.story_highlights;
create policy story_highlights_read on public.story_highlights for select to anon,authenticated
using(
 owner_id=auth.uid() or public.is_admin()
 or (business_id is not null and exists(
   select 1 from public.businesses b where b.id=business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'
 ))
 or (business_id is null and exists(
   select 1 from public.public_profiles pp where pp.id=owner_id and pp.visibility='PUBLIC'
 ))
);
drop policy if exists story_highlights_owner_insert on public.story_highlights;
create policy story_highlights_owner_insert on public.story_highlights for insert to authenticated
with check(owner_id=auth.uid() and (business_id is null or public.is_business_member(business_id)));
drop policy if exists story_highlights_owner_update on public.story_highlights;
create policy story_highlights_owner_update on public.story_highlights for update to authenticated
using(owner_id=auth.uid() or public.is_admin())
with check(owner_id=auth.uid() or public.is_admin());
drop policy if exists story_highlights_owner_delete on public.story_highlights;
create policy story_highlights_owner_delete on public.story_highlights for delete to authenticated
using(owner_id=auth.uid() or public.is_admin());

drop policy if exists story_highlight_items_read on public.story_highlight_items;
create policy story_highlight_items_read on public.story_highlight_items for select to anon,authenticated
using(exists(select 1 from public.story_highlights h where h.id=highlight_id));
drop policy if exists story_highlight_items_owner_insert on public.story_highlight_items;
create policy story_highlight_items_owner_insert on public.story_highlight_items for insert to authenticated
with check(exists(
 select 1 from public.story_highlights h
 join public.stories s on s.id=story_id
 where h.id=highlight_id and h.owner_id=auth.uid() and s.author_id=auth.uid() and s.status<>'REMOVED'
));
drop policy if exists story_highlight_items_owner_update on public.story_highlight_items;
create policy story_highlight_items_owner_update on public.story_highlight_items for update to authenticated
using(exists(select 1 from public.story_highlights h where h.id=highlight_id and h.owner_id=auth.uid()))
with check(exists(select 1 from public.story_highlights h where h.id=highlight_id and h.owner_id=auth.uid()));
drop policy if exists story_highlight_items_owner_delete on public.story_highlight_items;
create policy story_highlight_items_owner_delete on public.story_highlight_items for delete to authenticated
using(exists(select 1 from public.story_highlights h where h.id=highlight_id and h.owner_id=auth.uid()));

create or replace function public.create_story(
 p_business_id uuid default null,p_caption text default null,p_visibility text default 'PUBLIC',
 p_location_label text default null,p_music_track_id uuid default null,p_music_start_ms integer default 0
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=auth.uid(); sid uuid;
begin
 if uid is null then raise exception 'Authentication required'; end if;
 if p_business_id is not null and not public.is_business_member(p_business_id) then raise exception 'Not authorized'; end if;
 if p_visibility not in ('PUBLIC','FOLLOWERS') then raise exception 'Invalid visibility'; end if;
 if p_music_track_id is not null and not exists(
   select 1 from public.music_tracks m where m.id=p_music_track_id and m.active
     and (m.rights_start_at is null or m.rights_start_at<=now())
     and (m.rights_end_at is null or m.rights_end_at>now())
 ) then raise exception 'Music track unavailable'; end if;
 insert into public.stories(author_id,business_id,caption,visibility,location_label,music_track_id,music_start_ms)
 values(uid,p_business_id,nullif(trim(coalesce(p_caption,'')),''),case when p_business_id is null then p_visibility else 'PUBLIC' end,
        nullif(trim(coalesce(p_location_label,'')),''),p_music_track_id,greatest(0,coalesce(p_music_start_ms,0)))
 returning id into sid;
 return sid;
end
$$;
revoke all on function public.create_story(uuid,text,text,text,uuid,integer) from public,anon;
grant execute on function public.create_story(uuid,text,text,text,uuid,integer) to authenticated;

create or replace function public.archive_story(p_story_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 update public.stories
 set status='ARCHIVED',archived_at=coalesce(archived_at,now()),updated_at=now()
 where id=p_story_id and author_id=auth.uid() and status<>'REMOVED';
 if not found then raise exception 'Story unavailable'; end if;
 return true;
end
$$;
revoke all on function public.archive_story(uuid) from public,anon;
grant execute on function public.archive_story(uuid) to authenticated;

create or replace function public.list_my_story_archive(p_limit integer default 80)
returns table(
 id uuid,business_id uuid,caption text,location_label text,status text,expires_at timestamptz,
 music_track_id uuid,created_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
 select s.id,s.business_id,s.caption,s.location_label,
        case when s.status='ACTIVE' and s.expires_at<=now() then 'ARCHIVED' else s.status end,
        s.expires_at,s.music_track_id,s.created_at
 from public.stories s
 where s.author_id=auth.uid()
   and s.status<>'REMOVED'
   and (s.status='ARCHIVED' or s.expires_at<=now())
 order by s.created_at desc
 limit greatest(1,least(coalesce(p_limit,80),150))
$$;
revoke all on function public.list_my_story_archive(integer) from public,anon;
grant execute on function public.list_my_story_archive(integer) to authenticated;

-- ------------------------------------------------------------
-- Storage buckets and policies
-- ------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
 ('clip-media','clip-media',false,209715200,array['video/mp4','video/quicktime','video/webm']),
 ('story-media','story-media',false,104857600,array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm']),
 ('everest-music','everest-music',false,31457280,array['audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/wav'])
on conflict(id) do update set
 public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists clip_media_owner_insert on storage.objects;
create policy clip_media_owner_insert on storage.objects for insert to authenticated
with check(
 bucket_id='clip-media'
 and (storage.foldername(name))[1]=auth.uid()::text
 and exists(
  select 1 from public.posts p
  where p.id=((storage.foldername(name))[2])::uuid and p.author_id=auth.uid() and p.content_format='CLIP'
 )
);
drop policy if exists clip_media_visible_select on storage.objects;
create policy clip_media_visible_select on storage.objects for select to anon,authenticated
using(
 bucket_id='clip-media'
 and exists(
  select 1 from public.posts p
  where p.id=((storage.foldername(name))[2])::uuid
    and (
      p.author_id=auth.uid() or public.is_admin()
      or (
        p.status='PUBLISHED' and p.visibility='PUBLIC'
        and (p.business_id is null or exists(
          select 1 from public.businesses b where b.id=p.business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'
        ))
        and not exists(
          select 1 from public.user_blocks ub
          where (ub.blocker_id=auth.uid() and ub.blocked_id=p.author_id)
             or (ub.blocked_id=auth.uid() and ub.blocker_id=p.author_id)
        )
      )
    )
 )
);
drop policy if exists clip_media_owner_update on storage.objects;
create policy clip_media_owner_update on storage.objects for update to authenticated
using(bucket_id='clip-media' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='clip-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists clip_media_owner_delete on storage.objects;
create policy clip_media_owner_delete on storage.objects for delete to authenticated
using(bucket_id='clip-media' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists story_media_owner_insert on storage.objects;
create policy story_media_owner_insert on storage.objects for insert to authenticated
with check(
 bucket_id='story-media'
 and (storage.foldername(name))[1]=auth.uid()::text
 and exists(
   select 1 from public.stories s
   where s.id=((storage.foldername(name))[2])::uuid and s.author_id=auth.uid()
 )
);
drop policy if exists story_media_visible_select on storage.objects;
create policy story_media_visible_select on storage.objects for select to anon,authenticated
using(
 bucket_id='story-media'
 and public.can_view_story(((storage.foldername(name))[2])::uuid)
);
drop policy if exists story_media_owner_update on storage.objects;
create policy story_media_owner_update on storage.objects for update to authenticated
using(bucket_id='story-media' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='story-media' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists story_media_owner_delete on storage.objects;
create policy story_media_owner_delete on storage.objects for delete to authenticated
using(bucket_id='story-media' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists everest_music_active_select on storage.objects;
create policy everest_music_active_select on storage.objects for select to anon,authenticated
using(bucket_id='everest-music' and public.is_active_music_path(name));
drop policy if exists everest_music_admin_insert on storage.objects;
create policy everest_music_admin_insert on storage.objects for insert to authenticated
with check(bucket_id='everest-music' and public.is_admin());
drop policy if exists everest_music_admin_update on storage.objects;
create policy everest_music_admin_update on storage.objects for update to authenticated
using(bucket_id='everest-music' and public.is_admin())
with check(bucket_id='everest-music' and public.is_admin());
drop policy if exists everest_music_admin_delete on storage.objects;
create policy everest_music_admin_delete on storage.objects for delete to authenticated
using(bucket_id='everest-music' and public.is_admin());

notify pgrst,'reload schema';
