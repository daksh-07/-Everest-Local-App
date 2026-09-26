import {Linking} from 'react-native';
import {supabase} from './supabase';

export type BillingUnit='DAY'|'WEEK'|'MONTH'|'YEAR';
export type PlanVisibility='PUBLIC'|'PRIVATE'|'INVITE_ONLY';
export type MembershipStatus='INVITED'|'INCOMPLETE'|'TRIALING'|'ACTIVE'|'PAST_DUE'|'PAUSED'|'CANCEL_AT_PERIOD_END'|'CANCELED';

export type MembershipPlan={
 id:string;business_id:string;name:string;description:string|null;visibility:PlanVisibility;price:number;currency:string;
 billing_interval_unit:BillingUnit;billing_interval_count:number;included_credits:number;included_services:unknown[];service_frequency:Record<string,unknown>;benefits:Record<string,unknown>;active:boolean;created_at:string;
};
export type CustomerMembership={
 id:string;business_id:string;plan_id:string|null;contact_id:string|null;customer_id:string;title:string;description:string|null;price:number;currency:string;
 billing_interval_unit:BillingUnit;billing_interval_count:number;included_credits_per_period:number;included_services:unknown[];service_frequency:Record<string,unknown>;benefits:Record<string,unknown>;
 start_date:string;status:MembershipStatus;stripe_customer_id:string|null;stripe_subscription_id:string|null;current_period_start:string|null;current_period_end:string|null;approved_at:string|null;created_at:string;
};
export type BusinessPackage={
 id:string;business_id:string;name:string;description:string|null;visibility:PlanVisibility;price:number;currency:string;credit_count:number;service_id:string|null;expires_after_days:number|null;benefits:Record<string,unknown>;active:boolean;created_at:string;
};
export type CustomerPackage={
 id:string;business_id:string;package_id:string;customer_id:string;purchase_price:number;currency:string;purchased_credits:number;status:'PENDING'|'ACTIVE'|'EXHAUSTED'|'EXPIRED'|'REFUNDED'|'CANCELED';purchased_at:string|null;expires_at:string|null;created_at:string;
 package?:{name:string;description:string|null}|null;credits_remaining?:number;
};
export type GrowthMetrics={
 active_members:number;mrr:number;recurring_booking_series:number;package_revenue:number;membership_cancellations_30d:number;failed_membership_payments_30d:number;credits_outstanding:number;plans:number;packages:number;
};

