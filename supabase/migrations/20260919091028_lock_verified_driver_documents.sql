alter table public.driver_applications drop column if exists profile_photo_path;

drop policy if exists driver_verification_owner_update on storage.objects;
drop policy if exists driver_verification_owner_delete on storage.objects;