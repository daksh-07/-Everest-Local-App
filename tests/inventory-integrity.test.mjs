import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile('supabase/migrations/20260921104500_inventory_reservation_integrity.sql', 'utf8');

test('inventory reservations cannot be negative or exceed physical stock', () => {
  assert.match(migration, /alter\s+table\s+public\.inventory/i);
  assert.match(migration, /add\s+constraint\s+inventory_reserved_quantity_nonnegative/i);
  assert.match(migration, /check\s*\(\s*reserved_quantity\s*>=\s*0\s*\)/i);
  assert.match(migration, /add\s+constraint\s+inventory_reserved_quantity_within_stock/i);
  assert.match(migration, /check\s*\(\s*reserved_quantity\s*<=\s*stock_quantity\s*\)/i);
});

test('checkout and inventory adjustment remain server-authoritative', async () => {
  const commerce = await readFile('lib/commerce.ts', 'utf8');
  assert.match(commerce, /supabase\.functions\.invoke\(['"]checkout['"]/i);
  // Stock may be read for honest UI limits, but never written by this client.
  assert.doesNotMatch(commerce, /from\(['"](?:inventory|product_variants)['"]\)\.(?:update|insert|upsert)/i);
  assert.doesNotMatch(commerce, /p_(?:stock|reserved|available)_quantity\s*:/i);
  assert.match(commerce, /supabase\.rpc\(['"]set_my_cart_item_v2['"]/);
});
