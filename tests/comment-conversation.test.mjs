import test from 'node:test';
import assert from 'node:assert/strict';
import {commentThreads,mergeComments,commentCursorFilter,fitComment,commentLength,commentId,getCommentDraft,saveCommentDraft,saveCommentAttempt} from '../lib/comment-conversation.ts';
const row=(id,parent_id=null,created_at='2026-10-19T09:00:00.000001Z')=>({id,parent_id,created_at,updated_at:created_at,status:'VISIBLE',body:id,author_id:'viewer',post_id:'post'});
test('nested replies stay with their root, in reading order, with one bounded indentation level',()=>{
 const threads=commentThreads([row('child','root','2026-10-19T10:00:00Z'),row('grandchild','child','2026-10-19T11:00:00Z'),row('root')],'NEWEST');
 assert.equal(threads.length,1);assert.equal(threads[0].root.id,'root');assert.deepEqual(threads[0].replies.map(r=>r.id),['child','grandchild']);
});
test('unavailable parents preserve visible replies without exposing hidden parent text',()=>{
 const groups=commentThreads([{...row('parent'),status:'HIDDEN'},row('reply','parent')],'NEWEST');assert.equal(groups[0].root,null);assert.deepEqual(groups[0].replies.map(r=>r.id),['reply']);
});
test('cycles cannot hang a conversation',()=>{const groups=commentThreads([row('a','b'),row('b','a')],'NEWEST');assert.equal(groups.length,1);assert.equal(groups[0].replies.length,2)});
test('stable oldest/newest ordering breaks equal-time ties by ID',()=>{
 const rows=[row('b'),row('a')];assert.deepEqual(commentThreads(rows,'OLDEST').map(g=>g.id),['a','b']);assert.deepEqual(commentThreads(rows,'NEWEST').map(g=>g.id),['b','a']);
});
test('overlapping pages and a confirmed retry never duplicate the same comment',()=>{const merged=mergeComments([row('a')],[{...row('a'),body:'updated'},row('b')]);assert.equal(merged.length,2);assert.equal(merged[0].body,'updated')});
test('pagination retains microsecond precision and includes the UUID tie-breaker',()=>{
 const cursor={id:'11111111-1111-4111-8111-111111111111',created_at:'2026-10-19T09:00:00.123456+00:00'};assert.match(commentCursorFilter(cursor,'NEWEST'),/123456\+00:00/);assert.match(commentCursorFilter(cursor,'NEWEST'),/id\.lt\./);assert.match(commentCursorFilter(cursor,'OLDEST'),/id\.gt\./);
 assert.throws(()=>commentCursorFilter({...cursor,id:'bad),post_id.eq.other'},'NEWEST'));
});
test('character limits match PostgreSQL Unicode codepoints and preserve emoji',()=>{assert.equal(commentLength('🔥'.repeat(2000)),2000);assert.equal(fitComment('🔥'.repeat(2001)),'🔥'.repeat(2000));assert.equal(commentLength('  hello  '),5)});
test('in-session drafts are scoped to both the viewer and post, including reply context',()=>{
 saveCommentDraft('viewer:post','A careful reply',row('parent'));assert.equal(getCommentDraft('viewer:post').text,'A careful reply');assert.equal(getCommentDraft('viewer:post').reply.id,'parent');assert.equal(getCommentDraft('other:post').text,'');assert.equal(getCommentDraft('viewer:other').text,'');saveCommentDraft('viewer:post','',null);assert.equal(getCommentDraft('viewer:post').text,'');
});
test('draft memory is bounded and client comment IDs are UUIDs',()=>{for(let i=0;i<21;i++)saveCommentDraft('bounded:'+i,'draft',null);assert.equal(getCommentDraft('bounded:0').text,'');assert.equal(getCommentDraft('bounded:20').text,'draft');assert.match(commentId(),/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i)});

test('an ambiguous send retains its same attempt across sheet reopen and clears after success',()=>{saveCommentDraft('retry:post','Keep me',null);saveCommentAttempt('retry:post',{id:'attempt',body:'Keep me',parent:null});saveCommentDraft('retry:post','Keep me',null);assert.equal(getCommentDraft('retry:post').attempt.id,'attempt');saveCommentDraft('retry:post','',null);assert.equal(getCommentDraft('retry:post').attempt,null)});
