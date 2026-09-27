-- Allow explicitly reusable user sounds to be used from a public published source post.
-- Keeps private/unpublished user audio owner-only.

create or replace function public.attach_post_audio_track(
  p_post_id uuid,p_audio_asset_id uuid,p_track_type text,
  p_start_ms integer default 0,p_end_ms integer default null,p_timeline_offset_ms integer default 0,
  p_volume numeric default 1,p_fade_in_ms integer default 0,p_fade_out_ms integer default 0,p_muted boolean default false
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=(select auth.uid()); aid public.audio_assets; tid uuid; can_reuse boolean:=false;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_track_type not in ('MUSIC','UPLOADED','VOICEOVER') then raise exception 'Invalid audio track type'; end if;
  if not exists(select 1 from public.posts p where p.id=p_post_id and p.author_id=uid and p.status<>'REMOVED') then raise exception 'Post unavailable'; end if;

  select * into aid from public.audio_assets where id=p_audio_asset_id;
  if not found then raise exception 'Sound unavailable'; end if;

  if aid.source_type<>'LICENSED_MUSIC' and aid.owner_id<>uid then
    select aid.reusable and exists(
      select 1
      from public.post_audio_tracks source_track
      join public.posts source_post on source_post.id=source_track.post_id
      where source_track.audio_asset_id=aid.id
        and source_post.status='PUBLISHED'
        and source_post.visibility='PUBLIC'
    ) into can_reuse;
    if not coalesce(can_reuse,false) then raise exception 'Not authorized to use this sound'; end if;
  end if;

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

notify pgrst,'reload schema';
