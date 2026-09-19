import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ActionKind = 'VIEW_BUSINESS' | 'VIEW_PRODUCT' | 'CREATE_REQUEST' | 'VIEW_ORDER' | 'VIEW_BOOKING' | 'OPEN_MESSAGE' | 'VIEW_QUOTE' | 'OPEN_OPPORTUNITIES' | 'OPEN_SEARCH';
type Action = { kind: ActionKind; id?: string; title: string; href: string };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const text = (value: unknown, max = 5000) => typeof value === 'string' ? value.slice(0, max) : '';

function action(kind: ActionKind, id: string | undefined, title: string, query = ''): Action {
  const q = encodeURIComponent(query || title);
  const href =
    kind === 'VIEW_BUSINESS' && id ? `/business-profile?id=${encodeURIComponent(id)}` :
    kind === 'CREATE_REQUEST' ? '/request' :
    kind === 'VIEW_ORDER' ? '/orders' :
    kind === 'VIEW_BOOKING' ? '/bookings' :
    kind === 'OPEN_MESSAGE' ? (id ? `/messages?conversationId=${encodeURIComponent(id)}` : '/messages') :
    kind === 'VIEW_QUOTE' ? '/quotes' :
    kind === 'OPEN_OPPORTUNITIES' ? '/opportunities' :
    kind === 'VIEW_PRODUCT' && id ? `/product?id=${encodeURIComponent(id)}` :
    `/search?q=${q}`;
  return { kind, id, title, href };
}

