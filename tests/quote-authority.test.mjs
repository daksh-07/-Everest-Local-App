/* global process */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const migrationPath = join(root, 'supabase', 'migrations', '20260920151631_quote_mutation_authority_hardening.sql');

const migration = await readFile(migrationPath, 'utf8');

test('quote creation is not exposed as a direct client insert path', () => {
  assert.match(migration, /drop\s+policy\s+if\s+exists\s+quotes_business_insert\s+on\s+public\.quotes/i);
  assert.match(migration, /revoke\s+insert,\s*update,\s*delete\s+on\s+table\s+public\.quotes\s+from\s+anon,\s*authenticated/i);
});

test('quote acceptance remains an authenticated authoritative RPC', () => {
  assert.match(migration, /revoke\s+execute\s+on\s+function\s+public\.accept_quote\(uuid\)\s+from\s+public,\s*anon,\s*authenticated/i);
  assert.match(migration, /grant\s+execute\s+on\s+function\s+public\.accept_quote\(uuid\)\s+to\s+authenticated/i);
});

test('quote sending remains an authenticated authoritative RPC', () => {
  assert.match(migration, /revoke\s+execute\s+on\s+function\s+public\.send_quote\(uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time\s+without\s+time\s+zone,timestamp\s+with\s+time\s+zone,text\)\s+from\s+public,\s*anon,\s*authenticated/i);
  assert.match(migration, /grant\s+execute\s+on\s+function\s+public\.send_quote\(uuid,uuid,text,jsonb,numeric,numeric,numeric,date,time\s+without\s+time\s+zone,timestamp\s+with\s+time\s+zone,text\)\s+to\s+authenticated/i);
});
