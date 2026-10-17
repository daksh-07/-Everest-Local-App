import test from 'node:test';
import assert from 'node:assert/strict';
import {canSelectVariant,nextCartQuantity} from '../lib/product-presentation.ts';
test('variant selection respects availability and reserved stock',()=>{
 const policy={made_to_order:false,track_stock:true};
 const variant={available:true,stock_quantity:3,reserved_quantity:3};
 assert.equal(canSelectVariant(policy,variant),false);
 assert.equal(canSelectVariant(policy,{...variant,reserved_quantity:2}),true);
 assert.equal(canSelectVariant({...policy,made_to_order:true},variant),true);
 assert.equal(canSelectVariant({...policy,track_stock:false},{...variant,available:false}),false);
});
test('adding never silently truncates the quantity reported to the customer',()=>{
 assert.equal(nextCartQuantity(98,1),99);
 assert.equal(nextCartQuantity(98,2),null);
 assert.equal(nextCartQuantity(0,100),null);
 assert.equal(nextCartQuantity(0,1.5),null);
 assert.equal(nextCartQuantity(3,2),5);
});
