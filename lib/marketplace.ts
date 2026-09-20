import { supabase, requireSupabaseConfig } from './supabase';
import type { MarketplaceBusiness, Product, Quote, ServiceRequest, Profile } from './types';

export async function currentUser(){requireSupabaseConfig();const {data,error}=await supabase.auth.getUser();if(error)throw new Error(error.message);return data.user;}
export async function getProfile():Promise<Profile|null>{const user=await currentUser();if(!user)return null;const {data,error}=await supabase.from('profiles').select('*').eq('id',user.id).single();if(error)throw new Error(error.message);return data as Profile;}
export async function searchBusinesses(query:string,suburb?:string):Promise<MarketplaceBusiness[]>{requireSupabaseConfig();let request=supabase.from('businesses').select('id,name,slug,description,logo_url,category_id,verification_status,suburb,city,state').eq('status','ACTIVE').eq('verification_status','VERIFIED').limit(30);if(query.trim())request=request.ilike('name',`%${query.trim()}%`);if(suburb?.trim())request=request.ilike('suburb',suburb.trim());const {data,error}=await request;if(error)throw new Error(error.message);return (data??[]) as MarketplaceBusiness[];}
export async function searchProducts(query:string):Promise<Product[]>{requireSupabaseConfig();const text=query.trim();if(!text){const {data,error}=await supabase.from('products').select('id,business_id,category_id,name,slug,description,price,sale_price,status,delivery_eligible,pickup_available').eq('status','ACTIVE').limit(30);if(error)throw new Error(error.message);return (data??[]) as Product[];}const pattern=`%${text}%`;const [byName,byDescription]=await Promise.all([supabase.from('products').select('id,business_id,category_id,name,slug,description,price,sale_price,status,delivery_eligible,pickup_available').eq('status','ACTIVE').ilike('name',pattern).limit(30),supabase.from('products').select('id,business_id,category_id,name,slug,description,price,sale_price,status,delivery_eligible,pickup_available').eq('status','ACTIVE').ilike('description',pattern).limit(30)]);if(byName.error)throw new Error(byName.error.message);if(byDescription.error)throw new Error(byDescription.error.message);const merged=new Map<string,Product>();for(const item of [...(byName.data??[]),...(byDescription.data??[])])merged.set(item.id,item as Product);return [...merged.values()].slice(0,30);}
export async function createServiceRequest(input:{categoryId?:string;serviceId?:string;description:string;suburb:string;city:string;state:string;preferredDate?:string;preferredTime?:string;budget?:number;mediaUrls?:string[]}){requireSupabaseConfig();const description=input.description.trim();const suburb=input.suburb.trim();if(description.length<5||description.length>5000)throw new Error('Service description must be between 5 and 5000 characters.');if(!suburb||suburb.length>120)throw new Error('A valid suburb is required.');if(input.budget!==undefined&&(!Number.isFinite(input.budget)||input.budget<0))throw new Error('Budget must be a valid non-negative amount.');const {data,error}=await supabase.rpc('create_service_request',{p_category_id:input.categoryId??null,p_service_id:input.serviceId??null,p_description:description,p_suburb:suburb,p_city:input.city.trim(),p_state:input.state.trim(),p_preferred_date:input.preferredDate??null,p_preferred_time:input.preferredTime??null,p_budget:input.budget??null,p_media_urls:input.mediaUrls??[]});if(error)throw new Error(error.message);return data as string;}
export async function myRequests():Promise<ServiceRequest[]>{const user=await currentUser();if(!user)return[];const {data,error}=await supabase.from('service_requests').select('*').eq('customer_id',user.id).order('created_at',{ascending:false});if(error)throw new Error(error.message);return (data??[]) as ServiceRequest[];}
export async function myQuotes():Promise<Quote[]>{const user=await currentUser();if(!user)return[];const {data,error}=await supabase.from('quotes').select('*').eq('customer_id',user.id).order('created_at',{ascending:false});if(error)throw new Error(error.message);return (data??[]) as Quote[];}
export async function acceptQuote(quoteId:string){requireSupabaseConfig();if(!quoteId.trim())throw new Error('Quote reference is required.');const {data,error}=await supabase.rpc('accept_quote',{p_quote_id:quoteId});if(error)throw new Error(error.message);return data as string;}
export async function updateBookingStatus(bookingId:string,nextStatus:'REQUESTED'|'PENDING_PAYMENT'|'CONFIRMED'|'UPCOMING'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED'|'DISPUTED'){requireSupabaseConfig();const {data,error}=await supabase.rpc('update_booking_status',{p_booking_id:bookingId,p_next:nextStatus});if(error)throw new Error(error.message);return Boolean(data);}

export async function mySavedBusinesses():Promise<MarketplaceBusiness[]>{
 const user=await currentUser();if(!user)return[];
 const {data: saved,error: savedError}=await supabase.from('saved_businesses').select('business_id,created_at').eq('customer_id',user.id).order('created_at',{ascending:false});
 if(savedError)throw new Error(savedError.message);
 const ids=(saved??[]).map((row)=>row.business_id as string);
 if(!ids.length)return[];
 const {data,error}=await supabase.from('businesses').select('id,name,slug,description,logo_url,category_id,verification_status,suburb,city,state').in('id',ids);
 if(error)throw new Error(error.message);
 const byId=new Map((data??[]).map((item)=>[item.id,item as MarketplaceBusiness]));
 return ids.map((id)=>byId.get(id)).filter((item):item is MarketplaceBusiness=>Boolean(item));
}

export async function mySavedProducts():Promise<Product[]>{
 const user=await currentUser();if(!user)return[];
 const {data: saved,error: savedError}=await supabase.from('saved_products').select('product_id,created_at').eq('customer_id',user.id).order('created_at',{ascending:false});
 if(savedError)throw new Error(savedError.message);
 const ids=(saved??[]).map((row)=>row.product_id as string);
 if(!ids.length)return[];
 const {data,error}=await supabase.from('products').select('id,business_id,category_id,name,slug,description,price,sale_price,status,delivery_eligible,pickup_available').in('id',ids);
 if(error)throw new Error(error.message);
 const byId=new Map((data??[]).map((item)=>[item.id,item as Product]));
 return ids.map((id)=>byId.get(id)).filter((item):item is Product=>Boolean(item));
}

export async function setBusinessSaved(businessId:string,saved:boolean){
 const user=await currentUser();if(!user)throw new Error('Sign in to save businesses.');
 if(!businessId.trim())throw new Error('Business reference is required.');
 const query=supabase.from('saved_businesses');
 if(saved){const {error}=await query.upsert({customer_id:user.id,business_id:businessId},{onConflict:'customer_id,business_id'});if(error)throw new Error(error.message);return;}
 const {error}=await query.delete().eq('customer_id',user.id).eq('business_id',businessId);if(error)throw new Error(error.message);
}

export async function setProductSaved(productId:string,saved:boolean){
 const user=await currentUser();if(!user)throw new Error('Sign in to save products.');
 if(!productId.trim())throw new Error('Product reference is required.');
 const query=supabase.from('saved_products');
 if(saved){const {error}=await query.upsert({customer_id:user.id,product_id:productId},{onConflict:'customer_id,product_id'});if(error)throw new Error(error.message);return;}
 const {error}=await query.delete().eq('customer_id',user.id).eq('product_id',productId);if(error)throw new Error(error.message);
}
