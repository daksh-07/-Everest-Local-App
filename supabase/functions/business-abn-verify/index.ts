import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const normalizeAbn = (value: unknown) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '') : '';

const normalizeName = (value: string) =>
  value
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/\b(PTY|PROPRIETARY|LTD|LIMITED|INC|INCORPORATED|CO|COMPANY)\b/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

function parseJsonp(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const open = trimmed.indexOf('(');
    const close = trimmed.lastIndexOf(')');
    if (open < 0 || close <= open) throw new Error('INVALID_ABR_RESPONSE');
    return JSON.parse(trimmed.slice(open + 1, close)) as Record<string, unknown>;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstBusinessName(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      return [stringValue(record.Name), stringValue(record.OrganisationName)].filter(
        (name): name is string => !!name,
      );
    }
    return [];
  });
}

function findField(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const guid = Deno.env.get('ABR_LOOKUP_GUID');

  if (!url || !anon || !service) return json({ error: 'Verification service is not configured' }, 503);
  if (!guid) return json({ error: 'Government verification is not configured yet' }, 503);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Authentication required' }, 401);

  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Invalid session' }, 401);

  try {
    const body = await req.json() as { business_id?: unknown; abn?: unknown };
    const businessId = typeof body.business_id === 'string' ? body.business_id : '';
    const abn = normalizeAbn(body.abn);

    if (!businessId || !/^\d{11}$/.test(abn)) return json({ error: 'INVALID_ABN' }, 422);

    const { data: business, error: businessError } = await userClient
      .from('businesses')
      .select('id,name,verification_status')
      .eq('id', businessId)
      .single();

    if (businessError || !business) return json({ error: 'NOT_AUTHORIZED' }, 403);
    if (business.verification_status === 'VERIFIED') return json({ error: 'VERIFICATION_ALREADY_COMPLETED' }, 409);
    if (business.verification_status === 'PENDING') return json({ error: 'VERIFICATION_PENDING' }, 409);

    const endpoint = new URL('https://abr.business.gov.au/json/AbnDetails.aspx');
    endpoint.searchParams.set('abn', abn);
    endpoint.searchParams.set('callback', 'callback');
    endpoint.searchParams.set('guid', guid);

    const response = await fetch(endpoint, {
      headers: { Accept: 'application/javascript, application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error('abr_lookup_http_error', { status: response.status });
      return json({ error: 'GOVERNMENT_LOOKUP_UNAVAILABLE' }, 503);
    }

    const payload = parseJsonp(await response.text());
    const message = findField(payload, 'Message');
    if (message) {
      const lower = message.toLowerCase();
      if (lower.includes('no record') || lower.includes('not found')) return json({ error: 'ABN_NOT_FOUND' }, 422);
      console.error('abr_lookup_message', { message });
      return json({ error: 'GOVERNMENT_LOOKUP_UNAVAILABLE' }, 503);
    }

    const returnedAbn = findField(payload, 'Abn', 'ABN');
    const status = findField(payload, 'AbnStatus', 'ABNStatus');
    const entityName = findField(payload, 'EntityName', 'MainName');
    const entityType = findField(payload, 'EntityTypeName', 'EntityType');
    const gstFrom = findField(payload, 'Gst', 'GST');
    const registerUpdated = findField(payload, 'DateRegisterLastUpdated');

    const names = [
      entityName,
      ...firstBusinessName(payload.BusinessName),
      ...firstBusinessName(payload.BusinessNames),
    ].filter((name): name is string => !!name);

    const returnedNormalized = normalizeAbn(returnedAbn);
    const active = (status ?? '').toLowerCase() === 'active';
    const nameMatch = names.some((name) => normalizeName(name) === normalizeName(business.name));
    const abnMatch = returnedNormalized === abn;

    if (!abnMatch) return json({ error: 'ABN_NOT_FOUND' }, 422);
    if (!active) return json({ error: 'ABN_NOT_ACTIVE' }, 422);
    if (!nameMatch) {
      return json({
        error: 'BUSINESS_NAME_MISMATCH',
        government_name: entityName,
      }, 422);
    }

    const adminClient = createClient(url, service);
    const { data: verificationId, error: submitError } = await adminClient.rpc(
      'submit_business_verification_from_abr',
      {
        p_business_id: businessId,
        p_submitted_by: user.id,
        p_abn: abn,
        p_provider: 'ABR_ABN_LOOKUP',
        p_provider_reference: abn,
        p_provider_status: status,
        p_provider_entity_name: entityName,
        p_provider_entity_type: entityType,
        p_provider_gst_from: gstFrom || null,
        p_provider_retrieved_at: new Date().toISOString(),
        p_provider_register_updated_at: registerUpdated || null,
        p_provider_match: true,
        p_provider_message: 'ABN and registered business name matched ABR public data.',
      },
    );

    if (submitError) {
      console.error('abr_verification_submit_error', { code: submitError.code });
      if (submitError.message === 'VERIFICATION_PENDING') return json({ error: 'VERIFICATION_PENDING' }, 409);
      if (submitError.message === 'VERIFICATION_ALREADY_COMPLETED') return json({ error: 'VERIFICATION_ALREADY_COMPLETED' }, 409);
      if (submitError.message === 'NOT_AUTHORIZED') return json({ error: 'NOT_AUTHORIZED' }, 403);
      return json({ error: 'VERIFICATION_SUBMISSION_FAILED' }, 500);
    }

    return json({
      verification_id: verificationId,
      status: 'PENDING',
      provider: 'ABR_ABN_LOOKUP',
      government_status: status,
      government_name: entityName,
      entity_type: entityType,
    });
  } catch (error) {
    console.error('abr_verification_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return json({ error: 'Government verification failed. Please try again.' }, 500);
  }
});
