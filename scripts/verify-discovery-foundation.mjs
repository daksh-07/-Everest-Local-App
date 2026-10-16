/* global document, location, innerWidth, URL, URLSearchParams, localStorage, matchMedia */
// Run against an exported build. Install Playwright outside the app, then set
// PLAYWRIGHT_MODULE to its index.mjs; no application dependency is required.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.EVEREST_QA_BROWSER==='webkit'?'webkit':'chromium';
const base=process.env.EVEREST_PREVIEW_URL||'http://localhost:8082';
const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/everest-discovery-qa';
await fs.mkdir(output,{recursive:true});
const browser=await engines[engine].launch(engine==='webkit'?{}:{executablePath:process.env.EVEREST_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();const errors=[];const rest=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',request=>{if(request.url().includes('/rest/v1/'))rest.push(new URL(request.url()).pathname)});
try{
 await page.goto(base,{waitUntil:'networkidle'});
 await page.getByLabel('Search services, businesses and products',{exact:true}).waitFor();
 assert.equal(rest.filter(path=>path.endsWith('/list_discovery_feed')).length,1,'Only Home loads its feed at startup');
 assert.ok(!rest.some(path=>/post_reactions|post_comments|public_profiles|verified_work_posts/.test(path)),'Hidden Explore must not hydrate media or engagement');
 const startupRest=[...rest];
 const sceneState=()=>page.evaluate(()=>[...document.querySelectorAll('[id^="everest-scene-"]')].map(e=>({id:e.id,inert:e.inert})));
 assert.deepEqual((await sceneState()).filter(e=>!e.inert).map(e=>e.id),['everest-scene-0']);
 await page.getByRole('tab',{name:'Explore',exact:true}).click();
 await page.waitForFunction(()=>location.pathname==='/social');
 assert.deepEqual((await sceneState()).filter(e=>!e.inert).map(e=>e.id),['everest-scene-1']);
 // A vertical gesture must not move the pager. A horizontal drag reaches Clips.
 await page.mouse.move(180,340);await page.mouse.down();await page.mouse.move(183,150,{steps:8});await page.mouse.up();
 assert.ok(!(await page.url()).includes('mode=clips'));
 // Bound the gesture's velocity: WebKit delivers automation mouse steps fast
 // enough to trigger the intentionally supported two-page flick otherwise.
 await page.mouse.move(310,420);await page.mouse.down();
 for(let step=1;step<=12;step++){await page.mouse.move(310-160*step/12,420);await page.waitForTimeout(25)}
 await page.mouse.up();
 await page.waitForFunction(()=>new URLSearchParams(location.search).get('mode')==='clips');
 assert.deepEqual((await sceneState()).filter(e=>!e.inert).map(e=>e.id),['everest-scene-2']);
 await page.getByRole('tab',{name:'Home',exact:true}).click();
 await page.waitForFunction(()=>location.pathname==='/');
 for(const width of [320,360,375,390,430,768,1440]){
  await page.setViewportSize({width,height:844});
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`No document overflow at ${width}`);
  for(const label of ['Request a Quote','Find someone now with Everest Live']){
   const rect=await page.getByLabel(label,{exact:true}).boundingBox();
   assert.ok(rect&&rect.height>=44&&rect.x>=0&&rect.x+rect.width<=width+1,`${label}: usable at ${width}`);
  }
  await page.screenshot({path:`${output}/home-${width}.png`});
 }
 await page.setViewportSize({width:390,height:844});
 // Home no longer has a menu sheet. Every destination it used to list must stay one tap from
 // Home or the tab bar, and must actually navigate (guests are redirected to sign in for
 // protected routes, which still proves the entry works).
 const destinations=[
  {name:'Find services',locate:()=>page.getByLabel('Search services, businesses and products',{exact:true}),paths:['/search']},
  {name:'Request quotes',locate:()=>page.getByLabel('Request a Quote',{exact:true}),paths:['/request','/auth']},
  {name:'Everest Live',locate:()=>page.getByLabel('Find someone now with Everest Live',{exact:true}),paths:['/request','/auth'],live:true},
  {name:'Shop local',locate:()=>page.getByLabel('See all products',{exact:true}),paths:['/shop']},
  {name:'Ask Everest',locate:()=>page.getByLabel('Ask Everest for help',{exact:true}),paths:['/assistant','/auth']},
  {name:'Local feed',locate:()=>page.getByRole('tab',{name:'Explore',exact:true}),paths:['/social']},
  {name:'Bookings and orders',locate:()=>page.getByRole('tab',{name:'Activity',exact:true}),paths:['/activity','/auth']},
  {name:'Account',locate:()=>page.getByRole('tab',{name:'Account',exact:true}),paths:['/account','/auth']},
 ];
 const reached=[];
 for(const destination of destinations){
  await page.goto(base,{waitUntil:'networkidle'});
  const target=destination.locate();
  await target.scrollIntoViewIfNeeded();
  const rect=await target.boundingBox();
  assert.ok(rect&&rect.height>=44,`${destination.name}: entry is visible with a 44px target`);
  await target.click();
  await page.waitForFunction(paths=>paths.includes(location.pathname),destination.paths,{timeout:15000});
  const landed=await page.evaluate(()=>location.pathname+location.search);
  if(destination.live&&landed.startsWith('/request'))assert.match(landed,/live=1/,'Live entry keeps its live intent');
  reached.push({name:destination.name,landed});
 }
 await page.goto(base,{waitUntil:'networkidle'});
 await fs.writeFile(`${output}/reachability.json`,JSON.stringify(reached,null,2));
 // Appearance preferences must keep every primary intent usable, including
 // larger Classic controls and the more expressive Pulse type scale.
 for(const mode of ['DEFAULT','PULSE','CLASSIC'])for(const theme of ['LIGHT','DARK']){
  await page.evaluate(({mode,theme})=>{localStorage.setItem('everest-local-experience-v1',mode);localStorage.setItem('everest-local-theme',theme)},{mode,theme});
  await page.reload({waitUntil:'networkidle'});
  for(const width of [320,360,375,390,430,768,1440]){
   await page.setViewportSize({width,height:844});await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Home ${mode} ${theme} ${width}`);
   for(const label of ['Request a Quote','Find someone now with Everest Live']){
    const rect=await page.getByLabel(label,{exact:true}).boundingBox();
    assert.ok(rect&&rect.height>=44&&rect.x>=0&&rect.x+rect.width<=width+1,`${label}: ${mode} ${theme} ${width}`);
   }
  }
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>{
   const target=document.querySelector('[aria-label="Request a Quote"]');
   return target&&target.getBoundingClientRect().right<=innerWidth;
  });
  await page.waitForTimeout(100);
  await page.screenshot({path:`${output}/home-${mode.toLowerCase()}-${theme.toLowerCase()}-390.png`});
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.reload({waitUntil:'networkidle'});
 assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
 await page.getByRole('tab',{name:'Explore',exact:true}).click();
 await page.waitForFunction(()=>location.pathname==='/social');
 await page.getByRole('tab',{name:'Home',exact:true}).click();
 await page.waitForFunction(()=>location.pathname==='/');
 assert.deepEqual(errors,[],'No uncaught browser errors');
 await fs.writeFile(`${output}/results.json`,JSON.stringify({base,errors,startupRest},null,2));
 console.log(`PASS startup fetching, retained scenes, selected tabs, vertical/horizontal gestures, reachability of all 8 former menu destinations, reduced motion and 42 Home appearance/width combinations. ${engine} emulation only.`);
}finally{await browser.close()}
