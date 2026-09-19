import { supabase, requireSupabaseConfig } from './supabase';

export type DriverStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'MORE_INFORMATION_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'EXPIRED';

export type DriverDocumentType =
  | 'PROFILE_PHOTO'
  | 'LICENCE_FRONT'
  | 'LICENCE_BACK'
  | 'REGISTRATION'
  | 'VEHICLE_OWNERSHIP'
  | 'VEHICLE_AUTHORIZATION'
  | 'VEHICLE_FRONT'
  | 'VEHICLE_REAR'
  | 'VEHICLE_SIDE'
  | 'VEHICLE_INTERIOR'
  | 'VEHICLE_PLATE'
  | 'INSURANCE'
  | 'IDENTITY_DOCUMENT'
  | 'POLICE_CHECK'
  | 'WORK_RIGHTS'
  | 'ABN_EVIDENCE';

export type DriverDocument = {
  id: string;
  document_type: DriverDocumentType;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'VERIFIED' | 'MORE_INFORMATION_REQUIRED' | 'REJECTED' | 'REPLACED';
  uploaded_at: string;
  expires_at: string | null;
  rejection_reason: string | null;
  document_number: string | null;
  document_subtype: string | null;
  supersedes_document_id: string | null;
  issuing_jurisdiction: string | null;
};

export type DriverVehicle = {
  id: string;
  registration_plate: string;
  registration_state: string;
  make: string;
  model: string;
  year: number | null;
  colour: string | null;
  vehicle_type: string;
  vin: string | null;
  ownership_status: 'OWNER' | 'AUTHORISED_USER' | 'EMPLOYER_VEHICLE';
  registration_expiry: string | null;
  registration_status: 'PENDING' | 'CURRENT' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED' | 'REJECTED';
  registration_restrictions: string | null;
  ctp_provider: string | null;
  ctp_expiry: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'SUSPENDED' | 'EXPIRED';
};

export type DriverVerification = {
  identity_status: 'PENDING' | 'VERIFIED' | 'MORE_INFORMATION_REQUIRED' | 'REJECTED';
  licence_status: 'PENDING' | 'VERIFIED' | 'MORE_INFORMATION_REQUIRED' | 'REJECTED' | 'EXPIRED';
  registration_status: 'PENDING' | 'VERIFIED' | 'MORE_INFORMATION_REQUIRED' | 'REJECTED' | 'EXPIRED';
  insurance_status: 'NOT_REQUIRED' | 'PENDING' | 'VERIFIED' | 'MORE_INFORMATION_REQUIRED' | 'REJECTED' | 'EXPIRED';
  verification_method: 'MANUAL_ADMIN_CHECK' | 'OFFICIAL_API';
  verification_provider: string | null;
  verification_reference: string | null;
  licence_jurisdiction: string | null;
  licence_number: string | null;
  licence_class: string | null;
  licence_expiry: string | null;
  licence_restrictions: string | null;
  insurance_provider: string | null;
  insurance_policy_reference: string | null;
  insurance_type: 'CTP' | 'ADDITIONAL_MOTOR' | 'COMMERCIAL_BUSINESS_USE' | 'OTHER' | null;
  insurance_expiry: string | null;
};

export type DriverApplication = {
  id: string;
  status: DriverStatus;
  legal_first_name: string | null;
  legal_last_name: string | null;
  date_of_birth: string | null;
  address_line: string | null;
  postcode: string | null;
  suburb: string | null;
  city: string | null;
  state: string | null;
  service_area: string | null;
  availability: string | null;
  notes: string | null;
  status_reason: string | null;
  compliance_jurisdiction: string;
  submitted_at: string | null;
  last_submitted_at: string | null;
  verification: DriverVerification | null;
  vehicle: DriverVehicle | null;
  documents: DriverDocument[];
  declarations: DriverDeclaration[];
};

export type DriverDeclaration = { declaration_key: string; declaration_version: string; declaration_text: string; accepted_at: string };
export type DriverComplianceItem = {
  status: string;
  reason: string | null;
  source: { source?: string; name?: string | null; url?: string | null; notes?: string | null };
};
export type DriverCompliance = {
  jurisdiction: string;
  identity: DriverComplianceItem;
  licence: DriverComplianceItem;
  vehicle: DriverComplianceItem;
  registration: DriverComplianceItem;
  ctp: DriverComplianceItem;
  insurance: DriverComplianceItem;
  overall: { status: DriverStatus; blockingItems: string[]; expiresSoon: Array<{ credential: string; days: number; expires_at: string }> };
};


export type DriverVerificationRequirements = {
  require_identity_review: boolean;
  require_licence_review: boolean;
  require_registration_review: boolean;
  require_vehicle_ownership_evidence: boolean;
  require_vehicle_photos: boolean;
  require_additional_insurance: boolean;
};

