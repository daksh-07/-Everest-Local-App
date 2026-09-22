import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const migrationsDir = join(process.cwd(), 'supabase', 'migrations');

async function readMigrations() {
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  return Promise.all(files.map((file) => readFile(join(migrationsDir, file), 'utf8')));
}

test('trigger-only SECURITY DEFINER guards are not exposed through RPC execution', async () => {
  const migrationText = (await readMigrations()).join('\n');
  for (const functionName of [
    'guard_delivery_assignment_provider_conflict',
    'guard_service_dispatch_provider_conflict',
  ]) {
    assert.match(
      migrationText,
      new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${functionName}\\(\\)\\s+from\\s+public,\\s*anon,\\s*authenticated`, 'i'),
      `${functionName} must not be callable through the Data API`,
    );
  }
});
