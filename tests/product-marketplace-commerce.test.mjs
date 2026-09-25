import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260925135500_product_marketplace_commerce.sql','utf8');
const home=fs.readFileSync('app/index.tsx','utf8');
const shop=fs.readFileSync('app/shop.tsx','utf8');
const product=fs.readFileSync('app/product.tsx','utf8');
const editor=fs.readFileSync('app/product-editor.tsx','utf8');
const cart=fs.readFileSync('app/cart.tsx','utf8');
const commerce=fs.readFileSync('lib/commerce.ts','utf8');
const productCommerce=fs.readFileSync('lib/product-commerce.ts','utf8');

test('Shop Local uses dedicated product marketplace',()=>{
 assert.match(home,/route:'\/shop'/);
 assert.match(shop,/Search products/);
 assert.match(productCommerce,/shop_products/);
 assert.match(shop,/\/product\?id=/);
});

test('active products require media and seller authority',()=>{
 assert.match(migration,/Add at least one product photo before publishing/);
 assert.match(migration,/public\.is_business_member\(bid\)/);
 assert.match(migration,/public=false/);
 assert.match(migration,/product-media/);
 assert.match(migration,/p\.business_id=\(storage\.foldername\(name\)\)\[1\]::uuid/);
});

test('variants are exact cart and checkout identities',()=>{
 assert.match(migration,/cart_items add column if not exists variant_id/);
 assert.match(migration,/variant_snapshot/);
 assert.match(migration,/coalesce\(item\.v_price,item\.sale_price,item\.price\)/);
 assert.match(migration,/Insufficient variant stock/);
 assert.match(commerce,/p_variant_id/);
 assert.match(cart,/product_variants\?\.title|product_variants\.title/);
});

test('seller wizard is media-first and draft friendly',()=>{
 for(const step of ['Photos','Basics','Price','Options','Stock','Fulfilment','Details','Preview'])assert.match(editor,new RegExp(step));
 assert.match(editor,/SAVE DRAFT/);
 assert.match(editor,/TAKE PHOTO/);
 assert.match(editor,/VARIANT PHOTO/);
 assert.match(editor,/OPEN CUSTOMER PREVIEW/);
});

test('customer product page is variant and stock aware',()=>{
 assert.match(product,/setVariantCartItem/);
 assert.match(product,/image_id/);
 assert.match(product,/OUT OF STOCK/);
 assert.match(product,/ADD TO CART/);
});

test('checkout never trusts a client price',()=>{
 assert.doesNotMatch(commerce,/p_price/);
 assert.match(migration,/item\.unit_price:=coalesce\(item\.v_price,item\.sale_price,item\.price\)/);
 assert.match(migration,/for update/);
});
