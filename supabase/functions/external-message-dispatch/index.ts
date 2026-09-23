import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(JSON.stringify({ ok:false }), { status:405, headers:jsonHeaders });

  // Deliberately fail closed. Phase 3 supports architecture/integration testing only.
  // No email or SMS provider transport is present in this function.
  if (Deno.env.get('EXTERNAL_MESSAGING_ENABLED') !== 'true')
    return new Response(JSON.stringify({ ok:true, enabled:false }), { headers:jsonHeaders });
  if (Deno.env.get('EXTERNAL_MESSAGING_TRANSPORT') !== 'sandbox')
    return new Response(JSON.stringify({ ok:false, blocked:'production_transport_not_implemented' }), { status:503, headers:jsonHeaders });

  const url = Deno.env.get('SUPABASE_URL');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !service) return new Response(JSON.stringify({ ok:false }), { status:503, headers:jsonHeaders });

  const supplied = request.headers.get('authorization') ?? '';
  const expected = Deno.env.get('EXTERNAL_MESSAGE_WORKER_SECRET');
  if (!expected || supplied !== `Bearer ${expected}`)
    return new Response(JSON.stringify({ ok:false }), { status:401, headers:jsonHeaders });

  const admin = createClient(url, service, { auth:{ persistSession:false } });
  const { data, error } = await admin.rpc('claim_external_message_delivery');
  if (error) return new Response(JSON.stringify({ ok:false, error:'queue_unavailable' }), { status:503, headers:jsonHeaders });
  const item = Array.isArray(data) ? data[0] : null;
  if (!item) return new Response(JSON.stringify({ ok:true, processed:false }), { headers:jsonHeaders });

  // Never return destination, customer contact details, request text, or bearer tokens.
  // The SQL claim marks this SANDBOXED and records why production delivery is blocked.
  return new Response(JSON.stringify({ ok:true, processed:true, deliveryId:item.delivery_id, mode:'sandbox', sent:false }), { headers:jsonHeaders });
});
