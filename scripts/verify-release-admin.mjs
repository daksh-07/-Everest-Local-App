/* global localStorage */
// Exported admin screen; all Auth, REST and realtime requests are fixtures.
// These tests do not establish real admin/MFA or production RLS acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Buffer} from 'node:buffer';
import {URL} from 'node:url';
import {trackFixtureReads,settleFixtureReads} from './lib/browser-fixture.mjs';
const engine=process.env.EVEREST_QA_BROWSER||'chromium';
const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await engines[engine].launch(engine==='webkit'?{}:{executablePath:process.env.EVEREST_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const base=process.env.EVEREST_PREVIEW_URL||'http://127.0.0.1:4173';
const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/everest-admin-qa';
const uid='11111111-1111-4111-8111-111111111111';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{},factors:[{id:'totp-fixture',factor_type:'totp',status:'verified'}]};
const session={access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:4102444800,aal:'aal2',amr:[{method:'password'}]})).toString('base64url')}.fixture`,refresh_token:'fixture',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};
const scenarios=[],errors=[];
async function open(state){
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.addInitScript(session=>localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify(session)),session);
 const page=await context.newPage();await trackFixtureReads(page);page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.routeWebSocket('**/realtime/**',ws=>ws.close());
 await page.route(/supabase\.co/,async route=>{
  const request=route.request(),url=new URL(request.url()),name=url.pathname.split('/').at(-1);
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':request.headers()['access-control-request-headers']||'*','access-control-allow-methods':'GET,POST,HEAD,OPTIONS','access-control-expose-headers':'content-range'};
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname.includes('/auth/'))return route.fulfill({json:user,headers});
  if(state.fail===name)return route.fulfill({status:503,json:{message:'Fixture unavailable'},headers});
  let data=[],count=0;
  if(name==='get_my_access_context')data={profile_role:'ADMIN',is_authorized_admin:true,is_business_member:false,is_verified_business:false,is_active_driver:false};
  else if(name==='get_admin_auth_state')data={authorized_admin:true,password_authenticated:true,mfa_verified:true,admin:true};
  else if(name==='get_my_workspace_context')data={mode:'CUSTOMER',businesses:[],active_business_id:null};
  else if(name==='admin_list_post_reports')data=Array.from({length:state.reports||0},(_,i)=>({id:'report-'+i,post_id:'post-'+i,author_id:uid,reason:'SPAM',caption:'Reported fixture '+i,status:'OPEN',content_format:'POST',created_at:'2026-10-23T06:00:00Z'}));
  if(state.noCount&&request.method()==='HEAD')return route.fulfill({status:200,headers});
  const object=request.headers().accept?.includes('vnd.pgrst.object');
  return route.fulfill({json:object&&Array.isArray(data)?data[0]??null:data,headers:{...headers,'content-range':`*/${count}`}});
 });
 await page.goto(base+'/admin');
 return {page,context};
}
try{
 for(const state of [{name:'known empty queues'},{name:'unavailable reports',fail:'admin_list_post_reports'},{name:'unavailable drivers',fail:'driver_applications'},{name:'capped reports',reports:50},{name:'missing platform count',noCount:true}]){
  const {page,context}=await open(state);
  if(state.noCount){await page.getByRole('button',{name:'Retry admin access',exact:true}).waitFor();assert.equal(await page.getByText('All caught up',{exact:true}).count(),0)}
  else{
   await page.getByText('Operations',{exact:true}).waitFor();
   if(state.fail){await page.getByText('Attention status unavailable',{exact:true}).waitFor();assert.equal(await page.getByText('All caught up',{exact:true}).count(),0)}
   else if(state.reports){await page.getByRole('button',{name:'Reported posts: 50+ waiting',exact:true}).waitFor();assert.equal(await page.getByText('Needs attention · 50',{exact:true}).count(),0)}
   else await page.getByText('All caught up',{exact:true}).waitFor();
  }
  scenarios.push(state.name);await settleFixtureReads(page);await context.close();
 }
 assert.deepEqual(errors,[]);
}finally{
 await browser.close();await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/admin-'+engine+'.json',JSON.stringify({engine,scenarios,errors},null,2)+'\n');
}
console.log(JSON.stringify({engine,passed:scenarios.length,errors:errors.length}));
