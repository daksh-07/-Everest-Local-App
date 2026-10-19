/** Settle independent operational sources as they arrive. Scope guards prevent a
 * superseded workspace read from changing the current screen. Failed sources
 * are cleared explicitly so their previous totals are never presented as current. */
export async function operationalRead<T>(
  read: () => PromiseLike<T>,
  apply: (value: T) => void,
  clear: () => void,
  status: (state: 'loading' | 'ready' | 'error') => void,
  current: () => boolean,
) {
  if (current()) status('loading');
  try {
    const value = await read();
    if (current()) { apply(value); status('ready'); }
  } catch {
    if (current()) { clear(); status('error'); }
  }
}

export function requireRead<T>(result: {data: T; error: unknown}): T {
  if (result.error) throw result.error;
  return result.data;
}

export type OperationalStatus = Record<string, 'loading' | 'ready' | 'error'>;
