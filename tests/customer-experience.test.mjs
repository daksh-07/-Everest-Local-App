import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('public product discovery does not depend on private inventory rows', async () => {
  const [explore, product] = await Promise.all([
    readFile('app/search.tsx', 'utf8'),
    readFile('app/product.tsx', 'utf8'),
  ]);
  assert.doesNotMatch(explore, /inventory\s*\(/);
  assert.doesNotMatch(product, /inventory\s*\(/);
  assert.match(explore, /STOCK CONFIRMED AT CHECKOUT/);
  assert.match(product, /Stock confirmed at checkout/);
});

test('primary customer surfaces share the same persistent navigation', async () => {
  const paths = ['app/index.tsx', 'app/search.tsx', 'app/activity.tsx', 'app/messages.tsx', 'app/account.tsx'];
  const sources = await Promise.all(paths.map(path => readFile(path, 'utf8')));
  for (const source of sources) assert.match(source, /<CustomerTabBar active=/);
  const tabBar = await readFile('components/CustomerTabBar.tsx', 'utf8');
  for (const destination of ['Home', 'Explore', 'Activity', 'Messages', 'Account']) {
    assert.match(tabBar, new RegExp(`label:'${destination}'`));
  }
});

test('first-use UX preserves accessible motion and mobile input safeguards', async () => {
  const [auth, installPrompt, search] = await Promise.all([
    readFile('app/auth.tsx', 'utf8'),
    readFile('components/PwaInstallPrompt.tsx', 'utf8'),
    readFile('app/search.tsx', 'utf8'),
  ]);
  assert.match(auth, /AccessibilityInfo\.isReduceMotionEnabled/);
  assert.match(auth, /fontSize: 16/);
  assert.match(installPrompt, /if\(visits<2\)return/);
  assert.doesNotMatch(search, /autoFocus/);
  assert.match(search, /fontSize:16/);
});
