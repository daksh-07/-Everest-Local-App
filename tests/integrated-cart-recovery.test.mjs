import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {URL} from 'node:url';
const source=ts.transpileModule(fs.readFileSync('lib/commerce.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function harness(session,rows=[]){
 const calls=[];const exports={};
 const client={
  auth:{getSession:async()=>({data:{session}})},
  rpc:async(name)=>{calls.push(name);return {data:'cart-id',error:null}},
  from:(table)=>{calls.push(table);return {
   select:(fields)=>{calls.push(fields);return {eq:async()=>({data:rows,error:null})}}
  }},
 };
 vm.runInNewContext(source,{exports,require:(name)=>name==='react-native'?{Platform:{OS:'web'}}:name==='./supabase'?{supabase:client,requireSupabaseConfig(){}}:{},URL,Error});
 return {api:exports,calls};
}
test('merged cart does not create or read a cart for a signed-out visitor',async()=>{
 const h=harness(null);assert.equal((await h.api.getCart()).length,0);assert.deepEqual(h.calls,[]);
});
test('merged cart retains images and stock while normalizing PostgREST relations',async()=>{
 const product={id:'p1',product_images:[{url:'https://example.invalid/product.png',is_primary:true}],businesses:[{name:'Fixture'}],inventory:[{stock_quantity:8,reserved_quantity:2}]};
 const h=harness({user:{id:'u1'}},[{id:'line',product_id:'p1',quantity:2,products:[product],product_variants:[{id:'v1',available:true,stock_quantity:5,reserved_quantity:1}]}]);
 const rows=await h.api.getCart();assert.equal(rows[0].products.product_images[0].is_primary,true);assert.equal(rows[0].products.inventory.reserved_quantity,2);assert.equal(rows[0].products.businesses.name,'Fixture');assert.equal(rows[0].product_variants.reserved_quantity,1);assert.ok(h.calls.some(v=>v.includes('product_images(')&&v.includes('inventory(')));
});
