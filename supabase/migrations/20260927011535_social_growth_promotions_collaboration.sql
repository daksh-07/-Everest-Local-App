-- Social growth engine: collaborative posts, creator analytics, paid promotion, and ranked discovery.
-- Paid reach is a ranking signal, never a guaranteed impression count.

alter table public.posts
  add column if not exists collaboration_enabled boolean not null default true;

create table if not exists public.post_views (
  post_id uuid not null references public.posts(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  view_bucket timestamptz not null,
  created_at timestamptz not null default now(),
  primary key(post_id,viewer_id,view_bucket)
);
create index if not exists post_views_post_idx on public.post_views(post_id,created_at desc);
create index if not exists post_views_viewer_idx on public.post_views(viewer_id,created_at desc);
alter table public.post_views enable row level security;

drop policy if exists post_views_creator_read on public.post_views;
create policy post_views_creator_read on public.post_views
for select to authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id=post_views.post_id
      and (p.author_id=(select auth.uid()) or public.is_admin())
  )
);

revoke all on public.post_views from anon,authenticated;
grant select on public.post_views to authenticated;

create table if not exists public.post_collaborators (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  collaborator_user_id uuid references auth.users(id) on delete cascade,
  collaborator_business_id uuid references public.businesses(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','DECLINED','CANCELLED')),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  check ((collaborator_user_id is not null)::integer + (collaborator_business_id is not null)::integer = 1)
);
create unique index if not exists post_collaborators_user_unique
  on public.post_collaborators(post_id,collaborator_user_id)
  where collaborator_user_id is not null;
create unique index if not exists post_collaborators_business_unique
  on public.post_collaborators(post_id,collaborator_business_id)
  where collaborator_business_id is not null;
create index if not exists post_collaborators_post_status_idx
  on public.post_collaborators(post_id,status,invited_at desc);
alter table public.post_collaborators enable row level security;

drop policy if exists post_collaborators_read on public.post_collaborators;
create policy post_collaborators_read on public.post_collaborators
for select to anon,authenticated
using (
  status='ACCEPTED'
  or invited_by=(select auth.uid())
  or collaborator_user_id=(select auth.uid())
  or (
    collaborator_business_id is not null
    and (select auth.uid()) is not null
    and public.is_business_member(collaborator_business_id)
  )
  or public.is_admin()
);

revoke all on public.post_collaborators from anon,authenticated;
grant select on public.post_collaborators to anon,authenticated;

create table if not exists public.post_promotions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  purchaser_id uuid not null references auth.users(id) on delete cascade,
  plan text not null check (plan in ('LOCAL_24H','AREA_3D','WIDE_7D','CITY_7D')),
  status text not null default 'PENDING_PAYMENT'
    check (status in ('PENDING_PAYMENT','ACTIVE','ENDED','CANCELLED','FAILED')),
  amount_aud numeric(10,2) not null check (amount_aud > 0),
  priority smallint not null check (priority between 1 and 4),
  radius_km integer not null check (radius_km between 1 and 100),
  duration_hours integer not null check (duration_hours between 1 and 720),
  target_label text,
  starts_at timestamptz,
  ends_at timestamptz,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(purchaser_id,idempotency_key)
);
create index if not exists post_promotions_active_idx
  on public.post_promotions(post_id,status,ends_at desc);
create index if not exists post_promotions_purchaser_idx
  on public.post_promotions(purchaser_id,created_at desc);
alter table public.post_promotions enable row level security;

drop policy if exists post_promotions_owner_read on public.post_promotions;
create policy post_promotions_owner_read on public.post_promotions
for select to authenticated
using (
  purchaser_id=(select auth.uid())
  or exists (
    select 1 from public.posts p
    where p.id=post_promotions.post_id and p.author_id=(select auth.uid())
  )
  or public.is_admin()
);

revoke all on public.post_promotions from anon,authenticated;
grant select on public.post_promotions to authenticated;

