/* global localStorage, document, innerWidth */
// Exported UI acceptance. All external transport is intercepted; no live writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import {trackFixtureReads,settleFixtureReads} from './lib/browser-fixture.mjs';
const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const {default:AxeBuilder}=await import(process.env.AXE_MODULE||'@axe-core/playwright');
const engine=process.env.EVEREST_QA_BROWSER||'chromium',base=process.env.EVEREST_PREVIEW_URL||'http://localhost:8090',out=process.env.EVEREST_QA_ARTIFACTS||'docs/ux/evidence/business-attention';await fs.mkdir(out,{recursive:true});
const browser=await engines[engine].launch(engine==='webkit'?{}:{executablePath:process.env.EVEREST_BROWSER_PATH,args:['--no-sandbox']});
const uid='11111111-1111-4111-8111-111111111111',biz='22222222-2222-4222-8222-222222222222';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{}};
const session={access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:4102444800})).toString('base64url')}.fixture`,refresh_token:'fixture-never-sent',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};
const business={id:biz,name:'Fixture cleaning',status:'ACTIVE',verification_status:'VERIFIED',member_role:'OWNER',can_view_crm:true,can_view_inbox:true,can_view_all_jobs:true,can_view_finance:true,can_view_orders:true,can_manage_settings:true,stripe_connected_account_id:'fixture',stripe_connect_status:'ACTIVE',stripe_details_submitted:true,stripe_charges_enabled:true,stripe_payouts_enabled:true};
const report={engine,runs:[],errors:[]};
try{for(const mode of ['DEFAULT','PULSE','CLASSIC'])for(const theme of ['LIGHT','DARK']){
 if(process.env.EVEREST_QA_QUICK==='1'&&(mode!=='DEFAULT'||theme!=='LIGHT'))continue;
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.addInitScript(({session,mode,theme})=>{localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify(session));localStorage.setItem('everest-local-theme',theme);localStorage.setItem('everest-local-experience-v1',mode)},{session,mode,theme});
 const page=await context.newPage();await trackFixtureReads(page);page.on('pageerror',e=>report.errors.push(e.message));await page.routeWebSocket('**/realtime/**',ws=>ws.close());
 let failed=false,empty=false,release;const held=new Promise(resolve=>{release=resolve});let hold=true;const calls=[];
 const incoming={id:'33333333-3333-4333-8333-333333333333',request_id:'44444444-4444-4444-8444-444444444444',status:'OPEN',description:'Customer needs cleaning',expires_at:'2099-01-01T00:00:00Z',created_at:'2026-10-30T00:00:00Z'};
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin===new URL(base).origin)return route.continue();
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':req.headers()['access-control-request-headers']||'*','access-control-allow-methods':'GET,POST,HEAD,OPTIONS','content-range':'0-0/0','access-control-expose-headers':'content-range'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(!url.hostname.endsWith('.supabase.co'))return route.abort();
  const name=url.pathname.split('/').at(-1);let json=[];
  if(url.pathname.includes('/auth/'))json=user;
  else if(name==='get_my_access_context')json={profile_role:'BUSINESS',is_business_member:true,is_verified_business:true,business_id:biz,is_authorized_admin:false,is_active_driver:false};
  else if(name==='get_my_workspace_context')json={mode:'BUSINESS',active_business_id:biz,businesses:[business]};
  else if(name==='businesses')json=req.headers().accept?.includes('vnd.pgrst.object')?business:[business];
  else if(name==='list_my_business_opportunities'){
   calls.push(req.postDataJSON());if(hold)await held;
   if(failed)return route.fulfill({status:503,headers,json:{code:'XX000',message:'Fixture unavailable'}});
   json=empty?[]:[incoming,{...incoming,id:'expired-fixture',request_id:'expired-request',description:'Expired fixture',expires_at:'2000-01-01T00:00:00Z'}];
  }else if(req.method()!=='GET'&&req.method()!=='HEAD'&&!url.pathname.includes('/rpc/'))return route.fulfill({status:403,headers,json:{message:'Fixture blocks writes'}});
  return route.fulfill({headers,json});
 });
 await page.goto(base+'/business-today');await page.getByText('Checking requests…',{exact:true}).waitFor();assert.equal(await page.getByText('You’re all caught up',{exact:true}).count(),0);hold=false;release();
 await page.getByText('1 waiting for a response',{exact:true}).waitFor();await page.getByText('Customer request waiting',{exact:true}).waitFor();assert.equal(await page.getByText('Expired fixture',{exact:true}).count(),0);assert.equal(await page.getByText('You’re all caught up',{exact:true}).count(),0);assert.ok(calls.every(c=>c.p_business_id===biz&&c.p_status==='OPEN'));
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();assert.deepEqual(axe.violations,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`${out}/today-${theme.toLowerCase()}-${mode.toLowerCase()}.png`});
 await page.getByRole('button',{name:/Customer request waiting.*Respond/}).click();await page.waitForURL(/opportunities.*requestId=/);await page.getByRole('button',{name:'Send quote',exact:true}).waitFor();
 empty=true;await page.goBack();await page.getByText('No open requests',{exact:true}).waitFor();await settleFixtureReads(page);await page.getByText('You’re all caught up',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Review customer requests: 0 open',exact:true}).click();await page.waitForURL(/opportunities/);failed=true;await page.goBack();await page.getByRole('button',{name:'Retry customer requests',exact:true}).waitFor();assert.equal(await page.getByText('You’re all caught up',{exact:true}).count(),0);failed=false;await page.getByRole('button',{name:'Retry customer requests',exact:true}).click();await page.getByText('You’re all caught up',{exact:true}).waitFor();
 await settleFixtureReads(page);report.runs.push({theme,mode,activeBusinessScoped:true,heldReadNotEmpty:true,expiredExcluded:true,requestResponseDeepLink:true,returnRefresh:true,failureRetry:true,axeViolations:axe.violations.length});await context.close();
}assert.deepEqual(report.errors,[]);}finally{await fs.writeFile(`${out}/report-${engine}.json`,JSON.stringify(report,null,2));await browser.close()}
console.log(JSON.stringify(report));
