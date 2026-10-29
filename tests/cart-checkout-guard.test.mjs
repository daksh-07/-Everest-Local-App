import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync('app/cart.tsx', 'utf8');
const tree = ts.createSourceFile(
  'cart.tsx',
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let pay;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'pay')
    pay = node.getText(tree);
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(pay, 'the real cart checkout handler is present');
const compiled = ts.transpileModule(pay, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(overrides = {}) {
  const calls = {
    checkout: [],
    focus: 0,
    errors: [],
    addressErrors: [],
    redirects: [],
    busy: [],
    pending: [],
    loads: 0,
  };
  const env = {
    operationRef: { current: false },
    loadRef: { current: false },
    mountedRef: { current: true },
    refreshing: false,
    pending: null,
    hasUnavailableProduct: false,
    hasMultipleBusinesses: false,
    hasFulfillmentMethod: true,
    method: 'EVEREST_DELIVERY',
    address: '14 Errol Street, North Melbourne VIC 3051',
    addressRef: {
      current: {
        focus() {
          calls.focus++;
        },
      },
    },
    checkoutKey: { current: 'fixture-canonical-client-key' },
    newCheckoutAttemptKey: () => 'fixture-new-attempt-key',
    load: async () => {
      calls.loads++;
    },
    setError: (value) => calls.errors.push(value),
    setAddressError: (value) => calls.addressErrors.push(value),
    setBusy: (value) => calls.busy.push(value),
    setPending: (value) => calls.pending.push(value),
    router: { push: (value) => calls.redirects.push(value) },
    Platform: { OS: 'web' },
    window: { location: { assign: (url) => calls.redirects.push(url) } },
    checkout: async (...args) => {
      calls.checkout.push(args);
      return {
        orderId: 'order-1',
        total: 99.9,
        checkoutUrl: 'https://checkout.stripe.com/c/pay/fixture',
        checkoutState: 'OPEN',
      };
    },
    ...overrides,
  };
  const ctx = vm.createContext(env);
  vm.runInContext(compiled, ctx);
  return { calls, env, invoke: () => ctx.pay() };
}
test('unsupported fulfilment cannot initiate a server checkout', async () => {
  const h = harness({ hasFulfillmentMethod: false });
  await h.invoke();
  assert.equal(h.calls.checkout.length, 0);
  assert.match(h.calls.errors.at(-1), /no available fulfilment method/);
  assert.equal(h.env.operationRef.current, false);
});
test('missing address validates locally, focuses the field and preserves typed text', async () => {
  const h = harness({ address: '12' });
  await h.invoke();
  assert.equal(h.calls.checkout.length, 0);
  assert.equal(h.calls.focus, 1);
  assert.match(
    h.calls.addressErrors.at(-1),
    /street address, suburb and postcode/,
  );
  assert.equal(h.env.address, '12');
  assert.equal(h.env.operationRef.current, false);
});
test('valid input reaches checkout once despite repeated taps and keeps a contained busy state', async () => {
  let resolve;
  const pending = new Promise((r) => {
    resolve = r;
  });
  const sent = [];
  const h = harness({
    checkout: async (...args) => {
      sent.push(args);
      return pending;
    },
  });
  const first = h.invoke();
  const second = h.invoke();
  assert.equal(sent.length, 1);
  assert.equal(sent[0][1], 'EVEREST_DELIVERY');
  assert.equal(sent[0][2], h.env.address);
  assert.equal(h.env.operationRef.current, true);
  resolve({
    orderId: 'order-1',
    total: 99.9,
    checkoutUrl: 'https://checkout.stripe.com/c/pay/fixture',
  });
  await Promise.all([first, second]);
  assert.deepEqual(h.calls.busy, [true, false]);
  assert.equal(h.env.operationRef.current, false);
  assert.equal(h.calls.redirects.length, 1);
});
test('a late checkout response cannot redirect a screen the customer has left', async () => {
  let resolve;
  const pending = new Promise((r) => {
    resolve = r;
  });
  const h = harness({ checkout: () => pending });
  const operation = h.invoke();
  h.env.mountedRef.current = false;
  resolve({
    orderId: 'order-1',
    total: 99.9,
    checkoutUrl: 'https://checkout.stripe.com/c/pay/fixture',
  });
  await operation;
  assert.equal(h.calls.redirects.length, 0);
  assert.equal(h.env.operationRef.current, false);
});

test('verified expiry clears the saved attempt and rotates its closed key before returning to the order', async () => {
  const h = harness({
    pending: { id: 'order-1', delivery_method: 'PICKUP' },
    checkout: async () => ({
      orderId: 'order-1',
      checkoutUrl: null,
      checkoutState: 'EXPIRED',
    }),
  });
  await h.invoke();
  assert.equal(h.env.checkoutKey.current, 'fixture-new-attempt-key');
  assert.deepEqual(h.calls.pending, [null]);
  assert.equal(h.calls.loads, 1);
  assert.equal(h.calls.redirects.length, 1);
  assert.equal(h.calls.redirects[0].params.checkout, 'expired');
  assert.equal(h.env.operationRef.current, false);
});

test('a completed Checkout return cannot mark an order paid or discard a still-pending attempt', async () => {
  const saved = { id: 'order-1', delivery_method: 'PICKUP' };
  const h = harness({
    pending: saved,
    checkout: async () => ({
      orderId: 'order-1',
      checkoutUrl: null,
      checkoutState: 'COMPLETE',
    }),
  });
  await h.invoke();
  assert.equal(h.env.checkoutKey.current, 'fixture-canonical-client-key');
  assert.equal(h.calls.loads, 0);
  assert.deepEqual(h.calls.pending, []);
  assert.equal(h.calls.redirects[0].params.checkout, 'returned');
});
