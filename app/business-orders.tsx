import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppText as Text } from '@/components/ui/AppText';
import {
  ScreenHeader,
  HeaderIconButton,
  StatusBadge,
  ConfirmSheet,
} from '@/components/ui';
import { OrderDetails } from '@/components/OrderDetails';
import { supabase } from '@/lib/supabase';
import { getWorkspaceContext, type BusinessWorkspace } from '@/lib/workspace';
import { useAppTheme, type ThemeColors } from '@/lib/theme';
import { formatDay, formatMoney, formatStatus } from '@/lib/format';
import {
  merchantOrderAction,
  orderGuidance,
  orderIsFinished,
  orderMethod,
} from '@/lib/order-presentation';
import type { Order, OrderStatus } from '@/lib/types';

type BusinessOrder = Order & {
  subtotal: number;
  marketplace_fee?: number;
  provider_net?: number;
};
type Pending = {
  order: BusinessOrder;
  status?: OrderStatus;
  delivery?: boolean;
  label: string;
};
export default function BusinessOrders() {
  const { colors: c } = useAppTheme();
  const s = useMemo(() => styles(c), [c]);
  const [workspace, setWorkspace] = useState<BusinessWorkspace | null>(null);
  const [orders, setOrders] = useState<BusinessOrder[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [deliveryError, setDeliveryError] = useState('');
  const [view, setView] = useState<'active' | 'history'>('active');
  const [expanded, setExpanded] = useState('');
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const loadRef = useRef(false);
  const operationRef = useRef(false);
  const loadAction = useRef(() => {});
  async function load(
    mode: 'initial' | 'refresh' | 'silent' = 'initial',
    duringOperation = false,
  ) {
    if (loadRef.current || (operationRef.current && !duringOperation)) return;
    loadRef.current = true;
    if (mode === 'refresh') setRefreshing(true);
    setError('');
    try {
      const ctx = await getWorkspaceContext();
      const current =
        ctx.mode === 'BUSINESS'
          ? ctx.businesses.find((b) => b.id === ctx.active_business_id)
          : null;
      if (!current?.can_view_orders) {
        setWorkspace(null);
        setOrders([]);
        setDeliveries({});
        throw new Error('access');
      }
      setWorkspace(current);
      const financial = current.can_view_finance
        ? ',marketplace_fee,provider_net'
        : '';
      const { data, error: e } = await supabase
        .from('orders')
        .select(
          'id,order_number,status,payment_status,subtotal,total,created_at,delivery_method' +
            financial,
        )
        .eq('business_id', current.id)
        .order('created_at', { ascending: false });
      if (e) throw e;
      const rows = (data ?? []) as unknown as BusinessOrder[];
      setOrders(rows);
      setVersion((v) => v + 1);
      setDeliveryError('');
      if (!rows.length) {
        setDeliveries({});
        return;
      }
      const result = await supabase
        .from('deliveries')
        .select('order_id,status')
        .in(
          'order_id',
          rows.map((o) => o.id),
        );
      if (result.error)
        setDeliveryError(
          'Delivery updates could not be refreshed. Last loaded updates may be out of date.',
        );
      else
        setDeliveries(
          Object.fromEntries(
            (result.data ?? []).map((d) => [d.order_id, d.status]),
          ),
        );
    } catch {
      setError(
        'Orders could not be loaded. Check your business workspace and order permissions, then try again.',
      );
    } finally {
      loadRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }
  loadAction.current = () => void load('refresh');
  useEffect(() => {
    loadAction.current();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadAction.current();
    });
    return () => sub.remove();
  }, []);
  async function perform() {
    if (!pending || !workspace || operationRef.current || loadRef.current)
      return;
    operationRef.current = true;
    setBusy(true);
    setError('');
    try {
      const ctx = await getWorkspaceContext();
      const current = ctx.businesses.find(
        (b) => b.id === ctx.active_business_id,
      );
      if (
        ctx.mode !== 'BUSINESS' ||
        current?.id !== workspace.id ||
        !current.can_manage_orders
      )
        throw new Error('Workspace changed');
      const result = pending.delivery
        ? await supabase.rpc('request_delivery_for_order', {
            p_order_id: pending.order.id,
          })
        : pending.status === 'COMPLETED'
          ? await supabase.rpc('complete_pickup_order', {
              p_order_id: pending.order.id,
            })
          : await supabase.rpc('update_order_status', {
              p_order_id: pending.order.id,
              p_next: pending.status,
            });
      if (
        result.error ||
        (pending.delivery
          ? typeof result.data !== 'string'
          : result.data !== true)
      )
        throw new Error('Order update rejected');
      setPending(null);
      await load('silent', true);
    } catch {
      setError(
        'The order could not be updated. Refresh to check its current status and try again.',
      );
    } finally {
      operationRef.current = false;
      setBusy(false);
    }
  }
  const active = orders.filter((o) => !orderIsFinished(o));
  const history = orders.filter(orderIsFinished);
  const shown = view === 'active' ? active : history;
  const locked = loading || refreshing || busy;
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        contentContainerStyle={s.page}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            enabled={!busy}
            onRefresh={() => loadAction.current()}
            tintColor={c.primary}
          />
        }
      >
        <ScreenHeader
          title="Orders"
          subtitle={workspace?.name ?? 'Business orders'}
          fallback="/business-today"
          actions={
            <HeaderIconButton
              icon="refresh-outline"
              label="Refresh business orders"
              onPress={() => loadAction.current()}
            />
          }
        />
        {error ? (
          <View style={s.notice}>
            <Text style={s.error}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => loadAction.current()}
              disabled={locked}
              style={s.action}
            >
              <Text style={s.link}>Retry orders</Text>
            </Pressable>
          </View>
        ) : null}
        {deliveryError ? (
          <View style={s.notice}>
            <Text style={s.copy}>{deliveryError}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => loadAction.current()}
              disabled={locked}
              style={s.action}
            >
              <Text style={s.link}>Retry delivery updates</Text>
            </Pressable>
          </View>
        ) : null}
        {loading ? (
          <ActivityIndicator
            accessibilityLabel="Loading business orders"
            color={c.primary}
            style={{ marginTop: 30 }}
          />
        ) : (
          <>
            <View style={s.tabs} accessibilityRole="tablist">
              {(['active', 'history'] as const).map((tab) => (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === view }}
                  onPress={() => setView(tab)}
                  key={tab}
                  style={[s.tab, tab === view && s.selected]}
                >
                  <Text
                    style={[s.tabText, tab === view && { color: c.onSelected }]}
                  >
                    {tab === 'active'
                      ? `To fulfil · ${active.length}`
                      : `History · ${history.length}`}
                  </Text>
                </Pressable>
              ))}
            </View>
            {shown.length ? (
              shown.map((o) => {
                const next = merchantOrderAction(o);
                const delivery = deliveries[o.id];
                const canRequest =
                  o.payment_status === 'SUCCEEDED' &&
                  o.status === 'READY_FOR_PICKUP' &&
                  ['EVEREST_DELIVERY', 'SAME_DAY'].includes(
                    o.delivery_method ?? '',
                  ) &&
                  (!delivery || ['FAILED', 'CANCELLED'].includes(delivery));
                return (
                  <View style={s.card} key={o.id}>
                    <View style={s.row}>
                      <Text accessibilityRole="header" style={s.title}>
                        Order {o.order_number}
                      </Text>
                      <Text tabular style={s.amount}>
                        {formatMoney(o.total)}
                      </Text>
                    </View>
                    <Text style={s.copy}>
                      {formatDay(o.created_at)} ·{' '}
                      {orderMethod(o.delivery_method)}
                    </Text>
                    <View style={{ marginTop: 12 }}>
                      <StatusBadge
                        label={formatStatus(o.status)}
                        tone={orderGuidance(o).tone}
                      />
                    </View>
                    <Text style={s.copy}>
                      Payment ·{' '}
                      {o.payment_status === 'SUCCEEDED'
                        ? 'Paid'
                        : formatStatus(o.payment_status)}
                    </Text>
                    {workspace?.can_view_finance ? (
                      <View style={s.fees}>
                        <Text style={s.copy}>
                          Product subtotal · {formatMoney(o.subtotal)}
                        </Text>
                        <Text style={s.copy}>
                          Everest fee · {formatMoney(o.marketplace_fee ?? 0)}
                        </Text>
                        <Text style={s.copy}>
                          Product proceeds before Stripe fees ·{' '}
                          {formatMoney(o.provider_net ?? 0)}
                        </Text>
                      </View>
                    ) : null}
                    {delivery ? (
                      <Text style={s.copy}>
                        Everest Delivery · {formatStatus(delivery)}
                        {deliveryError ? ' · last loaded update' : ''}
                      </Text>
                    ) : null}
                    {workspace?.can_manage_orders && next ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={locked}
                        onPress={() => {
                          setError('');
                          setPending({
                            order: o,
                            status: next.status,
                            label: next.label,
                          });
                        }}
                        style={s.primary}
                      >
                        <Text style={s.primaryText}>{next.label}</Text>
                      </Pressable>
                    ) : null}
                    {workspace?.can_manage_orders &&
                    canRequest &&
                    !deliveryError ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={locked}
                        onPress={() => {
                          setError('');
                          setPending({
                            order: o,
                            delivery: true,
                            label: 'Request Everest delivery',
                          });
                        }}
                        style={s.primary}
                      >
                        <Text style={s.primaryText}>
                          Request Everest delivery
                        </Text>
                      </Pressable>
                    ) : null}
                    {o.status === 'CANCELLED' || o.status === 'REFUNDED' ? (
                      <Text style={s.copy}>
                        Use the recorded payment status for cancellation or
                        refund reconciliation.
                      </Text>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: expanded === o.id }}
                      onPress={() =>
                        setExpanded((value) => (value === o.id ? '' : o.id))
                      }
                      style={s.action}
                    >
                      <Text style={s.link}>
                        {expanded === o.id
                          ? 'Hide order details'
                          : 'View items & fulfilment'}
                      </Text>
                    </Pressable>
                    {expanded === o.id && workspace ? (
                      <OrderDetails
                        id={o.id}
                        businessId={workspace.id}
                        version={version}
                      />
                    ) : null}
                  </View>
                );
              })
            ) : (
              <View style={s.empty}>
                <Text style={s.title}>
                  {view === 'active'
                    ? 'No orders to fulfil'
                    : 'No completed orders yet'}
                </Text>
                <Text style={s.copy}>
                  Customer purchases appear here with their recorded payment and
                  fulfilment status.
                </Text>
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/help')}
              style={s.action}
            >
              <Text style={s.link}>Order cancellation or refund help</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      <ConfirmSheet
        visible={!!pending}
        title={pending?.label ?? 'Update order'}
        subtitle={pending ? 'Order ' + pending.order.order_number : undefined}
        rows={
          pending
            ? [
                { label: 'Total', value: formatMoney(pending.order.total) },
                {
                  label: 'Fulfilment',
                  value: orderMethod(pending.order.delivery_method),
                },
              ]
            : undefined
        }
        note={
          error ||
          'Confirm the order details before updating its fulfilment status.'
        }
        confirmLabel={pending?.label ?? 'Confirm update'}
        busy={busy}
        onCancel={() => setPending(null)}
        onConfirm={() => void perform()}
      />
    </SafeAreaView>
  );
}
const styles = (c: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.canvas },
    page: {
      padding: 18,
      paddingBottom: 60,
      maxWidth: 760,
      width: '100%',
      alignSelf: 'center',
    },
    tabs: { flexDirection: 'row', gap: 8, marginTop: 20, marginBottom: 16 },
    tab: {
      flex: 1,
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor: c.elevated,
    },
    selected: { backgroundColor: c.selected },
    tabText: { fontSize: 14, fontWeight: '600', color: c.textSecondary },
    card: {
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 16,
      backgroundColor: c.surface,
      marginBottom: 12,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 12,
    },
    title: {
      fontSize: 17,
      lineHeight: 23,
      fontWeight: '600',
      color: c.text,
      flexShrink: 1,
    },
    amount: { fontSize: 18, fontWeight: '600', color: c.text },
    copy: {
      fontSize: 14,
      lineHeight: 21,
      color: c.textSecondary,
      marginTop: 6,
    },
    fees: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
      marginTop: 12,
      paddingTop: 6,
    },
    primary: {
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 16,
      paddingHorizontal: 12,
    },
    primaryText: { fontSize: 15, fontWeight: '600', color: c.onPrimary },
    action: { minHeight: 44, justifyContent: 'center', marginTop: 6 },
    link: { fontSize: 14, fontWeight: '600', color: c.primaryText },
    notice: {
      padding: 14,
      borderRadius: 12,
      backgroundColor: c.elevated,
      marginTop: 12,
    },
    error: { fontSize: 14, lineHeight: 21, color: c.danger },
    empty: { paddingVertical: 28, gap: 6 },
  });
