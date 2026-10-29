import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  AppState,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { AppText as Text } from '@/components/ui/AppText';
import { HeaderIconButton, ScreenHeader } from '@/components/ui';
import { cartQuantityLimit, cartNeedsAttention } from '@/lib/cart-presentation';
import { formatMoney } from '@/lib/format';
import { AppTextInput as TextInput } from '@/components/ui/AppTextInput';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { TransactionLoading } from '@/components/ui/TransactionLoading';
import { OrderDetails } from '@/components/OrderDetails';
import { Ionicons } from '@/components/ui/Icon';
import {
  checkoutEligibilityMessage,
  cartUnitPrice,
  checkout,
  getCart,
  pendingCartCheckout,
  removeFromCart,
  setCartQuantity,
} from '@/lib/commerce';
import type {
  CartItem,
  PendingCartCheckout,
  ProductDeliveryMethod,
} from '@/lib/commerce';
import {signedProductMediaBatch} from '@/lib/product-commerce';
import { type ThemeColors, useAppTheme } from '@/lib/theme';

function newCheckoutAttemptKey() {
  return `cart-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export default function Cart() {
  const { colors } = useAppTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<CartItem[]>([]);
  const [thumbs,setThumbs]=useState<Record<string,string>>({});
  const thumbVersion=useRef(0);
  async function loadThumbs(rows:CartItem[]){
    const version=++thumbVersion.current;setThumbs({});
    try{
      const covers=rows.map(item=>{const images=[...(item.products?.product_images??[])].sort((a,b)=>Number(Boolean(b.is_primary))-Number(Boolean(a.is_primary))||(a.sort_order??0)-(b.sort_order??0));return {id:item.product_id,path:images[0]?.storage_path||images[0]?.url||null}}).filter(cover=>cover.path);
      if(!covers.length)return;
      const urls=await signedProductMediaBatch(covers.map(cover=>cover.path));
      if(mountedRef.current&&version===thumbVersion.current)setThumbs(Object.fromEntries(covers.map(cover=>[cover.id,urls[cover.path as string]]).filter(([,url])=>Boolean(url))));
    }catch{/* Product text and checkout remain usable when thumbnails fail. */}
  }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [method, setMethod] = useState<ProductDeliveryMethod>('PICKUP');
  const [address, setAddress] = useState('');
  const [country,setCountry]=useState('');const [countryError,setCountryError]=useState('');const countryRef=useRef<TextInput>(null);
  const [addressError, setAddressError] = useState('');
  const addressRef = useRef<TextInput>(null);
  const [pendingItem, setPendingItem] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingCartCheckout | null>(null);
  const loadRef = useRef(false);
  const checkoutKey = useRef(newCheckoutAttemptKey());
  const loadAction = useRef<() => void>(() => {});
  const operationRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  async function load(
    mode: 'initial' | 'refresh' | 'silent' = 'initial',
    duringMutation = false,
  ) {
    if ((!duringMutation && operationRef.current) || loadRef.current) return;
    loadRef.current = true;
    if (mode === 'initial') setLoading(true);
    else if (mode === 'refresh') setRefreshing(true);
    setError('');
    try {
      const [rows, active] = await Promise.all([
        getCart(),
        pendingCartCheckout(),
      ]);
      setItems(rows);void loadThumbs(rows);
      setPending(active);
      if (!active) checkoutKey.current = newCheckoutAttemptKey();
    } catch {
      setError(
        items.length
          ? 'Your cart could not be refreshed. Showing your last loaded cart.'
          : 'Your cart is unavailable. Sign in if your session ended, or try again.',
      );
    } finally {
      loadRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }
  loadAction.current = () => void load('refresh');
  useFocusEffect(
    useCallback(() => {
      loadAction.current();
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') loadAction.current();
      });
      return () => sub.remove();
    }, []),
  );
  async function mutate(
    action: () => Promise<void>,
    message: string,
    itemId: string,
  ) {
    if (operationRef.current || loadRef.current || refreshing) return;
    operationRef.current = true;
    setBusy(true);
    setPendingItem(itemId);
    setError('');
    try {
      await action();
      checkoutKey.current = `cart-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      await load('silent', true);
      operationRef.current = false;
      setBusy(false);
      setPendingItem(null);
    } catch {
      setError(message);
      operationRef.current = false;
      setBusy(false);
      setPendingItem(null);
    }
  }
  async function remove(item: CartItem) {
    await mutate(
      () => removeFromCart(item.product_id, item.variant_id),
      'Could not remove that item. Please try again.',
      item.id,
    );
  }
  async function change(item: CartItem, delta: number) {
    const next = item.quantity + delta;
    if (delta > 0 && next > cartQuantityLimit(item)) return;
    if (next < 1) {
      await remove(item);
      return;
    }
    await mutate(
      () => setCartQuantity(item.product_id, item.variant_id, next),
      'Could not update your cart. Check stock availability and try again.',
      item.id,
    );
  }
  const hasUnavailableProduct =
    !pending && items.some((i) => cartNeedsAttention(i));
  const businessIds = new Set(
    items.map((i) => i.products?.business_id).filter(Boolean),
  );
  const hasMultipleBusinesses = businessIds.size > 1;
  const deliveryAvailable =
    items.length > 0 &&
    !hasUnavailableProduct &&
    !hasMultipleBusinesses &&
    items.every((i) => i.products?.delivery_eligible === true);
  const pickupAvailable =
    items.length > 0 &&
    !hasUnavailableProduct &&
    !hasMultipleBusinesses &&
    items.every((i) => i.products?.pickup_available !== false);
  const shippingAvailable =
    items.length > 0 &&
    !hasUnavailableProduct &&
    !hasMultipleBusinesses &&
    items.every((i) => i.products?.shipping_available === true);
  const hasFulfillmentMethod =
    pickupAvailable || deliveryAvailable || shippingAvailable;
  useEffect(() => {
    if (method === 'EVEREST_DELIVERY' && !deliveryAvailable)
      setMethod(
        pickupAvailable ? 'PICKUP' : shippingAvailable ? 'SHIPPING' : 'PICKUP',
      );
    if (method === 'SHIPPING' && !shippingAvailable)
      setMethod(
        pickupAvailable
          ? 'PICKUP'
          : deliveryAvailable
            ? 'EVEREST_DELIVERY'
            : 'PICKUP',
      );
    if (method === 'PICKUP' && !pickupAvailable) {
      if (deliveryAvailable) setMethod('EVEREST_DELIVERY');
      else if (shippingAvailable) setMethod('SHIPPING');
    }
  }, [deliveryAvailable, pickupAvailable, shippingAvailable, method]);
  async function pay() {
    if (operationRef.current || loadRef.current || refreshing) return;
    if (
      !pending &&
      (hasUnavailableProduct || hasMultipleBusinesses || !hasFulfillmentMethod)
    ) {
      setError(
        hasMultipleBusinesses
          ? 'Checkout supports products from one business at a time. Remove items from the other business before continuing.'
          : hasUnavailableProduct
            ? 'Remove unavailable products before checking out.'
            : 'This order has no available fulfilment method. Return to the product and choose another item.',
      );
      return;
    }
    if (!pending && method !== 'PICKUP' && address.trim().length < 5) {
      setAddressError(
        'Enter a delivery address, including city or locality and postal code if used.',
      );
      addressRef.current?.focus();
      return;
    }
    setAddressError('');
    if(!pending&&method!=='PICKUP'&&(country.trim().length<2||country.trim().length>150)){setCountryError('Enter the destination country.');countryRef.current?.focus();return;}
    setCountryError('');
    operationRef.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await checkout(
        checkoutKey.current,
        pending ? 'PICKUP' : method,
        pending || method === 'PICKUP' ? null : address,
        pending || method === 'PICKUP' ? null : country,
      );
      if (!mountedRef.current) return;
      if (!result.checkoutUrl) {
        if (result.checkoutState === 'EXPIRED') {
          checkoutKey.current = newCheckoutAttemptKey();
          setPending(null);
          await load('silent', true);
          if (!mountedRef.current) return;
        }
        router.push({
          pathname: '/orders',
          params: {
            order_id: result.orderId,
            checkout:
              result.checkoutState === 'EXPIRED' ? 'expired' : 'returned',
          },
        });
        return;
      }
      setPending({
        id: result.orderId,
        total: result.total,
        delivery_method: pending?.delivery_method ?? method,
      });
      if (Platform.OS === 'web' && typeof window !== 'undefined')
        window.location.assign(result.checkoutUrl);
      else {
        if (!(await Linking.canOpenURL(result.checkoutUrl))) throw new Error();
        await Linking.openURL(result.checkoutUrl);
      }
    } catch (error) {
      setError(checkoutEligibilityMessage(error)||
        'Checkout could not be opened. Try again, or check Orders before starting another payment.',
      );
    } finally {
      operationRef.current = false;
      setBusy(false);
    }
  }
  const locked = busy || refreshing || !!pending;
  const checkoutDisabled =
    busy ||
    refreshing ||
    (!pending &&
      (hasUnavailableProduct ||
        hasMultipleBusinesses ||
        !hasFulfillmentMethod));
  const subtotal = items.reduce(
    (sum, item) => sum + cartUnitPrice(item) * item.quantity,
    0,
  );
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load('refresh')}
            enabled={!busy}
            tintColor={colors.text}
          />
        }
        contentContainerStyle={s.page}
      >
        <ScreenHeader
          title="Your cart"
          subtitle="Review your items, then choose how to get them."
          fallback="/shop"
          actions={
            <HeaderIconButton
              icon="storefront-outline"
              label="Continue shopping"
              onPress={() => router.push('/shop')}
            />
          }
        />
        {pending ? (
          <View style={s.warning}>
            <Text style={s.warningTitle}>Checkout in progress</Text>
            <Text style={s.warningText}>
              Your saved items, total and fulfilment details are reserved.
              Resume the same secure checkout or view its order.
            </Text>
            <Text style={s.warningTitle}>
              Saved checkout total · {formatMoney(pending.total)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Resume secure checkout"
              accessibilityState={{
                busy: busy && !pendingItem,
                disabled: checkoutDisabled,
              }}
              disabled={checkoutDisabled}
              onPress={() => void pay()}
              style={({ pressed }) => [
                s.button,
                checkoutDisabled && s.buttonDisabled,
                pressed && !checkoutDisabled && { opacity: 0.86 },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onBrand} />
              ) : (
                <Text style={s.buttonText}>Resume secure checkout</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/orders',
                  params: { order_id: pending.id },
                })
              }
              style={s.warningRetry}
            >
              <Text style={s.retryText}>View order</Text>
            </Pressable>
          </View>
        ) : null}
        {loading ? (
          <TransactionLoading kind="cart" label="Loading your cart…" />
        ) : error && !items.length ? (
          <View style={s.errorBox}>
            <Text style={s.error}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/auth')}
              style={s.retry}
            >
              <Text style={s.retryText}>Sign in</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void load()}
              disabled={locked}
              style={s.retry}
            >
              <Text style={s.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : pending ? (
          <View>
            {error ? <Text style={s.error}>{error}</Text> : null}
            <OrderDetails id={pending.id} customerActions={false} />
          </View>
        ) : items.length ? (
          <>
            {error ? (
              <View style={s.warning}>
                <Text style={s.warningTitle}>Cart update unavailable</Text>
                <Text style={s.warningText}>{error}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void load('refresh')}
                  disabled={locked}
                  style={s.warningRetry}
                >
                  <Text style={s.retryText}>
                    {refreshing ? 'Retrying…' : 'Try again'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <Text accessibilityRole="header" style={s.section}>
              1. Your items
            </Text>
            {items.map((item) => (
              <View style={s.card} key={item.id}>
                <View style={s.row}>{thumbs[item.product_id]?<Image accessibilityLabel={item.products?.name??'Product photo'} source={{uri:thumbs[item.product_id]}} style={{width:44,height:44,borderRadius:9,marginRight:10}}/>:null}
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>
                      {item.products?.name ?? 'Product unavailable'}
                    </Text>
                    {item.products?.businesses?.name ? (
                      <Text style={s.meta}>
                        {item.products.businesses.name}
                      </Text>
                    ) : null}
                    {item.product_variants?.title ? (
                      <Text style={s.variant}>
                        {item.product_variants.title}
                      </Text>
                    ) : null}
                    <Text style={s.meta}>
                      {item.products
                        ? `${formatMoney(cartUnitPrice(item))} each`
                        : 'This product is no longer available.'}
                    </Text>
                    {!pending && cartNeedsAttention(item) && (
                      <Text style={s.unavailable}>Check availability</Text>
                    )}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.products?.name ?? 'item'} from cart`}
                    onPress={() => void remove(item)}
                    disabled={locked}
                    style={{
                      minHeight: 44,
                      minWidth: 60,
                      alignItems: 'flex-end',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={s.remove}>Remove</Text>
                  </Pressable>
                </View>
                {item.products?.status === 'ACTIVE' && (
                  <View style={s.itemFooter}>
                    <View style={s.qty}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Decrease quantity of ${item.products?.name}`}
                        onPress={() => void change(item, -1)}
                        disabled={locked}
                        style={s.qtyButton}
                      >
                        <Text style={s.qtyButtonText}>−</Text>
                      </Pressable>
                      <View style={{ minWidth: 24, alignItems: 'center' }}>
                        {pendingItem === item.id ? (
                          <ActivityIndicator
                            accessibilityLabel={`Updating ${item.products?.name}`}
                            color={colors.primary}
                          />
                        ) : (
                          <Text style={s.qtyText}>{item.quantity}</Text>
                        )}
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Increase quantity of ${item.products?.name}`}
                        onPress={() => void change(item, 1)}
                        disabled={
                          locked || item.quantity >= cartQuantityLimit(item)
                        }
                        style={[
                          s.qtyButton,
                          item.quantity >= cartQuantityLimit(item) &&
                            s.disabled,
                        ]}
                      >
                        <Text style={s.qtyButtonText}>+</Text>
                      </Pressable>
                    </View>
                    <Text tabular style={s.lineTotal}>
                      {formatMoney(cartUnitPrice(item) * item.quantity)}
                    </Text>
                  </View>
                )}
              </View>
            ))}
            {hasUnavailableProduct && (
              <View style={s.warning}>
                <Text style={s.warningTitle}>Cart needs attention</Text>
                <Text style={s.warningText}>
                  One or more products are no longer available. Remove them
                  before continuing to checkout.
                </Text>
              </View>
            )}
            {hasMultipleBusinesses && (
              <View style={s.warning}>
                <Text style={s.warningTitle}>Separate orders required</Text>
                <Text style={s.warningText}>
                  Checkout supports one local business per order. Remove
                  products from the other business, complete this order, then
                  add them again for a separate checkout.
                </Text>
              </View>
            )}
            {!hasUnavailableProduct &&
              !hasMultipleBusinesses &&
              !hasFulfillmentMethod && (
                <View style={s.warning}>
                  <Text style={s.warningTitle}>
                    No fulfilment method available
                  </Text>
                  <Text style={s.warningText}>
                    This order cannot be checked out because the business has
                    not enabled pickup, delivery or shipping for every item.
                  </Text>
                </View>
              )}
            {!pending && !hasUnavailableProduct && !hasMultipleBusinesses && (
              <>
                <Text accessibilityRole="header" style={s.section}>
                  2. How to get your order
                </Text>
                <View style={s.options}>
                  {pickupAvailable && (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{
                        disabled: locked,
                        checked: method === 'PICKUP',
                      }}
                      disabled={locked}
                      onPress={() => setMethod('PICKUP')}
                      style={[
                        s.option,
                        method === 'PICKUP' && s.optionSelected,
                      ]}
                    >
                      <View style={s.optionHeading}>
                        <Ionicons
                          name={
                            method === 'PICKUP'
                              ? 'radio-button-on'
                              : 'radio-button-off'
                          }
                          size={20}
                          color={
                            method === 'PICKUP' ? colors.primary : colors.muted
                          }
                        />
                        <Text style={s.optionTitle}>Pickup</Text>
                      </View>
                      <Text style={s.optionDetail}>
                        Collect from the business
                      </Text>
                    </Pressable>
                  )}
                  {deliveryAvailable && (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{
                        disabled: locked,
                        checked: method === 'EVEREST_DELIVERY',
                      }}
                      disabled={locked}
                      onPress={() => setMethod('EVEREST_DELIVERY')}
                      style={[
                        s.option,
                        method === 'EVEREST_DELIVERY' && s.optionSelected,
                      ]}
                    >
                      <View style={s.optionHeading}>
                        <Ionicons
                          name={
                            method === 'EVEREST_DELIVERY'
                              ? 'radio-button-on'
                              : 'radio-button-off'
                          }
                          size={20}
                          color={
                            method === 'EVEREST_DELIVERY'
                              ? colors.primary
                              : colors.muted
                          }
                        />
                        <Text style={s.optionTitle}>Everest Delivery</Text>
                      </View>
                      <Text style={s.optionDetail}>Local delivery</Text>
                    </Pressable>
                  )}
                  {shippingAvailable && (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{
                        disabled: locked,
                        checked: method === 'SHIPPING',
                      }}
                      disabled={locked}
                      onPress={() => setMethod('SHIPPING')}
                      style={[
                        s.option,
                        method === 'SHIPPING' && s.optionSelected,
                      ]}
                    >
                      <View style={s.optionHeading}>
                        <Ionicons
                          name={
                            method === 'SHIPPING'
                              ? 'radio-button-on'
                              : 'radio-button-off'
                          }
                          size={20}
                          color={
                            method === 'SHIPPING'
                              ? colors.primary
                              : colors.muted
                          }
                        />
                        <Text style={s.optionTitle}>Shipping</Text>
                      </View>
                      <Text style={s.optionDetail}>
                        Sent by the local business
                      </Text>
                    </Pressable>
                  )}
                </View>
                {method !== 'PICKUP' && (
                  <>
                    <Text style={s.addressLabel}>Delivery address</Text>
                    <TextInput
                      ref={addressRef}
                      value={address}
                      onChangeText={(value) => {
                        setAddress(value);
                        if (value.trim().length >= 5) setAddressError('');
                      }}
                      editable={!locked}
                      accessibilityLabel="Delivery or shipping address"
                      autoComplete="street-address"
                      textContentType="fullStreetAddress"
                      placeholder="Street address, city or locality, postal code if used"
                      returnKeyType="next" onSubmitEditing={()=>countryRef.current?.focus()}
                      placeholderTextColor={colors.muted}
                      autoCapitalize="words"
                      style={[
                        s.input,
                        !!addressError && { borderColor: colors.danger },
                      ]}
                    />
                    {addressError ? (
                      <Text
                        accessibilityRole="alert"
                        accessibilityLiveRegion="polite"
                        style={s.error}
                      >
                        {addressError}
                      </Text>
                    ) : (
                      <Text style={s.meta}>
                        Include your street, city or locality and postal code if used.
                      </Text>
                    )}
                    <Text style={s.addressLabel}>Country</Text>
                    <TextInput ref={countryRef} value={country} onChangeText={value=>{setCountry(value);setCountryError('')}} editable={!locked} accessibilityLabel="Destination country" autoComplete="country" textContentType="countryName" autoCapitalize="words" placeholder="Country for delivery or shipping" placeholderTextColor={colors.muted} returnKeyType="go" onSubmitEditing={()=>void pay()} style={[s.input,!!countryError&&{borderColor:colors.danger}]}/>
                    {countryError?<Text accessibilityRole="alert" style={s.error}>{countryError}</Text>:null}
                    <Text style={s.meta}>Delivery and shipping stay within the business’s country. Check the seller’s delivery area before paying. Prices are in AUD.</Text>
                  </>
                )}
              </>
            )}
            <Text accessibilityRole="header" style={s.section}>
              3. Review & checkout
            </Text>
            <Text style={s.meta}>Prices are in AUD. Review fulfilment and the final total before paying.</Text>
            <View style={s.summary}>
              <View style={s.total}>
                <Text style={s.totalLabel}>Item subtotal</Text>
                <Text tabular style={s.totalValue}>
                  {formatMoney(subtotal)}
                </Text>
              </View>
              <Text style={s.note}>
                You’ll confirm the final total, including delivery or shipping,
                before paying.
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Continue to secure checkout'}
                accessibilityState={{
                  busy: busy && !pendingItem,
                  disabled: checkoutDisabled,
                }}
                disabled={checkoutDisabled}
                onPress={() => void pay()}
                style={({ pressed }) => [
                  s.button,
                  checkoutDisabled && s.buttonDisabled,
                  pressed && !checkoutDisabled && { opacity: 0.86 },
                ]}
              >
                {busy && !pendingItem ? (
                  <ActivityIndicator color={colors.onBrand} />
                ) : (
                  <Text
                    style={[
                      s.buttonText,
                      checkoutDisabled && s.buttonTextDisabled,
                    ]}
                  >
                    Continue to secure checkout
                  </Text>
                )}
              </Pressable>
              <View style={s.secureNote}>
                <Ionicons
                  name="lock-closed-outline"
                  size={14}
                  color={colors.muted}
                />
                <Text style={s.meta}>
                  Payment is completed securely with Stripe.
                </Text>
              </View>
            </View>
          </>
        ) : (
          <View style={s.empty}>
            <Ionicons
              name="bag-handle-outline"
              size={30}
              color={colors.muted}
            />
            <Text style={s.emptyTitle}>Your cart is empty.</Text>
            <Text style={s.meta}>
              Add products from local businesses and they’ll show up here.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/shop')}
              style={s.shopButton}
            >
              <Text style={s.shopButtonText}>Shop local</Text>
              <Ionicons name="arrow-forward" size={15} color={colors.onBrand} />
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    itemFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 14,
      gap: 12,
    },
    lineTotal: { fontSize: 17, fontWeight: '600', color: c.text },
    optionHeading: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    optionDetail: {
      fontSize: 13,
      lineHeight: 18,
      color: c.textSecondary,
      marginTop: 4,
      marginLeft: 30,
    },
    addressLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
      marginTop: 16,
    },
    summary: {
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    secureNote: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 12,
      flexWrap: 'wrap',
    },
    safe: { flex: 1, backgroundColor: c.canvas },
    page: {
      paddingHorizontal: 18,
      paddingTop: 4,
      paddingBottom: 50,
      maxWidth: 760,
      width: '100%',
      alignSelf: 'center',
    },
    card: {
      backgroundColor: c.surface,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      marginBottom: 10,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    name: { fontSize: 15, fontWeight: '600', color: c.text },
    variant: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
      marginTop: 5,
    },
    meta: { fontSize: 12, color: c.muted, marginTop: 5 },
    unavailable: {
      fontSize: 12,
      fontWeight: '600',
      color: c.danger,
      marginTop: 6,
    },
    remove: { fontSize: 12, fontWeight: '600', color: c.text },
    qty: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 0 },
    qtyButton: {
      width: 44,
      height: 44,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qtyButtonText: { color: c.text },
    qtyText: { fontSize: 14, fontWeight: '600', color: c.text },
    warning: {
      backgroundColor: c.warningContainer,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      marginTop: 8,
      marginBottom: 10,
    },
    warningTitle: { fontSize: 14, fontWeight: '600', color: c.warning },
    warningText: { fontSize: 12, color: c.muted, lineHeight: 17, marginTop: 4 },
    warningRetry: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 7,
    },
    total: { flexDirection: 'row', justifyContent: 'space-between' },
    totalLabel: { fontSize: 14, fontWeight: '700', color: c.text },
    totalValue: { fontSize: 20, fontWeight: '700', color: c.text },
    section: {
      fontSize: 17,
      fontWeight: '600',
      marginTop: 24,
      marginBottom: 10,
      color: c.text,
    },
    options: { gap: 8 },
    option: {
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
    },
    optionSelected: {
      borderColor: c.primary,
      backgroundColor: c.primaryContainer,
    },
    optionTitle: { fontSize: 15, fontWeight: '600', color: c.text },
    input: {
      height: 50,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      paddingHorizontal: 14,
      marginTop: 10,
      fontSize: 16,
      color: c.text,
    },
    note: { fontSize: 12, color: c.muted, lineHeight: 17, marginTop: 12 },
    button: {
      minHeight: 54,
      paddingVertical: 14,
      borderRadius: 15,
      backgroundColor: c.brand,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 18,
    },
    disabled: { opacity: 0.45 },
    buttonText: { color: c.onBrand, fontSize: 16, fontWeight: '600' },
    buttonDisabled: { backgroundColor: c.disabled },
    buttonTextDisabled: { color: c.onDisabled },
    empty: {
      backgroundColor: c.surface,
      borderRadius: 20,
      padding: 28,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: c.text,
      marginTop: 10,
    },
    shopButton: {
      height: 46,
      paddingHorizontal: 18,
      borderRadius: 14,
      backgroundColor: c.brand,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 7,
      marginTop: 18,
    },
    shopButtonText: { fontSize: 14, fontWeight: '600', color: c.onBrand },
    errorBox: {
      backgroundColor: c.surface,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
    },
    error: { color: c.danger, fontSize: 14, lineHeight: 20 },
    retry: {
      marginTop: 14,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    retryText: { fontSize: 15, fontWeight: '600', color: c.text },
  });
