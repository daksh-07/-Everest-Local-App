import { supabase, requireSupabaseConfig } from './supabase';
import { isValidAbn, normalizeAbn } from './abn';

export type BusinessVerificationErrorCode =
  | 'INVALID_ABN'
  | 'VERIFICATION_PENDING'
  | 'NOT_AUTHORIZED'
  | 'VERIFICATION_ALREADY_COMPLETED'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'DATABASE_ERROR';

export class BusinessVerificationError extends Error {
  readonly code: BusinessVerificationErrorCode;
  readonly diagnosticId?: string;

  constructor(code: BusinessVerificationErrorCode, diagnosticId?: string) {
    super(code);
    this.name = 'BusinessVerificationError';
    this.code = code;
  }
}

export type AutomatedVerificationResponse = {
  status: 'VERIFIED' | 'REJECTED' | 'PENDING_RETRY';
  reason?: string;
  message?: string;
  abn?: string;
  abn_status?: string | null;
  entity_name?: string | null;
  business_names?: string[];
  entity_type?: string | null;
  verification_id?: string;
};

export type LatestBusinessVerification = {
  id: string;
  business_id: string;
  status: string;
  abn: string | null;
  automated_decision: string;
  automated_rejection_reason: string | null;
  automated_checked_at: string | null;
  retry_count: number;
  retry_after: string | null;
  provider_status: string | null;
  provider_entity_name: string | null;
  provider_entity_type: string | null;
  provider_business_names: string[];
  provider_match: boolean | null;
  provider_retrieved_at: string | null;
};

function createDiagnosticId(): string {
  return `BV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function verifyBusinessAbn(
  businessId: string,
  abn: string,
  revalidate = false,
): Promise<AutomatedVerificationResponse> {
  requireSupabaseConfig();

  const normalizedAbn = normalizeAbn(abn);
  if (!isValidAbn(normalizedAbn)) {
    throw new BusinessVerificationError('INVALID_ABN');
  }

  const { data, error } = await supabase.functions.invoke('business-abn-verify', {
    body: {
      business_id: businessId,
      abn: normalizedAbn,
      revalidate,
    },
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('429') || message.includes('rate')) {
      throw new BusinessVerificationError('RATE_LIMITED');
    }
    if (message.includes('503') || message.includes('timeout') || message.includes('unavailable')) {
      throw new BusinessVerificationError('SERVICE_UNAVAILABLE');
    }
    const diagnosticId = createDiagnosticId();
    console.error(`[BusinessVerification:${diagnosticId}] edge verification failed`);
    throw new BusinessVerificationError('DATABASE_ERROR', diagnosticId);
  }

  const result = data as AutomatedVerificationResponse | null;
  if (!result) {
    const diagnosticId = createDiagnosticId();
    console.error(`[BusinessVerification:${diagnosticId}] empty edge verification response`);
    throw new BusinessVerificationError('DATABASE_ERROR', diagnosticId);
  }

  if (result.status === 'VERIFIED' || result.status === 'REJECTED' || result.status === 'PENDING_RETRY') {
    return result;
  }

  switch (result.reason) {
    case 'INVALID_ABN':
      throw new BusinessVerificationError('INVALID_ABN');
    case 'VERIFICATION_PENDING':
      throw new BusinessVerificationError('VERIFICATION_PENDING');
    case 'VERIFICATION_ALREADY_COMPLETED':
      throw new BusinessVerificationError('VERIFICATION_ALREADY_COMPLETED');
    case 'NOT_AUTHORIZED':
      throw new BusinessVerificationError('NOT_AUTHORIZED');
    case 'RATE_LIMITED':
      throw new BusinessVerificationError('RATE_LIMITED');
    default:
      throw new BusinessVerificationError('DATABASE_ERROR', createDiagnosticId());
  }
}

export async function getLatestBusinessVerification(
  businessId: string,
): Promise<LatestBusinessVerification | null> {
  requireSupabaseConfig();

  const { data, error } = await supabase
    .from('business_verifications')
    .select(
      'id,business_id,status,abn,automated_decision,automated_rejection_reason,automated_checked_at,retry_count,retry_after,provider_status,provider_entity_name,provider_entity_type,provider_business_names,provider_match,provider_retrieved_at',
    )
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    const diagnosticId = createDiagnosticId();
    console.error(`[BusinessVerification:${diagnosticId}] verification read failed`);
    throw new BusinessVerificationError('DATABASE_ERROR', diagnosticId);
  }

  return data as LatestBusinessVerification | null;
}

export async function requestBusinessVerificationReview(
  verificationId: string,
  explanation: string,
  caseType: 'MANUAL_REVIEW' | 'HELP' | 'FEEDBACK' = 'MANUAL_REVIEW',
): Promise<string> {
  requireSupabaseConfig();

  const { data, error } = await supabase.rpc('request_business_verification_review', {
    p_verification_id: verificationId,
    p_explanation: explanation.trim(),
    p_case_type: caseType,
  });

  if (error) {
    if (error.message === 'NOT_AUTHORIZED') throw new BusinessVerificationError('NOT_AUTHORIZED');
    if (error.message === 'MANUAL_REVIEW_ALREADY_PENDING') throw new BusinessVerificationError('VERIFICATION_PENDING');
    const diagnosticId = createDiagnosticId();
    console.error(`[BusinessVerification:${diagnosticId}] manual review request failed`);
    throw new BusinessVerificationError('DATABASE_ERROR', diagnosticId);
  }

  if (typeof data !== 'string') {
    const diagnosticId = createDiagnosticId();
    console.error(`[BusinessVerification:${diagnosticId}] invalid manual review response`);
    throw new BusinessVerificationError('DATABASE_ERROR', diagnosticId);
  }

  return data;
}
