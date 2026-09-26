import {supabase,requireSupabaseConfig} from './supabase';

export type BusinessDmSettings={
 business_id:string;
 ai_enabled:boolean;
 faq_enabled:boolean;
 ai_tone:'HELPFUL'|'CONCISE'|'FRIENDLY'|'PROFESSIONAL';
 updated_at:string;
};

export type BusinessDmFaq={
 id:string;
 business_id:string;
 context_type:'ALL'|'PRODUCT'|'SERVICE';
 question:string;
 answer:string;
 sort_order:number;
 active:boolean;
};

export async function getBusinessDmSettings(businessId:string){
 requireSupabaseConfig();
 const {data,error}=await supabase.from('business_dm_settings').select('business_id,ai_enabled,faq_enabled,ai_tone,updated_at').eq('business_id',businessId).maybeSingle();
 if(error)throw new Error(error.message);
 return data as BusinessDmSettings|null;
}

export async function setBusinessDmAi(businessId:string,enabled:boolean,tone:BusinessDmSettings['ai_tone']){
 requireSupabaseConfig();
 const {data,error}=await supabase.rpc('set_business_dm_ai',{p_business_id:businessId,p_enabled:enabled,p_tone:tone});
 if(error)throw new Error(error.message);
 return Boolean(data);
}

export async function listBusinessDmFaqs(businessId:string){
 requireSupabaseConfig();
 const {data,error}=await supabase.from('business_dm_faq').select('id,business_id,context_type,question,answer,sort_order,active').eq('business_id',businessId).order('sort_order').order('created_at');
 if(error)throw new Error(error.message);
 return (data??[]) as BusinessDmFaq[];
}

export async function addBusinessDmFaq(input:{businessId:string;contextType:'ALL'|'PRODUCT'|'SERVICE';question:string;answer:string;sortOrder:number}){
 requireSupabaseConfig();
 const {data,error}=await supabase.from('business_dm_faq').insert({
  business_id:input.businessId,
  context_type:input.contextType,
  question:input.question.trim(),
  answer:input.answer.trim(),
  sort_order:input.sortOrder,
 }).select('id,business_id,context_type,question,answer,sort_order,active').single();
 if(error)throw new Error(error.message);
 return data as BusinessDmFaq;
}

export async function updateBusinessDmFaq(id:string,input:Partial<Pick<BusinessDmFaq,'context_type'|'question'|'answer'|'active'|'sort_order'>>){
 requireSupabaseConfig();
 const {data,error}=await supabase.from('business_dm_faq').update(input).eq('id',id).select('id,business_id,context_type,question,answer,sort_order,active').single();
 if(error)throw new Error(error.message);
 return data as BusinessDmFaq;
}

export async function deleteBusinessDmFaq(id:string){
 requireSupabaseConfig();
 const {error}=await supabase.from('business_dm_faq').delete().eq('id',id);
 if(error)throw new Error(error.message);
}