async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Authentication required');
  return user.id;
}

export async function getDriverRequirements(): Promise<DriverVerificationRequirements> {
  requireSupabaseConfig();
  const { data, error } = await supabase.from('driver_verification_requirements').select('require_identity_review,require_licence_review,require_registration_review,require_vehicle_ownership_evidence,require_vehicle_photos,require_additional_insurance').eq('id', true).single();
  if (error) throw new Error(error.message);
  return data as DriverVerificationRequirements;
}

export async function getOrCreateDriverApplicationDraft() {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('get_or_create_driver_application_draft');
  if (error) throw new Error(error.message);
  if (typeof data !== 'string') throw new Error('Driver draft creation returned an invalid reference.');
  return data;
}

export async function getDriverApplication(): Promise<DriverApplication | null> {
  requireSupabaseConfig();
  const userId = await currentUserId();
  const { data: application, error } = await supabase.from('driver_applications')
    .select('id,status,legal_first_name,legal_last_name,date_of_birth,address_line,postcode,suburb,city,state,service_area,availability,notes,status_reason,compliance_jurisdiction,submitted_at,last_submitted_at')
    .eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!application) return null;

  const [verificationResult, vehicleResult, documentsResult] = await Promise.all([
    supabase.from('driver_verifications').select('identity_status,licence_status,registration_status,insurance_status,verification_method,verification_provider,verification_reference,licence_jurisdiction,licence_number,licence_class,licence_expiry,licence_restrictions,insurance_provider,insurance_policy_reference,insurance_type,insurance_expiry').eq('application_id', application.id).maybeSingle(),
    supabase.from('driver_vehicles').select('id,registration_plate,registration_state,make,model,year,colour,vehicle_type,vin,ownership_status,registration_expiry,registration_restrictions,registration_status,ctp_provider,ctp_expiry,status').eq('application_id', application.id).maybeSingle(),
    supabase.from('driver_documents').select('id,document_type,document_subtype,supersedes_document_id,storage_path,mime_type,size_bytes,status,uploaded_at,expires_at,rejection_reason,document_number,issuing_jurisdiction').eq('application_id', application.id).neq('status','REPLACED').order('uploaded_at',{ascending:false}),
  ]);
  if (verificationResult.error) throw new Error(verificationResult.error.message);
  if (vehicleResult.error) throw new Error(vehicleResult.error.message);
  if (documentsResult.error) throw new Error(documentsResult.error.message);

  const { data: declarations, error: declarationError } = await supabase.from('driver_declarations').select('declaration_key,declaration_version,declaration_text,accepted_at').eq('application_id', application.id).order('accepted_at',{ascending:true});
  if (declarationError) throw new Error(declarationError.message);
  return {
    ...application,
    verification: verificationResult.data as DriverVerification | null,
    vehicle: vehicleResult.data as DriverVehicle | null,
    documents: (documentsResult.data ?? []) as DriverDocument[],
    declarations: (declarations ?? []) as DriverDeclaration[],
  };
}

