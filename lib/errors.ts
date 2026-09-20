const SAFE_MESSAGES = [
  'Business name must be between 2 and 120 characters.',
  'Suburb is required.',
  'Invalid price.',
  'Sale price must be between $0 and the regular price.',
  'Invalid inventory quantity.',
  'Inventory adjustment must be a whole number.',
  'Business creation returned an invalid reference.',
  'Authentication required.',
  'Not authorized.',
  'Request not found.',
  'This request is no longer accepting quote decisions.',
  'Quote cannot be accepted in its current state.',
  'Quote expired.',
  'No authorized opportunity.',
  'Verified business access is required.',
  'Selected service is not owned and active for this business.',
  'Invalid quote amounts.',
  'Conversation could not be opened.',
];

export function userFacingError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  if (SAFE_MESSAGES.includes(message)) return message;
  return fallback;
}
