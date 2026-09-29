-- Internal social identity helpers are used by server-side triggers/functions only.
-- Do not expose them as PostgREST RPCs: SECURITY DEFINER bypasses public_profiles RLS.

revoke all on function public.social_actor_name(uuid) from public,anon,authenticated;
revoke all on function public.social_actor_avatar(uuid) from public,anon,authenticated;

grant execute on function public.social_actor_name(uuid) to service_role;
grant execute on function public.social_actor_avatar(uuid) to service_role;
