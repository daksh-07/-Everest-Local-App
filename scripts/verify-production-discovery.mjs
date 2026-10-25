/* global fetch, AbortSignal */
// Read-only guest HTTP smoke; never issues mutations or prints customer rows.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from '../lib/supabase.config.ts';
const paths=['businesses','categories','services','products','posts','post_media','post_comments','post_reactions','verified_work_posts'];
const results=[];
for(const name of paths){
 const start=Date.now();const r=await fetch(`${SUPABASE_URL}/rest/v1/${name}?select=${['post_reactions','verified_work_posts'].includes(name)?'post_id':'id'}&limit=1`,{headers:{apikey:SUPABASE_PUBLISHABLE_KEY},signal:AbortSignal.timeout(15000)});const data=await r.json();
 results.push({name,status:r.status,ms:Date.now()-start,rows:Array.isArray(data)?data.length:null,error:r.ok?null:data.message});assert.equal(r.status,200,name+' reads successfully');
}
const start=Date.now();const shop=await fetch(`${SUPABASE_URL}/rest/v1/rpc/shop_products`,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});const data=await shop.json();results.push({name:'shop_products',status:shop.status,ms:Date.now()-start,rows:Array.isArray(data)?data.length:null,error:shop.ok?null:data.message});assert.equal(shop.status,200);
for(const name of ['follows','user_connections']){const r=await fetch(`${SUPABASE_URL}/rest/v1/${name}?select=*&limit=1`,{headers:{apikey:SUPABASE_PUBLISHABLE_KEY},signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);assert.deepEqual(await r.json(),[]);results.push({name,status:200,private_rows:0})}
const output=process.env.RECOVERY_OUTPUT||'/tmp/production-discovery-after.json';await fs.writeFile(output,JSON.stringify({at:new Date().toISOString(),results},null,2));console.log(JSON.stringify(results));
