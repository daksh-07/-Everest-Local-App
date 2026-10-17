import type { Order } from './types';

export function orderMethod(method: string | null) {
  return method === 'PICKUP'
    ? 'Pickup'
    : method === 'SHIPPING'
      ? 'Shipping'
      : method === 'EVEREST_DELIVERY' ||
          method === 'SAME_DAY' ||
          method === 'DELIVERY'
        ? 'Everest Delivery'
        : 'Fulfilment to confirm';
}
export function orderIsFinished(order: Pick<Order, 'status'>) {
  return ['DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'].includes(
    order.status,
  );
}
/** Explain only confirmed server states. Never infer payment success from a checkout return. */
export function orderGuidance(
  order: Pick<Order, 'status' | 'payment_status' | 'delivery_method'>,
): {
  title: string;
  detail: string;
  tone: 'warning' | 'success' | 'info' | 'neutral' | 'danger';
} {
  if (order.status === 'CANCELLED')
    return {
      title: 'Order cancelled',
      detail: 'Check the payment status below for refund information.',
      tone: 'neutral',
    };
  if (order.status === 'REFUNDED')
    return {
      title: 'Order refunded',
      detail: 'Your bank may take time to show the refund.',
      tone: 'neutral',
    };
  if (order.status === 'COMPLETED' || order.status === 'DELIVERED')
    return {
      title:
        order.delivery_method === 'PICKUP'
          ? 'Order completed'
          : 'Order delivered',
      detail: 'Keep your order number if you need help with this purchase.',
      tone: 'success',
    };
  if (order.payment_status === 'FAILED')
    return {
      title: 'Payment unsuccessful',
      detail:
        'Payment has not completed. Contact support with your order number if you need help.',
      tone: 'danger',
    };
  if (order.payment_status === 'REQUIRES_ACTION')
    return {
      title: 'Payment needs attention',
      detail:
        'Complete the verification in secure checkout. Refresh here to check the result.',
      tone: 'warning',
    };
  if (order.status === 'PENDING')
    return {
      title: 'Awaiting payment confirmation',
      detail:
        'Refresh after checkout. Your order is confirmed only when the payment update arrives.',
      tone: 'warning',
    };
  if (order.status === 'PAYMENT_CONFIRMED')
    return {
      title: 'Payment confirmed',
      detail: 'Waiting for the business to accept your order.',
      tone: 'info',
    };
  if (order.status === 'ACCEPTED' || order.status === 'PREPARING')
    return {
      title:
        order.status === 'ACCEPTED' ? 'Order accepted' : 'Preparing your order',
      detail:
        order.delivery_method === 'PICKUP'
          ? 'Wait until your order is ready before collecting.'
          : 'The business is getting your items ready to send.',
      tone: 'info',
    };
  if (order.status === 'READY_FOR_PICKUP')
    return order.delivery_method === 'PICKUP'
      ? {
          title: 'Ready to collect',
          detail:
            'Have your order number ready when you collect from the business.',
          tone: 'success',
        }
      : {
          title: 'Ready for dispatch',
          detail:
            'Your items are ready. Waiting for collection by the delivery provider.',
          tone: 'info',
        };
  if (order.status === 'OUT_FOR_DELIVERY')
    return {
      title: 'Your order is on its way',
      detail:
        'Check the delivery update below for the latest available information.',
      tone: 'info',
    };
  return {
    title: 'Order update',
    detail: 'Refresh to check the latest status from the business.',
    tone: 'neutral',
  };
}
