import test from 'node:test';
import assert from 'node:assert/strict';
import {cartQuantityLimit,cartNeedsAttention} from '../lib/cart-presentation.ts';
const item={quantity:2,variant_id:null,product_variants:null,products:{businesses:{status:'ACTIVE',verification_status:'VERIFIED',accepts_orders:true,country:'Australia'},status:'ACTIVE',track_stock:true,made_to_order:false,inventory:{stock_quantity:5,reserved_quantity:2}}};
test('cart uses unreserved authoritative stock and refuses unknown stock',()=>{
 assert.equal(cartQuantityLimit(item),3);
 assert.equal(cartQuantityLimit({...item,products:{...item.products,inventory:null}}),0);
 assert.equal(cartQuantityLimit({...item,products:{...item.products,inventory:{stock_quantity:1,reserved_quantity:2}}}),0);
 assert.equal(cartNeedsAttention({...item,quantity:4}),true);
});
test('variant stock never falls back to parent inventory',()=>{
 const v={...item,variant_id:'v',product_variants:{available:true,stock_quantity:2,reserved_quantity:1}};
 assert.equal(cartQuantityLimit(v),1);
 assert.equal(cartQuantityLimit({...v,product_variants:null}),0);
 assert.equal(cartQuantityLimit({...v,product_variants:{...v.product_variants,available:false}}),0);
});
test('untracked and made-to-order products still respect cart quantity limits',()=>{
 for(const policy of [{track_stock:false},{made_to_order:true}]){
  const open={...item,products:{...item.products,...policy}};
  assert.equal(cartQuantityLimit(open),99);
  for(const quantity of [0,-1,1.5,100])assert.equal(cartNeedsAttention({...open,quantity}),true);
 }
});

test('cart does not offer purchase when merchant eligibility is missing or no longer active',()=>{
 for(const business of [null,{...item.products.businesses,status:'PAUSED'},{...item.products.businesses,accepts_orders:false},{...item.products.businesses,country:''}])assert.equal(cartQuantityLimit({...item,products:{...item.products,businesses:business}}),0);
});
