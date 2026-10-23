import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {formatDay,formatMoney,formatSchedule,formatStatus,formatTime,formatWhen} from '../lib/format.ts';

const read=path=>fs.readFileSync(path,'utf8');
const now=new Date(2026,9,16,12,0);

test('dates read as people say them, and date-only values are local days',()=>{
 assert.equal(formatDay('2026-10-16',{now}),'Today');
 assert.equal(formatDay('2026-10-17',{now}),'Tomorrow');
 assert.equal(formatDay('2026-10-15',{now}),'Yesterday');
 assert.match(formatDay('2026-10-20',{now}),/Tue.*20.*Oct/);
 assert.match(formatDay('2025-12-01',{now}),/2025/);
 assert.equal(formatDay(null),'');assert.equal(formatDay('not a date'),'');
});

test('times, schedules, money and statuses are formatted without raw server values',()=>{
 assert.equal(formatTime('10:00:00'),'10:00 am');
 assert.equal(formatTime('14:30'),'2:30 pm');
 assert.equal(formatTime('garbage'),'');
 assert.equal(formatSchedule('2026-10-17','09:15',{now}),'Tomorrow · 9:15 am');
 assert.equal(formatSchedule('2026-10-17',null,{now}),'Tomorrow');
 assert.equal(formatMoney(1299.5),'$1,299.50');
 assert.equal(formatMoney(null),'');assert.equal(formatMoney('x'),'');
 assert.equal(formatStatus('PENDING_PAYMENT'),'Pending payment');
 assert.equal(formatStatus(''),'Pending');
 assert.equal(formatWhen(new Date(2026,9,16,9,5).toISOString(),{now}),'9:05 am');
 assert.equal(formatWhen(new Date(2026,9,15,9,5).toISOString(),{now}),'Yesterday');
 assert.equal(formatWhen(null),'');
});

test('Live mini player only shows the signed-in customer’s own request',()=>{
 const player=read('components/EverestLiveMiniPlayer.tsx');
 // RLS lets admins read every service request; the client must scope explicitly.
 assert.match(player,/\.eq\('customer_id',customerId\)/);
 assert.match(player,/filter=`customer_id=eq\.\$\{customerId\}`/);
 assert.match(player,/auth\.getSession\(\)/);
 assert.doesNotMatch(player,/fontSize:8\b/,'no sub-legible text in the player');
});

test('Ask Everest is a header action, never a floating button over content',()=>{
 assert.ok(!fs.existsSync('components/DraggableAskEverest.tsx'));
 assert.doesNotMatch(read('app/_layout.tsx'),/DraggableAskEverest/);
 // Reachable from the customer Home search bar, customer Profile, Business Today and the employee home.
 assert.match(read('app/index.tsx'),/accessibilityLabel="Ask Everest for help"/);
 for(const screen of ['app/account.tsx','app/business-today.tsx','app/business-my-work.tsx'])assert.match(read(screen),/<AskEverestButton\/>/,screen);
 assert.match(read('components/AskEverestButton.tsx'),/router\.push\('\/assistant'\)/);
});

test('Home keeps every capability reachable after removing the duplicate menu',()=>{
 const home=read('app/index.tsx');
 assert.doesNotMatch(home,/homeMenuItems|menuOpen/);
 for(const route of ["'/assistant'","'/shop'","'/request'","'/request?live=1'","'/notifications'","'/account'","'/search'","'/social'","'/create'"])assert.ok(home.includes(route),route+' reachable from Home');
 // Shop entry stays visible even when no products load.
 assert.match(home,/Browse products from local businesses/);
 assert.doesNotMatch(home,/from '@\/lib\/ui'/);
});

test('Activity leads with work that needs a decision and avoids duplicate destinations',()=>{
 const activity=read('app/activity.tsx');
 assert.ok(activity.indexOf("group('Needs your attention'")<activity.indexOf("Text accessibilityRole=\"header\" style={s.groupTitle}>More"));
 assert.doesNotMatch(activity,/Local community/);
 assert.match(activity,/ATTENTION=new Set\(\['PENDING_PAYMENT','SENT','VIEWED','QUOTING'\]\)/);
});

