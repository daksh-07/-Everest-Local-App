-- Atomically creates a business plus its selected taxonomy-backed service offerings and,
-- when required, the shared local service area. All-or-nothing.
create or replace function public.create_business_setup(
  p_name text,p_description text,p_category_id uuid,p_abn text,p_phone text,p_email text,
  p_suburb text,p_city text,p_state text,p_postcode text,p_services jsonb,p_service_area jsonb default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  bid uuid; item jsonb; definition_id uuid; mode public.service_delivery_mode;
  definition_name text; definition_category uuid; has_local boolean := false;
  area_suburb text; area_city text; area_state text; area_postcode text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(coalesce(p_services,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_services,'[]'::jsonb)) < 1 then
    raise exception 'Select at least one service';
  end if;
  bid := public.create_business_profile(p_name,p_description,p_category_id,p_abn,p_phone,p_email,p_suburb,p_city,p_state,p_postcode);
  for item in select value from jsonb_array_elements(p_services) loop
    definition_id := nullif(item->>'service_definition_id','')::uuid;
    mode := coalesce(nullif(item->>'delivery_mode','')::public.service_delivery_mode,'LOCAL');
    select sd.name,sd.category_id into definition_name,definition_category
    from public.service_definitions sd where sd.id=definition_id and sd.active;
    if definition_name is null then raise exception 'Invalid service definition'; end if;
    perform public.create_service(bid,definition_name,'',definition_category,null,null,definition_id,mode);
    if mode in ('LOCAL','BOTH') then has_local := true; end if;
  end loop;
  if has_local then
    if p_service_area is null or jsonb_typeof(p_service_area) <> 'object' then raise exception 'A local service area is required'; end if;
    area_suburb := nullif(trim(p_service_area->>'suburb'),'');
    area_city := nullif(trim(coalesce(p_service_area->>'city',p_city)),'');
    area_state := nullif(trim(coalesce(p_service_area->>'state',p_state)),'');
    area_postcode := nullif(trim(coalesce(p_service_area->>'postcode',p_postcode)),'');
    if area_suburb is null or area_city is null or area_state is null then raise exception 'A valid local service area is required'; end if;
    perform public.add_service_area(bid,area_suburb,area_city,area_state,area_postcode);
  end if;
  return bid;
end; $$;
revoke all on function public.create_business_setup(text,text,uuid,text,text,text,text,text,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.create_business_setup(text,text,uuid,text,text,text,text,text,text,text,jsonb,jsonb) to authenticated;
