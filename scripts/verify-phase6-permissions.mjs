// Execute the exact review migration in disposable PostgreSQL (PGlite).
// Focused schema fixtures exercise roles/RLS/API grants, never production data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {db}=process.env.PHASE6_DATABASE_URL?await (await import('./lib/phase6-postgres.mjs')).disposablePostgres():{db:new (await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')).PGlite()};
const tests=[];async function check(name,run){try{await run();tests.push({name,pass:true});}catch(error){tests.push({name,pass:false,error:error.message});throw error;}}
const migration=(await fs.readdir('supabase/migrations')).find(name=>name.endsWith('_phase5_public_discovery.sql'));
try{
 await db.exec(`
 do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;end if;if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated;end if;end$$;
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

 const socialSource=await fs.readFile('supabase/migrations/20260924220801_universal_search_connections_messaging.sql','utf8');
 await db.exec('create table user_blocks(blocker_id uuid,blocked_id uuid);drop function public.users_blocked(uuid,uuid)');const blockStart=socialSource.indexOf('create or replace function public.users_blocked(');await db.exec(socialSource.slice(blockStart,socialSource.indexOf('$$;',blockStart)+3));
 await db.exec('set role anon');
 await check('baseline anon business read fails missing predicate permission',()=>assert.rejects(db.query('select id from businesses'),/permission denied for function is_admin/));
 await db.exec('reset role');await db.exec(await fs.readFile('supabase/migrations/'+migration,'utf8'));
 // Private, nonsearchable and follower-only fixtures must not leak through SECURITY DEFINER.
 await db.exec(`insert into public.public_profiles values
 ('40000000-0000-4000-8000-000000000002','Private garden person',null,'private',null,'PRIVATE'),
 ('40000000-0000-4000-8000-000000000003','Optout garden person',null,'private',null,'PUBLIC');
 insert into public.user_social_preferences values('40000000-0000-4000-8000-000000000002',true),('40000000-0000-4000-8000-000000000003',false);
 insert into public.posts values('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001',null,'Private garden post','UPDATE','PUBLISHED','FOLLOWERS');`);
 const identities=[['guest','anon',''],['customer','authenticated','60000000-0000-4000-8000-000000000001'],['provider','authenticated','60000000-0000-4000-8000-000000000002'],['staff','authenticated','60000000-0000-4000-8000-000000000003'],['administrator','authenticated','716edb35-a0cb-4cbf-99b2-41fa8500ffd3']];
 for(const [label,role,uid] of identities){
  await db.exec('reset role;set role '+role);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({aal:label==='administrator'?'aal2':'aal1',amr:[{method:'password'}]})]);
  await check(label+' search exposes only intended public results',async()=>{const rows=(await db.query("select * from universal_search('garden','TOP',100,-1)")).rows;assert.deepEqual(rows.map(row=>row.kind).sort(),label==='guest'?['BUSINESS','PRODUCT','SERVICE']:['BUSINESS','PERSON','POST','PRODUCT','SERVICE'].sort());assert.equal(rows.some(row=>/Private|Optout|Unverified|Inactive|Draft/.test(row.title)),false);for(const row of rows)assert.ok(Object.keys(row.metadata).every(key=>['avatar_url','username','logo_url','suburb','verified','business_id','base_price','author_id','price','sale_price'].includes(key)));});
  await check(label+' cannot read private preferences',()=>assert.rejects(db.query('select * from user_social_preferences'),/permission denied/));
  await check(label+' cannot use discovery grants to write business or service',async()=>{await assert.rejects(db.query("update businesses set name='Injected'"),/permission denied/);await assert.rejects(db.query('delete from services'),/permission denied/);});
  await check(label+' cannot execute identity predicate directly',()=>assert.rejects(db.query('select is_admin_identity()'),/permission denied/));
  if(label==='guest'){
   await check('guest booking settings have exact two-column allowlist',async()=>{const rows=(await db.query('select service_id,instant_booking_enabled from service_booking_settings')).rows;assert.equal(rows.length,1);await assert.rejects(db.query('select * from service_booking_settings'),/permission denied/);await assert.rejects(db.query('select updated_by from service_booking_settings'),/permission denied/);await assert.rejects(db.query('update service_booking_settings set instant_booking_enabled=false'),/permission denied/);});
   await check('guest cannot access any people/community search branch',async()=>{for(const kind of ['PERSON','POST','VIDEO'])assert.equal((await db.query('select * from universal_search($1,$2)', ['garden',kind])).rows.length,0);});
   await check('guest admin boolean is false',async()=>assert.equal((await db.query('select is_admin() value')).rows[0].value,false));
   await check('search pagination clamp and invalid kind are safe',async()=>{assert.equal((await db.query("select * from universal_search('garden','TOP',1,-1)")).rows.length,1);assert.equal((await db.query("select * from universal_search('garden','NOT_A_KIND')")).rows.length,0);});
  }
  if(label==='administrator'){
   await check('administrator requires password plus MFA',async()=>{for(const claims of [{aal:'aal1',amr:[{method:'password'}]},{aal:'aal2',amr:[]}]){await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);assert.equal((await db.query('select is_admin() value')).rows[0].value,false);}await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({aal:'aal2',amr:[{method:'password'}]})]);assert.equal((await db.query('select is_admin() value')).rows[0].value,true);});
  }
 }
 await db.exec("reset role;insert into user_blocks values('60000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001');set role authenticated;set request.jwt.claim.sub='60000000-0000-4000-8000-000000000001'");
 await check('blocked person and authored community are excluded',async()=>{const rows=(await db.query("select kind from universal_search('garden','TOP')")).rows;assert.deepEqual(rows.map(row=>row.kind).sort(),['BUSINESS','PRODUCT','SERVICE']);});
 await db.exec('reset role');
 await check('public function grants remain restricted to explicit roles',async()=>{const rows=(await db.query("select has_function_privilege('anon','universal_search(text,text,integer,integer)','EXECUTE') allowed, has_column_privilege('anon','service_booking_settings','operational_secret','SELECT') secret")).rows;assert.equal(rows[0].allowed,true);assert.equal(rows[0].secret,false);});
}finally{
 const report={scope:(process.env.PHASE6_DATABASE_URL?'PostgreSQL 17 loopback':'PGlite')+'; synthetic JWT settings and focused schema, not live Supabase sessions',note:'Provider/staff are authenticated identities here; discovery grants add no business-role privileges. Membership operational authorization is tested separately.',tests,passed:tests.filter(test=>test.pass).length,failed:tests.filter(test=>!test.pass).length};
 const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/phase6-permissions';await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/discovery-permissions.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await db.close();
}
