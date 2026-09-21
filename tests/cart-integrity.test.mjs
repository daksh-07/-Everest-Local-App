import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile('supabase/migrations/20260921074800_cart_quantity_integrity.sql', 'utf8');

test('cart quantities are database-constrained to positive integers', () => {
  assert.match(migration, /alter\s+table\s+public\.cart_items/i);
  assert.match(migration, /add\s+constraint\s+cart_items_quantity_positive/i);
  assert.match(migration, /check\s*\(\s*quantity\s*>\s*0\s*\)/i);
});

test('cart quantity integrity does not replace server-authoritative checkout validation', async () => {
  const commerce = await readFile('lib/commerce.ts', 'utf8');
  const checkoutCallStart = commerce.search(/supabase\.functions\.invoke\(['"]checkout['"]/i);
  assert.notEqual(checkoutCallStart, -1);
  const checkoutCall = commerce.slice(checkoutCallStart, commerce.indexOf(');', checkoutCallStart) + 2);
  assert.match(checkoutCall, /delivery_method\s*:/i);
  assert.doesNotMatch(checkoutCall, /price\s*:/i);
});
