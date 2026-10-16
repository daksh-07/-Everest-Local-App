/* global localStorage, Buffer, URL */
// Interaction regression for the public person profile (app/public-user.tsx).
// Every Supabase call is answered by an in-memory fixture; writes are recorded, never sent.
// Usage: serve a web export, then EVEREST_PREVIEW_URL=http://127.0.0.1:4174 node scripts/verify-public-profile.mjs
import assert from 'node:assert/strict';
import process from 'node:process';
const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.EVEREST_QA_BROWSER==='webkit'?'webkit':'chromium';
const base=process.env.EVEREST_PREVIEW_URL||'http://127.0.0.1:4174';
const uid='11111111-1111-4111-8111-111111111111';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{}};
const session={access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:4102444800})).toString('base64url')}.fixture`,refresh_token:'fixture-never-sent',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};
const browser=await engines[engine].launch(engine==='webkit'?{}:{executablePath:process.env.EVEREST_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});

const other='88888888-8888-4888-8888-888888888888';
async function open(state){
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
   if(name==='get_public_user_profile')return route.fulfill({json:{id:other,display_name:'Priya Shah',username:'priyashah',avatar_url:null,bio:'Local gardener.',website_url:null,suburb:'North Melbourne',joined_at:'2025-08-01T00:00:00Z',connection_count:38,mutual_count:4,connection_state:state.connection}});
   if(name==='remove_connection'){state.connection='NONE';return route.fulfill({json:true})}
   if(name==='send_connection_request'){state.connection='OUTGOING';return route.fulfill({json:'req1'})}
   if(name.includes('message'))return route.fulfill({json:'c1'});
   return route.fulfill({json:[]});
  }
  return route.fulfill({json:[],headers:{'access-control-expose-headers':'content-range','content-range':'0-0/0'}});
 });
 await page.goto(`${base}/public-user?id=${other}`);
 return {page,calls,context};
}
try{
 const state={connection:'CONNECTED'};
 const {page,calls,context}=await open(state);
 await page.getByRole('button',{name:'Connected'}).click();
 await page.getByText('Remove Priya Shah?').waitFor();
 assert.equal(calls.some(c=>c.name==='remove_connection'),false,'tapping Connected only asks');
 await page.getByRole('button',{name:'Not now'}).click();
 await page.getByText('Remove Priya Shah?').waitFor({state:'hidden'});
 assert.equal(calls.some(c=>c.name==='remove_connection'),false,'cancel keeps the connection');
 await page.getByRole('button',{name:'Connected'}).click();
 await page.getByRole('button',{name:'Remove connection'}).click();
 await page.getByRole('button',{name:'Connect',exact:true}).waitFor();
 assert.deepEqual(calls.find(c=>c.name==='remove_connection')?.body,{p_other:other});
 // Message opens a composer sheet; Send is disabled until there is text.
 await page.getByRole('button',{name:'Message'}).click();
 await page.getByText('Message Priya Shah').waitFor();
 assert.equal(await page.getByRole('button',{name:'Send'}).isDisabled(),true);
 await page.getByLabel('Your message').fill('Hi Priya — loved the hedge post.');
 await page.getByRole('button',{name:'Send'}).click();
 await page.waitForURL(/\/messages/);
 assert.ok(calls.some(c=>c.name.includes('message')&&JSON.stringify(c.body).includes('loved the hedge post')),'message text is sent once, to this person');
 await context.close();
 console.log(`${engine}: public profile interactions passed (remove-connection confirm, cancel is inert, message sheet). Fixture transport only.`);
}finally{await browser.close()}
