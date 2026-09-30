-- Enforce Business Ops employee permissions at authoritative mutation boundaries.
-- Trusted service-role/database automation has no auth.uid() and remains unaffected.

create or replace function public.enforce_business_controlled_mutation_permission()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  bid uuid;
  parent_id uuid;
  allowed boolean:=false;
begin
  if auth.uid() is null or public.is_admin() then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_table_name in ('products','services','service_areas') then
    if tg_op='DELETE' then bid:=old.business_id; else bid:=new.business_id; end if;

    if tg_table_name='service_areas' then
      allowed:=public.has_business_permission(bid,'CATALOG_MANAGE')
        or public.has_business_permission(bid,'SETTINGS_MANAGE');
    else
      allowed:=public.has_business_permission(bid,'CATALOG_MANAGE');
    end if;

  elsif tg_table_name in ('product_images','product_variants') then
    if tg_op='DELETE' then parent_id:=old.product_id; else parent_id:=new.product_id; end if;
    select p.business_id into bid from public.products p where p.id=parent_id;
    allowed:=public.has_business_permission(bid,'CATALOG_MANAGE');

  elsif tg_table_name='service_booking_settings' then
    if tg_op='DELETE' then parent_id:=old.service_id; else parent_id:=new.service_id; end if;
    select s.business_id into bid from public.services s where s.id=parent_id;
    allowed:=public.has_business_permission(bid,'CATALOG_MANAGE');

  elsif tg_table_name='business_booking_settings' then
    if tg_op='DELETE' then bid:=old.business_id; else bid:=new.business_id; end if;
    allowed:=public.has_business_permission(bid,'SETTINGS_MANAGE');

  elsif tg_table_name='business_availability' then
    if tg_op='DELETE' then bid:=old.business_id; else bid:=new.business_id; end if;
    allowed:=public.has_business_permission(bid,'JOB_ASSIGN')
      or public.has_business_permission(bid,'SETTINGS_MANAGE');

  elsif tg_table_name='business_dm_settings' then
    if tg_op='DELETE' then bid:=old.business_id; else bid:=new.business_id; end if;
    allowed:=public.has_business_permission(bid,'SETTINGS_MANAGE');

  else
    raise exception 'Unsupported permission-guard table: %',tg_table_name;
  end if;

  if bid is null or not coalesce(allowed,false) then
    raise exception 'Business permission denied';
  end if;

  return case when tg_op='DELETE' then old else new end;
end
$$;

revoke all on function public.enforce_business_controlled_mutation_permission()
from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'products','services','service_areas','product_images','product_variants',
    'service_booking_settings','business_booking_settings','business_availability',
    'business_dm_settings'
  ]
  loop
    execute format('drop trigger if exists trg_business_controlled_permission on public.%I',t);
    execute format(
      'create trigger trg_business_controlled_permission before insert or update or delete on public.%I for each row execute function public.enforce_business_controlled_mutation_permission()',
      t
    );
  end loop;
end
$$;

-- Direct Data API writes must match the same employee capabilities.

drop policy if exists product_images_business_insert on public.product_images;
create policy product_images_business_insert on public.product_images
for insert to authenticated
with check(
  exists(
    select 1 from public.products p
    where p.id=product_images.product_id
      and (public.has_business_permission(p.business_id,'CATALOG_MANAGE') or public.is_admin())
  )
);

drop policy if exists product_images_business_update on public.product_images;
create policy product_images_business_update on public.product_images
for update to authenticated
using(
  exists(
    select 1 from public.products p
    where p.id=product_images.product_id
      and (public.has_business_permission(p.business_id,'CATALOG_MANAGE') or public.is_admin())
  )
)
with check(
  exists(
    select 1 from public.products p
    where p.id=product_images.product_id
      and (public.has_business_permission(p.business_id,'CATALOG_MANAGE') or public.is_admin())
  )
);

drop policy if exists product_images_business_delete on public.product_images;
create policy product_images_business_delete on public.product_images
for delete to authenticated
using(
  exists(
    select 1 from public.products p
    where p.id=product_images.product_id
      and (public.has_business_permission(p.business_id,'CATALOG_MANAGE') or public.is_admin())
  )
);

drop policy if exists product_variants_business_insert on public.product_variants;
create policy product_variants_business_insert on public.product_variants
for insert to authenticated
with check(
  exists(
    select 1 from public.products p
    where p.id=product_variants.product_id
      and (public.has_business_permission(p.business_id,'CATALOG_MANAGE') or public.is_admin())
  )
);

