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
