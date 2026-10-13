/* global localStorage,document,innerWidth,getComputedStyle,Buffer,URL */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.EVEREST_QA_BROWSER||'chromium';const base=process.env.EVEREST_PREVIEW_URL||'http://localhost:8083';const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/everest-typography-qa';const before=process.env.EVEREST_TYPOGRAPHY_BEFORE==='1';
const browser=await engines[engine].launch(engine==='chromium'?{executablePath:process.env.EVEREST_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']}:{});
await fs.mkdir(output,{recursive:true});
const widths=process.env.EVEREST_QA_WIDTHS?.split(',').map(Number)??(before?[320,390]:[320,360,375,390,430,768,1440]);
const screens=process.env.EVEREST_QA_SCREENS?.split(',')??['home','search','business','product','chat','today'];
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',biz='33333333-3333-4333-8333-333333333333';
const name='North Melbourne Home & Garden Services';
const user={id,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const business={id:biz,name,description:'Careful maintenance for your home and garden. Ask about the service area and available dates before booking.',logo_url:null,cover_url:null,verification_status:'UNVERIFIED',suburb:'North Melbourne',city:'Melbourne',state:'VIC',opening_hours:null,website_url:null};
const session={access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,exp:4102444800})).toString('base64url')}.fixture`,refresh_token:'fixture-never-sent',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};
const conversation={id:other,other_user_id:other,display_name:'Alex · QA fixture',avatar_url:null,status:'ACTIVE',initiated_by:id,updated_at:'2026-10-12T12:00:00Z',latest_message:'Could we arrange collection after 5 pm?',latest_message_at:'2026-10-12T12:00:00Z',unread_count:0};
const thread=[{id:'message-one',conversation_id:other,sender_id:other,body:'Hi! Could we arrange collection after 5 pm? I would also like to confirm the dimensions before coming over.',read_at:'2026-10-12T12:01:00Z',created_at:'2026-10-12T12:00:00Z',reactions:[]},{id:'message-two',conversation_id:other,sender_id:id,body:'Thanks. I’ll check the details and message you before you travel.',read_at:null,created_at:'2026-10-12T12:02:00Z',reactions:[]}];
const results=[];
for(const theme of before?['LIGHT']:['LIGHT','DARK'])for(const width of widths)for(const screen of screens){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:width<768,hasTouch:true});
 await context.addInitScript(({theme,session,auth})=>{localStorage.setItem('everest-local-theme',theme);if(auth)localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify(session));},{theme,session,auth:['chat','today'].includes(screen)});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(!['home','search'].includes(screen)){
  await page.routeWebSocket('**/realtime/**',ws=>ws.close());
  await page.route('**/*.supabase.co/**',async route=>{
   const request=route.request();const url=new URL(request.url());const table=url.pathname.split('/').at(-1);let json=[];
   if(url.pathname.includes('/auth/'))json=user;
   else if(table==='get_my_access_context')json={profile_role:'BUSINESS',is_business_member:true,is_verified_business:false,business_id:biz,business_name:name};
   else if(table==='get_my_workspace_context')json={mode:'BUSINESS',active_business_id:biz,businesses:[{...business,member_role:'OWNER',status:'ACTIVE'}]};
   else if(table==='list_personal_conversations_v2')json=request.postDataJSON()?.p_requests?[]:[conversation];
   else if(table==='list_personal_messages_v2')json=thread;
   else if(table==='get_business_follow_counts')json={follower_count:0,following_count:0};
   else if(table==='businesses')json=screen==='today'?{...business,stripe_connect_status:'NOT_STARTED'}:business;
   else if(table==='products'&&url.searchParams.has('id'))json={id:other,business_id:biz,name:'Hand-finished oak side table with a natural matte finish',short_description:'Solid timber. Collect from the seller after confirmation.',description:'A compact table for everyday use.',price:1299.95,sale_price:null,status:'ACTIVE',condition:'NEW',key_features:[],tags:[],attributes:{},fulfillment:{},track_stock:true,made_to_order:false,delivery_eligible:false,pickup_available:true,shipping_available:false,product_images:[],product_variants:[],inventory:{stock_quantity:3,reserved_quantity:0},businesses:business};
   else if(table==='services')json=[{id:other,name:'Garden maintenance and seasonal care',description:'Tell us about your garden and preferred date.',base_price:null,duration_minutes:60,delivery_mode:'LOCAL',service_booking_settings:{instant_booking_enabled:false}}];
   else if(request.method()!=='GET'&&request.method()!=='HEAD'&&!url.pathname.includes('/rpc/'))return route.fulfill({status:403,json:{message:'Writes blocked by QA fixture'}});
   const singular=request.headers().accept?.includes('vnd.pgrst.object');if(Array.isArray(json)&&singular)json=null;
   await route.fulfill({status:200,json,headers:{'content-range':'0-0/0'}});
  });
 }
 const paths={home:'/',search:'/search',business:`/business-profile?id=${biz}`,product:`/product?id=${other}`,chat:`/messages?personalId=${other}`,today:'/business-today'};
 await page.goto(base+paths[screen],{waitUntil:'domcontentloaded'});
 const target={home:'What do you need today?',search:'Find a local service',business:name,product:'Hand-finished oak side table with a natural matte finish',chat:'Thanks. I’ll check the details and message you before you travel.',today:'Today'}[screen];
 try { await page.getByText(target,{exact:true}).filter({visible:true}).first().waitFor({timeout:15000}); } catch(error) {
  await page.screenshot({path:`${output}/failure-${screen}-${width}-${theme}.png`});
  await fs.writeFile(`${output}/failure.json`,JSON.stringify({screen,width,theme,url:page.url(),errors,text:await page.locator('body').innerText()},null,2));throw error;
 }
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
 assert.equal(errors.length,0,errors.join('\n'));
 const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(geometry.scroll<=width+1,`${screen} overflow at ${width}`);
 if(!before){
  // Today also exists in the tab bar. Wait for the actual heading/message
  // and its loaded face, including fonts requested by late data commits.
  const group=['home','search','business','product','today'].includes(screen)?'BricolageGrotesque':'Inter-';
  const family=await (await page.waitForFunction(({target,group})=>{
   for(const element of document.querySelectorAll('[dir="auto"]')){
    if(element.textContent?.trim()!==target||!element.getClientRects().length||element.closest('[inert]'))continue;
    const family=getComputedStyle(element).fontFamily;
    const face=family.split(',')[0].replace(/["']/g,'').trim();
    if(family.includes(group)&&[...document.fonts].some(f=>f.family.replace(/["']/g,'')===face&&f.status==='loaded'))return family;
   }
   return false;
  },{target,group},{timeout:15000})).jsonValue();
  assert.ok(family.includes(group),`${screen}: actual heading/message uses its loaded face`);
  if(screen==='chat'){
   const composer=page.locator('#everest-message-composer');await composer.fill('Checking the new font on a narrow phone');
   const style=await composer.evaluate(e=>({font:getComputedStyle(e).fontFamily,size:parseFloat(getComputedStyle(e).fontSize)}));assert.ok(style.font.includes('Inter-')&&style.size>=16);
  }
 }
 if(!['home','search'].includes(screen))await page.evaluate(()=>{const label=document.createElement('div');label.textContent='VISUAL QA FIXTURE · no real account or transactions';Object.assign(label.style,{position:'fixed',top:'0',left:'0',right:'0',zIndex:'99999',background:'#242424',color:'#fff',font:'10px system-ui',textAlign:'center',padding:'3px',pointerEvents:'none'});document.body.append(label)});
 if([320,390,1440].includes(width))await page.screenshot({path:`${output}/${screen}-${width}-${theme.toLowerCase()}.png`});
 results.push({screen,width,theme,fixture:!['home','search'].includes(screen)});
 await context.close();
}
if(!before){
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage();
 await page.route('**/fonts/*.woff2',route=>route.abort('failed'));
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.getByLabel('Open Everest menu',{exact:true}).waitFor();
 await page.getByText('What do you need today?',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/^Find .* services$/}).count(),8,'Discovery stays usable when fonts fail');
 await page.screenshot({path:`${output}/font-fallback-390.png`});
 await context.close();
}
await fs.writeFile(`${output}/results.json`,JSON.stringify({engine,base,before,checks:results},null,2));console.log(`${engine}: ${results.length} typography layouts passed`);await browser.close();
