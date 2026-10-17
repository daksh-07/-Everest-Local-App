/** Compatibility with Checkout sessions created before the HTTPS return fix. */
export function paymentReturnPath(path: string) {
  try {
    const url = new URL(path, 'everestlocal://');
    const route = (url.hostname + url.pathname).replace(/^\//, '');
    const result = route.endsWith('/cancelled') ? 'cancelled' : 'success';
    if (
      /^order\/(success|cancelled)$/.test(route) &&
      url.searchParams.get('order_id')
    )
      return (
        '/orders?order_id=' +
        encodeURIComponent(url.searchParams.get('order_id')!) +
        '&checkout=' +
        result
      );
    if (
      /^booking\/(success|cancelled)$/.test(route) &&
      url.searchParams.get('booking_id')
    )
      return (
        '/booking?id=' +
        encodeURIComponent(url.searchParams.get('booking_id')!) +
        '&checkout=' +
        result
      );
  } catch {
    /* Invalid external intents return to the app root. */ return '/';
  }
  return path;
}
