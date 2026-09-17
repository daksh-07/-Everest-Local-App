import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno';

const cors = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, idempotency-key' };
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), { status, headers:{...cors,'Content-Type':'application/json'} });

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:cors});
  if (req.method !== 'POST') return json({error:'Method not allowed'},405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY'); const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!supabaseUrl || !anon || !service || !stripeKey) return json({error:'Checkout is not configured'},503);
  const auth = req.headers.get('Authorization'); if (!auth) return json({error:'Authentication required'},401);
  const userClient = createClient(supabaseUrl,anon,{global:{headers:{Authorization:auth}}});
  const admin = createClient(supabaseUrl,service);
  const {data:{user},error:userError}=await userClient.auth.getUser(); if(userError||!user)return json({error:'Invalid session'},401);
  const idempotencyKey=req.headers.get('Idempotency-Key'); if(!idempotencyKey)return json({error:'Idempotency-Key required'},400);
  try {
    const {data:cart,error:cartError}=await admin.from('carts').select('id,customer_id,cart_items(id,quantity,product_id,products(id,name,price,sale_price,status,business_id,delivery_eligible))').eq('customer_id',user.id).single();
    if(cartError||!cart)return json({error:'Cart not found'},404);
    const items=(cart.cart_items??[]) as any[]; if(!items.length)return json({error:'Cart is empty'},400);
    const businessIds=[...new Set(items.map(i=>i.products?.business_id).filter(Boolean))]; if(businessIds.length!==1)return json({error:'Checkout currently requires products from one business per order'},400);
    let subtotal=0; const lineItems:any[]=[];
    for(const item of items){const p=item.products;if(!p||p.status!=='ACTIVE')return json({error:'A product in your cart is no longer available'},409);const unit=Number(p.sale_price??p.price);const qty=Number(item.quantity);if(!Number.isInteger(qty)||qty<=0) return json({error:'Invalid quantity'},400);const {data:reserved}=await admin.rpc('reserve_inventory',{p_product_id:p.id,p_quantity:qty});if(!reserved)return json({error:`Insufficient stock for ${p.name}`},409);const line=unit*qty;subtotal+=line;lineItems.push({product_id:p.id,product_name:p.name,unit_price:unit,quantity:qty,line_total:line});}
    const deliveryFee=0; const marketplaceFee=0; const tax=0; const total=Number((subtotal+deliveryFee+marketplaceFee+tax).toFixed(2));
    const orderNumber=`EL-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;
    const {data:order,error:orderError}=await admin.from('orders').insert({order_number:orderNumber,customer_id:user.id,business_id:businessIds[0],subtotal,delivery_fee:deliveryFee,marketplace_fee:marketplaceFee,tax,total,payment_status:'PENDING',status:'PENDING'}).select('id,order_number,total').single();
    if(orderError||!order)throw orderError??new Error('Order creation failed');
    const {error:itemError}=await admin.from('order_items').insert(lineItems.map(i=>({...i,order_id:order.id})));if(itemError)throw itemError;
    const stripe=new Stripe(stripeKey,{apiVersion:'2025-07-30.basil'});
    const session=await stripe.checkout.sessions.create({mode:'payment',line_items:lineItems.map(i=>({price_data:{currency:'aud',product_data:{name:i.product_name},unit_amount:Math.round(i.unit_price*100)},quantity:i.quantity})),metadata:{order_id:order.id,customer_id:user.id},success_url:'everestlocal://order/success?order_id='+order.id,cancel_url:'everestlocal://order/cancelled?order_id='+order.id},{idempotencyKey});
    await admin.from('payments').insert({customer_id:user.id,order_id:order.id,provider:'stripe',provider_payment_id:session.payment_intent?.toString()??null,amount:total,currency:'aud',status:'PENDING',idempotency_key:idempotencyKey});
    return json({orderId:order.id,orderNumber:order.order_number,checkoutUrl:session.url});
  } catch(error) { console.error('checkout_failed',{message:error instanceof Error?error.message:'unknown'}); return json({error:'Checkout could not be created. No payment was confirmed.'},500); }
});
