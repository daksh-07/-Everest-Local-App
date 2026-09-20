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

const allMigrationFiles = (await walk(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
const migrationFiles = allMigrationFiles.filter((file) => /^\d{3}_.+\.sql$/i.test(file.split('/').at(-1)));
const migrationText = (await Promise.all(allMigrationFiles.map((file) => readFile(file, 'utf8')))).join('\n');
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

test('every SECURITY DEFINER function pins search_path to a safe explicit value', () => {
  const blocks = migrationText.split(/(?=create\s+(?:or\s+replace\s+)?function\b)/i).filter((block) => /security\s+definer/i.test(block));
  const missing = blocks.filter((block) => !/set\s+search_path\s*(?:=|to)\s*(?:public|''|'public')/i.test(block));
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
  const commerceText = await readFile(join(libDir, 'commerce.ts'), 'utf8');
  const checkoutStart = commerceText.indexOf('export async function checkout');
  const checkoutEnd = commerceText.indexOf('export async function myOrders', checkoutStart);
  assert.ok(checkoutStart >= 0, 'checkout function must exist');
  assert.ok(checkoutEnd > checkoutStart, 'checkout function boundary must exist');
  const body = commerceText.slice(checkoutStart, checkoutEnd);
  const invokeStart = body.indexOf('supabase.functions.invoke');
  const invokeEnd = body.indexOf(');', invokeStart);
  assert.ok(invokeStart >= 0, 'checkout invocation must exist');
  assert.ok(invokeEnd > invokeStart, 'checkout invocation boundary must exist');
  const invocation = body.slice(invokeStart, invokeEnd);
  assert.doesNotMatch(invocation, /(?:price|total|inventory|stock|delivery_fee|marketplace_fee|tax)\s*:/i);
  assert.match(invocation, /delivery_method\s*:/i);
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

test('native release configuration has the required scheme and platform identifiers', async () => {
  const appConfig = JSON.parse(await readFile(join(root, 'app.json'), 'utf8')).expo;
  assert.equal(appConfig.scheme, 'everestlocal');
  assert.match(appConfig.ios?.bundleIdentifier ?? '', /^[a-z][a-z0-9]*(?:\.[a-z0-9]+)+$/i);
  assert.equal(appConfig.ios?.bundleIdentifier, appConfig.android?.package);
});

test('EAS release profiles are present and production auto-increments versions', async () => {
  const eas = JSON.parse(await readFile(join(root, 'eas.json'), 'utf8'));
  assert.equal(eas.build?.preview?.distribution, 'internal');
  assert.equal(eas.build?.production?.autoIncrement, true);
});


test('business membership cannot be self-assigned through the Data API', () => {
  assert.match(migrationText, /create\s+policy\s+business_members_admin_insert[\s\S]{0,400}with\s+check\s*\(public\.is_admin\(\)\)/i);
  assert.match(migrationText, /revoke\s+insert,\s*update,\s*delete\s+on\s+public\.business_members\s+from\s+anon,\s*authenticated/i);
});

test('business and driver role elevation is server-authorized', () => {
  const businessCreate = migrationText
    .split(/(?=create\s+(?:or\s+replace\s+)?function\b)/i)
    .filter((block) => /create_business_profile\s*\(/i.test(block)).at(-1);
  assert.ok(businessCreate);
  assert.doesNotMatch(businessCreate, /update\s+public\.profiles\s+set\s+role\s*=\s*['"]BUSINESS['"]/i);

  const driverApproval = migrationText
    .split(/(?=create\s+(?:or\s+replace\s+)?function\b)/i)
    .filter((block) => /admin_set_driver_application\s*\(/i.test(block)).at(-1);
  assert.ok(driverApproval);
  assert.match(driverApproval, /is_admin\(\)/i);
  assert.doesNotMatch(driverApproval, /role\s*=\s*['"]DELIVERY_DRIVER['"]/i);
});

test('new auth RPCs do not retain implicit PUBLIC execution', () => {
  for (const signature of [
    'create_driver_application',
    'admin_set_driver_application',
    'get_my_access_context',
    'create_business_profile',
    'admin_set_verification',
    'save_driver_application',
    'submit_driver_application',
    'save_driver_vehicle_details',
    'save_driver_verification_details',
    'register_driver_document',
    'admin_set_driver_verification',
    'admin_set_driver_document_status',
    'admin_set_driver_vehicle_verification',
    'admin_set_driver_credential_details',
  ]) {
    assert.match(
      migrationText,
      new RegExp('revoke\\s+execute\\s+on\\s+function\\s+public\\.' + signature + '[\\s\\S]{0,500}from\\s+public,\\s*anon', 'i'),
    );
  }
});

test('business and driver entry routes are protected by the root router', async () => {
  const layout = await readFile(join(appDir, '_layout.tsx'), 'utf8');
  assert.match(layout, /business-onboarding/);
  assert.match(layout, /business-dashboard/);
  assert.match(layout, /driver-onboarding/);
  assert.match(layout, /driver-dashboard/);
  assert.match(layout, /delivery/);
  assert.match(layout, /driver-verification/);
});

test('mobile source does not reference trusted server-only credential variables', () => {
  assert.doesNotMatch(clientText, /SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|AI_API_KEY/);
});


test('driver verification is credential-based, not profile-role based', () => {
  const functionPattern = /create\s+(?:or\s+replace\s+)?function\s+public\.driver_is_operational\s*\([\s\S]*?\n\$\$\s*;/i;
  const operational = migrationText.match(functionPattern)?.[0];
  assert.ok(operational, 'driver_is_operational function must exist');
  assert.match(operational, /a\.status\s*=\s*'APPROVED'/i);
  assert.match(operational, /v\.licence_status\s*=\s*'VERIFIED'/i);
  assert.match(operational, /v\.registration_status\s*=\s*'VERIFIED'/i);
  assert.match(operational, /dv\.status\s*=\s*'VERIFIED'/i);
  assert.match(operational, /registration_expiry\s+is\s+not\s+null/i);
  assert.match(operational, /licence_front/i);
});

test('sensitive driver Data API writes are revoked', () => {
  assert.match(migrationText, /revoke\s+all\s+on\s+public\.driver_applications,public\.driver_vehicles,public\.driver_documents,public\.driver_verifications,public\.driver_status_history,public\.driver_verification_requirements\s+from\s+public,\s*anon,\s*authenticated/i);
  assert.match(migrationText, /revoke\s+insert,update,delete,truncate,references,trigger\s+on\s+public\.profiles/i);
});

test('driver storage is private and owner/admin scoped', () => {
  assert.match(migrationText, /values\('driver-verification','driver-verification',false/i);
  assert.match(migrationText, /driver_verification_owner_upload[\s\S]{0,500}storage\.foldername\(name\).*auth\.uid/i);
  assert.match(migrationText, /driver_verification_owner_read[\s\S]{0,500}owner_id.*is_admin/i);
  assert.match(migrationText, /drop policy if exists driver_verification_owner_update/i);
  assert.match(migrationText, /drop policy if exists driver_verification_owner_delete/i);
  assert.doesNotMatch(clientText, /getPublicUrl\s*\([^)]*driver-verification/i);
});

test('driver delivery authorization checks active verification server-side', () => {
  const deliveryBlocks = migrationText.split(/(?=create\s+(?:or\s+replace\s+)?function\b)/i).filter(block => /assign_delivery_driver\s*\(|update_delivery_status\s*\(/i.test(block));
  assert.ok(deliveryBlocks.length >= 2);
  assert.ok(deliveryBlocks.some(block => /driver_is_operational/i.test(block)));
  assert.match(migrationText, /accept_delivery_assignment\s*\([\s\S]{0,1600}driver_is_operational/i);
  assert.match(migrationText, /Accept the delivery before pickup/i);
  assert.ok(deliveryBlocks.some(block => /not exists\(select 1 from public\.delivery_assignments/i.test(block)));
});

test('Ask Everest does not query driver documents', async () => {
  const assistant = await readFile(join(root, 'supabase', 'functions', 'assistant', 'index.ts'), 'utf8');
  assert.doesNotMatch(assistant, /from\(['"]driver_documents['"]\)/i);
  assert.doesNotMatch(assistant, /storage\.from\(['"]driver-verification['"]\)/i);
  assert.match(assistant, /driver_applications/i);
  assert.doesNotMatch(assistant, /licence_number|insurance_policy_reference|storage_path/i);
});
