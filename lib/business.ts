import { supabase, requireSupabaseConfig } from './supabase';
import { submitBusinessVerification as submitBusinessVerificationFlow } from './business-verification';

export async function createBusinessProfile(input:{name:string;description:string;categoryId?:string;abn?:string;phone?:string;email?:string;suburb:string;city:string;state:string;postcode?:string}){
 requireSupabaseConfig();
 const name=input.name.trim();const suburb=input.suburb.trim();
 if(name.length<2||name.length>120)throw new Error('Business name must be between 2 and 120 characters.');
 if(!suburb)throw new Error('Suburb is required.');
 const {data,error}=await supabase.rpc('create_business_profile',{p_name:name,p_description:input.description.trim(),p_category_id:input.categoryId??null,p_abn:input.abn?.trim()||null,p_phone:input.phone?.trim()||null,p_email:input.email?.trim().toLowerCase()||null,p_suburb:suburb,p_city:input.city.trim(),p_state:input.state.trim(),p_postcode:input.postcode?.trim()||null});
 if(error)throw new Error(error.message);if(typeof data!=='string')throw new Error('Business creation returned an invalid reference.');return data;
}

export async function submitBusinessVerification(businessId:string,abn:string){
 return submitBusinessVerificationFlow(businessId,abn);
}

export async function createBusinessSetup(input:{
 name:string;description:string;categoryId:string;abn?:string;phone?:string;email?:string;suburb:string;city:string;state:string;postcode?:string;
 services:Array<{serviceDefinitionId:string;deliveryMode:'LOCAL'|'REMOTE'|'BOTH'}>;
 serviceArea?:{suburb:string;city:string;state:string;postcode?:string};
}){
 requireSupabaseConfig();
 if(!input.services.length)throw new Error('Select at least one service.');
 const {data,error}=await supabase.rpc('create_business_setup',{
  p_name:input.name.trim(),p_description:input.description.trim(),p_category_id:input.categoryId,
  p_abn:input.abn?.trim()||null,p_phone:input.phone?.trim()||null,p_email:input.email?.trim().toLowerCase()||null,
  p_suburb:input.suburb.trim(),p_city:input.city.trim(),p_state:input.state.trim(),p_postcode:input.postcode?.trim()||null,
  p_services:input.services.map(item=>({service_definition_id:item.serviceDefinitionId,delivery_mode:item.deliveryMode})),
  p_service_area:input.serviceArea?{...input.serviceArea,postcode:input.serviceArea.postcode||null}:null,
 });
 if(error)throw new Error(error.message);
 if(typeof data!=='string')throw new Error('Business setup returned an invalid reference.');
 return data;
}
