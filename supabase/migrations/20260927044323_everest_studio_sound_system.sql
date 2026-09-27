-- Everest Studio Sound System: licensed music, user uploads, voiceovers and photo sound duration.
-- Additive, non-destructive and compatible with the existing music_tracks/post music columns.

create table if not exists public.audio_assets(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  source_type text not null check(source_type in ('LICENSED_MUSIC','USER_UPLOAD','VOICEOVER')),
  title text not null check(length(trim(title)) between 1 and 120),
  artist text,
  storage_bucket text not null check(storage_bucket in ('everest-music','user-audio')),
  storage_path text not null,
  duration_ms integer check(duration_ms is null or duration_ms between 100 and 900000),
  mime_type text,
  music_track_id uuid references public.music_tracks(id) on delete cascade,
  rights_status text not null check(rights_status in ('PLATFORM_LICENSED','USER_ASSERTED')),
  rights_confirmed_at timestamptz,
  reusable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(storage_bucket,storage_path),
  check(
    (source_type='LICENSED_MUSIC' and owner_id is null and music_track_id is not null and storage_bucket='everest-music' and rights_status='PLATFORM_LICENSED')
    or
    (source_type in ('USER_UPLOAD','VOICEOVER') and owner_id is not null and music_track_id is null and storage_bucket='user-audio' and rights_status='USER_ASSERTED')
  )
);
create unique index if not exists audio_assets_music_track_unique
  on public.audio_assets(music_track_id) where music_track_id is not null;
create index if not exists audio_assets_owner_created_idx on public.audio_assets(owner_id,created_at desc);
create index if not exists audio_assets_reusable_idx on public.audio_assets(reusable,created_at desc) where reusable;

create table if not exists public.post_audio_tracks(
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  audio_asset_id uuid not null references public.audio_assets(id) on delete cascade,
  track_type text not null check(track_type in ('MUSIC','UPLOADED','VOICEOVER')),
  start_ms integer not null default 0 check(start_ms between 0 and 900000),
  end_ms integer check(end_ms is null or end_ms between 100 and 900000),
  timeline_offset_ms integer not null default 0 check(timeline_offset_ms between 0 and 900000),
  volume numeric(4,3) not null default 1 check(volume between 0 and 1),
  fade_in_ms integer not null default 0 check(fade_in_ms between 0 and 30000),
  fade_out_ms integer not null default 0 check(fade_out_ms between 0 and 30000),
  muted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(post_id,track_type),
  check(end_ms is null or end_ms>start_ms)
);
create index if not exists post_audio_tracks_post_idx on public.post_audio_tracks(post_id);
create index if not exists post_audio_tracks_asset_idx on public.post_audio_tracks(audio_asset_id);

alter table public.posts add column if not exists photo_duration_ms integer;
do $$ begin
  alter table public.posts add constraint posts_photo_duration_check
    check(photo_duration_ms is null or photo_duration_ms in (5000,10000,15000,30000));
exception when duplicate_object then null; end $$;

alter table public.audio_assets enable row level security;
alter table public.post_audio_tracks enable row level security;

revoke all on public.audio_assets from anon,authenticated;
revoke all on public.post_audio_tracks from anon,authenticated;
grant select on public.audio_assets to anon,authenticated;
grant select on public.post_audio_tracks to anon,authenticated;

drop policy if exists audio_assets_read on public.audio_assets;
create policy audio_assets_read on public.audio_assets
for select to anon,authenticated
using(
  owner_id=(select auth.uid())
  or public.is_admin()
  or (
    source_type='LICENSED_MUSIC'
    and exists(
      select 1 from public.music_tracks m
      where m.id=audio_assets.music_track_id
        and m.active
        and (m.rights_start_at is null or m.rights_start_at<=now())
        and (m.rights_end_at is null or m.rights_end_at>now())
    )
  )
  or exists(
    select 1
    from public.post_audio_tracks pat
    join public.posts p on p.id=pat.post_id
    where pat.audio_asset_id=audio_assets.id
  )
);

drop policy if exists post_audio_tracks_read on public.post_audio_tracks;
create policy post_audio_tracks_read on public.post_audio_tracks
for select to anon,authenticated
using(exists(select 1 from public.posts p where p.id=post_audio_tracks.post_id));

