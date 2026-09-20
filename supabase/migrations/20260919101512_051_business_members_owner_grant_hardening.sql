-- Business membership is server-controlled. A user must not be able to claim ownership of an arbitrary business by inserting their own OWNER row.
drop policy if exists business_members_admin_insert on public.business_members;

create policy business_members_admin_insert
on public.business_members
for insert
to authenticated
with check (public.is_admin());

revoke insert, update, delete on public.business_members from anon, authenticated;
grant select on public.business_members to authenticated;
