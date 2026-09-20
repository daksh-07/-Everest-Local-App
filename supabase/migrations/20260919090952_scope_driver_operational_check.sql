create or replace function public.driver_is_operational(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_user_id<>auth.uid() and not public.is_admin() then raise exception 'Not authorized'; end if;
  return exists(
    select 1 from public.driver_applications a
    join public.driver_verifications v on v.application_id=a.id
    join public.driver_vehicles dv on dv.application_id=a.id
    where a.user_id=p_user_id and a.status='APPROVED'
      and (not (select require_identity_review from public.driver_verification_requirements where id=true) or (v.identity_status='VERIFIED' and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='PROFILE_PHOTO' and d.status='VERIFIED')))
      and v.licence_status='VERIFIED'
      and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='LICENCE_FRONT' and d.status='VERIFIED' and d.expires_at is not null and d.expires_at>=current_date)
      and v.registration_status='VERIFIED'
      and dv.status='VERIFIED'
      and dv.registration_status='CURRENT'
      and dv.registration_expiry is not null and dv.registration_expiry>=current_date
      and (dv.ctp_expiry is null or dv.ctp_expiry>=current_date)
      and (not (select require_additional_insurance from public.driver_verification_requirements where id=true) or (v.insurance_status='VERIFIED' and exists(select 1 from public.driver_documents d where d.application_id=a.id and d.document_type='INSURANCE' and d.status='VERIFIED' and d.expires_at is not null and d.expires_at>=current_date)))
      and not exists(select 1 from public.driver_documents d where d.application_id=a.id and d.status='MORE_INFORMATION_REQUIRED')
  );
end;
$$;
revoke execute on function public.driver_is_operational(uuid) from public,anon;
grant execute on function public.driver_is_operational(uuid) to authenticated;