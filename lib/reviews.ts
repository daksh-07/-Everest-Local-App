import { supabase, requireSupabaseConfig } from './supabase';

export type ReviewTarget={id:string;kind:'SERVICE'|'PRODUCT';businessId:string;businessName:string;referenceId:string;productId?:string;reviewed:boolean};
type BookingRow={id:string;business_id:string;status:string;businesses?:{name:string}|{name:string}[]|null};
type OrderRow={id:string;business_id:string;status:string;order_number:string;order_items?:{product_id:string;product_name:string}[]|null};
type ReviewRow={booking_id:string|null;order_id:string|null;product_id:string|null};

function businessName(value:BookingRow['businesses']):string{return Array.isArray(value)?value[0]?.name??'Business':value?.name??'Business';}

export async function reviewTargets():Promise<ReviewTarget[]>{
 requireSupabaseConfig();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return [];
 const [{data:bookings,error:bookingError},{data:orders,error:orderError},{data:reviews,error:reviewError}]=await Promise.all([
  supabase.from('bookings').select('id,business_id,status,businesses(name)').eq('customer_id',user.id).eq('status','COMPLETED').order('created_at',{ascending:false}),
  supabase.from('orders').select('id,business_id,status,order_number,order_items(product_id,product_name)').eq('customer_id',user.id).eq('status','COMPLETED').order('created_at',{ascending:false}),
  supabase.from('reviews').select('booking_id,order_id,product_id').eq('author_id',user.id),
 ]);
 if(bookingError)throw new Error(bookingError.message);if(orderError)throw new Error(orderError.message);if(reviewError)throw new Error(reviewError.message);
 const existing=(reviews??[]) as ReviewRow[];const targets:ReviewTarget[]=[];
 for(const b of (bookings??[]) as BookingRow[])targets.push({id:`booking:${b.id}`,kind:'SERVICE',businessId:b.business_id,businessName:businessName(b.businesses),referenceId:b.id,reviewed:existing.some(r=>r.booking_id===b.id)});
 for(const o of (orders??[]) as OrderRow[]){for(const item of o.order_items??[])targets.push({id:`order:${o.id}:${item.product_id}`,kind:'PRODUCT',businessId:o.business_id,businessName:item.product_name,referenceId:o.id,productId:item.product_id,reviewed:existing.some(r=>r.order_id===o.id&&r.product_id===item.product_id)});}
 return targets;
}

export async function createReview(input:{businessId:string;productId?:string;bookingId?:string;orderId?:string;rating:number;body?:string;photoUrls?:string[]}){
 requireSupabaseConfig();
 if(!Number.isInteger(input.rating)||input.rating<1||input.rating>5)throw new Error('Rating must be between 1 and 5.');
 const body=input.body?.trim()||null;if(body&&body.length>2000)throw new Error('Review must be 2000 characters or fewer.');
 const {data,error}=await supabase.rpc('create_transaction_review',{p_business_id:input.businessId,p_product_id:input.productId??null,p_booking_id:input.bookingId??null,p_order_id:input.orderId??null,p_rating:input.rating,p_body:body,p_photo_urls:input.photoUrls??[]});
 if(error)throw new Error(error.message);return data as string;
}
