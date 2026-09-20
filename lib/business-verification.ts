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

async function readFunctionError(error: unknown): Promise<{ code: string; governmentName?: string }> {
  const candidate = error as { context?: { json?: () => Promise<unknown> } } | null;
  try {
    const payload = await candidate?.context?.json?.();
    if (payload && typeof payload === 'object') {
      const value = payload as { error?: unknown; government_name?: unknown };
      return {
        code: typeof value.error === 'string' ? value.error : '',
        governmentName: typeof value.government_name === 'string' ? value.government_name : undefined,
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
  _documents: unknown[] = [],
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
    const diagnosticId = createDiagnosticId();

    switch (remote.code) {
      case 'INVALID_ABN':
        throw new BusinessVerificationError('INVALID_ABN');
      case 'ABN_NOT_FOUND':
        throw new BusinessVerificationError('ABN_NOT_FOUND');
      case 'ABN_NOT_ACTIVE':
        throw new BusinessVerificationError('ABN_NOT_ACTIVE');
      case 'BUSINESS_NAME_MISMATCH':
        throw new BusinessVerificationError('BUSINESS_NAME_MISMATCH', undefined, remote.governmentName);
      case 'GOVERNMENT_LOOKUP_UNAVAILABLE':
        throw new BusinessVerificationError('GOVERNMENT_LOOKUP_UNAVAILABLE');
      case 'VERIFICATION_PENDING':
        throw new BusinessVerificationError('VERIFICATION_PENDING');
      case 'NOT_AUTHORIZED':
        throw new BusinessVerificationError('NOT_AUTHORIZED');
      case 'VERIFICATION_ALREADY_COMPLETED':
        throw new BusinessVerificationError('VERIFICATION_ALREADY_COMPLETED');
      default:
        console.error(`[BusinessVerification:${diagnosticId}] government verification failed`);
        throw new BusinessVerificationError('DATABASE_ERROR', diagnosticId);
    }
  }

  if (!data || typeof data !== 'object' || typeof (data as { verification_id?: unknown }).verification_id !== 'string') {
    const diagnosticId = createDiagnosticId();
    console.error(`[BusinessVerification:${diagnosticId}] invalid verification response`);
    throw new BusinessVerificationError('DATABASE_ERROR', diagnosticId);
  }

  return (data as { verification_id: string }).verification_id;
}
