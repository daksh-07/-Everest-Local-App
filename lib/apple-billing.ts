import {supabase} from './supabase';

export const APPLE_PRO_PRODUCT_ID='com.everestlocal.pro.monthly';

export type AppleVerificationResult={
 active:boolean;
 status:'ACTIVE'|'CANCELED';
 currentPeriodEnd:string|null;
 provider:'APPLE';
};

export async function verifyApplePurchase(businessId:string,transactionId:string){
 const {data,error}=await supabase.functions.invoke('apple-subscription-verify',{body:{businessId,transactionId}});
 if(error)throw new Error(error.message);
 if(!data||typeof data.active!=='boolean')throw new Error('Apple subscription verification did not return a valid result.');
 return data as AppleVerificationResult;
}
