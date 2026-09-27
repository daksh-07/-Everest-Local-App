-- Privacy-preserving estimated audience for post promotion packages.
-- This returns bucketed ranges based on recently active Everest accounts in the
-- post owner's current locality. It is an estimate of addressable audience, not
-- guaranteed impressions or reach.

create or replace function public.estimate_post_promotion_audience(p_post_id uuid)
returns table(
  plan text,
  estimated_min integer,
  estimated_max integer
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  uid uuid;
  owner_id uuid;
  owner_suburb text;
  owner_city text;
  owner_state text;
  local_count integer;
  city_count integer;
  state_count integer;
begin
  uid:=auth.uid();
  if uid is null then raise exception 'Authentication required'; end if;

  select p.author_id, pr.suburb, pr.city, pr.state
    into owner_id, owner_suburb, owner_city, owner_state
  from public.posts p
  left join public.profiles pr on pr.id=p.author_id
  where p.id=p_post_id
    and p.status='PUBLISHED'
    and p.visibility='PUBLIC';

  if owner_id is null or owner_id<>uid then
    raise exception 'You cannot estimate audience for this post';
  end if;

  select count(*)::integer into local_count
  from auth.users u
  join public.profiles pr on pr.id=u.id
  where u.id<>owner_id
    and u.last_sign_in_at>=now()-interval '30 days'
    and owner_suburb is not null and trim(owner_suburb)<>''
    and lower(trim(coalesce(pr.suburb,'')))=lower(trim(owner_suburb));

  select count(*)::integer into city_count
  from auth.users u
  join public.profiles pr on pr.id=u.id
  where u.id<>owner_id
    and u.last_sign_in_at>=now()-interval '30 days'
    and owner_city is not null and trim(owner_city)<>''
    and lower(trim(coalesce(pr.city,'')))=lower(trim(owner_city));

  select count(*)::integer into state_count
  from auth.users u
  join public.profiles pr on pr.id=u.id
  where u.id<>owner_id
    and u.last_sign_in_at>=now()-interval '30 days'
    and owner_state is not null and trim(owner_state)<>''
    and lower(trim(coalesce(pr.state,'')))=lower(trim(owner_state));

  -- Bucket exact counts so the client never exposes a precise small-area user count.
  return query
  with estimates(plan_key, raw_count) as (
    values
      ('LOCAL_24H'::text, coalesce(local_count,0)),
      ('AREA_3D'::text, greatest(coalesce(local_count,0),coalesce(city_count,0))),
      ('WIDE_7D'::text, greatest(coalesce(city_count,0),coalesce(state_count,0))),
      ('CITY_7D'::text, greatest(coalesce(city_count,0),coalesce(state_count,0)))
  )
  select
    plan_key,
    case
      when raw_count=0 then 0
      when raw_count<=5 then 1
      when raw_count<=10 then 5
      when raw_count<=25 then 10
      when raw_count<=50 then 25
      when raw_count<=100 then 50
      when raw_count<=250 then 100
      when raw_count<=500 then 250
      when raw_count<=1000 then 500
      else floor(raw_count/500.0)::integer*500
    end as estimated_min,
    case
      when raw_count=0 then 0
      when raw_count<=5 then 5
      when raw_count<=10 then 10
      when raw_count<=25 then 25
      when raw_count<=50 then 50
      when raw_count<=100 then 100
      when raw_count<=250 then 250
      when raw_count<=500 then 500
      when raw_count<=1000 then 1000
      else (ceil(raw_count/500.0)::integer*500)
    end as estimated_max
  from estimates;
end
$$;

revoke all on function public.estimate_post_promotion_audience(uuid) from public,anon;
grant execute on function public.estimate_post_promotion_audience(uuid) to authenticated;
