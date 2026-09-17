import { supabase, requireSupabaseConfig } from './supabase';

export async function createBusinessProfile(input:{name:string;description:string;categoryId?:string;abn?:string;phone?:string;email?:string;suburb:string;city:string;state:string;postcode?:string}){
 requireSupabaseConfig();
 const name=input.name.trim();const suburb=input.suburb.trim();
 if(name.length<2||name.length>120)throw new Error('Business name must be between 2 and 120 characters.');
 if(!suburb)throw new Error('Suburb is required.');
 const {data,error}=await supabase.rpc('create_business_profile',{p_name:name,p_description:input.description.trim(),p_category_id:input.categoryId??null,p_abn:input.abn?.trim()||null,p_phone:input.phone?.trim()||null,p_email:input.email?.trim().toLowerCase()||null,p_suburb:suburb,p_city:input.city.trim(),p_state:input.state.trim(),p_postcode:input.postcode?.trim()||null});
 if(error)throw new Error(error.message);if(typeof data!=='string')throw new Error('Business creation returned an invalid reference.');return data;
}

export async function submitBusinessVerification(businessId:string,abn:string,documents:unknown[]=[]){
 requireSupabaseConfig();const {data,error}=await supabase.rpc('submit_business_verification',{p_business_id:businessId,p_abn:abn.trim()||null,p_documents:documents});if(error)throw new Error(error.message);return data as string;
}