export async function saveDriverApplication(input: {
  legalFirstName: string;
  legalLastName: string;
  dateOfBirth: string;
  phone: string;
  addressLine: string;
  suburb: string;
  city: string;
  state: string;
  postcode: string;
  serviceArea: string;
  availability: string;
  notes?: string;
}) {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('save_driver_application', {
    p_legal_first_name: input.legalFirstName.trim(),
    p_legal_last_name: input.legalLastName.trim(),
    p_date_of_birth: input.dateOfBirth,
    p_phone: input.phone.trim(),
    p_address_line: input.addressLine.trim(),
    p_suburb: input.suburb.trim(),
    p_city: input.city.trim(),
    p_state: input.state.trim(),
    p_postcode: input.postcode.trim(),
    p_service_area: input.serviceArea.trim(),
    p_availability: input.availability.trim(),
    p_notes: input.notes?.trim() || null,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string') throw new Error('Application save returned an invalid reference.');
  return data;
}

export async function submitDriverApplication() {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('submit_driver_application');
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error('Driver application could not be submitted.');
}

export async function saveDriverVerificationDetails(input: { licenceJurisdiction: string; licenceNumber: string; licenceClass: string; licenceExpiry: string; licenceRestrictions: string; insuranceProvider: string; insurancePolicyReference: string; insuranceType: 'CTP'|'ADDITIONAL_MOTOR'|'COMMERCIAL_BUSINESS_USE'|'OTHER'|''; insuranceExpiry: string; }) {
  requireSupabaseConfig();
  const { error } = await supabase.rpc('save_driver_verification_details', {
    p_licence_jurisdiction: input.licenceJurisdiction,
    p_licence_number: input.licenceNumber,
    p_licence_class: input.licenceClass,
    p_licence_expiry: input.licenceExpiry,
    p_licence_restrictions: input.licenceRestrictions.trim() || null,
    p_insurance_provider: input.insuranceProvider.trim() || null,
    p_insurance_policy_reference: input.insurancePolicyReference.trim() || null,
    p_insurance_type: input.insuranceType || null,
    p_insurance_expiry: input.insuranceExpiry || null,
  });
  if (error) throw new Error(error.message);
}

export async function saveDriverVehicle(input: {
  registrationPlate: string;
  registrationState: string;
  make: string;
  model: string;
  year: number | null;
  colour: string;
  vehicleType: string;
  vin: string;
  ownershipStatus: DriverVehicle['ownership_status'];
  registrationExpiry: string;
  registrationRestrictions: string;
  ctpProvider: string;
  ctpExpiry: string;
}) {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('save_driver_vehicle_details', {
    p_registration_plate: input.registrationPlate.trim(),
    p_registration_state: input.registrationState.trim(),
    p_make: input.make.trim(),
    p_model: input.model.trim(),
    p_year: input.year,
    p_colour: input.colour.trim(),
    p_vehicle_type: input.vehicleType.trim(),
    p_vin: input.vin.trim() || null,
    p_ownership_status: input.ownershipStatus,
    p_registration_expiry: input.registrationExpiry || null,
    p_registration_restrictions: input.registrationRestrictions.trim() || null,
    p_ctp_provider: input.ctpProvider.trim() || null,
    p_ctp_expiry: input.ctpExpiry || null,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== 'string') throw new Error('Vehicle save returned an invalid reference.');
  return data;
}

type UploadAsset = {
  uri: string;
  file?: Blob;
  base64?: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number;
};

function extensionFor(mimeType: string) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function assetBody(asset: UploadAsset, mimeType: string) {
  if (asset.file) return asset.file;
  if (asset.base64) {
    const response = await fetch(`data:${mimeType};base64,${asset.base64}`);
    return response.arrayBuffer();
  }
  const response = await fetch(asset.uri);
  return response.arrayBuffer();
}

export async function uploadDriverDocument(input: {
  applicationId: string;
  vehicleId?: string | null;
  documentType: DriverDocumentType;
  asset: UploadAsset;
  expiresAt?: string | null;
  documentNumber?: string;
  issuingJurisdiction?: string;
  documentSubtype?: string;
}) {
  requireSupabaseConfig();
  const userId = await currentUserId();
  const mimeType = input.asset.mimeType && ['image/jpeg','image/png','image/webp'].includes(input.asset.mimeType) ? input.asset.mimeType : 'image/jpeg';
  const size = input.asset.fileSize ?? input.asset.file?.size ?? (input.asset.base64 ? Math.floor(input.asset.base64.length * 0.75) : 0);
  if (size <= 0 || size > 10 * 1024 * 1024) throw new Error('Document must be between 1 byte and 10 MB.');
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${userId}/${input.applicationId}/${input.documentType}/${id}.${extensionFor(mimeType)}`;
  const body = await assetBody(input.asset, mimeType);
  const { error: uploadError } = await supabase.storage.from('driver-verification').upload(path, body, { contentType: mimeType, upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  try {
    const { data, error } = await supabase.rpc('register_driver_document', {
      p_application_id: input.applicationId,
      p_vehicle_id: input.vehicleId ?? null,
      p_document_type: input.documentType,
      p_storage_path: path,
      p_mime_type: mimeType,
      p_size_bytes: size,
      p_expires_at: input.expiresAt ?? null,
      p_document_number: input.documentNumber?.trim() || null,
      p_issuing_jurisdiction: input.issuingJurisdiction?.trim() || null,
      p_document_subtype: input.documentSubtype?.trim() || null,
    });
    if (error) throw error;
    if (typeof data !== 'string') throw new Error('Document registration returned an invalid reference.');
    return data;
  } catch (error) {
    await supabase.storage.from('driver-verification').remove([path]);
    throw new Error(error instanceof Error ? error.message : 'Document registration failed.');
  }
}

export async function getDriverDocumentSignedUrl(documentId: string) {
  requireSupabaseConfig();
  const { data, error } = await supabase.from('driver_documents').select('storage_path').eq('id', documentId).single();
  if (error) throw new Error(error.message);
  const { data: signed, error: signedError } = await supabase.storage.from('driver-verification').createSignedUrl(data.storage_path, 300);
  if (signedError) throw new Error(signedError.message);
  return signed.signedUrl;
}

export async function adminSetDriverApplication(applicationId: string, status: Exclude<DriverStatus,'DRAFT'|'SUBMITTED'|'EXPIRED'>, reason?: string) {
  requireSupabaseConfig();
  const { error } = await supabase.rpc('admin_set_driver_application', { p_application_id: applicationId, p_status: status, p_notes: reason?.trim() || null });
  if (error) throw new Error(error.message);
}

export async function adminSetDriverVerification(applicationId: string, input: {
  identityStatus?: string; licenceStatus?: string; registrationStatus?: string; insuranceStatus?: string;
  verificationMethod?: 'MANUAL_ADMIN_CHECK' | 'OFFICIAL_API'; provider?: string; reference?: string; notes?: string;
}) {
  requireSupabaseConfig();
  const { error } = await supabase.rpc('admin_set_driver_verification', {
    p_application_id: applicationId,
    p_identity_status: input.identityStatus ?? null,
    p_licence_status: input.licenceStatus ?? null,
    p_registration_status: input.registrationStatus ?? null,
    p_insurance_status: input.insuranceStatus ?? null,
    p_verification_method: input.verificationMethod ?? 'MANUAL_ADMIN_CHECK',
    p_provider: input.provider ?? null,
    p_reference: input.reference ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function adminSetDriverDocumentStatus(documentId: string, status: 'UNDER_REVIEW'|'VERIFIED'|'MORE_INFORMATION_REQUIRED'|'REJECTED', reason?: string) {
  requireSupabaseConfig();
  const { error } = await supabase.rpc('admin_set_driver_document_status', { p_document_id: documentId, p_status: status, p_reason: reason?.trim() || null });
  if (error) throw new Error(error.message);
}


export async function adminSetDriverVehicleVerification(applicationId: string, input: {
  registrationStatus: 'PENDING'|'CURRENT'|'EXPIRED'|'SUSPENDED'|'CANCELLED'|'REJECTED';
  registrationExpiry: string;
  registrationRestrictions: string;
  ctpProvider: string;
  ctpExpiry: string;
  verificationMethod?: 'MANUAL_ADMIN_CHECK'|'OFFICIAL_API';
  provider?: string;
  reference?: string;
}) {
  requireSupabaseConfig();
  const { error } = await supabase.rpc('admin_set_driver_vehicle_verification', {
    p_application_id: applicationId,
    p_registration_status: input.registrationStatus,
    p_registration_expiry: input.registrationExpiry || null,
    p_registration_restrictions: input.registrationRestrictions.trim() || null,
    p_ctp_provider: input.ctpProvider.trim() || null,
    p_ctp_expiry: input.ctpExpiry || null,
    p_verification_method: input.verificationMethod ?? 'MANUAL_ADMIN_CHECK',
    p_provider: input.provider ?? null,
    p_reference: input.reference ?? null,
  });
  if (error) throw new Error(error.message);
}


export async function adminSetDriverCredentialDetails(applicationId: string, input: {
  licenceStatus: 'PENDING'|'VERIFIED'|'MORE_INFORMATION_REQUIRED'|'REJECTED'|'EXPIRED';
  licenceExpiry: string;
  insuranceStatus: 'NOT_REQUIRED'|'PENDING'|'VERIFIED'|'MORE_INFORMATION_REQUIRED'|'REJECTED'|'EXPIRED';
  insuranceProvider: string;
  insurancePolicyReference: string;
  insuranceType: 'CTP'|'ADDITIONAL_MOTOR'|'COMMERCIAL_BUSINESS_USE'|'OTHER'|'';
  insuranceExpiry: string;
  verificationMethod?: 'MANUAL_ADMIN_CHECK'|'OFFICIAL_API';
  provider?: string;
  reference?: string;
}) {
  requireSupabaseConfig();
  const { error } = await supabase.rpc('admin_set_driver_credential_details', {
    p_application_id: applicationId,
    p_licence_status: input.licenceStatus,
    p_licence_expiry: input.licenceExpiry || null,
    p_insurance_status: input.insuranceStatus,
    p_insurance_provider: input.insuranceProvider.trim() || null,
    p_insurance_policy_reference: input.insurancePolicyReference.trim() || null,
    p_insurance_expiry: input.insuranceExpiry || null,
    p_insurance_type: input.insuranceType ?? null,
    p_verification_method: input.verificationMethod ?? 'MANUAL_ADMIN_CHECK',
    p_provider: input.provider ?? null,
    p_reference: input.reference ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function acceptDriverDeclaration(declarationKey: string) {
  requireSupabaseConfig();
  const { error } = await supabase.rpc('accept_driver_declaration', { p_declaration_key: declarationKey });
  if (error) throw new Error(error.message);
}

export async function getDriverCompliance(applicationId: string): Promise<DriverCompliance> {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('evaluate_driver_compliance', { p_application_id: applicationId });
  if (error) throw new Error(error.message);
  return data as DriverCompliance;
}

export async function getDriverComplianceRequirements() {
  requireSupabaseConfig();
  const { data, error } = await supabase.rpc('get_driver_compliance_requirements');
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{requirement_code:string;title:string;description:string;required:boolean;source_type:string;source_name:string|null;source_url:string|null;source_notes:string|null}>;
}
