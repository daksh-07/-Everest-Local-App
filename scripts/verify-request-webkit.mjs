// Browser regression against the exported app. API interception uses fixtures only;
// no production session, requests, notifications, or payments are created.
import {URL} from 'node:url';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import process from 'node:process';
const {webkit,devices}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.REQUEST_TEST_URL || 'http://127.0.0.1:4174';
const artifacts=process.env.REQUEST_TEST_ARTIFACTS || '/tmp/request-webkit';
await mkdir(artifacts,{recursive:true});
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}};
const categories=[{id:'auto',name:'Automotive',slug:'automotive',parent_id:null},{id:'home',name:'Home services',slug:'home',parent_id:null},{id:'digital',name:'Digital',slug:'digital',parent_id:null}];
const services=[['detail','Car Detailing','auto','LOCAL'],['ceramic','Ceramic Coating','auto','LOCAL'],['paint','Paint Correction','auto','LOCAL'],['clean','Cleaning','home','LOCAL'],['plumb','Plumbing','home','LOCAL'],['web','Web Development','digital','REMOTE'],['design','Website Design','digital','BOTH'],...Array.from({length:20},(_,i)=>['clean'+i,`Specialist Cleaning ${i}`,'home','LOCAL'])].map(([id,name,category_id,default_delivery_mode])=>({id,name,category_id,default_delivery_mode,description:null,slug:name.toLowerCase().replaceAll(' ','-')}));
const browser=await webkit.launch();
try{
 for(const width of [375,390,430,768]){
  const context=await browser.newContext({...devices['iPhone 15 Pro'],viewport:{width,height:844},colorScheme:'dark'});
  await context.addInitScript(({user})=>{
   globalThis.localStorage.setItem('everest-local-theme','DARK');
   globalThis.localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify({access_token:'fixture-token',refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));
  },{user});
  const posted=[];let taxonomyLoads=0;
  await context.route('**/*.supabase.co/**',async route=>{
   const url=new URL(route.request().url());let body=[];
   if(url.pathname.endsWith('/auth/v1/user'))body=user;
   else if(url.pathname.endsWith('/rpc/get_my_access_context'))body={profile_role:'CUSTOMER',is_business_member:false};
   else if(url.pathname.endsWith('/categories'))body=categories;
   else if(url.pathname.endsWith('/service_definitions')){body=services;taxonomyLoads++}
   else if(url.pathname.endsWith('/profiles'))body={...user,suburb:'Rooty Hill',city:'Sydney',state:'New South Wales'};
   else if(url.pathname.endsWith('/rpc/create_service_request_v3')){posted.push(route.request().postDataJSON());body='request-fixture'}
   else if(url.pathname.endsWith('/service_requests'))body=url.searchParams.get('id')?{status:'OPEN'}:null;
   await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','content-range':'0-0/0'},body:JSON.stringify(body)});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/request');
  const search=page.getByRole('textbox',{name:'Search services'});
  await search.waitFor();await page.getByRole('button',{name:'Car Detailing',exact:true}).waitFor();
  const next=page.getByRole('button',{name:'CONTINUE',exact:true});
  assert.equal(await next.isDisabled(),true);
  assert.equal(await page.getByTestId('service-results').count(),0);
  assert.equal(await page.getByRole('textbox',{name:'Suburb',exact:true}).count(),0);
  await search.fill('zzzzunknown');await page.getByText('Can’t find the exact service?',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Search another term',exact:true}).click();
  await search.fill('clean');
  assert.equal(await search.evaluate(el=>globalThis.getComputedStyle(el).outlineWidth),'0px');
  assert.equal(await search.evaluate(el=>globalThis.getComputedStyle(el).outlineStyle),'none');
  const results=page.getByTestId('service-results');await results.waitFor();
  const box=await results.boundingBox();assert.ok(box.height<=321);
  assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth>globalThis.innerWidth),false);
  await page.screenshot({path:`${artifacts}/search-${width}.png`});
  assert.ok(await results.evaluate(el=>el.scrollHeight>el.clientHeight));
  await results.evaluate(el=>el.scrollTop=150);assert.ok(await results.evaluate(el=>el.scrollTop>0));
  await search.fill('detail');await page.getByRole('button',{name:'Select Ceramic Coating',exact:true}).waitFor();
  await page.getByRole('button',{name:'Select Car Detailing',exact:true}).click();
  assert.equal(await results.count(),0);
  const details=page.getByRole('textbox',{name:'Job details',exact:true});await details.fill('Full interior and exterior detail for my sedan.');
  assert.equal(await next.isDisabled(),false);
  await page.getByRole('button',{name:'Change service',exact:true}).click();
  await page.getByRole('button',{name:'Keep Car Detailing',exact:true}).click();
  assert.equal(await details.inputValue(),'Full interior and exterior detail for my sedan.');
  await page.waitForFunction(()=>{const card=globalThis.document.querySelector('[data-testid="selected-service"]');return card&&Number(globalThis.getComputedStyle(card.parentElement).opacity)>.99});
  await page.screenshot({path:`${artifacts}/selected-${width}.png`});
  await page.setViewportSize({width,height:520});
  const actionBox=await next.boundingBox();assert.ok(actionBox.y+actionBox.height<=521);
  await page.setViewportSize({width,height:844});
  await next.click();await page.getByText('Where do you need it?',{exact:true}).waitFor();
  await page.waitForFunction(()=>{const input=globalThis.document.querySelector('[aria-label="Suburb"]');let parent=input;while(parent){if(Number(globalThis.getComputedStyle(parent).opacity)<.99)return false;parent=parent.parentElement}return Boolean(input)});
  await page.screenshot({path:`${artifacts}/location-${width}.png`});
  assert.equal(await page.getByRole('textbox',{name:'Search services'}).count(),0);
  assert.equal(await page.getByRole('textbox',{name:'Job details'}).count(),0);
  await page.getByRole('button',{name:'USE THIS LOCATION',exact:true}).click();await next.click();
  await page.getByText('When do you need it?',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Edit service type',exact:true}).click();
  await page.getByTestId('selected-service').waitFor();assert.equal(await details.inputValue(),'Full interior and exterior detail for my sedan.');
  await next.click();await next.click();await page.getByRole('button',{name:'POST REQUEST',exact:true}).click();
  await page.getByText('We’re finding the best businesses near you.',{exact:true}).waitFor();
  assert.equal(posted.length,1);assert.equal(posted[0].p_service_definition_id,'detail');assert.equal(posted[0].p_category_id,'auto');assert.equal(posted[0].p_location_confirmed,true);assert.equal(posted[0].p_delivery_mode,'LOCAL');
  assert.equal(taxonomyLoads,1);
  assert.equal(await page.evaluate(()=>globalThis.document.documentElement.scrollWidth>globalThis.innerWidth),false);
  assert.deepEqual(errors,[]);
  await page.goto(base+'/request');await page.getByRole('textbox',{name:'Search services'}).fill('website');await page.getByRole('button',{name:'Select Web Development',exact:true}).click();await details.fill('Build a small business website.');await next.click();await page.getByText('Remote request — no GPS or local address is required.',{exact:true}).waitFor();await next.click();await page.getByRole('button',{name:'POST REQUEST',exact:true}).click();await page.getByText('We’re finding the best businesses near you.',{exact:true}).waitFor();assert.equal(posted[1].p_delivery_mode,'REMOTE');assert.equal(posted[1].p_suburb,null);
  console.log(`PASS ${width}px: bounded search, selection, back/edit persistence, isolated steps, local/remote submission payloads, no page errors`);
  await context.close();
 }
}finally{await browser.close()}
