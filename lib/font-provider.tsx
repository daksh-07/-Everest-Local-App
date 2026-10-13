import type { ReactNode } from 'react';
import { FontReadyContext } from './font-ready';
/** Web faces are discovered in the HTML head, independently of JS startup. */
export function FontProvider({children}:{children:ReactNode}) {
  return <FontReadyContext.Provider value>{children}</FontReadyContext.Provider>;
}
