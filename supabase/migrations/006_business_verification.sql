create or replace function public.create_business_profile(p_name text,p_description text,p_category_id uuid,p_abn text,p_phone text,p_email text,p_suburb text,p_city text,p_state text,p_postcode text)
returns uuid language plpgsql security definer set search_path=public as $$
declare bid uuid; slug_base text; new_slug text; n integer:=0;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(trim(p_name))<2 or length(trim(p_name))>120 then raise exception 'Invalid business name'; end if;
 slug_base:=regexp_replace(lower(trim(p_name)),'[^a-z0-9]+','-','g');new_slug:=slug_base;
 while exists(select 1 from public.businesses where slug=new_slug) loop n:=n+1;new_slug:=slug_base||'-'||n;end loop;
 insert into public.businesses(owner_id,name,slug,description,category_id,abn,phone,email,suburb,city,state,postcode) values(auth.uid(),trim(p_name),new_slug,trim(p_description),p_category_id,nullif(trim(p_abn),''),nullif(trim(p_phone),''),nullif(trim(p_email),''),trim(p_suburb),trim(p_city),trim(p_state),nullif(trim(p_postcode),'')) returning id into bid;
 insert into public.business_members(business_id,user_id,member_role) values(bid,auth.uid(),'OWNER');
 update public.profiles set role='BUSINESS',updated_at=now() where id=auth.uid() and role='CUSTOMER';
 return bid;
end; $$;

grant execute on function public.create_business_profile(text,text,uuid,text,text,text,text,text,text,text) to authenticated;

create or replace function public.submit_business_verification(p_business_id uuid,p_abn text,p_documents jsonb default '[]'::jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare vid uuid;
begin
 if not public.is_business_member(p_business_id) and not public.is_admin() then raise exception 'Not authorized'; end if;
 if exists(select 1 from public.business_verifications where business_id=p_business_id and status='PENDING') then raise exception 'Verification already pending'; end if;
 insert into public.business_verifications(business_id,submitted_by,status,abn,documents) values(p_business_id,auth.uid(),'PENDING',nullif(trim(p_abn),''),coalesce(p_documents,'[]'::jsonb)) returning id into vid;
 update public.businesses set verification_status='PENDING',updated_at=now() where id=p_business_id;
 return vid;
end; $$;
grant execute on function public.submit_business_verification(uuid,text,jsonb) to authenticated;

create or replace function public.admin_set_verification(p_business_id uuid,p_status public.verification_status,p_notes text default null) returns boolean language plpgsql security definer set search_path=public as $$
begin
 if not public.is_admin() then raise exception 'Admin authorization required'; end if;
 update public.businesses set verification_status=p_status,updated_at=now() where id=p_business_id;
 update public.business_verifications set status=p_status,admin_notes=p_notes,reviewed_by=auth.uid(),reviewed_at=now() where id=(select id from public.business_verifications where business_id=p_business_id order by created_at desc limit 1);
 insert into public.admin_actions(admin_id,action,target_type,target_id,metadata) values(auth.uid(),'business_verification','business',p_business_id,jsonb_build_object('status',p_status));
 return true;
end; $$;
grant execute on function public.admin_set_verification(uuid,public.verification_status,text) to authenticated;
