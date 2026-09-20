const SAFE_MESSAGES = [
  'Business name must be between 2 and 120 characters.',
  'Suburb is required.',
  'Invalid price.',
  'Sale price must be between $0 and the regular price.',
  'Invalid inventory quantity.',
  'Inventory adjustment must be a whole number.',
  'Business creation returned an invalid reference.',
];

export function userFacingError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  if (SAFE_MESSAGES.includes(message)) return message;
  return fallback;
}
