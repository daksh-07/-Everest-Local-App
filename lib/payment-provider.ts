import {resolveCurrentMarketCode} from './current-market';
import type {MarketCode} from './markets';

export type MarketplacePaymentProvider='STRIPE_CONNECT'|'RAZORPAY_ROUTE';

export type MarketplacePaymentConfig={
 market:MarketCode;
 provider:MarketplacePaymentProvider;
 currency:'AUD'|'INR';
 enabled:boolean;
 checkoutMethods:string[];
};

export const MARKETPLACE_PAYMENT_CONFIG:Record<MarketCode,MarketplacePaymentConfig>={
 AU:{market:'AU',provider:'STRIPE_CONNECT',currency:'AUD',enabled:true,checkoutMethods:['card','wallet']},
 IN:{market:'IN',provider:'RAZORPAY_ROUTE',currency:'INR',enabled:false,checkoutMethods:['upi','card','netbanking']},
};

export class MarketplacePaymentUnavailableError extends Error{
 constructor(readonly market:MarketCode){
  super(market==='IN'?'Payments in Everest India are not live yet. UPI checkout will open after India provider payouts are connected.':'Marketplace payments are unavailable.');
  this.name='MarketplacePaymentUnavailableError';
 }
}

export async function currentMarketplacePaymentConfig(){
 return MARKETPLACE_PAYMENT_CONFIG[await resolveCurrentMarketCode()];
}

export async function requireMarketplacePayments(){
 const config=await currentMarketplacePaymentConfig();
 if(!config.enabled)throw new MarketplacePaymentUnavailableError(config.market);
 return config;
}
