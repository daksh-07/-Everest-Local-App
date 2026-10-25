/* global localStorage, PerformanceObserver, window, document */
// Production export only; synthetic auth, reads and writes never reach Supabase.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {URL} from 'node:url';
import {Buffer} from 'node:buffer';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.EVEREST_PREVIEW_URL||'http://localhost:4173';
const baseline=process.env.RECOVERY_BASELINE==='1';
const browser=await chromium.launch({executablePath:process.env.EVEREST_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const uid='11111111-1111-4111-8111-111111111111';const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid'};
const session={access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:4102444800})).toString('base64url')}.fixture`,refresh_token:'fixture',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};
const report={baseline,browser:browser.version(),viewport:'390x844 desktop Chromium',build:'Expo production web export',runs:[]};
for(const authenticated of [false,true]){
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(({authenticated,session})=>{if(authenticated)localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify(session));window.stalls=[];new PerformanceObserver(list=>window.stalls.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true})},{authenticated,session});
 const page=await context.newPage();const errors=[];const calls={};let held=false;let accessFail=false;let privilegedSurface=false;
 page.on('pageerror',e=>errors.push(e.message));await page.routeWebSocket('**/realtime/**',ws=>ws.close());
 await page.route(/supabase\.co/,async r=>{
  const req=r.request(),name=new URL(req.url()).pathname.split('/').at(-1);calls[name]=(calls[name]||0)+1;
  if(held&&name==='businesses')return; // Held until the client aborts; no server response.
  if(name==='get_my_access_context'&&accessFail)return r.fulfill({status:403,json:{message:'Fixture access denied'}});
  if(name==='get_my_access_context')return r.fulfill({json:{profile_role:'CUSTOMER',is_business_member:false,is_authorized_admin:false}});
  if(name==='get_my_workspace_context')return r.fulfill({json:privilegedSurface?{mode:'BUSINESS',active_business_id:'biz',businesses:[{id:'biz',name:'Fixture Business',status:'ACTIVE',verification_status:'VERIFIED',can_view_all_jobs:true}]}:{mode:'CUSTOMER',businesses:[]}});
  return r.fulfill({json:req.url().includes('/auth/')?user:[]});
 });
 const started=Date.now();await page.goto(base);await page.getByRole('tab',{name:'Home',exact:true}).waitFor();const cold=Date.now()-started;
 const transitions=[];
 for(let round=0;round<3;round++)for(const [name,path] of (authenticated?[['Explore','/social'],['Activity','/activity'],['Messages','/messages'],['Account','/account'],['Home','/']]:[['Explore','/social'],['Home','/']])){
  const t=Date.now();await page.getByRole('tab',{name,exact:true}).click();await page.waitForURL(u=>u.pathname===path);transitions.push({name,ms:Date.now()-t});
 }
 await page.evaluate(()=>{for(const name of ['Explore','Activity','Messages','Home'])document.querySelector(`[role="tab"][aria-label="${name}"]`)?.click()});
 await page.waitForTimeout(500);await page.waitForURL(u=>u.pathname==='/');
 // A held public section must settle to actionable recovery, with navigation usable.
 held=true;await page.reload();await page.getByRole('tab',{name:'Home',exact:true}).waitFor();await page.waitForTimeout(16_000);
 const text=await page.locator('#everest-scene-0').innerText();const recovered=/retry|try again/i.test(text);
 if(!baseline)assert.ok(recovered,'Held discovery read offers recovery');
 held=false;const retry=page.locator('#everest-scene-0').getByRole('button',{name:/retry|try again/i}).first();if(recovered){await retry.click();await page.waitForTimeout(500)}
 await context.setOffline(true);await page.getByRole('tab',{name:'Explore',exact:true}).click();await page.waitForURL(/social/);await context.setOffline(false);await page.getByRole('tab',{name:'Home',exact:true}).click();await page.waitForURL(u=>u.pathname==='/');
 let customerAccessFailureBlocked=null;
 if(authenticated){accessFail=true;await page.reload();await page.getByRole('tab',{name:'Account',exact:true}).click();await page.waitForURL(/account/);await page.waitForTimeout(1000);customerAccessFailureBlocked=await page.getByText('Something went wrong loading this page.',{exact:true}).isVisible();if(!baseline){assert.equal(customerAccessFailureBlocked,false);privilegedSurface=true;await page.goto(base+'/business-today');await page.getByText('Something went wrong loading this page.',{exact:true}).waitFor();}}
 assert.deepEqual(errors,[]);
 report.runs.push({authenticated,cold_ms:cold,transitions,held_read_recovery:recovered,customerAccessFailureBlocked,errors,calls,long_tasks_ms:await page.evaluate(()=>window.stalls)});await context.close();
}
await browser.close();const output=process.env.RECOVERY_OUTPUT||'/tmp/recovery-browser.json';await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