const idem=(prefix:string)=>`${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;

export async function listPublicMembershipPlans(businessId:string){
 const {data,error}=await supabase.from('business_membership_plans').select('*').eq('business_id',businessId).eq('active',true).eq('visibility','PUBLIC').order('created_at',{ascending:false});
 if(error)throw new Error(error.message);return (data??[]) as MembershipPlan[];
}
export async function listPublicPackages(businessId:string){
 const {data,error}=await supabase.from('business_packages').select('*').eq('business_id',businessId).eq('active',true).eq('visibility','PUBLIC').order('created_at',{ascending:false});
 if(error)throw new Error(error.message);return (data??[]) as BusinessPackage[];
}
export async function createPublicMembershipEnrollment(planId:string){
 const {data,error}=await supabase.rpc('create_public_membership_enrollment',{p_plan_id:planId});if(error)throw new Error(error.message);return String(data);
}

export async function listBusinessMembershipPlans(businessId:string){
 const {data,error}=await supabase.from('business_membership_plans').select('*').eq('business_id',businessId).order('active',{ascending:false}).order('created_at',{ascending:false});
 if(error)throw new Error(error.message);return (data??[]) as MembershipPlan[];
}
export async function createBusinessMembershipPlan(input:{businessId:string;name:string;description?:string;visibility:PlanVisibility;price:number;intervalUnit:BillingUnit;intervalCount:number;includedCredits?:number;includedServices?:unknown[];serviceFrequency?:Record<string,unknown>;benefits?:Record<string,unknown>}){
 const {data,error}=await supabase.rpc('create_business_membership_plan',{
  p_business_id:input.businessId,p_name:input.name,p_description:input.description??'',p_visibility:input.visibility,p_price:input.price,
  p_interval_unit:input.intervalUnit,p_interval_count:input.intervalCount,p_included_credits:input.includedCredits??0,
  p_included_services:input.includedServices??[],p_service_frequency:input.serviceFrequency??{},p_benefits:input.benefits??{},
 });
 if(error)throw new Error(error.message);return String(data);
}
export async function setMembershipPlanActive(planId:string,active:boolean){
 const {error}=await supabase.rpc('set_business_membership_plan_active',{p_plan_id:planId,p_active:active});if(error)throw new Error(error.message);
}

export async function listBusinessPackages(businessId:string){
 const {data,error}=await supabase.from('business_packages').select('*').eq('business_id',businessId).order('active',{ascending:false}).order('created_at',{ascending:false});
 if(error)throw new Error(error.message);return (data??[]) as BusinessPackage[];
}
export async function createBusinessPackage(input:{businessId:string;name:string;description?:string;visibility:PlanVisibility;price:number;creditCount:number;serviceId?:string|null;expiresAfterDays?:number|null;benefits?:Record<string,unknown>}){
 const {data,error}=await supabase.rpc('create_business_package',{
  p_business_id:input.businessId,p_name:input.name,p_description:input.description??'',p_visibility:input.visibility,p_price:input.price,p_credit_count:input.creditCount,
  p_service_id:input.serviceId??null,p_expires_after_days:input.expiresAfterDays??null,p_benefits:input.benefits??{},
 });
 if(error)throw new Error(error.message);return String(data);
}

export async function inviteCustomerToMembership(input:{businessId:string;contactId:string;planId?:string|null;customTitle?:string;customDescription?:string;customPrice?:number|null;intervalUnit?:BillingUnit|null;intervalCount?:number|null;includedCredits?:number;includedServices?:unknown[];serviceFrequency?:Record<string,unknown>;benefits?:Record<string,unknown>;startDate?:string}){
 const {data,error}=await supabase.rpc('create_customer_membership_invitation',{
  p_business_id:input.businessId,p_contact_id:input.contactId,p_plan_id:input.planId??null,p_custom_title:input.customTitle??null,p_custom_description:input.customDescription??null,
  p_custom_price:input.customPrice??null,p_interval_unit:input.intervalUnit??null,p_interval_count:input.intervalCount??null,p_included_credits:input.includedCredits??0,
  p_included_services:input.includedServices??[],p_service_frequency:input.serviceFrequency??{},p_benefits:input.benefits??{},p_start_date:input.startDate??new Date().toISOString().slice(0,10),
 });
 if(error)throw new Error(error.message);return String(data);
}

export async function getBusinessGrowthMetrics(businessId:string){
 const {data,error}=await supabase.rpc('get_business_growth_metrics',{p_business_id:businessId});if(error)throw new Error(error.message);
 return data as GrowthMetrics;
}
export async function getCustomerGrowthSummary(businessId:string,contactId:string){
 const {data,error}=await supabase.rpc('get_customer_growth_summary',{p_business_id:businessId,p_contact_id:contactId});if(error)throw new Error(error.message);
 return data as {linked:boolean;memberships:Array<Record<string,unknown>>;packages:Array<Record<string,unknown>>};
}

export async function listMyMemberships(){
 const {data,error}=await supabase.from('customer_memberships').select('*').order('created_at',{ascending:false});if(error)throw new Error(error.message);
 return (data??[]) as CustomerMembership[];
}
export async function listMyPackages(){
 const {data,error}=await supabase.from('customer_packages').select('*,package:business_packages(name,description)').order('created_at',{ascending:false});if(error)throw new Error(error.message);
 const rows=(data??[]) as CustomerPackage[];
 if(!rows.length)return rows;
 const {data:ledger,error:ledgerError}=await supabase.from('service_credit_ledger').select('customer_package_id,delta').in('customer_package_id',rows.map(row=>row.id));
 if(ledgerError)throw new Error(ledgerError.message);
 const balance=new Map<string,number>();
 for(const entry of ledger??[]){if(entry.customer_package_id)balance.set(entry.customer_package_id,(balance.get(entry.customer_package_id)??0)+Number(entry.delta||0));}
 return rows.map(row=>({...row,credits_remaining:balance.get(row.id)??0}));
}
export async function getMembershipCredits(membershipIds:string[]){
 if(!membershipIds.length)return new Map<string,number>();
 const {data,error}=await supabase.from('service_credit_ledger').select('membership_id,delta').in('membership_id',membershipIds);if(error)throw new Error(error.message);
 const map=new Map<string,number>();for(const row of data??[]){if(row.membership_id)map.set(row.membership_id,(map.get(row.membership_id)??0)+Number(row.delta||0));}return map;
}
export async function listMembershipBillingHistory(membershipId:string){
 const {data,error}=await supabase.from('membership_billing_history').select('*').eq('membership_id',membershipId).order('occurred_at',{ascending:false}).limit(30);if(error)throw new Error(error.message);return data??[];
}

async function membershipBilling(body:Record<string,unknown>,prefix:string){
 const key=idem(prefix);
 const {data,error}=await supabase.functions.invoke('membership-billing',{body,headers:{'Idempotency-Key':key}});
 if(error)throw new Error(error.message);
 if(data?.error)throw new Error(String(data.error));
 return data as {url?:string;ok?:boolean;cancelAtPeriodEnd?:boolean};
}
export async function approveMembership(membershipId:string){
 const data=await membershipBilling({action:'START_MEMBERSHIP',membershipId},'membership');if(!data.url)throw new Error('Stripe did not return a checkout URL.');await Linking.openURL(data.url);return data;
}
export async function buyPackage(packageId:string){
 const data=await membershipBilling({action:'BUY_PACKAGE',packageId},'package');if(!data.url)throw new Error('Stripe did not return a checkout URL.');await Linking.openURL(data.url);return data;
}
export async function openMembershipPortal(membershipId:string){
 const data=await membershipBilling({action:'PORTAL',membershipId},'portal');if(!data.url)throw new Error('Stripe did not return a billing portal URL.');await Linking.openURL(data.url);return data;
}
export async function cancelMembershipAtPeriodEnd(membershipId:string){return membershipBilling({action:'CANCEL_AT_PERIOD_END',membershipId},'cancel-membership');}
export async function resumeMembership(membershipId:string){return membershipBilling({action:'RESUME',membershipId},'resume-membership');}

export const intervalLabel=(unit:BillingUnit,count:number)=>{
 if(unit==='WEEK'&&count===2)return 'fortnight';
 if(unit==='MONTH'&&count===3)return 'quarter';
 const base=unit.toLowerCase();return count===1?base:`${count} ${base}s`;
};


export type GrowthP1Metrics={active_offers:number;active_campaigns:number;waitlist:number;repeat_customers:number;inactive_contacts:number;quotes_to_recover:number;completed_30d:number;revenue_30d:number};
export type BusinessOffer={id:string;business_id:string;name:string;description:string|null;offer_type:'PERCENT'|'FIXED'|'CREDIT'|'MEMBER_ONLY';discount_value:number;audience:'ALL'|'NEW'|'RETURNING'|'INACTIVE'|'VIP'|'MEMBERS';status:'DRAFT'|'ACTIVE'|'PAUSED'|'EXPIRED';ends_at:string|null;created_at:string};
export type BusinessCampaign={id:string;business_id:string;name:string;objective:string;segment_key:string;offer_id:string|null;channel:'IN_APP'|'EMAIL'|'SMS';status:string;created_at:string};

export async function listBusinessOffers(businessId:string){const {data,error}=await supabase.from('business_offers').select('*').eq('business_id',businessId).order('created_at',{ascending:false});if(error)throw new Error(error.message);return(data??[]) as BusinessOffer[]}
export async function createBusinessOffer(input:{businessId:string;name:string;description?:string;offerType:BusinessOffer['offer_type'];discountValue:number;audience:BusinessOffer['audience'];endsAt?:string|null}){const {data,error}=await supabase.rpc('create_business_offer',{p_business_id:input.businessId,p_name:input.name,p_description:input.description??'',p_offer_type:input.offerType,p_discount_value:input.discountValue,p_audience:input.audience,p_ends_at:input.endsAt??null});if(error)throw new Error(error.message);return String(data)}
export async function setBusinessOfferStatus(offerId:string,status:BusinessOffer['status']){const {error}=await supabase.rpc('set_business_offer_status',{p_offer_id:offerId,p_status:status});if(error)throw new Error(error.message)}
export async function listBusinessCampaigns(businessId:string){const {data,error}=await supabase.from('business_campaigns').select('*').eq('business_id',businessId).order('created_at',{ascending:false});if(error)throw new Error(error.message);return(data??[]) as BusinessCampaign[]}
export async function createBusinessCampaign(input:{businessId:string;name:string;objective:string;segmentKey:string;offerId?:string|null;channel?:'IN_APP'|'EMAIL'|'SMS'}){const {data,error}=await supabase.rpc('create_business_campaign',{p_business_id:input.businessId,p_name:input.name,p_objective:input.objective,p_segment_key:input.segmentKey,p_offer_id:input.offerId??null,p_channel:input.channel??'IN_APP'});if(error)throw new Error(error.message);return String(data)}
export async function getBusinessGrowthP1Metrics(businessId:string){const {data,error}=await supabase.rpc('get_business_growth_p1_metrics',{p_business_id:businessId});if(error)throw new Error(error.message);return data as GrowthP1Metrics}
export async function configureBusinessLoyalty(input:{businessId:string;enabled:boolean;earnType:'VISIT'|'SPEND';earnRate:number;rewardThreshold:number;rewardType:'CREDIT'|'PERCENT'|'FIXED';rewardValue:number}){const {error}=await supabase.rpc('configure_business_loyalty',{p_business_id:input.businessId,p_enabled:input.enabled,p_earn_type:input.earnType,p_earn_rate:input.earnRate,p_reward_threshold:input.rewardThreshold,p_reward_type:input.rewardType,p_reward_value:input.rewardValue});if(error)throw new Error(error.message)}
export async function configureBusinessReferrals(input:{businessId:string;enabled:boolean;referrerCredit:number;friendCredit:number}){const {error}=await supabase.rpc('configure_business_referrals',{p_business_id:input.businessId,p_enabled:input.enabled,p_referrer_credit:input.referrerCredit,p_friend_credit:input.friendCredit});if(error)throw new Error(error.message)}


export type GrowthRecommendation={key:string;title:string;detail:string;action:'CREATE_WIN_BACK'|'CREATE_QUOTE_RECOVERY'|'OPEN_AVAILABILITY'|'CONFIGURE_LOYALTY'};
export async function getGrowthRecommendations(businessId:string){const {data,error}=await supabase.rpc('get_growth_recommendations',{p_business_id:businessId});if(error)throw new Error(error.message);return(data??[]) as GrowthRecommendation[]}
export async function runInAppGrowthCampaign(campaignId:string){const {data,error}=await supabase.rpc('run_in_app_growth_campaign',{p_campaign_id:campaignId});if(error)throw new Error(error.message);return Number(data??0)}
export async function getBusinessLoyaltyProgram(businessId:string){const {data,error}=await supabase.from('business_loyalty_programs').select('*').eq('business_id',businessId).maybeSingle();if(error)throw new Error(error.message);return data as null|{enabled:boolean;earn_type:'VISIT'|'SPEND';earn_rate:number;reward_threshold:number;reward_type:'CREDIT'|'PERCENT'|'FIXED';reward_value:number}}
export async function getBusinessReferralProgram(businessId:string){const {data,error}=await supabase.from('business_referral_programs').select('*').eq('business_id',businessId).maybeSingle();if(error)throw new Error(error.message);return data as null|{enabled:boolean;referrer_credit:number;friend_credit:number}}
