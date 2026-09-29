import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

const migration = await readFile(
  new URL('../supabase/migrations/20260921010000_product_order_line_financial_integrity.sql', import.meta.url),
  'utf8',
);

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);

test('product sale price cannot exceed the base price at the database boundary', () => {
  assert.match(migration, /products_sale_price_not_above_price/);
  assert.match(migration, /sale_price IS NULL OR sale_price <= price/);
});

test('order line totals must match unit price multiplied by quantity', () => {
  assert.match(migration, /order_items_line_total_matches_quantity_price/);
  assert.match(migration, /line_total = round\(unit_price \* quantity, 2\)/);
});


test('customer cannot release inventory after a Stripe Checkout session exists', async () => {
  const releaseGuard = await readFile(
    new URL('../supabase/migrations/20260929135500_lock_order_reservation_release_after_checkout.sql', import.meta.url),
    'utf8',
  );
  assert.match(releaseGuard, /provider_checkout_session_id/);
  assert.match(releaseGuard, /p\.status='PENDING'/);
  assert.match(releaseGuard, /Checkout is already in progress/);
  assert.match(releaseGuard, /process|Stripe must confirm failure or expiry/i);
});

test('paid product orders preserve payment state when delivery fails and can be redispatched', async () => {
  const lifecycle = await readFile(
    new URL('../supabase/migrations/20260930084000_restore_paid_order_and_job_integrity.sql', import.meta.url),
    'utf8',
  );
  assert.match(lifecycle, /Paid Everest orders require support cancellation/);
  assert.match(lifecycle, /p_status in \('FAILED','CANCELLED'\)/);
  assert.match(lifecycle, /payment_status='SUCCEEDED'/);
  assert.match(lifecycle, /status='READY_FOR_PICKUP'/);
  assert.match(lifecycle, /existing_status not in \('PENDING','READY_FOR_PICKUP','FAILED','CANCELLED'\)/);
  assert.doesNotMatch(
    lifecycle.slice(lifecycle.indexOf('create or replace function public.update_delivery_status'),lifecycle.indexOf('create or replace function public.request_delivery_for_order')),
    /set status='CANCELLED'/
  );
});

test('cart changes cannot cancel an order once Stripe Checkout exists', async () => {
  const hardening = await readFile(
    new URL('../supabase/migrations/20260930085500_harden_cart_and_inventory_reactivation.sql', import.meta.url),
    'utf8',
  );
  const cartStart = hardening.indexOf('create or replace function public.set_my_cart_item_v2');
  const inventoryStart = hardening.indexOf('create or replace function public.set_product_inventory');
  const cart = hardening.slice(cartStart, inventoryStart);
  assert.match(cart, /provider_checkout_session_id/);
  assert.match(cart, /Checkout is already in progress/);
  assert.ok(cart.indexOf('provider_checkout_session_id') < cart.indexOf("update public.orders\n    set status='CANCELLED'"));
  assert.match(cart, /public\.is_business_payment_ready\(p\.business_id\)/);
});

test('inventory reactivation cannot bypass the authoritative product publication gate', async () => {
  const hardening = await readFile(
    new URL('../supabase/migrations/20260930085500_harden_cart_and_inventory_reactivation.sql', import.meta.url),
    'utf8',
  );
  assert.match(hardening, /perform public\.set_product_status\(p_product_id,'ACTIVE'\)/);
  assert.match(hardening, /has_business_permission\(bid,'CATALOG_MANAGE'\)/);
  assert.doesNotMatch(hardening, /when status='OUT_OF_STOCK'[\s\S]{0,160}then 'ACTIVE'/);
});

test('security suite remains wired to the commerce integrity test', () => {
  assert.match(packageJson.scripts['test:security'], /tests\/commerce-financial-integrity\.test\.mjs/);
});
