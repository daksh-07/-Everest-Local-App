import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, idempotency-key'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors}); if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),stripeKey=Deno.env.get('STRIPE_SECRET_KEY');
 if(!url||!anon||!service||!stripeKey)return json({error:'Checkout is not configured'},503);
 const auth=req.headers.get('Authorization'),idem=req.headers.get('Idempotency-Key');if(!auth||!idem)return json({error:'Authentication and Idempotency-Key are required'},401);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}}),admin=createClient(url,service);const {data:{user}}=await userClient.auth.getUser();if(!user)return json({error:'Invalid session'},401);
 let orderId:string|undefined;
 try{
  const {data:order,error}=await userClient.rpc('create_order_from_cart',{p_idempotency_key:idem,p_delivery_method:'PICKUP',p_delivery_address:null});if(error)throw error; orderId=order.order_id as string;
  const {data:items,error:itemError}=await admin.from('order_items').select('product_name,unit_price,quantity').eq('order_id',orderId);if(itemError)throw itemError;
  const stripe=new Stripe(stripeKey,{apiVersion:'2025-07-30.basil'});
  const session=await stripe.checkout.sessions.create({mode:'payment',line_items:(items??[]).map((i:any)=>({price_data:{currency:'aud',product_data:{name:i.product_name},unit_amount:Math.round(Number(i.unit_price)*100)},quantity:i.quantity})),metadata:{order_id:orderId,customer_id:user.id},success_url:'everestlocal://order/success?order_id='+orderId,cancel_url:'everestlocal://order/cancelled?order_id='+orderId},{idempotencyKey:idem});
  await admin.from('payments').update({provider_payment_id:session.payment_intent?.toString()??null,updated_at:new Date().toISOString()}).eq('order_id',orderId).eq('idempotency_key',idem);
  return json({orderId,orderNumber:order.order_number,total:order.total,checkoutUrl:session.url,reused:Boolean(order.reused)});
 }catch(error){if(orderId)await userClient.rpc('release_my_order_reservations',{p_order_id:orderId});console.error('checkout_failed',{message:error instanceof Error?error.message:'unknown'});return json({error:'Checkout could not be created. No payment was confirmed.'},500);}
});
