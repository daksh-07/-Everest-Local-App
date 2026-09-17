import { supabase, requireSupabaseConfig } from './supabase';

export async function getOrCreateCart(){
 requireSupabaseConfig(); const {data:{user}}=await supabase.auth.getUser(); if(!user)throw new Error('Authentication required');
 const {data:existing}=await supabase.from('carts').select('id').eq('customer_id',user.id).maybeSingle(); if(existing)return existing.id;
 const {data,error}=await supabase.from('carts').insert({customer_id:user.id}).select('id').single(); if(error)throw new Error(error.message); return data.id;
}
export async function addToCart(productId:string,quantity=1){if(!Number.isInteger(quantity)||quantity<1)throw new Error('Invalid quantity');const cartId=await getOrCreateCart();const {data,error}=await supabase.from('cart_items').upsert({cart_id:cartId,product_id:productId,quantity},{onConflict:'cart_id,product_id'}).select().single();if(error)throw new Error(error.message);return data;}
export async function getCart(){const cartId=await getOrCreateCart();const {data,error}=await supabase.from('cart_items').select('id,quantity,product_id,products(id,name,price,sale_price,status,business_id)').eq('cart_id',cartId);if(error)throw new Error(error.message);return data??[];}
export async function removeFromCart(itemId:string){const {error}=await supabase.from('cart_items').delete().eq('id',itemId);if(error)throw new Error(error.message);}
export async function checkout(idempotencyKey:string){requireSupabaseConfig();const {data,error}=await supabase.functions.invoke('checkout',{body:{},headers:{'Idempotency-Key':idempotencyKey}});if(error)throw new Error(error.message);if(data?.error)throw new Error(data.error);return data as {orderId:string;orderNumber:string;total:number;checkoutUrl:string;reused:boolean};}
export async function myOrders(){const {data:{user}}=await supabase.auth.getUser();if(!user)return [];const {data,error}=await supabase.from('orders').select('id,order_number,status,payment_status,total,created_at,delivery_method').eq('customer_id',user.id).order('created_at',{ascending:false});if(error)throw new Error(error.message);return data??[];}
