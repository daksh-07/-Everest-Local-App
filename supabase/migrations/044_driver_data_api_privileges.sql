-- Tighten Data API privileges on sensitive driver/profile tables.
revoke all on public.driver_applications,public.driver_vehicles,public.driver_documents,public.driver_verifications,public.driver_status_history,public.driver_verification_requirements from public,anon,authenticated;
grant select on public.driver_applications,public.driver_vehicles,public.driver_documents,public.driver_verifications,public.driver_status_history,public.driver_verification_requirements to authenticated;

-- Profile role is server-authoritative. Clients may read their profile but cannot mutate it directly.
revoke insert,update,delete,truncation,references,trigger on public.profiles from public,anon,authenticated;
grant select on public.profiles to authenticated;