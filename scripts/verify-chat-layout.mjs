/* global window, document, localStorage, EventTarget, Event, Buffer, URL */
// Deterministic real MessagesScreen interactions. Viewport occlusion is simulated;
// Playwright does NOT open an iOS system keyboard or prove native IME behaviour.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.EVEREST_QA_BROWSER||'chromium';
const browser=await engines[engine].launch(engine==='chromium'?{executablePath:process.env.EVEREST_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']}:{});
const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/everest-chat-layout';
const baseline=process.env.EVEREST_QA_BEFORE==='1';
const base=process.env.EVEREST_PREVIEW_URL||'http://127.0.0.1:4173';
await fs.mkdir(output,{recursive:true});
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{}};
const session={access_token:`e30.${Buffer.from(JSON.stringify({sub:uid,exp:4102444800})).toString('base64url')}.fixture`,refresh_token:'fixture',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};
const report=[];
for(const theme of ['LIGHT','DARK'])for(const width of (process.env.EVEREST_QA_WIDTHS||'390').split(',').map(Number)){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:width<768,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce',recordVideo:process.env.EVEREST_QA_VIDEO==='1'&&width===390?{dir:output,size:{width,height:844}}:undefined});
 await context.addInitScript(({theme,session,width})=>{
  localStorage.setItem('everest-local-theme',theme);localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify(session));
  const vv=Object.assign(new EventTarget(),{height:844,width,offsetTop:0,offsetLeft:0,pageTop:0,pageLeft:0,scale:1});
  Object.defineProperty(window,'visualViewport',{configurable:true,value:vv});
  window.__chatViewport=(height,offsetTop=0)=>{Object.assign(vv,{height,offsetTop});vv.dispatchEvent(new Event('resize'));vv.dispatchEvent(new Event('scroll'))};
 },{theme,session,width});
 const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message)});
 let empty=false;let sends=0;let failNext=false;let sent=[];
 const message=(index,body)=>({id:'m'+index,conversation_id:'c1',sender_id:index%2?uid:other,body:body||`Message ${index}: checking the details for our garden visit.`,read_at:null,created_at:new Date(Date.UTC(2026,9,16,8,index)).toISOString(),deleted_for_everyone:false,edited_at:null,reply_to_message_id:null,reactions:[]});
 const conversations=[{id:'c1',other_user_id:other,display_name:'Priya Shah',avatar_url:null,status:'ACTIVE',initiated_by:uid,updated_at:'2026-10-16T08:24:00Z',latest_message:'See you soon',unread_count:0},{id:'c2',other_user_id:'33333333-3333-4333-8333-333333333333',display_name:'Marcus Lee',avatar_url:null,status:'ACTIVE',initiated_by:uid,updated_at:'2026-10-16T08:20:00Z',latest_message:'Hello',unread_count:0}];
 await page.routeWebSocket('**/realtime/**',ws=>ws.close());
 await page.route('**/*.supabase.co/**',async route=>{
  const r=route.request(),u=new URL(r.url()),table=u.pathname.split('/').at(-1);let body={};try{body=r.postDataJSON()||{}}catch{/* GET has no JSON body */}
  let json=[];
  if(u.pathname.includes('/auth/'))json=user;
  else if(table==='get_my_access_context')json={profile_role:'CUSTOMER',is_business_member:false,is_verified_business:false,business_id:null};
  else if(table==='get_my_workspace_context')json={mode:'CUSTOMER',active_business_id:null,businesses:[]};
  else if(table==='list_personal_conversations_v2')json=body.p_requests?[]:conversations;
  else if(table==='list_personal_messages_v2')json=body.p_conversation==='c2'?[]:empty?sent:[...Array.from({length:24},(_,i)=>message(i+1)),...sent];
  else if(table==='send_personal_message_v2'){
   sends++;if(failNext){failNext=false;return route.fulfill({status:503,json:{message:'Controlled send failure'}})}
   const m=message(100+sends,body.p_body);sent.push(m);json={message_id:m.id,conversation_id:'c1',created_at:m.created_at,status:'ACTIVE'};
  }
  else if(table==='profiles')json={id:uid,full_name:'Fixture customer',role:'CUSTOMER'};
  if(r.method()!=='GET'&&r.method()!=='HEAD'&&!u.pathname.includes('/rpc/'))return route.fulfill({status:403,json:{message:'Fixture refuses writes'}});
  if(r.headers().accept?.includes('vnd.pgrst.object')&&Array.isArray(json))json=json[0]??null;
  return route.fulfill({json});
 });
 const input=page.locator('#everest-message-composer');
 const send=page.getByRole('button',{name:'Send message',exact:true});
 async function settle(){await page.waitForTimeout(120);await page.evaluate(()=>document.fonts.ready)}
 async function geometry(){return page.evaluate(()=>{
  const rect=id=>{const r=document.getElementById(id)?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,height:r.height,width:r.width}:null};
  return {shell:rect('everest-chat-shell'),input:rect('everest-message-composer'),composer:rect('everest-composer-shell'),viewport:{height:window.visualViewport.height,top:window.visualViewport.offsetTop},focused:document.activeElement?.id,pageScroll:window.scrollY,visualHeight:document.documentElement.style.getPropertyValue('--everest-visual-height'),shellStyle:document.getElementById('everest-chat-shell')?window.getComputedStyle(document.getElementById('everest-chat-shell')).height:null};
 })}
 async function occlude(height,top=0){await page.evaluate(({height,top})=>window.__chatViewport(height,top),{height,top});await settle()}
 async function check(label){console.log(engine,theme,width,label);const g=await geometry();report.push({theme,width,label,...g});await fs.writeFile(output+'/partial-report.json',JSON.stringify(report,null,2));if(process.env.EVEREST_QA_VERBOSE==='1')console.log(JSON.stringify(g));if(!baseline){assert.ok(Math.abs(g.shell.height-g.viewport.height)<2,label+' shell must match visual viewport');assert.ok(Math.abs(g.shell.top-g.viewport.top)<2,label+' header must stay in visual viewport');assert.ok(g.composer.bottom<=g.viewport.top+g.viewport.height+1,label+' composer hidden');assert.ok(g.viewport.top+g.viewport.height-g.composer.bottom<=48,label+' excessive bottom gap');assert.ok(g.composer.height<=138,label+' composer too tall');}return g}
 await page.goto(base+'/messages?personalId=c1',{waitUntil:'networkidle'});await input.waitFor().catch(async e=>{await page.screenshot({path:output+'/failure.png'});console.log(await page.locator('body').innerText());throw e});await settle();
 await check('populated-closed');if(width===390&&process.env.EVEREST_QA_SCREENSHOTS!=='0')await page.screenshot({path:`${output}/${engine}-${theme}-${width}-closed.png`});
 await input.focus();await occlude(420,35);const single=await check('populated-open');
 if(!baseline)assert.ok(single.composer.height>=44&&single.composer.height<=52.5,'initial composer must be 44–52pt');
 if(width===390&&process.env.EVEREST_QA_SCREENSHOTS!=='0')await page.screenshot({path:`${output}/${engine}-${theme}-${width}-keyboard-occlusion.png`,clip:{x:0,y:35,width,height:420}});
 if(baseline){await context.close();continue;}
 assert.equal(await send.isDisabled(),true);
 await input.fill('First line\nSecond line\nThird line');await settle();const multiline=await check('multiline');assert.ok(multiline.composer.height>single.composer.height,'input must grow');
 await input.fill(Array.from({length:14},(_,i)=>'Long message line '+i).join('\n'));await settle();await check('bounded-multiline');assert.ok((await input.evaluate(e=>e.scrollHeight>e.clientHeight)),'long input must scroll internally');
 await input.fill('A message while the keyboard stays open');await send.click();await page.getByText('A message while the keyboard stays open',{exact:true}).waitFor();await settle();assert.equal(await input.inputValue(),'');assert.equal((await geometry()).focused,'everest-message-composer');assert.equal(sends,1);await check('sent-open');
 await input.blur();await occlude(844);await input.focus();await occlude(420);await check('reopened');
 // While reading older history, resizing must not force a jump to the newest message.
 const scroller=page.locator('[data-testid="personal-message-list"]');
 await scroller.evaluate(e=>{e.scrollTop=80;e.dispatchEvent(new Event('scroll'))});await settle();const old=await scroller.evaluate(e=>e.scrollTop);await occlude(470);assert.ok(Math.abs((await scroller.evaluate(e=>e.scrollTop))-old)<8,'older-message position changed');
 await page.getByRole('button',{name:'Back to messages'}).click();await input.waitFor({state:'hidden'});await page.getByText('Marcus Lee',{exact:true}).first().click();await input.waitFor();await check('switched-empty');await input.focus();await occlude(420);await check('empty-open');
 await input.blur();await occlude(844);await check('empty-closed');if(width===390&&process.env.EVEREST_QA_SCREENSHOTS!=='0')await page.screenshot({path:`${output}/${engine}-${theme}-${width}-empty.png`});
 await page.getByRole('button',{name:'Back to messages'}).click();await page.getByText('Priya Shah',{exact:true}).first().click();await input.waitFor();await check('returned');
 failNext=true;await input.fill('Keep this failed message');await send.click();await page.getByText('Failed · tap to retry',{exact:true}).waitFor();assert.equal(await page.getByText('Keep this failed message',{exact:true}).count(),1);
 await page.getByText('Keep this failed message',{exact:true}).click();assert.equal(await input.inputValue(),'Keep this failed message');await send.click();await page.getByText('Failed · tap to retry',{exact:true}).waitFor({state:'hidden'});assert.equal(await page.getByText('Keep this failed message',{exact:true}).count(),1);
 await page.getByRole('button',{name:'View Priya Shah profile',exact:true}).click();
 await input.waitFor({state:'hidden'});assert.notEqual(await page.evaluate(()=>document.documentElement.dataset.everestChatOpen),'true','viewport lock leaked outside chat');
 await page.goBack();await input.waitFor();await check('navigated-back');
 assert.deepEqual(errors,[]);const video=page.video();await context.close();
 if(video){await video.saveAs(`${output}/${engine}-${theme}-${width}-transitions.webm`);await video.delete();}
}
await fs.writeFile(output+'/report.json',JSON.stringify({engine,baseline,verification:'Web layout with simulated visual viewport occlusion; no native/system keyboard',cases:report},null,2));
await browser.close();console.log(`PASS ${engine}: ${report.length} chat layout/interaction cases${baseline?' (baseline recorded)':''}`);
