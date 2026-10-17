import test from 'node:test';
import assert from 'node:assert/strict';
import {
  orderGuidance,
  orderIsFinished,
  orderMethod,
} from '../lib/order-presentation.ts';
const order = {
  status: 'PREPARING',
  payment_status: 'SUCCEEDED',
  delivery_method: 'PICKUP',
};
test('collection instructions only appear for customer pickup', () => {
  assert.equal(
    orderGuidance({ ...order, status: 'READY_FOR_PICKUP' }).title,
    'Ready to collect',
  );
  for (const delivery_method of ['EVEREST_DELIVERY', 'SHIPPING', 'SAME_DAY']) {
    const state = orderGuidance({
      ...order,
      status: 'READY_FOR_PICKUP',
      delivery_method,
    });
    assert.equal(state.title, 'Ready for dispatch');
    assert.doesNotMatch(state.detail, /collect from the business/);
  }
});
test('pending payment is not represented as a confirmed purchase', () => {
  assert.equal(
    orderGuidance({ ...order, status: 'PENDING', payment_status: 'PENDING' })
      .tone,
    'warning',
  );
  assert.equal(
    orderGuidance({ ...order, status: 'PENDING', payment_status: 'FAILED' })
      .tone,
    'danger',
  );
  assert.match(
    orderGuidance({
      ...order,
      status: 'PENDING',
      payment_status: 'REQUIRES_ACTION',
    }).detail,
    /verification/,
  );
  assert.match(
    orderGuidance({ ...order, status: 'PAYMENT_CONFIRMED' }).detail,
    /accept/,
  );
});
test('terminal order states win over obsolete payment action requirements', () => {
  for (const status of ['DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED']) {
    assert.equal(orderIsFinished({ status }), true);
    assert.doesNotMatch(
      orderGuidance({ ...order, status, payment_status: 'REQUIRES_ACTION' })
        .detail,
      /verification/,
    );
  }
  for (const status of [
    'PENDING',
    'PAYMENT_CONFIRMED',
    'ACCEPTED',
    'PREPARING',
    'READY_FOR_PICKUP',
    'OUT_FOR_DELIVERY',
  ])
    assert.equal(orderIsFinished({ status }), false);
});
test('fulfilment labels handle real persisted delivery methods without inventing pickup', () => {
  for (const method of ['EVEREST_DELIVERY', 'SAME_DAY', 'DELIVERY'])
    assert.equal(orderMethod(method), 'Everest Delivery');
  assert.equal(orderMethod(null), 'Fulfilment to confirm');
});

test('merchant actions require server-confirmed payment and respect fulfilment ownership', async () => {
  const { merchantOrderAction } = await import('../lib/order-presentation.ts');
  for (const payment_status of [
    'PENDING',
    'FAILED',
    'REFUNDED',
    'REQUIRES_ACTION',
  ])
    assert.equal(
      merchantOrderAction({
        ...order,
        status: 'PAYMENT_CONFIRMED',
        payment_status,
      }),
      null,
    );
  assert.deepEqual(
    merchantOrderAction({ ...order, status: 'READY_FOR_PICKUP' }),
    { status: 'COMPLETED', label: 'Mark collected' },
  );
  assert.deepEqual(
    merchantOrderAction({
      ...order,
      status: 'READY_FOR_PICKUP',
      delivery_method: 'SHIPPING',
    }),
    { status: 'OUT_FOR_DELIVERY', label: 'Mark dispatched' },
  );
  for (const delivery_method of ['EVEREST_DELIVERY', 'SAME_DAY'])
    assert.equal(
      merchantOrderAction({
        ...order,
        status: 'READY_FOR_PICKUP',
        delivery_method,
      }),
      null,
    );
  assert.equal(merchantOrderAction({ ...order, status: 'COMPLETED' }), null);
});
