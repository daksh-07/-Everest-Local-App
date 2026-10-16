/* global localStorage, Buffer, document, innerWidth, URL */
// Reproducible before/after screenshots for docs/design/visual-regression-report.md.
// Every Supabase request is answered by an inert fixture: reads return fixed rows, writes are refused.
// Usage: serve a web export (e.g. `npx serve -s dist -l 4173`), then
//   EVEREST_PREVIEW_URL=http://localhost:4173 EVEREST_QA_ARTIFACTS=docs/design/evidence/after node scripts/capture-design-evidence.mjs
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.EVEREST_PREVIEW_URL||'http://localhost:4173';
const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/everest-design-evidence';
const viewports=(process.env.EVEREST_QA_VIEWPORTS||'320x568,390x844,412x915,1280x800').split(',').map(v=>{const [w,h]=v.split('x').map(Number);return {w,h}});
const themes=(process.env.EVEREST_QA_THEMES||'LIGHT,DARK').split(',');
const uid='11111111-1111-4111-8111-111111111111',biz='33333333-3333-4333-8333-333333333333';
const user={id:uid,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const session={access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:4102444800})).toString('base64url')}.fixture`,refresh_token:'fixture-never-sent',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};
const businesses=[
 {id:biz,name:'North Melbourne Home & Garden',logo_url:null,verification_status:'VERIFIED',suburb:'North Melbourne',city:'Melbourne',state:'VIC',status:'ACTIVE',description:'Garden maintenance and seasonal care.'},
 {id:'44444444-4444-4444-8444-444444444444',name:'Brightline Electrical',logo_url:null,verification_status:'UNVERIFIED',suburb:'Carlton',city:'Melbourne',state:'VIC',status:'ACTIVE',description:'Residential electrical work.'},
 {id:'55555555-5555-4555-8555-555555555555',name:'Fitzroy Mobile Detailing',logo_url:null,verification_status:'VERIFIED',suburb:'Fitzroy',city:'Melbourne',state:'VIC',status:'ACTIVE',description:'Car detailing at your home.'},
];
const products=[
 {id:'66666666-6666-4666-8666-666666666666',name:'Native seedling tray (12)',price:34,sale_price:null,business_name:'North Melbourne Home & Garden',business_id:biz,suburb:'North Melbourne',city:'Melbourne',state:'VIC',primary_image_path:null,stock_quantity:8,status:'ACTIVE'},
 {id:'77777777-7777-4777-8777-777777777777',name:'Ceramic-safe wash kit',price:59.95,sale_price:49.95,business_name:'Fitzroy Mobile Detailing',business_id:businesses[2].id,suburb:'Fitzroy',city:'Melbourne',state:'VIC',primary_image_path:null,stock_quantity:3,status:'ACTIVE'},
];
const other='88888888-8888-4888-8888-888888888888';
// Fixture 'now' is 16 Oct 2026 19:00 in Melbourne; the page clock is pinned to it so relative dates are reproducible.
const FIXTURE_NOW=Date.UTC(2026,9,16,8,0);const todayIso='2026-10-16';
const minutesAgo=m=>new Date(FIXTURE_NOW-m*60000).toISOString();
const personalConversations=[
 {id:'c1',other_user_id:other,display_name:'Priya Shah',avatar_url:null,status:'ACTIVE',initiated_by:other,updated_at:minutesAgo(4),latest_message:'Perfect, see you Tuesday at 10.',latest_message_at:minutesAgo(4),unread_count:2},
 {id:'c2',other_user_id:'99999999-9999-4999-8999-999999999999',display_name:'Marcus Lee',avatar_url:null,status:'ACTIVE',initiated_by:uid,updated_at:minutesAgo(190),latest_message:'Thanks for the recommendation!',latest_message_at:minutesAgo(190),unread_count:0},
 {id:'c3',other_user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',display_name:'Hannah Ortiz',avatar_url:null,status:'ACTIVE',initiated_by:uid,updated_at:minutesAgo(2900),latest_message:'Photo',latest_message_at:minutesAgo(2900),unread_count:0},
];
const msg=(id,sender,body,m,extra={})=>({id,conversation_id:'c1',sender_id:sender,body,read_at:sender===uid?minutesAgo(m-1):null,created_at:minutesAgo(m),deleted_for_everyone:false,edited_at:null,reply_to_message_id:null,reply_sender_id:null,reply_preview:null,reactions:[],...extra});
const personalMessages=[
 msg('m1',other,'Hi Sam — I saw your post about the hedge. Happy to quote if you still need someone.',1500),
 msg('m2',uid,'Yes please! Front and back, plus green-waste removal.',1490),
 msg('m3',other,'No problem. Does Tuesday morning work?',40,{reactions:[{reaction:'👍',count:1,mine:true}]}),
 msg('m4',uid,'Tuesday at 10 is great.',12,{reply_to_message_id:'m3',reply_sender_id:other,reply_preview:'No problem. Does Tuesday morning work?'}),
 msg('m5',other,'Perfect, see you Tuesday at 10.',4),
].reverse();
const feedPost=(id,author,business,caption,type,m,extra={})=>({id,author_id:author,business_id:business,caption,post_type:type,visibility:'PUBLIC',service_id:null,product_id:null,location_label:'North Melbourne',status:'PUBLISHED',comments_enabled:true,created_at:minutesAgo(m),updated_at:minutesAgo(m),content_format:'POST',...extra});
const feedPosts=[
 feedPost('p1',uid,biz,'Spring hedge season is here. Book before the end of October and we’ll take the green waste for free.','OFFER',45),
 feedPost('p2',other,null,'Huge thanks to North Melbourne Home & Garden — the back yard looks brand new.','RECOMMENDATION',300),
 feedPost('p3',uid,businesses[2].id,'Before and after: full ceramic-safe hand wash in Fitzroy this morning.','BEFORE_AFTER',1600),
];
const rpcFixtures={
 get_booking_service_location:()=>[{request_id:'r2',address_line1:'14 Errol Street',suburb:'North Melbourne',city:'Melbourne',state:'VIC',postal_code:'3051',country:'AU',service_address_label:'14 Errol Street, North Melbourne VIC 3051',latitude:-37.8027,longitude:144.9497}],
 list_discovery_feed:()=>feedPosts,
 list_personal_conversations_v2:body=>body?.p_requests?[]:personalConversations,
 list_personal_messages_v2:()=>personalMessages,
 get_public_user_profile:()=>({id:other,full_name:'Priya Shah',avatar_url:null,suburb:'Brunswick',city:'Melbourne'}),
 get_everest_live_state:()=>[{request_id:'r1',live_status:process.env.EVEREST_QA_LIVE_STATUS||'NOTIFYING',radius_km:3,radius_stage:1,expires_at:minutesAgo(-20),eligible_count:4,notified_count:2,viewed_count:1,responding_count:0,quote_count:2}],
 get_or_create_cart:()=>'cart1',
 get_everest_live_map_points:()=>[{point_kind:'CUSTOMER',business_id:null,latitude:-37.799,longitude:144.946,activity:'YOU',distance_km:null,eta_seconds:null,address_label:'North Melbourne VIC'},{point_kind:'BUSINESS',business_id:biz,latitude:-37.803,longitude:144.951,activity:'VIEWED',distance_km:0.7,eta_seconds:null,address_label:null},{point_kind:'BUSINESS',business_id:'44444444-4444-4444-8444-444444444444',latitude:-37.79,longitude:144.96,activity:'NOTIFIED',distance_km:1.6,eta_seconds:null,address_label:null}],
};
const screens={
 home:{path:'/',signedIn:true},
 'home-guest':{path:'/',signedIn:false},
 search:{path:'/search',signedIn:true},
 shop:{path:'/shop',signedIn:true},
 activity:{path:'/activity',signedIn:true},
 account:{path:'/account',signedIn:true},
 'business-today':{path:'/business-today',signedIn:true,business:true},
 messages:{path:'/messages',signedIn:true},
 chat:{path:'/messages?personalId=c1',signedIn:true},
 requests:{path:'/requests',signedIn:true},
 quotes:{path:'/quotes',signedIn:true},
 bookings:{path:'/bookings',signedIn:true},
 orders:{path:'/orders',signedIn:true},
 cart:{path:'/cart',signedIn:true},
 product:{path:'/product?id='+products[1].id,signedIn:true},
 'business-profile':{path:'/business-profile?id='+biz,signedIn:true},
 request:{path:'/request',signedIn:true},
 'everest-live':{path:'/everest-live?requestId=r1',signedIn:true},
 auth:{path:'/auth',signedIn:false},
 social:{path:'/social',signedIn:true},
 'business-jobs':{path:'/business-jobs',signedIn:true,business:true},
 'business-calendar':{path:'/business-calendar',signedIn:true,business:true},
 'business-inbox':{path:'/business-inbox',signedIn:true,business:true},
 'business-crm':{path:'/business-crm',signedIn:true,business:true},
 'business-job':{path:'/business-job?id=b2',signedIn:true,business:true},
 'business-job-new':{path:'/business-job?id=b3',signedIn:true,business:true},
 saved:{path:'/saved',signedIn:true},
 'service-areas':{path:'/service-areas',signedIn:true,business:true},
 'business-verification':{path:'/business-verification',signedIn:true,business:true},
 'driver-onboarding':{path:'/driver-onboarding',signedIn:true},
 'business-onboarding':{path:'/business',signedIn:true},
 'delete-account':{path:'/delete-account',signedIn:true},
};
const selected=(process.env.EVEREST_QA_SCREENS||Object.keys(screens).join(',')).split(',');
// Minimal PostgREST filter support (eq, neq, in, gt, gte, lt, lte, is) so counts and tabs match the query.
function applyFilters(list,params){
 const skip=new Set(['select','order','limit','offset','or','and']);
 return list.filter(row=>{for(const [col,raw] of params){if(skip.has(col)||col.includes('.'))continue;
  const negate=raw.startsWith('not.');const expr=negate?raw.slice(4):raw;const dot=expr.indexOf('.');if(dot<0)continue;
  const op=expr.slice(0,dot),val=expr.slice(dot+1),cell=row[col];if(!(col in row))continue;
  const v=cell==null?null:String(cell);let ok=true;
  if(op==='eq')ok=v===val;else if(op==='neq')ok=v!==val;else if(op==='in')ok=val.replace(/^\(|\)$/g,'').split(',').map(x=>x.replace(/^"|"$/g,'')).includes(v);
  else if(op==='gt')ok=v!=null&&v>val;else if(op==='gte')ok=v!=null&&v>=val;else if(op==='lt')ok=v!=null&&v<val;else if(op==='lte')ok=v!=null&&v<=val;
  else if(op==='is')ok=val==='null'?v==null:String(cell)===val;else continue;
  if(negate?ok:!ok)return false}return true});
}
function rows(table,isBusiness){
 switch(table){
  case 'businesses':return businesses;
  case 'profiles':return [{id:uid,full_name:'Sam Taylor',avatar_url:null,suburb:'North Melbourne',city:'Melbourne',state:'VIC',country:'AU',role:isBusiness?'BUSINESS':'CUSTOMER'}];
  case 'bookings':return isBusiness?[
   {id:'b2',request_id:'r2',status:'IN_PROGRESS',scheduled_date:todayIso,scheduled_time:'09:30:00',created_at:'2026-10-12T10:00:00Z',price:240,business_id:biz},
   {id:'b3',request_id:'r3',status:'CONFIRMED',scheduled_date:todayIso,scheduled_time:'14:00:00',created_at:'2026-10-12T10:00:00Z',price:185,business_id:biz},
   {id:'b4',request_id:null,status:'CONFIRMED',scheduled_date:todayIso,scheduled_time:null,created_at:'2026-10-12T10:00:00Z',price:null,business_id:biz},
  ]:[{id:'b1',status:'CONFIRMED',scheduled_date:'2026-10-20',scheduled_time:'10:00:00',created_at:'2026-10-12T10:00:00Z',price:185,business_id:biz,businesses:{name:businesses[0].name}}];
  case 'service_requests':return [{id:'r1',status:'QUOTING',is_live:true,live_status:'NOTIFYING',live_radius_km:3,customer_id:uid,description:'Hedge trimming and green-waste removal, front and back yard',suburb:'North Melbourne',city:'Melbourne',state:'VIC',budget:250,preferred_date:'2026-10-21',created_at:'2026-10-14T10:00:00Z'}];
  case 'quotes':return [{id:'q1',request_id:'r1',business_id:biz,customer_id:uid,status:'SENT',description:'Trim front and back hedges, remove all green waste.',price:240,deposit:24,total:240,proposed_date:'2026-10-21',proposed_time:'10:00:00',valid_until:'2026-10-28T00:00:00Z',created_at:'2026-10-15T09:00:00Z',businesses:{id:biz,name:businesses[0].name,logo_url:null,verification_status:'VERIFIED'}},{id:'q2',request_id:'r1',business_id:businesses[1].id,customer_id:uid,status:'SENT',description:'Hedge trim and tidy. Green waste extra.',price:195,deposit:20,total:195,proposed_date:'2026-10-23',proposed_time:'14:00:00',valid_until:'2026-10-25T00:00:00Z',created_at:'2026-10-15T11:00:00Z',businesses:{id:businesses[1].id,name:businesses[1].name,logo_url:null,verification_status:'UNVERIFIED'}}];
  case 'services':return [{id:'s1',business_id:biz,name:'Garden maintenance',description:'Mowing, edging, hedges and seasonal tidy-ups.',base_price:85,duration_minutes:60,status:'ACTIVE',delivery_mode:'LOCAL',service_booking_settings:{instant_booking_enabled:false}}];
  case 'products':return products.map(p=>({...p,short_description:'Rinse-free wash and two plush microfibre towels.',description:'Everything needed for a ceramic-safe hand wash at home. Biodegradable, pH-neutral formula.',condition:'NEW',brand:'Fitzroy Detailing',key_features:['pH-neutral formula','Two 40 × 40 cm microfibre towels','Makes up to 20 washes'],tags:['car care'],attributes:{},fulfillment:'PICKUP_OR_DELIVERY',track_stock:true,made_to_order:false,delivery_eligible:true,pickup_available:true,shipping_available:false,shipping_fee:null,dispatch_days:1,listing_quality:null,businesses:{id:p.business_id,name:p.business_name,logo_url:null,verification_status:'VERIFIED',suburb:p.suburb,city:p.city,state:p.state},inventory:{stock_quantity:p.stock_quantity,reserved_quantity:0,low_stock_threshold:2},product_images:[],product_variants:[{id:'v1',product_id:p.id,title:'Standard',option_values:{size:'Standard'},price:null,sku:'WK-1',image_id:null,stock_quantity:3,reserved_quantity:0,low_stock_threshold:1,available:true,sort_order:0},{id:'v2',product_id:p.id,title:'Large',option_values:{size:'Large'},price:69.95,sku:'WK-2',image_id:null,stock_quantity:0,reserved_quantity:0,low_stock_threshold:1,available:false,sort_order:1}]}));
  case 'cart_items':return [{id:'ci1',quantity:1,product_id:products[1].id,variant_id:'v1',products:{id:products[1].id,name:products[1].name,price:59.95,sale_price:49.95,status:'ACTIVE',business_id:products[1].business_id,delivery_eligible:true,pickup_available:true,shipping_available:false},product_variants:{id:'v1',title:'Standard',price:null,available:true}},{id:'ci2',quantity:2,product_id:products[0].id,variant_id:null,products:{id:products[0].id,name:products[0].name,price:34,sale_price:null,status:'ACTIVE',business_id:biz,delivery_eligible:false,pickup_available:true,shipping_available:false},product_variants:null}];
  case 'orders':return [{id:'o1',order_number:'EV-1042',status:'PREPARING',payment_status:'PAID',total:133.95,created_at:'2026-10-12T10:00:00Z',delivery_method:'PICKUP',business_id:biz,businesses:{name:businesses[0].name}},{id:'o2',order_number:'EV-1031',status:'COMPLETED',payment_status:'PAID',total:49.95,created_at:'2026-09-28T10:00:00Z',delivery_method:'DELIVERY',business_id:businesses[2].id,businesses:{name:businesses[2].name}}];
  case 'public_profiles':return [{id:uid,display_name:'Sam Taylor',avatar_url:null},{id:other,display_name:'Priya Shah',avatar_url:null}];
  case 'post_reactions':return [{post_id:'p1',user_id:other},{post_id:'p1',user_id:uid},{post_id:'p2',user_id:uid}];
  case 'post_comments':return [{post_id:'p1'},{post_id:'p1'},{post_id:'p3'}];
  case 'verified_work_posts':return [{post_id:'p3'}];
  case 'booking_job_records':return isBusiness?[{booking_id:'b2',business_id:biz,customer_id:other,arrival_status:'ARRIVED',arrival_eta:null,completion_summary:'',started_at:minutesAgo(40),completed_at:null,updated_at:minutesAgo(12)}]:[];
  case 'booking_job_checklist_items':return isBusiness?[{id:'k1',booking_id:'b2',business_id:biz,label:'Trim front hedge to 1.2 m',is_complete:true,position:1,completed_at:minutesAgo(20)},{id:'k2',booking_id:'b2',business_id:biz,label:'Trim back hedge and shape corners',is_complete:true,position:2,completed_at:minutesAgo(8)},{id:'k3',booking_id:'b2',business_id:biz,label:'Remove all green waste',is_complete:false,position:3,completed_at:null}]:[];
  case 'conversations':return isBusiness?[
   {id:'bc1',request_id:'r2',booking_id:'b2',quote_id:null,created_at:minutesAgo(600),messages:[{id:'bm1',body:'Gate code is 4471 — the side gate sticks a little.',created_at:minutesAgo(12),read_at:null,sender_id:other},{id:'bm2',body:'Running about ten minutes late?',created_at:minutesAgo(9),read_at:null,sender_id:other}]},
   {id:'bc2',request_id:'r3',booking_id:null,quote_id:'q1',created_at:minutesAgo(2000),messages:[{id:'bm3',body:'Thanks — I’ll confirm the quote tonight.',created_at:minutesAgo(1500),read_at:minutesAgo(1400),sender_id:other}]},
   {id:'bc3',request_id:'r4',booking_id:null,quote_id:null,created_at:minutesAgo(5000),messages:[]},
  ]:[];
  case 'notifications':return [];
  default:return [];
 }
}
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({args:['--no-sandbox']});
const report=[];
for(const key of selected){const screen=screens[key];if(!screen)continue;
 for(const theme of themes)for(const {w,h} of viewports){
  const context=await browser.newContext({viewport:{width:w,height:h},isMobile:w<768,hasTouch:w<768,reducedMotion:'reduce',deviceScaleFactor:w<768?2:1,timezoneId:'Australia/Melbourne',locale:'en-AU'});
  await context.addInitScript(({theme,session,signedIn})=>{localStorage.setItem('everest-local-theme',theme);if(signedIn)localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify(session))},{theme,session,signedIn:screen.signedIn});
  const page=await context.newPage();await page.clock.setFixedTime(FIXTURE_NOW);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/runtime error|TypeError|ReferenceError/.test(m.text()))errors.push(m.text().slice(0,400))});
  await page.routeWebSocket('**/realtime/**',ws=>ws.close());
  await page.route(/open-meteo|nominatim|bigdatacloud/,route=>route.fulfill({status:503,json:{}}));
  await page.route('**/*.supabase.co/**',async route=>{
   const request=route.request(),url=new URL(request.url()),table=url.pathname.split('/').at(-1);
   if(url.pathname.includes('/auth/'))return route.fulfill({status:screen.signedIn?200:401,json:screen.signedIn?user:{message:'no session'}});
   if(url.pathname.includes('/storage/'))return route.fulfill({status:200,json:[]});
   if(url.pathname.includes('/rpc/')){
    if(table==='get_my_access_context')return route.fulfill({json:{profile_role:screen.business?'BUSINESS':'CUSTOMER',is_business_member:!!screen.business,is_verified_business:!!screen.business,business_id:screen.business?biz:null,business_name:screen.business?businesses[0].name:null}});
    if(table==='get_my_workspace_context')return route.fulfill({json:{mode:screen.business?'BUSINESS':'CUSTOMER',active_business_id:screen.business?biz:null,businesses:screen.business?[{...businesses[0],member_role:'OWNER',status:'ACTIVE',can_view_all_jobs:true,can_assign_jobs:true,can_view_team:true,can_manage_team:true,can_view_crm:true,can_view_finance:true}]:[]}});
    if(rpcFixtures[table]){let body=null;try{body=request.postDataJSON()}catch{body=null}return route.fulfill({json:rpcFixtures[table](body)})}
    if(table.includes('shop')||table.includes('product'))return route.fulfill({json:products});
    return route.fulfill({json:[]});
   }
   if(request.method()!=='GET'&&request.method()!=='HEAD')return route.fulfill({status:403,json:{message:'Writes blocked by inert QA fixture'}});
   let json=applyFilters(rows(table,screen.business),url.searchParams);
   if(request.headers().accept?.includes('vnd.pgrst.object'))json=json[0]??null;
   return route.fulfill({status:200,json,headers:{'access-control-expose-headers':'content-range','content-range':`0-${Math.max(0,(Array.isArray(json)?json.length:1)-1)}/${Array.isArray(json)?json.length:1}`}});
  });
  await page.goto(base+screen.path,{waitUntil:'networkidle'}).catch(()=>undefined);
  await page.waitForTimeout(1200);
  const file=`${output}/${key}-${theme.toLowerCase()}-${w}x${h}.png`;
  await page.screenshot({path:file,fullPage:process.env.EVEREST_QA_FULL==='1'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  report.push({screen:key,theme,viewport:`${w}x${h}`,file,horizontalOverflow:overflow,errors});
  await context.close();
 }}
await browser.close();
await fs.writeFile(`${output}/report.json`,JSON.stringify(report,null,1));
console.log(report.map(r=>`${r.screen} ${r.theme} ${r.viewport} overflow=${r.horizontalOverflow} errors=${r.errors.length}`).join('\n'));
