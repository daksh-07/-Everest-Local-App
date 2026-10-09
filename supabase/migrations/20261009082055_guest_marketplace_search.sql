-- Let guests discover only public verified marketplace listings.
-- People and community results still require an authenticated session.
create or replace function public.universal_search(p_query text,p_kind text default 'TOP',p_limit int default 20,p_offset int default 0)
returns table(kind text,id uuid,title text,subtitle text,score int,metadata jsonb)
language sql stable security definer set search_path='' as $$
with q as (select lower(trim(coalesce(p_query,''))) t),
people as (
 select 'PERSON'::text as kind,pp.id as id,coalesce(pp.display_name,'Everest member') as title,
   case when pp.username is not null then '@'||pp.username else coalesce(pp.bio,'Person') end as subtitle,
   (case when lower(coalesce(pp.display_name,''))=(select t from q) then 100 when lower(coalesce(pp.display_name,'')) like (select t from q)||'%' then 80 else 50 end)::int as score,
   jsonb_build_object('avatar_url',pp.avatar_url,'username',pp.username) as metadata
 from public.public_profiles pp
 join public.user_social_preferences sp on sp.user_id=pp.id
 where (select t from q)<>''
 and pp.visibility='PUBLIC' and sp.search_visible
 and not public.users_blocked(auth.uid(),pp.id)
 and (lower(coalesce(pp.display_name,'')) like '%'||(select t from q)||'%' or lower(coalesce(pp.username,'')) like '%'||(select t from q)||'%' or lower(coalesce(pp.bio,'')) like '%'||(select t from q)||'%')
),
businesses_q as (
 select 'BUSINESS',b.id,b.name,coalesce(b.description,'Registered Everest business'),
  (case when lower(b.name)=(select t from q) then 100 when lower(b.name) like (select t from q)||'%' then 80 else 50 end)::int,
  jsonb_build_object('logo_url',b.logo_url,'suburb',b.suburb,'verified',b.verification_status='VERIFIED')
 from public.businesses b where b.status='ACTIVE' and b.verification_status='VERIFIED'
 and ((select t from q)='' or lower(b.name) like '%'||(select t from q)||'%' or lower(coalesce(b.description,'')) like '%'||(select t from q)||'%' or lower(coalesce(b.suburb,'')) like '%'||(select t from q)||'%')
),
services_q as (
 select 'SERVICE',s.id,s.name,coalesce(s.description,'Service'),60,jsonb_build_object('business_id',s.business_id,'base_price',s.base_price)
 from public.services s join public.businesses b on b.id=s.business_id
 where s.active and b.status='ACTIVE' and b.verification_status='VERIFIED'
 and ((select t from q)='' or lower(s.name) like '%'||(select t from q)||'%' or lower(coalesce(s.description,'')) like '%'||(select t from q)||'%')
),
posts_q as (
 select case when exists(select 1 from public.post_media pm where pm.post_id=p.id and pm.media_type='VIDEO') then 'VIDEO' else 'POST' end,
 p.id,coalesce(nullif(p.caption,''),replace(p.post_type,'_',' ')),replace(p.post_type,'_',' '),45,
 jsonb_build_object('author_id',p.author_id,'business_id',p.business_id)
 from public.posts p where p.status='PUBLISHED' and p.visibility='PUBLIC'
 and not public.users_blocked(auth.uid(),p.author_id)
 and (p.business_id is null or exists(select 1 from public.businesses b where b.id=p.business_id and b.status='ACTIVE' and b.verification_status='VERIFIED'))
 and ((select t from q)='' or lower(coalesce(p.caption,'')) like '%'||(select t from q)||'%')
),
products_q as (
 select 'PRODUCT',p.id,p.name,coalesce(p.description,'Product'),50,jsonb_build_object('business_id',p.business_id,'price',p.price,'sale_price',p.sale_price)
 from public.products p join public.businesses b on b.id=p.business_id
 where p.status='ACTIVE' and b.status='ACTIVE' and b.verification_status='VERIFIED'
 and ((select t from q)='' or lower(p.name) like '%'||(select t from q)||'%' or lower(coalesce(p.description,'')) like '%'||(select t from q)||'%')
),
all_rows as (
 select * from people union all select * from businesses_q union all select * from services_q union all select * from posts_q union all select * from products_q
)
select * from all_rows
where (auth.uid() is not null or kind in ('BUSINESS','SERVICE','PRODUCT'))
  and (upper(coalesce(p_kind,'TOP')) in ('TOP','ALL') or kind=upper(p_kind))
order by score desc,lower(title),id
limit least(greatest(p_limit,1),50) offset greatest(p_offset,0);
$$;
revoke all on function public.universal_search(text,text,int,int) from public,anon;
grant execute on function public.universal_search(text,text,int,int) to anon,authenticated;

-- The public business profile needs this flag to offer the right booking action.
-- Keep operational settings and the editor's user ID private.
grant select(service_id,instant_booking_enabled)
on public.service_booking_settings to anon;
create policy service_booking_settings_guest_read
on public.service_booking_settings for select to anon
using (
  exists (
    select 1 from public.services s
    join public.businesses b on b.id=s.business_id
    where s.id=service_id and s.active
      and b.status='ACTIVE' and b.verification_status='VERIFIED'
  )
);
