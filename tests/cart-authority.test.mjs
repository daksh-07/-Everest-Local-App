/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');

async function readCartHardeningMigration() {
  const files = (await readdir(migrationsDir)).filter((file) => /\.sql$/i.test(file));
  const matches = files.filter((file) => file.includes('harden_cart_checkout_binding'));
  assert.equal(matches.length, 1, 'cart checkout binding migration must exist exactly once');
  return readFile(join(migrationsDir, matches[0]), 'utf8');
}

test('cart checkout binding cannot point at another customer order', async () => {
  const migration = await readCartHardeningMigration();
  assert.match(migration, /drop\s+policy\s+if\s+exists\s+carts_owner/i);
  assert.match(migration, /create\s+policy\s+carts_owner/i);
  assert.match(migration, /with\s+check\s*\([\s\S]*active_checkout_order_id\s+is\s+null/i);
  assert.match(migration, /from\s+public\.orders\s+o[\s\S]*o\.id\s*=\s*active_checkout_order_id[\s\S]*o\.customer_id\s*=\s*\(select\s+auth\.uid\(\)\)/i);
});

test('cart checkout binding remains server-authoritative for admins', async () => {
  const migration = await readCartHardeningMigration();
  assert.match(migration, /public\.is_admin\(\)/i);
  assert.match(migration, /using\s*\([\s\S]*customer_id\s*=\s*\(select\s+auth\.uid\(\)\)[\s\S]*public\.is_admin\(\)/i);
});
