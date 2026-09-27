import {Linking} from 'react-native';
import {supabase,requireSupabaseConfig} from './supabase';
import {userFacingError} from './errors';

export type StripeConnectStatus='NOT_CONNECTED'|'PENDING'|'RESTRICTED'|'ACTIVE'|'DISABLED';
export type BusinessPayoutStatus={
 stripe_connected_account_id:string|null;
 stripe_connect_status:StripeConnectStatus;
 stripe_details_submitted:boolean;
 stripe_charges_enabled:boolean;
 stripe_payouts_enabled:boolean;
 stripe_bank_connected:boolean;
 stripe_requirements_due:string[];
 stripe_connect_fee_payer:'ACCOUNT'|'PLATFORM';
 ready:boolean;
 requirements_due:string[];
};

async function connectAction(businessId:string,action:'status'|'onboard'){
 requireSupabaseConfig();
 const {data,error}=await supabase.functions.invoke('stripe-connect',{body:{business_id:businessId,action}});
 if(error)throw new Error(userFacingError(error,'Stripe payout setup is temporarily unavailable.'));
 if(data?.error)throw new Error(String(data.error));
 return data as Record<string,unknown>;
}

export async function getBusinessPayoutStatus(businessId:string):Promise<BusinessPayoutStatus>{
 const data=await connectAction(businessId,'status');
 return {
  stripe_connected_account_id:typeof data.stripe_connected_account_id==='string'?data.stripe_connected_account_id:null,
  stripe_connect_status:String(data.stripe_connect_status??'NOT_CONNECTED') as StripeConnectStatus,
  stripe_details_submitted:Boolean(data.stripe_details_submitted),
  stripe_charges_enabled:Boolean(data.stripe_charges_enabled),
  stripe_payouts_enabled:Boolean(data.stripe_payouts_enabled),
  stripe_bank_connected:Boolean(data.stripe_bank_connected),
  stripe_requirements_due:Array.isArray(data.stripe_requirements_due)?data.stripe_requirements_due.map(String):[],
  stripe_connect_fee_payer:data.stripe_connect_fee_payer==='PLATFORM'?'PLATFORM':'ACCOUNT',
  ready:Boolean(data.ready),
  requirements_due:Array.isArray(data.requirements_due)?data.requirements_due.map(String):[],
 };
}

export async function startBusinessPayoutOnboarding(businessId:string){
 const data=await connectAction(businessId,'onboard');
 const url=typeof data.url==='string'?data.url:'';
 if(!url)throw new Error('Stripe did not return an onboarding link.');
 const supported=await Linking.canOpenURL(url);
 if(!supported)throw new Error('Stripe onboarding could not be opened on this device.');
 await Linking.openURL(url);
 return url;
}
