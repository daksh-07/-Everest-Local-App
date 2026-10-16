/* global localStorage, Buffer, URL, document */
// Interaction regression for the Business job workspace (app/business-job.tsx).
// Every Supabase call is answered by an in-memory fixture; writes are recorded, never sent.
// Usage: serve a web export, then EVEREST_PREVIEW_URL=http://127.0.0.1:4174 node scripts/verify-business-job.mjs
import assert from 'node:assert/strict';
import process from 'node:process';
const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.EVEREST_QA_BROWSER==='webkit'?'webkit':'chromium';
const base=process.env.EVEREST_PREVIEW_URL||'http://127.0.0.1:4174';
const uid='11111111-1111-4111-8111-111111111111',biz='33333333-3333-4333-8333-333333333333';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{}};
const session={access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:4102444800})).toString('base64url')}.fixture`,refresh_token:'fixture-never-sent',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};
const today=new Date().toISOString().slice(0,10);
const browser=await engines[engine].launch(engine==='webkit'?{}:{executablePath:process.env.EVEREST_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});

async function open(bookingId,state){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Australia/Melbourne',locale:'en-AU'});
 await context.addInitScript(s=>localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify(s)),session);
 const page=await context.newPage();const calls=[];
 await page.routeWebSocket('**/realtime/**',ws=>ws.close());
 await page.route(/supabase\.co/,async route=>{
  const req=route.request();const url=new URL(req.url());
  if(url.pathname.includes('/auth/'))return route.fulfill({json:user});
  const name=url.pathname.split('/').pop();
  if(url.pathname.includes('/rpc/')){
   const body=(()=>{try{return req.postDataJSON()}catch{return null}})();calls.push({name,body});
   if(name==='get_my_access_context')return route.fulfill({json:{profile_role:'BUSINESS',is_business_member:true,is_verified_business:true,business_id:biz,business_name:'North Melbourne Home & Garden',is_authorized_admin:false,is_active_driver:false}});
   if(name==='get_my_workspace_context')return route.fulfill({json:{mode:'BUSINESS',active_business_id:biz,businesses:[{id:biz,name:'North Melbourne Home & Garden',verification_status:'VERIFIED',member_role:'OWNER',status:'ACTIVE',can_view_all_jobs:true}]}});
   if(name==='set_booking_job_checklist_item'){const item=state.checklist.find(i=>i.id===body.p_item_id);if(item)item.is_complete=body.p_is_complete;return route.fulfill({json:null})}
   if(name==='update_booking_status'){state.booking.status=body.p_next;return route.fulfill({json:null})}
   return route.fulfill({json:[]});
  }
  if(req.method()!=='GET'&&req.method()!=='HEAD')return route.fulfill({status:403,json:{message:'blocked'}});
  const rows=name==='bookings'?[state.booking]:name==='booking_job_records'?[state.record]:name==='booking_job_checklist_items'?state.checklist:[];
  const json=req.headers().accept?.includes('vnd.pgrst.object')?rows[0]??null:rows;
  return route.fulfill({json,headers:{'access-control-expose-headers':'content-range','content-range':`0-${Math.max(0,rows.length-1)}/${rows.length}`}});
 });
 await page.goto(`${base}/business-job?id=${bookingId}`);
 return {page,calls,context};
}
const checklist=()=>[{id:'k1',booking_id:'b2',business_id:biz,label:'Trim front hedge',is_complete:true,position:1},{id:'k2',booking_id:'b2',business_id:biz,label:'Remove green waste',is_complete:false,position:2}];
try{
 // In progress: checklist gates completion, completion confirms first.
 {
  const state={booking:{id:'b2',request_id:'r2',business_id:biz,price:240,scheduled_date:today,scheduled_time:'09:30:00',status:'IN_PROGRESS',created_at:today},record:{booking_id:'b2',business_id:biz,customer_id:'c',arrival_status:'ARRIVED',arrival_eta:null,completion_summary:'',started_at:null,completed_at:null,updated_at:new Date().toISOString()},checklist:checklist()};
  const {page,calls,context}=await open('b2',state);
  await page.getByText('Finish 1 checklist item to complete this job.').waitFor();
  const complete=page.getByRole('button',{name:'Complete job'});
  assert.equal(await complete.isDisabled(),true,'completion is blocked while checklist items remain');
  const order=await page.evaluate(()=>{const t=document.body.innerText;return [t.indexOf('Checklist'),t.indexOf('Arrival updates')]});
  assert.ok(order[0]>=0&&order[0]<order[1],'once arrived, the checklist leads');
  await page.getByRole('checkbox',{name:'Remove green waste'}).click();
  await page.getByText('2 of 2 done').waitFor();
  assert.deepEqual(calls.find(c=>c.name==='set_booking_job_checklist_item')?.body,{p_item_id:'k2',p_is_complete:true});
  await complete.click();
  await page.getByText('Complete this job?').waitFor();
  assert.equal(calls.some(c=>c.name==='update_booking_status'),false,'opening the sheet changes nothing');
  await page.getByRole('button',{name:'Not now'}).click();
  await page.getByText('Complete this job?').waitFor({state:'hidden'});
  assert.equal(calls.some(c=>c.name==='update_booking_status'),false,'cancel changes nothing');
  await complete.click();
  await page.getByRole('button',{name:'Complete job'}).last().click();
  await page.waitForFunction(()=>document.body.innerText.includes('Done'));
  assert.deepEqual(calls.find(c=>c.name==='update_booking_status')?.body,{p_booking_id:'b2',p_next:'COMPLETED'});
  await context.close();
 }
 // Confirmed: advancing is a single, non-destructive step.
 {
  const state={booking:{id:'b3',request_id:'r3',business_id:biz,price:185,scheduled_date:today,scheduled_time:'14:00:00',status:'CONFIRMED',created_at:today},record:null,checklist:[]};
  const {page,calls,context}=await open('b3',state);
  await page.getByText('Confirms you’ll attend at the booked time.').waitFor();
  await page.getByRole('button',{name:'Mark as scheduled'}).click();
  await page.waitForFunction(()=>document.body.innerText.includes('Start job'));
  assert.deepEqual(calls.find(c=>c.name==='update_booking_status')?.body,{p_booking_id:'b3',p_next:'UPCOMING'});
  await context.close();
 }
 console.log(`${engine}: business job workspace interactions passed (checklist gate, confirm-before-complete, cancel is inert, scheduled step). Fixture transport only.`);
}finally{await browser.close()}
