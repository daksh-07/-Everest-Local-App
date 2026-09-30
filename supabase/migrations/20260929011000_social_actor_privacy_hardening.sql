create or replace function public.social_actor_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select coalesce(nullif(trim(pp.display_name),''),'Everest member')
  from public.public_profiles pp
  where pp.id=p_user_id
    and (pp.visibility='PUBLIC' or pp.id=auth.uid())
  limit 1
$$;

create or replace function public.social_actor_avatar(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path=''
as $$
  select pp.avatar_url
  from public.public_profiles pp
  where pp.id=p_user_id
    and (pp.visibility='PUBLIC' or pp.id=auth.uid())
  limit 1
$$;

revoke all on function public.social_actor_name(uuid) from public;
revoke all on function public.social_actor_avatar(uuid) from public;
grant execute on function public.social_actor_name(uuid) to anon,authenticated,service_role;
grant execute on function public.social_actor_avatar(uuid) to anon,authenticated,service_role;
