import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno';

type OrderResult={order_id:string;order_number:string;total:number;reused:boolean};
type OrderFeeSnapshot={marketplace_fee:number;provider_net:number;fee_policy_version:string;subtotal:number};
type CheckoutItem={product_name:string;unit_price:number;quantity:number};
type CheckoutRequest={delivery_method?:unknown;delivery_address?:unknown};
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, idempotency-key'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),stripeKey=Deno.env.get('STRIPE_SECRET_KEY');
 if(!url||!anon||!service||!stripeKey)return json({error:'Checkout is not configured'},503);
 const auth=req.headers.get('Authorization'),idem=req.headers.get('Idempotency-Key');
 if(!auth||!idem||idem.length<16||idem.length>128)return json({error:'Authentication and a valid Idempotency-Key are required'},401);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}}),admin=createClient(url,service);
 const {data:{user}}=await userClient.auth.getUser();if(!user)return json({error:'Invalid session'},401);
 let orderId:string|undefined;let stripeSessionCreated=false;
 try{
  let input:CheckoutRequest={};
  try{input=await req.json() as CheckoutRequest;}catch{input={};}
  const deliveryMethod=input.delivery_method==='EVEREST_DELIVERY'||input.delivery_method==='SAME_DAY'||input.delivery_method==='SHIPPING'?input.delivery_method:'PICKUP';
  const deliveryAddress=deliveryMethod==='PICKUP'?null:input.delivery_address;
  if(deliveryAddress!==null&&typeof deliveryAddress!=='object')return json({error:'Invalid delivery address'},400);
  const {data:rawOrder,error}=await userClient.rpc('create_order_from_cart',{p_idempotency_key:idem,p_delivery_method:deliveryMethod,p_delivery_address:deliveryAddress});
  if(error)throw error;
  const order=rawOrder as OrderResult;orderId=order.order_id;
  if(!orderId||typeof order.order_number!=='string')throw new Error('Invalid order response');
  const {data:existingPayment,error:existingPaymentError}=await admin.from('payments').select('provider_checkout_session_id').eq('order_id',orderId).eq('idempotency_key',idem).maybeSingle();
  if(existingPaymentError)throw existingPaymentError;
  if(existingPayment?.provider_checkout_session_id){
    stripeSessionCreated=true;
    const stripe=new Stripe(stripeKey,{apiVersion:'2025-07-30.basil'});
    const existingSession=await stripe.checkout.sessions.retrieve(existingPayment.provider_checkout_session_id);
    return json({orderId,orderNumber:order.order_number,total:order.total,checkoutUrl:existingSession.url,reused:true});
  }
  const [{data:rawItems,error:itemError},{data:orderTotals,error:orderTotalsError}]=await Promise.all([admin.from('order_items').select('product_name,unit_price,quantity').eq('order_id',orderId),admin.from('orders').select('subtotal,delivery_fee,total,marketplace_fee,provider_net,fee_policy_version').eq('id',orderId).single()]);if(orderTotalsError)throw orderTotalsError;
  if(itemError)throw itemError;
  const fee=orderTotals as OrderFeeSnapshot&{delivery_fee:number;total:number};
  const items=(rawItems??[]) as CheckoutItem[];if(!items.length)throw new Error('Order contains no items');const stripeTotal=items.reduce((sum,i)=>sum+Number(i.unit_price)*i.quantity,0)+Number(orderTotals.delivery_fee||0);if(Math.abs(stripeTotal-Number(orderTotals.total))>0.009)throw new Error('Order total mismatch');
  const stripe=new Stripe(stripeKey,{apiVersion:'2025-07-30.basil'});
  const session=await stripe.checkout.sessions.create({
    mode:'payment',
    line_items:[...items.map(i=>({price_data:{currency:'aud',product_data:{name:i.product_name},unit_amount:Math.round(Number(i.unit_price)*100)},quantity:i.quantity})),...(Number(orderTotals.delivery_fee)>0?[{price_data:{currency:'aud',product_data:{name:deliveryMethod==='SHIPPING'?'Shipping':'Delivery'},unit_amount:Math.round(Number(orderTotals.delivery_fee)*100)},quantity:1}]:[])],
    metadata:{order_id:orderId,customer_id:user.id,payment_kind:'product_order',everest_fee:String(fee.marketplace_fee),provider_net:String(fee.provider_net),fee_policy_version:fee.fee_policy_version},
    payment_intent_data:{metadata:{order_id:orderId,customer_id:user.id,payment_kind:'product_order',everest_fee:String(fee.marketplace_fee),provider_net:String(fee.provider_net),fee_policy_version:fee.fee_policy_version}},
    success_url:`everestlocal://order/success?order_id=${encodeURIComponent(orderId)}`,
    cancel_url:`everestlocal://order/cancelled?order_id=${encodeURIComponent(orderId)}`,
  },{idempotencyKey:idem});
  stripeSessionCreated=true;
  const {error:paymentError}=await admin.from('payments').update({provider_payment_id:typeof session.payment_intent==='string'?session.payment_intent:null,provider_checkout_session_id:session.id,updated_at:new Date().toISOString()}).eq('order_id',orderId).eq('idempotency_key',idem).eq('status','PENDING');
  if(paymentError)throw paymentError;
  return json({orderId,orderNumber:order.order_number,total:order.total,marketplaceFee:fee.marketplace_fee,providerNet:fee.provider_net,checkoutUrl:session.url,reused:order.reused});
 }catch(error){
  if(orderId&&!stripeSessionCreated)await userClient.rpc('release_my_order_reservations',{p_order_id:orderId});
  console.error('checkout_failed',{message:error instanceof Error?error.message:'unknown',orderId:orderId??null,stripeSessionCreated});
  return json({error:'Checkout could not be created. No payment was confirmed.'},500);
 }
});
