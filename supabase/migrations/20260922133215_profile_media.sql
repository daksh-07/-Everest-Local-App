-- Public profile and business identity media.
-- Object ownership is enforced by the first path segment, which must equal auth.uid().
-- Only ordinary image formats are accepted and uploads are capped at 5 MB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-media',
  'profile-media',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_media_public_read on storage.objects;
create policy profile_media_public_read
on storage.objects
for select
to public
using (bucket_id = 'profile-media');

drop policy if exists profile_media_owner_insert on storage.objects;
create policy profile_media_owner_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists profile_media_owner_update on storage.objects;
create policy profile_media_owner_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists profile_media_owner_delete on storage.objects;
create policy profile_media_owner_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);


-- Narrow RPCs preserve the existing rule that clients cannot directly mutate public.profiles.
create or replace function public.set_my_profile_avatar(p_avatar_url text)
returns boolean
language plpgsql
security definer
set search_path to public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_avatar_url is not null and p_avatar_url !~ '^https://[^[:space:]]+/storage/v1/object/public/profile-media/' then
    raise exception 'Invalid profile image URL';
  end if;
  update public.profiles
  set avatar_url = nullif(trim(p_avatar_url),''),
      updated_at = now()
  where id = auth.uid();
  return found;
end;
$$;

revoke execute on function public.set_my_profile_avatar(text) from public, anon;
grant execute on function public.set_my_profile_avatar(text) to authenticated;

create or replace function public.set_my_business_logo(p_business_id uuid, p_logo_url text)
returns boolean
language plpgsql
security definer
set search_path to public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_logo_url is not null and p_logo_url !~ '^https://[^[:space:]]+/storage/v1/object/public/profile-media/' then
    raise exception 'Invalid business image URL';
  end if;
  update public.businesses
  set logo_url = nullif(trim(p_logo_url),''),
      updated_at = now()
  where id = p_business_id
    and owner_id = auth.uid();
  return found;
end;
$$;

revoke execute on function public.set_my_business_logo(uuid,text) from public, anon;
grant execute on function public.set_my_business_logo(uuid,text) to authenticated;