drop policy if exists product_variants_business_update on public.product_variants;
create policy product_variants_business_update on public.product_variants
for update to authenticated
using(
  exists(
    select 1 from public.products p
    where p.id=product_variants.product_id
      and (public.has_business_permission(p.business_id,'CATALOG_MANAGE') or public.is_admin())
  )
)
with check(
  exists(
    select 1 from public.products p
    where p.id=product_variants.product_id
      and (public.has_business_permission(p.business_id,'CATALOG_MANAGE') or public.is_admin())
  )
);

drop policy if exists product_variants_business_delete on public.product_variants;
create policy product_variants_business_delete on public.product_variants
for delete to authenticated
using(
  exists(
    select 1 from public.products p
    where p.id=product_variants.product_id
      and (public.has_business_permission(p.business_id,'CATALOG_MANAGE') or public.is_admin())
  )
);

drop policy if exists areas_business_insert on public.service_areas;
create policy areas_business_insert on public.service_areas
for insert to authenticated
with check(
  public.has_business_permission(business_id,'CATALOG_MANAGE')
  or public.has_business_permission(business_id,'SETTINGS_MANAGE')
  or public.is_admin()
);

drop policy if exists areas_business_update on public.service_areas;
create policy areas_business_update on public.service_areas
for update to authenticated
using(
  public.has_business_permission(business_id,'CATALOG_MANAGE')
  or public.has_business_permission(business_id,'SETTINGS_MANAGE')
  or public.is_admin()
)
with check(
  public.has_business_permission(business_id,'CATALOG_MANAGE')
  or public.has_business_permission(business_id,'SETTINGS_MANAGE')
  or public.is_admin()
);

drop policy if exists areas_business_delete on public.service_areas;
create policy areas_business_delete on public.service_areas
for delete to authenticated
using(
  public.has_business_permission(business_id,'CATALOG_MANAGE')
  or public.has_business_permission(business_id,'SETTINGS_MANAGE')
  or public.is_admin()
);

drop policy if exists business_availability_member_insert on public.business_availability;
create policy business_availability_member_insert on public.business_availability
for insert to authenticated
with check(
  public.has_business_permission(business_id,'JOB_ASSIGN')
  or public.has_business_permission(business_id,'SETTINGS_MANAGE')
  or public.is_admin()
);

drop policy if exists business_availability_member_update on public.business_availability;
create policy business_availability_member_update on public.business_availability
for update to authenticated
using(
  public.has_business_permission(business_id,'JOB_ASSIGN')
  or public.has_business_permission(business_id,'SETTINGS_MANAGE')
  or public.is_admin()
)
with check(
  public.has_business_permission(business_id,'JOB_ASSIGN')
  or public.has_business_permission(business_id,'SETTINGS_MANAGE')
  or public.is_admin()
);

drop policy if exists business_availability_member_delete on public.business_availability;
create policy business_availability_member_delete on public.business_availability
for delete to authenticated
using(
  public.has_business_permission(business_id,'JOB_ASSIGN')
  or public.has_business_permission(business_id,'SETTINGS_MANAGE')
  or public.is_admin()
);

drop policy if exists business_dm_settings_member_insert on public.business_dm_settings;
create policy business_dm_settings_member_insert on public.business_dm_settings
for insert to authenticated
with check(public.has_business_permission(business_id,'SETTINGS_MANAGE') or public.is_admin());

drop policy if exists business_dm_settings_member_update on public.business_dm_settings;
create policy business_dm_settings_member_update on public.business_dm_settings
for update to authenticated
using(public.has_business_permission(business_id,'SETTINGS_MANAGE') or public.is_admin())
with check(public.has_business_permission(business_id,'SETTINGS_MANAGE') or public.is_admin());

create or replace function public.set_business_website(p_business_id uuid,p_website_url text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare clean_url text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not (
    public.has_business_permission(p_business_id,'SETTINGS_MANAGE')
    or public.has_business_permission(p_business_id,'CATALOG_MANAGE')
    or public.is_admin()
  ) then
    raise exception 'Not authorized';
  end if;

  clean_url:=public.normalize_public_website(p_website_url);
  update public.businesses
  set website_url=clean_url,updated_at=now()
  where id=p_business_id;

  if not found then raise exception 'Business not found'; end if;
  return true;
end
$$;

revoke all on function public.set_business_website(uuid,text) from public,anon;
grant execute on function public.set_business_website(uuid,text) to authenticated;
