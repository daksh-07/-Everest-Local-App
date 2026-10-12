/* global document, innerWidth, localStorage, getComputedStyle */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {setTimeout} from 'node:timers';
const engines=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.EVEREST_QA_BROWSER==='webkit'?'webkit':'chromium';
const base=process.env.EVEREST_PREVIEW_URL||'http://localhost:8082';
const output=process.env.EVEREST_QA_ARTIFACTS||'/tmp/everest-search-qa';
await fs.mkdir(output,{recursive:true});
const browser=await engines[engine].launch(engine==='webkit'?{}:{executablePath:process.env.EVEREST_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const searchRoute='**/rest/v1/rpc/universal_search';
try{
 for(const mode of ['DEFAULT','PULSE','CLASSIC'])for(const theme of ['LIGHT','DARK']){
  await page.goto(base+'/search',{waitUntil:'networkidle'});
  await page.evaluate(({mode,theme})=>{localStorage.setItem('everest-local-experience-v1',mode);localStorage.setItem('everest-local-theme',theme)},{mode,theme});
  await page.reload({waitUntil:'networkidle'});
  for(const width of [320,360,375,390,430,768,1440]){
   await page.setViewportSize({width,height:844});
   await page.waitForTimeout(100);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Search ${mode} ${theme} ${width}`);
   const input=page.getByLabel('Search Everest Local',{exact:true});
   assert.ok(await input.evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16),'Inputs must not trigger mobile Safari zoom');
   assert.equal(await page.getByRole('button',{name:/^Find .* services$/}).count(),8);
   for(const button of await page.getByRole('button',{name:/^Find .* services$/}).all()){
    const rect=await button.boundingBox();assert.ok(rect&&rect.height>=44&&rect.x>=0&&rect.x+rect.width<=width+1,'Category touch target fits');
   }
   if(mode==='DEFAULT'&&theme==='LIGHT')await page.screenshot({path:`${output}/search-${width}.png`});
  }
 }
 await page.setViewportSize({width:390,height:844});
 // Explicit permission fixture keeps this regression independent of whether
 // guest search has been enabled by a later backend rollout.
 await page.route(searchRoute,route=>route.fulfill({status:403,json:{code:'42501',message:'permission denied for function universal_search'}}));
 await page.getByRole('button',{name:'Find cleaning services',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[aria-label="Search Everest Local"]').value==='Cleaning');
 await page.getByLabel('Sign in to search',{exact:true}).waitFor();
 assert.equal(await page.getByRole('tab',{name:'Services',exact:true}).getAttribute('aria-selected'),'true');
 await page.screenshot({path:`${output}/search-sign-in-390.png`});
 await page.unroute(searchRoute);
 // Controlled transport fixtures only. No records are written and fixture
 // responses never ship in the app. Exercise stale responses during debounce.
 await page.route(searchRoute,async route=>{
  const {p_query}=route.request().postDataJSON();
  if(p_query==='older')await new Promise(resolve=>setTimeout(resolve,180));
  try{await route.fulfill({json:p_query==='older'?[{kind:'SERVICE',id:'test-only',title:'Stale fixture result',subtitle:'Test transport fixture',score:1,metadata:{}}]:[]})}catch{/* cancelled request */}
 });
 const input=page.getByLabel('Search Everest Local',{exact:true});
 await input.fill('older');
 await page.waitForRequest(r=>r.url().includes('/universal_search')&&r.postDataJSON()?.p_query==='older');
 await input.fill('newer');
 await page.waitForTimeout(240);
 assert.equal(await page.getByText('Stale fixture result',{exact:true}).count(),0,'Old response cannot appear during next query debounce');
 await page.getByText('No Everest results',{exact:true}).waitFor();
 await page.getByLabel('Clear search',{exact:true}).click();
 await page.getByText('Find a local service',{exact:true}).waitFor();
 await page.unroute(searchRoute);
 await page.route(searchRoute,route=>route.abort('failed'));
 await input.fill('offline test');
 await page.getByText('Search could not be loaded. Check your connection and try again.',{exact:true}).waitFor();
 await page.unroute(searchRoute);
 await page.route(searchRoute,route=>route.fulfill({json:[]}));
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await page.getByText('No Everest results',{exact:true}).waitFor();
 await page.getByLabel('Back from search',{exact:true}).click();
 await page.getByLabel('Open Everest menu',{exact:true}).waitFor();
 assert.deepEqual(errors,[],'No uncaught browser errors');
 console.log(`PASS Search at 42 width/mode/theme combinations, categories, account guidance, stale request cancellation, clear, failure/retry and back. ${engine} emulation; transport fixtures labelled above.`);
}finally{await browser.close()}
