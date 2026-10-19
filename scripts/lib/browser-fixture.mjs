// Wait for fixture API reads started after the document's initial networkidle.
// Retained Expo scenes can start those reads late; reloading early makes WebKit
// report cancelled cross-origin reads as access-control page errors.
import {setTimeout as delay} from 'node:timers/promises';
const tracked=new WeakMap();
export function trackFixtureReads(page){
 const pending=new Set();let changed=Date.now();
 page.on('request',request=>{if(/\/rest\/v1\/|\/auth\/v1\//.test(request.url())){pending.add(request);changed=Date.now();}});
 const finish=request=>{if(pending.delete(request))changed=Date.now();};
 page.on('requestfinished',finish);page.on('requestfailed',finish);
 tracked.set(page,async()=>{const deadline=Date.now()+20000;while(pending.size||Date.now()-changed<600){if(Date.now()>deadline)throw new Error('Fixture API reads did not settle before navigation');await delay(50);}});
}
export async function settleFixtureReads(page){await page.waitForLoadState('networkidle');await tracked.get(page)?.();}
