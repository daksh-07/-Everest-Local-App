/* global localStorage, document, innerWidth */
import assert from 'node:assert/strict';
import {URL} from 'node:url';
import {Buffer} from 'node:buffer';
import fs from 'node:fs/promises';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.EVEREST_QA_BROWSER||'chromium';
const {default:AxeBuilder}=await import(process.env.AXE_MODULE||'@axe-core/playwright');
const base=process.env.EVEREST_PREVIEW_URL||'http://localhost:8090';
const baseline=process.env.EVEREST_BASELINE==='1';
const out=process.env.EVEREST_QA_ARTIFACTS||'docs/ux/evidence';
await fs.mkdir(out,{recursive:true});
const browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{}:{executablePath:process.env.EVEREST_BROWSER_PATH,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote']});
const report={baseline,engine,accessibility:[],browser:await browser.version(),scenarios:[],errors:[],layouts:[]};
try{
 for(const theme of ['LIGHT','DARK'])for(const mode of ['DEFAULT','PULSE','CLASSIC'])for(const {width,height} of [{width:320,height:844},{width:390,height:844},{width:320,height:568},{width:1280,height:800}]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  await context.addInitScript(({theme,mode})=>{localStorage.setItem('everest-local-theme',theme);localStorage.setItem('everest-local-experience-v1',mode)},{theme,mode});
  const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.routeWebSocket('**/realtime/**',ws=>ws.close());
  let geocodes=0,profileWrites=0,releaseLookup;let authenticated=false;
  const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{}};
  const session={access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,exp:4102444800})).toString('base64url')}.fixture`,refresh_token:'fixture',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};let failLookup=false;const queries=[];
  await page.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===new URL(base).origin)return route.continue();
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':request.headers()['access-control-request-headers']||'*','access-control-allow-methods':'GET,POST,OPTIONS'};
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
   if(url.hostname==='nominatim.openstreetmap.org'){
    geocodes++;queries.push(url.searchParams.get('q'));
    if(releaseLookup)await releaseLookup;
    return route.fulfill({headers,json:failLookup?[]:[{lat:'43.65',lon:'-79.38',address:{city:'Toronto',country:'Canada',state:'Ontario'}}]});
   }
   if(url.hostname.endsWith('.supabase.co')){
    if(url.pathname.includes('save_my_locality'))profileWrites++;
    const name=url.pathname.split('/').pop();
    let json=[];
    if(name==='get_my_access_context')json={profile_role:'CUSTOMER',is_business_member:false,is_authorized_admin:false};
    if(name==='get_my_workspace_context')json={mode:'CUSTOMER',active_business_id:null,businesses:[]};
    if(url.pathname.includes('/auth/'))json=authenticated?user:{user:null};
    if(url.pathname.includes('/auth/v1/token')){authenticated=true;json=session;}
    return route.fulfill({headers,json});
   }
   return route.abort(); // No real geocoding, analytics, data writes or external reads.
  });
  await page.goto(base);await page.getByRole('button',{name:'Set your location',exact:true}).click();
  const suffix=`${theme.toLowerCase()}-${mode.toLowerCase()}-${width}${height===844?'':'-'+height}`;
  if(!baseline){
   const use=page.getByRole('button',{name:'Use this location',exact:true});
   await use.click();await page.getByRole('alert').filter({hasText:'Enter a city or locality.'}).waitFor();
   assert.equal(await page.getByRole('textbox',{name:'City or locality',exact:true}).evaluate(el=>el===document.activeElement),true);
   await page.getByRole('textbox',{name:'City or locality',exact:true}).fill('Toronto');await use.click();
   await page.getByRole('alert').filter({hasText:'Enter a country.'}).waitFor();
   assert.equal(await page.getByRole('textbox',{name:'Country',exact:true}).evaluate(el=>el===document.activeElement),true);
   assert.equal(geocodes,0);
   await page.getByRole('textbox',{name:'Country',exact:true}).fill('Canada');
   let release;releaseLookup=new Promise(resolve=>{release=resolve});failLookup=true;
   await use.click();await page.getByRole('button',{name:'Finding location…',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Use current location',exact:true}).isEnabled(),false);
   assert.equal(await page.getByRole('textbox',{name:'Country',exact:true}).getAttribute('readonly'),'');
   await page.screenshot({path:`${out}/location-pending-${suffix}.png`});
   const pendingAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
   report.accessibility.push({screen:'location-pending',suffix,violations:pendingAxe.violations});
   release();releaseLookup=null;
   await page.getByRole('alert').filter({hasText:'We could not find that place.'}).waitFor();
   assert.equal(await page.getByRole('textbox',{name:'Country',exact:true}).getAttribute('value'),'Canada');
   await page.screenshot({path:`${out}/location-retry-${suffix}.png`});
   report.layouts.push({screen:'location',theme,mode,width,height,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
   const locationAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
   report.accessibility.push({screen:'location',suffix,violations:locationAxe.violations});
   failLookup=false;await page.getByRole('textbox',{name:'Country',exact:true}).press('Enter');
   await page.getByRole('button',{name:/Location: Toronto/}).waitFor();
   assert.equal(profileWrites,0);assert.equal(queries.every(q=>q.includes('Canada')&&!q.includes('Australia')),true);
   report.scenarios.push(`${suffix}: missing inputs focus, no ambiguous fetch, pending, retained error, keyboard retry, global country, guest no write`);
  }else await page.screenshot({path:`${out}/location-before-${suffix}.png`});
  await page.goto(base+'/search?q=Car&tab=SERVICE');await page.getByText('No Everest results',{exact:true}).waitFor();
  await page.screenshot({path:`${out}/search-${baseline?'before':'after'}-${suffix}.png`});
  if(!baseline){
   report.layouts.push({screen:'search',theme,mode,width,height,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
   const searchAxe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
   report.accessibility.push({screen:'search',suffix,violations:searchAxe.violations});
   await page.getByRole('button',{name:'Browse service categories',exact:true}).click();
   await page.getByText('Find a local service',{exact:true}).waitFor();
   await page.getByRole('textbox',{name:'Search Everest Local'}).fill('Detailing');
   await page.getByText('No Everest results',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Request quotes from search',exact:true}).click();
   await page.waitForURL(/\/auth$/);
   assert.equal(await page.evaluate(()=>localStorage.getItem('everest-auth-return-to')),'/request');
   await page.getByPlaceholder('Email address',{exact:true}).fill('fixture@example.invalid');
   await page.getByPlaceholder('Password',{exact:true}).fill('FixtureOnly123!');
   await page.getByRole('button',{name:'Sign in',exact:true}).click();
   await page.waitForURL(/\/request$/);
   assert.equal(await page.evaluate(()=>localStorage.getItem('everest-auth-return-to')),null);
   report.scenarios.push(`${suffix}: empty-search category recovery and guest sign-in returns to request and consumes intent`);
  }
  report.layouts.push({theme,mode,width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
  await context.close();
 }
 assert.deepEqual(report.accessibility.flatMap(scan=>scan.violations),[]);
 assert.deepEqual(report.errors,[]);assert.equal(report.layouts.some(x=>x.overflow),false);
}finally{await fs.writeFile(`${out}/${baseline?'before':'after'}-report.json`,JSON.stringify(report,null,2));await browser.close()}
console.log(JSON.stringify(report));
