/* global localStorage,document,window,EventTarget,Event,innerWidth,getComputedStyle,BroadcastChannel */
// Exported SocialScreen + actual comment sheet. All backend traffic is fixture-only.
import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import {setTimeout} from 'node:timers';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {trackFixtureReads,settleFixtureReads} from './lib/browser-fixture.mjs';
const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright');const engine=process.env.EVEREST_QA_BROWSER||'chromium';
const base=process.env.EVEREST_PREVIEW_URL||'http://localhost:8086';const before=process.env.COMMENTS_BASELINE==='1';const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/comments-evidence';await fs.mkdir(output,{recursive:true});
const browser=await engines[engine].launch(engine==='webkit'?{}:{executablePath:process.env.EVEREST_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',postId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',post2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id=n=>`cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12,'0')}`;
const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{}};
const session={access_token:`e30.${Buffer.from(JSON.stringify({sub:uid,exp:4102444800})).toString('base64url')}.fixture`,refresh_token:'fixture',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};
const comment=(n,body,author_id=other,parent_id=null,pid=postId)=>({id:id(n),post_id:pid,author_id,body,parent_id,status:'VISIBLE',created_at:`2026-10-19T09:${String(n%60).padStart(2,'0')}:00.000001+00:00`,updated_at:`2026-10-19T09:${String(n%60).padStart(2,'0')}:00.000001+00:00`});
const initial=()=>[comment(1,'Can I book a gardener for Saturday?'),comment(2,'Does morning work?',uid,id(1)),comment(3,'Morning works for me.',other,id(2)),comment(4,'Happy to help with the garden.',uid),comment(5,'A separate post conversation.',other,null,post2)];
const report={engine,before,fixture:true,scenarios:[],layouts:[],accessibility:[],errors:[]};
async function open(state={}){
 state.comments??=initial();const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',isMobile:true,hasTouch:true});
 await context.addInitScript(({session,guest})=>{
  if(!guest)localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify(session));if(!localStorage.getItem('everest-local-theme'))localStorage.setItem('everest-local-theme','LIGHT');
  const vv=Object.assign(new EventTarget(),{height:844,width:390,offsetTop:0,offsetLeft:0,scale:1});Object.defineProperty(window,'visualViewport',{configurable:true,value:vv});window.__commentsViewport=(height,offsetTop=0)=>{Object.assign(vv,{height,offsetTop});vv.dispatchEvent(new Event('resize'));};
 },{session,guest:state.guest});
 const page=await context.newPage();trackFixtureReads(page);page.setDefaultTimeout(15000);const calls=[];const errors=[];page.on('pageerror',e=>{errors.push(e.message);report.errors.push(e.message);});await page.routeWebSocket('**/realtime/**',ws=>ws.close());
 await page.route(/supabase\.co/,async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop(),method=req.method();
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':req.headers()['access-control-request-headers']||'authorization,apikey,content-type,x-client-info,prefer,accept,range,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version','access-control-allow-methods':'GET,POST,PATCH,DELETE,HEAD,OPTIONS','access-control-expose-headers':'content-range'};
  if(method==='OPTIONS')return route.fulfill({status:204,headers});
  const body=method==='POST'||method==='PATCH'?req.postDataJSON():null;calls.push({name,method,body,query:url.search});
  if(url.pathname.includes('/auth/'))return route.fulfill({json:state.guest?{user:null}:user,headers});
  const full=name==='post_comments'&&url.searchParams.get('select')?.includes('body');
  const failure=message=>route.fulfill({status:400,json:{code:'XX000',message},headers});
  if(full&&method==='GET'&&state.failRead)return failure('Comments are temporarily unavailable.');
  if(name==='post_comment_reactions'&&state.failLikes)return failure('Likes are temporarily unavailable.');
  if(full&&method==='GET'&&state.delayRead)await new Promise(resolve=>setTimeout(resolve,state.delayRead));
  if(name==='public_profiles'&&state.holdProfiles)await new Promise(resolve=>{state.releaseProfiles=resolve;});
  if(name==='public_profiles'&&state.delayProfiles)await new Promise(resolve=>setTimeout(resolve,state.delayProfiles));
  let rows=[];let count;
  if(name==='hide_post_comment'){const target=state.comments.find(row=>row.id===body.p_comment_id&&row.status==='VISIBLE');if(target)target.status='HIDDEN';rows=Boolean(target);}
  else if(name==='get_my_access_context')rows={profile_role:'CUSTOMER',is_business_member:false,is_verified_business:false,is_authorized_admin:false,is_active_driver:false};
  else if(name==='get_my_workspace_context')rows={mode:'CUSTOMER',active_business_id:null,businesses:[]};
  else if(name==='list_discovery_feed'||name==='posts')rows=[postId,post2].map((pid,index)=>({id:pid,author_id:uid,business_id:null,caption:index?'Another local conversation':'How do you look after a small garden?',post_type:'UPDATE',visibility:'PUBLIC',status:'PUBLISHED',comments_enabled:!state.disabled,content_format:'POST',created_at:'2026-10-19T08:00:00Z',updated_at:'2026-10-19T08:00:00Z',location_label:'Carlton'}));
  else if(name==='public_profiles')rows=[{id:uid,display_name:'Jordan Green',avatar_url:null},{id:other,display_name:'Local gardener',avatar_url:null}];
  else if(name==='profiles')rows=[{id:uid,role:'CUSTOMER',full_name:'Jordan Green',suburb:'Carlton',city:'Melbourne',state:'VIC'}];
  else if(name==='post_comments'){
   if(method==='POST'){
    if(state.failSend)return failure('Could not post your comment. Your draft is still here.');
    if(state.comments.some(row=>row.id===body.id))return route.fulfill({status:409,json:{code:'23505',message:'duplicate key'},headers});
    const row={...body,status:'VISIBLE',created_at:new Date().toISOString(),updated_at:new Date().toISOString()};state.comments.push(row);
    if(state.loseSend){state.loseSend=false;return route.abort('connectionreset');}rows=[row];
   }else if(method==='PATCH'){
    if(state.failEdit)return failure('Comment changed. Refresh before editing again.');
    const target=state.comments.find(row=>'eq.'+row.id===url.searchParams.get('id'));count=target?1:0;if(target){Object.assign(target,body);rows=[target];}
   }else rows=state.comments.filter(row=>row.status==='VISIBLE');
   const eqId=url.searchParams.get('id');if(eqId?.startsWith('eq.'))rows=rows.filter(row=>row.id===eqId.slice(3));
   else if(eqId?.startsWith('in.'))rows=rows.filter(row=>eqId.includes(row.id));
   const pid=url.searchParams.get('post_id');if(pid?.startsWith('eq.'))rows=rows.filter(row=>row.post_id===pid.slice(3));
   const author=url.searchParams.get('author_id');if(author?.startsWith('eq.'))rows=rows.filter(row=>row.author_id===author.slice(3));
   const newest=url.searchParams.get('order')?.startsWith('created_at.desc');rows.sort((a,b)=>{const value=a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id);return newest?-value:value;});
   const cursor=url.searchParams.get('or');if(cursor){const timestamp=cursor.match(/created_at\.(?:lt|gt)\."([^"]+)"/)?.[1];const cursorId=cursor.match(/id\.(?:lt|gt)\.([\da-f-]+)/i)?.[1];if(timestamp)rows=rows.filter(row=>newest?(row.created_at<timestamp||(row.created_at===timestamp&&row.id<cursorId)):(row.created_at>timestamp||(row.created_at===timestamp&&row.id>cursorId)));}
   const limit=Number(url.searchParams.get('limit'));if(limit)rows=rows.slice(0,limit);
   if(url.searchParams.get('select')==='post_id')rows=rows.map(row=>({post_id:row.post_id}));
  }
  count??=Array.isArray(rows)?rows.length:1;
  const json=req.headers().accept?.includes('vnd.pgrst.object')?(Array.isArray(rows)?rows[0]??null:rows):rows;
  return route.fulfill({json,headers:{...headers,'content-range':`0-${Math.max(0,count-1)}/${count}`}}).catch(()=>{});
 });
 await page.goto(base+`/social?postId=${postId}`);try{await page.getByRole('button',{name:'Comments',exact:true}).first().waitFor();}catch(e){await page.screenshot({path:`${output}/startup-error.png`});await fs.writeFile(`${output}/startup-error.json`,JSON.stringify({body:await page.locator('body').innerText(),errors,calls},null,2));throw e;}
 async function comments(index=0){await page.getByRole('button',{name:'Comments',exact:true}).nth(index).click();if(!before)await page.getByRole('dialog',{name:'Post comments',exact:true}).waitFor();}
 return {page,context,state,calls,errors,comments};
}
async function close(page,context){await settleFixtureReads(page);await context.close();}
async function shot(page,name){await page.screenshot({path:`${output}/${name}.png`,fullPage:true});}
try{
 if(before){
  const fixture=await open();await fixture.comments();await fixture.page.getByText('Can I book a gardener for Saturday?',{exact:true}).waitFor();await shot(fixture.page,'comments-before');
  await fixture.page.getByPlaceholder('Add a comment…').fill('Keep this draft');await fixture.page.getByRole('button',{name:'Close comments',exact:true}).click();await fixture.comments();assert.equal(await fixture.page.getByPlaceholder('Add a comment…').inputValue(),'');report.scenarios.push('Main clears the draft on reopen');
  await fixture.page.getByLabel('Comment options',{exact:true}).first().click();await fixture.page.waitForLoadState('networkidle');assert.ok(fixture.calls.some(c=>c.name==='post_comments'&&c.method==='PATCH'));report.scenarios.push('Main comment options immediately hides without confirmation');await close(fixture.page,fixture.context);
  const failed=await open({failRead:true});await failed.comments();await failed.page.getByText('No comments yet',{exact:true}).waitFor();await shot(failed.page,'comments-error-before');report.scenarios.push({mainReadFailureLooksEmpty:true,pageErrors:failed.errors});await close(failed.page,failed.context);
 }else{
  {
   const f=await open();f.state.failRead=true;await f.comments();await f.page.getByRole('button',{name:'Retry comments',exact:true}).waitFor();assert.equal(await f.page.getByText('No comments yet',{exact:true}).count(),0);await f.page.getByRole('textbox',{name:'Add a comment',exact:true}).fill('Keep this draft');await shot(f.page,'comments-read-error');f.state.failRead=false;await f.page.getByRole('button',{name:'Retry comments',exact:true}).click();await f.page.getByText('Can I book a gardener for Saturday?',{exact:true}).waitFor();assert.equal(await f.page.getByRole('textbox',{name:'Add a comment',exact:true}).inputValue(),'Keep this draft');
   await f.page.getByRole('button',{name:'Close comments',exact:true}).click();await f.comments(1);assert.equal(await f.page.getByRole('textbox',{name:'Add a comment',exact:true}).inputValue(),'');await f.page.getByRole('button',{name:'Close comments',exact:true}).click();await f.comments();assert.equal(await f.page.getByRole('textbox',{name:'Add a comment',exact:true}).inputValue(),'Keep this draft');report.scenarios.push('Read failure/retry preserves draft; drafts survive reopen and stay scoped to their post');await close(f.page,f.context);
  }
  {
   const f=await open();f.state.holdProfiles=true;f.state.failLikes=true;await f.comments();await f.page.getByText('Can I book a gardener for Saturday?',{exact:true}).waitFor();await f.page.getByRole('button',{name:'Retry likes',exact:true}).waitFor();await shot(f.page,'comments-likes-unavailable');f.state.failLikes=false;f.state.holdProfiles=false;f.state.releaseProfiles?.();await f.page.getByRole('button',{name:'Retry likes',exact:true}).click();await f.page.getByRole('button',{name:/Like comment by/}).first().waitFor();report.scenarios.push('Comment bodies remain readable during delayed identity and unavailable likes; local likes retry');await close(f.page,f.context);
  }
  for(const ambiguous of [false,true]){
   const f=await open();await f.comments();await f.page.getByText('Happy to help with the garden.',{exact:true}).waitFor();f.state.failSend=!ambiguous;f.state.loseSend=ambiguous;
   const text=ambiguous?'A retry must not duplicate me':'My draft survives a failed send';await f.page.getByRole('textbox',{name:'Add a comment',exact:true}).fill(text);await f.page.getByRole('button',{name:'Post comment',exact:true}).click();await f.page.getByRole('button',{name:'Post comment',exact:true}).waitFor();assert.equal(await f.page.getByRole('textbox',{name:'Add a comment',exact:true}).inputValue(),text);f.state.failSend=false;if(ambiguous){await f.page.getByRole('button',{name:'Close comments',exact:true}).click();await f.comments();await f.page.getByRole('textbox',{name:'Add a comment',exact:true}).waitFor();}await f.page.getByRole('button',{name:'Post comment',exact:true}).click();await f.page.getByText('Comment posted.',{exact:true}).waitFor();assert.equal(f.state.comments.filter(row=>row.body===text).length,1);await f.page.getByText('5 comments',{exact:true}).waitFor();assert.equal(await f.page.getByRole('textbox',{name:'Add a comment',exact:true}).inputValue(),'');await shot(f.page,ambiguous?'comments-confirmed-retry':'comments-posted');report.scenarios.push(ambiguous?'Committed-but-lost response reconciles one comment on retry':'Failed posting preserves draft and retries successfully');await close(f.page,f.context);
  }
  {
   const f=await open();await f.comments();await f.page.getByRole('button',{name:'View 2 replies',exact:true}).click();await f.page.getByText('Morning works for me.',{exact:true}).waitFor();await f.page.getByRole('button',{name:'Reply to Local gardener',exact:true}).last().click();await f.page.getByRole('textbox',{name:'Write a reply',exact:true}).fill('See you in the morning');await f.page.getByRole('button',{name:'Post comment',exact:true}).click();await f.page.getByText('Comment posted.',{exact:true}).waitFor();assert.equal(f.state.comments.find(row=>row.body==='See you in the morning').parent_id,id(3));
   await f.page.getByRole('button',{name:'Hide comment by Local gardener',exact:true}).first().click();await f.page.getByRole('alertdialog',{name:'Hide comment confirmation',exact:true}).waitFor();assert.equal(f.calls.filter(c=>c.name==='hide_post_comment').length,0);await f.page.getByRole('button',{name:'Keep comment',exact:true}).click();await f.page.getByRole('button',{name:'Hide comment by Local gardener',exact:true}).first().click();await f.page.getByRole('button',{name:'Hide comment',exact:true}).click();await f.page.getByText('Comment hidden.',{exact:true}).waitFor();assert.equal(f.calls.filter(c=>c.name==='hide_post_comment').length,1);report.scenarios.push('Nested replies keep their context; moderation confirms and cancel is inert');await close(f.page,f.context);
  }
  {
   const f=await open();await f.comments();await f.page.getByRole('textbox',{name:'Add a comment',exact:true}).fill('An unsent normal draft');await f.page.getByRole('button',{name:'Edit your comment',exact:true}).click();await f.page.getByRole('textbox',{name:'Edit comment',exact:true}).fill('Discard this edit');await f.page.getByRole('button',{name:'Cancel editing',exact:true}).click();assert.equal(await f.page.getByRole('textbox',{name:'Add a comment',exact:true}).inputValue(),'An unsent normal draft');await f.page.getByRole('button',{name:'Edit your comment',exact:true}).click();await f.page.getByRole('textbox',{name:'Edit comment',exact:true}).fill('A corrected comment');await f.page.getByRole('button',{name:'Save comment changes',exact:true}).click();await f.page.getByText('Comment updated.',{exact:true}).waitFor();assert.equal(f.state.comments.find(row=>row.id===id(4)).body,'A corrected comment');assert.equal(await f.page.getByRole('textbox',{name:'Add a comment',exact:true}).inputValue(),'An unsent normal draft');report.scenarios.push('Own-comment editing and cancellation retain the independent composer draft');await close(f.page,f.context);
  }
  {
   const comments=Array.from({length:65},(_,n)=>comment(n+1,'Paged comment '+(n+1)));const f=await open({comments});await f.comments();await f.page.getByRole('button',{name:'Load more comments',exact:true}).click();await f.page.waitForLoadState('networkidle');const ids=new Set(f.state.comments.map(row=>row.id));assert.equal(ids.size,65);assert.ok(f.calls.some(c=>c.name==='post_comments'&&c.query.includes('or=')));report.scenarios.push('Stable cursor pagination loads beyond the first page');await close(f.page,f.context);
  }
  for(const state of [{guest:true},{disabled:true},{comments:[]}]){
   const f=await open(state);await f.comments();if(state.guest)await f.page.getByRole('button',{name:'Sign in to join the conversation',exact:true}).waitFor();else if(state.disabled)await f.page.getByText('Comments are turned off. You can still read the conversation.',{exact:true}).waitFor();else await f.page.getByText('No comments yet',{exact:true}).waitFor();if(state.guest||state.disabled)assert.equal(await f.page.getByRole('button',{name:'Post comment',exact:true}).count(),0);report.scenarios.push(state.guest?'Guest read-only conversation':state.disabled?'Disabled comments remain readable':'Genuine empty conversation');await close(f.page,f.context);
  }
  {
   const f=await open();await f.comments();await f.page.getByRole('textbox',{name:'Add a comment',exact:true}).fill('Private draft for the first account');
   const nextUser={...user,id:other};const next={...session,user:nextUser,access_token:`e30.${Buffer.from(JSON.stringify({sub:other,exp:4102444800})).toString('base64url')}.fixture`};
   await f.page.evaluate(next=>{localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify(next));const channel=new BroadcastChannel('sb-bmwbljefnamvjnmuvkvv-auth-token');channel.postMessage({event:'SIGNED_IN',session:next});setTimeout(()=>channel.close(),100);},next);
   await f.page.waitForTimeout(700);await f.page.waitForLoadState('networkidle');
   if(!await f.page.getByRole('textbox',{name:'Add a comment',exact:true}).count())await f.comments();
   assert.equal(await f.page.getByRole('textbox',{name:'Add a comment',exact:true}).inputValue(),'');report.scenarios.push('Account switch cannot expose the previous viewer draft, including stale feed identity');await close(f.page,f.context);
  }
  const {default:AxeBuilder}=await import(process.env.AXE_MODULE||'@axe-core/playwright');
  for(const theme of ['LIGHT','DARK'])for(const motion of ['reduce','no-preference']){
   const f=await open();await f.page.evaluate(theme=>localStorage.setItem('everest-local-theme',theme),theme);await settleFixtureReads(f.page);await f.page.reload();await f.page.getByRole('button',{name:'Comments',exact:true}).first().waitFor();await f.page.emulateMedia({reducedMotion:motion});await f.comments();await f.page.getByText('Can I book a gardener for Saturday?',{exact:true}).waitFor();await f.page.waitForLoadState('networkidle');
   for(const width of [320,375,390,430,...(process.env.EVEREST_QA_TABLET==='1'?[768,1024]:[]),1280]){
    await f.page.setViewportSize({width,height:844});await f.page.evaluate(()=>window.__commentsViewport(844));await f.page.waitForTimeout(180);const dialog=f.page.getByRole('dialog',{name:'Post comments',exact:true});const bounds=await dialog.boundingBox();assert.ok(bounds.x>=-1&&bounds.x+bounds.width<=width+1);assert.equal(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);report.layouts.push({width,theme,motion});
    if(width===390&&motion==='reduce'){await shot(f.page,'comments-'+theme.toLowerCase());const audit=await new AxeBuilder({page:f.page}).include('[role="dialog"][aria-label="Post comments"]').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();report.accessibility.push({theme,width,violations:audit.violations});assert.deepEqual(audit.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.html)})),[]);}
    await f.page.getByRole('textbox',{name:'Add a comment',exact:true}).focus();await f.page.evaluate(()=>window.__commentsViewport(430,24));await f.page.waitForTimeout(180);const send=await f.page.getByRole('button',{name:'Post comment',exact:true}).boundingBox();assert.ok(send.y+send.height<=455,'composer stays above the simulated keyboard');await f.page.evaluate(()=>window.__commentsViewport(844));
   }
   await f.page.keyboard.press('Tab');assert.notEqual(await f.page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'none');assert.deepEqual(f.errors,[]);await close(f.page,f.context);
  }
  for(const mode of ['empty','error','disabled','guest','likes-error']){
   const f=await open(mode==='empty'?{comments:[]}:mode==='disabled'?{disabled:true}:mode==='guest'?{guest:true}:{});
   if(mode==='error')f.state.failRead=true;if(mode==='likes-error')f.state.failLikes=true;
   await f.comments();if(mode==='error')await f.page.getByRole('button',{name:'Retry comments',exact:true}).waitFor();else if(mode==='empty')await f.page.getByText('No comments yet',{exact:true}).waitFor();else await f.page.getByText('Can I book a gardener for Saturday?',{exact:true}).waitFor();
   for(const theme of ['LIGHT','DARK']){
    if(theme==='DARK'){await f.page.getByRole('button',{name:'Close comments',exact:true}).click();await f.page.evaluate(()=>localStorage.setItem('everest-local-theme','DARK'));await settleFixtureReads(f.page);await f.page.reload();await f.page.getByRole('button',{name:'Comments',exact:true}).first().waitFor();await f.comments();await f.page.waitForLoadState('networkidle');}
    for(const width of [320,375,390,430,...(process.env.EVEREST_QA_TABLET==='1'?[768,1024]:[]),1280]){
     await f.page.setViewportSize({width,height:844});await f.page.waitForTimeout(120);const bounds=await f.page.getByRole('dialog',{name:'Post comments',exact:true}).boundingBox();assert.ok(bounds.x>=-1&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=845);report.layouts.push({mode,theme,width,motion:'reduce'});
    }
   }
   assert.deepEqual(f.errors,[]);await close(f.page,f.context);
  }
  assert.deepEqual(report.errors,[],'unexpected page errors');
 }
}finally{await fs.writeFile(`${output}/results.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(`${engine}: ${report.scenarios.length} comment scenarios, ${report.layouts.length} layouts`);
