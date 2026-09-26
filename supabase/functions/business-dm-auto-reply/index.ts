import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});

function extractResponseText(data:any){
 if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();
 const output=Array.isArray(data?.output)?data.output:[];
 for(const item of output){
  const parts=Array.isArray(item?.content)?item.content:[];
  for(const part of parts){
   if(part?.type==='output_text'&&typeof part?.text==='string'&&part.text.trim())return part.text.trim();
  }
 }
 return '';
}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Method not allowed'},405);

 try{
  const url=Deno.env.get('SUPABASE_URL')??'';
  const publishable=Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY')??'';
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??Deno.env.get('SUPABASE_SECRET_KEY')??'';
  if(!url||!publishable||!service)return json({error:'Messaging automation is not configured.'},503);

  const auth=req.headers.get('Authorization')??'';
  const userClient=createClient(url,publishable,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const admin=createClient(url,service,{auth:{persistSession:false}});
  const {data:{user},error:userError}=await userClient.auth.getUser();
  if(userError||!user)return json({error:'Authentication required.'},401);

  const body=await req.json().catch(()=>({}));
  const messageId=typeof body?.messageId==='string'?body.messageId:'';
  if(!messageId)return json({error:'Message reference required.'},400);

  const {data:message,error:messageError}=await admin.from('messages')
   .select('id,conversation_id,sender_id,body,created_at,is_automated')
   .eq('id',messageId).single();
  if(messageError||!message)return json({ok:true,skipped:'message_unavailable'});
  if(message.sender_id!==user.id||message.is_automated)return json({ok:true,skipped:'not_customer_message'});

  const {data:conversation,error:conversationError}=await admin.from('conversations')
   .select('id,customer_id,business_id,context_type,product_id,service_id,context_title')
   .eq('id',message.conversation_id).single();
  if(conversationError||!conversation)return json({ok:true,skipped:'conversation_unavailable'});
  if(conversation.customer_id!==user.id||!['PRODUCT','SERVICE'].includes(conversation.context_type))return json({ok:true,skipped:'not_contextual_inquiry'});

  // A deterministic free FAQ trigger may already have answered this message.
  const {data:existingAuto}=await admin.from('messages')
   .select('id')
   .eq('conversation_id',conversation.id)
   .eq('is_automated',true)
   .gte('created_at',message.created_at)
   .limit(1);
  if(existingAuto?.length)return json({ok:true,skipped:'faq_answered'});

  const {data:settings}=await admin.from('business_dm_settings')
   .select('ai_enabled,ai_tone')
   .eq('business_id',conversation.business_id).maybeSingle();
  if(!settings?.ai_enabled)return json({ok:true,skipped:'ai_disabled'});

  const {data:subscription}=await admin.from('business_subscriptions')
   .select('status')
   .eq('business_id',conversation.business_id).maybeSingle();
  if(!subscription||!['ACTIVE','TRIALING'].includes(subscription.status))return json({ok:true,skipped:'pro_required'});

  const openaiKey=Deno.env.get('OPENAI_API_KEY')??'';
  if(!openaiKey)return json({ok:true,skipped:'ai_provider_not_configured'});

  const [{data:business},{data:faqs}]=await Promise.all([
   admin.from('businesses').select('name,owner_id,description,suburb,city,state').eq('id',conversation.business_id).single(),
   admin.from('business_dm_faq').select('question,answer,context_type').eq('business_id',conversation.business_id).eq('active',true).in('context_type',['ALL',conversation.context_type]).order('sort_order').limit(10),
  ]);
  if(!business?.owner_id)return json({ok:true,skipped:'business_owner_unavailable'});

  let item:any=null;
  if(conversation.context_type==='PRODUCT'&&conversation.product_id){
   const result=await admin.from('products')
    .select('name,short_description,description,price,sale_price,status,brand,key_features,attributes,delivery_eligible,pickup_available,shipping_available,shipping_fee,dispatch_days,made_to_order')
    .eq('id',conversation.product_id).eq('business_id',conversation.business_id).maybeSingle();
   item=result.data;
  }else if(conversation.context_type==='SERVICE'&&conversation.service_id){
   const result=await admin.from('services')
    .select('name,description,base_price,duration_minutes,delivery_mode,active')
    .eq('id',conversation.service_id).eq('business_id',conversation.business_id).maybeSingle();
   item=result.data;
  }
  if(!item)return json({ok:true,skipped:'item_unavailable'});

  const tone=typeof settings.ai_tone==='string'?settings.ai_tone:'HELPFUL';
  const faqContext=(faqs??[]).map((x:any)=>`Q: ${x.question}\nA: ${x.answer}`).join('\n\n');
  const prompt=[
   `You are the automated customer-service assistant for ${business.name} on Everest Local.`,
   `Conversation type: ${conversation.context_type}. Tone: ${tone}.`,
   'Answer ONLY from the business/item facts and FAQ answers below. Never invent stock, delivery coverage, ingredients, availability, guarantees, discounts, policies, prices, booking times, or capabilities.',
   'If the answer is not supported by the supplied facts, say you are not certain and that the business can confirm. Keep the reply concise and useful. Do not claim to be a human.',
   `Business: ${JSON.stringify({name:business.name,description:business.description,suburb:business.suburb,city:business.city,state:business.state})}`,
   `${conversation.context_type} details: ${JSON.stringify(item)}`,
   faqContext?`Configured answers:\n${faqContext}`:'Configured answers: none.',
   `Customer question: ${message.body}`,
  ].join('\n\n');

  const response=await fetch('https://api.openai.com/v1/responses',{
   method:'POST',
   headers:{Authorization:`Bearer ${openaiKey}`,'Content-Type':'application/json'},
   body:JSON.stringify({
    model:Deno.env.get('OPENAI_DM_MODEL')??'gpt-5-mini',
    input:prompt,
    max_output_tokens:220,
   }),
  });
  const responseData=await response.json().catch(()=>({}));
  if(!response.ok){
   console.error('business_dm_ai_provider_failed',{status:response.status});
   return json({ok:true,skipped:'ai_provider_failed'});
  }

  const answer=extractResponseText(responseData).slice(0,2000).trim();
  if(!answer)return json({ok:true,skipped:'empty_ai_reply'});

  // Re-check for an automated reply before insertion to avoid races with FAQ automation.
  const {data:duplicateCheck}=await admin.from('messages')
   .select('id')
   .eq('conversation_id',conversation.id)
   .eq('is_automated',true)
   .gte('created_at',message.created_at)
   .limit(1);
  if(duplicateCheck?.length)return json({ok:true,skipped:'already_answered'});

  const {error:insertError}=await admin.from('messages').insert({
   conversation_id:conversation.id,
   sender_id:business.owner_id,
   body:answer,
   is_automated:true,
   automation_source:'EVEREST_AI',
  });
  if(insertError)throw insertError;

  return json({ok:true,replied:true});
 }catch(error){
  console.error('business_dm_auto_reply_failed',{message:error instanceof Error?error.message:'unknown'});
  return json({error:'Automated reply could not be created.'},500);
 }
});
