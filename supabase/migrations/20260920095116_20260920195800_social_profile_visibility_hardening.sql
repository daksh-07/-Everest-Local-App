create policy public_profiles_public_read
  on public.public_profiles
  for select
  to anon, authenticated
  using (visibility = 'PUBLIC');

revoke execute on function public.get_follow_counts(uuid,uuid) from anon;
grant execute on function public.get_follow_counts(uuid,uuid) to authenticated;