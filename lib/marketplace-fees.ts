export const FEE_POLICY_VERSION='2026-09-v1';

export type FeeBreakdown={gross:number;fee:number;net:number;effectiveRate:number};

function money(value:number){return Math.round((value+Number.EPSILON)*100)/100;}

export function servicePlatformFee(amount:number){
 const gross=Math.max(0,Number.isFinite(amount)?amount:0);
 if(gross<=0)return 0;
 const progressive=
  Math.min(gross,500)*0.05+
  Math.max(Math.min(gross,1000)-500,0)*0.035+
  Math.max(gross-1000,0)*0.028;
 return money(Math.min(gross,Math.max(5,progressive)));
}

export function productPlatformFee(subtotal:number){
 const gross=Math.max(0,Number.isFinite(subtotal)?subtotal:0);
 return money(gross*0.05);
}

export function serviceFeeBreakdown(amount:number):FeeBreakdown{
 const gross=money(Math.max(0,Number.isFinite(amount)?amount:0));
 const fee=servicePlatformFee(gross);
 const net=money(Math.max(0,gross-fee));
 return {gross,fee,net,effectiveRate:gross>0?fee/gross:0};
}

export function productFeeBreakdown(subtotal:number):FeeBreakdown{
 const gross=money(Math.max(0,Number.isFinite(subtotal)?subtotal:0));
 const fee=productPlatformFee(gross);
 const net=money(Math.max(0,gross-fee));
 return {gross,fee,net,effectiveRate:gross>0?fee/gross:0};
}