create or replace function public.ensure_licensed_audio_asset(p_music_track_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=(select auth.uid()); aid uuid; m public.music_tracks;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into m from public.music_tracks
  where id=p_music_track_id and active
    and (rights_start_at is null or rights_start_at<=now())
    and (rights_end_at is null or rights_end_at>now());
  if not found then raise exception 'Music track unavailable'; end if;

  insert into public.audio_assets(
    owner_id,source_type,title,artist,storage_bucket,storage_path,duration_ms,mime_type,
    music_track_id,rights_status,reusable,rights_confirmed_at
  ) values(
    null,'LICENSED_MUSIC',m.title,m.artist,'everest-music',m.storage_path,m.duration_ms,null,
    m.id,'PLATFORM_LICENSED',true,now()
  )
  on conflict(music_track_id) where music_track_id is not null
  do update set
    title=excluded.title,artist=excluded.artist,storage_path=excluded.storage_path,
    duration_ms=excluded.duration_ms,updated_at=now()
  returning id into aid;
  return aid;
end
$$;
revoke all on function public.ensure_licensed_audio_asset(uuid) from public,anon;
grant execute on function public.ensure_licensed_audio_asset(uuid) to authenticated;

create or replace function public.register_user_audio(
  p_source_type text,p_title text,p_storage_path text,p_duration_ms integer default null,
  p_mime_type text default null,p_reusable boolean default false,p_rights_confirmed boolean default false
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=(select auth.uid()); aid uuid; clean_title text:=nullif(trim(coalesce(p_title,'')),'');
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_source_type not in ('USER_UPLOAD','VOICEOVER') then raise exception 'Invalid audio source'; end if;
  if clean_title is null or length(clean_title)>120 then raise exception 'Invalid sound title'; end if;
  if p_storage_path is null or split_part(p_storage_path,'/',1)<>uid::text then raise exception 'Invalid audio path'; end if;
  if p_duration_ms is not null and (p_duration_ms<100 or p_duration_ms>900000) then raise exception 'Invalid audio duration'; end if;
  if p_source_type='USER_UPLOAD' and not coalesce(p_rights_confirmed,false) then raise exception 'Audio rights confirmation required'; end if;

  insert into public.audio_assets(
    owner_id,source_type,title,artist,storage_bucket,storage_path,duration_ms,mime_type,
    rights_status,rights_confirmed_at,reusable
  ) values(
    uid,p_source_type,clean_title,null,'user-audio',p_storage_path,p_duration_ms,nullif(trim(coalesce(p_mime_type,'')),''),
    'USER_ASSERTED',now(),coalesce(p_reusable,false)
  ) returning id into aid;
  return aid;
end
$$;
revoke all on function public.register_user_audio(text,text,text,integer,text,boolean,boolean) from public,anon;
grant execute on function public.register_user_audio(text,text,text,integer,text,boolean,boolean) to authenticated;

create or replace function public.attach_post_audio_track(
  p_post_id uuid,p_audio_asset_id uuid,p_track_type text,
  p_start_ms integer default 0,p_end_ms integer default null,p_timeline_offset_ms integer default 0,
  p_volume numeric default 1,p_fade_in_ms integer default 0,p_fade_out_ms integer default 0,p_muted boolean default false
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=(select auth.uid()); aid public.audio_assets; tid uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_track_type not in ('MUSIC','UPLOADED','VOICEOVER') then raise exception 'Invalid audio track type'; end if;
  if not exists(select 1 from public.posts p where p.id=p_post_id and p.author_id=uid and p.status<>'REMOVED') then raise exception 'Post unavailable'; end if;
  select * into aid from public.audio_assets where id=p_audio_asset_id;
  if not found then raise exception 'Sound unavailable'; end if;
  if aid.source_type<>'LICENSED_MUSIC' and aid.owner_id<>uid then raise exception 'Not authorized to use this sound'; end if;
  if aid.source_type='LICENSED_MUSIC' and p_track_type<>'MUSIC' then raise exception 'Invalid track type'; end if;
  if aid.source_type='USER_UPLOAD' and p_track_type<>'UPLOADED' then raise exception 'Invalid track type'; end if;
  if aid.source_type='VOICEOVER' and p_track_type<>'VOICEOVER' then raise exception 'Invalid track type'; end if;

  insert into public.post_audio_tracks(
    post_id,audio_asset_id,track_type,start_ms,end_ms,timeline_offset_ms,volume,fade_in_ms,fade_out_ms,muted
  ) values(
    p_post_id,p_audio_asset_id,p_track_type,
    greatest(0,least(coalesce(p_start_ms,0),900000)),
    case when p_end_ms is null then null else greatest(100,least(p_end_ms,900000)) end,
    greatest(0,least(coalesce(p_timeline_offset_ms,0),900000)),
    greatest(0,least(coalesce(p_volume,1),1)),
    greatest(0,least(coalesce(p_fade_in_ms,0),30000)),
    greatest(0,least(coalesce(p_fade_out_ms,0),30000)),
    coalesce(p_muted,false)
  )
  on conflict(post_id,track_type) do update set
    audio_asset_id=excluded.audio_asset_id,start_ms=excluded.start_ms,end_ms=excluded.end_ms,
    timeline_offset_ms=excluded.timeline_offset_ms,volume=excluded.volume,
    fade_in_ms=excluded.fade_in_ms,fade_out_ms=excluded.fade_out_ms,muted=excluded.muted,updated_at=now()
  returning id into tid;
  return tid;
end
$$;
revoke all on function public.attach_post_audio_track(uuid,uuid,text,integer,integer,integer,numeric,integer,integer,boolean) from public,anon;
grant execute on function public.attach_post_audio_track(uuid,uuid,text,integer,integer,integer,numeric,integer,integer,boolean) to authenticated;

create or replace function public.remove_post_audio_track(p_post_id uuid,p_track_type text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=(select auth.uid());
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.posts p where p.id=p_post_id and p.author_id=uid) then raise exception 'Not authorized'; end if;
  delete from public.post_audio_tracks where post_id=p_post_id and track_type=p_track_type;
  return true;
end
$$;
revoke all on function public.remove_post_audio_track(uuid,text) from public,anon;
grant execute on function public.remove_post_audio_track(uuid,text) to authenticated;

create or replace function public.set_photo_post_duration(p_post_id uuid,p_duration_ms integer)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=(select auth.uid());
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_duration_ms not in (5000,10000,15000,30000) then raise exception 'Invalid photo duration'; end if;
  update public.posts p
  set photo_duration_ms=p_duration_ms,updated_at=now()
  where p.id=p_post_id and p.author_id=uid and p.content_format='POST'
    and exists(select 1 from public.post_media pm where pm.post_id=p.id and pm.media_type='IMAGE');
  if not found then raise exception 'Photo post unavailable'; end if;
  return true;
end
$$;
revoke all on function public.set_photo_post_duration(uuid,integer) from public,anon;
grant execute on function public.set_photo_post_duration(uuid,integer) to authenticated;

create or replace function public.set_audio_asset_reusable(p_audio_asset_id uuid,p_reusable boolean)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=(select auth.uid());
begin
  if uid is null then raise exception 'Authentication required'; end if;
  update public.audio_assets
  set reusable=coalesce(p_reusable,false),updated_at=now()
  where id=p_audio_asset_id and owner_id=uid and source_type in ('USER_UPLOAD','VOICEOVER');
  if not found then raise exception 'Sound unavailable'; end if;
  return true;
end
$$;
revoke all on function public.set_audio_asset_reusable(uuid,boolean) from public,anon;
grant execute on function public.set_audio_asset_reusable(uuid,boolean) to authenticated;

-- Private object storage. Public playback is still governed by the owning post's RLS.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'user-audio','user-audio',false,31457280,
  array['audio/mpeg','audio/mp4','audio/x-m4a','audio/aac','audio/wav','audio/webm']
)
on conflict(id) do update set
  public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists user_audio_owner_insert on storage.objects;
create policy user_audio_owner_insert on storage.objects
for insert to authenticated
with check(bucket_id='user-audio' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists user_audio_visible_select on storage.objects;
create policy user_audio_visible_select on storage.objects
for select to anon,authenticated
using(
  bucket_id='user-audio'
  and exists(
    select 1 from public.audio_assets a
    where a.storage_bucket='user-audio' and a.storage_path=name
      and (
        a.owner_id=(select auth.uid())
        or public.is_admin()
        or exists(
          select 1
          from public.post_audio_tracks pat
          join public.posts p on p.id=pat.post_id
          where pat.audio_asset_id=a.id
        )
      )
  )
);

drop policy if exists user_audio_owner_update on storage.objects;
create policy user_audio_owner_update on storage.objects
for update to authenticated
using(bucket_id='user-audio' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check(bucket_id='user-audio' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists user_audio_owner_delete on storage.objects;
create policy user_audio_owner_delete on storage.objects
for delete to authenticated
using(bucket_id='user-audio' and (storage.foldername(name))[1]=(select auth.uid())::text);

notify pgrst,'reload schema';
