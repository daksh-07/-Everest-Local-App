import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { checkoutReturnUrls } from '../supabase/functions/_shared/checkout-redirects.ts';

test('product and service checkout return to existing routes without claiming payment', async () => {
  for (const [kind, route, param] of [['order', 'orders', 'order_id'], ['booking', 'bookings', 'booking_id']]) {
    const urls = checkoutReturnUrls('https://marketplace.example', kind, 'id/&?paid=true');
    await access(`app/${route}.tsx`);
    for (const value of Object.values(urls)) {
      const url = new URL(value);
      assert.equal(url.origin, 'https://marketplace.example');
      assert.equal(url.pathname, `/${route}`);
      assert.deepEqual([...url.searchParams], [[param, 'id/&?paid=true']]);
    }
  }
});

test('checkout fails closed for missing or unsafe server return configuration', () => {
  for (const origin of [undefined, '', ' ', 'http://marketplace.example', '//evil.example',
    'javascript:alert(1)', 'everestlocal://orders', 'https://user:password@marketplace.example',
    'https://marketplace.example/other', 'https://marketplace.example/?next=evil',
    'https://marketplace.example/#fragment']) {
    assert.throws(() => checkoutReturnUrls(origin, 'order', 'id'));
  }
});

test('both checkout endpoints validate server return configuration before creating financial records', async () => {
  for (const [fn, rpc] of [['checkout', 'create_order_from_cart'], ['service-checkout', 'create_service_payment']]) {
    const source = await readFile(`supabase/functions/${fn}/index.ts`, 'utf8');
    const validation = source.indexOf("'configuration-check'");
    const mutation = source.indexOf(`rpc('${rpc}'`);
    assert.ok(validation > 0 && mutation > validation);
    assert.match(source, /Deno\.env\.get\('CHECKOUT_APP_ORIGIN'\)/);
    assert.doesNotMatch(source, /everestlocal:\/\/(?:order|booking)\//);
    assert.match(source, /\.\.\.checkoutReturnUrls\(appOrigin/);
  }
});
