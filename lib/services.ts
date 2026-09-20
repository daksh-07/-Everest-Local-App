import { supabase, requireSupabaseConfig } from './supabase';
import type { DeliveryMode } from './taxonomy';

export interface BusinessService{
 id:string;business_id:string;name:string;description:string|null;base_price:number|null;duration_minutes:number|null;active:boolean;
 delivery_mode:DeliveryMode;service_definition_id:string|null;category_id:string|null;
}

export async function createService(input:{
 businessId:string;name:string;description:string;basePrice?:number;durationMinutes?:number;categoryId?:string;serviceDefinitionId?:string;deliveryMode?:DeliveryMode;
}){
 requireSupabaseConfig();
 if(input.basePrice!==undefined&&(!Number.isFinite(input.basePrice)||input.basePrice<0))throw new Error('Invalid base price.');
 if(input.durationMinutes!==undefined&&(!Number.isInteger(input.durationMinutes)||input.durationMinutes<1))throw new Error('Invalid duration.');
 const {data,error}=await supabase.rpc('create_service',{
  p_business_id:input.businessId,p_name:input.name.trim(),p_description:input.description.trim(),p_category_id:input.categoryId??null,
  p_base_price:input.basePrice??null,p_duration_minutes:input.durationMinutes??null,
  p_service_definition_id:input.serviceDefinitionId??null,p_delivery_mode:input.deliveryMode??'LOCAL'
 });
 if(error)throw new Error(error.message);
 return data as string;
}

export async function setServiceStatus(serviceId:string,active:boolean){
 requireSupabaseConfig();
 const {data,error}=await supabase.rpc('set_service_status',{p_service_id:serviceId,p_active:active});
 if(error)throw new Error(error.message);return Boolean(data);
}
