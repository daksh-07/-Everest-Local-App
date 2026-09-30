-- public_profiles is used as a lightweight identity lookup by feeds/comments.
-- Sensitive profile fields must be returned through privacy-aware RPCs instead of
-- being directly selectable from PostgREST.

revoke select on public.public_profiles from anon,authenticated;

grant select(id,display_name,avatar_url,username,visibility)
on public.public_profiles
to anon,authenticated;

drop policy if exists public_profiles_public_read on public.public_profiles;
create policy public_profiles_public_read
on public.public_profiles
for select
to anon,authenticated
using(
  visibility='PUBLIC'
  or id=auth.uid()
);
