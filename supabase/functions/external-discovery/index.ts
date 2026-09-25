// Places data is returned directly to the client. Only place IDs may be saved by
// other services; this function does not cache or persist provider content.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers });
  if (request.method !== 'POST') return new Response('{}', { status: 405, headers });

  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key || !url || !anon || !service) {
    console.error('external-discovery configuration missing', { placesKey: Boolean(key), url: Boolean(url), anon: Boolean(anon), service: Boolean(service) });
    return new Response(JSON.stringify({ businesses: [], enabled: false, reason: 'configuration_missing' }), { headers });
  }

  try {
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user)
      return new Response(JSON.stringify({ businesses: [], enabled: false }), { status: 401, headers });

    // The database flag is the authoritative discovery kill switch. This keeps
    // activation/deactivation controllable without redeploying the function.
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: discoveryFlag, error: discoveryFlagError } = await admin
      .from('external_feature_flags')
      .select('enabled')
      .eq('name', 'discovery')
      .single();
    if (discoveryFlagError || discoveryFlag?.enabled !== true)
      return new Response(JSON.stringify({ businesses: [], enabled: false }), { headers });

    const body = await request.json();
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (query.length < 5 || query.length > 100 || /[\r\n]/.test(query))
      return new Response(JSON.stringify({ error: 'Enter a service and suburb (5–100 characters).' }), { status: 400, headers });

    const { data: allowed, error: quotaError } = await userClient.rpc('consume_external_discovery_quota');
    if (quotaError || !allowed)
      return new Response(JSON.stringify({ businesses: [], enabled: false, limited: true }), { headers });

    const upstream = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.businessStatus',
      },
      body: JSON.stringify({ textQuery: query, pageSize: 5, regionCode: 'AU', languageCode: 'en' }),
      signal: AbortSignal.timeout(4500),
    });
    if (!upstream.ok) {
      const upstreamText = await upstream.text().catch(()=> '');
      console.error('Google Places request rejected', { status: upstream.status, body: upstreamText.slice(0,500) });
      return new Response(JSON.stringify({ businesses: [], enabled: true, unavailable: true, reason: 'places_rejected' }), { headers });
    }

    const data = await upstream.json();
    const candidates = (Array.isArray(data.places) ? data.places : [])
      .filter((place: { id?: string; businessStatus?: string }) => place.id && place.businessStatus !== 'CLOSED_PERMANENTLY')
      .map((place: { id: string; displayName?: { text?: string }; formattedAddress?: string }) => ({
        source: 'google_places',
        externalId: place.id,
        name: place.displayName?.text ?? '',
        address: place.formattedAddress ?? '',
      }))
      .filter((place: { name: string }) => place.name);

    const businesses = await Promise.all(
      candidates.map(async (place: { externalId: string; name: string; address: string }) => {
        const { data: referenceId, error } = await admin.rpc('register_external_reference', {
          p_identifier: place.externalId,
        });
        if (error || !referenceId) return null;
        const { data: reference } = await admin
          .from('external_business_references')
          .select('status')
          .eq('id', referenceId)
          .single();
        if (reference?.status !== 'UNLINKED') return null;
        return { ...place, referenceId };
      }),
    );

    const { data: enquiryFlag } = await admin
      .from('external_feature_flags')
      .select('enabled')
      .eq('name', 'enquiries')
      .single();

    return new Response(JSON.stringify({
      businesses: businesses.filter(Boolean),
      enabled: true,
      enquiriesEnabled:
        Deno.env.get('EXTERNAL_ENQUIRIES_ENABLED') === 'true' &&
        enquiryFlag?.enabled === true,
      attribution: 'Google Maps',
    }), { headers });
  } catch (error) {
    console.error('external-discovery provider failure', error instanceof Error ? error.message : String(error));
    // Provider failure cannot take down native marketplace search.
    return new Response(JSON.stringify({ businesses: [], enabled: true, unavailable: true, reason: 'provider_failure' }), { headers });
  }
});
