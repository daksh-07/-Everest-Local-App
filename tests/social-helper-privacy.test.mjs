import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260928165049_lock_down_social_actor_helpers.sql','utf8');
const social=fs.readFileSync('supabase/migrations/20260926123438_social_comment_reactions_notifications.sql','utf8');

test('internal social actor helpers are not exposed as client RPCs',()=>{
 assert.match(social,/function public\.social_actor_name\(p_user_id uuid\)/);
 assert.match(social,/function public\.social_actor_avatar\(p_user_id uuid\)/);
 assert.match(social,/security definer/);
 assert.match(migration,/revoke all on function public\.social_actor_name\(uuid\) from public,anon,authenticated/);
 assert.match(migration,/revoke all on function public\.social_actor_avatar\(uuid\) from public,anon,authenticated/);
 assert.match(migration,/grant execute on function public\.social_actor_name\(uuid\) to service_role/);
 assert.match(migration,/grant execute on function public\.social_actor_avatar\(uuid\) to service_role/);
});
