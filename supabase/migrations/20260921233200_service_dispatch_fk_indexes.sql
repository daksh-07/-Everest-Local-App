create index if not exists service_dispatch_evaluations_provider_idx on public.service_dispatch_evaluations(provider_id);
create index if not exists service_dispatch_jobs_claimed_provider_idx on public.service_dispatch_jobs(claimed_provider_id);
create index if not exists service_dispatch_offers_provider_idx on public.service_dispatch_offers(provider_id);
create index if not exists service_provider_profiles_business_idx on public.service_provider_profiles(business_id);
