import { supabase } from './supabase';
import type { Order } from './types';
export type OrderLine = {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  variant_snapshot: { title?: string } | null;
};
export type OrderDetail = Order & {
  business_id: string;
  subtotal: number;
  delivery_fee: number;
  tax: number;
  updated_at: string;
  delivery_address: Record<string, unknown> | null;
  businesses: {
    name: string;
    address_line: string | null;
    suburb: string | null;
    city: string | null;
    state: string | null;
    postcode: string | null;
  } | null;
  order_items: OrderLine[];
};
const detailFields =
  'id,business_id,order_number,status,payment_status,subtotal,delivery_fee,tax,total,created_at,updated_at,delivery_method,delivery_address,businesses(name,address_line,suburb,city,state,postcode),order_items(id,product_id,product_name,quantity,unit_price,line_total,variant_snapshot)';
/** Both reads keep an explicit actor/workspace scope in addition to existing RLS. */
export async function customerOrder(id: string): Promise<OrderDetail> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user)
    throw new Error('Please sign in again to view this order.');
  const { data, error } = await supabase
    .from('orders')
    .select(detailFields)
    .eq('id', id)
    .eq('customer_id', user.id)
    .single();
  if (error || !data)
    throw new Error('This order could not be loaded. Please try again.');
  return normalizeOrder(data);
}
export async function businessOrder(
  id: string,
  businessId: string,
): Promise<OrderDetail> {
  if (!businessId) throw new Error('Select a business workspace first.');
  const { data, error } = await supabase
    .from('orders')
    .select(detailFields)
    .eq('id', id)
    .eq('business_id', businessId)
    .single();
  if (error || !data)
    throw new Error(
      'This workspace order could not be loaded. Please try again.',
    );
  return normalizeOrder(data);
}
function normalizeOrder(raw: unknown): OrderDetail {
  const row = raw as OrderDetail;
  return {
    ...row,
    businesses: Array.isArray(row.businesses)
      ? (row.businesses[0] ?? null)
      : row.businesses,
    order_items: Array.isArray(row.order_items) ? row.order_items : [],
  };
}
