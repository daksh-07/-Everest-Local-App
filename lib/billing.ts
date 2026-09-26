import {Linking} from 'react-native';
import {supabase} from './supabase';

export type BusinessSubscription={
 business_id:string;
 stripe_customer_id:string|null;
 stripe_subscription_id:string|null;
 stripe_price_id:string|null;
 status:'INACTIVE'|'TRIALING'|'ACTIVE'|'PAST_DUE'|'UNPAID'|'CANCELED'|'INCOMPLETE'|'INCOMPLETE_EXPIRED'|'PAUSED';
 current_period_end:string|null;
 cancel_at_period_end:boolean;
 updated_at:string;
};

export async function getBusinessSubscription(businessId:string){
 const {data,error}=await supabase.from('business_subscriptions').select('business_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,status,current_period_end,cancel_at_period_end,updated_at').eq('business_id',businessId).maybeSingle();
 if(error)throw new Error(error.message);
 return data as BusinessSubscription|null;
}

export function hasEverestPro(subscription:BusinessSubscription|null){
 return subscription?.status==='ACTIVE'||subscription?.status==='TRIALING';
}

async function billingAction(businessId:string,action:'CREATE_CHECKOUT'|'PORTAL'){
 const {data,error}=await supabase.functions.invoke('business-subscription-billing',{body:{businessId,action}});
 if(error)throw new Error(error.message);
 const url=typeof data?.url==='string'?data.url:'';
 if(!url)throw new Error('Stripe did not return a billing URL.');
 await Linking.openURL(url);
 return data as {url:string;alreadySubscribed?:boolean};
}

export async function startEverestProCheckout(businessId:string){
 return billingAction(businessId,'CREATE_CHECKOUT');
}

export async function openEverestProPortal(businessId:string){
 return billingAction(businessId,'PORTAL');
}
