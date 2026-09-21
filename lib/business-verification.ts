import { supabase, requireSupabaseConfig } from './supabase';
import { isValidAbn, normalizeAbn } from './abn';

export type BusinessVerificationErrorCode =
  | 'INVALID_ABN'
  | 'ABN_NOT_FOUND'
  | 'ABN_NOT_ACTIVE'
  | 'BUSINESS_NAME_MISMATCH'
  | 'GOVERNMENT_LOOKUP_UNAVAILABLE'
  | 'VERIFICATION_PENDING'
  | 'NOT_AUTHORIZED'
  | 'VERIFICATION_ALREADY_COMPLETED'
  | 'DATABASE_ERROR';

export class BusinessVerificationError extends Error {
  readonly code: BusinessVerificationErrorCode;
  readonly diagnosticId?: string;
  readonly governmentName?: string;

  constructor(
    code: BusinessVerificationErrorCode,
    diagnosticId?: string,
    governmentName?: string,
  ) {
    super(code);
    this.name = 'BusinessVerificationError';
    this.code = code;
    this.diagnosticId = diagnosticId;
    this.governmentName = governmentName;
  }
}

function createDiagnosticId(): string {
  return `BV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function mapRemoteCode(code: unknown, governmentName?: unknown): BusinessVerificationError | null {
  const normalizedCode = typeof code === 'string' ? code : '';
  const name = typeof governmentName === 'string' ? governmentName : undefined;
  switch (normalizedCode) {
    case 'INVALID_ABN':
      return new BusinessVerificationError('INVALID_ABN');
    case 'ABN_NOT_FOUND':
      return new BusinessVerificationError('ABN_NOT_FOUND');
    case 'ABN_NOT_ACTIVE':
      return new BusinessVerificationError('ABN_NOT_ACTIVE');
    case 'BUSINESS_NAME_MISMATCH':
    case 'ABN_MISMATCH':
      return new BusinessVerificationError('BUSINESS_NAME_MISMATCH', undefined, name);
    case 'GOVERNMENT_LOOKUP_UNAVAILABLE':
    case 'PENDING_RETRY':
      return new BusinessVerificationError('GOVERNMENT_LOOKUP_UNAVAILABLE');
    case 'VERIFICATION_PENDING':
      return new BusinessVerificationError('VERIFICATION_PENDING');
    case 'NOT_AUTHORIZED':
      return new BusinessVerificationError('NOT_AUTHORIZED');
    case 'VERIFICATION_ALREADY_COMPLETED':
      return new BusinessVerificationError('VERIFICATION_ALREADY_COMPLETED');
    default:
      return null;
  }
}

async function readFunctionError(error: unknown): Promise<{ code: string; governmentName?: string }> {
  const candidate = error as { context?: { json?: () => Promise<unknown> } } | null;
  try {
    const payload = await candidate?.context?.json?.();
    if (payload && typeof payload === 'object') {
      const value = payload as { error?: unknown; reason?: unknown; status?: unknown; government_name?: unknown; authoritative_name?: unknown };
      return {
        code: typeof value.error === 'string'
          ? value.error
          : typeof value.reason === 'string'
            ? value.reason
            : typeof value.status === 'string'
              ? value.status
              : '',
        governmentName: typeof value.government_name === 'string'
          ? value.government_name
          : typeof value.authoritative_name === 'string'
            ? value.authoritative_name
            : undefined,
      };
    }
  } catch {
    // Keep the public error generic when the function response cannot be parsed.
  }
  return { code: '' };
}

export async function submitBusinessVerification(
  businessId: string,
  abn: string,
): Promise<string> {
  requireSupabaseConfig();

  const normalizedAbn = normalizeAbn(abn);
  if (!isValidAbn(normalizedAbn)) {
    throw new BusinessVerificationError('INVALID_ABN');
  }

  const { data, error } = await supabase.functions.invoke('business-abn-verify', {
    body: {
      business_id: businessId,
      abn: normalizedAbn,
    },
  });

  if (error) {
    const remote = await readFunctionError(error);
    const mapped = mapRemoteCode(remote.code, remote.governmentName);
    if (mapped) throw mapped;

    const diagnosticId = createDiagnosticId();
    console.error(`[BusinessVerification:${diagnosticId}] government verification failed`);
    throw new BusinessVerificationError('DATABASE_ERROR', diagnosticId);
  }

  if (data && typeof data === 'object') {
    const value = data as {
      status?: unknown;
      reason?: unknown;
      error?: unknown;
      government_name?: unknown;
      authoritative_name?: unknown;
    };
    const mapped = mapRemoteCode(value.error ?? value.reason ?? value.status, value.government_name ?? value.authoritative_name);
    if (mapped) {
      const status = typeof value.status === 'string' ? value.status : '';
      // A successful verification response also uses status=VERIFIED, so only
      // map terminal/retry statuses here. VERIFIED must continue below.
      if (status !== 'VERIFIED') throw mapped;
    }
  }

  if (!data || typeof data !== 'object' || typeof (data as { verification_id?: unknown }).verification_id !== 'string') {
    const diagnosticId = createDiagnosticId();
    console.error(`[BusinessVerification:${diagnosticId}] invalid verification response`);
    throw new BusinessVerificationError('DATABASE_ERROR', diagnosticId);
  }

  return (data as { verification_id: string }).verification_id;
}
