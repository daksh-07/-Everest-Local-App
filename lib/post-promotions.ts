import {userFacingError} from './errors';
import {requireSupabaseConfig,supabase} from './supabase';

export type PromotionPlan='LOCAL_24H'|'AREA_3D'|'WIDE_7D'|'CITY_7D';
export type PromotionPlanInfo={id:PromotionPlan;name:string;price:number;duration:string;radius:string;description:string};

export const POST_PROMOTION_PLANS:PromotionPlanInfo[]=[
 {id:'LOCAL_24H',name:'Local push',price:4.99,duration:'24 hours',radius:'Up to 5 km',description:'A light boost around the post location.'},
 {id:'AREA_3D',name:'Area boost',price:9.99,duration:'3 days',radius:'Up to 15 km',description:'More discovery weight across nearby suburbs.'},
 {id:'WIDE_7D',name:'Wide local',price:19.99,duration:'7 days',radius:'Up to 30 km',description:'Higher placement weight across a wider local area.'},
 {id:'CITY_7D',name:'City reach',price:29.99,duration:'7 days',radius:'Up to 50 km',description:'Our strongest local discovery weight for this post.'},
];

function idempotencyKey(postId:string){return `post-promo-${postId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function isStripeCheckoutUrl(value:string){
 try{const url=new URL(value);return url.protocol==='https:'&&url.hostname==='checkout.stripe.com';}catch{return false;}
}

export async function createPostPromotionCheckout(input:{postId:string;plan:PromotionPlan;targetLabel?:string}){
 requireSupabaseConfig();
 const {data,error}=await supabase.functions.invoke('post-promotion-checkout',{
  body:{post_id:input.postId,plan:input.plan,target_label:input.targetLabel?.trim()||null},
  headers:{'Idempotency-Key':idempotencyKey(input.postId)}
 });
 if(error)throw new Error(userFacingError(error,'Promotion checkout could not be started.'));
 const result=data as {checkoutUrl?:unknown;promotionId?:unknown;amount?:unknown};
 if(typeof result.checkoutUrl!=='string'||!isStripeCheckoutUrl(result.checkoutUrl))throw new Error('Promotion checkout could not be started.');
 return {checkoutUrl:result.checkoutUrl,promotionId:String(result.promotionId??''),amount:Number(result.amount??0)};
}
