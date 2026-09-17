import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!anon||!service)return json({error:'Account service is not configured'},503);
 const authorization=req.headers.get('Authorization');if(!authorization)return json({error:'Authentication required'},401);
 const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}}});const {data:{user},error}=await userClient.auth.getUser();if(error||!user)return json({error:'Invalid session'},401);
 const admin=createClient(url,service);
 try{
  // Do not delete an account with active financial obligations. Admin/support must resolve these first.
  const {count:pendingOrders,error:ordersError}=await admin.from('orders').select('id',{count:'exact',head:true}).eq('customer_id',user.id).in('status',['PENDING','PAYMENT_CONFIRMED','ACCEPTED','PREPARING','READY_FOR_PICKUP','OUT_FOR_DELIVERY']);
  if(ordersError)throw ordersError;if((pendingOrders??0)>0)return json({error:'Account cannot be deleted while active orders exist. Please contact support.'},409);
  const {count:activeBookings,error:bookingsError}=await admin.from('bookings').select('id',{count:'exact',head:true}).eq('customer_id',user.id).in('status',['REQUESTED','PENDING_PAYMENT','CONFIRMED','UPCOMING','IN_PROGRESS']);
  if(bookingsError)throw bookingsError;if((activeBookings??0)>0)return json({error:'Account cannot be deleted while active bookings exist. Please complete or cancel them first.'},409);
  const {error:deleteError}=await admin.auth.admin.deleteUser(user.id);if(deleteError)throw deleteError;
  return json({deleted:true});
 }catch(error){console.error('account_delete_failed',{message:error instanceof Error?error.message:'unknown'});return json({error:'Account deletion failed. Please try again or contact support.'},500)}
});
