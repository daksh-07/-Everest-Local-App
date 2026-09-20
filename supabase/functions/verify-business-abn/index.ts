import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AbrPayload = {
  Abn?: string;
  AbnStatus?: string;
  AbnStatusEffectiveFrom?: string | null;
  EntityName?: string;
  EntityTypeCode?: string;
  EntityTypeName?: string;
  Gst?: string | null;
  AddressState?: string;
  AddressPostcode?: string;
  BusinessName?: string[];
  Message?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

function normalizeName(value: string): string {
  return value
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/\b(PROPRIETARY|PTY|LIMITED|LTD|INCORPORATED|INC)\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function sameName(localName: string, entityName: string, businessNames: string[]): boolean {
  const local = normalizeName(localName);
  if (!local) return false;
  const candidates = [entityName, ...businessNames].filter(Boolean).map(normalizeName);
  return candidates.some(candidate => candidate === local);
}

function parseJsonp(raw: string): AbrPayload {
  const match = raw.match(/^[A-Za-z_$][A-Za-z0-9_$]*\((.*)\)\s*$/s);
  if (!match) throw new Error('Invalid ABR response format');
  const parsed = JSON.parse(match[1]) as AbrPayload;
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid ABR response payload');
  return parsed;
}

function normalizeAbn(value: string): string {
  return value.replace(/[\s-]/g, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const guid = Deno.env.get('ABR_AUTH_GUID');
  if (!url || !anon) return json({ error: 'Marketplace backend is not configured.' }, 503);
  if (!guid) return json({ error: 'ABR verification is not configured. Add ABR_AUTH_GUID to the Supabase Edge Function secrets.' }, 503);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Authentication required' }, 401);

  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData.user) return json({ error: 'Invalid session' }, 401);

  try {
    const body = await req.json();
    const businessId = typeof body?.businessId === 'string' ? body.businessId : '';
    if (!businessId) return json({ error: 'businessId is required' }, 400);

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== 'ADMIN') return json({ error: 'Admin authorization required' }, 403);

    const { data: business, error: businessError } = await client
      .from('businesses')
      .select('id,name,abn,state,postcode')
      .eq('id', businessId)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business) return json({ error: 'Business not found' }, 404);

    const abn = normalizeAbn(typeof business.abn === 'string' ? business.abn : '');
    if (!/^\d{11}$/.test(abn)) return json({ error: 'Business does not have a valid ABN to check' }, 422);

    const abrUrl = new URL('https://abr.business.gov.au/json/AbnDetails.aspx');
    abrUrl.searchParams.set('abn', abn);
    abrUrl.searchParams.set('callback', 'everestAbrCallback');
    abrUrl.searchParams.set('guid', guid);

    const response = await fetch(abrUrl, { headers: { Accept: 'application/javascript, application/json' } });
    const raw = await response.text();
    if (!response.ok) throw new Error('ABR request failed');

    let payload: AbrPayload;
    try {
      payload = parseJsonp(raw);
    } catch {
      await client.rpc('record_business_abr_check', {
        p_business_id: businessId,
        p_result: {
          status: 'ERROR',
          message: 'ABR returned an unreadable response.',
        },
      });
      return json({ error: 'ABR returned an unreadable response.' }, 502);
    }

    if (payload.Message) {
      await client.rpc('record_business_abr_check', {
        p_business_id: businessId,
        p_result: {
          status: 'NOT_FOUND',
          message: payload.Message,
          abnStatus: payload.AbnStatus || '',
        },
      });
      return json({ status: 'NOT_FOUND', message: payload.Message }, 200);
    }

    const businessNames = Array.isArray(payload.BusinessName)
      ? payload.BusinessName.filter((value): value is string => typeof value === 'string').slice(0, 50)
      : [];
    const nameMatch = sameName(business.name, payload.EntityName || '', businessNames);
    const active = payload.AbnStatus === 'Active';
    const abnMatches = normalizeAbn(payload.Abn || '') === abn;
    const stateMatch = !business.state || !payload.AddressState || business.state.toUpperCase() === payload.AddressState.toUpperCase();
    const postcodeMatch = !business.postcode || !payload.AddressPostcode || business.postcode === payload.AddressPostcode;
    const locationMatch = stateMatch && postcodeMatch;

    const status = !active ? 'INACTIVE' : nameMatch && abnMatches && locationMatch ? 'MATCHED' : 'MISMATCH';

    const result = {
      status,
      abnStatus: payload.AbnStatus || '',
      abnStatusEffectiveFrom: payload.AbnStatusEffectiveFrom || null,
      entityName: payload.EntityName || '',
      entityType: payload.EntityTypeName || '',
      entityTypeCode: payload.EntityTypeCode || '',
      gstRegistered: typeof payload.Gst === 'string' && payload.Gst.length > 0,
      gstRegisteredFrom: typeof payload.Gst === 'string' ? payload.Gst : null,
      state: payload.AddressState || '',
      postcode: payload.AddressPostcode || '',
      businessNames,
      nameMatch,
      message: status === 'MATCHED'
        ? 'ABR record is active and the submitted business name and location match the registry data. Final marketplace approval remains an Everest admin decision.'
        : status === 'INACTIVE'
          ? 'ABR returned a non-active ABN status. Do not approve this business until the registration issue is resolved.'
          : 'ABR found the ABN, but the submitted business details do not fully match the registry record. Manual review is required.',
    };

    const { error: recordError } = await client.rpc('record_business_abr_check', {
      p_business_id: businessId,
      p_result: result,
    });
    if (recordError) throw recordError;

    return json(result);
  } catch (error) {
    console.error('verify_business_abn_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return json({ error: 'Government ABN verification could not be completed. Please try again.' }, 500);
  }
});
