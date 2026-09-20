-- Everest Local: lock the initial admin identity and prevent multiple ADMIN rows.
-- The UUID is the durable authorization boundary. The email check is only an
-- initial deployment invariant and does not grant access based on email.
do $$
declare
  admin_email text;
begin
  select lower(email) into admin_email
  from auth.users
  where id = '716edb35-a0cb-4cbf-99b2-41fa8500ffd3'::uuid;

  if admin_email is distinct from 'dakshgolani5@gmail.com' then
    raise exception 'Configured Everest Local admin identity does not match the intended initial admin account';
  end if;
end $$;

create unique index if not exists profiles_single_admin_role_idx
on public.profiles (role)
where role = 'ADMIN'::public.app_role;