function matches(textValue: string, query: string) {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2 && !['the','and','for','near','with','this','that','from','show','find','need','want','help','local','businesses','products','services'].includes(word));
  if (!words.length) return true;
  const haystack = textValue.toLowerCase();
  return words.filter(word => haystack.includes(word)).length >= Math.min(2, words.length);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const aiUrl = Deno.env.get('AI_API_URL');
  const aiKey = Deno.env.get('AI_API_KEY');
  const model = Deno.env.get('AI_MODEL');

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Authentication required' }, 401);
  if (!url || !anon) return json({ error: 'Marketplace backend is not configured.' }, 503);

  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return json({ error: 'Your session has expired. Please sign in again.' }, 401);

  try {
    const body = await req.json();
    const message = text(body?.message, 2000).trim();
    if (!message) return json({ error: 'Tell Everest what you need.' }, 400);

    const { data: membershipRows, error: membershipError } = await client.from('business_members').select('business_id').eq('user_id',authData.user.id);
    if (membershipError) throw membershipError;
    const businessIds = (membershipRows ?? []).map(item => item.business_id);

    const [profileResult, businessResult, serviceResult, productResult, requestResult, quoteResult, bookingResult, orderResult, conversationResult] = await Promise.all([
      client.from('profiles').select('role,suburb,city,state').eq('id', authData.user.id).maybeSingle(),
      client.from('businesses').select('id,name,description,suburb,city,state,verification_status').eq('status','ACTIVE').eq('verification_status','VERIFIED').limit(100),
      client.from('services').select('id,business_id,name,description,base_price,duration_minutes,businesses(name,suburb,city,state)').eq('active',true).limit(100),
      client.from('products').select('id,business_id,name,description,price,sale_price,delivery_eligible,pickup_available,status,businesses(name,suburb,city,state)').in('status',['ACTIVE','OUT_OF_STOCK']).limit(100),
      client.from('service_requests').select('id,description,suburb,city,state,preferred_date,preferred_time,budget,status,created_at').eq('customer_id',authData.user.id).order('created_at',{ascending:false}).limit(20),
      client.from('quotes').select('id,request_id,business_id,price,total,status,proposed_date,proposed_time,created_at').eq('customer_id',authData.user.id).order('created_at',{ascending:false}).limit(20),
      client.from('bookings').select('id,business_id,request_id,status,scheduled_date,scheduled_time,price,created_at').eq('customer_id',authData.user.id).order('created_at',{ascending:false}).limit(20),
      client.from('orders').select('id,order_number,business_id,status,payment_status,total,delivery_method,created_at').eq('customer_id',authData.user.id).order('created_at',{ascending:false}).limit(20),
      client.from('conversations').select('id,business_id,request_id,booking_id,quote_id,created_at').eq('customer_id',authData.user.id).order('created_at',{ascending:false}).limit(20),
    ]);

    let businessOpportunities: unknown[] = [];
    let businessQuotes: unknown[] = [];
    let businessBookings: unknown[] = [];
    let businessOrders: unknown[] = [];
    let businessConversations: unknown[] = [];
    if (businessIds.length) {
      const [opportunitiesResult,businessQuotesResult,businessBookingsResult,businessOrdersResult,businessConversationsResult] = await Promise.all([
        client.from('opportunities').select('id,business_id,status,created_at,service_requests(description,suburb,city,state,preferred_date,preferred_time,budget)').in('business_id',businessIds).order('created_at',{ascending:false}).limit(50),
        client.from('quotes').select('id,request_id,business_id,price,total,status,proposed_date,proposed_time,created_at').in('business_id',businessIds).order('created_at',{ascending:false}).limit(30),
        client.from('bookings').select('id,business_id,request_id,status,scheduled_date,scheduled_time,price,created_at').in('business_id',businessIds).order('created_at',{ascending:false}).limit(30),
        client.from('orders').select('id,order_number,business_id,status,payment_status,total,delivery_method,created_at').in('business_id',businessIds).order('created_at',{ascending:false}).limit(30),
        client.from('conversations').select('id,business_id,request_id,booking_id,quote_id,created_at').in('business_id',businessIds).order('created_at',{ascending:false}).limit(30),
      ]);
      for (const result of [opportunitiesResult,businessQuotesResult,businessBookingsResult,businessOrdersResult,businessConversationsResult]) if (result.error) throw result.error;
      businessOpportunities=opportunitiesResult.data ?? [];
      businessQuotes=businessQuotesResult.data ?? [];
      businessBookings=businessBookingsResult.data ?? [];
      businessOrders=businessOrdersResult.data ?? [];
      businessConversations=businessConversationsResult.data ?? [];
    }

    const publicErrors = [businessResult.error, serviceResult.error, productResult.error].filter(Boolean);
    if (profileResult.error) throw profileResult.error;
    if (publicErrors.length) throw publicErrors[0];

    const businesses = businessResult.data ?? [];
    const services = serviceResult.data ?? [];
    const products = productResult.data ?? [];
    const requests = requestResult.data ?? [];
    const quotes = quoteResult.data ?? [];
    const bookings = bookingResult.data ?? [];
    const orders = orderResult.data ?? [];
    const conversations = conversationResult.data ?? [];

    const compactServices = services.map(item => ({ id:item.id, business_id:item.business_id, name:item.name, description:item.description, base_price:item.base_price, duration_minutes:item.duration_minutes, business:Array.isArray(item.businesses) ? item.businesses[0] : item.businesses }));
    const compactProducts = products.map(item => ({ id:item.id, business_id:item.business_id, name:item.name, description:item.description, price:item.price, sale_price:item.sale_price, delivery_eligible:item.delivery_eligible, pickup_available:item.pickup_available, status:item.status, business:Array.isArray(item.businesses) ? item.businesses[0] : item.businesses }));

    const validBusinessIds = new Set(businesses.map(item => item.id));
    const validProductIds = new Set(products.map(item => item.id));
    const validOrderIds = new Set(orders.map(item => item.id));
    const validBookingIds = new Set(bookings.map(item => item.id));
    const validQuoteIds = new Set(quotes.map(item => item.id));
    const validConversationIds = new Set(conversations.map(item => item.id));

    const fallbackActions: Action[] = [];
    const businessMatches = businesses.filter(item => matches(`${item.name} ${item.description ?? ''} ${item.suburb ?? ''} ${item.city ?? ''}`, message)).slice(0,5);
    const serviceMatches = compactServices.filter(item => matches(`${item.name} ${item.description ?? ''} ${item.business?.name ?? ''}`, message)).slice(0,5);
    const productMatches = compactProducts.filter(item => matches(`${item.name} ${item.description ?? ''} ${item.business?.name ?? ''}`, message)).slice(0,5);

    for (const item of businessMatches) fallbackActions.push(action('VIEW_BUSINESS', item.id, item.name));
    for (const item of productMatches.slice(0,3)) fallbackActions.push(action('VIEW_PRODUCT', item.id, item.name));
    if (/request|hire|book|quote|plumber|cleaner|detail|mechanic|landscap|tradie|service/i.test(message)) fallbackActions.push(action('CREATE_REQUEST', undefined, 'Post a service request'));
    if (/job|opportunit|work request/i.test(message) && businessOpportunities.length) fallbackActions.push(action('OPEN_OPPORTUNITIES', undefined, 'View business opportunities'));
    if (/order|delivery|purchase|bought/i.test(message) && (orders[0] || businessOrders[0])) { const order = (orders[0] ?? businessOrders[0]) as {id:string;order_number:string}; fallbackActions.push(action('VIEW_ORDER', order.id, `Order ${order.order_number}`)); }
    if (/booking|appointment|scheduled/i.test(message) && (bookings[0] || businessBookings[0])) fallbackActions.push(action('VIEW_BOOKING', (bookings[0] ?? businessBookings[0] as {id:string}).id, 'View booking'));
    if (/quote|price from business/i.test(message) && (quotes[0] || businessQuotes[0])) fallbackActions.push(action('VIEW_QUOTE', (quotes[0] ?? businessQuotes[0] as {id:string}).id, 'View my quotes'));
    if (/message|chat|conversation/i.test(message)) fallbackActions.push(action('OPEN_MESSAGE', conversations[0]?.id, 'Open messages'));
    if (!fallbackActions.length) fallbackActions.push(action('OPEN_SEARCH', undefined, 'Explore the marketplace', message));

    const fallbackLines = [
      businessMatches.length ? `I found ${businessMatches.length} verified business match${businessMatches.length === 1 ? '' : 'es'}.` : '',
      serviceMatches.length ? `I found ${serviceMatches.length} active service match${serviceMatches.length === 1 ? '' : 'es'}.` : '',
      productMatches.length ? `I found ${productMatches.length} product match${productMatches.length === 1 ? '' : 'es'}.` : '',
      !businessMatches.length && !serviceMatches.length && !productMatches.length ? 'I could not find a matching public marketplace record yet.' : '',
    ].filter(Boolean);

    if (!aiUrl || !aiKey || !model) {
      return json({
        message: `${fallbackLines.join(' ')} Use the buttons below to continue with real marketplace records. Ask Everest's AI provider still needs to be connected for natural-language reasoning.`,
        actions: fallbackActions.slice(0,6),
        ai_available: false,
      });
    }

    const system = `You are Ask Everest, the intelligent layer for a real local marketplace.
Use ONLY the supplied records.
Never invent businesses, services, products, prices, reviews, availability, delivery times, orders, bookings, messages or customer data.
Private records belong only to the authenticated user. Never infer or expose another person's data.
If a fact is absent, say it is unavailable rather than guessing.
Return ONLY valid JSON: {"message":"string","actions":[{"kind":"VIEW_BUSINESS|VIEW_PRODUCT|CREATE_REQUEST|VIEW_ORDER|VIEW_BOOKING|OPEN_MESSAGE|VIEW_QUOTE|OPEN_SEARCH","id":"exact supplied id when required","title":"short button title","query":"optional search query"}]}
Action ids MUST come from the supplied records. CREATE_REQUEST and OPEN_SEARCH do not require ids.
Keep the answer concise.`;

    const context = JSON.stringify({
      authenticated_user: { role: profileResult.data?.role ?? null, location: { suburb: profileResult.data?.suburb ?? null, city: profileResult.data?.city ?? null, state: profileResult.data?.state ?? null } },
      public_marketplace: { businesses, services: compactServices, products: compactProducts },
      authenticated_user_records: { requests, quotes, bookings, orders, conversations },
      authenticated_business_records: { opportunities: businessOpportunities, quotes: businessQuotes, bookings: businessBookings, orders: businessOrders, conversations: businessConversations },
    });

    const response = await fetch(aiUrl, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${aiKey}`},
      body:JSON.stringify({model,messages:[{role:'system',content:system},{role:'user',content:`User request: ${message}\n\nMarketplace context:\n${context}`}],temperature:0.1}),
    });

    if (!response.ok) {
      console.error('assistant_provider_error',{status:response.status});
      return json({ message:'Ask Everest could not reach its AI service right now. I found the real marketplace data available to you, so you can continue below.', actions:fallbackActions.slice(0,6), ai_available:false }, 200);
    }

    const result = await response.json();
    const raw = result?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string') {
      return json({ message:fallbackLines.join(' '), actions:fallbackActions.slice(0,6), ai_available:false }, 200);
    }

    let parsed: { message?: unknown; actions?: unknown } | null = null;
    try {
      parsed = JSON.parse(raw.replace(/^\`\`\`json\s*/,'').replace(/\s*\`\`\`$/,''));
    } catch {
      parsed = { message: raw };
    }

    const safeActions = Array.isArray(parsed?.actions) ? parsed.actions.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const value = item as Record<string,unknown>;
      const kind = typeof value.kind === 'string' ? value.kind as ActionKind : null;
      const title = text(value.title,80).trim();
      const id = typeof value.id === 'string' ? value.id : undefined;
      const query = typeof value.query === 'string' ? value.query : '';
      if (!kind || !title) return [];
      if (kind === 'VIEW_BUSINESS' && (!id || !validBusinessIds.has(id))) return [];
      if (kind === 'VIEW_PRODUCT' && (!id || !validProductIds.has(id))) return [];
      if (kind === 'VIEW_ORDER' && (!id || !validOrderIds.has(id))) return [];
      if (kind === 'VIEW_BOOKING' && (!id || !validBookingIds.has(id))) return [];
      if (kind === 'VIEW_QUOTE' && (!id || !validQuoteIds.has(id))) return [];
      if (kind === 'OPEN_MESSAGE' && id && !validConversationIds.has(id)) return [];
      if (!['VIEW_BUSINESS','VIEW_PRODUCT','CREATE_REQUEST','VIEW_ORDER','VIEW_BOOKING','OPEN_MESSAGE','VIEW_QUOTE','OPEN_OPPORTUNITIES','OPEN_SEARCH'].includes(kind)) return [];
      return [action(kind,id,title,query)];
    }).slice(0,6) : [];

    return json({
      message: text(parsed?.message,5000) || fallbackLines.join(' '),
      actions: safeActions.length ? safeActions : fallbackActions.slice(0,6),
      ai_available: true,
    });
  } catch (error) {
    console.error('assistant_failed',{message:error instanceof Error ? error.message : 'unknown'});
    return json({ error:'Ask Everest is temporarily unavailable. Please try again.' },503);
  }
});
