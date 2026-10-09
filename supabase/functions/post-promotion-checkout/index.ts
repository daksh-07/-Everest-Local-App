import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno';

type CheckoutRequest={post_id?:unknown;plan?:unknown;target_label?:unknown};
type PromotionRow={
 promotion_id:string;amount_aud:number;priority:number;radius_km:number;duration_hours:number;status:string;
 stripe_checkout_session_id:string|null;reused:boolean;
};
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, idempotency-key'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);

 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),stripeKey=Deno.env.get('STRIPE_SECRET_KEY');
 if(!url||!anon||!service||!stripeKey)return json({error:'Post promotion checkout is not configured'},503);
 const appUrl=(Deno.env.get('APP_PUBLIC_URL')??'https://everest-local-app.vercel.app').replace(/\/$/,'');
 if(!appUrl.startsWith('https://'))return json({error:'Payment return URL is not configured'},503);

 const auth=req.headers.get('Authorization'),idem=req.headers.get('Idempotency-Key');
 if(!auth||!idem||idem.length<16||idem.length>128)return json({error:'Authentication and a valid Idempotency-Key are required'},401);

 const body=await req.json().catch(()=>null) as CheckoutRequest|null;
 const postId=typeof body?.post_id==='string'?body.post_id.trim():'';
 const plan=typeof body?.plan==='string'?body.plan.trim():'';
 const targetLabel=typeof body?.target_label==='string'?body.target_label.trim():'';
 if(!postId||!plan)return json({error:'Post and promotion plan are required'},400);

 const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
 const admin=createClient(url,service);
 const {data:{user}}=await userClient.auth.getUser();
 if(!user)return json({error:'Invalid session'},401);

 try{
  const {data:raw,error}=await userClient.rpc('create_post_promotion',{
   p_post_id:postId,p_plan:plan,p_target_label:targetLabel||null,p_idempotency_key:idem
  });
  if(error)throw error;
  const promotion=(Array.isArray(raw)?raw[0]:raw) as PromotionRow|undefined;
  if(!promotion?.promotion_id||!Number.isFinite(Number(promotion.amount_aud))||Number(promotion.amount_aud)<=0)throw new Error('Invalid promotion response');

  const stripe=new Stripe(stripeKey,{apiVersion:'2025-07-30.basil'});
  if(promotion.stripe_checkout_session_id){
   const existing=await stripe.checkout.sessions.retrieve(promotion.stripe_checkout_session_id);
   return json({promotionId:promotion.promotion_id,amount:promotion.amount_aud,checkoutUrl:existing.url,reused:true});
  }

  const session=await stripe.checkout.sessions.create({
   mode:'payment',
   line_items:[{
    price_data:{
     currency:'aud',
     product_data:{
      name:'Everest Local post promotion',
      description:'Paid discovery placement. Reach is not guaranteed and depends on audience relevance and feed quality.'
     },
     unit_amount:Math.round(Number(promotion.amount_aud)*100)
    },
    quantity:1
   }],
   metadata:{
    payment_kind:'post_promotion',
    promotion_id:promotion.promotion_id,
    post_id:postId,
    customer_id:user.id,
    promotion_plan:plan
   },
   payment_intent_data:{metadata:{
    payment_kind:'post_promotion',
    promotion_id:promotion.promotion_id,
    post_id:postId,
    customer_id:user.id,
    promotion_plan:plan
   }},
   success_url:`${appUrl}/account?promotion=success&promotion_id=${encodeURIComponent(promotion.promotion_id)}`,
   cancel_url:`${appUrl}/account?promotion=cancelled&promotion_id=${encodeURIComponent(promotion.promotion_id)}`
  },{idempotencyKey:promotion.promotion_id});

  const {error:updateError}=await admin.from('post_promotions').update({
   stripe_checkout_session_id:session.id,
   stripe_payment_intent_id:typeof session.payment_intent==='string'?session.payment_intent:null,
   updated_at:new Date().toISOString()
  }).eq('id',promotion.promotion_id).eq('status','PENDING_PAYMENT');
  if(updateError)throw updateError;

  return json({
   promotionId:promotion.promotion_id,
   amount:promotion.amount_aud,
   priority:promotion.priority,
   radiusKm:promotion.radius_km,
   durationHours:promotion.duration_hours,
   checkoutUrl:session.url,
   reused:promotion.reused
  });
 }catch(error){
  console.error('post_promotion_checkout_failed',{message:error instanceof Error?error.message:'unknown',postId,userId:user.id});
  return json({error:'Promotion checkout could not be created. No payment was confirmed.'},500);
 }
});
