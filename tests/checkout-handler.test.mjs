/* global URL, Response, Request */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { checkoutReturnUrls } from '../supabase/functions/_shared/checkout-return.ts';

// Execute the actual Edge handler. Only network SDK imports are replaced; no
// payment/order implementation is duplicated and no real credentials are used.
const source = fs
  .readFileSync('supabase/functions/checkout/index.ts', 'utf8')
  .replace(/^import .*;\n/gm, '');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
  },
}).outputText;
function harness({
  sessionStatus = null,
  updateFailure = false,
  appUrl = 'https://staging.example.invalid',
  authenticated = true,
  createTimeout = false,
  createOrderError = null,
} = {}) {
  const calls = { rpc: [], queries: [], creates: [], unique: new Map() };
  const payment = {
    id: 'payment-1',
    idempotency_key: 'canonical-payment-attempt',
    provider_checkout_session_id: sessionStatus ? 'cs_existing' : null,
    stripe_connected_account_id: 'acct_fixture',
  };
  const totals = {
    business_id: 'business-1',
    subtotal: 49.95,
    delivery_fee: 8,
    total: 57.95,
    marketplace_fee: 2.5,
    provider_net: 47.45,
    fee_policy_version: 'fixture',
    delivery_method: 'SHIPPING',
  };
  const session = {
    id: 'cs_fixture',
    url: 'https://checkout.stripe.com/c/pay/fixture',
    status: 'open',
  };
  function query(table) {
    const q = { table, filters: [], payload: null };
    calls.queries.push(q);
    const resolve = () => {
      if (q.payload) {
        if (updateFailure) {
          updateFailure = false;
          return { error: new Error('Fixture database interruption') };
        }
        Object.assign(payment, q.payload);
        return { data: null, error: null };
      }
      return {
        data:
          table === 'order_items'
            ? [
                {
                  product_name: 'Fixture product',
                  unit_price: 49.95,
                  quantity: 1,
                },
              ]
            : table === 'orders'
              ? totals
              : table === 'payments'
                ? { ...payment }
                : table === 'businesses'
                  ? {
                      stripe_connected_account_id: 'acct_fixture',
                      stripe_connect_status: 'ACTIVE',
                      stripe_details_submitted: true,
                      stripe_charges_enabled: true,
                      stripe_payouts_enabled: true,
                    }
                  : null,
        error: null,
      };
    };
    const chain = {
      select(columns) {
        q.columns = columns;
        return chain;
      },
      eq(k, v) {
        q.filters.push([k, v]);
        return chain;
      },
      update(payload) {
        q.payload = payload;
        return chain;
      },
      single() {
        return Promise.resolve(resolve());
      },
      maybeSingle() {
        return Promise.resolve(resolve());
      },
      then(a, b) {
        return Promise.resolve(resolve()).then(a, b);
      },
    };
    return chain;
  }
  const db = {
    from: query,
    auth: {
      getUser: async () => ({
        data: { user: authenticated ? { id: 'customer-1' } : null },
      }),
    },
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if(name==='create_order_from_cart'&&createOrderError)return {data:null,error:createOrderError};
      return {
        data:
          name === 'create_order_from_cart'
            ? { order_id: 'order-1', order_number: 'EV-1', reused: true }
            : true,
        error: null,
      };
    },
  };
  class Stripe {
    constructor() {
      this.checkout = {
        sessions: {
          retrieve: async () => ({
            ...session,
            status: sessionStatus || 'open',
            url:
              sessionStatus === 'complete' || sessionStatus === 'expired'
                ? null
                : session.url,
          }),
          create: async (params, options) => {
            calls.creates.push({ params, options });
            if (createTimeout) throw new Error('Fixture provider timeout');
            if (!calls.unique.has(options.idempotencyKey))
              calls.unique.set(options.idempotencyKey, { ...session });
            return calls.unique.get(options.idempotencyKey);
          },
        },
      };
    }
  }
  let handler;
  const fixtureEnv = {
    SUPABASE_URL: 'https://fixture.invalid',
    SUPABASE_ANON_KEY: 'fixture-anon',
    SUPABASE_SERVICE_ROLE_KEY: String('fixture-service'),
    STRIPE_SECRET_KEY: 'fixture-not-a-key',
    APP_PUBLIC_URL: appUrl,
  };
  vm.runInNewContext(compiled, {
    createClient: () => db,
    Stripe,
    checkoutReturnUrls,
    URL,
    Response,
    console: { error() {} },
    Deno: {
      env: { get: (name) => fixtureEnv[name] },
      serve: (fn) => {
        handler = fn;
      },
    },
  });
  const request = (key) =>
    new Request('https://fixture.invalid/functions/v1/checkout', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer fixture',
        'Idempotency-Key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        delivery_method: 'PICKUP',
        return_platform: 'native',
      }),
    });
  return { calls, invoke: (key) => handler(request(key)) };
}
test('reload resumes the existing payment and returns the database total', async () => {
  const h = harness({ sessionStatus: 'open' });
  const response = await h.invoke('new-client-key-after-reload');
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.total, 57.95);
  assert.equal(data.checkoutState, 'OPEN');
  assert.equal(h.calls.creates.length, 0);
  const q = h.calls.queries.find((q) => q.table === 'payments' && !q.payload);
  assert.ok(q.filters.some(([k, v]) => k === 'order_id' && v === 'order-1'));
  assert.ok(
    q.filters.some(([k, v]) => k === 'customer_id' && v === 'customer-1'),
  );
  assert.equal(
    q.filters.some(([k]) => k === 'idempotency_key'),
    false,
  );
});
test('concurrent new client keys converge on one stored Stripe operation', async () => {
  const h = harness();
  const responses = await Promise.all([
    h.invoke('first-client-key-123456'),
    h.invoke('second-client-key-12345'),
  ]);
  for (const r of responses) assert.equal(r.status, 200);
  assert.equal(h.calls.unique.size, 1);
  assert.ok(h.calls.creates.length > 0);
  for (const { params, options } of h.calls.creates) {
    assert.equal(options.idempotencyKey, 'canonical-payment-attempt');
    assert.equal(options.stripeAccount, 'acct_fixture');
    assert.equal(params.line_items[0].price_data.unit_amount, 4995);
    assert.equal(params.line_items[1].price_data.product_data.name, 'Shipping');
    assert.match(
      params.success_url,
      /\/orders\?order_id=order-1&checkout=success$/,
    );
  }
});
test('retry after interrupted session persistence uses the same Stripe key', async () => {
  const h = harness({ updateFailure: true });
  assert.equal((await h.invoke('interrupted-client-key-123')).status, 500);
  assert.equal((await h.invoke('retry-client-key-1234567')).status, 200);
  assert.equal(h.calls.unique.size, 1);
  assert.equal(
    h.calls.rpc.some((c) => c.name === 'release_my_order_reservations'),
    false,
  );
  const update = h.calls.queries.find(
    (q) => q.table === 'payments' && q.payload,
  );
  assert.ok(update.filters.some(([k, v]) => k === 'id' && v === 'payment-1'));
});
test('only verified Stripe expiry triggers reservation failure processing', async () => {
  for (const status of ['expired', 'complete']) {
    const h = harness({ sessionStatus: status });
    const data = await (await h.invoke('session-retry-key-12345')).json();
    assert.equal(data.checkoutUrl, null);
    assert.equal(
      data.checkoutState,
      status === 'expired' ? 'EXPIRED' : 'COMPLETE',
    );
    assert.equal(
      h.calls.rpc.some((c) => c.name === 'process_stripe_order_failure'),
      status === 'expired',
    );
    assert.equal(
      h.calls.rpc.some((c) => c.name === 'process_stripe_order_success'),
      false,
    );
  }
});
test('invalid origin and expired authentication cannot create an order', async () => {
  const invalid = harness({ appUrl: 'http://unsafe.invalid' });
  assert.equal((await invalid.invoke('invalid-origin-key-12345')).status, 500);
  assert.equal(invalid.calls.rpc.length, 0);
  const guest = harness({ authenticated: false });
  assert.equal((await guest.invoke('unauthenticated-key-1234')).status, 401);
  assert.equal(guest.calls.rpc.length, 0);
});

test('uncertain Stripe creation must not release a potentially payable reservation', async () => {
  const h = harness({ createTimeout: true });
  assert.equal((await h.invoke('timeout-client-key-12345')).status, 500);
  assert.equal(
    h.calls.rpc.some((c) => c.name === 'release_my_order_reservations'),
    false,
  );
});

test('destination rejection returns an allowlisted recovery message before any Stripe operation',async()=>{
 for(const tag of ['MARKETPLACE_DESTINATION_REQUIRED','MARKETPLACE_CROSS_BORDER_UNSUPPORTED','MARKETPLACE_FULFILMENT_UNKNOWN','MARKETPLACE_PRODUCT_UNAVAILABLE']){const h=harness({createOrderError:{code:'22023',message:tag}});const response=await h.invoke('fixture-country-attempt-123');const result=await response.json();assert.equal(response.status,422);assert.ok(result.code);assert.equal(h.calls.creates.length,0);assert.equal(h.calls.queries.length,0);}
});
