/* global localStorage, document, innerWidth */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {URL} from 'node:url';
import {Buffer} from 'node:buffer';
import {trackFixtureReads,settleFixtureReads} from './lib/browser-fixture.mjs';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const {default:AxeBuilder}=await import(process.env.AXE_MODULE||'@axe-core/playwright');
const engine=process.env.EVEREST_QA_BROWSER||'chromium';
const base=process.env.EVEREST_PREVIEW_URL||'http://localhost:8090';
const out=process.env.EVEREST_QA_ARTIFACTS||'docs/ux/evidence/request-drafts';await fs.mkdir(out,{recursive:true});
const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{}:{executablePath:process.env.EVEREST_BROWSER_PATH,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote']});
const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',rid='33333333-3333-4333-8333-333333333333';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{}};
const session={access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:4102444800})).toString('base64url')}.fixture`,refresh_token:'fixture',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};
const report={engine,runs:[],errors:[]};
try{for(const theme of ['LIGHT','DARK'])for(const mode of ['DEFAULT','PULSE','CLASSIC']){
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.addInitScript(({session,theme,mode})=>{if(!localStorage.getItem('fixture-session-seeded')){localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify(session));localStorage.setItem('fixture-session-seeded','1')}localStorage.setItem('everest-local-theme',theme);localStorage.setItem('everest-local-experience-v1',mode)},{session,theme,mode});
 const page=await context.newPage();await trackFixtureReads(page);page.on('pageerror',e=>report.errors.push(e.message));await page.routeWebSocket('**/realtime/**',ws=>ws.close());
 let authenticated=true,committed=false,failPost=true,commitOnFailure=true,failMedia=false;const posted=[];const lookups=[];
 await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin===new URL(base).origin)return route.continue();
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':req.headers()['access-control-request-headers']||'*','access-control-allow-methods':'GET,POST,OPTIONS'};
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
 if(url.hostname==='nominatim.openstreetmap.org'){lookups.push(url.searchParams.get('q'));return route.fulfill({headers,json:[{lat:'43.65',lon:'-79.38',display_name:'10 Fixture Street, Toronto, Ontario, Canada',address:{house_number:'10',road:'Fixture Street',city:'Toronto',state:'Ontario',country:'Canada',postcode:'M5V 2T6'}}]})}
 if(url.hostname.endsWith('.supabase.co')){
 if(failMedia&&url.pathname.includes('/storage/v1/object/request-media/'))return route.fulfill({headers,status:500,json:{message:'Fixture upload failure'}});const name=url.pathname.split('/').at(-1);let json=[];
 if(url.pathname.includes('/auth/'))json=authenticated?user:{user:null};
 if(url.pathname.includes('/auth/v1/token')){authenticated=true;json=session;}
 if(url.pathname.includes('/auth/v1/logout')){authenticated=false;json={};}
 if(name==='get_my_access_context')json={profile_role:'CUSTOMER',is_business_member:false,is_authorized_admin:false};
 if(name==='get_my_workspace_context')json={mode:'CUSTOMER',active_business_id:null,businesses:[]};
 if(name==='profiles')json={id:uid,role:'CUSTOMER',full_name:'Fixture User',suburb:'Toronto',city:'Toronto',state:'Ontario',country:'Canada'};
 if(name==='services')json={id:sid,name:'Fixture detailing',delivery_mode:'LOCAL'};
 if(name==='create_service_request_v5'){posted.push(req.postDataJSON());if(failPost){if(commitOnFailure)committed=true;return route.abort();}committed=true;json=rid;}
 if(name==='service_requests')json=url.searchParams.has('request_idempotency_key')?(committed?{id:rid}:null):[];
 return route.fulfill({headers,json});}return route.abort();});
 const details='Clean the fixture sedan and preserve these details.';
 await page.goto(base+`/request?serviceId=${sid}`);await page.getByText('Fixture detailing',{exact:true}).waitFor();await settleFixtureReads(page);
 await page.getByRole('textbox',{name:'Job details'}).fill(details);await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('textbox',{name:'Street address',exact:true}).fill('10 Fixture Street');
 // A real reload exercises pagehide flushing before the debounce fires.
 await page.reload();await page.getByRole('button',{name:'Continue saved request',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'Job details'}).inputValue(),details);
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'Street address',exact:true}).inputValue(),'10 Fixture Street');
 assert.equal(await page.getByRole('textbox',{name:'Country',exact:true}).inputValue(),'Canada');assert.equal(lookups.length,0);
 // Navigation away exposes the saved request on Home, then restores its original service route.
 await settleFixtureReads(page);await page.goto(base);await page.getByRole('button',{name:'Continue saved request',exact:true}).click();
 await page.getByRole('button',{name:'Continue saved request',exact:true}).click();await page.getByRole('textbox',{name:'Job details'}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'Job details'}).inputValue(),details);
 // Session interruption preserves the owner-scoped draft and the auth return destination.
 authenticated=false;await page.evaluate(()=>localStorage.removeItem('sb-bmwbljefnamvjnmuvkvv-auth-token'));await page.reload();await page.waitForURL(/\/auth/);
 await page.getByPlaceholder('Email address',{exact:true}).fill('fixture@example.invalid');await page.getByPlaceholder('Password',{exact:true}).fill('FixtureOnly123!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(/\/request/);
 await page.getByRole('button',{name:'Continue saved request',exact:true}).click();await page.getByRole('textbox',{name:'Job details'}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Job details'}).inputValue(),details);
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Post request',exact:true}).click();
 await page.getByRole('button',{name:'Check request status',exact:true}).waitFor();assert.equal(posted.length,1);
 await page.reload();await page.getByRole('button',{name:'Continue saved request',exact:true}).click();await page.getByRole('button',{name:'Check request status',exact:true}).waitFor();
 assert.equal(posted.length,1);const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();assert.deepEqual(axe.violations,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:`${out}/recovery-${theme.toLowerCase()}-${mode.toLowerCase()}.png`});
 await page.getByRole('button',{name:'Check request status',exact:true}).click();await page.getByRole('button',{name:'View activity',exact:true}).waitFor();assert.equal(posted.length,1);
 // A confirmed post must not leave a resumable copy which could recreate the request.
 await settleFixtureReads(page);await page.reload();await page.getByRole('textbox',{name:'Job details'}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Job details'}).inputValue(),'');assert.equal(posted.length,1);
 // If the first attempt never committed, an explicit retry must use the original key and payload.
 committed=false;commitOnFailure=false;failPost=true;
 await page.getByRole('textbox',{name:'Job details'}).fill('Second fixture request, never committed initially.');
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('textbox',{name:'Street address',exact:true}).fill('10 Fixture Street');await page.getByRole('button',{name:'Continue',exact:true}).click();
 await page.getByRole('button',{name:'Post request',exact:true}).click();await page.getByRole('button',{name:'Check request status',exact:true}).waitFor();assert.equal(posted.length,2);
 await page.reload();await page.getByRole('button',{name:'Continue saved request',exact:true}).click();failPost=false;
 await page.getByRole('button',{name:'Retry posting same request',exact:true}).click();await page.getByRole('button',{name:'View activity',exact:true}).waitFor();assert.equal(posted.length,3);assert.deepEqual(posted[2],posted[1]);
 let photoFailureHandled=false;
 if(theme==='LIGHT'&&mode==='DEFAULT'){
  await settleFixtureReads(page);await page.reload();await page.getByRole('textbox',{name:'Job details'}).fill('Fixture photo upload failure after posting.');
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('textbox',{name:'Street address',exact:true}).fill('10 Fixture Street');await page.getByRole('button',{name:'Continue',exact:true}).click();
  const choosing=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Add photos',exact:true}).click();const chooser=await choosing;
  await chooser.setFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=','base64')});
  await page.getByRole('button',{name:'Add photos (1/10)',exact:true}).waitFor();
  const waitPhotoCount=async expected=>page.waitForFunction(expected=>{const key=Object.keys(localStorage).find(k=>/^everest-request-draft\.v1\.[a-f0-9-]{36}$/.test(k));if(!key)return false;const manifest=JSON.parse(localStorage.getItem(key));let raw='';for(let i=0;i<manifest.count;i++)raw+=localStorage.getItem(`${key}.${manifest.generation}.${i}`)||'';return JSON.parse(raw).form.photoCount===expected},expected);
  await waitPhotoCount(1);assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('everest-request-draft')).some(k=>/fixture\.png|data:image|blob:|file:\/\//.test(localStorage.getItem(k)))),false);
  await settleFixtureReads(page);await page.reload();await page.getByRole('button',{name:'Continue saved request',exact:true}).click();await page.getByRole('button',{name:'Reattach photos',exact:true}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Job details'}).inputValue(),'Fixture photo upload failure after posting.');
  const photoAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();assert.deepEqual(photoAxe.violations,[]);
  const rechoosing=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Reattach photos',exact:true}).click();await (await rechoosing).setFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=','base64')});
  await page.getByRole('button',{name:'Reattach photos',exact:true}).waitFor({state:'hidden'});await waitPhotoCount(1);
  await settleFixtureReads(page);await page.reload();await page.getByRole('button',{name:'Continue saved request',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('textbox',{name:'Street address',exact:true}).fill('10 Fixture Street');await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Post request',exact:true}).click();await page.getByRole('alert').filter({hasText:'Reattach the photos'}).waitFor();assert.equal(posted.length,3);
  await page.getByRole('button',{name:'Continue without photos',exact:true}).click();await waitPhotoCount(0);
  const choosingAgain=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Add photos',exact:true}).click();await (await choosingAgain).setFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=','base64')});
  await page.getByRole('button',{name:'Add photos (1/10)',exact:true}).waitFor();failMedia=true;
  await page.getByRole('button',{name:'Post request',exact:true}).click();await page.getByRole('button',{name:'View activity',exact:true}).waitFor();await page.getByRole('alert').filter({hasText:'some photos could not be attached'}).waitFor();assert.equal(posted.length,4);photoFailureHandled=true;
 }
 // Explicit sign-out removes local content and invalidates queued writers.
 await settleFixtureReads(page);await page.reload();await page.getByRole('textbox',{name:'Job details'}).fill('Private fixture draft to remove on sign-out.');
 await page.waitForFunction(()=>{const key=Object.keys(localStorage).find(k=>/^everest-request-draft\.v1\.[a-f0-9-]{36}$/.test(k));return Boolean(key&&localStorage.getItem(key))});
 await page.goto(base+'/account');await page.getByRole('button',{name:'Open account menu',exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL(u=>u.pathname==='/'||u.pathname==='/auth');await settleFixtureReads(page);
 assert.equal(await page.evaluate(()=>localStorage.getItem('sb-bmwbljefnamvjnmuvkvv-auth-token')),null);
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('everest-request-draft.v1.')).length),0);
 report.runs.push({theme,mode,refresh:true,navigation:true,authInterruption:true,locationReconfirmation:true,unknownOutcomeRecoveredWithoutRepost:true,originalPayloadRetry:true,logoutClearsCopy:true,photoFailureHandled,photoRecoveryDecision:photoFailureHandled,posted:posted.length,axeViolations:axe.violations.length});await settleFixtureReads(page);await context.close();
}assert.deepEqual(report.errors,[]);}finally{await fs.writeFile(`${out}/report-${engine}.json`,JSON.stringify(report,null,2));await browser.close()}
console.log(JSON.stringify(report));
