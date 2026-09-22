// Only trusted server configuration determines where Stripe sends customers.
// Never accept a return URL or origin from the checkout request.
export function checkoutReturnUrls(
  configuredOrigin: string | undefined,
  kind: 'order' | 'booking',
  id: string,
) {
  if (!configuredOrigin?.trim()) throw new Error('CHECKOUT_APP_ORIGIN is required');
  const origin = new URL(configuredOrigin.trim());
  if (origin.protocol !== 'https:' || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('CHECKOUT_APP_ORIGIN must be an HTTPS origin without credentials, path, query or fragment');
  }
  const destination = new URL(kind === 'order' ? '/orders' : '/bookings', origin.origin);
  destination.searchParams.set(kind === 'order' ? 'order_id' : 'booking_id', id);
  // A return visit is not evidence of payment. The destination reads backend state.
  return { success_url: destination.href, cancel_url: destination.href };
}
