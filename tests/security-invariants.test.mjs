/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const migrationsDir = join(root, 'supabase', 'migrations');
const appDir = join(root, 'app');
const libDir = join(root, 'lib');

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const migrationFiles = (await walk(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
const migrationText = (await Promise.all(migrationFiles.map((file) => readFile(file, 'utf8')))).join('\n');
const appAndLibFiles = (await Promise.all([walk(appDir), walk(libDir)])).flat();
const clientText = (await Promise.all(appAndLibFiles.map((file) => readFile(file, 'utf8')))).join('\n');

const tableNames = [...migrationText.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi)]
  .map((match) => match[1].toLowerCase());

test('migration sequence is contiguous', () => {
  const versions = migrationFiles.map((file) => Number(file.split('/').at(-1).slice(0, 3)));
  assert.ok(versions.length > 0);
  versions.forEach((version, index) => assert.equal(version, index + 1));
});

test('every public table is explicitly RLS-enabled', () => {
  const missing = [...new Set(tableNames)].filter(
    (table) => !new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i').test(migrationText),
  );
  assert.deepEqual(missing, []);
});

test('every SECURITY DEFINER function pins search_path to public', () => {
  const blocks = migrationText.split(/(?=create\s+(?:or\s+replace\s+)?function\b)/i).filter((block) => /security\s+definer/i.test(block));
  const missing = blocks.filter((block) => !/set\s+search_path\s*=\s*public/i.test(block));
  assert.equal(missing.length, 0);
});

test('client code does not write authoritative payment/order/delivery records directly', () => {
  const authoritativeTables = ['payments', 'orders', 'deliveries', 'delivery_assignments'];
  const forbidden = authoritativeTables.flatMap((table) => [
    new RegExp(`from\\(['"]${table}['"]\\)\\.(?:insert|update|upsert|delete)`, 'i'),
    new RegExp(`from\\(['"]${table}['"]\\)\\s*\\.\\s*(?:insert|update|upsert|delete)`, 'i'),
  ]);
  const matches = forbidden.filter((pattern) => pattern.test(clientText));
  assert.deepEqual(matches, []);
});

test('client code never attempts to write the authenticated profile role', () => {
  const profileWritePatterns = [
    /from\(['"]profiles['"]\)[\s\S]{0,300}\.(?:insert|update|upsert)\s*\(/i,
    /profiles[\s\S]{0,300}\.(?:insert|update|upsert)\s*\([\s\S]{0,300}\brole\s*:/i,
  ];
  assert.equal(profileWritePatterns.some((pattern) => pattern.test(clientText)), false);
});

test('checkout client sends only server-authoritative checkout inputs', async () => {
  const commerceFiles = appAndLibFiles.filter((file) => file.endsWith('commerce.ts'));
  const commerceText = (await Promise.all(commerceFiles.map((file) => readFile(file, 'utf8')))).join('\n');
  const match = commerceText.match(/export async function checkout[\s\S]*?\n\}/);
  assert.ok(match, 'checkout function must exist');
  const body = match[0];
  assert.doesNotMatch(body, /(?:price|total|inventory|stock|delivery_fee|marketplace_fee|tax)\s*:/i);
  assert.match(body, /delivery_method\s*:/i);
});

test('server-side cart checkout requires an authenticated caller', () => {
  const checkoutMigrations = migrationText
    .split(/(?=create\s+(?:or\s+replace\s+)?function\b)/i)
    .filter((block) => /create_order_from_cart\s*\(/i.test(block));
  assert.ok(checkoutMigrations.length > 0);
  assert.ok(checkoutMigrations.some((block) => /auth\.uid\(\)/i.test(block)));
});

test('repository contains no obvious committed private-key or Stripe-secret literal', async () => {
  const sourceFiles = (await walk(root)).filter((file) => !file.includes('/.git/') && !file.includes('/node_modules/'));
  const text = (await Promise.all(sourceFiles.map(async (file) => {
    try { return await readFile(file, 'utf8'); } catch { return ''; }
  }))).join('\n');
  assert.doesNotMatch(text, /sk_(?:live|test)_[A-Za-z0-9]+/);
  assert.doesNotMatch(text, /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/);
});
