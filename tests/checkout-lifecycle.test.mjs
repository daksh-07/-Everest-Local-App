import test from "node:test";
import assert from "node:assert/strict";
import { checkoutReturnUrls } from "../supabase/functions/_shared/checkout-return.ts";
import { transactionEvent } from "../supabase/functions/_shared/transaction-events.ts";
test("checkout returns to configured web routes with an explicit native-app handoff", () => {
  const urls = checkoutReturnUrls(
    "https://staging.example.invalid/",
    "order",
    "o&1",
    true,
  );
  assert.equal(
    urls.success_url,
    "https://staging.example.invalid/orders?order_id=o%261&checkout=success&native_return=1",
  );
  assert.equal(
    urls.cancel_url,
    "https://staging.example.invalid/orders?order_id=o%261&checkout=cancelled&native_return=1",
  );
  assert.match(
    checkoutReturnUrls(undefined, "booking", "b1").success_url,
    /\/booking\?id=b1&checkout=success$/,
  );
  for (const bad of [
    "http://evil.invalid",
    "https://user:password@site.invalid",
    "https://site.invalid/path",
    "https://site.invalid/?redirect=evil",
    "javascript:alert(1)",
  ])
    assert.throws(() => checkoutReturnUrls(bad, "order", "1"));
});
test("a Checkout return and retryable card decline never settle an order", () => {
  for (const event of [
    "payment_intent.payment_failed",
    "payment_intent.processing",
    "success",
    "cancelled",
  ])
    assert.equal(transactionEvent(event), "ignore");
  assert.equal(
    transactionEvent("checkout.session.completed", "unpaid"),
    "ignore",
  );
  assert.equal(
    transactionEvent("checkout.session.async_payment_succeeded", "paid"),
    "success",
  );
  assert.equal(
    transactionEvent("checkout.session.completed", "paid"),
    "success",
  );
  assert.equal(transactionEvent("payment_intent.succeeded"), "success");
  for (const event of [
    "payment_intent.canceled",
    "checkout.session.expired",
    "checkout.session.async_payment_failed",
  ])
    assert.equal(transactionEvent(event), "failure");
});

import { paymentReturnPath } from "../lib/payment-return.ts";
test("existing native checkout sessions reach real routes without asserting payment", () => {
  assert.equal(
    paymentReturnPath("everestlocal://order/success?order_id=o1"),
    "/orders?order_id=o1&checkout=success",
  );
  assert.equal(
    paymentReturnPath("/order/cancelled?order_id=o1"),
    "/orders?order_id=o1&checkout=cancelled",
  );
  assert.equal(
    paymentReturnPath("everestlocal://booking/success?booking_id=b1"),
    "/booking?id=b1&checkout=success",
  );
  assert.equal(paymentReturnPath("/messages"), "/messages");
});
