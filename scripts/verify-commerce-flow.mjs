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
const navigationCancellations = [];
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
const layouts = (
  process.env.EVEREST_QA_LAYOUTS || '320:LIGHT,390:DARK,1280:LIGHT,1280:DARK'
)
  .split(',')
  .map((v) => {
    const [w, t] = v.split(':');
    return [Number(w), t];
  });
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
      if(localStorage.getItem('fixture.logged-out')!=='true')localStorage.setItem(
        'sb-bmwbljefnamvjnmuvkvv-auth-token',
        JSON.stringify(session),
      );
    },
    { theme, session },
  );
  const state = {
    authenticated: true,
    orderId: oid,
    orderNumber: 'EV-1048',
    checkoutExpires: false,
    serviceCalls: 0,
    servicePayment: 'PENDING',
    bookingStatus: 'PENDING_PAYMENT',
    serviceExpired: false,
    cartDelay: 0,
    cartWriteDelay: 0,
    cartMutationFail: false,
    supportDelay: 0,
    quoteReadFail: false,
    supportFail: false,
    catalogPrice: 49.95,
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
    sale_price: state.catalogPrice,
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
    id: state.orderId,
    order_number: state.orderNumber,
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
  const nativeFetchErrors = [];
  const abortedFetches = [];
  const requestDocuments = new WeakMap();
  let documentSequence = 0;
  let authTransition = false;
  page.on('request', (req) => {
    if (req.isNavigationRequest() && req.frame() === page.mainFrame())
      documentSequence++;
    requestDocuments.set(req, documentSequence);
  });
  page.on('requestfailed', (req) => {
    const reason = req.failure()?.errorText || '';
    if (/cancel(?:l)?ed|ERR_ABORTED/i.test(reason))
      abortedFetches.push({
        url: req.url(),
        document: requestDocuments.get(req) ?? documentSequence,
        reason,
        authTransition,
      });
    if (process.env.EVEREST_QA_VERBOSE === '1')
      console.log('Request failed', req.url(), reason);
  });
  page.on('pageerror', (error) => {
    const stack = error.stack || error.message;
    const url = stack.match(/https?:\/\/[^\s]+/)?.[0];
    // WebKit reports a native fetch diagnostic as pageerror when fixture hard
    // navigation destroys its document. Keep application exceptions strict;
    // classify this only if the browser also proves cancellation of that URL
    // and a subsequent document navigation. Retain every case in an artifact.
    if (engine === 'webkit' && /^Fetch API cannot load /.test(stack) && url)
      nativeFetchErrors.push({ url, message: error.message, stack });
    else {
      errors.push(error.message);
      console.error(stack);
    }
  });
  await page.routeWebSocket('**/realtime/**', (ws) => ws.close());
  await page.route(/open-meteo|nominatim|bigdatacloud/, (r) =>
    r.fulfill({ status: 503, json: {} }),
  );
  await page.route('https://checkout.stripe.com/**', (r) =>
    r.fulfill({
      contentType: 'text/html',
      body: `<title>Fixture checkout</title><h1>Fixture hosted checkout — no payment taken</h1><a href="${base}/${r.request().url().endsWith('booking') ? 'booking?id=' + oid : 'orders?order_id=' + oid}&checkout=cancelled">Cancel fixture checkout</a>`,
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
    if (url.pathname.includes('/functions/v1/service-checkout')) {
      state.serviceCalls++;
      await new Promise((resolve) => setTimeout(resolve, 150));
      return reply({
        json: {
          paymentId: 'payment-1',
          bookingId: oid,
          total: 50,
          checkoutState: state.serviceExpired ? 'EXPIRED' : 'OPEN',
          checkoutUrl: state.serviceExpired
            ? null
            : 'https://checkout.stripe.com/c/pay/booking',
          reused: false,
        },
      });
    }
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
      if (state.checkoutExpires) {
        state.checkoutExpires = false;
        state.pending = false;
        state.status = 'CANCELLED';
        state.payment = 'FAILED';
        return reply({
          json: {
            orderId: state.orderId,
            orderNumber: state.orderNumber,
            total: state.qty * 49.95,
            reused: true,
            checkoutUrl: null,
            checkoutState: 'EXPIRED',
          },
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
      if (table === 'service_booking_payment_summary')
        return reply({
          json: {
            total: 240,
            paid:
              state.bookingStatus === 'COMPLETED'
                ? 240
                : state.servicePayment === 'SUCCEEDED'
                  ? 50
                  : 0,
            pending: state.servicePayment === 'PENDING' ? 50 : 0,
            balance_due:
              state.bookingStatus === 'COMPLETED'
                ? 0
                : state.servicePayment === 'SUCCEEDED'
                  ? 190
                  : 240,
            fully_paid: state.bookingStatus === 'COMPLETED',
            marketplace_fee_total: 0,
            marketplace_fee_collected: 0,
          },
        });
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
        await new Promise((resolve) =>
          setTimeout(resolve, state.cartWriteDelay),
        );
        if (state.cartMutationFail) {
          state.cartMutationFail = false;
          return reply({
            status: 500,
            json: { message: 'Fixture cart update failure' },
          });
        }
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
    if (table === 'bookings')
      rows =
        url.searchParams.get('id') === 'eq.' + oid
          ? [
              {
                id: oid,
                business_id: biz,
                request_id: null,
                quote_id: vid,
                price: 240,
                status: state.bookingStatus,
                scheduled_date: null,
                scheduled_time: null,
                created_at: '2026-10-17T05:00:00Z',
                completed_at:
                  state.bookingStatus === 'COMPLETED'
                    ? '2026-10-17T06:30:00Z'
                    : null,
              },
            ]
          : [];
    if (table === 'quotes'){if(state.quoteReadFail)return reply({status:503,json:{message:'Fixture quote unavailable'}});rows=[{id:vid,deposit:50}];}
    if (table === 'service_payments')
      rows = [
        {
          amount: state.bookingStatus === 'COMPLETED' ? 190 : 50,
          status: state.servicePayment,
          created_at: '2026-10-17T05:01:00Z',
          payment_kind:
            state.bookingStatus === 'COMPLETED' ? 'BALANCE' : 'DEPOSIT',
        },
      ];
    if (table === 'cart_items' && state.cartDelay)
      await new Promise((resolve) => setTimeout(resolve, state.cartDelay));
    if (
      table === 'booking_job_records' ||
      table === 'booking_job_checklist_items' ||
      table === 'reviews'
    ) {
      if (state.supportDelay)
        await new Promise((resolve) => setTimeout(resolve, state.supportDelay));
      if (state.supportFail)
        return reply({
          status: 500,
          json: { message: 'Fixture supporting details unavailable' },
        });
      if (table === 'booking_job_checklist_items')
        rows = [
          {
            id: 'checklist-1',
            booking_id: oid,
            business_id: biz,
            label: 'Confirm access instructions',
            is_complete: false,
            position: 0,
            completed_at: null,
          },
        ];
    }
    if (table === 'booking_job_records' && state.bookingStatus === 'COMPLETED')
      rows = [
        {
          booking_id: oid,
          business_id: biz,
          customer_id: uid,
          arrival_status: 'ON_MY_WAY',
          arrival_eta: null,
          completion_summary: null,
          started_at: null,
          completed_at: null,
          updated_at: '2026-10-17T05:00:00Z',
        },
      ];
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
  const goto = async (path) => {
    await page.waitForLoadState('networkidle');
    await page.goto(base + path, { waitUntil: 'networkidle' });
  };
  const reload = async () => {
    await page.waitForLoadState('networkidle');
    await page.reload({ waitUntil: 'networkidle' });
  };
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
  if (
    process.env.EVEREST_QA_BOOKING_LAYOUT_ONLY !== '1' &&
    process.env.EVEREST_QA_RECOVERY_ONLY !== '1'
  ) {
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
    state.cartDelay = 900;
    await page.goto(base + '/cart', { waitUntil: 'domcontentloaded' });
    await page
      .getByRole('progressbar', { name: 'Loading your cart…', exact: true })
      .waitFor();
    await snap('cart-loading');
    await page
      .getByRole('button', {
        name: 'Decrease quantity of Ceramic-safe wash kit',
      })
      .waitFor();
    state.cartDelay = 0;
    record('slow cart uses structural loading');
    state.cartMutationFail = true;
    state.cartWriteDelay = 600;
    await page
      .getByRole('button', {
        name: 'Decrease quantity of Ceramic-safe wash kit',
      })
      .click();
    await page
      .getByLabel('Updating Ceramic-safe wash kit', { exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole('button', {
          name: 'Continue to secure checkout',
          exact: true,
        })
        .isDisabled(),
      true,
    );
    await page
      .getByText(
        'Could not update your cart. Check stock availability and try again.',
        { exact: true },
      )
      .waitFor();
    assert.equal(state.qty, 3);
    record('failed cart mutation keeps quantity and shows local busy feedback');
    await page
      .getByRole('button', {
        name: 'Decrease quantity of Ceramic-safe wash kit',
      })
      .click();
    await page.getByText('$99.90', { exact: true }).first().waitFor();
    state.cartWriteDelay = 0;
    assert.equal(state.qty, 2);
    record('cart quantity and totals');
    const proceed = page.getByRole('button', {
      name: 'Continue to secure checkout',
      exact: true,
    });
    await page.getByRole('radio', { name: /Everest Delivery/ }).click();
    assert.equal(await proceed.isDisabled(), false);
    await proceed.focus();
    await page.keyboard.press('Enter');
    await page
      .getByText(
        'Enter your street address, suburb and postcode to continue.',
        { exact: true },
      )
      .waitFor();
    assert.equal(state.checkoutCalls, 0);
    assert.equal(
      await page
        .getByRole('textbox', { name: 'Delivery or shipping address' })
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await snap('cart-address-error');
    await page
      .getByRole('textbox', { name: 'Delivery or shipping address' })
      .fill('14 Errol Street, North Melbourne VIC 3051');
    assert.equal(await proceed.isDisabled(), false);
    record('fulfilment validates inline and focuses the missing address');
    await snap('cart');
    state.checkoutError = true;
    await proceed.click();
    await page
      .getByText(
        'Checkout could not be opened. Try again, or check Orders before starting another payment.',
        { exact: true },
      )
      .waitFor();
    assert.equal(
      await page
        .getByRole('textbox', { name: 'Delivery or shipping address' })
        .inputValue(),
      '14 Errol Street, North Melbourne VIC 3051',
    );
    await page.getByRole('radio', { name: /Pickup/ }).click();
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
    state.catalogPrice = 79.95;
    await goto('/cart');
    await page
      .getByRole('button', { name: 'Resume secure checkout' })
      .waitFor();
    assert.equal(
      await page
        .getByRole('button', {
          name: 'Increase quantity of Ceramic-safe wash kit',
        })
        .count(),
      0,
    );
    await page.getByText('Price breakdown', { exact: true }).waitFor();
    await page.getByText('2 × $49.95', { exact: true }).waitFor();
    assert.equal(
      await page.getByText('$79.95 each', { exact: true }).count(),
      0,
    );
    await snap('saved-checkout');
    record('pending checkout keeps saved prices and resumes reserved stock');
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
    const refreshedDetails = page.waitForResponse(
      (r) =>
        r.url().includes('/rest/v1/orders?') &&
        new URL(r.url()).searchParams.get('select')?.includes('order_items') &&
        r.status() === 200,
    );
    const refreshedDelivery = page.waitForResponse(
      (r) => r.url().includes('/rest/v1/deliveries?') && r.status() === 200,
    );
    await page
      .getByRole('button', { name: 'Refresh orders', exact: true })
      .click();
    await Promise.all([refreshedDelivery, refreshedDetails]);
    await page.getByText('Price breakdown', { exact: true }).waitFor();
    await page.waitForLoadState('networkidle');
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
      await page
        .getByRole('button', { name: label, exact: true })
        .last()
        .click();
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
  }
  if (
    process.env.EVEREST_QA_BOOKING === '1' &&
    process.env.EVEREST_QA_RECOVERY_ONLY !== '1'
  ) {
    state.business = false;
    state.supportFail = true;
    state.supportDelay = 1600;
    await page.goto(base + '/booking?id=' + oid + '&checkout=success', {
      waitUntil: 'domcontentloaded',
    });
    await page
      .getByRole('button', { name: 'Pay $50.00 deposit', exact: true })
      .waitFor();
    await page
      .getByRole('progressbar', {
        name: 'Loading job and review details…',
        exact: true,
      })
      .waitFor();
    await snap('booking-partial-loading');
    await page
      .getByRole('button', { name: 'Retry job details', exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole('button', { name: 'Pay $50.00 deposit', exact: true })
        .isEnabled(),
      true,
    );
    await page
      .getByRole('button', { name: 'Retry job details', exact: true })
      .scrollIntoViewIfNeeded();
    await snap('booking-partial-error');
    record('booking payment survives slow and failed secondary sections');
    state.supportFail = false;
    state.supportDelay = 0;
    await page
      .getByRole('button', { name: 'Retry job details', exact: true })
      .click();
    await page
      .getByText('Confirm access instructions', { exact: true })
      .waitFor();
    record('supporting details retry independently');
    state.quoteReadFail=true;await page.reload();
    await page.getByRole('button',{name:'Review payment',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Pay $240.00',exact:true}).count(),0,'Unknown quote deposit must not be presented as full balance');
    state.quoteReadFail=false;await page.reload();await page.getByRole('button',{name:'Pay $50.00 deposit',exact:true}).waitFor();
    record('known deposit is shown and unavailable quote never implies full upfront payment');
    await page.getByText('Checking payment status', { exact: true }).waitFor();
    assert.equal(
      await page.getByText('Payment recorded', { exact: true }).count(),
      0,
    );
    const priceFits = await page
      .getByText('$240.00', { exact: true })
      .evaluate((el) => {
        const box = el.getBoundingClientRect(),
          row = el.parentElement.getBoundingClientRect();
        return box.right <= row.right + 1 && box.left >= row.left - 1;
      });
    assert.equal(priceFits, true, 'booking total is clipped');
    record('booking return waits for authoritative payment');
    state.serviceExpired = true;
    await page
      .getByRole('button', { name: 'Pay $50.00 deposit', exact: true })
      .click();
    await page
      .getByText(
        'That checkout expired. No payment was confirmed for that attempt. Tap Pay again to start a new secure checkout.',
        { exact: true },
      )
      .waitFor();
    record('expired service checkout is recoverable');
    state.serviceExpired = false;
    await page
      .getByRole('button', { name: 'Pay $50.00 deposit', exact: true })
      .evaluate((el) => {
        el.click();
        el.click();
      });
    await page.waitForURL('https://checkout.stripe.com/**');
    assert.equal(state.serviceCalls, 2);
    await page.getByRole('link', { name: 'Cancel fixture checkout' }).click();
    await page.getByText('Checkout closed', { exact: true }).waitFor();
    assert.equal(state.servicePayment, 'PENDING');
    record('duplicate service payment tap and cancellation return');
    state.servicePayment = 'SUCCEEDED';
    state.bookingStatus = 'CONFIRMED';
    await page
      .getByText('Payment recorded', { exact: true })
      .waitFor({ timeout: 15000 });
    await page
      .getByRole('button', { name: 'Pay $190.00 balance', exact: true })
      .waitFor();
    await snap('booking-payment');
    record('booking polls server deposit and remaining balance');
    state.bookingStatus = 'COMPLETED';
    state.supportFail = true;
    await goto('/booking?id=' + oid + '&checkout=success');
    await page
      .getByRole('button', { name: 'Retry job details', exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole('button', { name: 'Leave a review', exact: true })
        .count(),
      0,
    );
    await page.getByText('Paid in full', { exact: true }).waitFor();
    await page.getByText('Completed', { exact: true }).waitFor();
    assert.equal(
      await page
        .getByText('Your professional is on the way', { exact: true })
        .count(),
      0,
    );
    record('unknown review state does not offer duplicate review creation');
    state.supportFail = false;
    await page
      .getByRole('button', { name: 'Retry job details', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Leave a review', exact: true })
      .waitFor();
    record('review retry restores the completed booking action');
    await goto('/booking?id=missing');
    await page.getByText('Booking unavailable', { exact: true }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: /Pay.*balance/ }).count(),
      0,
    );
    record('switching bookings cannot retain stale payment actions');
  }
  if (process.env.EVEREST_QA_BOOKING_LAYOUT_ONLY !== '1') {
    state.business = false;
    state.qty = 2;
    state.pending = true;
    state.status = 'PENDING';
    state.payment = 'PENDING';
    state.orderId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    state.orderNumber = 'EV-1049';
    state.catalogPrice = 49.95;
    state.checkoutExpires = true;
    await goto('/cart');
    await page
      .getByRole('button', { name: 'Resume secure checkout', exact: true })
      .click();
    await page.getByText('Checkout expired', { exact: true }).waitFor();
    assert.equal(state.status, 'CANCELLED');
    assert.equal(state.payment, 'FAILED');
    assert.equal(
      new URL(page.url()).searchParams.get('order_id'),
      state.orderId,
    );
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page
      .getByRole('button', { name: 'Continue to secure checkout', exact: true })
      .waitFor();
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('button', { name: 'Continue to secure checkout', exact: true })
      .click({ trial: true });
    assert.equal(
      await page
        .getByRole('button', {
          name: 'Continue to secure checkout',
          exact: true,
        })
        .isEnabled(),
      true,
    );
    assert.equal(
      await page
        .getByRole('button', { name: 'Resume secure checkout', exact: true })
        .count(),
      0,
    );
    record(
      'expired product checkout returns to a refreshable cart with a fresh attempt',
    );
  }
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
  authTransition = true;
  state.authenticated = false;
  await page.evaluate(() => {
    localStorage.setItem('fixture.logged-out','true');
    localStorage.removeItem('sb-bmwbljefnamvjnmuvkvv-auth-token');
  });
  await reload();
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole('button', { name: 'Continue to secure checkout' })
      .count(),
    0,
  );
  record('expired or guest authentication requires sign in');
  const writesBeforeGuest=state.cartWrites.length;
  await goto('/product?id='+pid);await page.getByRole('button',{name:'Increase quantity',exact:true}).waitFor();
  await page.getByRole('button',{name:'Add to cart',exact:true}).click();await page.waitForURL(/\/auth/,{waitUntil:'domcontentloaded'});await page.getByPlaceholder('Email address',{exact:true}).waitFor();
  assert.equal(state.cartWrites.length,writesBeforeGuest,'Guest product action must require sign-in before any cart mutation');
  record('guest product add requires authentication before cart mutation');
  for (const error of nativeFetchErrors) {
    const cancelled = abortedFetches.find(
      (item) =>
        item.url === error.url &&
        (item.document < documentSequence || item.authTransition),
    );
    if (cancelled)
      navigationCancellations.push({
        browser: engine,
        width,
        theme,
        url: error.url,
        reason: cancelled.reason,
        document: cancelled.document,
        nextDocument: documentSequence,
      });
    else {
      errors.push(error.message);
      console.error(error.stack);
    }
  }
  if (errors.length)
    await fs.writeFile(
      out + '/native-fetch-debug-' + width + '-' + theme + '.json',
      JSON.stringify(
        { nativeFetchErrors, abortedFetches, documentSequence, errors },
        null,
        2,
      ),
    );
  assert.deepEqual(errors, []);
  await context.close();
}
await browser.close();
await fs.writeFile(out + '/report.json', JSON.stringify(report, null, 2));
await fs.writeFile(
  out + '/navigation-cancellations.json',
  JSON.stringify(navigationCancellations, null, 2),
);
console.log(
  `${report.length} fixture interaction scenarios passed (${engine}). No real payments performed.`,
);
