/* global document, location, innerWidth, URL, URLSearchParams */
// Run against an exported build. Install Playwright outside the app, then set
// PLAYWRIGHT_MODULE to its index.mjs; no application dependency is required.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.EVEREST_PREVIEW_URL||'http://localhost:8082';
const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/everest-discovery-qa';
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.EVEREST_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();const errors=[];const rest=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',request=>{if(request.url().includes('/rest/v1/'))rest.push(new URL(request.url()).pathname)});
try{
 await page.goto(base,{waitUntil:'networkidle'});
 await page.getByLabel('Open Everest menu',{exact:true}).waitFor();
 assert.equal(rest.filter(path=>path.endsWith('/list_discovery_feed')).length,1,'Only Home loads its feed at startup');
 assert.ok(!rest.some(path=>/post_reactions|post_comments|public_profiles|verified_work_posts/.test(path)),'Hidden Explore must not hydrate media or engagement');
 const sceneState=()=>page.evaluate(()=>[...document.querySelectorAll('[id^="everest-scene-"]')].map(e=>({id:e.id,inert:e.inert})));
 assert.deepEqual((await sceneState()).filter(e=>!e.inert).map(e=>e.id),['everest-scene-0']);
 await page.getByRole('tab',{name:'Explore',exact:true}).click();
 await page.waitForFunction(()=>location.pathname==='/social');
 assert.deepEqual((await sceneState()).filter(e=>!e.inert).map(e=>e.id),['everest-scene-1']);
 // A vertical gesture must not move the pager. A horizontal drag reaches Clips.
 await page.mouse.move(180,340);await page.mouse.down();await page.mouse.move(183,150,{steps:8});await page.mouse.up();
 assert.ok(!(await page.url()).includes('mode=clips'));
 await page.mouse.move(310,420);await page.mouse.down();await page.mouse.move(150,420,{steps:12});await page.mouse.up();
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
 await page.getByLabel('Open Everest menu',{exact:true}).click();
 await page.getByLabel('Close menu',{exact:true}).click();
 assert.deepEqual(errors,[],'No uncaught browser errors');
 await fs.writeFile(`${output}/results.json`,JSON.stringify({base,errors,startupRest:rest},null,2));
 console.log('PASS startup fetching, retained scenes, selected tabs, vertical/horizontal gestures, menu, seven widths. Browser emulation only.');
}finally{await browser.close()}
