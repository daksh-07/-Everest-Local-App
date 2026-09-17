import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno';

type StripeMetadata={order_id?:string};
type InventoryItem={product_id:string;quantity:number};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const secret=Deno.env.get('STRIPE_SECRET_KEY'),webhookSecret=Deno.env.get('STRIPE_WEBHOOK_SECRET'),url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!secret||!webhookSecret||!url||!service)return json({error:'Webhook not configured'},503);
 const signature=req.headers.get('stripe-signature');if(!signature)return json({error:'Missing signature'},400);
 const body=await req.text();const stripe=new Stripe(secret,{apiVersion:'2025-07-30.basil'});
 let event:Stripe.Event;try{event=stripe.webhooks.constructEvent(body,signature,webhookSecret);}catch{return json({error:'Invalid signature'},400)}
 const db=createClient(url,service);
 const {data:claimed,error:claimError}=await db.rpc('claim_stripe_event',{p_event_id:event.id,p_event_type:event.type});
 if(claimError)return json({error:'Webhook event could not be claimed'},500);
 if(!claimed)return new Response('ok');
 try{
  const metadata=((event.data.object as Stripe.Checkout.Session|Stripe.PaymentIntent).metadata??{}) as StripeMetadata;
  const orderId=metadata.order_id;
  if(event.type==='checkout.session.completed'||event.type==='payment_intent.succeeded'){
   if(!orderId){await db.rpc('finish_stripe_event',{p_event_id:event.id,p_success:false});return json({error:'Missing order metadata'},400);}
   const {data:changed,error:updateError}=await db.from('orders').update({payment_status:'SUCCEEDED',status:'PAYMENT_CONFIRMED',updated_at:new Date().toISOString()}).eq('id',orderId).eq('payment_status','PENDING').select('id');
   if(updateError)throw updateError;
   const {error:paymentError}=await db.from('payments').update({status:'SUCCEEDED',updated_at:new Date().toISOString()}).eq('order_id',orderId).eq('status','PENDING');if(paymentError)throw paymentError;
   if((changed??[]).length>0){
    const {data:items,error:itemError}=await db.from('order_items').select('product_id,quantity').eq('order_id',orderId);if(itemError)throw itemError;
    for(const item of (items??[]) as InventoryItem[]){const {error}=await db.rpc('finalize_inventory_sale',{p_product_id:item.product_id,p_quantity:item.quantity});if(error)throw error;}
   }
  } else if(event.type==='payment_intent.payment_failed'){
   if(!orderId){await db.rpc('finish_stripe_event',{p_event_id:event.id,p_success:false});return json({error:'Missing order metadata'},400);}
   const {error:updateError}=await db.from('orders').update({payment_status:'FAILED',status:'CANCELLED',updated_at:new Date().toISOString()}).eq('id',orderId).eq('payment_status','PENDING');if(updateError)throw updateError;
   const {error:paymentError}=await db.from('payments').update({status:'FAILED',updated_at:new Date().toISOString()}).eq('order_id',orderId).eq('status','PENDING');if(paymentError)throw paymentError;
  }
  await db.from('audit_logs').insert({action:'stripe:'+event.id,entity_type:'stripe_event',metadata:{type:event.type}});
  await db.rpc('finish_stripe_event',{p_event_id:event.id,p_success:true});
  return new Response('ok');
 }catch(error){await db.rpc('finish_stripe_event',{p_event_id:event.id,p_success:false});console.error('stripe_webhook_failed',{message:error instanceof Error?error.message:'unknown'});return json({error:'Webhook processing failed'},500)}
});
