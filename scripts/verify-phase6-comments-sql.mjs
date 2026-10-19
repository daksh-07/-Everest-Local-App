// Two synthetic authenticated identities against the repository's real comment RLS.
// PostgreSQL only; no claim about Supabase realtime, JWT issuance or physical clients.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {disposablePostgres} from './lib/phase6-postgres.mjs';
const {db,connect}=await disposablePostgres();const tests=[];
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',post='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',privatePost='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',comment='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
async function check(name,run){try{await run();tests.push({name,pass:true});}catch(error){tests.push({name,pass:false,error:error.message});throw error;}}
async function identity(client,id){await client.query('set role authenticated');await client.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
try{
 await db.exec(`create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated;
 create table posts(id uuid primary key,author_id uuid,business_id uuid,status text,visibility text);
 create table follows(follower_id uuid,followed_user_id uuid,business_id uuid);
 create function is_admin() returns boolean language sql stable as $$select false$$;
 grant select on posts,follows to anon,authenticated;
 insert into posts values('${post}','${a}',null,'PUBLISHED','PUBLIC'),('${privatePost}','${a}',null,'PUBLISHED','FOLLOWERS');`);
 await db.exec(await fs.readFile('supabase/migrations/20260926114431_social_engagement_feed.sql','utf8'));
 const baseline=process.env.PHASE6_BASELINE==='1';if(!baseline)await db.exec(await fs.readFile('supabase/migrations/20261019035131_phase6_authorized_comment_moderation.sql','utf8'));
 const ca=await connect(),cb=await connect(),ca2=await connect();await identity(ca,a);await identity(cb,b);await identity(ca2,a);
 await check('account A creates own visible comment',async()=>{await ca.query('insert into post_comments(id,post_id,author_id,body) values($1,$2,$3,$4)',[comment,post,a,'Original local comment']);assert.equal((await cb.query('select body from post_comments where id=$1',[comment])).rows[0].body,'Original local comment');});
 await check('account B cannot impersonate A',()=>assert.rejects(cb.query('insert into post_comments(post_id,author_id,body) values($1,$2,$3)',[post,a,'Spoof']),/row-level security/));
 await check('account B cannot edit or hide A comment',async()=>{assert.equal((await cb.query("update post_comments set body='Hijacked' where id=$1 returning id",[comment])).rowCount,0);assert.equal((await cb.query("update post_comments set status='HIDDEN' where id=$1",[comment])).rowCount,0);if(!baseline)assert.equal((await cb.query('select hide_post_comment($1) hidden',[comment])).rows[0].hidden,false);});
 await check('account B reply retains parent and account identity',async()=>{await cb.query("insert into post_comments(post_id,author_id,body,parent_id) values($1,$2,'Reply',$3)",[post,b,comment]);assert.equal((await ca.query('select parent_id from post_comments where author_id=$1',[b])).rows[0].parent_id,comment);});
 await check('account A edit is visible to B',async()=>{await ca.query("update post_comments set body='Edited comment',updated_at=now() where id=$1 and author_id=$2",[comment,a]);assert.equal((await cb.query('select body from post_comments where id=$1',[comment])).rows[0].body,'Edited comment');});
 await check('simultaneous stale edits cannot overwrite the winner',async()=>{const stamp=(await ca.query('select updated_at::text stamp from post_comments where id=$1',[comment])).rows[0].stamp;const results=await Promise.all([ca.query("update post_comments set body='First edit',updated_at=now() where id=$1 and updated_at=$2 returning id",[comment,stamp]),ca2.query("update post_comments set body='Second edit',updated_at=now() where id=$1 and updated_at=$2 returning id",[comment,stamp])]);assert.deepEqual(results.map(r=>r.rowCount).sort(),[0,1]);});
 await check('lost-response retry with stable ID cannot duplicate insert',async()=>{await assert.rejects(ca.query('insert into post_comments(id,post_id,author_id,body) values($1,$2,$3,$4)',[comment,post,a,'Retry']),error=>error.code==='23505');assert.equal((await ca.query('select id from post_comments where id=$1',[comment])).rowCount,1);});
 await check('post author can hide B reply and both readers lose hidden row',async()=>{const target=(await ca.query('select id from post_comments where author_id=$1',[b])).rows[0].id;if(baseline)assert.equal((await ca.query("update post_comments set status='HIDDEN' where id=$1 and status='VISIBLE'",[target])).rowCount,1);else assert.equal((await ca.query('select hide_post_comment($1) hidden',[target])).rows[0].hidden,true);assert.equal((await cb.query('select id from post_comments where id=$1',[target])).rowCount,0);});
 await check('guest can read public conversation but cannot write',async()=>{const guest=await connect();await guest.query('set role anon');assert.equal((await guest.query('select id from post_comments where post_id=$1',[post])).rowCount,1);if(!baseline)await assert.rejects(guest.query('select hide_post_comment($1)',[comment]),/permission denied/);await assert.rejects(guest.query('insert into post_comments(post_id,author_id,body) values($1,$2,$3)',[post,a,'Guest']),/permission denied/);});
 await check('follower-only conversation cannot leak to unrelated account',async()=>{await db.query("insert into post_comments(post_id,author_id,body) values($1,$2,'Private comment')",[privatePost,a]);assert.equal((await cb.query('select id from post_comments where post_id=$1',[privatePost])).rowCount,0);});
 await check('disabled comments reject new inserts while preserving reads',async()=>{await db.exec('update posts set comments_enabled=false');await assert.rejects(cb.query("insert into post_comments(post_id,author_id,body) values($1,$2,'Disabled')",[post,b]),/row-level security/);assert.equal((await cb.query('select id from post_comments where post_id=$1',[post])).rowCount,1);});
}finally{
 const report={scope:'PostgreSQL 17.6 loopback, exact comment table policies and independent SQL sessions with synthetic auth.uid settings; not Supabase Realtime/PostgREST',tests,passed:tests.filter(t=>t.pass).length,failed:tests.filter(t=>!t.pass).length};
 const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/phase6-comments-sql';await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/comments-sql.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await db.close();
}
