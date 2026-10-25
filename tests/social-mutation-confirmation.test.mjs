import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';
import ts from 'typescript';

// Execute the shipped clients, with only the transport replaced. A successful
// HTTP response with zero affected rows must never become an application success.
function loadClient(path, transport) {
 const source=fs.readFileSync((process.env.EVEREST_TEST_SOURCE_ROOT||'.')+'/'+path,'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 new Function('require','exports',code)(name=>{
  if(name==='./supabase')return {supabase:transport,requireSupabaseConfig(){}};
  if(name==='./comment-conversation')return {};
  throw new Error('Unexpected dependency: '+name);
 },exports);
 return exports;
}
function transport({post={data:{id:'post-1'},error:null},rpc={data:true,error:null}}={}) {
 const calls=[];
 const query={update(body){calls.push(['update',body]);return this},eq(...args){calls.push(['eq',...args]);return this},select(...args){calls.push(['select',...args]);return this},single:async()=>post,then(resolve){return Promise.resolve(post).then(resolve)}};
 return {calls,auth:{getUser:async()=>({data:{user:{id:'owner-1'}}})},from(name){calls.push(['from',name]);return query},async rpc(name,args){calls.push(['rpc',name,args]);return rpc}};
}
const report={id:'report-1',post_id:'post-1'};
test('reports require a confirmed report identifier',async()=>{
 for(const data of [null,false,{},'']){
  const client=loadClient('lib/post-reports.ts',transport({rpc:{data,error:null}}));
  await assert.rejects(client.reportPost('post-1','SPAM'),/could not be confirmed/);
 }
 const client=loadClient('lib/post-reports.ts',transport({rpc:{data:'report-1',error:null}}));
 assert.equal(await client.reportPost('post-1','SPAM',' context '),'report-1');
});
test('a hidden post requires exactly one returned row before closing the report',async()=>{
 for(const post of [{data:null,error:null},{data:{id:'other'},error:null},{data:null,error:{code:'42501'}}]){
  const db=transport({post});const client=loadClient('lib/post-reports.ts',db);
  await assert.rejects(client.adminResolvePostReport(report,'HIDE_POST'),/could not be hidden/);
  assert.equal(db.calls.some(call=>call[0]==='rpc'),false);
 }
});
test('report closure validates the RPC boolean and describes partial success',async()=>{
 const db=transport({rpc:{data:false,error:null}});const client=loadClient('lib/post-reports.ts',db);
 await assert.rejects(client.adminResolvePostReport(report,'HIDE_POST'),/post is hidden.*report could not be closed/);
 await assert.rejects(client.adminResolvePostReport(report,'DISMISS'),/report could not be updated/);
});
test('confirmed moderation changes close the selected report',async()=>{
 const db=transport();const client=loadClient('lib/post-reports.ts',db);
 await client.adminResolvePostReport(report,'HIDE_POST');
 assert.deepEqual(db.calls.at(-1),['rpc','admin_review_post_report',{p_report_id:'report-1',p_status:'CLOSED',p_resolution:'Post hidden by admin'}]);
});
for(const action of ['archivePost','restorePost','deletePost','updatePostCaption','setPostCommentsEnabled']){
 test(action+' rejects zero-row writes',async()=>{
  const client=loadClient('lib/social.ts',transport({post:{data:null,error:null}}));
  await assert.rejects(client[action]('post-1',action==='updatePostCaption'?'caption':false));
 });
 test(action+' confirms a returned post',async()=>{
  const db=transport();const client=loadClient('lib/social.ts',db);
  await client[action]('post-1',action==='updatePostCaption'?'caption':false);
  assert.ok(db.calls.some(call=>call[0]==='select'&&call[1]==='id'));
  if(['archivePost','restorePost','deletePost'].includes(action))assert.ok(db.calls.some(call=>call[0]==='eq'&&call[1]==='author_id'&&call[2]==='owner-1'));
 });
}
