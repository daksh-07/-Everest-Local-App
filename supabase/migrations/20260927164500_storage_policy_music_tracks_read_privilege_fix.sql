-- Storage signing evaluates all applicable storage.objects RLS policy expressions.
-- Everest Music policies reference public.music_tracks, so the client roles need
-- SELECT privilege on that table even though RLS still controls row visibility.
-- Without this privilege, unrelated signed URL requests (including post-media
-- and product-media) can fail with permission denied for table music_tracks.

grant select on table public.music_tracks to anon, authenticated;
