/* global URL, Response, Request */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { checkoutReturnUrls } from '../supabase/functions/_shared/checkout-return.ts';
const source = fs
  .readFileSync('supabase/functions/service-checkout/index.ts', 'utf8')
  .replace(/^import .*;\n/gm, '');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
  },
}).outputText;
function harness({
  status = null,
  appUrl = 'https://staging.example.invalid',
  authenticated = true,
  timeout = false,
  ready = true,
} = {}) {
  const calls = { rpc: [], creates: [], updates: [] };
  const payment = {
    payment_id: 'service-payment-1',
    booking_id: 'booking-1',
    amount: 50,
    currency: 'aud',
    payment_kind: 'DEPOSIT',
    provider_checkout_session_id: status ? 'cs_existing' : null,
    reused: !!status,
  };
  function query(table) {
    let payload;
    const chain = {
      select() {
        return chain;
      },
      eq() {
        return chain;
      },
      is() {
        return chain;
      },
      update(value) {
        payload = value;
        return chain;
      },
      single() {
        return Promise.resolve({
          data:
            table === 'bookings'
              ? { business_id: 'business-1' }
              : {
                  marketplace_fee: 2.5,
                  provider_net: 47.5,
                  fee_policy_version: 'fixture',
                  stripe_connected_account_id: 'acct_fixture',
                },
          error: null,
        });
      },
      maybeSingle() {
        return Promise.resolve({
          data: {
            stripe_connected_account_id: 'acct_fixture',
            stripe_connect_status: 'ACTIVE',
            stripe_details_submitted: true,
            stripe_charges_enabled: ready,
            stripe_payouts_enabled: ready,
          },
          error: null,
        });
      },
      then(a, b) {
        if (payload) calls.updates.push(payload);
        return Promise.resolve({ data: null, error: null }).then(a, b);
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
      return {
        data: name === 'create_service_payment' ? payment : true,
        error: null,
      };
    },
  };
  class Stripe {
    constructor() {
      this.checkout = {
        sessions: {
          retrieve: async () => ({
            id: 'cs_existing',
            status,
            url:
              status === 'open'
                ? 'https://checkout.stripe.com/c/pay/fixture'
                : null,
          }),
          create: async (params, options) => {
            calls.creates.push({ params, options });
            if (timeout) throw new Error('Fixture timeout');
            return {
              id: 'cs_fixture',
              url: 'https://checkout.stripe.com/c/pay/fixture',
            };
          },
        },
      };
    }
  }
  let handler;
  const env = {
    SUPABASE_URL: 'https://fixture.invalid',
    SUPABASE_ANON_KEY: 'fixture',
    SUPABASE_SERVICE_ROLE_KEY: String('fixture'),
    STRIPE_SECRET_KEY: 'fixture',
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
      env: { get: (key) => env[key] },
      serve: (fn) => {
        handler = fn;
      },
    },
  });
  return {
    calls,
    invoke: (key) =>
      handler(
        new Request('https://fixture.invalid/functions/v1/service-checkout', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer fixture',
            'Idempotency-Key': key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ booking_id: 'booking-1' }),
        }),
      ),
  };
}
test('service checkout preserves authoritative deposit, currency, Connect fees and stable payment idempotency', async () => {
  const h = harness();
  for (const key of ['first-client-key-123456', 'reload-client-key-12345'])
    assert.equal((await h.invoke(key)).status, 200);
  for (const { params, options } of h.calls.creates) {
    assert.equal(options.idempotencyKey, 'service-payment-1');
    assert.equal(options.stripeAccount, 'acct_fixture');
    assert.equal(params.line_items[0].price_data.unit_amount, 5000);
    assert.equal(params.line_items[0].price_data.currency, 'aud');
    assert.equal(params.payment_intent_data.application_fee_amount, 250);
    assert.equal(
      params.success_url,
      'https://staging.example.invalid/booking?id=booking-1&checkout=success',
    );
    assert.equal(
      params.cancel_url,
      'https://staging.example.invalid/booking?id=booking-1&checkout=cancelled',
    );
  }
  assert.equal(
    h.calls.updates.some((p) => p.status === 'SUCCEEDED'),
    false,
  );
});
test('service checkout resumes open sessions and distinguishes verified expiry from completed payment awaiting webhook', async () => {
  for (const status of ['open', 'expired', 'complete']) {
    const h = harness({ status });
    const result = await (await h.invoke('session-client-key-12345')).json();
    assert.equal(
      result.checkoutState,
      status === 'open'
        ? 'OPEN'
        : status === 'expired'
          ? 'EXPIRED'
          : 'COMPLETE',
    );
    assert.equal(h.calls.creates.length, 0);
    assert.equal(
      h.calls.rpc.some((c) => c.name === 'process_stripe_service_failure'),
      status === 'expired',
    );
    assert.equal(
      h.calls.rpc.some((c) => c.name === 'process_stripe_service_success'),
      false,
    );
  }
});
test('invalid service return origin and guest authentication never create a payment', async () => {
  for (const options of [
    { appUrl: 'http://unsafe.invalid' },
    { authenticated: false },
  ]) {
    const h = harness(options);
    assert.notEqual((await h.invoke('blocked-client-key-12345')).status, 200);
    assert.equal(h.calls.rpc.length, 0);
  }
});
test('provider timeout leaves the existing payment retryable rather than falsely failed or paid', async () => {
  const h = harness({ timeout: true });
  assert.equal((await h.invoke('timeout-client-key-12345')).status, 500);
  assert.equal(h.calls.updates.length, 0);
  assert.equal(
    h.calls.rpc.some((c) => /process_stripe_service/.test(c.name)),
    false,
  );
});

test('payout readiness loss cannot falsely fail an earlier unpersisted Stripe session', async () => {
  const h = harness({ ready: false });
  assert.equal((await h.invoke('payout-disabled-key-12345')).status, 409);
  assert.equal(h.calls.creates.length, 0);
  assert.equal(h.calls.updates.length, 0);
  assert.equal(
    h.calls.rpc.some((c) => c.name === 'process_stripe_service_failure'),
    false,
  );
});
