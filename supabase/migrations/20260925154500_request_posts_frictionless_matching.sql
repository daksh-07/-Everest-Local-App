-- Frictionless service requests + secure post/request media + bounded matching
-- Additive migration; preserves existing service/quote/booking/dispatch lifecycles.

alter table public.service_requests
  add column if not exists timing_mode text not null default 'FLEXIBLE',
  add column if not exists time_window_start time,
  add column if not exists time_window_end time,
  add column if not exists location_source text,
  add column if not exists location_accuracy_m numeric;

do $$ begin
  alter table public.service_requests add constraint service_requests_timing_mode_check
    check (timing_mode in ('ASAP','FLEXIBLE','TIME_WINDOW','EXACT_TIME'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.service_requests add constraint service_requests_location_source_check
    check (location_source is null or location_source in ('PROFILE','DEVICE','MANUAL'));
exception when duplicate_object then null; end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
 ('post-media','post-media',false,15728640,array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
 ('request-media','request-media',false,15728640,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update
set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Post media: path = <user_id>/<post_id>/<file>
drop policy if exists post_media_storage_insert on storage.objects;
create policy post_media_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id='post-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.posts p
    where p.id=((storage.foldername(name))[2])::uuid
      and p.author_id=(select auth.uid())
      and (p.business_id is null or public.is_business_member(p.business_id))
  )
);

drop policy if exists post_media_storage_select on storage.objects;
create policy post_media_storage_select on storage.objects for select to authenticated
using (
  bucket_id='post-media'
  and exists (
    select 1 from public.posts p
    where p.id=((storage.foldername(name))[2])::uuid
      and (
        p.author_id=(select auth.uid())
        or public.is_admin()
        or (
          p.status='PUBLISHED'
          and (
            p.visibility='PUBLIC'
            or (
              p.visibility='FOLLOWERS'
              and exists (
                select 1 from public.follows f
                where f.follower_id=(select auth.uid())
                  and (
                    (p.business_id is null and f.followed_user_id=p.author_id)
                    or f.business_id=p.business_id
                  )
              )
            )
          )
        )
      )
      and not exists (
        select 1 from public.user_blocks ub
        where (ub.blocker_id=(select auth.uid()) and ub.blocked_id=p.author_id)
           or (ub.blocker_id=p.author_id and ub.blocked_id=(select auth.uid()))
      )
  )
);

drop policy if exists post_media_storage_delete on storage.objects;
create policy post_media_storage_delete on storage.objects for delete to authenticated
using (
  bucket_id='post-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

-- Request media: path = <customer_id>/<request_id>/<file>.
drop policy if exists request_media_storage_insert on storage.objects;
create policy request_media_storage_insert on storage.objects for insert to authenticated
with check (
  bucket_id='request-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1 from public.service_requests r
    where r.id=((storage.foldername(name))[2])::uuid
      and r.customer_id=(select auth.uid())
  )
);

drop policy if exists request_media_storage_select on storage.objects;
create policy request_media_storage_select on storage.objects for select to authenticated
using (
  bucket_id='request-media'
  and exists (
    select 1 from public.service_requests r
    where r.id=((storage.foldername(name))[2])::uuid
      and (
        r.customer_id=(select auth.uid())
        or public.is_admin()
        or exists (
          select 1 from public.opportunities o
          where o.request_id=r.id
            and public.is_business_member(o.business_id)
        )
      )
  )
);

drop policy if exists request_media_storage_delete on storage.objects;
create policy request_media_storage_delete on storage.objects for delete to authenticated
using (
  bucket_id='request-media'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

-- Block relationships must be respected by post reads.
drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts for select
using (
  (
    (
      status='PUBLISHED'
      and (
        visibility='PUBLIC'
        or (
          visibility='FOLLOWERS'
          and exists (
            select 1 from public.follows f
            where f.follower_id=(select auth.uid())
              and (
                (posts.business_id is null and f.followed_user_id=posts.author_id)
                or f.business_id=posts.business_id
              )
          )
        )
      )
      and (
        posts.business_id is null
        or exists (
          select 1 from public.businesses b
          where b.id=posts.business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'
        )
      )
      and not exists (
        select 1 from public.user_blocks ub
        where (ub.blocker_id=(select auth.uid()) and ub.blocked_id=posts.author_id)
           or (ub.blocker_id=posts.author_id and ub.blocked_id=(select auth.uid()))
      )
    )
    or posts.author_id=(select auth.uid())
    or public.is_admin()
  )
);

create or replace function public.set_request_media(p_request_id uuid,p_paths text[])
returns boolean
language plpgsql
security definer
set search_path='public'
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.service_requests
     set media_urls=coalesce(p_paths,'{}'::text[]),updated_at=now()
   where id=p_request_id and customer_id=auth.uid()
     and status in ('OPEN','MATCHING','QUOTING');
  if not found then raise exception 'Request not editable'; end if;
  if exists (
    select 1 from unnest(coalesce(p_paths,'{}'::text[])) p(path)
    where split_part(path,'/',1)<>auth.uid()::text
       or split_part(path,'/',2)<>p_request_id::text
  ) then raise exception 'Invalid request media path'; end if;
  return true;
end $$;
revoke all on function public.set_request_media(uuid,text[]) from public;
grant execute on function public.set_request_media(uuid,text[]) to authenticated;

create or replace function public.create_service_request(
  p_category_id uuid default null,
  p_service_id uuid default null,
  p_description text default '',
  p_suburb text default null,
  p_city text default null,
  p_state text default null,
  p_preferred_date date default null,
  p_preferred_time time default null,
  p_budget numeric default null,
  p_media_urls text[] default '{}'::text[],
  p_delivery_mode public.service_delivery_mode default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_timing_mode text default 'FLEXIBLE',
  p_time_window_start time default null,
  p_time_window_end time default null,
  p_location_source text default null,
  p_location_accuracy_m numeric default null
) returns uuid
language plpgsql
security definer
set search_path='public'
as $$
declare
  rid uuid;
  effective_mode public.service_delivery_mode;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(p_description))<5 or length(trim(p_description))>5000 then raise exception 'Invalid service description'; end if;
  if p_budget is not null and p_budget<0 then raise exception 'Invalid budget'; end if;
  if p_preferred_date is not null and p_preferred_date<current_date then raise exception 'Preferred date cannot be in the past'; end if;
  if p_timing_mode not in ('ASAP','FLEXIBLE','TIME_WINDOW','EXACT_TIME') then raise exception 'Invalid timing mode'; end if;
  if p_location_source is not null and p_location_source not in ('PROFILE','DEVICE','MANUAL') then raise exception 'Invalid location source'; end if;

  if p_service_id is not null then
    select delivery_mode into effective_mode from public.services where id=p_service_id and active=true;
    if effective_mode is null then raise exception 'Selected service is not available'; end if;
    if p_delivery_mode is not null and p_delivery_mode<>effective_mode and effective_mode<>'BOTH' then
      raise exception 'Requested delivery mode is not supported by this service';
    end if;
    if effective_mode='BOTH' and p_delivery_mode is not null then effective_mode:=p_delivery_mode; end if;
  else
    effective_mode:=coalesce(p_delivery_mode,'LOCAL'::public.service_delivery_mode);
  end if;

  if effective_mode='REMOTE' then
    p_suburb:=null;p_city:=null;p_state:=null;p_latitude:=null;p_longitude:=null;p_location_source:=null;p_location_accuracy_m:=null;
  elsif nullif(trim(coalesce(p_suburb,'')),'') is null
     or nullif(trim(coalesce(p_city,'')),'') is null
     or nullif(trim(coalesce(p_state,'')),'') is null then
    raise exception 'A confirmed service location is required for local work';
  end if;

  if (p_latitude is null)<>(p_longitude is null) then raise exception 'Latitude and longitude must be supplied together'; end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180) then
    raise exception 'Invalid coordinates';
  end if;

  insert into public.service_requests(
    customer_id,category_id,service_id,delivery_mode,description,suburb,city,state,
    preferred_date,preferred_time,budget,media_urls,status,latitude,longitude,
    timing_mode,time_window_start,time_window_end,location_source,location_accuracy_m
  ) values(
    auth.uid(),p_category_id,p_service_id,effective_mode,trim(p_description),
    nullif(trim(p_suburb),''),nullif(trim(p_city),''),nullif(trim(p_state),''),
    p_preferred_date,p_preferred_time,p_budget,coalesce(p_media_urls,'{}'),'OPEN',
    p_latitude,p_longitude,p_timing_mode,p_time_window_start,p_time_window_end,p_location_source,p_location_accuracy_m
  ) returning id into rid;

  perform public.match_service_request(rid);
  return rid;
end $$;

revoke all on function public.create_service_request(uuid,uuid,text,text,text,text,date,time,numeric,text[],public.service_delivery_mode,numeric,numeric,text,time,time,text,numeric) from public;
grant execute on function public.create_service_request(uuid,uuid,text,text,text,text,date,time,numeric,text[],public.service_delivery_mode,numeric,numeric,text,time,time,text,numeric) to authenticated;

create or replace function public.match_service_request(p_request_id uuid)
returns integer
language plpgsql
security definer
set search_path='public'
as $$
declare
  r public.service_requests;
  opportunity_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into r from public.service_requests where id=p_request_id for update;
  if r.id is null or (r.customer_id<>auth.uid() and not public.is_admin()) then raise exception 'Not authorized'; end if;
  if r.status not in ('OPEN','MATCHING','QUOTING') then raise exception 'Request is no longer eligible for matching'; end if;

  update public.service_requests set status='MATCHING',updated_at=now() where id=r.id;

  delete from public.service_matches where request_id=r.id;
  delete from public.opportunities where request_id=r.id and status='OPEN';

  insert into public.service_matches(request_id,business_id,score,reason)
  select
    r.id,
    b.id,
    60
      + case when r.category_id is not null and (b.category_id=r.category_id or svc.category_id=r.category_id) then 15 else 0 end
      + case when area.id is not null then 10 else 0 end
      + case
          when d.distance_km is null then 0
          when d.distance_km<=2 then 15
          when d.distance_km<=5 then 12
          when d.distance_km<=10 then 8
          when d.distance_km<=20 then 4
          else 0
        end,
    jsonb_build_object(
      'verified',true,
      'service_match',true,
      'category_match',(r.category_id is null or b.category_id=r.category_id or svc.category_id=r.category_id),
      'area_match',(r.delivery_mode='REMOTE' or area.id is not null),
      'distance_km',case when d.distance_km is null then null else round(d.distance_km::numeric,1) end,
      'availability_used',false,
      'delivery_mode',r.delivery_mode
    )
  from public.businesses b
  join public.services svc
    on svc.business_id=b.id and svc.active
   and (r.service_id is null or svc.id=r.service_id)
   and (svc.delivery_mode=r.delivery_mode or svc.delivery_mode='BOTH')
  left join public.service_areas area
    on area.business_id=b.id and area.active
   and r.delivery_mode='LOCAL'
   and lower(area.state)=lower(r.state)
   and lower(area.city)=lower(r.city)
   and lower(area.suburb)=lower(r.suburb)
  left join lateral (
    select case
      when r.latitude is null or r.longitude is null or b.latitude is null or b.longitude is null then null
      else 6371 * 2 * asin(sqrt(
        power(sin(radians((b.latitude::double precision-r.latitude::double precision)/2)),2)
        + cos(radians(r.latitude::double precision))*cos(radians(b.latitude::double precision))
        * power(sin(radians((b.longitude::double precision-r.longitude::double precision)/2)),2)
      ))
    end as distance_km
  ) d on true
  where b.status='ACTIVE'
    and b.verification_status='VERIFIED'
    and b.accepts_requests
    and (r.delivery_mode='REMOTE' or area.id is not null)
    and (r.category_id is null or b.category_id=r.category_id or svc.category_id=r.category_id)
  on conflict(request_id,business_id)
  do update set score=excluded.score,reason=excluded.reason,created_at=now();

  insert into public.opportunities(request_id,business_id,expires_at)
  select sm.request_id,sm.business_id,now()+interval '24 hours'
  from public.service_matches sm
  where sm.request_id=r.id
  order by sm.score desc,sm.created_at asc
  limit 5
  on conflict(request_id,business_id) do nothing;

  get diagnostics opportunity_count=row_count;
  update public.service_requests
     set status=case when opportunity_count>0 then 'QUOTING'::public.request_status else 'MATCHING'::public.request_status end,
         updated_at=now()
   where id=r.id;
  return opportunity_count;
end $$;

-- Make public post_media rows obey the same block/privacy rules as posts.
drop policy if exists post_media_public_read on public.post_media;
create policy post_media_public_read on public.post_media for select
using (
  exists (
    select 1 from public.posts p
    where p.id=post_media.post_id
      and (
        p.author_id=(select auth.uid())
        or public.is_admin()
        or (
          p.status='PUBLISHED'
          and (
            p.visibility='PUBLIC'
            or (
              p.visibility='FOLLOWERS'
              and exists (
                select 1 from public.follows f
                where f.follower_id=(select auth.uid())
                  and (
                    (p.business_id is null and f.followed_user_id=p.author_id)
                    or f.business_id=p.business_id
                  )
              )
            )
          )
          and not exists (
            select 1 from public.user_blocks ub
            where (ub.blocker_id=(select auth.uid()) and ub.blocked_id=p.author_id)
               or (ub.blocker_id=p.author_id and ub.blocked_id=(select auth.uid()))
          )
        )
      )
  )
);

grant select,insert,update,delete on public.post_media to authenticated;
