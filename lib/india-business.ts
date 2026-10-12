import {requireSupabaseConfig,supabase} from './supabase';
import {userFacingError} from './errors';

export type IndiaBusinessSetupInput={
 name:string;
 description:string;
 phone:string;
 email:string;
 locality:string;
 city:string;
 state:string;
 pinCode:string;
 categoryId:string;
 services:Array<{serviceDefinitionId:string;deliveryMode:'LOCAL'|'REMOTE'|'BOTH'}>;
 serviceArea?:{locality:string;city:string;state:string;pinCode:string};
};

export async function createIndiaBusinessSetup(input:IndiaBusinessSetupInput){
 requireSupabaseConfig();
 if(input.name.trim().length<2)throw new Error('Enter your business name.');
 if(!input.city.trim()||!input.state.trim())throw new Error('City and state are required.');
 if(!/^\d{6}$/.test(input.pinCode.trim()))throw new Error('Enter a valid 6-digit PIN code.');
 if(!input.services.length)throw new Error('Select at least one service.');
 const {data,error}=await supabase.functions.invoke('india-business-setup',{body:{
  name:input.name.trim(),
  description:input.description.trim(),
  phone:input.phone.trim(),
  email:input.email.trim().toLowerCase(),
  locality:input.locality.trim(),
  city:input.city.trim(),
  state:input.state.trim(),
  pin_code:input.pinCode.trim(),
  category_id:input.categoryId,
  services:input.services.map(item=>({service_definition_id:item.serviceDefinitionId,delivery_mode:item.deliveryMode})),
  service_area:input.serviceArea?{
   locality:input.serviceArea.locality.trim(),
   city:input.serviceArea.city.trim(),
   state:input.serviceArea.state.trim(),
   pin_code:input.serviceArea.pinCode.trim(),
  }:null,
 }});
 if(error)throw new Error(userFacingError(error,'India business setup could not be completed. Please try again.'));
 if(data?.error)throw new Error(typeof data.error==='string'?data.error:'India business setup could not be completed.');
 if(typeof data?.business_id!=='string')throw new Error('India business setup returned an invalid reference.');
 return data.business_id as string;
}

export type IndiaEntityType='SOLE_PROPRIETOR'|'PARTNERSHIP'|'LLP'|'PRIVATE_LIMITED'|'PUBLIC_LIMITED'|'OTHER';

export async function submitIndiaBusinessVerification(input:{businessId:string;legalName:string;entityType:IndiaEntityType;gstin?:string}){
 requireSupabaseConfig();
 const gstin=input.gstin?.trim().toUpperCase()||'';
 if(gstin&&!/^[0-9A-Z]{15}$/.test(gstin))throw new Error('GSTIN must be 15 alphanumeric characters.');
 const {data,error}=await supabase.functions.invoke('business-india-verify',{body:{
  business_id:input.businessId,
  legal_name:input.legalName.trim(),
  entity_type:input.entityType,
  gstin:gstin||null,
 }});
 if(error)throw new Error(userFacingError(error,'India business verification could not be submitted.'));
 if(data?.error)throw new Error(typeof data.error==='string'?data.error:'India business verification could not be submitted.');
 if(typeof data?.verification_id!=='string')throw new Error('India business verification returned an invalid reference.');
 return data as {verification_id:string;status:'PENDING'};
}
