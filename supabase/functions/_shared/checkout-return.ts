/** Return destinations are deployment configuration, never caller-controlled URLs. */
export function checkoutReturnUrls(configured:string|undefined,kind:'order'|'booking',id:string,native=false){
 const url=new URL(configured?.trim()||'https://everest-local-app.vercel.app');
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Payment return origin must be an HTTPS origin');
 const path=kind==='order'?'/orders':'/booking';
 const key=kind==='order'?'order_id':'id';
 const destination=(result:string)=>`${url.origin}${path}?${key}=${encodeURIComponent(id)}&checkout=${result}${native?'&native_return=1':''}`;
 return {success_url:destination('success'),cancel_url:destination('cancelled')};
}
