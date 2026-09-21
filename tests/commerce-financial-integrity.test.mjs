import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

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

test('security suite remains wired to the commerce integrity test', () => {
  assert.match(packageJson.scripts['test:security'], /tests\/commerce-financial-integrity\.test\.mjs/);
});
