import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppText as Text } from './ui/AppText';
import { useAppTheme } from '@/lib/theme';
import { businessOrder, customerOrder, type OrderDetail } from '@/lib/orders';
import { formatMoney, formatWhen, formatStatus } from '@/lib/format';
import { orderMethod } from '@/lib/order-presentation';
import { getOrCreateBusinessInquiry } from '@/lib/messaging';
import { userMessage } from '@/lib/errors';

export function OrderDetails({
  id,
  businessId,
  version = 0,
  customerActions = true,
}: {
  id: string;
  businessId?: string;
  version?: number;
  customerActions?: boolean;
}) {
  const { colors: c } = useAppTheme();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [contacting, setContacting] = useState(false);
  useEffect(() => {
    let active = true;
    setOrder(null);
    setError('');
    void (businessId ? businessOrder(id, businessId) : customerOrder(id))
      .then((value) => {
        if (active) setOrder(value);
      })
      .catch((e) => {
        if (active)
          setError(userMessage(e, 'Order details could not be loaded.'));
      });
    return () => {
      active = false;
    };
  }, [id, businessId, version, retry]);
  async function contact() {
    if (!order || contacting) return;
    setContacting(true);
    setError('');
    try {
      const productId = order.order_items[0]?.product_id;
      if (!productId) throw new Error('Product context unavailable');
      const conversationId = await getOrCreateBusinessInquiry({
        businessId: order.business_id,
        contextType: 'PRODUCT',
        contextId: productId,
      });
      router.push({
        pathname: '/messages',
        params: { marketId: conversationId },
      });
    } catch {
      setError('The conversation could not be opened. Please try again.');
    } finally {
      setContacting(false);
    }
  }
  const section = {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    paddingTop: 16,
    marginTop: 16,
    gap: 8,
  };
  const heading = { fontSize: 16, fontWeight: '600' as const, color: c.text };
  const body = { fontSize: 14, lineHeight: 21, color: c.textSecondary };
  if (!order)
    return (
      <View style={section}>
        {error ? (
          <>
            <Text style={{ ...body, color: c.danger }}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setRetry((v) => v + 1)}
              style={styles.action}
            >
              <Text style={{ ...body, color: c.primaryText }}>
                Retry order details
              </Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator
            accessibilityLabel="Loading order details"
            color={c.primary}
          />
        )}
      </View>
    );
  const merchant = order.businesses;
  const pickup = order.delivery_method === 'PICKUP';
  const pickupAddress = merchant
    ? [
        merchant.address_line,
        merchant.suburb,
        merchant.state,
        merchant.postcode,
      ]
        .filter(Boolean)
        .join(', ')
    : '';
  const destination =
    order.delivery_address &&
    [
      'address_line',
      'address_line1',
      'suburb',
      'city',
      'state',
      'postal_code',
      'country',
    ]
      .map((key) => order.delivery_address?.[key])
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .join(', ');
  return (
    <View>
      <View style={section}>
        <Text accessibilityRole="header" style={heading}>
          {merchant?.name ?? 'Merchant details unavailable'}
        </Text>
        <Text style={body}>
          Order {order.order_number} · {orderMethod(order.delivery_method)}
        </Text>
      </View>
      <View style={section}>
        <Text accessibilityRole="header" style={heading}>
          Items
        </Text>
        {order.order_items.length ? (
          order.order_items.map((item) => (
            <View key={item.id} style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...body, color: c.text, fontWeight: '500' }}>
                  {item.product_name}
                </Text>
                {item.variant_snapshot?.title ? (
                  <Text style={body}>{item.variant_snapshot.title}</Text>
                ) : null}
                <Text style={body}>
                  {item.quantity} × {formatMoney(item.unit_price)}
                </Text>
              </View>
              <Text tabular style={{ ...body, color: c.text }}>
                {formatMoney(item.line_total)}
              </Text>
            </View>
          ))
        ) : (
          <Text style={body}>
            Item records are unavailable. Refresh the order or contact support.
          </Text>
        )}
      </View>
      <View style={section}>
        <Text accessibilityRole="header" style={heading}>
          Price breakdown
        </Text>
        {[
          ['Items', order.subtotal],
          ['Delivery / shipping', order.delivery_fee],
          ['Tax', order.tax],
          ['Total', order.total],
        ].map(([label, value]) => (
          <View key={String(label)} style={styles.line}>
            <Text
              style={{
                ...body,
                color: label === 'Total' ? c.text : c.textSecondary,
                fontWeight: label === 'Total' ? '600' : '400',
              }}
            >
              {String(label)}
            </Text>
            <Text
              tabular
              style={{
                ...body,
                color: c.text,
                fontWeight: label === 'Total' ? '600' : '400',
              }}
            >
              {formatMoney(Number(value))}
            </Text>
          </View>
        ))}
        <Text style={body}>
          Payment ·{' '}
          {order.payment_status === 'SUCCEEDED'
            ? 'Paid'
            : formatStatus(order.payment_status)}
        </Text>
      </View>
      <View style={section}>
        <Text accessibilityRole="header" style={heading}>
          {pickup ? 'Pickup information' : 'Delivery information'}
        </Text>
        <Text selectable style={body}>
          {pickup
            ? pickupAddress ||
              'Contact the business to confirm the collection location.'
            : destination || 'No delivery address is recorded on this order.'}
        </Text>
        {pickup ? (
          <Text style={body}>
            {order.status === 'COMPLETED' || order.status === 'DELIVERED'
              ? 'Collection is recorded as completed.'
              : order.status === 'CANCELLED' || order.status === 'REFUNDED'
                ? 'This order is closed. Contact support if you need help.'
                : order.status === 'READY_FOR_PICKUP'
                  ? businessId
                    ? 'Ready for collection. Ask for the order number at handover.'
                    : 'Ready to collect. Show your order number at handover.'
                  : 'Wait until the business marks this order ready before collecting.'}
          </Text>
        ) : null}
      </View>
      <View style={section}>
        <Text accessibilityRole="header" style={heading}>
          Order activity
        </Text>
        <Text style={body}>Placed · {formatWhen(order.created_at)}</Text>
        {order.updated_at && order.updated_at !== order.created_at ? (
          <Text style={body}>
            Latest recorded update · {formatWhen(order.updated_at)} ·{' '}
            {formatStatus(order.status)}
          </Text>
        ) : null}
      </View>
      {!businessId && customerActions ? (
        <View style={section}>
          {order.status === 'PENDING' && order.payment_status === 'PENDING' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/cart')}
              style={styles.action}
            >
              <Text
                style={{ ...body, color: c.primaryText, fontWeight: '600' }}
              >
                View secure checkout in cart
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={contacting}
            onPress={() => void contact()}
            style={styles.action}
          >
            <Text style={{ ...body, color: c.primaryText, fontWeight: '600' }}>
              {contacting ? 'Opening conversation…' : 'Message the business'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/help')}
            style={styles.action}
          >
            <Text style={{ ...body, color: c.primaryText }}>
              Get help with this order
            </Text>
          </Pressable>
        </View>
      ) : null}
      {error ? <Text style={{ ...body, color: c.danger }}>{error}</Text> : null}
    </View>
  );
}
const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 4,
  },
  action: { minHeight: 44, justifyContent: 'center' },
});
