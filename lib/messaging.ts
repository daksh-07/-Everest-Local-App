import { supabase, requireSupabaseConfig } from './supabase';

type SupabaseLikeError = { code?: unknown; message?: unknown };

function safeError(error: unknown, fallback: string) {
  const candidate = error as SupabaseLikeError | null;
  const code = typeof candidate?.code === 'string' ? candidate.code : '';
  switch (code) {
    case '42501':
      return 'You do not have permission to perform this messaging action.';
    case '23503':
      return 'The related marketplace record is no longer available.';
    case '23505':
      return 'This messaging action has already been completed.';
    case 'PGRST116':
      return 'The requested conversation could not be found.';
    default:
      return fallback;
  }
}

export async function conversations() {
  requireSupabaseConfig();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const [{ data: customerConversations, error: customerError }, { data: memberships, error: membershipError }] = await Promise.all([
    supabase.from('conversations').select('id,customer_id,business_id,request_id,booking_id,quote_id,context_type,product_id,service_id,context_title,created_at').eq('customer_id', user.id).order('created_at', { ascending: false }),
    supabase.from('business_members').select('business_id').eq('user_id', user.id),
  ]);
  if (customerError) throw new Error(safeError(customerError, 'Unable to load your conversations.'));
  if (membershipError) throw new Error(safeError(membershipError, 'Unable to load your business conversations.'));
  const businessIds = (memberships ?? []).map(item => item.business_id);
  let businessConversations: NonNullable<typeof customerConversations> = [];
  if (businessIds.length) {
    const { data, error } = await supabase.from('conversations').select('id,customer_id,business_id,request_id,booking_id,quote_id,context_type,product_id,service_id,context_title,created_at').in('business_id', businessIds).order('created_at', { ascending: false });
    if (error) throw new Error(safeError(error, 'Unable to load your business conversations.'));
    businessConversations = data ?? [];
  }
  const merged = new Map<string, NonNullable<typeof customerConversations>[number]>();
  for (const item of [...(customerConversations ?? []), ...businessConversations]) merged.set(item.id, item);
  return [...merged.values()].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export async function conversation(conversationId: string) {
  requireSupabaseConfig();
  const id = conversationId.trim();
  if (!id) throw new Error('Conversation reference is required.');
  const { data, error } = await supabase.from('conversations').select('id,customer_id,business_id,request_id,booking_id,quote_id,context_type,product_id,service_id,context_title,created_at').eq('id', id).single();
  if (error) throw new Error(safeError(error, 'Unable to load this conversation.'));
  return data;
}

export async function getOrCreateConversation(input: { requestId: string; businessId: string; quoteId?: string | null; bookingId?: string | null }) {
  requireSupabaseConfig();
  if (!input.requestId.trim() || !input.businessId.trim()) throw new Error('Request and business references are required.');
  const { data, error } = await supabase.rpc('get_or_create_conversation', { p_request_id: input.requestId, p_business_id: input.businessId, p_quote_id: input.quoteId ?? null, p_booking_id: input.bookingId ?? null });
  if (error) throw new Error(safeError(error, 'Unable to open the marketplace conversation.'));
  if (typeof data !== 'string') throw new Error('Conversation creation returned an invalid reference.');
  return data;
}

export async function messages(conversationId: string) {
  requireSupabaseConfig();
  const id = conversationId.trim();
  if (!id) throw new Error('Conversation reference is required.');
  const { data, error } = await supabase.from('messages').select('id,sender_id,body,read_at,created_at').eq('conversation_id', id).order('created_at', { ascending: true });
  if (error) throw new Error(safeError(error, 'Unable to load this conversation.'));
  return data ?? [];
}

export async function sendMessage(conversationId: string, body: string) {
  requireSupabaseConfig();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');
  const text = body.trim();
  if (!text || text.length > 5000) throw new Error('Message must be between 1 and 5000 characters');
  const { data, error } = await supabase.from('messages').insert({ conversation_id: conversationId, sender_id: user.id, body: text }).select('id').single();
  if (error) throw new Error(safeError(error, 'Message could not be sent.'));
  return data.id;
}

export async function markMessageRead(messageId: string) {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('mark_message_read', { p_message_id: messageId });
  if (error) throw new Error(safeError(error, 'Message could not be marked as read.'));
  return Boolean(data);
}


export async function getOrCreateBusinessInquiry(input:{businessId:string;contextType:'PRODUCT'|'SERVICE';contextId:string}){
 requireSupabaseConfig();
 const {data,error}=await supabase.rpc('get_or_create_business_inquiry',{
  p_business_id:input.businessId,
  p_context_type:input.contextType,
  p_context_id:input.contextId,
 });
 if(error)throw new Error(safeError(error,'Unable to open this business enquiry.'));
 if(typeof data!=='string')throw new Error('Conversation creation returned an invalid reference.');
 return data;
}
