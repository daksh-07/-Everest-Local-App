import { supabase, requireSupabaseConfig } from './supabase';
import { isValidAbn, normalizeAbn } from './abn';

export type BusinessVerificationErrorCode =
  | 'INVALID_ABN'
  | 'VERIFICATION_PENDING'
  | 'NOT_AUTHORIZED'
  | 'VERIFICATION_ALREADY_COMPLETED'
  | 'DATABASE_ERROR';

export class BusinessVerificationError extends Error {
  readonly code: BusinessVerificationErrorCode;
  readonly diagnosticId?: string;

  constructor(code: BusinessVerificationErrorCode, diagnosticId?: string) {
    super(code);
    this.name = 'BusinessVerificationError';
    this.code = code;
    this.diagnosticId = diagnosticId;
  }
}

function createDiagnosticId(): string {
  return `BV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function mapSubmissionError(error: unknown): BusinessVerificationError {
  const diagnosticId = createDiagnosticId();
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = typeof candidate?.code === 'string' ? candidate.code : '';
  const message = typeof candidate?.message === 'string' ? candidate.message : '';

  if (code === 'PT422' || message === 'INVALID_ABN') {
    return new BusinessVerificationError('INVALID_ABN');
  }
  if (code === 'PT409' && message === 'VERIFICATION_PENDING') {
    return new BusinessVerificationError('VERIFICATION_PENDING');
  }
  if (code === 'PT403' || code === '42501' || message === 'NOT_AUTHORIZED') {
    return new BusinessVerificationError('NOT_AUTHORIZED');
  }
  if (code === 'PT409' && message === 'VERIFICATION_ALREADY_COMPLETED') {
    return new BusinessVerificationError('VERIFICATION_ALREADY_COMPLETED');
  }
  if (code === '23505') {
    return new BusinessVerificationError('VERIFICATION_PENDING');
  }

  console.error(`[BusinessVerification:${diagnosticId}] submission failed (${code || 'UNKNOWN'})`);
  return new BusinessVerificationError('DATABASE_ERROR', diagnosticId);
}

export async function submitBusinessVerification(
  businessId: string,
  abn: string,
  documents: unknown[] = [],
): Promise<string> {
  requireSupabaseConfig();

  const normalizedAbn = normalizeAbn(abn);
  if (!isValidAbn(normalizedAbn)) {
    throw new BusinessVerificationError('INVALID_ABN');
  }

  const { data, error } = await supabase.rpc('submit_business_verification', {
    p_business_id: businessId,
    p_abn: normalizedAbn,
    p_documents: documents,
  });

  if (error) {
    throw mapSubmissionError(error);
  }

  if (typeof data !== 'string') {
    const diagnosticId = createDiagnosticId();
    console.error(`[BusinessVerification:${diagnosticId}] invalid RPC response`);
    throw new BusinessVerificationError('DATABASE_ERROR', diagnosticId);
  }

  return data;
}
