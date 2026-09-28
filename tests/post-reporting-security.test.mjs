import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260928170252_secure_post_reporting.sql','utf8');
const social=fs.readFileSync('app/social.tsx','utf8');
const client=fs.readFileSync('lib/social.ts','utf8');

test('post reports are RPC-only and deny direct client table access',()=>{
 assert.match(migration,/create table if not exists public\.post_reports/);
 assert.match(migration,/alter table public\.post_reports enable row level security/);
 assert.match(migration,/revoke all on public\.post_reports from public,anon,authenticated/);
 assert.match(migration,/grant select,insert,update,delete on public\.post_reports to service_role/);
 assert.doesNotMatch(client,/from\(['"]post_reports['"]\)/);
});

test('report_post is authenticated, bounded, duplicate-safe and cannot report own content',()=>{
 assert.match(migration,/function public\.report_post/);
 assert.match(migration,/if v_uid is null then raise exception 'Authentication required'/);
 assert.match(migration,/if v_author=v_uid then raise exception 'You cannot report your own post'/);
 assert.match(migration,/post_reports_open_reporter_post_idx/);
 assert.match(migration,/created_at>now\(\)-interval '24 hours'/);
 assert.match(migration,/>=20/);
 assert.match(migration,/revoke all on function public\.report_post\(uuid,text,text\) from public,anon/);
 assert.match(migration,/grant execute on function public\.report_post\(uuid,text,text\) to authenticated/);
});

test('post report review is admin gated',()=>{
 assert.match(migration,/function public\.admin_list_post_reports/);
 assert.match(migration,/function public\.admin_review_post_report/);
 assert.match(migration,/not public\.is_admin\(\)/);
 assert.match(migration,/revoke all on function public\.admin_list_post_reports\(text,integer\) from public,anon/);
 assert.match(migration,/revoke all on function public\.admin_review_post_report\(uuid,text,text\) from public,anon/);
});

test('posts and clips expose reporting without allowing self-reporting',()=>{
 assert.match(client,/supabase\.rpc\('report_post'/);
 assert.match(social,/accessibilityLabel="Report post"/);
 assert.match(social,/accessibilityLabel="Report clip"/);
 assert.match(social,/item\.author_id!==userId/);
 assert.match(social,/post\.author_id===userId/);
 assert.match(social,/Report received/);
});
