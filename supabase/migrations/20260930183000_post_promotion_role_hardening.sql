-- Promotion of business-branded/collaborative content requires current
-- catalogue/publishing authority, not generic business membership.

create or replace function public.create_post_promotion(
  p_post_id uuid,
  p_plan text,
  p_target_label text,
  p_idempotency_key text
)
returns table(
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
  uid uuid;
  amount_value numeric;
  priority_value smallint;
  radius_value integer;
  duration_value integer;
  existing public.post_promotions;
  created public.post_promotions;
begin
  uid:=auth.uid();
  if uid is null then raise exception 'Authentication required'; end if;
  if length(coalesce(p_idempotency_key,''))<16 or length(p_idempotency_key)>128 then
    raise exception 'Invalid idempotency key';
  end if;

  if not exists(
    select 1
    from public.posts p
    where p.id=p_post_id
      and p.status='PUBLISHED'
      and p.visibility='PUBLIC'
      and (
        (
          p.author_id=uid
          and (
            p.business_id is null
            or public.has_business_permission(p.business_id,'CATALOG_MANAGE')
          )
        )
        or exists(
          select 1
          from public.post_collaborators pc
          where pc.post_id=p.id
            and pc.status='ACCEPTED'
            and (
              pc.collaborator_user_id=uid
              or (
                pc.collaborator_business_id is not null
                and public.has_business_permission(
                  pc.collaborator_business_id,'CATALOG_MANAGE'
                )
              )
            )
        )
      )
  ) then
    raise exception 'You cannot promote this post';
  end if;

  case p_plan
    when 'LOCAL_24H' then
      amount_value:=4.99;priority_value:=1;radius_value:=5;duration_value:=24;
    when 'AREA_3D' then
      amount_value:=9.99;priority_value:=2;radius_value:=15;duration_value:=72;
    when 'WIDE_7D' then
      amount_value:=19.99;priority_value:=3;radius_value:=30;duration_value:=168;
    when 'CITY_7D' then
      amount_value:=29.99;priority_value:=4;radius_value:=50;duration_value:=168;
    else
      raise exception 'Invalid promotion plan';
  end case;

  select * into existing
  from public.post_promotions pp
  where pp.purchaser_id=uid
    and pp.idempotency_key=p_idempotency_key
  limit 1;

  if existing.id is not null then
    if existing.post_id<>p_post_id or existing.plan<>p_plan then
      raise exception 'Idempotency key conflict';
    end if;

    return query
    select existing.id,existing.amount_aud,existing.priority,existing.radius_km,
           existing.duration_hours,existing.status,
           existing.stripe_checkout_session_id,true;
    return;
  end if;

  insert into public.post_promotions(
    post_id,purchaser_id,plan,status,amount_aud,priority,
    radius_km,duration_hours,target_label,idempotency_key
  )
  values(
    p_post_id,uid,p_plan,'PENDING_PAYMENT',amount_value,priority_value,
    radius_value,duration_value,nullif(trim(coalesce(p_target_label,'')),''),
    p_idempotency_key
  )
  returning * into created;

  return query
  select created.id,created.amount_aud,created.priority,created.radius_km,
         created.duration_hours,created.status,created.stripe_checkout_session_id,false;
end
$$;

revoke all on function public.create_post_promotion(uuid,text,text,text)
from public,anon;
grant execute on function public.create_post_promotion(uuid,text,text,text)
to authenticated;
