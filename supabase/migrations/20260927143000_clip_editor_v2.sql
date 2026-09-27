-- Everest Studio v2: persisted non-destructive clip edits.
-- Keeps original media intact while playback honours trim, speed, frame, filters/effects,
-- overlays and audio-mix metadata. Additive and owner-authorized.

alter table public.posts
  add column if not exists edit_manifest jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.posts add constraint posts_edit_manifest_object_check
    check (jsonb_typeof(edit_manifest)='object' and octet_length(edit_manifest::text)<=12000);
exception when duplicate_object then null; end $$;

create or replace function public.set_clip_edit_manifest(p_post_id uuid,p_edit_manifest jsonb)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare payload jsonb:=coalesce(p_edit_manifest,'{}'::jsonb);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>12000 then
    raise exception 'Invalid clip edit data';
  end if;
  if exists(
    select 1 from jsonb_object_keys(payload) k
    where k not in (
      'trimStartMs','trimEndMs','speed','fit','filter','effect','mirror','text',
      'originalVolume','musicVolume','musicStartMs'
    )
  ) then raise exception 'Unsupported clip edit field'; end if;
  update public.posts p
  set edit_manifest=payload,updated_at=now()
  where p.id=p_post_id and p.author_id=auth.uid() and p.content_format='CLIP';
  if not found then raise exception 'Clip unavailable'; end if;
  return true;
end
$$;
revoke all on function public.set_clip_edit_manifest(uuid,jsonb) from public,anon;
grant execute on function public.set_clip_edit_manifest(uuid,jsonb) to authenticated;

-- Return edit manifests through the guarded clip discovery RPC so clients do not
-- need an extra direct posts query.
drop function if exists public.list_discovery_clips(integer,integer,text);
create function public.list_discovery_clips(
 p_limit integer default 20,p_offset integer default 0,p_locality text default null
) returns table(
 id uuid,author_id uuid,business_id uuid,caption text,post_type text,visibility text,
 service_id uuid,product_id uuid,location_label text,status text,comments_enabled boolean,
 created_at timestamptz,updated_at timestamptz,music_track_id uuid,music_start_ms integer,
 music_volume numeric,original_volume numeric,cover_storage_path text,edit_manifest jsonb,feed_score numeric
)
language sql
stable
security definer
set search_path=''
as $$
 select p.id,p.author_id,p.business_id,p.caption,p.post_type,p.visibility,p.service_id,p.product_id,
        p.location_label,p.status,p.comments_enabled,p.created_at,p.updated_at,p.music_track_id,
        p.music_start_ms,p.music_volume,p.original_volume,p.cover_storage_path,p.edit_manifest,
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

notify pgrst,'reload schema';
