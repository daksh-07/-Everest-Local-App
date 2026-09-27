-- Everest Local: single-account admin identity + MFA authorization hardening
-- The UUID is the authoritative identity. Email is intentionally not used for authorization.

create or replace function public.is_admin_identity()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and id = '716edb35-a0cb-4cbf-99b2-41fa8500ffd3'::uuid
      and role = 'ADMIN'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_identity()
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

create or replace function public.get_my_access_context()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); profile_role public.app_role; business_id uuid; business_name text; business_status public.business_status; business_verification public.verification_status; driver_status text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform public.refresh_driver_verification_status(uid);
  select role into profile_role from public.profiles where id=uid;
  select b.id,b.name,b.status,b.verification_status into business_id,business_name,business_status,business_verification
    from public.business_members bm join public.businesses b on b.id=bm.business_id
    where bm.user_id=uid and bm.member_role='OWNER' order by b.created_at desc limit 1;
  select status into driver_status from public.driver_applications where user_id=uid;
  return jsonb_build_object(
    'profile_role',profile_role,'business_id',business_id,'business_name',business_name,'business_status',business_status,
    'business_verification_status',business_verification,'driver_application_status',driver_status,
    'is_business_member',exists(select 1 from public.business_members where user_id=uid),
    'is_verified_business',coalesce(business_verification='VERIFIED',false),
    'is_active_driver',public.driver_is_operational(uid),
    'is_authorized_admin',public.is_admin_identity(),'is_admin',public.is_admin()
  );
end;
$$;

drop policy if exists profiles_self on public.profiles;
drop policy if exists profiles_self_select on public.profiles;
drop policy if exists profiles_self_update on public.profiles;
drop policy if exists profiles_admin_select on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;

create policy profiles_self_select on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.is_admin());

create policy profiles_self_update on public.profiles for update to authenticated
using ((id = (select auth.uid()) and role <> 'ADMIN') or public.is_admin())
with check ((id = (select auth.uid()) and role <> 'ADMIN') or public.is_admin());

revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create or replace function public.enforce_single_admin_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'ADMIN' and new.id <> '716edb35-a0cb-4cbf-99b2-41fa8500ffd3'::uuid then
    raise exception 'Admin authorization required';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_single_admin_identity_trigger on public.profiles;
create trigger enforce_single_admin_identity_trigger
before insert or update of id, role on public.profiles
for each row execute function public.enforce_single_admin_identity();

create or replace function public.can_delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if public.is_admin_identity() then return false; end if;
  if exists(select 1 from public.businesses where owner_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.business_members where user_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.orders where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.bookings where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.service_requests where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.quotes where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.reviews where author_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.messages where sender_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.conversations where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.delivery_assignments where driver_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.payments where customer_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.payouts p join public.businesses b on b.id=p.business_id where b.owner_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.admin_actions where admin_id=auth.uid()) then return false; end if;
  if exists(select 1 from public.audit_logs where actor_id=auth.uid()) then return false; end if;
  return true;
end;
$$;

revoke execute on function public.is_admin_identity() from public, anon;
grant execute on function public.is_admin_identity() to authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
