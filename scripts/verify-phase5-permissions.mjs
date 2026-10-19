// Execute the exact review migration in disposable PostgreSQL (PGlite).
// Focused schema fixtures exercise roles/RLS/API grants, never production data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
const migration=(await fs.readdir('supabase/migrations')).find(name=>name.endsWith('_phase5_public_discovery.sql'));
try{
 await db.exec(`
 create role anon; create role authenticated;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated;
 grant execute on function auth.uid() to anon,authenticated;
 create table public.profiles(id uuid primary key,role text);
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb) $$;
 create table public.businesses(id uuid primary key,name text,description text,logo_url text,suburb text,status text,verification_status text);
 create table public.services(id uuid primary key,business_id uuid,name text,description text,base_price numeric,active boolean);
 create table public.products(id uuid primary key,business_id uuid,name text,description text,price numeric,sale_price numeric,status text);
 create table public.public_profiles(id uuid,display_name text,username text,bio text,avatar_url text,visibility text);
 create table public.user_social_preferences(user_id uuid,search_visible boolean);
 create table public.posts(id uuid,author_id uuid,business_id uuid,caption text,post_type text,status text,visibility text);
 create table public.post_media(post_id uuid,media_type text);
 create table public.service_booking_settings(service_id uuid,instant_booking_enabled boolean,updated_by uuid,operational_secret text);
 create function public.is_admin_identity() returns boolean language sql as $$select false$$;
 create function public.is_admin() returns boolean language sql security definer set search_path='' as $$select public.is_admin_identity()$$;
 create function public.users_blocked(a uuid,b uuid) returns boolean language sql as $$select false$$;
 revoke all on function public.is_admin(),public.is_admin_identity(),public.users_blocked(uuid,uuid) from public,anon;
 grant execute on function public.is_admin(),public.users_blocked(uuid,uuid) to authenticated;
 alter table public.businesses enable row level security;
 alter table public.services enable row level security;
 alter table public.service_booking_settings enable row level security;
 create policy business_public on public.businesses for select using ((status='ACTIVE' and verification_status='VERIFIED') or public.is_admin());
 create policy service_public on public.services for select using(active and exists(select 1 from public.businesses b where b.id=business_id));
 grant select on public.businesses,public.services to anon,authenticated;
 insert into public.businesses values
 ('10000000-0000-4000-8000-000000000001','Public garden',null,null,'Carlton','ACTIVE','VERIFIED'),
 ('10000000-0000-4000-8000-000000000002','Private garden',null,null,'Carlton','SUSPENDED','VERIFIED'),
 ('10000000-0000-4000-8000-000000000003','Unverified garden',null,null,'Carlton','ACTIVE','PENDING');
 insert into public.services select ('20000000-0000-4000-8000-'||right(id::text,12))::uuid,id,'Garden service',null,90,true from public.businesses;
 insert into public.services values('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Inactive garden',null,50,false);
 insert into public.products select ('30000000-0000-4000-8000-'||right(id::text,12))::uuid,id,'Garden kit',null,20,null,'ACTIVE' from public.businesses;
 insert into public.products values('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Draft garden',null,20,null,'DRAFT');
 insert into public.service_booking_settings select id,true,null,'private operations' from public.services;
 insert into public.public_profiles values('40000000-0000-4000-8000-000000000001','Garden person','gardenperson','bio',null,'PUBLIC');
 insert into public.user_social_preferences select id,true from public.public_profiles;
 insert into public.posts values('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',null,'Garden community','UPDATE','PUBLISHED','PUBLIC');
 `);
 // Use the real main-branch identity and password+MFA predicates, not a
 // permissive stand-in, when checking the restored boolean execute grant.
 const identitySource=await fs.readFile('supabase/migrations/20260920125431_20260920240000_secure_single_account_admin_mfa.sql','utf8');
 const adminSource=await fs.readFile('supabase/migrations/20260920125633_20260920241000_require_password_plus_mfa_for_admin.sql','utf8');
 const definition=(source,name)=>{const start=source.indexOf('create or replace function public.'+name+'()');return source.slice(start,source.indexOf('$$;',start)+3)};
 await db.exec(definition(identitySource,'is_admin_identity'));
 await db.exec(definition(adminSource,'is_admin'));
 await db.exec("insert into public.profiles values('716edb35-a0cb-4cbf-99b2-41fa8500ffd3','ADMIN')");
 await db.exec('set role anon');
 await assert.rejects(db.query('select id from public.businesses'),/permission denied for function is_admin/);
 await db.exec('reset role');
 await db.exec(await fs.readFile('supabase/migrations/'+migration,'utf8'));
 await db.exec('set role anon');
 assert.equal((await db.query('select public.is_admin() value')).rows[0].value,false);
 assert.equal((await db.query('select id from public.businesses')).rows.length,1);
 const rows=(await db.query("select * from public.universal_search('garden','TOP',100,-10)")).rows;
 assert.deepEqual(rows.map(r=>r.kind).sort(),['BUSINESS','PRODUCT','SERVICE']);
 assert.equal(rows.some(r=>/Private|Unverified|Inactive|Draft/.test(r.title)),false);
 for(const kind of ['PERSON','POST','VIDEO'])assert.equal((await db.query('select * from public.universal_search($1,$2)', ['garden',kind])).rows.length,0);
 assert.equal((await db.query("select * from public.universal_search('garden','TOP',1,0)")).rows.length,1);
 assert.equal((await db.query('select service_id,instant_booking_enabled from public.service_booking_settings')).rows.length,1);
 await assert.rejects(db.query('select updated_by from public.service_booking_settings'),/permission denied/);
 await assert.rejects(db.query('select * from public.service_booking_settings'),/permission denied/);
 await assert.rejects(db.query('select public.is_admin_identity()'),/permission denied/);
 await assert.rejects(db.query('select * from public.user_social_preferences'),/permission denied/);
 await assert.rejects(db.query("update public.businesses set name='changed'"),/permission denied/);
 await assert.rejects(db.query('delete from public.services'),/permission denied/);
 await db.exec("reset role;set role authenticated;set request.jwt.claim.sub='60000000-0000-4000-8000-000000000001'");
 assert.equal((await db.query("select * from public.universal_search('garden','PERSON')")).rows.length,1);
 assert.equal((await db.query("select * from public.universal_search('garden','POST')")).rows.length,1);
 assert.equal((await db.query("select * from public.universal_search('','PERSON')")).rows.length,0);
 await db.exec("set request.jwt.claim.sub='716edb35-a0cb-4cbf-99b2-41fa8500ffd3';set request.jwt.claims='{\"aal\":\"aal1\",\"amr\":[{\"method\":\"password\"}]}'");
 assert.equal((await db.query('select public.is_admin() value')).rows[0].value,false,'Password alone is not admin authorization');
 await db.exec("set request.jwt.claims='{\"aal\":\"aal2\",\"amr\":[]}'");
 assert.equal((await db.query('select public.is_admin() value')).rows[0].value,false,'MFA without password is not admin authorization');
 await db.exec("set request.jwt.claims='{\"aal\":\"aal2\",\"amr\":[{\"method\":\"password\"}]}'");
 assert.equal((await db.query('select public.is_admin() value')).rows[0].value,true,'Existing fully authenticated admin behavior is retained');
 console.log('PASS exact discovery migration: missing predicate permission reproduced; anonymous verified-only listings, private branches excluded, column grants/RLS, write denial, admin denial, pagination, signed-in people/community, blank-people privacy, and the real main-branch password/MFA admin predicates. Disposable PostgreSQL fixtures only.');
}finally{await db.close()}
