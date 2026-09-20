import { supabase, requireSupabaseConfig } from './supabase';

export type DeliveryMode = 'LOCAL' | 'REMOTE' | 'BOTH';
export type TaxonomyCategory = { id:string; name:string; slug:string; parent_id:string|null };
export type ServiceDefinition = { id:string; category_id:string; name:string; slug:string; description:string|null; default_delivery_mode:DeliveryMode };

export async function listServiceTaxonomy():Promise<{roots:TaxonomyCategory[]; subcategories:TaxonomyCategory[]; services:ServiceDefinition[]}>{
  requireSupabaseConfig();
  const [categories,definitions]=await Promise.all([
    supabase.from('categories').select('id,name,slug,parent_id').eq('active',true).eq('kind','SERVICE').order('name'),
    supabase.from('service_definitions').select('id,category_id,name,slug,description,default_delivery_mode').eq('active',true).order('name'),
  ]);
  if(categories.error) throw new Error(categories.error.message);
  if(definitions.error) throw new Error(definitions.error.message);
  const all=(categories.data??[]) as TaxonomyCategory[];
  return {roots:all.filter(x=>x.parent_id===null),subcategories:all.filter(x=>x.parent_id!==null),services:(definitions.data??[]) as ServiceDefinition[]};
}

export async function searchServiceTaxonomy(query:string, mode?:DeliveryMode){
  requireSupabaseConfig();
  let request=supabase.from('service_definitions').select('id,category_id,name,slug,description,default_delivery_mode').eq('active',true).order('name').limit(40);
  if(query.trim()) request=request.ilike('name',`%${query.trim().replace(/%/g,'\\%').replace(/_/g,'\\_')}%`);
  if(mode) request=request.in('default_delivery_mode',mode==='BOTH'?['BOTH','LOCAL','REMOTE']:[mode,'BOTH']);
  const {data,error}=await request;
  if(error) throw new Error(error.message);
  return (data??[]) as ServiceDefinition[];
}
