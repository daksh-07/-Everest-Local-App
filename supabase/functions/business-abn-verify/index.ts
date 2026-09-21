import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type AbrResult = {
  abn: string;
  abnStatus: string;
  abnStatusEffectiveFrom: string | null;
  abnCurrent: boolean | null;
  entityName: string | null;
  entityType: string | null;
  entityTypeCode: string | null;
  gstRegisteredFrom: string | null;
  registerUpdatedAt: string | null;
  retrievedAt: string | null;
  state: string | null;
  postcode: string | null;
  businessNames: string[];
};

type VerificationResult = {
  status: 'VERIFIED' | 'REJECTED' | 'RETRY';
  decision: 'AUTO_VERIFIED' | 'AUTO_REJECTED' | 'RETRY';
  reason?: string;
  abnStatus?: string | null;
  entityName?: string | null;
  entityType?: string | null;
  gstRegisteredFrom?: string | null;
  registerUpdatedAt?: string | null;
  abnCurrent?: boolean | null;
  state?: string | null;
  postcode?: string | null;
  businessNames?: string[];
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

function normalizeAbn(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\s-]/g, '') : '';
}

function normalizeName(value: string): string {
  return value
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/\b(PROPRIETARY\s+LIMITED|PTY\s+LTD|PROPRIETARY|LIMITED|LTD|INCORPORATED|INC)\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameMatches(localName: string, authoritativeNames: string[]): string | null {
  const local = normalizeName(localName);
  if (!local) return null;
  for (const candidate of authoritativeNames) {
    if (normalizeName(candidate) === local) return candidate;
  }
  return null;
}

function firstText(doc: Document, localNames: string[]): string | null {
  for (const localName of localNames) {
    const nodes = doc.getElementsByTagNameNS('*', localName);
    for (const node of Array.from(nodes)) {
      const value = node.textContent?.trim();
      if (value) return value;
    }
  }
  return null;
}

function childText(parent: Element, localName: string): string | null {
  const nodes = parent.getElementsByTagNameNS('*', localName);
  return nodes[0]?.textContent?.trim() || null;
}

function nestedText(doc: Document, parentNames: string[], childNames: string[]): string | null {
  for (const parentName of parentNames) {
    const parents = doc.getElementsByTagNameNS('*', parentName);
    for (const parent of Array.from(parents)) {
      const value = childText(parent, childNames[0]);
      if (value) return value;
      for (const childName of childNames.slice(1)) {
        const fallback = childText(parent, childName);
        if (fallback) return fallback;
      }
    }
  }
  return null;
}

function namesUnder(doc: Document, parentName: string): string[] {
  const values: string[] = [];
  const parents = doc.getElementsByTagNameNS('*', parentName);
  for (const parent of Array.from(parents)) {
    const value = childText(parent, 'organisationName');
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

function legalName(doc: Document): string | null {
  const parents = doc.getElementsByTagNameNS('*', 'legalName');
  for (const parent of Array.from(parents)) {
    const value = [
      childText(parent, 'givenName'),
      childText(parent, 'otherGivenName'),
      childText(parent, 'familyName'),
    ].filter(Boolean).join(' ').trim();
    if (value) return value;
  }
  return null;
}

function parseAbrXml(raw: string): AbrResult {
  const doc = new DOMParser().parseFromString(raw, 'application/xml');
  if (!doc) throw new Error('ABR_RESPONSE_INVALID');

  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) throw new Error('ABR_RESPONSE_INVALID');

  const exceptionCode = firstText(doc, ['exceptionCode']);
  const exceptionDescription = firstText(doc, ['exceptionDescription']);
  if (exceptionCode || exceptionDescription) {
    const description = exceptionDescription || exceptionCode || 'ABR returned an application exception.';
    const lower = description.toLowerCase();
    if (exceptionCode === 'SEARCH' || lower.includes('no records found')) {
      throw new Error('ABN_NOT_FOUND');
    }
    throw new Error('ABR_SERVICE_ERROR');
  }

  const abn = nestedText(doc, ['ABN'], ['identifierValue']) || firstText(doc, ['identifierValue']) || '';
  const abnStatus = nestedText(doc, ['entityStatus'], ['entityStatusCode']) || '';
  const abnStatusEffectiveFrom = nestedText(doc, ['entityStatus'], ['effectiveFrom']);
  const abnCurrentRaw = nestedText(doc, ['ABN'], ['isCurrentIndicator']);
  const entityType = nestedText(doc, ['entityType'], ['entityDescription']);
  const entityTypeCode = nestedText(doc, ['entityType'], ['entityTypeCode']);
  const gstRegisteredFrom = nestedText(doc, ['goodsAndServicesTax'], ['effectiveFrom']);
  const registerUpdatedAt = firstText(doc, ['dateRegisterLastUpdated']);
  const retrievedAt = firstText(doc, ['dateTimeRetrieved']);
  const state = nestedText(doc, ['mainBusinessPhysicalAddress'], ['stateCode']);
  const postcode = nestedText(doc, ['mainBusinessPhysicalAddress'], ['postcode']);

  const mainName = namesUnder(doc, 'mainName');
  const businessNames = namesUnder(doc, 'businessName');
  const individualLegalName = legalName(doc);
  const authoritativeNames = [...mainName, ...businessNames];
  if (individualLegalName) authoritativeNames.push(individualLegalName);

  const entityName = mainName[0] || individualLegalName || businessNames[0] || null;

  if (!abn || !abnStatus) throw new Error('ABR_RESPONSE_INVALID');

  return {
    abn,
    abnStatus,
    abnStatusEffectiveFrom,
    abnCurrent: abnCurrentRaw ? abnCurrentRaw.toUpperCase() === 'Y' : null,
    entityName,
    entityType,
    entityTypeCode,
    gstRegisteredFrom,
    registerUpdatedAt,
    retrievedAt,
    state,
    postcode,
    businessNames,
  };
}

function safeRpcError(error: unknown): string {
  const candidate = error as { message?: unknown } | null;
  return typeof candidate?.message === 'string' ? candidate.message : '';
}

function secretKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.default === 'string') return parsed.default;
    } catch {
      // Fall back to the legacy injected secret below.
    }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = secretKey();
  const guid = Deno.env.get('ABR_LOOKUP_GUID');

  if (!url || !anon || !service) return json({ error: 'Verification service is temporarily unavailable.' }, 503);
  if (!guid) return json({ error: 'Verification service is temporarily unavailable.' }, 503);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Authentication required.' }, 401);

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) return json({ error: 'Invalid session.' }, 401);

  const adminClient = createClient(url, service);

  try {
    const body = await req.json() as { business_id?: unknown; abn?: unknown };
    const businessId = typeof body.business_id === 'string' ? body.business_id : '';
    const abn = normalizeAbn(body.abn);

    if (!businessId) return json({ error: 'We could not identify your business.' }, 400);
    if (!/^\d{11}$/.test(abn)) {
      return json({
        status: 'INVALID_ABN',
        error: "That ABN doesn't appear to be valid. Please check the number and try again.",
      }, 200);
    }

    const { data: start, error: startError } = await adminClient.rpc(
      'begin_automated_abn_verification',
      {
        p_business_id: businessId,
        p_submitted_by: authData.user.id,
        p_abn: abn,
      },
    );

    if (startError) {
      const message = safeRpcError(startError);
      if (message === 'VERIFICATION_ALREADY_COMPLETED') return json({ error: 'VERIFICATION_ALREADY_COMPLETED' }, 409);
      if (message === 'VERIFICATION_PENDING') return json({ error: 'VERIFICATION_PENDING' }, 409);
      if (message === 'RATE_LIMITED') return json({ error: 'RATE_LIMITED' }, 429);
      if (message === 'NOT_AUTHORIZED') return json({ error: 'NOT_AUTHORIZED' }, 403);
      if (message === 'INVALID_ABN') return json({ error: 'INVALID_ABN' }, 422);
      console.error('abn_verification_begin_failed', { code: startError.code });
      return json({ error: 'We could not start ABN verification. Please try again.' }, 500);
    }

    const verificationId = typeof start?.verification_id === 'string' ? start.verification_id : '';
    const attemptId = typeof start?.attempt_id === 'string' ? start.attempt_id : '';
    if (!verificationId || !attemptId) {
      console.error('abn_verification_begin_invalid_response');
      return json({ error: 'We could not start ABN verification. Please try again.' }, 500);
    }

    const endpoint = new URL(
      'https://abr.business.gov.au/ABRXMLSearch/AbrXmlSearch.asmx/SearchByABNv202001',
    );
    endpoint.searchParams.set('searchString', abn);
    endpoint.searchParams.set('includeHistoricalDetails', 'N');
    endpoint.searchParams.set('authenticationGuid', guid);

    let parsed: AbrResult;
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: 'application/xml, text/xml' },
        signal: AbortSignal.timeout(10000),
      });
      const raw = await response.text();

      if (!response.ok) {
        console.error('abr_lookup_http_error', { status: response.status });
        const result: VerificationResult = {
          status: 'RETRY',
          decision: 'RETRY',
          reason: 'The ABN registry service is temporarily unavailable.',
        };
        const { error: finishError } = await adminClient.rpc('finish_automated_abn_verification', {
          p_verification_id: verificationId,
          p_attempt_id: attemptId,
          p_result: result,
        });
        if (finishError) console.error('abn_verification_finish_failed', { code: finishError.code });
        return json({
          status: 'PENDING_RETRY',
          message: "We couldn't verify your ABN right now. This appears to be a temporary verification-service problem. Please try again shortly.",
        }, 503);
      }

      parsed = parseAbrXml(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ABR_SERVICE_ERROR';

      if (message === 'ABN_NOT_FOUND') {
        const result: VerificationResult = {
          status: 'REJECTED',
          decision: 'AUTO_REJECTED',
          reason: 'The ABN you entered could not be found in the Australian Business Register.',
        };
        await adminClient.rpc('finish_automated_abn_verification', {
          p_verification_id: verificationId,
          p_attempt_id: attemptId,
          p_result: result,
        });
        return json({
          status: 'REJECTED',
          reason: 'ABN_NOT_FOUND',
          message: 'The ABN you entered could not be found in the Australian Business Register. Please check the number and try again.',
        }, 200);
      }

      const result: VerificationResult = {
        status: 'RETRY',
        decision: 'RETRY',
        reason: 'The Australian Business Register could not complete the lookup right now.',
      };
      const { error: finishError } = await adminClient.rpc('finish_automated_abn_verification', {
        p_verification_id: verificationId,
        p_attempt_id: attemptId,
        p_result: result,
      });
      if (finishError) console.error('abn_verification_finish_failed', { code: finishError.code });
      console.error('abr_lookup_failed', { reason: message });
      return json({
        status: 'PENDING_RETRY',
        message: "We couldn't verify your ABN right now. This appears to be a temporary verification-service problem. Please try again shortly.",
      }, 503);
    }

    const requestedAbn = normalizeAbn(abn);
    const returnedAbn = normalizeAbn(parsed.abn);
    const active = parsed.abnStatus.toLowerCase() === 'active';
    const current = parsed.abnCurrent !== false;
    const abnMatches = returnedAbn === requestedAbn;

    if (!abnMatches) {
      const result: VerificationResult = {
        status: 'REJECTED',
        decision: 'AUTO_REJECTED',
        reason: 'The ABN returned by the Australian Business Register did not match the ABN submitted.',
        abnStatus: parsed.abnStatus,
        entityName: parsed.entityName,
        entityType: parsed.entityType,
        gstRegisteredFrom: parsed.gstRegisteredFrom,
        registerUpdatedAt: parsed.registerUpdatedAt,
        abnCurrent: parsed.abnCurrent,
        state: parsed.state,
        postcode: parsed.postcode,
        businessNames: parsed.businessNames,
      };
      await adminClient.rpc('finish_automated_abn_verification', {
        p_verification_id: verificationId,
        p_attempt_id: attemptId,
        p_result: result,
      });
      return json({
        status: 'REJECTED',
        reason: 'ABN_MISMATCH',
        message: 'The ABN returned by the Australian Business Register did not match the number you entered.',
      }, 200);
    }

    if (!active || !current) {
      const result: VerificationResult = {
        status: 'REJECTED',
        decision: 'AUTO_REJECTED',
        reason: 'This ABN is not currently active in the Australian Business Register.',
        abnStatus: parsed.abnStatus,
        entityName: parsed.entityName,
        entityType: parsed.entityType,
        gstRegisteredFrom: parsed.gstRegisteredFrom,
        registerUpdatedAt: parsed.registerUpdatedAt,
        abnCurrent: parsed.abnCurrent,
        state: parsed.state,
        postcode: parsed.postcode,
        businessNames: parsed.businessNames,
      };
      await adminClient.rpc('finish_automated_abn_verification', {
        p_verification_id: verificationId,
        p_attempt_id: attemptId,
        p_result: result,
      });
      return json({
        status: 'REJECTED',
        reason: 'ABN_NOT_ACTIVE',
        message: "This ABN is not currently active. Please check your ABN details or update your Australian Business Register information before applying again.",
        authoritative_name: parsed.entityName,
        abn_status: parsed.abnStatus,
      }, 200);
    }

    const authoritativeNames = [
      parsed.entityName,
      ...parsed.businessNames,
    ].filter((name): name is string => !!name);

    const { data: business, error: businessError } = await adminClient
      .from('businesses')
      .select('id,name')
      .eq('id', businessId)
      .maybeSingle();
    if (businessError || !business) {
      console.error('abn_business_read_failed', { code: businessError?.code });
      return json({ error: 'We could not complete verification. Please try again.' }, 500);
    }

    const matchedName = nameMatches(business.name, authoritativeNames);
    if (!matchedName) {
      const result: VerificationResult = {
        status: 'REJECTED',
        decision: 'AUTO_REJECTED',
        reason: 'We found an active ABN, but the registered business information could not be matched confidently with the business details entered in Everest Local.',
        abnStatus: parsed.abnStatus,
        entityName: parsed.entityName,
        entityType: parsed.entityType,
        gstRegisteredFrom: parsed.gstRegisteredFrom,
        registerUpdatedAt: parsed.registerUpdatedAt,
        abnCurrent: parsed.abnCurrent,
        state: parsed.state,
        postcode: parsed.postcode,
        businessNames: parsed.businessNames,
      };
      await adminClient.rpc('finish_automated_abn_verification', {
        p_verification_id: verificationId,
        p_attempt_id: attemptId,
        p_result: result,
      });
      return json({
        status: 'REJECTED',
        reason: 'BUSINESS_NAME_MISMATCH',
        message: 'We found an active ABN, but the registered business information could not be matched confidently with the business details entered in Everest Local.',
        authoritative_name: parsed.entityName,
        business_names: parsed.businessNames,
      }, 200);
    }

    const result: VerificationResult = {
      status: 'VERIFIED',
      decision: 'AUTO_VERIFIED',
      reason: 'ABN Lookup confirmed an active, current ABN and a sufficient match to the registered entity/business name.',
      abnStatus: parsed.abnStatus,
      entityName: parsed.entityName || matchedName,
      entityType: parsed.entityType,
      gstRegisteredFrom: parsed.gstRegisteredFrom,
      registerUpdatedAt: parsed.registerUpdatedAt,
      abnCurrent: parsed.abnCurrent,
      state: parsed.state,
      postcode: parsed.postcode,
      businessNames: parsed.businessNames,
    };

    const { data: finish, error: finishError } = await adminClient.rpc('finish_automated_abn_verification', {
      p_verification_id: verificationId,
      p_attempt_id: attemptId,
      p_result: result,
    });

    if (finishError) {
      console.error('abn_verification_finish_failed', { code: finishError.code });
      return json({ error: 'We could not complete verification. Please try again.' }, 500);
    }

    return json({
      status: 'VERIFIED',
      message: 'Your business has been automatically verified using ABN Lookup.',
      abn: requestedAbn,
      abn_status: parsed.abnStatus,
      entity_name: parsed.entityName || matchedName,
      business_names: parsed.businessNames,
      entity_type: parsed.entityType,
      verification_id: verificationId,
      result: finish,
    });
  } catch (error) {
    console.error('business_abn_verify_failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return json({ error: 'We could not complete ABN verification. Please try again.' }, 500);
  }
});
