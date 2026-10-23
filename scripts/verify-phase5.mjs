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
const baseline=process.env.PHASE5_BASELINE==='1';
const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/phase5-evidence';
await fs.mkdir(output,{recursive:true});
const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{}:{executablePath:process.env.EVEREST_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const uid='11111111-1111-4111-8111-111111111111',biz='33333333-3333-4333-8333-333333333333';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{}};
const session={access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:4102444800})).toString('base64url')}.fixture`,refresh_token:'fixture',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};
const business={id:biz,name:'Phase Five Garden Care',status:'ACTIVE',verification_status:'VERIFIED',member_role:'OWNER',suburb:'Carlton',city:'Melbourne',state:'VIC',description:'Care for your local garden.',can_view_crm:true,can_view_finance:true,can_view_orders:true};
const service={id:'s1',business_id:biz,name:'Garden maintenance',base_price:90,duration_minutes:60,delivery_mode:'LOCAL',active:true,service_booking_settings:{instant_booking_enabled:false}};
const product={id:'p1',business_id:biz,business_name:business.name,name:'Local garden kit',price:20,sale_price:null,status:'ACTIVE',product_images:[],primary_image_path:null};
const result={kind:'SERVICE',id:'s1',title:'Garden maintenance',subtitle:'Local service',score:60,metadata:{business_id:biz}};
const report={engine,baseline,scenarios:[],layouts:[],errors:[],errorDetails:[],failedRequests:[]};
async function open(path,state={},authenticated=false){
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.addInitScript(({session,authenticated})=>{if(!localStorage.getItem('everest-local-theme'))localStorage.setItem('everest-local-theme','LIGHT');if(authenticated)localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify(session))},{session,authenticated});
 console.log('Fixture',path,state.fail??'healthy');
 const page=await context.newPage();await trackFixtureReads(page);page.setDefaultTimeout(15000);const calls=[];
 page.on('pageerror',error=>{report.errors.push(error.message);report.errorDetails.push({path,url:page.url(),state:{empty:state.empty,fail:state.fail},message:error.message,stack:error.stack});console.error('PAGE_ERROR',path,error.stack)});
 page.on('requestfailed',request=>report.failedRequests.push({path,url:new URL(request.url()).pathname,error:request.failure()?.errorText}));
 await page.routeWebSocket('**/realtime/**',ws=>ws.close());
 await page.route(/supabase\.co/,async route=>{
  const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop();calls.push(name);
  const cors={'access-control-allow-origin':'*','access-control-allow-headers':req.headers()['access-control-request-headers']||'authorization,apikey,content-type,x-client-info,prefer,accept,range,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version','access-control-allow-methods':'GET,POST,HEAD,OPTIONS'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:cors});
  if(url.pathname.includes('/auth/'))return route.fulfill({json:authenticated?user:{user:null},headers:cors});
  if(req.method()!=='GET'&&req.method()!=='HEAD'&&!url.pathname.includes('/rpc/'))return route.fulfill({status:403,json:{message:'Fixture blocks writes'},headers:cors});
  if(state.delays?.[name])await new Promise(resolve=>setTimeout(resolve,state.delays[name]));
  if(state.fail?.includes(name))return route.fulfill({status:state.denied?403:503,json:{code:state.denied?'42501':'XX000',message:state.denied?'permission denied':'Fixture unavailable'},headers:cors}).catch(()=>{});
  let rows=[];
  if(name==='get_my_workspace_context')rows={mode:authenticated?'BUSINESS':'CUSTOMER',active_business_id:authenticated?biz:null,businesses:authenticated?[business]:[]};
  else if(name==='get_my_access_context')rows={profile_role:authenticated?'BUSINESS':'CUSTOMER',is_business_member:authenticated,is_verified_business:authenticated,business_id:biz,business_name:business.name,is_authorized_admin:false,is_active_driver:false};
  else if(name==='businesses')rows=[business];
  else if(name==='services')rows=[service];
  else if(name==='products'||name==='shop_products')rows=[product];
  else if(name==='universal_search')rows=state.empty?[]:[result];
  else if(name==='reviews')rows=[{rating:5}];
  else if(name==='profiles')rows=[{id:uid,role:'BUSINESS',full_name:'Fixture Owner'}];
  else if(name==='crm_opportunities')rows=[{id:'d1',title:'Garden lead',status:'OPEN',stage_id:'stage1',estimated_value:250,last_activity_at:new Date().toISOString()}];
  else if(name==='crm_pipeline_stages')rows=[{id:'stage1',stage_key:'NEW_LEAD'}];
  else if(name==='crm_tasks')rows=[{id:'t1',task:'Call local customer',status:'OPEN',due_at:'2026-01-01T09:00:00Z'}];
  else if(name==='bookings'&&!url.searchParams.get('status')?.includes('COMPLETED'))rows=[{id:'j1',status:'IN_PROGRESS',scheduled_date:new Date().toISOString().slice(0,10),scheduled_time:'09:00:00',price:90}];
  if(state.empty&&['businesses','services','products','shop_products','reviews','crm_opportunities','crm_pipeline_stages','crm_tasks','crm_quotes','crm_bookings','quotes','orders','conversations','marketplace_payout_ledger','bookings'].includes(name))rows=[];
  if(state.empty&&name==='businesses'&&path.startsWith('/business-profile'))rows=[business];
  const count=Array.isArray(rows)?rows.length:1;
  const json=req.headers().accept?.includes('vnd.pgrst.object')?(Array.isArray(rows)?rows[0]??null:rows):rows;
  return route.fulfill({json,headers:{...cors,'access-control-expose-headers':'content-range','content-range':`0-${Math.max(0,count-1)}/${count}`}}).catch(()=>{});
 });
 await page.goto(base+path);return {page,context,calls};
}
// Let fixture reads settle before navigation/teardown. WebKit otherwise reports
// interrupted cross-origin reads as access-control page errors during teardown.
async function reload(page){await settleFixtureReads(page);await page.reload();await page.waitForLoadState('networkidle')}
async function closePage(page,context){await settleFixtureReads(page);await context.close()}
async function shot(page,name){
 if(name==='home-shop-unavailable')await page.getByRole('button',{name:'Retry shop',exact:true}).scrollIntoViewIfNeeded();
 if(name==='home-shop'&&baseline)await page.getByText('Browse products from local businesses',{exact:true}).scrollIntoViewIfNeeded();
 await page.screenshot({path:`${output}/${name}.png`,fullPage:true})}
try{
 if(process.env.PHASE5_LAYOUT_ONLY!=='1'){
 // A denied/unavailable GPS path must still allow explicit manual locality entry.
 {
  const {page,context,calls}=await open('/');
  await page.route(/nominatim\.openstreetmap\.org\/search/,route=>route.fulfill({json:[{lat:'-37.80',lon:'144.96',address:{suburb:'Carlton',city:'Melbourne',state:'Victoria',country:'Australia',postcode:'3053'}}]}));
  await page.getByRole('button',{name:'Set your location',exact:true}).click();
  await page.getByRole('button',{name:'Show businesses in this area',exact:true}).click();
  await page.getByText('Enter a suburb or locality.',{exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Suburb or locality',exact:true}).fill('Carlton');
  await page.getByRole('textbox',{name:'City',exact:true}).fill('Melbourne');
  await page.getByRole('textbox',{name:'State',exact:true}).fill('VIC');
  await page.getByRole('button',{name:'Show businesses in this area',exact:true}).click();
  await page.getByRole('button',{name:/Location: Carlton/}).waitFor();
  assert.equal(calls.includes('save_my_locality'),false,'Guest browsing never attempts to write profile locality');
  report.scenarios.push('Manual location validates input and updates guest browsing without profile writes');
  await closePage(page,context);
 }
 // Home: Shop fails while business/feed remain healthy; only Shop retries.
 {
  const state={fail:['shop_products']};const {page,context,calls}=await open('/',state);
  await page.getByText(business.name,{exact:true}).waitFor();await page.waitForTimeout(500);
  if(baseline){assert.equal(await page.getByText('Browse products from local businesses',{exact:true}).count(),1);report.scenarios.push('Home Shop failure is displayed as empty browse prompt');}
  else{
   await page.getByText('Shop could not be refreshed.',{exact:true}).waitFor();await shot(page,'home-shop-unavailable');
   const businessesBefore=calls.filter(n=>n==='businesses').length;state.fail=[];
   await page.getByRole('button',{name:'Retry shop',exact:true}).click();await page.getByText(product.name,{exact:true}).waitFor();
   assert.equal(calls.filter(n=>n==='businesses').length,businessesBefore,'Shop retry is local');
   report.scenarios.push('Home Shop failure, healthy businesses retained, local retry succeeds');
  }
  await shot(page,'home-shop');await closePage(page,context);
 }
 // Profile: each core child read can fail without hiding identity or other healthy children.
 for(const failed of ['services','products','reviews']){
  const state={fail:[failed],denied:failed==='services'};const {page,context}=await open('/business-profile?id='+biz,state);
  if(baseline){await page.getByText('We could not load this business right now. Please try again.',{exact:true}).waitFor();assert.equal(await page.getByText(business.name,{exact:true}).count(),0);}
  else{await page.getByText(business.name,{exact:true}).waitFor();await page.getByRole('button',{name:'Retry '+failed,exact:true}).waitFor();if(failed!=='services')await page.getByText(service.name,{exact:true}).waitFor();await shot(page,'profile-'+failed+'-unavailable');state.fail=[];await page.getByRole('button',{name:'Retry '+failed,exact:true}).click();await page.getByRole('button',{name:'Retry '+failed,exact:true}).waitFor({state:'hidden'});}
  report.scenarios.push(`Profile ${failed} failure ${baseline?'hides business identity':'isolated with retry'}`);await shot(page,'profile-'+failed);await closePage(page,context);
 }
 // Today: one CRM dataset fails; healthy current job must be visible.
 {
  const state={fail:['crm_opportunities']};const {page,context}=await open('/business-today',state,true);
  if(baseline){await page.getByText('Fixture unavailable',{exact:false}).waitFor();await page.getByText('You’re all caught up',{exact:true}).waitFor();}
  else{await page.getByText('Everest job today',{exact:true}).waitFor();await page.getByRole('button',{name:'Retry sales',exact:true}).waitFor();assert.equal(await page.getByText('You’re all caught up',{exact:true}).count(),0);}
  report.scenarios.push(`Today CRM failure ${baseline?'zeros metrics and shows caught-up state':'preserves job, marks sales unknown'}`);await shot(page,'today-partial');await closePage(page,context);
 }
 // Search: reissue same query, delay, fail; previous matching rows should stay. Query/tab changes must clear them.
 {
  const state={};const {page,context}=await open('/search?q=garden&tab=SERVICE',state);
  await page.getByText(result.title,{exact:true}).waitFor();
  if(baseline){
   state.delays={universal_search:1000};
   await page.getByLabel('Search Everest Local',{exact:true}).fill('garden ');
   assert.equal(await page.getByText(result.title,{exact:true}).count(),0);
   report.scenarios.push('Search clears matching results while reissuing the same trimmed query');
  }else{
   state.delays={universal_search:1000};state.fail=['universal_search'];
   await page.getByRole('button',{name:'Refresh results',exact:true}).click();
   await page.getByText('Updating results…',{exact:true}).waitFor();assert.equal(await page.getByText(result.title,{exact:true}).count(),1);
   await page.getByText('Results could not be refreshed. Previously loaded matches are shown.',{exact:true}).waitFor();
   await shot(page,'search-retained-error');state.fail=[];await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('button',{name:'Refresh results',exact:true}).waitFor();
   await page.getByLabel('Search Everest Local',{exact:true}).fill('different');assert.equal(await page.getByText(result.title,{exact:true}).count(),0);
   state.empty=true;await page.getByText('No Everest results',{exact:true}).waitFor();
   await page.getByRole('tab',{name:'Businesses',exact:true}).click();assert.equal(await page.getByText(result.title,{exact:true}).count(),0);
   report.scenarios.push('Search retains same-query results through delayed retry/error, clears on new query/tab');
  }
  await shot(page,'search');await closePage(page,context);
 }
 if(!baseline){
  for(const [name,label] of [['businesses','businesses'],['list_discovery_feed','community']]){
   const state={fail:[name]};const {page,context}=await open('/',state);
   await page.getByRole('button',{name:'Retry '+label,exact:true}).waitFor();
   await page.getByText(product.name,{exact:true}).waitFor();state.fail=[];
   await page.getByRole('button',{name:'Retry '+label,exact:true}).click();
   await page.getByRole('button',{name:'Retry '+label,exact:true}).waitFor({state:'hidden'});await closePage(page,context);
  }
  {
   const {page,context}=await open('/business-profile?id='+biz,{delays:{services:2500}});
   await page.getByText(business.name,{exact:true}).waitFor();
   assert.equal(await page.getByRole('progressbar',{name:'Loading services',exact:true}).count(),1,'Identity visible before delayed services');
   await page.getByText(product.name,{exact:true}).waitFor();await page.getByText(service.name,{exact:true}).waitFor();await closePage(page,context);
  }
  {
   const {page,context}=await open('/business-today',{delays:{crm_bookings:2500}},true);
   await page.getByText('Everest job today',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Jobs today: unavailable',exact:true}).waitFor();
   await page.getByRole('button',{name:'Jobs today: 1',exact:true}).waitFor();await closePage(page,context);
  }
  for(const [name,label] of [['bookings','weekly activity'],['crm_pipeline_stages','sales stages'],['crm_tasks','tasks'],['crm_quotes','crm quotes'],['crm_bookings','crm bookings'],['quotes','quotes'],['bookings','jobs'],['orders','orders'],['conversations','messages'],['marketplace_payout_ledger','weekly business share'],['businesses',null]]){
   const state={fail:[name]};const {page,context,calls}=await open('/business-today',state,true);
   await page.getByText('Needs attention',{exact:true}).waitFor();
   if(label){
    const retry=page.getByRole('button',{name:'Retry '+label,exact:true});await retry.waitFor();
    if(name!=='bookings')await page.getByText('Everest job today',{exact:true}).waitFor();
    if(name==='crm_tasks')assert.equal(await page.getByRole('button',{name:'Retry sales',exact:true}).count(),0,'Task failure does not break sales');
    const before=calls.filter(n=>n==='crm_opportunities').length;
    state.fail=[];await retry.click();await retry.waitFor({state:'hidden'});
    assert.equal(calls.filter(n=>n==='crm_opportunities').length,before,'Operational retry leaves healthy sales alone');
   }else{await page.getByText('Everest job today',{exact:true}).waitFor();}
   await closePage(page,context);
  }
  report.scenarios.push('Home businesses/community and Today tasks/quotes/bookings/orders/messages/weekly/setup failures isolate and retry; delayed Profile children do not block identity; delayed Today totals remain unknown until complete');
  {
   const state={};const {page,context}=await open('/search?q=garden&tab=SERVICE',state);
   await page.getByText(result.title,{exact:true}).waitFor();state.fail=['universal_search'];state.denied=true;
   await page.getByRole('button',{name:'Refresh results',exact:true}).click();
   await page.getByLabel('Sign in to search',{exact:true}).waitFor();assert.equal(await page.getByText(result.title,{exact:true}).count(),0);
   report.scenarios.push('Search permission loss removes retained results and offers account guidance');await closePage(page,context);
  }
 }
 }
 // Same exported screens and empty content at every requested width and theme.
 if(!baseline){
  const {default:AxeBuilder}=await import(process.env.AXE_MODULE||'@axe-core/playwright');
  report.accessibility=[];
  for(const [path,name,auth] of [['/','home',false],['/search?q=garden&tab=SERVICE','search',false],['/business-profile?id='+biz,'profile',false],['/business-today','today',true]]){
   const state={};const {page,context}=await open(path,state,auth);
   await page.waitForTimeout(500);
   for(const theme of ['LIGHT','DARK']){
    await page.evaluate(theme=>localStorage.setItem('everest-local-theme',theme),theme);await reload(page);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--everest-canvas')),theme==='DARK'?'#000000':'#F8FAFC','Theme actually applied');
    for(const width of [320,375,390,430,...(process.env.EVEREST_QA_TABLET==='1'?[768,1024]:[]),1280,1440]){
     await page.setViewportSize({width,height:width===320?568:844});await page.waitForTimeout(250);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${name} ${theme} ${width}: document fits`);
     await page.waitForFunction(()=>[...document.querySelectorAll('[role="button"], [role="link"], input')].every(e=>{
      if(e.closest('[inert]'))return true;
      for(let parent=e.parentElement;parent;parent=parent.parentElement){if(/auto|scroll/.test(getComputedStyle(parent).overflowX)&&parent.scrollWidth>parent.clientWidth)return true}
      const r=e.getBoundingClientRect();return !(r.width>0&&r.height>0&&r.left>=0&&r.left<innerWidth&&r.right>innerWidth+1);
     }),null,{timeout:5000});
     const clipped=await page.locator('[role="button"], [role="link"], input').evaluateAll(elements=>elements.filter(e=>{
      if(e.closest('[inert]'))return false;
      for(let parent=e.parentElement;parent;parent=parent.parentElement){if(/auto|scroll/.test(getComputedStyle(parent).overflowX)&&parent.scrollWidth>parent.clientWidth)return false}
      const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.left>=0&&r.left<innerWidth&&r.right>innerWidth+1;
     }).map(e=>e.getAttribute('aria-label')||e.textContent));
     if(clipped.length)await shot(page,`${name}-${theme}-${width}-overflow`);
     assert.deepEqual(clipped,[],`${name} ${theme} ${width}: controls fit`);
     report.layouts.push({name,theme,width,reducedMotion:true});
     if([320,390,1280].includes(width))await shot(page,`${name}-${theme.toLowerCase()}-${width}`);
    }
    await page.setViewportSize({width:390,height:844});
    const a11y=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    report.accessibility.push({name,theme,violations:a11y.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target),details:v.nodes.map(n=>({html:n.html,summary:n.failureSummary}))}))});
   }
   if(name==='home'){
    const search=page.getByRole('button',{name:'Search services, businesses and products',exact:true});
    await search.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
    assert.equal(await search.evaluate(e=>e===document.activeElement),true);
    assert.notEqual(await search.evaluate(e=>getComputedStyle(e).outlineStyle),'none','Keyboard focus is visible');
    await page.keyboard.press('Enter');await page.getByLabel('Search Everest Local',{exact:true}).waitFor();await page.goto(base+path);
   }
   if(name==='search'){
    const input=page.getByLabel('Search Everest Local',{exact:true});await input.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
    assert.notEqual(await input.evaluate(e=>getComputedStyle(e).outlineStyle),'none','Search input focus is visible');
   }
   report.emptyLayouts??=[];report.errorLayouts??=[];
   for(const theme of ['LIGHT','DARK']){
    await page.evaluate(theme=>localStorage.setItem('everest-local-theme',theme),theme);
    state.empty=true;await reload(page);await page.waitForTimeout(400);
    if(name==='home')await page.getByText('Browse products from local businesses',{exact:true}).waitFor();
    if(name==='search')await page.getByText('No Everest results',{exact:true}).waitFor();
    if(name==='profile')await page.getByText('This business hasn’t listed services yet. You can still describe what you need.',{exact:true}).waitFor();
    if(name==='today')await page.getByText('You’re all caught up',{exact:true}).waitFor();
    for(const width of [320,375,390,430,...(process.env.EVEREST_QA_TABLET==='1'?[768,1024]:[]),1280,1440]){await page.setViewportSize({width,height:844});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);report.emptyLayouts.push({name,theme,width})}
    state.empty=false;
    const [failed,label]=({home:['shop_products','Retry shop'],search:['universal_search','Try again'],profile:['services','Retry services'],today:['crm_opportunities','Retry sales']})[name];
    state.fail=[failed];await reload(page);
    const retry=page.getByRole('button',{name:label,exact:true});await retry.waitFor();
    for(const width of [320,375,390,430,...(process.env.EVEREST_QA_TABLET==='1'?[768,1024]:[]),1280,1440]){await page.setViewportSize({width,height:844});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await retry.scrollIntoViewIfNeeded();const rect=await retry.boundingBox();assert.ok(rect&&rect.height>=44&&rect.x>=0&&rect.x+rect.width<=width+1);report.errorLayouts.push({name,theme,width})}
    state.fail=[];await retry.click();await retry.waitFor({state:'hidden'});
   }
   state.empty=false;await page.emulateMedia({reducedMotion:'no-preference'});await reload(page);await page.waitForTimeout(400);
   for(const theme of ['LIGHT','DARK']){
    await page.evaluate(theme=>localStorage.setItem('everest-local-theme',theme),theme);await reload(page);await page.waitForTimeout(150);
    for(const width of [320,375,390,430,...(process.env.EVEREST_QA_TABLET==='1'?[768,1024]:[]),1280,1440]){await page.setViewportSize({width,height:844});await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);report.layouts.push({name,theme,width,reducedMotion:false})}
   }
   await closePage(page,context);
  }
 }
 await fs.writeFile(`${output}/report-${engine}.json`,JSON.stringify(report,null,2));
 assert.deepEqual(report.errors,[]);
 assert.deepEqual((report.accessibility??[]).flatMap(scan=>scan.violations),[],'No WCAG A/AA axe violations');
 console.log('PASS',JSON.stringify({engine,baseline,scenarios:report.scenarios.length,layouts:report.layouts.length,accessibilityScans:report.accessibility?.length??0,emptyLayouts:report.emptyLayouts?.length??0,errorLayouts:report.errorLayouts?.length??0,errors:report.errors}));
}finally{await fs.writeFile(`${output}/report-${engine}.json`,JSON.stringify(report,null,2));await browser.close()}
