/* global localStorage, Buffer, URL, document, innerWidth, setTimeout */
// Browser interaction tests against the actual routes. Every Supabase/Stripe
// request is a deterministic fixture. No real payment or backend is exercised.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const pw = await import(
  process.env.PLAYWRIGHT_MODULE ||
    '/workspace/shared/everest-tools/node_modules/playwright/index.mjs'
);
const engine = process.env.EVEREST_QA_BROWSER || 'chromium';
const browser = await pw[engine].launch(
  engine === 'chromium'
    ? {
        executablePath: process.env.EVEREST_BROWSER_PATH || '/usr/bin/chromium',
        args: ['--no-sandbox'],
      }
    : {},
);
const base = process.env.EVEREST_PREVIEW_URL || 'http://localhost:4173';
const out = process.env.EVEREST_QA_ARTIFACTS || '/tmp/everest-commerce';
await fs.mkdir(out, { recursive: true });
const report = [];
const uid = '11111111-1111-4111-8111-111111111111',
  biz = '33333333-3333-4333-8333-333333333333',
  pid = '77777777-7777-4777-8777-777777777777',
  oid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  vid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user = {
  id: uid,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'fixture@example.invalid',
  app_metadata: {},
  user_metadata: {},
};
const session = {
  access_token: `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, exp: 4102444800 })).toString('base64url')}.fixture`,
  refresh_token: 'fixture',
  expires_at: 4102444800,
  token_type: 'bearer',
  user,
};
const merchant = {
  id: biz,
  name: 'North Melbourne Home & Garden',
  status: 'ACTIVE',
  verification_status: 'VERIFIED',
  accepts_orders: true,
  address_line: '14 Errol Street',
  suburb: 'North Melbourne',
  city: 'Melbourne',
  state: 'VIC',
  postcode: '3051',
};
const layouts=(process.env.EVEREST_QA_LAYOUTS||'320:LIGHT,390:DARK,1280:LIGHT,1280:DARK').split(',').map(v=>{const [w,t]=v.split(':');return [Number(w),t]});
for (const [width, theme] of layouts) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    hasTouch: width < 768,
    isMobile: width < 768,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(
    ({ theme, session }) => {
      localStorage.setItem('everest-local-theme', theme);
      localStorage.setItem(
        'sb-bmwbljefnamvjnmuvkvv-auth-token',
        JSON.stringify(session),
      );
    },
    { theme, session },
  );
  const state = {
    authenticated: true,
    qty: 0,
    pending: false,
    status: 'PENDING',
    payment: 'PENDING',
    checkoutCalls: 0,
    checkoutError: false,
    orderError: false,
    business: false,
    manage: true,
    canView: true,
    updates: [],
    cartWrites: [],
  };
  const variant = () => ({
    id: vid,
    product_id: pid,
    title: 'Standard',
    option_values: { size: 'Standard' },
    price: null,
    stock_quantity: 3,
    reserved_quantity: state.pending ? state.qty : 0,
    available: true,
    sort_order: 0,
  });
  const product = () => ({
    id: pid,
    business_id: biz,
    name: 'Ceramic-safe wash kit',
    price: 59.95,
    sale_price: 49.95,
    status: 'ACTIVE',
    description: 'Ceramic-safe wash and microfibre towels.',
    short_description: 'Local care, made simple.',
    condition: 'NEW',
    brand: 'Local care',
    key_features: ['pH-neutral formula'],
    tags: [],
    attributes: {},
    fulfillment: 'PICKUP_OR_DELIVERY',
    track_stock: true,
    made_to_order: false,
    pickup_available: true,
    delivery_eligible: true,
    shipping_available: false,
    businesses: merchant,
    inventory: {
      stock_quantity: 10,
      reserved_quantity: 0,
      low_stock_threshold: 2,
    },
    product_images: [],
    product_variants: [
      variant(),
      {
        ...variant(),
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        title: 'Large',
        stock_quantity: 0,
        available: false,
        sort_order: 1,
      },
    ],
  });
  const order = () => ({
    id: oid,
    order_number: 'EV-1048',
    customer_id: uid,
    business_id: biz,
    status: state.status,
    payment_status: state.payment,
    subtotal: 49.95 * state.qty,
    delivery_fee: 0,
    tax: 0,
    total: 49.95 * state.qty,
    delivery_method: 'PICKUP',
    delivery_address: null,
    created_at: '2026-10-17T05:00:00Z',
    updated_at: '2026-10-17T06:00:00Z',
    businesses: merchant,
    order_items: [
      {
        id: 'line1',
        product_id: pid,
        product_name: 'Ceramic-safe wash kit',
        quantity: state.qty,
        unit_price: 49.95,
        line_total: 49.95 * state.qty,
        variant_snapshot: { title: 'Standard' },
      },
    ],
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.error(e.stack||e.message);
  });
  if(process.env.EVEREST_QA_VERBOSE==='1')page.on('requestfailed',req=>console.log('Request failed',req.url(),req.failure()));
  await page.routeWebSocket('**/realtime/**', (ws) => ws.close());
  await page.route(/open-meteo|nominatim|bigdatacloud/, (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  await page.route('https://checkout.stripe.com/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: `<title>Fixture checkout</title><h1>Fixture hosted checkout — no payment taken</h1><a href="${base}/orders?order_id=${oid}&checkout=cancelled">Cancel fixture checkout</a>`,
    }),
  );
  await page.route('**/*.supabase.co/**', async (r) => {
    const req = r.request(),
      url = new URL(req.url()),
      table = url.pathname.split('/').at(-1);
    const body = () => req.postDataJSON();
    const reply = (options) =>
      r.fulfill({
        ...options,
        headers: {
          'access-control-allow-origin': base,
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers':
            req.headers()['access-control-request-headers'] ||
            'authorization,apikey,content-type,x-client-info,idempotency-key',
        },
      });
    if (req.method() === 'OPTIONS') return reply({ status: 200, body: '' });
    if (url.pathname.includes('/auth/'))
      return reply({
        status: state.authenticated ? 200 : 401,
        json: state.authenticated
          ? user
          : { message: 'Fixture expired session' },
      });
    if (url.pathname.includes('/functions/v1/checkout')) {
      state.checkoutCalls++;
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (state.checkoutError) {
        state.checkoutError = false;
        return reply({
          status: 503,
          json: { error: 'Fixture network interruption' },
        });
      }
      state.pending = true;
      return reply({
        json: {
          orderId: oid,
          orderNumber: 'EV-1048',
          total: state.qty * 49.95,
          reused: state.checkoutCalls > 1,
          checkoutUrl: 'https://checkout.stripe.com/c/pay/fixture',
          checkoutState: 'OPEN',
        },
      });
    }
    if (url.pathname.includes('/rpc/')) {
      if (table === 'get_my_workspace_context')
        return reply({
          json: {
            mode: state.business ? 'BUSINESS' : 'CUSTOMER',
            active_business_id: state.business ? biz : null,
            businesses: state.business
              ? [
                  {
                    ...merchant,
                    member_role: 'OWNER',
                    can_view_orders: state.canView,
                    can_manage_orders: state.manage,
                    can_view_finance: false,
                  },
                ]
              : [],
          },
        });
      if (table === 'get_my_access_context')
        return reply({
          json: {
            profile_role: state.business ? 'BUSINESS' : 'CUSTOMER',
            is_business_member: state.business,
            is_verified_business: state.business,
            business_id: state.business ? biz : null,
            business_name: merchant.name,
          },
        });
      if (table === 'get_or_create_cart')
        return reply(
          state.authenticated
            ? { json: 'cart1' }
            : { status: 401, json: { message: 'Authentication required' } },
        );
      if (table === 'set_my_cart_item_v2') {
        state.cartWrites.push(body());
        state.qty = body().p_quantity;
        return reply({ json: null });
      }
      if (
        table === 'update_order_status' ||
        table === 'complete_pickup_order'
      ) {
        state.updates.push({ table, ...body() });
        assert.equal(state.manage, true);
        state.status =
          table === 'complete_pickup_order' ? 'COMPLETED' : body().p_next;
        return reply({ json: true });
      }
      return reply({ json: [] });
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD')
      return reply({
        status: 403,
        json: { message: 'Unapproved fixture write' },
      });
    let rows = [];
    if (table === 'profiles')
      rows = [
        {
          ...user,
          full_name: 'Sam Taylor',
          role: state.business ? 'BUSINESS' : 'CUSTOMER',
          country: 'AU',
        },
      ];
    if (table === 'products') rows = [product()];
    if (table === 'businesses') rows = [merchant];
    if (table === 'carts')
      rows = [{ checkout: state.pending ? order() : null }];
    if (table === 'cart_items')
      rows = state.qty
        ? [
            {
              id: 'ci1',
              product_id: pid,
              variant_id: vid,
              quantity: state.qty,
              products: product(),
              product_variants: variant(),
            },
          ]
        : [];
    if (table === 'orders') {
      if (
        state.orderError &&
        !url.searchParams.get('select')?.includes('order_items')
      ) {
        return reply({
          status: 503,
          json: { message: 'Fixture orders failure' },
        });
      }
      rows = state.qty ? [order()] : [];
    }
    const single = req.headers().accept?.includes('vnd.pgrst.object');
    return reply({ json: single ? (rows[0] ?? null) : rows });
  });
  // Hard navigation discards a browsing context, unlike in-app route changes.
  // Drain fixture responses first so WebKit does not report their cancellation
  // as a cross-origin error in the context being destroyed.
  const goto = async(path) => {await page.waitForLoadState('networkidle');await page.goto(base + path, { waitUntil: 'networkidle' })};
  const reload = async()=>{await page.waitForLoadState('networkidle');await page.reload({waitUntil:'networkidle'})};
  const snap = async (name) => {
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await page.screenshot({
      path: `${out}/${name}-${theme.toLowerCase()}-${width}.png`,
      fullPage: false,
    });
  };
  const record = (name) => {
    report.push({
      browser: engine,
      width,
      theme,
      scenario: name,
      passed: true,
    });
    console.log(width, theme, name);
  };
  await goto('/product?id=' + pid);
  await page
    .getByRole('button', { name: 'Increase quantity', exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole('radio').filter({ hasText: 'Large' }).isDisabled(),
    true,
  );
  const increase = page.getByRole('button', {
    name: 'Increase quantity',
    exact: true,
  });
  await increase.click();
  await increase.click();
  assert.equal(await increase.isDisabled(), true);
  record('variant sold out and authoritative quantity cap');
  await snap('product');
  await page.getByRole('button', { name: /Add.*cart/i }).click();
  await page.waitForFunction(() =>
    document.body.innerText.toLowerCase().includes('added to cart'),
  );
  assert.equal(state.qty, 3);
  record('add selected variant and quantity');
  await goto('/cart');
  await page
    .getByRole('button', { name: 'Decrease quantity of Ceramic-safe wash kit' })
    .click();
  await page.getByText('$99.90', { exact: true }).first().waitFor();
  assert.equal(state.qty, 2);
  record('cart quantity and totals');
  const proceed = page.getByRole('button', {
    name: 'Continue to secure checkout',
    exact: true,
  });
  await page.getByRole('radio', { name: /Everest Delivery/ }).click();
  assert.equal(await proceed.isDisabled(), true);
  await page
    .getByRole('textbox', { name: 'Delivery or shipping address' })
    .fill('14 Errol Street, North Melbourne VIC 3051');
  assert.equal(await proceed.isDisabled(), false);
  await page.getByRole('radio', { name: /Pickup/ }).click();
  record('fulfilment requires address');
  await snap('cart');
  state.checkoutError = true;
  await proceed.click();
  await page
    .getByText(
      'Checkout could not be opened. Try again, or check Orders before starting another payment.',
      { exact: true },
    )
    .waitFor();
  record('checkout network error remains recoverable');
  await proceed.evaluate((el) => {
    el.click();
    el.click();
  });
  await page.waitForURL('https://checkout.stripe.com/**');
  assert.equal(state.checkoutCalls, 2);
  record('duplicate taps issue one checkout request');
  await page.getByRole('link', { name: 'Cancel fixture checkout' }).click();
  await page.getByText('Checkout closed', { exact: true }).waitFor();
  await page
    .getByText('Awaiting payment confirmation', { exact: true })
    .waitFor();
  assert.equal(state.payment, 'PENDING');
  await snap('payment-return');
  record('cancellation returns to correct order without claiming paid');
  await goto('/cart');
  await page.getByRole('button', { name: 'Resume secure checkout' }).waitFor();
  assert.equal(
    await page
      .getByRole('button', {
        name: 'Increase quantity of Ceramic-safe wash kit',
      })
      .isDisabled(),
    true,
  );
  record('pending checkout locks cart and can resume reserved stock');
  await goto('/orders?order_id=' + oid + '&checkout=success');
  await page
    .getByText('Awaiting payment confirmation', { exact: true })
    .waitFor();
  record('success URL alone does not mark paid');
  state.payment = 'SUCCEEDED';
  state.status = 'PAYMENT_CONFIRMED';
  state.pending = false;
  await page
    .getByRole('button', { name: 'Refresh orders', exact: true })
    .click();
  await page.getByText('Payment confirmed', { exact: true }).waitFor();
  await page.getByText('Price breakdown', { exact: true }).waitFor();
  record('server payment refresh and persisted order details');
  await page.waitForLoadState('networkidle');
  state.orderError = true;
  await page
    .getByRole('button', { name: 'Refresh orders', exact: true })
    .click();
  await page
    .getByText(/could not refresh your orders/)
    .first()
    .waitFor();
  state.orderError = false;
  await page
    .getByRole('button', { name: 'Refresh orders', exact: true })
    .click();
  record('failed order loading retry');
  state.business = true;
  await goto('/business-orders');
  await page
    .getByRole('button', { name: 'Accept order', exact: true })
    .waitFor();
  for (const label of [
    'Accept order',
    'Start preparing',
    'Mark ready for pickup',
    'Mark collected',
  ]) {
    const before = state.updates.length;
    await page.getByRole('button', { name: label, exact: true }).click();
    assert.equal(state.updates.length, before);
    await page.getByRole('button', { name: label, exact: true }).last().click();
    await page.waitForFunction(
      () =>
        !document.body.innerText.includes(
          'Confirm the order details before updating its fulfilment status.',
        ),
    );
    assert.equal(state.updates.length, before + 1);
  }
  assert.equal(state.status, 'COMPLETED');
  assert.equal(state.updates.at(-1).table, 'complete_pickup_order');
  await page.getByRole('tab', { name: /History/ }).click();
  await page.getByText('Completed', { exact: true }).first().waitFor();
  await snap('business-orders');
  record('merchant confirms fulfilment through pickup collection');
  state.status = 'PAYMENT_CONFIRMED';
  state.manage = false;
  await reload();
  assert.equal(
    await page
      .getByRole('button', { name: 'Accept order', exact: true })
      .count(),
    0,
  );
  record('read-only workspace has no fulfilment controls');
  state.manage = true;
  state.payment = 'PENDING';
  await reload();
  assert.equal(
    await page
      .getByRole('button', { name: 'Accept order', exact: true })
      .count(),
    0,
  );
  record('unpaid order has no fulfilment controls');
  state.canView = false;
  await reload();
  await page.getByRole('button', { name: 'Retry orders' }).waitFor();
  assert.equal(
    await page.getByText('Order EV-1048', { exact: true }).count(),
    0,
  );
  record('unauthorised workspace clears order records');
  state.business = false;
  state.qty = 0;
  await goto('/cart');
  await page.getByText('Your cart is empty.', { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Continue to secure checkout' })
      .count(),
    0,
  );
  record('empty cart cannot start checkout');
  state.authenticated = false;
  await page.evaluate(() =>
    localStorage.removeItem('sb-bmwbljefnamvjnmuvkvv-auth-token'),
  );
  await reload();
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Continue to secure checkout' })
      .count(),
    0,
  );
  record('expired or guest authentication requires sign in');
  assert.deepEqual(errors, []);
  await context.close();
}
await browser.close();
await fs.writeFile(out + '/report.json', JSON.stringify(report, null, 2));
console.log(
  `${report.length} fixture interaction scenarios passed (${engine}). No real payments performed.`,
);
