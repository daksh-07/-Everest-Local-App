import {supabase,requireSupabaseConfig} from './supabase';

export type SavedSearch={id:string;name:string;vertical:'ALL'|'BUSINESS'|'SERVICE'|'PRODUCT'|'DEAL'|'POST';query:string;structured_filters:Record<string,unknown>;suburb:string|null;city:string|null;state:string|null;radius_km:number|null;notifications_enabled:boolean;created_at:string;updated_at:string};
export type SavedSearchMatch={id:string;saved_search_id:string;matched_entity_type:string;matched_entity_id:string;match_context:{title?:string;amount?:number;available_now?:boolean};first_matched_at:string;notified_at:string|null};
export type InstantSlot={starts_at:string;ends_at:string};

function clean(value:string|undefined){return value?.trim()||null;}
export async function saveSearch(input:{name:string;query:string;vertical?:SavedSearch['vertical'];suburb?:string;city?:string;state?:string;radiusKm?:number;filters?:Record<string,unknown>}){
 requireSupabaseConfig();const {data:{user},error:userError}=await supabase.auth.getUser();if(userError)throw userError;if(!user)throw new Error('Please sign in to save a search.');
 const name=input.name.trim();if(!name||name.length>120)throw new Error('Give this search a short name.');
 const {data,error}=await supabase.from('saved_searches').insert({user_id:user.id,name,query:input.query.trim(),vertical:input.vertical??'ALL',suburb:clean(input.suburb),city:clean(input.city),state:clean(input.state),radius_km:input.radiusKm??null,structured_filters:input.filters??{}}).select('id').single();
 if(error)throw new Error(error.message);return data.id as string;
}
export async function listSavedSearches(){requireSupabaseConfig();const {data,error}=await supabase.from('saved_searches').select('*').order('updated_at',{ascending:false});if(error)throw new Error(error.message);return (data??[]) as SavedSearch[];}
export async function listSavedSearchMatches(searchId:string){requireSupabaseConfig();const {data,error}=await supabase.from('saved_search_matches').select('*').eq('saved_search_id',searchId).order('first_matched_at',{ascending:false}).limit(12);if(error)throw new Error(error.message);return (data??[]) as SavedSearchMatch[];}
export async function updateSavedSearch(id:string,input:Pick<SavedSearch,'name'|'notifications_enabled'>){const {error}=await supabase.from('saved_searches').update({name:input.name.trim(),notifications_enabled:input.notifications_enabled}).eq('id',id);if(error)throw new Error(error.message);}
export async function deleteSavedSearch(id:string){const {error}=await supabase.from('saved_searches').delete().eq('id',id);if(error)throw new Error(error.message);}
export async function getInstantSlots(serviceId:string){requireSupabaseConfig();const {data,error}=await supabase.rpc('get_instant_booking_slots',{p_service_id:serviceId,p_from:new Date().toISOString(),p_days:14});if(error)throw new Error(error.message);return (data??[]) as InstantSlot[];}
export async function instantBook(input:{serviceId:string;startsAt:string;suburb:string;city:string;state:string;notes?:string}){requireSupabaseConfig();const {data,error}=await supabase.rpc('instant_book_service',{p_service_id:input.serviceId,p_starts_at:input.startsAt,p_suburb:input.suburb.trim(),p_city:input.city.trim(),p_state:input.state.trim(),p_notes:input.notes?.trim()||null});if(error)throw new Error(error.message);return data as string;}
