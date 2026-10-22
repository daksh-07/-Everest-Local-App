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
  'This business is not ready to receive Everest payments. Choose another quote or try again later.',
  'Everest Local Stripe Connect is not activated yet. Complete Connect setup in the Stripe Dashboard, then try again.',
  'The Everest Local Stripe account is not fully activated for live payments yet. Complete Stripe account activation, then try again.',
  'Stripe key permission required: enable V2 Account Storer Write for the Everest Local Production Backend key, then try again.',
  'The Everest Local Stripe server key is missing a required Stripe permission. Update the key permissions, then try again.',
];

export function userFacingError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  // Postgres raises these without a trailing full stop; compare without it.
  const message = error.message.trim().replace(/\.$/, '');
  const safe = SAFE_MESSAGES.find(item => item.replace(/\.$/, '') === message);
  return safe ?? fallback;
}

// userFacingError is an allow-list for flows whose server messages are fully enumerated.
// userMessage is for screens that previously showed any message: copy written for people
// (thrown by lib/* helpers or raised by our RPCs, e.g. 'Cart is empty') passes through, while
// database, transport and runtime internals never reach the screen.
const OFFLINE=/failed to fetch|network ?(request failed|error)|load failed|fetch failed|offline|timed? ?out|\bECONN[A-Z]+\b|\bENOTFOUND\b/i;
const SESSION=/^authentication required$|jwt (expired|malformed)|invalid jwt|refresh token|session (expired|missing|not found)/i;
const TECHNICAL=/violates|duplicate key|PGRST|relation "|column "|does not exist|permission denied for |row-level security|syntax error|invalid input (syntax|value)|null value|schema cache|undefined is not|cannot read propert|is not a function|unexpected token|JSON|TypeError|ReferenceError|stack|\bat \w+ \(|^[A-Z0-9]{5}$|<html|status code \d{3}/i;

export function userMessage(error:unknown,fallback:string):string{
 const raw=typeof error==='string'?error:error instanceof Error?error.message:typeof (error as {message?:unknown})?.message==='string'?(error as {message:string}).message:'';
 const message=raw.trim();
 if(!message)return fallback;
 if(OFFLINE.test(message))return 'You’re offline or the connection dropped. Check your connection and try again.';
 if(SESSION.test(message))return 'Your session has ended. Sign in again to continue.';
 if(TECHNICAL.test(message)||message.length>220)return fallback;
 return message;
}
