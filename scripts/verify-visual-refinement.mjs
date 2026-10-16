/* global document, innerWidth, innerHeight, localStorage, Buffer, URL, getComputedStyle */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.EVEREST_QA_BROWSER||'chromium';const before=process.env.EVEREST_QA_BEFORE==='1';
const base=process.env.EVEREST_PREVIEW_URL||'http://localhost:8087';const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/everest-visual-refinement';
const widths=process.env.EVEREST_QA_WIDTHS?.split(',').map(Number)||[320,375,390,430,768,1440];
const screens=process.env.EVEREST_QA_SCREENS?.split(',')||['business','bookings','orders','notifications','today'];
const browser=await engines[engine].launch(engine==='webkit'?{}:{executablePath:process.env.EVEREST_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});await fs.mkdir(output,{recursive:true});
const uid='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',biz='33333333-3333-4333-8333-333333333333';
const name='North Melbourne Home & Garden Services';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const session={access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:4102444800})).toString('base64url')}.fixture`,refresh_token:'fixture-never-sent',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};
const business={id:biz,name,description:'Careful maintenance for your home and garden. Ask about the service area and available dates before booking.',logo_url:null,verification_status:'UNVERIFIED',suburb:'North Melbourne',city:'Melbourne',state:'VIC',opening_hours:null,website_url:null,stripe_connect_status:'NOT_STARTED'};
const paths={business:`/business-profile?id=${biz}`,bookings:'/bookings',orders:'/orders',notifications:'/notifications',today:'/business-today'};
const headings={business:name,bookings:'Bookings',orders:'Orders',notifications:'Notifications',today:'Today'};
const results=[];
async function fixture(screen,width=390,theme='LIGHT',state='loaded',mode='DEFAULT'){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:width<768,hasTouch:true,reducedMotion:'reduce'});
 await context.addInitScript(({theme,mode,session})=>{localStorage.setItem('everest-local-theme',theme);localStorage.setItem('everest-local-experience-v1',mode);localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify(session))},{theme,mode,session});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const requests=[];let release=()=>{};let errorState=state==='error';
 await page.routeWebSocket('**/realtime/**',ws=>ws.close());
 await page.route('**/*.supabase.co/**',async route=>{
  const request=route.request(),url=new URL(request.url()),table=url.pathname.split('/').at(-1);requests.push({table,method:request.method()});let json=[];
  const target={business:'businesses',bookings:'bookings',orders:'orders',notifications:'notifications',today:'businesses'}[screen];
  if(table===target&&state==='loading')await new Promise(resolve=>{release=resolve});
  if(table===target&&errorState)return route.fulfill({status:503,json:{message:'Controlled QA failure'}});
  if(url.pathname.includes('/auth/'))json=user;
  else if(table==='get_my_access_context')json={profile_role:screen==='today'?'BUSINESS':'CUSTOMER',is_business_member:screen==='today',is_verified_business:false,business_id:biz,business_name:name};
  else if(table==='get_my_workspace_context')json={mode:screen==='today'?'BUSINESS':'CUSTOMER',active_business_id:screen==='today'?biz:null,businesses:screen==='today'?[{...business,member_role:'OWNER',status:'ACTIVE'}]:[]};
  else if(table==='is_following')json=false;
  else if(table==='get_follow_counts')json={follower_count:7,following_count:0};
  else if(table==='businesses')json=business;
  else if(table==='services')json=[{id,name:'Garden maintenance and seasonal care',description:'Tell us about your garden and preferred date.',base_price:125,duration_minutes:60,delivery_mode:'LOCAL',service_booking_settings:{instant_booking_enabled:false}}];
  else if(table==='bookings'&&state!=='empty')json=[{id,business_id:biz,price:185,scheduled_date:'2026-10-20',scheduled_time:'10:00',status:'CONFIRMED',created_at:'2026-10-12T10:00:00Z',businesses:{name}},{id:'past',business_id:biz,price:1499.95,scheduled_date:'2026-10-01',scheduled_time:'14:30',status:'COMPLETED',created_at:'2026-10-01T10:00:00Z',businesses:{name:'Local electrical services'}}];
  else if(table==='orders'&&state!=='empty')json=[{id,order_number:'EV-1042',status:'PROCESSING',payment_status:'PAID',total:1299.95,created_at:'2026-10-12T10:00:00Z',delivery_method:'PICKUP'},{id:'pending',order_number:'EV-1041',status:'PENDING_PAYMENT',payment_status:'PENDING',total:89.50,created_at:'2026-10-11T10:00:00Z',delivery_method:'PICKUP'}];
  else if(table==='notifications'&&state!=='empty')json=[{id,title:'Your quote is ready to review',body:'North Melbourne Home & Garden Services sent a quote for your garden maintenance request.',kind:'quote_received',read_at:null,created_at:'2026-10-12T10:00:00Z',data:{}},{id:'read',title:'A new message about your booking',body:'Open your conversation to see the details.',kind:'message_received',read_at:'2026-10-12T10:30:00Z',created_at:'2026-10-12T10:00:00Z',data:{}},{id:'social',title:'Alex commented on your post',body:'Looks like a great local spot!',kind:'post_comment',read_at:null,created_at:'2026-10-11T10:00:00Z',data:{actor_name:'Alex'}}];
  else if(request.method()!=='GET'&&request.method()!=='HEAD'&&!url.pathname.includes('/rpc/'))return route.fulfill({status:403,json:{message:'Writes blocked by inert QA fixture'}});
  const singular=request.headers().accept?.includes('vnd.pgrst.object');if(Array.isArray(json)&&singular)json=null;
  await route.fulfill({status:200,json,headers:{'content-range':'0-0/0'}});
 });
 await page.goto(base+paths[screen],{waitUntil:'domcontentloaded'});
 if(state==='loading'){await page.getByRole('progressbar').first().waitFor();await page.waitForTimeout(200)}
 else if(state==='error')await page.getByText(/couldn't load|could not be loaded|could not load|Unable to load/i).first().waitFor();
 else {await page.getByText(headings[screen],{exact:true}).filter({visible:true}).first().waitFor();await page.waitForTimeout(250)}
 await page.evaluate(()=>document.fonts.ready);
 return {context,page,errors,requests,release:()=>release(),recover:()=>{errorState=false}};
}
async function capture(page,file){
 await page.evaluate(()=>{if(document.querySelector('#qa-fixture-label'))return;const e=document.createElement('div');e.id='qa-fixture-label';e.textContent='VISUAL QA FIXTURE · no real account or transactions';Object.assign(e.style,{position:'fixed',top:0,left:0,right:0,zIndex:99999,background:'#242424',color:'#fff',font:'10px system-ui',textAlign:'center',padding:'3px',pointerEvents:'none'});document.body.append(e)});
 await page.screenshot({path:`${output}/${file}.png`});
}
try{
 for(const theme of ['LIGHT','DARK'])for(const width of widths)for(const screen of screens){
  const {context,page,errors}=await fixture(screen,width,theme);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${screen} ${width} ${theme} overflow`);
  if(!before&&screen==='notifications'){
   const button=page.getByText('MARK ALL READ',{exact:true});const bounds=await button.locator('..').boundingBox();assert.ok(bounds.height>=44&&bounds.x+bounds.width<=width+1,'Read all fits with 44px target');
  }
  if([320,390,1440].includes(width))await capture(page,`${screen}-${width}-${theme.toLowerCase()}`);
  assert.deepEqual(errors,[]);results.push({screen,width,theme,...screen==='notifications'?{readAllBounds:await page.getByText('MARK ALL READ',{exact:true}).locator('..').boundingBox()}: {}});await context.close();
 }
 for(const screen of screens.filter(x=>['bookings','orders','notifications','business'].includes(x)))for(const state of ['loading','error',...screen==='business'?[]:['empty']]){
  const {context,page,errors,release,recover}=await fixture(screen,390,'LIGHT',state);
  await capture(page,`${screen}-${state}`);
  if(state==='loading'){release();await page.getByText(headings[screen],{exact:true}).filter({visible:true}).first().waitFor()}
  if(state==='error'){
   recover();const retry=page.getByText(screen==='bookings'?'Try again':screen==='orders'?'RETRY ORDERS':'RETRY',{exact:true});await retry.click();
   await page.getByText(headings[screen],{exact:true}).filter({visible:true}).first().waitFor();
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 if(!before)for(const screen of screens){
  const {context,page}=await fixture(screen,320,'LIGHT');
  await page.evaluate(()=>{
   const text=[...document.querySelectorAll('[dir="auto"]')].filter(e=>/Inter|Bricolage/.test(getComputedStyle(e).fontFamily)).map(e=>({e,size:parseFloat(getComputedStyle(e).fontSize),line:parseFloat(getComputedStyle(e).lineHeight)}));
   for(const {e,size,line} of text){e.style.fontSize=`${size*2}px`;if(Number.isFinite(line))e.style.lineHeight=`${line*2}px`}
  });
  const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
  if(!fits){await capture(page,`${screen}-web-text-overflow`);await fs.writeFile(`${output}/text-overflow.json`,JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('[dir="auto"]')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({text:e.textContent,width:e.getBoundingClientRect().width,x:e.getBoundingClientRect().x}))),null,2))}
  assert.equal(fits,true,`${screen} enlarged web text overflow`);
  if(screen==='today'){const label=page.getByRole('tab',{name:'Business',exact:true});const bounds=await label.boundingBox();assert.ok(bounds.y+bounds.height<=await page.evaluate(()=>innerHeight)+1,'Business tab remains within viewport at enlarged text')}
  await capture(page,`${screen}-web-text-200`);await context.close();
 }
 for(const mode of ['DEFAULT','PULSE','CLASSIC']){
  const {context,page}=await fixture('bookings',320,'LIGHT','loaded',mode);
  await page.getByRole('tab',{name:'Past',exact:true}).click();await page.getByText('Local electrical services',{exact:true}).waitFor();
  await page.getByRole('tab',{name:'Upcoming & active',exact:true}).click();await page.getByText(name,{exact:true}).waitFor();
  if(!before){await page.keyboard.press('Tab');const focused=await page.evaluate(()=>({width:getComputedStyle(document.activeElement).outlineWidth,style:getComputedStyle(document.activeElement).outlineStyle}));assert.notEqual(focused.style,'none');assert.ok(parseFloat(focused.width)>=2)}
  await context.close();
 }
 await fs.writeFile(`${output}/results.json`,JSON.stringify({base,engine,before,fixture:true,layouts:results,states:'loading/error/retry/empty; existing booking filters'},null,2));console.log(`${engine}: ${results.length} visual layouts and loading/error/retry/empty/filter checks passed`);
}finally{await browser.close()}