test('shared section header replaces ad-hoc uppercase section labels',()=>{
 const today=read('app/business-today.tsx');
 assert.doesNotMatch(today,/>WORK QUEUE<|>QUICK ACTIONS<|>SALES & CRM</);
 assert.ok(fs.existsSync('components/ui/SectionHeader.tsx'));
});

test('business opportunity screens act only for the active workspace business',()=>{
 const opp=read('app/opportunities.tsx');const search=read('app/search.tsx');
 // RLS admits admins and members of other businesses; send_quote picks the oldest authorised business.
 // list_my_business_opportunities filters o.business_id=p_business_id and requires membership of it.
 assert.match(opp,/rpc\('list_my_business_opportunities',\{p_business_id:businessId,p_status:'OPEN'\}\)/);
 assert.match(opp,/rpc\('send_quote_for_business',\{p_business_id:businessId,/);
 assert.doesNotMatch(opp,/rpc\('send_quote',/);
 assert.doesNotMatch(opp,/from\('opportunities'\)\.select\([^)]*\)\.eq\('status','OPEN'\)/,'no unscoped opportunity list');
 assert.match(search,/\.eq\('business_id',workspace\.active_business_id\)/);
});

test('messages: readable controls, sentence case, and no overlay over an open thread',()=>{
 const chat=read('app/messages.tsx');const player=read('components/EverestLiveMiniPlayer.tsx');
 assert.doesNotMatch(chat,/fontSize:(8|9|10)[,.}]/,'no text below 11px in Messages');
 assert.doesNotMatch(chat,/>ACCEPT<|>DECLINE<|>BLOCK<|>REPORT<|YOUR EVEREST CIRCLE|'TODAY'|'YESTERDAY'/);
 assert.match(chat,/setChatThreadOpen\(visible&&Boolean\(selectedPersonal\|\|selectedMarket\)\)/);
 assert.match(player,/useChatThreadOpen\(\)/);
 for(const route of ["'/cart'","'/product'","'/auth'"])assert.ok(player.includes(route),'mini player hidden on '+route);
});

test('mini player anchors above a tab bar only where one exists',()=>{
 const player=read('components/EverestLiveMiniPlayer.tsx');
 const declared=new Set([...player.match(/TAB_BAR_ROUTES=new Set\(\[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]));
 for(const file of fs.readdirSync('app').filter(f=>f.endsWith('.tsx'))){
  const source=read('app/'+file);if(!/<CustomerTabBar|<BusinessTabBar/.test(source))continue;
  const route=file==='index.tsx'?'/':'/'+file.replace(/\.tsx$/,'');
  assert.ok(declared.has(route),route+' renders a tab bar but is missing from TAB_BAR_ROUTES');
 }
});

test('requests, quotes and bookings use the shared header and formatted values',()=>{
 for(const screen of ['app/requests.tsx','app/quotes.tsx','app/bookings.tsx']){
  const source=read(screen);
  assert.match(source,/<ScreenHeader /,screen+' has a back-capable header');
  assert.doesNotMatch(source,/EVEREST LOCAL|MY EVEREST|toFixed\(2\)|replaceAll\('_',' '\)/,screen);
 }
});

test('business profile is a storefront with working actions',()=>{
 const profile=read('app/business-profile.tsx');
 // tab=SERVICES is not a Search tab (it silently fell back to Top); the CTA now targets this business.
 assert.doesNotMatch(profile,/tab=SERVICES/);
 // One service: the CTA opens that service's detail sheet, whose actions target this exact service.
 assert.match(profile,/if\(services\.length===1\)setServiceSheet\(services\[0\]\)/);
 assert.match(profile,/onQuote=\{item=>\{setServiceSheet\(null\);router\.push\(`\/request\?serviceId=\$\{item\.id\}`\)\}\}/);
 assert.match(profile,/onBook=\{item=>\{setServiceSheet\(null\);router\.push\(`\/instant-book\?serviceId=\$\{item\.id\}/);
 // Sheet copy does not claim payment happens at instant booking (it happens on the booking screen).
 assert.doesNotMatch(profile,/takes payment/);
 assert.doesNotMatch(profile,/No public posts yet|No active products listed/,'empty public sections are hidden, not announced');
 assert.doesNotMatch(profile,/📍|🖥|VERIFIED BUSINESS|POST REQUEST|VIEW SERVICES|toFixed\(2\)/);
 assert.match(profile,/<ScreenHeader /);
});

test('Everest Live: consequential actions confirm first, and reconnecting never hides server state',async()=>{
 const live=read('app/everest-live.tsx');
 assert.doesNotMatch(live,/onPress=\{\(\)=>void choose\(q\.id\)\}/,'booking needs confirmation');
 assert.doesNotMatch(live,/onPress=\{\(\)=>void cancel\(\)\}/,'cancel needs confirmation');
 assert.match(live,/onConfirm=\{\(\)=>\{if\(q\)void choose\(q\.id\)\}\}/);
 assert.match(live,/onConfirm=\{\(\)=>void cancel\(\)\}/);
 assert.match(live,/Quotes you’ve received for it can no longer be accepted/);
 assert.doesNotMatch(live,/CHOOSE & BOOK|CANCEL SEARCH|EVEREST LIVE|READY</);
 const {livePresentation}=await import('../lib/live-presentation.ts');
 const state=livePresentation('RESPONSES_AVAILABLE',true);
 assert.equal(state.title,'Your responses are ready');
 assert.equal(state.searching,false);
 assert.match(state.connection,/Reconnecting/);
 assert.equal(livePresentation('NOTIFYING').connection,null);
});

test('web Live map remounts when points arrive so markers are measured',()=>{
 const map=read('components/LiveSearchMap.web.tsx');
 assert.match(map,/key="live-map-empty"/);assert.match(map,/key="live-map" onLayout=\{onLayout\}/);
});

test('shopping screens show stock honestly and format money once',()=>{
 const product=read('app/product.tsx');const cart=read('app/cart.tsx');const orders=read('app/orders.tsx');
 // A sold-out option says so in text, not only by fading; low stock is not shown in the success colour.
 assert.match(product,/!enabled\?<Text style=\{s\.variantPrice\}>Sold out<\/Text>/);
 assert.match(product,/available<=5&&product\.track_stock\)\?c\.warning:c\.success/);
 for(const [name,source] of [['product',product],['cart',cart],['orders',orders]])assert.doesNotMatch(source,/toFixed\(2\)|EVEREST LOCAL|fontSize:8,/,name);
 assert.match(orders,/<ScreenHeader title="Orders"/);
});

test('app copy stays sentence case and legible',async()=>{
 const {formatStatus}=await import('../lib/format.ts');
 assert.equal(formatStatus('VIP'),'VIP');assert.equal(formatStatus('NEW_LEAD'),'New lead');
 const files=fs.readdirSync('app').filter(f=>f.endsWith('.tsx')).map(f=>'app/'+f).concat(fs.readdirSync('components').filter(f=>f.endsWith('.tsx')).map(f=>'components/'+f));
 const acronyms=/^(ABN|ABR|ACN|CTP|VIN|CRM|AUD|GST|ETA|ID|DM|AI|PWA|URL|SMS|QR|FAQ|SKU|PDF|CSV|API|MFA|PIN|KM|OK|[A-Z]{2,3})$/;
 const offenders=[];
 for(const file of files){
  const source=read(file);
  // Multi-word ALL-CAPS JSX text (e.g. >OPEN JOBS<) and sub-11px text.
  for(const m of source.matchAll(/>([A-Z][A-Z0-9 &·…'’/→+?!.,:%$()-]*[A-Z0-9…?!).%])</g)){const words=m[1].trim().split(/\s+/).filter(w=>/[A-Z]{2,}/.test(w)&&!acronyms.test(w.replace(/[^A-Z]/g,'')));if(m[1].includes(' ')&&words.length>1)offenders.push(file+': '+m[1])}
  for(const m of source.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)(?=\s*[,}])/g))if(Number(m[1])<11)offenders.push(file+': fontSize '+m[1]);
 }
 assert.deepEqual(offenders,[]);
});

test('sign-in leads with authentication, keeps role routing, and follows the theme',()=>{
 const auth=read('app/auth.tsx');const picker=read('components/AuthRolePicker.tsx');
 // The role still drives post-auth routing (business onboarding, driver application).
 assert.match(auth,/routeAfterAuth\(intent \?\? 'CUSTOMER'\)/);
 assert.match(auth,/signInWithProvider\(provider, intent\)/);
 assert.match(picker,/accessibilityRole="radio"/);
 assert.match(picker,/Approval is required before any delivery access is granted/);
 // Reset asks for an email only; the old screen also rendered a password field.
 assert.match(auth,/mode !== 'reset' && \(\s*<IconField\s+icon="lock-closed-outline"/);
 assert.match(auth,/router\.push\('\/terms'\)/);assert.match(auth,/router\.push\('\/privacy'\)/);
 for(const [name,source] of [['auth',auth],['picker',picker]]){
  assert.match(source,/useAppTheme\(\)/,name+' follows light/dark theme');
  assert.doesNotMatch(source,/#f8f7f4|#151515|Choose your mode/,name);
 }
});

test('business jobs and inbox read as work lists without leaking raw errors',()=>{
 const jobs=read('app/business-jobs.tsx');const inbox=read('app/business-inbox.tsx');const player=read('components/EverestLiveMiniPlayer.tsx');
 // The old rows repeated a fixed "Checklist · arrival updates · completion record" line on every job.
 assert.doesNotMatch(jobs,/Checklist · arrival updates/);
 assert.doesNotMatch(jobs,/'MESSAGE'|toUpperCase\(\)/);
 assert.match(jobs,/formatSchedule\(job\.scheduled_date,job\.scheduled_time\)/);
 for(const [name,source] of [['jobs',jobs],['inbox',inbox]]){
  assert.doesNotMatch(source,/e instanceof Error\?e\.message/,name+' shows a readable error, not a database message');
  assert.match(source,/accessibilityRole="alert"/,name);
  assert.match(source,/\.eq\('business_id',current\.id\)/,name+' stays scoped to the active business');
 }
 assert.match(inbox,/formatWhen\(/);
 // The customer's Live search pill stays out of the Business workspace, but not off the public storefront.
 assert.match(player,/pathname\.startsWith\('\/business'\)&&pathname!=='\/business-profile'/);
});

test('calendar never invents a booking time and opens the booking itself',()=>{
 const cal=read('app/business-calendar.tsx');
 assert.doesNotMatch(cal,/'09:00'/,'untimed bookings are not placed at 9 am');
 assert.match(cal,/untimed\?'Time to confirm'/);
 assert.match(cal,/router\.push\(\{pathname:'\/business-job',params:\{id:b\.id\}\}\)/);
 assert.doesNotMatch(cal,/toFixed\(0\)|'TASK':'BLOCKED'/);
 assert.match(cal,/accessibilityLabel=\{`Remove blocked time:/);
});

test('social posts: labelled actions, relative times, and text posts that lead with the words',()=>{
 const social=read('app/social.tsx');
 for(const label of ["accessibilityLabel={item.engagement.likedByMe?'Unlike':'Like'}",'accessibilityLabel="Comments"','accessibilityLabel="Share"',"accessibilityLabel={item.engagement.savedByMe?'Remove from saved':'Save'}",'accessibilityLabel="Post options"'])assert.ok(social.includes(label),label);
 assert.doesNotMatch(social,/new Date\(item\.created_at\)\.toLocaleDateString\(\)/);
 assert.match(social,/!item\.media\?\.length&&item\.caption\?<Text style=\{s\.textPost\}>/);
 assert.match(social,/'View 1 comment'/);
});

test('every icon-only button has an accessible name',()=>{
 const files=fs.readdirSync('app').filter(f=>f.endsWith('.tsx')).map(f=>'app/'+f).concat(fs.readdirSync('components').filter(f=>f.endsWith('.tsx')).map(f=>'components/'+f));
 const offenders=[];
 for(const file of files){
  const s=read(file);
  for(const m of s.matchAll(/<Pressable\b/g)){
   // End of the opening tag: the first '>' that is not part of an arrow function.
   let k=m.index;do k=s.indexOf('>',k+1);while(k>0&&s[k-1]==='=');
   const opening=s.slice(m.index,k);if(opening.trimEnd().endsWith('/'))continue;
   const body=s.slice(k,s.indexOf('</Pressable>',m.index));
   if(body.includes('<Pressable')||/accessibilityLabel/.test(opening))continue;
   if(body.includes('<Ionicons')&&!body.includes('<Text'))offenders.push(file+':'+(s.slice(0,m.index).split('\n').length));
  }
 }
 assert.deepEqual(offenders,[]);
});

test('errors shown to people never expose database or runtime internals',async()=>{
 const {userMessage}=await import('../lib/errors.ts');
 const fallback='That couldn’t be saved.';
 assert.equal(userMessage(new Error('Insufficient stock'),fallback),'Insufficient stock','our own RPC messages pass through');
 assert.equal(userMessage(new Error('Choose a time at least one hour from now.'),fallback),'Choose a time at least one hour from now.');
 for(const raw of ['new row violates row-level security policy for table "bookings"','duplicate key value violates unique constraint "x"','PGRST116: JSON object requested, multiple (or no) rows returned','column "foo" does not exist','permission denied for function send_quote',"Cannot read properties of undefined (reading 'id')",'42501'])assert.equal(userMessage(new Error(raw),fallback),fallback,raw);
 assert.match(userMessage(new TypeError('Failed to fetch'),fallback),/offline/);
 assert.match(userMessage(new Error('JWT expired'),fallback),/Sign in again/);
 assert.equal(userMessage({message:'Cart is empty'},fallback),'Cart is empty','PostgREST error objects are not Error instances');
 assert.equal(userMessage(null,fallback),fallback);
 // Recovery instructions and our own permission messages must survive (audit of 902 strings).
 assert.equal(userMessage(new Error('Calendar credentials need reconnection.'),fallback),'Calendar credentials need reconnection.');
 assert.equal(userMessage(new Error('Business permission denied'),fallback),'Business permission denied');
 assert.match(userMessage(new Error('connect ECONNREFUSED 127.0.0.1:443'),fallback),/offline/);
});

test('screens route caught errors through userMessage instead of printing e.message',()=>{
 const files=fs.readdirSync('app').filter(f=>f.endsWith('.tsx')).map(f=>'app/'+f).concat(fs.readdirSync('components').filter(f=>f.endsWith('.tsx')).map(f=>'components/'+f));
 // Allowed: auth's own error classifier and a dev-only console warning.
 const allowed=new Set(['app/auth.tsx','app/assistant.tsx']);
 const offenders=files.filter(f=>!allowed.has(f)&&/(\w+) instanceof Error\s*\?\s*\1\.message\s*:/.test(read(f)));
 assert.deepEqual(offenders,[]);
});

test('icon labels name the action, not the glyph, where the icon is ambiguous',()=>{
 assert.match(read('app/create-post.tsx'),/accessibilityLabel=\{`Remove photo \$\{i\+1\}`\} onPress=\{\(\)=>removePhoto\(i\)\}/);
 assert.match(read('app/business-crm-quote.tsx'),/accessibilityLabel="Remove line item"/);
 assert.match(read('app/messages.tsx'),/accessibilityLabel="Close search"/);
 assert.match(read('app/business-calendar.tsx'),/'Previous day'/);
});

test('job workspace: formatted header, visible lifecycle, gated and confirmed completion',()=>{
 const job=read('app/business-job.tsx');
 assert.doesNotMatch(job,/toFixed\(2\)|replaceAll\('_',' '\)|scheduled_time\?\.slice\(0,5\)/,'no raw dates, times, money or enums');
 assert.match(job,/formatSchedule\(job\.scheduled_date,job\.scheduled_time\)/);
 assert.match(job,/const STEPS:/);
 assert.match(job,/disabled=\{!!busy\|\|blockedByChecklist\}/,'completion is blocked until the checklist is done');
 assert.match(job,/if\(job\.status==='IN_PROGRESS'\)setConfirmComplete\(true\);else void advance\(\)/,'completing asks first');
 assert.match(job,/<ConfirmSheet visible=\{confirmComplete\} title="Complete this job\?"/);
 // Lifecycle calls are unchanged; the screen does not read customer or request tables.
 assert.match(job,/updateBookingStatus\(job\.id,'COMPLETED'\)/);
 assert.doesNotMatch(job,/from\('(service_requests|profiles|public_profiles)'\)/);
 assert.ok(fs.existsSync('docs/design/proposals/business-job-summary-rpc.sql'),'the safe backend change is documented, not applied');
 assert.ok(!fs.readdirSync('supabase/migrations').some(f=>f.includes('business_job_summary')),'proposal is not in migrations');
});

test('customer card: four views, next-up, formatted values, same scoped CRM reads',()=>{
 const c=read('app/business-customer.tsx');
 assert.match(c,/const VIEWS:ReadonlyArray<\{key:View360;label:string\}>=\[\{key:'OVERVIEW'.*'ACTIVITY'.*'WORK'.*'TASKS'/s);
 assert.doesNotMatch(c,/toLocaleString\(\)|toLocaleDateString\(\)|slice\(0,2\)\.toUpperCase\(\)|Customer 360/);
 assert.match(c,/initialsOf\(contact\.display_name\)/);
 assert.match(c,/<Text style=\{v\.nextLabel\}>Next up<\/Text>/);
 // Marketplace history stays limited to the active business and the linked account.
 assert.match(c,/from\('bookings'\)\.select\('id,status,price,scheduled_date,created_at,completed_at'\)\.eq\('business_id',current\.id\)\.eq\('customer_id',c\.linked_everest_user_id\)/);
 assert.match(read('lib/initials.ts'),/export function initialsOf/);
});

test('public profile: removing a connection asks first, messaging uses a sheet, labels are explicit',()=>{
 const pu=read('app/public-user.tsx');
 assert.match(pu,/if\(connected\)setConfirmRemove\(true\);else void connect\(\)/,'tapping Connected never removes in one tap');
 assert.match(pu,/<ConfirmSheet visible=\{confirmRemove\}[^>]*destructive/);
 assert.match(pu,/accessibilityLabel=\{connectionLabel\}/);assert.match(pu,/accessibilityLabel="Your message"/);
 assert.doesNotMatch(pu,/Send a message<\/Text>|toLocaleDateString\(undefined,\{day:'numeric',month:'short',year:'numeric'\}\)/);
 assert.match(pu,/async function send\(\):Promise<boolean>/,'the sheet stays open when sending fails');
});

test('icons are decorative unless labelled, so glyphs never leak into button names',()=>{
 const icon=read('components/ui/Icon.tsx');
 assert.match(icon,/'aria-hidden':true/);assert.match(icon,/importantForAccessibility:'no-hide-descendants'/);assert.match(icon,/accessibilityElementsHidden:true/);
 const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+'/'+e.name):[d+'/'+e.name]);
 const direct=[...walk('app'),...walk('components'),...walk('lib')].filter(f=>f.endsWith('.tsx')&&f!=='components/ui/Icon.tsx').filter(f=>/import\s*\{[^}]*\bIonicons\b[^}]*\}\s*from\s*'@expo\/vector-icons'/.test(read(f)));
 assert.deepEqual(direct,[],'import Ionicons from @/components/ui/Icon');
});

test('creation and stories: real header actions, story identity, accessible playback, no overlay',async()=>{
 for(const f of ['app/create-post.tsx','app/create-story.tsx','app/create-clip.tsx']){const src=read(f);assert.match(src,/<HeaderTextAction label="(Post|Share)"/,f);assert.doesNotMatch(src,/'POST'|'SHARE'|'POSTING'/,f)}
 const story=read('app/story.tsx');
 assert.doesNotMatch(story,/swipe down to close/);assert.match(story,/formatAgo\(story\.created_at\)/);
 assert.match(story,/accessibilityLabel=\{paused\?'Play story':'Pause story'\}/,'playback can be paused without press-and-hold');
 assert.match(read('app/social.tsx'),/storyRing:\{[^}]*borderColor:c\.tertiary/);
 assert.match(read('components/EverestLiveMiniPlayer.tsx'),/'\/story','\/highlight','\/sound'/,'no Live pill over full-screen media');
 const {formatAgo}=await import('../lib/format.ts');const now=new Date(2026,9,16,12,0);
 assert.equal(formatAgo(new Date(2026,9,16,11,10).toISOString(),{now}),'50m');assert.equal(formatAgo(new Date(2026,9,14,12,0).toISOString(),{now}),'2d');assert.equal(formatAgo(null),'');
});

test('the Live pill keeps off the Clips feed only while it is the visible scene',()=>{
 assert.match(read('app/social.tsx'),/setImmersiveMedia\(active&&mode==='CLIPS'\);return\(\)=>setImmersiveMedia\(false\)/);
 assert.match(read('components/EverestLiveMiniPlayer.tsx'),/&&!inThread&&!immersive;/);
});
