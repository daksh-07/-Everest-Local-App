-- Everest Local: frictionless service requests, controlled quote matching and publishable posts.
-- Additive only. Keeps dispatch semantics separate from service-business quote matching.

alter table public.service_requests
  add column if not exists location_source text,
  add column if not exists location_accuracy_m numeric,
  add column if not exists location_confirmed boolean not null default false,
  add column if not exists timing_mode text not null default 'FLEXIBLE',
  add column if not exists time_window_start time,
  add column if not exists time_window_end time,
  add column if not exists budget_min numeric,
  add column if not exists budget_max numeric,
  add column if not exists matching_wave_count integer not null default 0,
  add column if not exists last_match_wave_at timestamptz,
  add column if not exists expires_at timestamptz not null default (now() + interval '48 hours');

alter table public.posts
  add column if not exists location_label text;

do $$ begin
  alter table public.service_requests add constraint service_requests_location_source_check
    check (location_source is null or location_source in ('PROFILE','DEVICE','MANUAL','REMOTE'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.service_requests add constraint service_requests_timing_mode_check
    check (timing_mode in ('ASAP','FLEXIBLE','TIME_WINDOW','EXACT_TIME'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.service_requests add constraint service_requests_budget_range_check
    check ((budget_min is null or budget_min >= 0) and (budget_max is null or budget_max >= 0)
      and (budget_min is null or budget_max is null or budget_min <= budget_max));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.service_requests add constraint service_requests_coordinate_check
    check ((latitude is null and longitude is null) or
      (latitude between -90 and 90 and longitude between -180 and 180));
exception when duplicate_object then null; end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
 ('request-media','request-media',false,12582912,array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
 ('post-media','post-media',false,12582912,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists request_media_owner_insert on storage.objects;
create policy request_media_owner_insert on storage.objects for insert to authenticated
with check (
 bucket_id='request-media'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists (
   select 1 from public.service_requests r
   where r.id=((storage.foldername(name))[2])::uuid and r.customer_id=(select auth.uid())
 )
);

drop policy if exists request_media_authorized_select on storage.objects;
create policy request_media_authorized_select on storage.objects for select to authenticated
using (
 bucket_id='request-media' and (
   (storage.foldername(name))[1]=(select auth.uid())::text
   or exists (
     select 1 from public.service_requests r
     join public.opportunities o on o.request_id=r.id
     where r.id=((storage.foldername(name))[2])::uuid and public.is_business_member(o.business_id)
   )
   or public.is_admin()
 )
);

drop policy if exists request_media_owner_delete on storage.objects;
create policy request_media_owner_delete on storage.objects for delete to authenticated
using (
 bucket_id='request-media'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists (
   select 1 from public.service_requests r
   where r.id=((storage.foldername(name))[2])::uuid and r.customer_id=(select auth.uid())
 )
);

drop policy if exists post_media_owner_insert on storage.objects;
create policy post_media_owner_insert on storage.objects for insert to authenticated
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

drop policy if exists post_media_visible_select on storage.objects;
create policy post_media_visible_select on storage.objects for select to public
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
         and not exists (
           select 1 from public.user_blocks ub
           where (ub.blocker_id=(select auth.uid()) and ub.blocked_id=p.author_id)
              or (ub.blocked_id=(select auth.uid()) and ub.blocker_id=p.author_id)
         )
         and (
           (p.visibility='PUBLIC' and (p.business_id is null or exists (
              select 1 from public.businesses b where b.id=p.business_id
              and b.status='ACTIVE' and b.verification_status='VERIFIED'
           )))
           or (p.visibility='FOLLOWERS' and exists (
              select 1 from public.follows f
              where f.follower_id=(select auth.uid())
                and ((p.business_id is null and f.followed_user_id=p.author_id) or f.business_id=p.business_id)
           ))
         )
       )
     )
 )
);

drop policy if exists post_media_owner_update on storage.objects;
create policy post_media_owner_update on storage.objects for update to authenticated
using (
 bucket_id='post-media' and (storage.foldername(name))[1]=(select auth.uid())::text
) with check (
 bucket_id='post-media' and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists post_media_owner_delete on storage.objects;
create policy post_media_owner_delete on storage.objects for delete to authenticated
using (
 bucket_id='post-media' and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts for select
using (
  (auth.uid()=author_id)
  or public.is_admin()
  or (
    status='PUBLISHED'
    and (
      auth.uid() is null
      or not exists (
        select 1 from public.user_blocks ub
        where (ub.blocker_id=auth.uid() and ub.blocked_id=posts.author_id)
           or (ub.blocked_id=auth.uid() and ub.blocker_id=posts.author_id)
      )
    )
    and (
      (visibility='PUBLIC' and (
        business_id is null or exists (
          select 1 from public.businesses b
          where b.id=posts.business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'
        )
      ))
      or (
        visibility='FOLLOWERS' and auth.uid() is not null and exists (
          select 1 from public.follows f
          where f.follower_id=auth.uid()
            and ((business_id is null and f.followed_user_id=author_id) or f.business_id=business_id)
        )
      )
    )
  )
);

create or replace function public.publish_post(
  p_business_id uuid default null,
  p_caption text default null,
  p_post_type text default 'UPDATE',
  p_visibility text default 'PUBLIC',
  p_service_id uuid default null,
  p_product_id uuid default null,
  p_location_label text default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(length(trim(p_caption)),0)=0 and p_service_id is null and p_product_id is null then
    raise exception 'Add a caption, service or product';
  end if;
  if p_visibility not in ('PUBLIC','FOLLOWERS') then raise exception 'Invalid visibility'; end if;
  if p_business_id is not null then
    if not public.is_business_member(p_business_id) then raise exception 'Business membership required'; end if;
    if not exists(select 1 from public.businesses b where b.id=p_business_id and b.status='ACTIVE' and b.verification_status='VERIFIED') then
      raise exception 'Only active verified businesses can publish';
    end if;
    if p_service_id is not null and not exists(select 1 from public.services s where s.id=p_service_id and s.business_id=p_business_id and s.active) then
      raise exception 'Service is not available for this business';
    end if;
    if p_product_id is not null and not exists(select 1 from public.products p where p.id=p_product_id and p.business_id=p_business_id and p.status in ('ACTIVE','OUT_OF_STOCK')) then
      raise exception 'Product is not available for this business';
    end if;
  elsif p_service_id is not null or p_product_id is not null then
    raise exception 'Only business posts may link marketplace listings';
  end if;

  insert into public.posts(author_id,business_id,caption,post_type,visibility,service_id,product_id,status,location_label)
  values(auth.uid(),p_business_id,nullif(trim(p_caption),''),coalesce(nullif(trim(p_post_type),''),'UPDATE'),
    p_visibility,p_service_id,p_product_id,'PUBLISHED',nullif(trim(p_location_label),''))
  returning id into pid;
  return pid;
end $$;

revoke all on function public.publish_post(uuid,text,text,text,uuid,uuid,text) from public,anon;
grant execute on function public.publish_post(uuid,text,text,text,uuid,uuid,text) to authenticated;

create or replace function public.attach_request_media(p_request_id uuid,p_paths text[])
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.service_requests r where r.id=p_request_id and r.customer_id=auth.uid()) then raise exception 'Not authorized'; end if;
 if coalesce(array_length(p_paths,1),0)>10 then raise exception 'Maximum 10 images'; end if;
 if exists(select 1 from unnest(coalesce(p_paths,'{}'::text[])) p where split_part(p,'/',1)<>auth.uid()::text or split_part(p,'/',2)<>p_request_id::text) then
   raise exception 'Invalid media path';
 end if;
 update public.service_requests set media_urls=coalesce(p_paths,'{}'::text[]),updated_at=now() where id=p_request_id;
 return true;
end $$;
revoke all on function public.attach_request_media(uuid,text[]) from public,anon;
grant execute on function public.attach_request_media(uuid,text[]) to authenticated;

create or replace function public.release_service_request_wave(p_request_id uuid,p_limit integer default 5)
returns integer language plpgsql security definer set search_path=''
as $$
declare released integer:=0; r public.service_requests;
begin
 select * into r from public.service_requests where id=p_request_id for update;
 if r.id is null or r.status not in ('MATCHING','QUOTING') or r.expires_at<=now() then return 0; end if;
 if r.matching_wave_count>=3 then return 0; end if;

 with candidates as (
   select sm.business_id
   from public.service_matches sm
   where sm.request_id=r.id
     and not exists(select 1 from public.opportunities o where o.request_id=r.id and o.business_id=sm.business_id)
   order by sm.score desc,
     nullif((sm.reason->>'distance_km')::numeric,null) asc nulls last,
     sm.created_at asc
   limit greatest(1,least(coalesce(p_limit,5),5))
 ), ins as (
   insert into public.opportunities(request_id,business_id,expires_at)
   select r.id,c.business_id,least(r.expires_at,now()+interval '48 hours') from candidates c
   on conflict(request_id,business_id) do nothing
   returning business_id
 )
 select count(*) into released from ins;

 if released>0 then
   insert into public.notifications(user_id,kind,title,body,data)
   select b.owner_id,'NEW_OPPORTUNITY','New local lead','A matched customer request is ready for your response.',
     jsonb_build_object('request_id',r.id)
   from public.businesses b
   where b.id in (
     select o.business_id from public.opportunities o
     where o.request_id=r.id and o.created_at>=now()-interval '5 seconds'
   );
   update public.service_requests
      set status='QUOTING',matching_wave_count=matching_wave_count+1,last_match_wave_at=now(),updated_at=now()
    where id=r.id;
 elsif r.status='MATCHING' then
   update public.service_requests set status='QUOTING',updated_at=now() where id=r.id;
 end if;
 return released;
end $$;
revoke all on function public.release_service_request_wave(uuid,integer) from public,anon,authenticated;

create or replace function public.match_service_request(p_request_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare r public.service_requests; matched integer:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into r from public.service_requests where id=p_request_id for update;
 if r.id is null or (r.customer_id<>auth.uid() and not public.is_admin()) then raise exception 'Not authorized'; end if;
 if r.status not in ('OPEN','MATCHING','QUOTING') then raise exception 'Request is no longer eligible for matching'; end if;
 if r.expires_at<=now() then raise exception 'Request expired'; end if;

 update public.service_requests set status='MATCHING',updated_at=now() where id=r.id;

 insert into public.service_matches(request_id,business_id,score,reason)
 select r.id,b.id,
   100
   + case when r.category_id is not null and (b.category_id=r.category_id or svc.category_id=r.category_id) then 20 else 0 end
   + case when r.service_id is not null and svc.id=r.service_id then 30 else 0 end
   + case when r.latitude is not null and r.longitude is not null and b.latitude is not null and b.longitude is not null then
       greatest(0,20-least(20,round((
         6371*2*asin(sqrt(
           power(sin(radians((b.latitude-r.latitude)::double precision)/2),2)
           + cos(radians(r.latitude::double precision))*cos(radians(b.latitude::double precision))
           * power(sin(radians((b.longitude-r.longitude)::double precision)/2),2)
         ))
       )::numeric)::integer))
     else 0 end,
   jsonb_build_object(
     'verified',true,
     'service_match',(r.service_id is null or svc.id=r.service_id),
     'category_match',(r.category_id is null or b.category_id=r.category_id or svc.category_id=r.category_id),
     'service_area_match',(r.delivery_mode='REMOTE' or area.id is not null),
     'distance_km',case when r.latitude is not null and r.longitude is not null and b.latitude is not null and b.longitude is not null then
       round((6371*2*asin(sqrt(
         power(sin(radians((b.latitude-r.latitude)::double precision)/2),2)
         + cos(radians(r.latitude::double precision))*cos(radians(b.latitude::double precision))
         * power(sin(radians((b.longitude-r.longitude)::double precision)/2),2)
       )))::numeric,1) else null end,
     'delivery_mode',r.delivery_mode
   )
 from public.businesses b
 join public.services svc on svc.business_id=b.id and svc.active
   and (r.service_id is null or svc.id=r.service_id)
   and (svc.delivery_mode=r.delivery_mode or svc.delivery_mode='BOTH')
 left join public.service_areas area on area.business_id=b.id and area.active
   and r.delivery_mode='LOCAL'
   and r.state is not null and r.city is not null and r.suburb is not null
   and lower(area.state)=lower(r.state) and lower(area.city)=lower(r.city) and lower(area.suburb)=lower(r.suburb)
 where b.status='ACTIVE' and b.verification_status='VERIFIED' and b.accepts_requests
   and (r.delivery_mode='REMOTE' or area.id is not null)
   and (r.category_id is null or b.category_id=r.category_id or svc.category_id=r.category_id)
 on conflict(request_id,business_id) do update set score=excluded.score,reason=excluded.reason;

 get diagnostics matched=row_count;
 perform public.release_service_request_wave(r.id,5);
 return matched;
end $$;
revoke all on function public.match_service_request(uuid) from public,anon;
grant execute on function public.match_service_request(uuid) to authenticated;

create or replace function public.create_service_request_v2(
 p_category_id uuid default null,
 p_service_id uuid default null,
 p_description text default '',
 p_suburb text default null,
 p_city text default null,
 p_state text default null,
 p_latitude numeric default null,
 p_longitude numeric default null,
 p_location_source text default null,
 p_location_accuracy_m numeric default null,
 p_location_confirmed boolean default false,
 p_preferred_date date default null,
 p_preferred_time time default null,
 p_timing_mode text default 'FLEXIBLE',
 p_time_window_start time default null,
 p_time_window_end time default null,
 p_budget numeric default null,
 p_budget_min numeric default null,
 p_budget_max numeric default null,
 p_delivery_mode public.service_delivery_mode default null
) returns uuid language plpgsql security definer set search_path=''
as $$
declare rid uuid; effective_mode public.service_delivery_mode;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(trim(p_description))<5 or length(trim(p_description))>5000 then raise exception 'Invalid service description'; end if;
 if p_preferred_date is not null and p_preferred_date<current_date then raise exception 'Preferred date cannot be in the past'; end if;
 if p_timing_mode not in ('ASAP','FLEXIBLE','TIME_WINDOW','EXACT_TIME') then raise exception 'Invalid timing mode'; end if;
 if p_budget is not null and p_budget<0 then raise exception 'Invalid budget'; end if;
 if p_budget_min is not null and p_budget_min<0 then raise exception 'Invalid budget'; end if;
 if p_budget_max is not null and p_budget_max<0 then raise exception 'Invalid budget'; end if;
 if p_budget_min is not null and p_budget_max is not null and p_budget_min>p_budget_max then raise exception 'Invalid budget range'; end if;

 if p_service_id is not null then
   select delivery_mode into effective_mode from public.services where id=p_service_id and active=true;
   if effective_mode is null then raise exception 'Selected service is not available'; end if;
   if p_delivery_mode is not null and p_delivery_mode<>effective_mode and effective_mode<>'BOTH' then raise exception 'Requested delivery mode is not supported'; end if;
   if effective_mode='BOTH' and p_delivery_mode is not null then effective_mode:=p_delivery_mode; end if;
 else effective_mode:=coalesce(p_delivery_mode,'LOCAL'::public.service_delivery_mode); end if;

 if effective_mode='REMOTE' then
   p_suburb:=null;p_city:=null;p_state:=null;p_latitude:=null;p_longitude:=null;p_location_source:='REMOTE';p_location_confirmed:=true;
 elsif nullif(trim(coalesce(p_suburb,'')),'') is null or nullif(trim(coalesce(p_city,'')),'') is null or nullif(trim(coalesce(p_state,'')),'') is null then
   raise exception 'A confirmed service location is required for local work';
 elsif not coalesce(p_location_confirmed,false) then
   raise exception 'Confirm the service location before posting';
 end if;

 insert into public.service_requests(
   customer_id,category_id,service_id,delivery_mode,description,suburb,city,state,latitude,longitude,
   location_source,location_accuracy_m,location_confirmed,preferred_date,preferred_time,timing_mode,
   time_window_start,time_window_end,budget,budget_min,budget_max,media_urls,status
 ) values(
   auth.uid(),p_category_id,p_service_id,effective_mode,trim(p_description),nullif(trim(p_suburb),''),
   nullif(trim(p_city),''),nullif(trim(p_state),''),p_latitude,p_longitude,p_location_source,p_location_accuracy_m,
   p_location_confirmed,p_preferred_date,case when p_timing_mode='EXACT_TIME' then p_preferred_time else null end,
   p_timing_mode,case when p_timing_mode='TIME_WINDOW' then p_time_window_start else null end,
   case when p_timing_mode='TIME_WINDOW' then p_time_window_end else null end,p_budget,p_budget_min,p_budget_max,'{}','OPEN'
 ) returning id into rid;
 perform public.match_service_request(rid);
 return rid;
end $$;
revoke all on function public.create_service_request_v2(uuid,uuid,text,text,text,text,numeric,numeric,text,numeric,boolean,date,time,text,time,time,numeric,numeric,numeric,public.service_delivery_mode) from public,anon;
grant execute on function public.create_service_request_v2(uuid,uuid,text,text,text,text,numeric,numeric,text,numeric,boolean,date,time,text,time,time,numeric,numeric,numeric,public.service_delivery_mode) to authenticated;

create or replace function public.advance_service_request_waves()
returns integer language plpgsql security definer set search_path=''
as $$
declare rec record; released integer:=0;
begin
 update public.opportunities o set status='EXPIRED'
 where o.status='OPEN' and o.expires_at is not null and o.expires_at<=now();

 update public.service_requests r set status='CANCELLED',updated_at=now()
 where r.status in ('OPEN','MATCHING','QUOTING') and r.expires_at<=now();

 for rec in
   select r.id
   from public.service_requests r
   where r.status='QUOTING' and r.expires_at>now() and r.matching_wave_count<3
     and r.last_match_wave_at<=now()-interval '15 minutes'
     and (select count(*) from public.quotes q where q.request_id=r.id and q.status in ('SENT','VIEWED','ACCEPTED'))<3
 loop
   released:=released+public.release_service_request_wave(rec.id,5);
 end loop;
 return released;
end $$;
revoke all on function public.advance_service_request_waves() from public,anon,authenticated;

do $$
declare jid bigint;
begin
 select jobid into jid from cron.job where jobname='everest-service-request-waves';
 if jid is not null then perform cron.unschedule(jid); end if;
 perform cron.schedule('everest-service-request-waves','*/15 * * * *','select public.advance_service_request_waves();');
end $$;

create index if not exists service_requests_matching_idx
 on public.service_requests(status,expires_at,last_match_wave_at);
create index if not exists service_matches_rank_idx
 on public.service_matches(request_id,score desc,created_at);
create index if not exists opportunities_request_status_idx
 on public.opportunities(request_id,status,created_at);

grant select,insert,update,delete on public.post_media to authenticated;


drop policy if exists post_media_public_read on public.post_media;
create policy post_media_visible_read on public.post_media for select
using (
  exists (
    select 1 from public.posts p
    where p.id=post_media.post_id
      and (
        p.author_id=auth.uid()
        or public.is_admin()
        or (
          p.status='PUBLISHED'
          and (auth.uid() is null or not exists (
            select 1 from public.user_blocks ub
            where (ub.blocker_id=auth.uid() and ub.blocked_id=p.author_id)
               or (ub.blocked_id=auth.uid() and ub.blocker_id=p.author_id)
          ))
          and (
            (p.visibility='PUBLIC' and (p.business_id is null or exists (
              select 1 from public.businesses b where b.id=p.business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'
            )))
            or (p.visibility='FOLLOWERS' and auth.uid() is not null and exists (
              select 1 from public.follows f
              where f.follower_id=auth.uid()
                and ((p.business_id is null and f.followed_user_id=p.author_id) or f.business_id=p.business_id)
            ))
          )
        )
      )
  )
);

create or replace function public.list_my_business_opportunities(
  p_business_id uuid,
  p_status text default null
) returns table(
  id uuid,request_id uuid,status text,created_at timestamptz,expires_at timestamptz,
  description text,suburb text,city text,state text,preferred_date date,preferred_time time,
  timing_mode text,time_window_start time,time_window_end time,budget numeric,budget_min numeric,budget_max numeric,
  media_urls text[]
)
language sql security definer set search_path=''
as $$
  select o.id,o.request_id,o.status::text,o.created_at,o.expires_at,
    r.description,r.suburb,r.city,r.state,r.preferred_date,r.preferred_time,r.timing_mode,r.time_window_start,r.time_window_end,
    r.budget,r.budget_min,r.budget_max,r.media_urls
  from public.opportunities o
  join public.service_requests r on r.id=o.request_id
  where o.business_id=p_business_id
    and public.is_business_member(p_business_id)
    and exists(select 1 from public.businesses b where b.id=p_business_id and b.status='ACTIVE' and b.verification_status='VERIFIED')
    and (p_status is null or o.status::text=p_status)
  order by o.created_at desc
$$;
revoke all on function public.list_my_business_opportunities(uuid,text) from public,anon;
grant execute on function public.list_my_business_opportunities(uuid,text) to authenticated;
