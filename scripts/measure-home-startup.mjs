/* global localStorage, Buffer, document, URL */
// Home startup baseline: median of 5 cold loads at 390x844 with inert Supabase fixtures.
// Usage: node scripts/measure-home-startup.mjs http://localhost:4173 label
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const [base,label]=process.argv.slice(2);const b=await chromium.launch({args:['--no-sandbox']});const runs=[];
const uid='11111111-1111-4111-8111-111111111111';const user={id:uid,aud:'authenticated',role:'authenticated',email:'f@example.invalid'};
const session={access_token:`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:uid,exp:4102444800})).toString('base64url')}.x`,refresh_token:'x',expires_at:4102444800,expires_in:999999,token_type:'bearer',user};
for(let i=0;i<5;i++){const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true});await ctx.addInitScript(s=>localStorage.setItem('sb-bmwbljefnamvjnmuvkvv-auth-token',JSON.stringify(s)),session);
 const p=await ctx.newPage();let rest=0,rpc=0;await p.routeWebSocket('**/realtime/**',ws=>ws.close());
 await p.route('**/*.supabase.co/**',r=>{const u=new URL(r.request().url());if(u.pathname.includes('/rest/v1/rpc/'))rpc++;else if(u.pathname.includes('/rest/'))rest++;
  if(u.pathname.includes('/auth/'))return r.fulfill({json:user});return r.fulfill({json:[]})});
 const t0=Date.now();await p.goto(base+'/');await p.getByText('Browse services').or(p.getByText('Browse categories')).first().waitFor();const ttc=Date.now()-t0;
 await p.waitForTimeout(2500);const dom=await p.evaluate(()=>document.querySelectorAll('*').length);
 runs.push({ttc,rest,rpc,dom});await ctx.close();}
await b.close();const med=k=>runs.map(r=>r[k]).sort((a,c)=>a-c)[2];
console.log(label,JSON.stringify({median_time_to_content_ms:med('ttc'),rest_requests:med('rest'),rpc_requests:med('rpc'),dom_nodes:med('dom'),runs}));
