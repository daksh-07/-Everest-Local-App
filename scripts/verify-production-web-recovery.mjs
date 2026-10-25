// Read-only smoke of public UI; fixture-auth and transaction testing are separate.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {URL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.EVEREST_PREVIEW_URL||'https://everest-local-app.vercel.app';
const browser=await chromium.launch({executablePath:process.env.EVEREST_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[],failures=[],reads=[];
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('supabase.co')&&r.url().includes('/rest/')){const entry={path:new URL(r.url()).pathname,status:r.status()};reads.push(entry);if(r.status()>=400)failures.push(entry)}});
const t=Date.now();await page.goto(base);await page.getByRole('tab',{name:'Home',exact:true}).waitFor();const cold=Date.now()-t;
await page.waitForTimeout(5000);const transitions=[];
for(const name of ['Explore','Home','Explore','Home']){const t=Date.now();await page.getByRole('tab',{name,exact:true}).click();await page.waitForURL(u=>u.pathname===(name==='Explore'?'/social':'/'));transitions.push({name,ms:Date.now()-t})}
await page.waitForTimeout(3000);assert.deepEqual(errors,[]);assert.deepEqual(failures,[],'Public UI has no failing REST reads');
const report={at:new Date().toISOString(),base,browser:browser.version(),cold_ms:cold,transitions,reads,errors,failures};
await fs.writeFile(process.env.RECOVERY_OUTPUT||'/tmp/production-web-after.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