create or replace function public.record_post_view(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid; owner_id uuid; bucket timestamptz;
begin
  uid := auth.uid();
  if uid is null then return false; end if;

  select p.author_id into owner_id
  from public.posts p
  where p.id=p_post_id and p.status='PUBLISHED';

  if owner_id is null or owner_id=uid then return false; end if;

  bucket := date_trunc('day',now()) + floor(extract(hour from now())/6) * interval '6 hours';

  insert into public.post_views(post_id,viewer_id,view_bucket)
  values(p_post_id,uid,bucket)
  on conflict do nothing;

  return true;
end
$$;
revoke all on function public.record_post_view(uuid) from public,anon;
grant execute on function public.record_post_view(uuid) to authenticated;

create or replace function public.invite_post_collaborator(
  p_post_id uuid,
  p_business_id uuid default null,
  p_user_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid; invite_id uuid; target_owner uuid; inviter_name text;
begin
  uid:=auth.uid();
  if uid is null then raise exception 'Authentication required'; end if;
  if ((p_business_id is not null)::integer + (p_user_id is not null)::integer) <> 1 then
    raise exception 'Choose exactly one collaborator';
  end if;
  if not exists (
    select 1 from public.posts p
    where p.id=p_post_id and p.author_id=uid and p.status='PUBLISHED' and p.collaboration_enabled
  ) then raise exception 'You cannot invite collaborators to this post'; end if;

  inviter_name:=coalesce(public.social_actor_name(uid),'Everest member');

  if p_business_id is not null then
    select b.owner_id into target_owner
    from public.businesses b
    where b.id=p_business_id and b.status='ACTIVE' and b.verification_status='VERIFIED';
    if target_owner is null then raise exception 'Business is not available for collaboration'; end if;

    insert into public.post_collaborators(post_id,collaborator_business_id,invited_by)
    values(p_post_id,p_business_id,uid)
    on conflict(post_id,collaborator_business_id) where collaborator_business_id is not null
    do update set status='PENDING',invited_by=excluded.invited_by,invited_at=now(),responded_at=null
    returning id into invite_id;

    if target_owner<>uid then
      insert into public.notifications(user_id,kind,title,body,data)
      values(
        target_owner,'post_collaboration_invite','Post collaboration request',
        inviter_name||' invited your business to collaborate on a post.',
        jsonb_build_object('route','/account','post_id',p_post_id,'collaboration_id',invite_id)
      );
    end if;
  else
    if p_user_id=uid then raise exception 'You cannot collaborate with yourself'; end if;
    if not exists(select 1 from public.public_profiles pp where pp.id=p_user_id and pp.visibility='PUBLIC') then
      raise exception 'Profile is not available for collaboration';
    end if;

    insert into public.post_collaborators(post_id,collaborator_user_id,invited_by)
    values(p_post_id,p_user_id,uid)
    on conflict(post_id,collaborator_user_id) where collaborator_user_id is not null
    do update set status='PENDING',invited_by=excluded.invited_by,invited_at=now(),responded_at=null
    returning id into invite_id;

    insert into public.notifications(user_id,kind,title,body,data)
    values(
      p_user_id,'post_collaboration_invite','Post collaboration request',
      inviter_name||' invited you to collaborate on a post.',
      jsonb_build_object('route','/account','post_id',p_post_id,'collaboration_id',invite_id)
    );
  end if;

  return invite_id;
end
$$;
revoke all on function public.invite_post_collaborator(uuid,uuid,uuid) from public,anon;
grant execute on function public.invite_post_collaborator(uuid,uuid,uuid) to authenticated;

create or replace function public.respond_post_collaboration(p_invite_id uuid,p_accept boolean)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid; row public.post_collaborators; owner_id uuid; responder_name text;
begin
  uid:=auth.uid();
  if uid is null then raise exception 'Authentication required'; end if;

  select * into row from public.post_collaborators where id=p_invite_id for update;
  if row.id is null or row.status<>'PENDING' then raise exception 'Collaboration request is not pending'; end if;

  if not (
    row.collaborator_user_id=uid
    or (row.collaborator_business_id is not null and public.is_business_member(row.collaborator_business_id))
    or public.is_admin()
  ) then raise exception 'Not authorized'; end if;

  update public.post_collaborators
  set status=case when p_accept then 'ACCEPTED' else 'DECLINED' end,
      responded_at=now()
  where id=row.id;

  select p.author_id into owner_id from public.posts p where p.id=row.post_id;
  responder_name:=case
    when row.collaborator_business_id is not null then
      coalesce((select b.name from public.businesses b where b.id=row.collaborator_business_id),'A business')
    else coalesce(public.social_actor_name(uid),'Everest member')
  end;

  if owner_id is not null and owner_id<>uid then
    insert into public.notifications(user_id,kind,title,body,data)
    values(
      owner_id,
      case when p_accept then 'post_collaboration_accepted' else 'post_collaboration_declined' end,
      case when p_accept then 'Collaboration accepted' else 'Collaboration declined' end,
      responder_name||case when p_accept then ' accepted your post collaboration.' else ' declined your post collaboration.' end,
      jsonb_build_object('route','/social','post_id',row.post_id,'collaboration_id',row.id)
    );
  end if;

  return true;
end
$$;
revoke all on function public.respond_post_collaboration(uuid,boolean) from public,anon;
grant execute on function public.respond_post_collaboration(uuid,boolean) to authenticated;

create or replace function public.list_my_post_collaboration_invites()
returns table(
  id uuid,
  post_id uuid,
  inviter_name text,
  caption text,
  business_name text,
  invited_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select
    pc.id,
    pc.post_id,
    coalesce(public.social_actor_name(pc.invited_by),'Everest member') as inviter_name,
    p.caption,
    b.name as business_name,
    pc.invited_at
  from public.post_collaborators pc
  join public.posts p on p.id=pc.post_id
  left join public.businesses b on b.id=pc.collaborator_business_id
  where pc.status='PENDING'
    and (
      pc.collaborator_user_id=auth.uid()
      or (
        pc.collaborator_business_id is not null
        and public.is_business_member(pc.collaborator_business_id)
      )
    )
  order by pc.invited_at desc
  limit 20
$$;
revoke all on function public.list_my_post_collaboration_invites() from public,anon;
grant execute on function public.list_my_post_collaboration_invites() to authenticated;

create or replace function public.create_post_promotion(
  p_post_id uuid,
  p_plan text,
  p_target_label text,
  p_idempotency_key text
) returns table(
  promotion_id uuid,
  amount_aud numeric,
  priority smallint,
  radius_km integer,
  duration_hours integer,
  status text,
  stripe_checkout_session_id text,
  reused boolean
)
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid; amount_value numeric; priority_value smallint; radius_value integer; duration_value integer;
  existing public.post_promotions; created public.post_promotions;
begin
  uid:=auth.uid();
  if uid is null then raise exception 'Authentication required'; end if;
  if length(coalesce(p_idempotency_key,''))<16 or length(p_idempotency_key)>128 then
    raise exception 'Invalid idempotency key';
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id=p_post_id
      and p.status='PUBLISHED'
      and p.visibility='PUBLIC'
      and (
        p.author_id=uid
        or exists (
          select 1 from public.post_collaborators pc
          where pc.post_id=p.id and pc.status='ACCEPTED'
            and (
              pc.collaborator_user_id=uid
              or (pc.collaborator_business_id is not null and public.is_business_member(pc.collaborator_business_id))
            )
        )
      )
  ) then raise exception 'You cannot promote this post'; end if;

  case p_plan
    when 'LOCAL_24H' then amount_value:=4.99; priority_value:=1; radius_value:=5; duration_value:=24;
    when 'AREA_3D' then amount_value:=9.99; priority_value:=2; radius_value:=15; duration_value:=72;
    when 'WIDE_7D' then amount_value:=19.99; priority_value:=3; radius_value:=30; duration_value:=168;
    when 'CITY_7D' then amount_value:=29.99; priority_value:=4; radius_value:=50; duration_value:=168;
    else raise exception 'Invalid promotion plan';
  end case;

  select * into existing
  from public.post_promotions pp
  where pp.purchaser_id=uid and pp.idempotency_key=p_idempotency_key
  limit 1;

  if existing.id is not null then
    if existing.post_id<>p_post_id or existing.plan<>p_plan then raise exception 'Idempotency key conflict'; end if;
    return query select existing.id,existing.amount_aud,existing.priority,existing.radius_km,existing.duration_hours,existing.status,existing.stripe_checkout_session_id,true;
    return;
  end if;

  insert into public.post_promotions(
    post_id,purchaser_id,plan,status,amount_aud,priority,radius_km,duration_hours,target_label,idempotency_key
  ) values(
    p_post_id,uid,p_plan,'PENDING_PAYMENT',amount_value,priority_value,radius_value,duration_value,nullif(trim(coalesce(p_target_label,'')),''),p_idempotency_key
  )
  returning * into created;

  return query select created.id,created.amount_aud,created.priority,created.radius_km,created.duration_hours,created.status,created.stripe_checkout_session_id,false;
end
$$;
revoke all on function public.create_post_promotion(uuid,text,text,text) from public,anon;
grant execute on function public.create_post_promotion(uuid,text,text,text) to authenticated;

create or replace function public.activate_post_promotion(
  p_promotion_id uuid,
  p_checkout_session_id text,
  p_payment_intent_id text
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare hours_value integer;
begin
  select duration_hours into hours_value
  from public.post_promotions
  where id=p_promotion_id
  for update;

  if hours_value is null then raise exception 'Promotion not found'; end if;

  update public.post_promotions
  set status='ACTIVE',
      starts_at=coalesce(starts_at,now()),
      ends_at=coalesce(ends_at,now()+make_interval(hours=>hours_value)),
      stripe_checkout_session_id=coalesce(stripe_checkout_session_id,p_checkout_session_id),
      stripe_payment_intent_id=coalesce(stripe_payment_intent_id,p_payment_intent_id),
      updated_at=now()
  where id=p_promotion_id
    and status in ('PENDING_PAYMENT','ACTIVE');

  return true;
end
$$;
revoke all on function public.activate_post_promotion(uuid,text,text) from public,anon,authenticated;
grant execute on function public.activate_post_promotion(uuid,text,text) to service_role;

create or replace function public.fail_post_promotion(p_promotion_id uuid)
returns boolean
language sql
security definer
set search_path=''
as $$
  update public.post_promotions
  set status='FAILED',updated_at=now()
  where id=p_promotion_id and status='PENDING_PAYMENT';
  select true
$$;
revoke all on function public.fail_post_promotion(uuid) from public,anon,authenticated;
grant execute on function public.fail_post_promotion(uuid) to service_role;

create or replace function public.get_my_post_insights(p_post_ids uuid[])
returns table(
  post_id uuid,
  view_count bigint,
  unique_viewers bigint,
  like_count bigint,
  comment_count bigint,
  promotion_status text,
  promote_until timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select
    p.id,
    (select count(*) from public.post_views v where v.post_id=p.id)::bigint,
    (select count(distinct v.viewer_id) from public.post_views v where v.post_id=p.id)::bigint,
    (select count(*) from public.post_reactions r where r.post_id=p.id)::bigint,
    (select count(*) from public.post_comments c where c.post_id=p.id and c.status='VISIBLE')::bigint,
    (
      select case
        when pp.status='ACTIVE' and pp.ends_at<=now() then 'ENDED'
        else pp.status
      end
      from public.post_promotions pp
      where pp.post_id=p.id
      order by pp.created_at desc
      limit 1
    ),
    (
      select pp.ends_at
      from public.post_promotions pp
      where pp.post_id=p.id and pp.status='ACTIVE' and pp.ends_at>now()
      order by pp.ends_at desc
      limit 1
    )
  from public.posts p
  where p.id=any(coalesce(p_post_ids,'{}'::uuid[]))
    and p.author_id=auth.uid()
$$;
revoke all on function public.get_my_post_insights(uuid[]) from public,anon;
grant execute on function public.get_my_post_insights(uuid[]) to authenticated;

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

drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts
for select to anon,authenticated
using (
  auth.uid()=author_id
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
        business_id is null
        or exists (
          select 1 from public.businesses b
          where b.id=business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'
        )
      ))
      or (
        visibility='FOLLOWERS' and auth.uid() is not null and (
          exists (
            select 1 from public.follows f
            where f.follower_id=auth.uid()
              and ((business_id is null and f.followed_user_id=author_id) or f.business_id=business_id)
          )
          or exists (
            select 1 from public.user_connections uc
            where (uc.user_a=auth.uid() and uc.user_b=author_id)
               or (uc.user_b=auth.uid() and uc.user_a=author_id)
          )
          or exists (
            select 1
            from public.post_collaborators pc
            where pc.post_id=posts.id and pc.status='ACCEPTED'
              and (
                (pc.collaborator_user_id is not null and (
                  exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.followed_user_id=pc.collaborator_user_id)
                  or exists(select 1 from public.user_connections uc where (uc.user_a=auth.uid() and uc.user_b=pc.collaborator_user_id) or (uc.user_b=auth.uid() and uc.user_a=pc.collaborator_user_id))
                ))
                or (pc.collaborator_business_id is not null and exists(select 1 from public.follows f where f.follower_id=auth.uid() and f.business_id=pc.collaborator_business_id))
              )
          )
        )
      )
    )
  )
);
