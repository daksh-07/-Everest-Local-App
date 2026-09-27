-- Keep standard Explore posts separate from short-form Clips.
-- Clips continue through list_discovery_clips; the existing feed remains posts-only.

create or replace function public.list_discovery_feed(
  p_limit integer default 40,
  p_offset integer default 0,
  p_locality text default null
) returns table(
  id uuid,
  author_id uuid,
  business_id uuid,
  caption text,
  post_type text,
  visibility text,
  service_id uuid,
  product_id uuid,
  location_label text,
  status text,
  comments_enabled boolean,
  created_at timestamptz,
  updated_at timestamptz,
  is_promoted boolean,
  promotion_priority integer,
  collaborator_count integer,
  collaborator_labels text[],
  feed_score numeric
)
language sql
stable
security definer
set search_path=''
as $$
with scored as (
  select
    p.id,p.author_id,p.business_id,p.caption,p.post_type,p.visibility,p.service_id,p.product_id,p.location_label,
    p.status,p.comments_enabled,p.created_at,p.updated_at,
    coalesce((
      select max(pp.priority)
      from public.post_promotions pp
      where pp.post_id=p.id and pp.status='ACTIVE' and pp.starts_at<=now() and pp.ends_at>now()
        and (
          pp.target_label is null
          or nullif(trim(coalesce(p_locality,'')),'') is null
          or lower(pp.target_label) like '%'||lower(trim(p_locality))||'%'
          or lower(coalesce(p.location_label,'')) like '%'||lower(trim(p_locality))||'%'
        )
    ),0)::integer as promo_priority,
    (select count(*) from public.post_collaborators pc where pc.post_id=p.id and pc.status='ACCEPTED')::integer as collab_count,
    coalesce((
      select array_agg(label order by label)
      from (
        select coalesce(b.name,pp.display_name,'Everest collaborator') as label
        from public.post_collaborators pc
        left join public.businesses b on b.id=pc.collaborator_business_id
        left join public.public_profiles pp on pp.id=pc.collaborator_user_id
        where pc.post_id=p.id and pc.status='ACCEPTED'
      ) labels
    ),'{}'::text[]) as collab_labels,
    least(30,
      (select count(*) from public.post_reactions r where r.post_id=p.id)
      + 2*(select count(*) from public.post_comments c where c.post_id=p.id and c.status='VISIBLE')
    )::numeric as engagement_score,
    greatest(0,24 - greatest(0,extract(epoch from (now()-p.created_at))/3600)/3)::numeric as recency_score,
    case
      when nullif(trim(coalesce(p_locality,'')),'') is not null
       and lower(coalesce(p.location_label,'')) like '%'||lower(trim(p_locality))||'%'
      then 24 else 0 end::numeric as locality_score,
    case
      when auth.uid() is not null and (
        exists (
          select 1 from public.follows f
          where f.follower_id=auth.uid()
            and ((p.business_id is null and f.followed_user_id=p.author_id) or f.business_id=p.business_id)
        )
        or exists (
          select 1 from public.user_connections uc
          where (uc.user_a=auth.uid() and uc.user_b=p.author_id)
             or (uc.user_b=auth.uid() and uc.user_a=p.author_id)
        )
        or exists (
          select 1
          from public.post_collaborators pc
          where pc.post_id=p.id and pc.status='ACCEPTED'
            and (
              (pc.collaborator_user_id is not null and (
                exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_user_id=pc.collaborator_user_id)
                or exists(select 1 from public.user_connections uc where (uc.user_a=auth.uid() and uc.user_b=pc.collaborator_user_id) or (uc.user_b=auth.uid() and uc.user_a=pc.collaborator_user_id))
              ))
              or (pc.collaborator_business_id is not null and exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.business_id=pc.collaborator_business_id))
            )
        )
      ) then 32 else 0 end::numeric as relationship_score
  from public.posts p
  where p.status='PUBLISHED'
    and p.visibility='PUBLIC'
    and coalesce(p.content_format,'POST')='POST'
    and (
      p.business_id is null
      or exists (
        select 1 from public.businesses b
        where b.id=p.business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'
      )
    )
    and (
      auth.uid() is null
      or not exists (
        select 1 from public.user_blocks ub
        where (ub.blocker_id=auth.uid() and ub.blocked_id=p.author_id)
           or (ub.blocked_id=auth.uid() and ub.blocker_id=p.author_id)
      )
    )
    and (
      p.created_at>=now()-interval '30 days'
      or exists (
        select 1 from public.post_promotions pp
        where pp.post_id=p.id and pp.status='ACTIVE' and pp.ends_at>now()
      )
    )
)
select
  id,author_id,business_id,caption,post_type,visibility,service_id,product_id,location_label,status,comments_enabled,created_at,updated_at,
  promo_priority>0 as is_promoted,
  promo_priority as promotion_priority,
  collab_count as collaborator_count,
  collab_labels as collaborator_labels,
  (recency_score+engagement_score+locality_score+relationship_score+(promo_priority*9))::numeric as feed_score
from scored
order by feed_score desc,created_at desc
limit greatest(1,least(coalesce(p_limit,40),80))
offset greatest(0,coalesce(p_offset,0))
$$;
revoke all on function public.list_discovery_feed(integer,integer,text) from public;
grant execute on function public.list_discovery_feed(integer,integer,text) to anon,authenticated;

notify pgrst,'reload schema';
