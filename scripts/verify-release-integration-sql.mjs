// Focused executable contracts on loopback PostgreSQL. This is not a full-schema
// restore, issued Auth session, PostgREST, storage-server, or realtime acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {disposablePostgres} from './lib/phase6-postgres.mjs';
import {latestFunction} from './lib/phase6-sql-source.mjs';
const {db}=await disposablePostgres();
const results=[];
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const owner=uid(1),viewer=uid(2),admin=uid(3),business=uid(4),post=uid(5);
async function check(name,fn){try{await fn();results.push({name,pass:true})}catch(e){results.push({name,pass:false,error:e.message});throw e}}
async function as(role,id,sql){
 await db.exec(`set role ${role};select set_config('request.jwt.claim.sub','${id??''}',false);`);
 try{return (await db.query(sql)).rows}finally{await db.exec('reset role')}
}
try{
 await db.exec(`
 do $$begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role;end if;end$$;
 create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
 grant usage on schema auth,storage to anon,authenticated;
 create function public.is_admin_identity() returns boolean language sql stable as $$select auth.uid()='${admin}'::uuid$$;
 create table businesses(id uuid primary key,status text,verification_status text);
 create table business_members(business_id uuid,user_id uuid,status text);
 create table products(id uuid primary key,business_id uuid,status text);
 create table inventory(product_id uuid primary key,quantity integer,reserved_quantity integer);
 create table posts(id uuid primary key,author_id uuid,business_id uuid,status text,visibility text);
 create table user_blocks(blocker_id uuid,blocked_id uuid);
 create table follows(follower_id uuid,followed_user_id uuid,business_id uuid);
 create table user_connections(user_a uuid,user_b uuid);
 create table post_collaborators(post_id uuid,status text,collaborator_user_id uuid,collaborator_business_id uuid);
 create table public_profiles(id uuid primary key,visibility text,display_name text,avatar_url text);
 create table profiles(id uuid primary key,full_name text);
 create table story_highlights(owner_id uuid,business_id uuid);
 create table audio_assets(id uuid,owner_id uuid,storage_bucket text,storage_path text);
 create table post_audio_tracks(audio_asset_id uuid,post_id uuid);
 create table storage.objects(id uuid,bucket_id text,name text);
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 create table conversations(id uuid primary key,customer_id uuid,business_id uuid,booking_id uuid);
 create table driver_applications(id uuid primary key,user_id uuid,status text);
 create table driver_verifications(id uuid);
 create table driver_vehicles(id uuid);
 create table driver_documents(id uuid);
 create table stripe_events(event_id text,event_type text,status text,created_at timestamptz,processed_at timestamptz);
 `);
 for(const name of ['is_admin','is_business_member','admin_set_driver_application','admin_set_driver_document_status','admin_set_driver_vehicle_verification','admin_set_driver_verification']){
  await db.exec((await latestFunction(name)).sql);
 }
 // The compliance function's row types/operational dependencies need a complete
 // staging schema. Its grant is checked separately; no simulated admin approval.
 await db.exec(`
 do $$declare f regprocedure;begin for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname like 'admin_set_driver_%' loop execute format('revoke all on function %s from public,anon,authenticated',f);end loop;end$$;
 create function evaluate_driver_compliance(uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
 create function can_access_business_conversation(uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.conversations c where c.id=$1 and (c.customer_id=auth.uid() or public.is_business_member(c.business_id) or public.is_admin()))$$;
 revoke all on function public.is_admin(),public.is_business_member(uuid) from public,anon;
 grant execute on function public.is_admin(),public.is_business_member(uuid) to authenticated;
 alter table inventory enable row level security;alter table posts enable row level security;
 alter table user_blocks enable row level security;alter table follows enable row level security;
 alter table user_connections enable row level security;alter table stripe_events enable row level security;
 create policy blocks on user_blocks for select to authenticated using(blocker_id=auth.uid());
 create policy follows_owner on follows for select to authenticated using(follower_id=auth.uid());
 create policy connections_owner on user_connections for select to authenticated using(user_a=auth.uid() or user_b=auth.uid());
 create policy inventory_business_access on inventory for select using(is_business_member((select business_id from products where id=product_id)) or is_admin());
 grant select on businesses,products,posts,post_collaborators,public_profiles,story_highlights,audio_assets,post_audio_tracks,storage.objects,user_blocks to anon,authenticated;
 grant select on follows,user_connections,inventory to authenticated;
 revoke all on stripe_events from anon,authenticated;
 insert into businesses values('${business}','ACTIVE','VERIFIED'),('${uid(6)}','ACTIVE','UNVERIFIED');
 insert into products values('${uid(7)}','${business}','ACTIVE'),('${uid(8)}','${uid(6)}','ACTIVE'),('${uid(9)}','${business}','DRAFT');
 insert into inventory values('${uid(7)}',5,1),('${uid(8)}',9,0),('${uid(9)}',10,0);
 insert into posts values('${post}','${owner}',null,'PUBLISHED','PUBLIC'),('${uid(10)}','${owner}',null,'PUBLISHED','FOLLOWERS'),('${uid(11)}','${owner}',null,'HIDDEN','PUBLIC');
 insert into profiles values('${owner}','Private Person'),('${viewer}','Viewer Person');
 insert into follows values('${viewer}','${owner}',null);
 insert into user_connections values('${viewer}','${owner}');
 insert into public_profiles values('${owner}','PRIVATE','Secret alias','secret-avatar');
 insert into business_members values('${business}','${viewer}','ACTIVE');
 insert into conversations values('${uid(12)}','${owner}','${business}',null),('${uid(13)}','${owner}','${uid(6)}',null);
 insert into stripe_events values('evt_fixture','fixture','PROCESSED',now(),now());
 `);
 await check('guest stock read reproduces missing privileges before repair',()=>assert.rejects(as('anon',null,'select * from inventory'),/permission denied/));
 for(const suffix of ['restore_public_guest_reads','restore_admin_driver_review_access','business_conversation_customer_names','admin_read_stripe_event_metadata']){
  const file=(await fs.readdir('supabase/migrations')).find(n=>n.endsWith('_'+suffix+'.sql'));
  await db.exec(await fs.readFile('supabase/migrations/'+file,'utf8'));
 }
 await check('guest reads stock only for public verified listings',async()=>assert.deepEqual((await as('anon',null,'select product_id from inventory')).map(x=>x.product_id),[uid(7)]));
 await check('guest cannot write stock',()=>assert.rejects(as('anon',null,'update inventory set quantity=99'),/permission denied/));
 await check('guest cannot inspect follows or connections',async()=>{assert.deepEqual(await as('anon',null,'select * from follows'),[]);assert.deepEqual(await as('anon',null,'select * from user_connections'),[])});
 await check('guest reads published public posts only',async()=>assert.deepEqual((await as('anon',null,'select id from posts')).map(x=>x.id),[post]));
 await check('blocker cannot see blocked author',async()=>{await db.exec(`insert into user_blocks values('${viewer}','${owner}')`);assert.deepEqual(await as('authenticated',viewer,'select id from posts'),[])});
 await check('blocked viewer cannot see blocking author',async()=>{await db.exec(`delete from user_blocks;insert into user_blocks values('${owner}','${viewer}')`);assert.deepEqual(await as('authenticated',viewer,'select id from posts'),[])});
 await check('author retains access to hidden and follower posts',async()=>assert.equal((await as('authenticated',owner,'select id from posts')).length,3));
 await check('block helper answers only for current viewer',async()=>assert.equal((await as('anon',null,`select viewer_blocked_with('${owner}') as blocked`))[0].blocked,false));
 await check('conversation identity hides private alias and avatar',async()=>{const rows=await as('authenticated',viewer,`select * from get_business_conversation_people(array['${uid(12)}','${uid(13)}']::uuid[])`);assert.equal(rows.length,1);assert.equal(rows[0].display_name,'Private P.');assert.equal(rows[0].avatar_url,null)});
 await check('removed membership loses conversation identity access',async()=>{await db.exec(`update business_members set status='REMOVED'`);assert.deepEqual(await as('authenticated',viewer,`select * from get_business_conversation_people(array['${uid(12)}']::uuid[])`),[])});
 await check('guest cannot call conversation identity API',()=>assert.rejects(as('anon',null,`select * from get_business_conversation_people(array['${uid(12)}']::uuid[])`),/permission denied/));
 await check('ordinary users cannot read Stripe event metadata',async()=>assert.deepEqual(await as('authenticated',viewer,'select * from stripe_events'),[]));
 await check('password plus MFA admin reads metadata',async()=>{await db.exec(`select set_config('request.jwt.claims','{"aal":"aal2","amr":[{"method":"password"}]}',false)`);assert.equal((await as('authenticated',admin,'select * from stripe_events')).length,1)});
 await check('admin without MFA cannot read metadata',async()=>{await db.exec(`select set_config('request.jwt.claims','{"aal":"aal1","amr":[{"method":"password"}]}',false)`);assert.deepEqual(await as('authenticated',admin,'select * from stripe_events'),[])});
 await check('legacy driver verifier stays unavailable',async()=>{assert.equal((await db.query("select has_function_privilege('authenticated','admin_set_driver_verification(uuid,text,text,text,text,text,text,text,text)','execute') as allowed")).rows[0].allowed,false)});
 for(const [name,args] of [['admin_set_driver_application',`'${uid(14)}','APPROVED',null`],['admin_set_driver_document_status',`'${uid(14)}','VERIFIED',null`],['admin_set_driver_vehicle_verification',`'${uid(14)}','CURRENT',current_date,null,null,current_date,'MANUAL_ADMIN_CHECK',null,null`]]){
  await check(name+' denies non-admin before touching data',()=>assert.rejects(as('authenticated',viewer,`select ${name}(${args})`),/Admin authorization required/));
 }
}finally{
 const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/everest-release-sql';await fs.mkdir(output,{recursive:true});
 await fs.writeFile(output+'/integration.json',JSON.stringify({scope:'Focused schema fixtures; complete staging acceptance remains BLOCKED',results,passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length},null,2)+'\n');
 await db.close();
}
console.log(JSON.stringify({passed:results.length,failed:0}));
