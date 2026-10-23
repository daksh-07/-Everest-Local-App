/* global localStorage, document, innerWidth, getComputedStyle */
// Real exported screens; all fixture API traffic is intercepted. No production writes.
import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import {setTimeout} from 'node:timers';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {trackFixtureReads,settleFixtureReads} from './lib/browser-fixture.mjs';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.EVEREST_QA_BROWSER||'chromium';
const base=process.env.EVEREST_PREVIEW_URL||'http://localhost:8083';
const layoutOnly=process.env.PHASE5B_LAYOUT_ONLY==='1';
const baseline=process.env.PHASE5B_BASELINE==='1';
const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/phase5b-evidence';
await fs.mkdir(output,{recursive:true});
const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{}:{executablePath:process.env.EVEREST_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const uid='11111111-1111-4111-8111-111111111111',biz='33333333-3333-4333-8333-333333333333';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{}};
const session={access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:4102444800})).toString('base64url')}.fixture`,refresh_token:'fixture',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};
const business={id:biz,name:'Phase Five Garden Care',status:'ACTIVE',verification_status:'VERIFIED',member_role:'OWNER',suburb:'Carlton',city:'Melbourne',state:'VIC',description:'Care for your local garden.',can_view_crm:true,can_manage_crm:true,can_view_inbox:true,can_view_all_jobs:true,can_view_finance:true,can_view_orders:true,can_manage_settings:true};
const service={id:'s1',business_id:biz,name:'Garden maintenance',base_price:90,duration_minutes:60,delivery_mode:'LOCAL',active:true,service_booking_settings:{instant_booking_enabled:false}};
const product={id:'p1',business_id:biz,business_name:business.name,name:'Local garden kit',price:20,sale_price:null,status:'ACTIVE',product_images:[],primary_image_path:null};
const result={kind:'SERVICE',id:'s1',title:'Garden maintenance',subtitle:'Local service',score:60,metadata:{business_id:biz}};
const report={engine,baseline,scenarios:[],layouts:[],errors:[]};
async function open(path,state={},authenticated=false){
 const context=await browser.newContext({viewport:{width:state.width||390,height:844},reducedMotion:state.motion||'reduce',isMobile:Boolean(state.touch),hasTouch:Boolean(state.touch)});
 await context.addInitScript(({session,authenticated,theme})=>{if(!localStorage.getItem('everest-local-theme'))localStorage.setItem('everest-local-theme',theme);if(authenticated)localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify(session))},{session,authenticated,theme:state.theme||'LIGHT'});
 console.log('Fixture',path,state.fail??'healthy');
 const page=await context.newPage();await trackFixtureReads(page);if(state.clock)await page.clock.install();page.setDefaultTimeout(15000);const calls=[];
 page.on('pageerror',error=>report.errors.push(error.message));
 const sockets=[];
 await page.routeWebSocket('**/realtime/**',ws=>{
  if(state.noRealtime){ws.close();return;}
  const joins=[];sockets.push({ws,joins});
  ws.onMessage(raw=>{const frame=JSON.parse(String(raw));const v2=Array.isArray(frame);
   const message=v2?{join_ref:frame[0],ref:frame[1],topic:frame[2],event:frame[3],payload:frame[4]}:frame;
   const reply=payload=>ws.send(JSON.stringify(v2?[message.join_ref,message.ref,message.topic,'phx_reply',payload]:{topic:message.topic,event:'phx_reply',ref:message.ref,payload}));
   if(message.event==='phx_join'){const changes=message.payload?.config?.postgres_changes||[];const rows=changes.map((change,index)=>({...change,id:index+1}));joins.push({topic:message.topic,changes:rows,v2,join_ref:message.join_ref});reply({status:'ok',response:{postgres_changes:rows}});}
   else if(message.event==='heartbeat'||message.event==='phx_leave')reply({status:'ok',response:{}});
  });
 });
 await page.route(/supabase\.co/,async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop();calls.push({name,method:req.method(),url:req.url(),body:req.postData()});
  const cors={'access-control-allow-origin':'*','access-control-allow-headers':req.headers()['access-control-request-headers']||'authorization,apikey,content-type,x-client-info,prefer,accept,range,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version','access-control-allow-methods':'GET,POST,HEAD,OPTIONS'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
  if(url.pathname.includes('/auth/'))return route.fulfill({json:authenticated?user:{user:null},headers:cors});
  if(req.method()!=='GET'&&req.method()!=='HEAD'&&!url.pathname.includes('/rpc/'))return route.fulfill({status:403,json:{message:'Fixture blocks writes'},headers:cors});
  if(state.offline)return route.abort('internetdisconnected');
  if(state.delayToday&&name==='bookings'&&req.method()==='GET'&&url.searchParams.get('scheduled_date')?.startsWith('eq.'))await new Promise(resolve=>setTimeout(resolve,2500));
  if(state.holdStatus&&name==='get_everest_live_state')await new Promise(resolve=>{state.statusReleases??=[];state.statusReleases.push(resolve);state.releaseStatus=()=>{for(const release of state.statusReleases)release();state.statusReleases=[];};});
  if(state.holdMap&&name==='get_everest_live_map_points')await new Promise(resolve=>{state.releaseMaps??=[];state.releaseMaps.push(resolve);state.releaseMap=()=>{for(const release of state.releaseMaps)release();state.releaseMaps=[];};});
  if(state.delays?.[name])await new Promise(resolve=>setTimeout(resolve,state.delays[name]));
  if(name==='accept_quote'&&state.acceptRace){state.liveStatus='BOOKED';state.quotes=false;state.bookingId='other-booking';}
  if(name==='accept_quote'&&state.lostAcceptResponse){state.liveStatus='BOOKED';state.quotes=false;state.bookingId='recovered-booking';return route.abort('failed');}
  if(name==='accept_quote'&&state.acceptNoCommit){state.holdQuoteRefresh=state.holdAfterUnconfirmed;return route.abort('failed');}
  if(name==='quotes'&&state.holdQuoteRefresh&&!url.searchParams.has('id'))await new Promise(resolve=>{state.quoteReleases??=[];state.quoteReleases.push(resolve);state.releaseQuoteRefresh=()=>{for(const release of state.quoteReleases)release();state.quoteReleases=[];};});
  if(state.fail?.includes(name)||(state.failCounts&&name==='bookings'&&req.method()==='HEAD'))return route.fulfill({status:state.denied?403:400,json:{code:state.denied?'42501':'XX000',message:state.denied?'permission denied':'Fixture unavailable'},headers:cors}).catch(()=>{});
  let rows=[];const today=new Date().toISOString().slice(0,10);
  if(name==='get_my_workspace_context')rows={mode:authenticated?'BUSINESS':'CUSTOMER',active_business_id:authenticated?biz:null,businesses:authenticated?[{...business,...state.role}]:[]};
  else if(name==='get_my_access_context')rows={profile_role:authenticated?'BUSINESS':'CUSTOMER',is_business_member:authenticated,is_verified_business:authenticated,business_id:biz,business_name:business.name,is_authorized_admin:false,is_active_driver:false};
  else if(name==='businesses')rows=[business];
  else if(name==='get_everest_live_state')rows=state.missingLive?[]:[{request_id:JSON.parse(req.postData()||'{}').p_request_id,live_status:state.liveStatus||'SEARCHING',radius_km:state.radius||3,radius_stage:state.stage||1,expires_at:'2099-01-01T00:00:00Z',eligible_count:2,notified_count:2,viewed_count:state.viewed||0,responding_count:0,quote_count:state.quotes?1:0}];
  else if(name==='accept_quote')rows='new-booking';
  else if(name==='cancel_everest_live')rows=state.cancelResult??true;
  else if(name==='expand_everest_live'){state.stage=2;state.radius=7;rows=1;}
  else if(name==='update_business_job_assignment_status'){if(state.work)state.work.status=JSON.parse(req.postData()).p_status;rows=true;}
  else if(name==='decline_opportunity'){state.offer=false;rows=true;}
  else if(name==='view_live_opportunity')rows=true;
  else if(name==='opportunities'&&state.offer)rows=[{id:'offer1',request_id:'live1',created_at:new Date().toISOString(),is_live:true,approximate_distance_km:1.3,eta_seconds:180,service_requests:{description:'Urgent garden request',suburb:'Carlton',city:'Melbourne',requested_arrival_window:'ASAP'}}];
  else if(name==='get_my_assigned_jobs')rows=state.work?[state.work]:[];
  else if(name==='quotes')rows=(state.quotes||url.searchParams.has('id'))?[{id:'quote1',request_id:'live1',business_id:biz,description:'Available for garden care',total:90,deposit:0,status:'SENT',created_at:new Date().toISOString(),businesses:business}]:[];
  else if(name==='get_everest_live_map_points')rows=[{point_kind:'CUSTOMER',latitude:-37.8,longitude:144.96,activity:'YOU',address_label:'Carlton service address'},{point_kind:'BUSINESS',business_id:biz,latitude:-37.81,longitude:144.97,activity:'NOTIFIED'}];
  else if(name==='crm_pipelines')rows=[{id:'pipe1',is_default:true}];
  else if(name==='crm_bookings')rows=[{id:'cb1',service_label:'Scheduled garden visit',scheduled_start:today+'T09:00:00',scheduled_end:today+'T10:00:00',status:'CONFIRMED',price:90}];
  else if(name==='business_availability')rows=[{status:'AVAILABLE_NOW'}];
  else if(name==='services')rows=[service];
  else if(name==='products'||name==='shop_products')rows=[product];
  else if(name==='universal_search')rows=state.empty?[]:[result];
  else if(name==='reviews')rows=[{rating:5}];
  else if(name==='profiles')rows=[{id:uid,role:'BUSINESS',full_name:'Fixture Owner'}];
  else if(name==='crm_opportunities')rows=[{id:'d1',created_at:new Date().toISOString(),source:'MANUAL',contact_id:'contact1',currency:'AUD',title:'Garden lead',status:'OPEN',stage_id:'stage1',estimated_value:250,last_activity_at:new Date().toISOString()}];
  else if(name==='crm_pipeline_stages')rows=[{id:'stage1',stage_key:'NEW_LEAD',label:'New leads'}];
  else if(name==='crm_tasks')rows=[{id:'t1',task:'Call local customer',status:'OPEN',task_type:'FOLLOW_UP',priority:'NORMAL',due_at:today+'T09:00:00'}];
  else if(name==='bookings'&&(url.searchParams.has('customer_id')||url.searchParams.has('id')))rows=state.bookingId?[{id:state.bookingId,request_id:'live1',quote_id:'quote1',customer_id:uid,business_id:biz,status:'PENDING_PAYMENT',price:90,businesses:business,created_at:new Date().toISOString()}]:[];
  else if(name==='bookings'&&url.searchParams.get('status')!=='eq.COMPLETED')rows=[{id:'j1',status:'IN_PROGRESS',scheduled_date:new Date().toISOString().slice(0,10),scheduled_time:'09:00:00',price:90}];
  if(state.empty&&['get_my_assigned_jobs','get_everest_live_map_points','businesses','services','products','shop_products','reviews','crm_opportunities','crm_pipeline_stages','crm_tasks','crm_quotes','crm_bookings','quotes','orders','conversations','marketplace_payout_ledger','bookings'].includes(name))rows=[];
  if(state.empty&&name==='businesses'&&path.startsWith('/business-profile'))rows=[business];
  const count=Array.isArray(rows)?rows.length:1;
  const json=req.headers().accept?.includes('vnd.pgrst.object')?(Array.isArray(rows)?rows[0]??null:rows):rows;
  return route.fulfill({json,headers:{...cors,'access-control-expose-headers':'content-range','content-range':`0-${Math.max(0,count-1)}/${count}`}}).catch(()=>{});
 });
 await page.goto(base+path);return {page,context,calls,sockets};
}
// Let fixture reads settle before navigation/teardown. WebKit otherwise reports
// interrupted cross-origin reads as access-control page errors during teardown.
async function reload(page){await settleFixtureReads(page);await page.reload();await page.waitForLoadState('networkidle')}
async function closePage(page,context){await settleFixtureReads(page);await context.close()}
async function shot(page,name){await page.screenshot({path:`${output}/${name}.png`,fullPage:true})}
try{
 if(!layoutOnly){
 for(const [screen,state,missing,healthy] of [
  ['calendar',{fail:['business_availability']},'Nothing scheduled','Scheduled garden visit'],
  ['jobs',{failCounts:true},'No booked work today','90.00'],
  ['inbox',{fail:['conversations']},'No customer conversations yet',null],
  ['my-work',{fail:['get_my_assigned_jobs']},'You’re clear.',null],
  ['crm',{fail:['conversations']},null,'Garden lead'],
  ['availability',{fail:['business_availability']},'Save availability',null],
 ]){
  const {page,context,calls}=await open('/business-'+screen,state,true);await page.getByText(/couldn’t load|could not be loaded|Fixture unavailable|unavailable\./).first().waitFor();await page.waitForLoadState('networkidle');
  if(!baseline&&healthy)await page.getByText(healthy,{exact:false}).first().waitFor();
  const text=await page.locator('body').innerText();
  if(baseline){report.scenarios.push({screen,issue:missing?text.includes(missing):!text.includes(healthy),text});}
  else{await shot(page,screen+'-unavailable');report.scenarios.push({screen,partialRecovery:true,text});if(missing)assert.ok(!text.includes(missing),screen+' must not show false empty');if(healthy)assert.ok(text.includes(healthy),screen+' healthy section preserved');state.fail=[];state.failCounts=false;const beforeRows=calls.filter(c=>c.name==='bookings'&&c.method==='GET').length;const retry=page.getByRole('button',{name:/Retry|Try again/}).first();await retry.click();await retry.waitFor({state:'hidden'});await page.waitForLoadState('networkidle');if(screen==='jobs')assert.equal(calls.filter(c=>c.name==='bookings'&&c.method==='GET').length,beforeRows,'count retry does not refetch job rows');}
  await shot(page,screen+'-recovered');await closePage(page,context);
 }
 {
  const state={fail:['get_everest_live_state']};const {page,context}=await open('/everest-live?requestId=live1',state,true);await page.getByText('Live request unavailable',{exact:true}).waitFor();await page.waitForLoadState('networkidle');
  const retry=page.getByRole('button',{name:/Reconnect|Try again|Retry/});
  if(!baseline)await retry.waitFor();
  report.scenarios.push({screen:'live',initialFailureHasRetry:await retry.count()});
  if(!baseline){assert.ok(await retry.count(),'Live initial error must be retryable');state.fail=[];await retry.click();await page.getByText('Everest Live',{exact:true}).waitFor();}
  await shot(page,'live-initial-error');await closePage(page,context);
 }
 // Provider notification is actionable only for roles allowed to operate work.
 {
  const state={offer:true,role:{member_role:'READ_ONLY',can_view_crm:false,can_view_all_jobs:false,can_assign_jobs:false}};
  const {page,context}=await open('/business-jobs',state,true);await page.waitForTimeout(1000);await page.waitForLoadState('networkidle');
  const visible=await page.getByText('Everest Live request',{exact:true}).count();
  assert.equal(visible,baseline?1:0,'read-only provider alert boundary');report.scenarios.push({providerReadOnlyAlert:visible,baseline});await closePage(page,context);
 }
 // Late Today responses cannot appear beneath the Completed tab.
 {
  const {page,context}=await open('/business-jobs',{delayToday:true},true);
  await page.getByRole('tab',{name:/^Completed,/}).click();
  await page.getByText('No completed jobs yet',{exact:true}).waitFor();await page.waitForTimeout(2800);
  const stale=await page.getByText('Open job',{exact:true}).count();assert.equal(stale,baseline?1:0,'late job response is scoped to its requested tab');
  report.scenarios.push({lateJobsTabResponse:stale,baseline});await closePage(page,context);
 }
 // Live's 30s fallback poll must not restart its 45s expansion deadline.
 {
  const clockState={clock:true,noRealtime:true};const {page,context,calls}=await open('/everest-live?requestId=live1',clockState,true);
  await page.getByText('Everest Live',{exact:true}).waitFor();await page.waitForLoadState('networkidle');
  await page.getByText('2 businesses notified',{exact:true}).waitFor();await page.clock.runFor(50);
  clockState.viewed=1;await page.clock.fastForward(30000);await page.getByText('1',{exact:true}).waitFor();await page.waitForLoadState('networkidle');
  await page.clock.fastForward(16000);await page.waitForLoadState('networkidle');
  if(!baseline)await page.getByText(/(Search area|Searching within) 7 km/).waitFor();
  assert.equal(calls.filter(call=>call.name==='expand_everest_live'&&call.method==='POST').length,baseline?0:1,'expansion deadline through status polling');
  report.scenarios.push('Live expansion survives equivalent polling snapshots');await closePage(page,context);
 }
 if(!baseline){
 // A delayed map must not delay status or provider responses.
 {
  const state={quotes:true,liveStatus:'RESPONSES_AVAILABLE',holdMap:true};const {page,context}=await open('/everest-live?requestId=live1',state,true);
  await page.getByText('Your responses are ready',{exact:true}).waitFor();
  await page.getByText('Available for garden care',{exact:true}).waitFor();
  assert.equal(typeof state.releaseMap,'function','map remains held while healthy sections render');state.holdMap=false;state.releaseMap();
  report.scenarios.push('Live status and responses arrive before delayed map');await closePage(page,context);
 }
 // Opportunity-only updates and an offline read recover without inventing fresh state.
 {
  const state={clock:true};const {page,context,sockets,calls}=await open('/everest-live?requestId=live1',state,true);
  await page.getByText('2 businesses notified',{exact:true}).waitFor();await page.waitForLoadState('networkidle');
  const emit=table=>{for(const {ws,joins} of sockets)for(const join of joins){const ids=join.changes.filter(c=>c.table===table).map(c=>c.id);if(ids.length){const payload={ids,data:{type:'UPDATE',schema:'public',table,columns:[],record:{id:'offer1',request_id:'live1'},old_record:{},commit_timestamp:new Date().toISOString()}};ws.send(JSON.stringify(join.v2?[join.join_ref,null,join.topic,'postgres_changes',payload]:{topic:join.topic,event:'postgres_changes',payload}));}}};
  const before=calls.filter(c=>c.name==='get_everest_live_state'&&c.method==='POST').length;state.viewed=1;for(let i=0;i<10;i++)emit('opportunities');
  await page.getByText('1 business has viewed your request',{exact:true}).waitFor();
  await page.waitForLoadState('networkidle');assert.equal(calls.filter(c=>c.name==='get_everest_live_state'&&c.method==='POST').length-before,1,'event bursts coalesce into one status refresh');
  state.offline=true;await page.clock.fastForward(31000);
  await page.getByText('Reconnecting · showing the last confirmed status',{exact:true}).waitFor();
  assert.ok((await page.locator('body').innerText()).includes('Viewed'),'last confirmed metrics remain available');
  state.offline=false;state.liveStatus='RESPONSES_AVAILABLE';state.quotes=true;
  await page.getByRole('button',{name:'Reconnect',exact:true}).click();
  await page.getByText('Your responses are ready',{exact:true}).waitFor();
  await page.getByText('Available for garden care',{exact:true}).waitFor();
  report.scenarios.push('Opportunity realtime update, offline stale-status feedback, manual reconnect restores authoritative responses');await closePage(page,context);
 }
 // Resubscription refreshes missed events immediately, before the fallback poll.
 {
  const state={clock:true};const {page,context,sockets}=await open('/everest-live?requestId=live1',state,true);
  await page.getByText('2 businesses notified',{exact:true}).waitFor();await page.waitForLoadState('networkidle');
  state.viewed=1;for(const socket of [...sockets])socket.ws.close({code:1012,reason:'Fixture reconnect'});
  await page.getByText('Reconnecting · showing the last confirmed status',{exact:true}).waitFor();
  await page.clock.fastForward(5000);
  await page.getByText('1 business has viewed your request',{exact:true}).waitFor();
  assert.ok(sockets.length>1,'socket connection was recreated');
  report.scenarios.push('WebSocket resubscription refreshes missed provider activity before fallback polling');await closePage(page,context);
 }
 // Losing an acceptance race refreshes the server lifecycle before offering another action.
 {
  const state={quotes:true,liveStatus:'RESPONSES_AVAILABLE',fail:['accept_quote']};const {page,context,calls}=await open('/everest-live?requestId=live1',state,true);
  await page.getByRole('button',{name:/Review and book/}).click();
  state.acceptRace=true;
  await page.getByRole('button',{name:/^Book ·/}).click();
  await page.waitForURL('**/booking?id=other-booking');
  assert.equal(calls.filter(call=>call.name==='accept_quote'&&call.method==='POST').length,1);
  report.scenarios.push('Rejected acceptance recovers the other committed request booking without replay');await closePage(page,context);
 }
 // Both acceptance entry points recover commits and never replay uncertain writes.
 for(const path of ['/everest-live?requestId=live1','/quotes?requestId=live1'])for(const mode of ['lost-response','unconfirmed','already-committed']){
  const state={quotes:true,liveStatus:'RESPONSES_AVAILABLE',lostAcceptResponse:mode==='lost-response',acceptNoCommit:mode==='unconfirmed',holdAfterUnconfirmed:mode==='unconfirmed',bookingId:mode==='already-committed'?'existing-booking':null};
  const {page,context,calls}=await open(path,state,true);
  await page.getByRole('button',{name:path.startsWith('/quotes')?/Review and accept/:/Review and book/}).first().click();
  await page.getByRole('button',{name:path.startsWith('/quotes')?/^Accept quote ·/:/^Book ·/}).click();
  if(mode==='unconfirmed'){
   await page.getByText('We could not confirm your choice. Check your bookings before choosing again.',{exact:true}).waitFor({timeout:3000});
   for(let i=0;i<50&&typeof state.releaseQuoteRefresh!=='function';i++)await page.waitForTimeout(20);
   assert.equal(typeof state.releaseQuoteRefresh,'function');state.holdQuoteRefresh=false;state.releaseQuoteRefresh();
   await page.getByRole('button',{name:'Check bookings',exact:true}).click();await page.waitForURL('**/bookings');
  }else await page.waitForURL('**/booking?id='+(mode==='lost-response'?'recovered-booking':'existing-booking'));
  assert.equal(calls.filter(c=>c.name==='accept_quote'&&c.method==='POST').length,mode==='already-committed'?0:1);
  report.scenarios.push(path+' '+mode+' read recovery without mutation replay');await closePage(page,context);
 }
 {
  const {page,context,calls}=await open('/everest-live?requestId=live1',{quotes:true,liveStatus:'RESPONSES_AVAILABLE',fail:['bookings'],denied:true},true);
  await page.getByRole('button',{name:/Review and book/}).click();await page.getByRole('button',{name:/^Book ·/}).click();
  await page.getByText('We could not check this request. Reconnect before choosing a provider.',{exact:true}).waitFor();
  assert.equal(calls.filter(c=>c.name==='accept_quote'&&c.method==='POST').length,0);
  report.scenarios.push('Denied booking preflight prevents acceptance submission');await closePage(page,context);
 }
 // Viewing or passing a provider offer never confirms a booking.
 for(const action of ['Interested','Pass']){
  const state={offer:true};const {page,context,calls}=await open('/business-jobs',state,true);
  await page.getByText('Everest Live request',{exact:true}).waitFor();
  await page.getByRole('button',{name:action,exact:true}).click();
  if(action==='Interested')await page.waitForURL('**/opportunities?requestId=live1');
  else await page.getByText('Everest Live request',{exact:true}).waitFor({state:'hidden'});
  await page.waitForLoadState('networkidle');
  assert.ok(calls.some(call=>call.name===(action==='Interested'?'view_live_opportunity':'decline_opportunity')&&call.method==='POST'));
  assert.equal(calls.some(call=>call.name==='accept_quote'),false);
  report.scenarios.push('Provider '+action.toLowerCase()+' sends one scoped intent without booking');await closePage(page,context);
 }
 // A refused cancellation must not navigate away as though it succeeded.
 {
  const state={cancelResult:false,holdStatus:true};const {page,context,calls}=await open('/everest-live?requestId=live1',state,true);
  await page.getByRole('button',{name:'Cancel search',exact:true}).click();
  await page.getByRole('button',{name:'Cancel request',exact:true}).click();
  await page.getByText('Cancellation was not confirmed. Retry to check your request.',{exact:true}).waitFor();
  assert.equal(typeof state.releaseStatus,'function');state.holdStatus=false;state.releaseStatus();await page.getByText('2 businesses notified',{exact:true}).waitFor();await settleFixtureReads(page);
  await page.getByText('Cancellation was not confirmed. Retry to check your request.',{exact:true}).waitFor();
  assert.ok(page.url().includes('/everest-live'));
  assert.equal(calls.filter(c=>c.name==='cancel_everest_live'&&c.method==='POST').length,1);
  report.scenarios.push('Refused cancellation stays on the active request with retry feedback');await closePage(page,context);
 }
 // Partial schedule loads first, retry only the failed dataset.
 {
  const state={fail:['crm_tasks'],delays:{crm_bookings:2500}};const {page,context,calls}=await open('/business-calendar',state,true);
  await page.getByRole('button',{name:'Retry tasks',exact:true}).waitFor();
  const nativeBefore=calls.filter(c=>c.name==='bookings').length;state.fail=[];
  await page.getByRole('button',{name:'Retry tasks',exact:true}).click();
  await page.getByText('Call local customer',{exact:true}).waitFor();
  await page.getByText('Scheduled garden visit',{exact:true}).waitFor();
  assert.equal(calls.filter(c=>c.name==='bookings').length,nativeBefore,'local retry does not refetch jobs');
  report.scenarios.push('Calendar local retry while another dataset is delayed');await closePage(page,context);
 }
 // Completion is explicit, double taps are disabled, and cancellation is inert.
 {
  const state={work:{assignment_id:'assignment1',source:'EVEREST',booking_id:'j1',status:'IN_PROGRESS',label:'Garden shift',customer_name:'Local customer',location:null,scheduled_at:new Date().toISOString(),price:null}};
  const {page,context,calls}=await open('/business-my-work',state,true);
  await page.getByRole('button',{name:'Complete job',exact:true}).click();
  await page.getByRole('button',{name:'Not now',exact:true}).click();
  assert.equal(calls.filter(c=>c.name==='update_business_job_assignment_status').length,0);
  await page.getByRole('button',{name:'Complete job',exact:true}).click();
  await page.getByRole('button',{name:'Complete assignment',exact:true}).click();
  await page.getByText('Recently completed',{exact:true}).waitFor();
  assert.equal(calls.filter(c=>c.name==='update_business_job_assignment_status').length,1);
  report.scenarios.push('Employee completion confirmation, inert cancellation, one status mutation');await closePage(page,context);
 }
 // Real touch events on emulated mobile browsers use the same in-place calendar controls.
 for(const width of [320,390,430]){
  const {page,context}=await open('/business-calendar',{touch:true,width,theme:width===390?'DARK':'LIGHT'},true);
  await page.getByText('Scheduled garden visit',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Week',exact:true}).tap();await page.getByText(/^Week schedule/).waitFor();
  await page.getByRole('tab',{name:'Day',exact:true}).tap();
  await page.getByRole('button',{name:'Next day',exact:true}).tap();await page.getByText('Nothing scheduled',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Go to today',exact:true}).tap();await page.getByText('Scheduled garden visit',{exact:true}).waitFor();
  report.scenarios.push('Mobile touch calendar filters and date recovery at '+width);await closePage(page,context);
 }
 // Business role permissions are checked before private operational reads or editing controls.
 for(const path of ['/business-calendar','/business-crm','/business-inbox','/business-availability']){
  const {page,context,calls}=await open(path,{role:{member_role:'READ_ONLY',can_manage_crm:false,can_view_crm:false,can_view_inbox:false,can_view_all_jobs:false,can_manage_settings:false}},true);
  await page.waitForLoadState('networkidle');
  assert.equal(calls.some(c=>['crm_tasks','crm_bookings','crm_opportunities','business_contacts','conversations','bookings'].includes(c.name)),false,'restricted role makes no private screen reads');
  assert.equal(await page.getByRole('button',{name:'New deal',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Continue verification',exact:true}).count(),0,'verified restricted role is not told to verify again');
  report.scenarios.push(path+' restricted role');await closePage(page,context);
 }
 }
 }
 if(!baseline&&process.env.PHASE5B_NO_MATRIX!=='1'){
  const AxeBuilder=(await import(process.env.AXE_MODULE||'@axe-core/playwright')).default;
  const paths=(process.env.PHASE5B_SCREENS?.split(',')||['/everest-live?requestId=live1','/business-jobs','/business-calendar','/business-inbox','/business-crm','/business-my-work','/business-availability']);
  report.accessibility=[];
  for(const path of paths)for(const theme of ['LIGHT','DARK'])for(const motion of ['reduce','no-preference']){
   const state={motion,quotes:path.includes('everest-live'),liveStatus:'RESPONSES_AVAILABLE'};
   const {page,context}=await open(path,state,true);
   await page.getByText(path.includes('everest-live')?'Your responses are ready':path.includes('business-jobs')?'Open job':path.includes('business-calendar')?'Scheduled garden visit':path.includes('business-inbox')?'No customer conversations yet':path.includes('business-crm')?'Garden lead':path.includes('business-my-work')?'You’re clear.':'Save availability',{exact:true}).first().waitFor();
   await page.waitForLoadState('networkidle');
   await page.evaluate(theme=>localStorage.setItem('everest-local-theme',theme),theme);await reload(page);
   for(const width of [320,375,390,430,...(process.env.EVEREST_QA_TABLET==='1'?[768,1024]:[]),1280,1440]){
    await page.setViewportSize({width,height:width===320?568:844});
    await page.waitForTimeout(220);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,path+' overflow '+width);
    report.layouts.push({path,theme,motion,width});
    if(width===390&&motion==='reduce')await shot(page,path.split('?')[0].slice(1)+'-'+theme.toLowerCase());
   if(motion==='reduce'&&(width===390||width===1280)){
    const audit=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    report.accessibility.push({path,theme,width,violations:audit.violations});await fs.writeFile(`${output}/accessibility.json`,JSON.stringify(report.accessibility,null,2));
    const fresh=audit.violations; // Phase 6 integrates the shared navigation accessibility fixes: no allowlist.
    assert.deepEqual(fresh.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,html:n.html}))})),[],path+' new accessibility violations');
   }
   }
   await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle!=='none'),true,path+' keyboard focus indicator');
   await closePage(page,context);
  }
  for(const mode of ['empty','error'])for(const path of paths){
   const state=mode==='empty'?{empty:true}:{fail:['get_everest_live_state','bookings','crm_pipelines','crm_tasks','crm_bookings','crm_calendar_blocks','conversations','get_my_assigned_jobs','business_availability']};
   const {page,context}=await open(path,state,true);await page.waitForLoadState('networkidle');
   for(const theme of ['LIGHT','DARK']){
    await page.evaluate(theme=>localStorage.setItem('everest-local-theme',theme),theme);await reload(page);
    for(const width of [320,375,390,430,...(process.env.EVEREST_QA_TABLET==='1'?[768,1024]:[]),1280,1440]){
     await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,path+' '+mode+' overflow');
     report.layouts.push({path,theme,motion:'reduce',width,state:mode});
    }
   }
   await closePage(page,context);
  }
 }
 assert.deepEqual(report.errors,[],'unexpected page errors');await fs.writeFile(`${output}/results.json`,JSON.stringify(report,null,2));console.log(`${engine}: ${report.scenarios.length} scenario groups, ${report.layouts.length} layouts; ${report.errors.length} page errors`);
}finally{await fs.writeFile(`${output}/results.json`,JSON.stringify(report,null,2));await browser.close()}
