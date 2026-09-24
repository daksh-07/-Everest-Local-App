import { requireSupabaseConfig,supabase } from './supabase';

export type ConnectionState='SELF'|'NONE'|'OUTGOING'|'INCOMING'|'CONNECTED'|'BLOCKED'|'UNAVAILABLE';
export type SocialPreferences={
 profile_visibility:'PUBLIC'|'LIMITED'|'PRIVATE';
 connection_requests:'EVERYONE'|'MUTUALS'|'NOBODY';
 message_requests:'EVERYONE'|'CONNECTIONS'|'NOBODY';
 connection_list_visibility:'EVERYONE'|'CONNECTIONS'|'ONLY_ME';
 search_visible:boolean;
 show_location:boolean;
};
export type PublicUserProfile={id:string;display_name:string|null;username:string|null;avatar_url:string|null;bio:string|null;suburb:string|null;joined_at:string|null;connection_count:number;mutual_count:number;connection_state:ConnectionState};
export type ConnectionPerson={id:string;display_name:string|null;avatar_url:string|null;bio:string|null;mutual_count:number};
export type ConnectionRequest={id:string;requester_id:string;display_name:string|null;avatar_url:string|null;bio:string|null;mutual_count:number;created_at:string};
export type PersonalConversation={id:string;other_user_id:string;display_name:string|null;avatar_url:string|null;status:'REQUEST'|'ACTIVE'|'DECLINED';initiated_by:string;updated_at:string};
export type PersonalMessage={id:string;conversation_id:string;sender_id:string;body:string;read_at:string|null;created_at:string;deleted_for_everyone:boolean};

export async function getPublicUserProfile(userId:string):Promise<PublicUserProfile|null>{requireSupabaseConfig();const {data,error}=await supabase.rpc('get_public_user_profile',{p_user:userId});if(error)throw new Error(error.message);return data as PublicUserProfile|null}
export async function getConnectionState(userId:string):Promise<ConnectionState>{requireSupabaseConfig();const {data,error}=await supabase.rpc('get_connection_state',{p_other:userId});if(error)throw new Error(error.message);return data as ConnectionState}
export async function sendConnectionRequest(userId:string){requireSupabaseConfig();const {data,error}=await supabase.rpc('send_connection_request',{p_recipient:userId});if(error)throw new Error(error.message);return data as string}
export async function cancelConnectionRequest(userId:string){requireSupabaseConfig();const {data,error}=await supabase.rpc('cancel_connection_request',{p_recipient:userId});if(error)throw new Error(error.message);return Boolean(data)}
export async function respondConnectionRequest(requestId:string,accept:boolean){requireSupabaseConfig();const {data,error}=await supabase.rpc('respond_connection_request',{p_request:requestId,p_accept:accept});if(error)throw new Error(error.message);return Boolean(data)}
export async function removeConnection(userId:string){requireSupabaseConfig();const {data,error}=await supabase.rpc('remove_connection',{p_other:userId});if(error)throw new Error(error.message);return Boolean(data)}
export async function blockUser(userId:string){requireSupabaseConfig();const {data,error}=await supabase.rpc('block_user',{p_other:userId});if(error)throw new Error(error.message);return Boolean(data)}
export async function reportUser(userId:string,reason:'SPAM'|'HARASSMENT'|'IMPERSONATION'|'INAPPROPRIATE'|'OTHER'='OTHER',details?:string){requireSupabaseConfig();const {data,error}=await supabase.rpc('report_user',{p_other:userId,p_reason:reason,p_details:details?.trim()||null});if(error)throw new Error(error.message);return data as string}
export async function unblockUser(userId:string){requireSupabaseConfig();const {data,error}=await supabase.rpc('unblock_user',{p_other:userId});if(error)throw new Error(error.message);return Boolean(data)}
export async function listConnections(userId?:string):Promise<ConnectionPerson[]>{requireSupabaseConfig();const {data,error}=await supabase.rpc('list_connections',{p_user:userId??null});if(error)throw new Error(error.message);return (data??[]) as ConnectionPerson[]}
export async function listConnectionRequests():Promise<ConnectionRequest[]>{requireSupabaseConfig();const {data,error}=await supabase.rpc('list_connection_requests');if(error)throw new Error(error.message);return (data??[]) as ConnectionRequest[]}
export async function getSocialPreferences():Promise<SocialPreferences>{requireSupabaseConfig();const {data,error}=await supabase.rpc('get_social_preferences');if(error)throw new Error(error.message);return data as SocialPreferences}
export async function setSocialPreferences(value:SocialPreferences){requireSupabaseConfig();const {data,error}=await supabase.rpc('set_social_preferences',{p_profile_visibility:value.profile_visibility,p_connection_requests:value.connection_requests,p_message_requests:value.message_requests,p_connection_list_visibility:value.connection_list_visibility,p_search_visible:value.search_visible,p_show_location:value.show_location});if(error)throw new Error(error.message);return Boolean(data)}
export async function sendPersonalMessage(recipientId:string,body:string){requireSupabaseConfig();const {data,error}=await supabase.rpc('send_personal_message',{p_recipient:recipientId,p_body:body});if(error)throw new Error(error.message);return data as string}
export async function respondMessageRequest(conversationId:string,accept:boolean){requireSupabaseConfig();const {data,error}=await supabase.rpc('respond_message_request',{p_conversation:conversationId,p_accept:accept});if(error)throw new Error(error.message);return Boolean(data)}
export async function listPersonalConversations(requests=false):Promise<PersonalConversation[]>{requireSupabaseConfig();const {data,error}=await supabase.rpc('list_personal_conversations',{p_requests:requests});if(error)throw new Error(error.message);return (data??[]) as PersonalConversation[]}
export async function personalMessages(conversationId:string):Promise<PersonalMessage[]>{requireSupabaseConfig();const {data,error}=await supabase.rpc('list_personal_messages',{p_conversation:conversationId});if(error)throw new Error(error.message);return (data??[]) as PersonalMessage[]}
export async function deletePersonalMessageForMe(messageId:string){requireSupabaseConfig();const {data,error}=await supabase.rpc('delete_personal_message_for_me',{p_message:messageId});if(error)throw new Error(error.message);return Boolean(data)}
export async function deletePersonalMessageForEveryone(messageId:string){requireSupabaseConfig();const {data,error}=await supabase.rpc('delete_personal_message_for_everyone',{p_message:messageId});if(error)throw new Error(error.message);return Boolean(data)}
export async function markPersonalMessageRead(messageId:string){requireSupabaseConfig();const {data,error}=await supabase.rpc('mark_personal_message_read',{p_message:messageId});if(error)throw new Error(error.message);return Boolean(data)}
export async function publicPostsForUser(userId:string){requireSupabaseConfig();const {data,error}=await supabase.from('posts').select('id,author_id,business_id,caption,post_type,visibility,status,created_at,post_media(id,media_type,storage_path,sort_order)').eq('author_id',userId).eq('status','PUBLISHED').eq('visibility','PUBLIC').order('created_at',{ascending:false}).limit(40);if(error)throw new Error(error.message);return data??[]}
