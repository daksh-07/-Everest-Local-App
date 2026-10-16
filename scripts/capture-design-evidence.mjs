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
const screens={
 home:{path:'/',signedIn:true},
 'home-guest':{path:'/',signedIn:false},
 search:{path:'/search',signedIn:true},
 shop:{path:'/shop',signedIn:true},
 activity:{path:'/activity',signedIn:true},
 account:{path:'/account',signedIn:true},
 'business-today':{path:'/business-today',signedIn:true,business:true},
};
const selected=(process.env.EVEREST_QA_SCREENS||Object.keys(screens).join(',')).split(',');
function rows(table,isBusiness){
 switch(table){
  case 'businesses':return businesses;
  case 'profiles':return [{id:uid,full_name:'Sam Taylor',avatar_url:null,suburb:'North Melbourne',city:'Melbourne',state:'VIC',country:'AU',role:isBusiness?'BUSINESS':'CUSTOMER'}];
  case 'bookings':return [{id:'b1',status:'CONFIRMED',scheduled_date:'2026-10-20',scheduled_time:'10:00:00',created_at:'2026-10-12T10:00:00Z',price:185,business_id:biz,businesses:{name:businesses[0].name}}];
  case 'service_requests':return [{id:'r1',status:'QUOTING',description:'Hedge trimming and green-waste removal, front and back yard',created_at:'2026-10-14T10:00:00Z'}];
  case 'quotes':return [{id:'q1',status:'SENT',total:240,created_at:'2026-10-15T09:00:00Z'}];
  case 'orders':return [];
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
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.routeWebSocket('**/realtime/**',ws=>ws.close());
  await page.route(/open-meteo|nominatim|bigdatacloud/,route=>route.fulfill({status:503,json:{}}));
  await page.route('**/*.supabase.co/**',async route=>{
   const request=route.request(),url=new URL(request.url()),table=url.pathname.split('/').at(-1);
   if(url.pathname.includes('/auth/'))return route.fulfill({status:screen.signedIn?200:401,json:screen.signedIn?user:{message:'no session'}});
   if(url.pathname.includes('/storage/'))return route.fulfill({status:200,json:[]});
   if(url.pathname.includes('/rpc/')){
    if(table==='get_my_access_context')return route.fulfill({json:{profile_role:screen.business?'BUSINESS':'CUSTOMER',is_business_member:!!screen.business,is_verified_business:!!screen.business,business_id:screen.business?biz:null,business_name:screen.business?businesses[0].name:null}});
    if(table==='get_my_workspace_context')return route.fulfill({json:{mode:screen.business?'BUSINESS':'CUSTOMER',active_business_id:screen.business?biz:null,businesses:screen.business?[{...businesses[0],member_role:'OWNER',status:'ACTIVE'}]:[]}});
    if(table.includes('shop')||table.includes('product'))return route.fulfill({json:products});
    return route.fulfill({json:[]});
   }
   if(request.method()!=='GET'&&request.method()!=='HEAD')return route.fulfill({status:403,json:{message:'Writes blocked by inert QA fixture'}});
   let json=rows(table,screen.business);
   if(request.headers().accept?.includes('vnd.pgrst.object'))json=json[0]??null;
   return route.fulfill({status:200,json,headers:{'content-range':`0-${Math.max(0,(Array.isArray(json)?json.length:1)-1)}/${Array.isArray(json)?json.length:1}`}});
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
