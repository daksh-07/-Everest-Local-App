import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AbrPayload = {
  abn: string;
  abnStatus: string;
  abnStatusEffectiveFrom: string | null;
  entityName: string;
  entityTypeCode: string;
  entityType: string;
  gstRegistered: boolean | null;
  gstRegisteredFrom: string | null;
  state: string;
  postcode: string;
  businessNames: string[];
  message?: string;
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

function normalizeAbn(value: string): string {
  return value.replace(/[\s-]/g, '');
}

function firstText(doc: Document, localNames: string[]): string {
  for (const localName of localNames) {
    const nodes = doc.getElementsByTagNameNS('*', localName);
    for (const node of Array.from(nodes)) {
      const value = node.textContent?.trim();
      if (value) return value;
    }
  }
  return '';
}

function allTexts(doc: Document, localName: string): string[] {
  const values: string[] = [];
  const nodes = doc.getElementsByTagNameNS('*', localName);
  for (const node of Array.from(nodes)) {
    const value = node.textContent?.trim();
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

function parseAbrXml(raw: string): AbrPayload {
  const doc = new DOMParser().parseFromString(raw, 'application/xml');
  if (!doc) throw new Error('ABR returned an unreadable XML response.');

  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) throw new Error('ABR returned malformed XML.');

  const exceptionCode = firstText(doc, ['exceptionCode']);
  const exceptionDescription = firstText(doc, ['exceptionDescription']);
  if (exceptionCode || exceptionDescription) {
    throw new Error(exceptionDescription || exceptionCode || 'ABR returned an application error.');
  }

  const abn = firstText(doc, ['identifierValue']);
  const abnStatus = firstText(doc, ['entityStatusCode']);
  const abnStatusEffectiveFrom = firstText(doc, ['effectiveFrom']) || null;
  const entityName = firstText(doc, ['organisationName']) || [
    firstText(doc, ['givenName']),
    firstText(doc, ['otherGivenName']),
    firstText(doc, ['familyName']),
  ].filter(Boolean).join(' ').trim();

  const entityTypeCode = firstText(doc, ['entityTypeCode']);
  const entityType = firstText(doc, ['entityDescription']);
  const gstRegisteredFrom = firstText(doc, ['goodsAndServicesTax'])
    ? firstText(doc, ['goodsAndServicesTax'])
    : null;
  const state = firstText(doc, ['stateCode']);
  const postcode = firstText(doc, ['postcode']);

  const businessNames = allTexts(doc, 'businessName')
    .filter(value => value !== 'businessName');

  if (!abn && !abnStatus && !exceptionCode) {
    throw new Error('ABR response did not contain a business record.');
  }

  return {
    abn,
    abnStatus,
    abnStatusEffectiveFrom,
    entityName,
    entityTypeCode,
    entityType,
    gstRegistered: gstRegisteredFrom !== null,
    gstRegisteredFrom,
    state,
    postcode,
    businessNames,
  };
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

    const abrUrl = new URL('https://abr.business.gov.au/ABRXMLSearch/AbrXmlSearch.asmx/SearchByABNv202001');
    abrUrl.searchParams.set('searchString', abn);
    abrUrl.searchParams.set('includeHistoricalDetails', 'N');
    abrUrl.searchParams.set('authenticationGuid', guid);

    const response = await fetch(abrUrl, {
      headers: { Accept: 'application/xml, text/xml' },
    });
    const raw = await response.text();

    if (!response.ok) {
      console.error('abr_http_error', { status: response.status });
      return json({ error: 'ABR could not complete the registry lookup.' }, 502);
    }

    let payload: AbrPayload;
    try {
      payload = parseAbrXml(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ABR returned an application error.';
      const noRecord = /no records found/i.test(message);
      await client.rpc('record_business_abr_check', {
        p_business_id: businessId,
        p_result: {
          status: noRecord ? 'NOT_FOUND' : 'ERROR',
          message: noRecord ? 'ABR did not find a record for this ABN.' : 'ABR returned an application error.',
        },
      });
      return json({
        status: noRecord ? 'NOT_FOUND' : 'ERROR',
        message: noRecord ? 'ABR did not find a record for this ABN.' : 'ABR returned an application error.',
      }, noRecord ? 200 : 502);
    }

    const nameMatch = sameName(business.name, payload.entityName, payload.businessNames);
    const active = payload.abnStatus.toLowerCase() === 'active';
    const abnMatches = normalizeAbn(payload.abn) === abn;
    const stateMatch = !business.state || !payload.state || business.state.toUpperCase() === payload.state.toUpperCase();
    const postcodeMatch = !business.postcode || !payload.postcode || business.postcode === payload.postcode;
    const locationMatch = stateMatch && postcodeMatch;

    const status = !active ? 'INACTIVE' : nameMatch && abnMatches && locationMatch ? 'MATCHED' : 'MISMATCH';

    const result = {
      status,
      abnStatus: payload.abnStatus,
      abnStatusEffectiveFrom: payload.abnStatusEffectiveFrom,
      entityName: payload.entityName,
      entityType: payload.entityType,
      entityTypeCode: payload.entityTypeCode,
      gstRegistered: payload.gstRegistered,
      gstRegisteredFrom: payload.gstRegisteredFrom,
      state: payload.state,
      postcode: payload.postcode,
      businessNames: payload.businessNames,
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
