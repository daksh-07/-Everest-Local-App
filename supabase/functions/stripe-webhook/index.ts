import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno';
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const secret=Deno.env.get('STRIPE_SECRET_KEY'),webhookSecret=Deno.env.get('STRIPE_WEBHOOK_SECRET'),url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!secret||!webhookSecret||!url||!service)return new Response('Webhook not configured',{status:503});
 const signature=req.headers.get('stripe-signature');if(!signature)return new Response('Missing signature',{status:400});
 const body=await req.text();const stripe=new Stripe(secret,{apiVersion:'2025-07-30.basil'});
 let event:Stripe.Event;try{event=stripe.webhooks.constructEvent(body,signature,webhookSecret);}catch{ return new Response('Invalid signature',{status:400}); }
 const db=createClient(url,service);
 try{
  const {data:existing}=await db.from('audit_logs').select('id').eq('action','stripe:'+event.id).limit(1);if(existing?.length)return new Response('ok');
  const obj=event.data.object as any; const orderId=obj.metadata?.order_id as string|undefined;
  if(orderId){
   if(event.type==='checkout.session.completed' || event.type==='payment_intent.succeeded'){
    await db.from('orders').update({payment_status:'SUCCEEDED',status:'PAYMENT_CONFIRMED',updated_at:new Date().toISOString()}).eq('id',orderId).eq('payment_status','PENDING');
    await db.from('payments').update({status:'SUCCEEDED',updated_at:new Date().toISOString()}).eq('order_id',orderId).eq('status','PENDING');
    const {data:items}=await db.from('order_items').select('product_id,quantity').eq('order_id',orderId);
    for(const item of items??[])await db.rpc('finalize_inventory_sale',{p_product_id:item.product_id,p_quantity:item.quantity});
   } else if(event.type==='payment_intent.payment_failed') {
    await db.from('orders').update({payment_status:'FAILED',status:'CANCELLED',updated_at:new Date().toISOString()}).eq('id',orderId).eq('payment_status','PENDING');
    await db.from('payments').update({status:'FAILED',updated_at:new Date().toISOString()}).eq('order_id',orderId).eq('status','PENDING');
   }
  }
  await db.from('audit_logs').insert({action:'stripe:'+event.id,entity_type:'stripe_event',metadata:{type:event.type}});
  return new Response('ok');
 }catch(error){console.error('stripe_webhook_failed',{message:error instanceof Error?error.message:'unknown'});return new Response('Webhook processing failed',{status:500});}
});
