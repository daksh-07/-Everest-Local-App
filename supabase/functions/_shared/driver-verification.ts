export type VerificationOutcome =
  | 'VERIFIED'
  | 'MORE_INFORMATION_REQUIRED'
  | 'REJECTED'
  | 'MANUAL_REVIEW_REQUIRED';

export type VerificationRequest = {
  applicationId: string;
  userId: string;
  jurisdiction: string;
  licenceNumber?: string;
  registrationPlate?: string;
  identityDocumentId?: string;
  providerReference?: string;
};

export type VerificationResult = {
  outcome: VerificationOutcome;
  provider: string;
  reference?: string;
  checkedAt: string;
  reason?: string;
  expiresAt?: string;
};

export interface LicenceVerificationProvider {
  readonly name: string;
  verify(request: VerificationRequest): Promise<VerificationResult>;
}

export interface VehicleRegistrationVerificationProvider {
  readonly name: string;
  verify(request: VerificationRequest): Promise<VerificationResult>;
}

export interface IdentityVerificationProvider {
  readonly name: string;
  verify(request: VerificationRequest): Promise<VerificationResult>;
}

export interface InsuranceVerificationProvider {
  readonly name: string;
  verify(request: VerificationRequest): Promise<VerificationResult>;
}

export class ManualReviewProvider
  implements LicenceVerificationProvider, VehicleRegistrationVerificationProvider, IdentityVerificationProvider, InsuranceVerificationProvider
{
  readonly name = 'MANUAL_REVIEW_REQUIRED';

  async verify(): Promise<VerificationResult> {
    return {
      outcome: 'MANUAL_REVIEW_REQUIRED',
      provider: this.name,
      checkedAt: new Date().toISOString(),
      reason: 'No authorised verification provider is configured for this jurisdiction.',
    };
  }
}
