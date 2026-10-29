/* global localStorage, document, innerWidth */
// Exported application, synthetic sessions and intercepted transport only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {URL} from 'node:url';
import {Buffer} from 'node:buffer';
import {trackFixtureReads,settleFixtureReads} from './lib/browser-fixture.mjs';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const {default:AxeBuilder}=await import(process.env.AXE_MODULE||'@axe-core/playwright');
const engine=process.env.EVEREST_QA_BROWSER||'chromium';
const base=process.env.EVEREST_PREVIEW_URL||'http://localhost:8090';
const out=process.env.EVEREST_QA_ARTIFACTS||'docs/ux/evidence/request-location';
await fs.mkdir(out,{recursive:true});
const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{}:{executablePath:process.env.EVEREST_BROWSER_PATH,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote']});
const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid'};
const session={access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:4102444800})).toString('base64url')}.fixture`,refresh_token:'fixture',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};
const report={engine,runs:[],errors:[]};
try{
 for(const theme of ['LIGHT','DARK'])for(const mode of ['DEFAULT','PULSE','CLASSIC'])for(const width of [320,390]){
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
  await context.addInitScript(({session,theme,mode})=>{localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify(session));localStorage.setItem('everest-local-theme',theme);localStorage.setItem('everest-local-experience-v1',mode)},{session,theme,mode});
  const page=await context.newPage();await trackFixtureReads(page);page.on('pageerror',e=>report.errors.push(e.message));
  await page.routeWebSocket('**/realtime/**',ws=>ws.close());
  const lookups=[],posted=[];let fail=true,release;let held;
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin===new URL(base).origin)return route.continue();
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':req.headers()['access-control-request-headers']||'*','access-control-allow-methods':'GET,POST,OPTIONS'};
   if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(url.hostname==='nominatim.openstreetmap.org'){
    lookups.push(url.searchParams.get('q'));if(held)await held;
    const india=url.searchParams.get('q').endsWith('India');
    return route.fulfill({headers,json:fail?[]:[{lat:india?'19.07':'43.65',lon:india?'72.87':'-79.38',display_name:india?'10 Fixture Street, Mumbai, Maharashtra, India':'10 Fixture Street, Toronto, Ontario, Canada',address:{house_number:'10',road:'Fixture Street',city:india?'Mumbai':'Toronto',state:india?'Maharashtra':'Ontario',country:india?'India':'Canada',postcode:india?'400001':'M5V 2T6'}}]});
   }
   if(url.hostname.endsWith('.supabase.co')){
    const name=url.pathname.split('/').at(-1);let json=[];
    if(url.pathname.includes('/auth/'))json=user;
    if(name==='get_my_access_context')json={profile_role:'CUSTOMER',is_business_member:false,is_authorized_admin:false};
    if(name==='get_my_workspace_context')json={mode:'CUSTOMER',active_business_id:null,businesses:[]};
    if(name==='profiles')json={id:uid,role:'CUSTOMER',suburb:'Toronto',city:'Toronto',state:'Ontario',country:width===390?'Canada':null};
    if(name==='services')json={id:sid,name:'Fixture detailing',delivery_mode:'LOCAL'};
    if(name==='create_service_request_v5'){posted.push(req.postDataJSON());json='33333333-3333-4333-8333-333333333333';}
    if(name==='service_requests')json={status:'OPEN'};
    return route.fulfill({headers,json});
   }
   return route.abort();
  });
  await page.goto(base+`/request?serviceId=${sid}`);await page.getByText('Fixture detailing',{exact:true}).waitFor();await settleFixtureReads(page);await page.getByRole('textbox',{name:'Job details'}).fill('Clean the fixture sedan interior.');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  const country=page.getByRole('textbox',{name:'Country',exact:true});await country.waitFor();await settleFixtureReads(page);
  assert.equal(await country.inputValue(),width===390?'Canada':'');
  await country.fill('');await page.getByRole('textbox',{name:'Street address',exact:true}).fill('10 Fixture Street');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  try{await page.getByRole('alert').filter({hasText:'Enter the country'}).waitFor({timeout:5000})}catch(e){console.error(JSON.stringify({theme,mode,width,fields:await page.getByRole('textbox').evaluateAll(els=>els.map(el=>({label:el.getAttribute('aria-label'),value:el.value}))),body:await page.locator('body').innerText()}));await page.screenshot({path:`${out}/validation-failure.png`});throw e;}
  try{await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Country',{},{timeout:3000})}catch(e){console.error(JSON.stringify({active:await page.evaluate(()=>document.activeElement?.outerHTML),country:await country.evaluate(el=>el.outerHTML)}));throw e;}assert.equal(await country.evaluate(el=>el===document.activeElement),true,await page.evaluate(()=>document.activeElement?.outerHTML));assert.equal(lookups.length,0);
  await country.fill('Canada');await page.getByRole('textbox',{name:'Postal code (optional)',exact:true}).fill('M5V 2T6');
  held=new Promise(resolve=>{release=resolve});await page.getByRole('button',{name:'Confirm precise address',exact:true}).click();
  await page.getByRole('button',{name:'Locating address…',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Previous step',exact:true}).isEnabled(),false);
  assert.equal(await country.getAttribute('readonly'),'');assert.equal(await page.getByRole('button',{name:'Continue',exact:true}).isEnabled(),false);
  const pendingAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();assert.deepEqual(pendingAxe.violations,[]);
  release();held=null;await page.getByRole('alert').filter({hasText:'We could not locate that exact address'}).waitFor();
  assert.equal(await country.inputValue(),'Canada');assert.equal(await page.getByRole('textbox',{name:'Postal code (optional)',exact:true}).inputValue(),'M5V 2T6');
  fail=false;await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByText('When do you need it?',{exact:true}).waitFor();
  assert.equal(lookups.length,2);assert.equal(lookups.every(q=>q.includes('Canada')&&!q.includes('Australia')),true);
  // Returning to change country must discard the old confirmed pin and look it up again.
  await page.getByRole('button',{name:'Previous step',exact:true}).click();await page.getByRole('button',{name:'Change location',exact:true}).click();
  await country.fill('India');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByText('When do you need it?',{exact:true}).waitFor();assert.match(lookups.at(-1),/India$/);
  // The newly confirmed country and pin must reach the request payload.
  await page.getByRole('button',{name:'Previous step',exact:true}).click();await page.getByText('10 Fixture Street, Mumbai, Maharashtra, India',{exact:true}).waitFor();
  const suffix=`${theme.toLowerCase()}-${mode.toLowerCase()}-${width}`;await page.screenshot({path:`${out}/${suffix}.png`});
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();assert.deepEqual(axe.violations,[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Post request',exact:true}).click();await page.getByRole('button',{name:'View activity',exact:true}).waitFor();
  assert.equal(posted.length,1);assert.equal(posted[0].p_country,'India');assert.equal(posted[0].p_latitude,19.07);assert.equal(posted[0].p_postal_code,'400001');assert.equal(posted[0].p_location_confirmed,true);
  report.runs.push({theme,mode,width,lookups:lookups.length,posted:posted.length,axeViolations:axe.violations.length});await settleFixtureReads(page);await context.close();
 }
 assert.deepEqual(report.errors,[]);
}finally{await fs.writeFile(`${out}/report-${engine}.json`,JSON.stringify(report,null,2));await browser.close()}
console.log(JSON.stringify(report));
