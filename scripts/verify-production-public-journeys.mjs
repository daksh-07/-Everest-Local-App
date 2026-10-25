/* global fetch */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {URL} from 'node:url';
import {SUPABASE_URL as api,SUPABASE_PUBLISHABLE_KEY as key} from '../lib/supabase.config.ts';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.EVEREST_PREVIEW_URL||'https://everest-local-app.vercel.app';

const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const p=await b.newPage({viewport:{width:390,height:844}});const failures=[],errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('response',async r=>{if(r.url().includes('/rest/')&&r.status()>=400)failures.push({path:new URL(r.url()).pathname,status:r.status(),error:await r.json().catch(()=>null)})});
await p.goto(base);await p.getByRole('tab',{name:'Home',exact:true}).waitFor();
const rows=await p.evaluate(async({api,key})=>{const read=async table=>(await fetch(`${api}/rest/v1/${table}?select=id,name&limit=1`,{headers:{apikey:key}})).json();return {products:await read('products'),businesses:await read('businesses')}},{api,key});
const results=[];
for(const [table,path] of [['products','product'],['businesses','business-profile']]){const row=rows[table][0];if(!row){results.push({table,skipped:'no public data'});continue}await p.getByText(row.name,{exact:true}).filter({visible:true}).first().click();await p.waitForURL(u=>u.pathname==='/'+path);await p.getByText(row.name,{exact:true}).filter({visible:true}).first().waitFor();await p.waitForTimeout(3000);results.push({table,opened:true});await p.goBack();await p.getByRole('tab',{name:'Home',exact:true}).waitFor()}
await fs.writeFile(process.env.RECOVERY_OUTPUT||'/tmp/public-journeys.json',JSON.stringify({base,results,failures,errors},null,2));await b.close();assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);console.log('Public product/profile navigation and back navigation passed');
