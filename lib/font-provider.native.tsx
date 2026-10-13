/* Metro requires literal asset paths; Expo resolves these into bundled files. */
/* eslint-disable @typescript-eslint/no-require-imports */
import { useEffect,useState,type ReactNode } from 'react';
import * as Font from 'expo-font';
import { FontReadyContext } from './font-ready';

const sources={
  'Inter-Regular':require('../assets/fonts/Inter-Regular.ttf'),
  'Inter-Medium':require('../assets/fonts/Inter-Medium.ttf'),
  'Inter-SemiBold':require('../assets/fonts/Inter-SemiBold.ttf'),
  'Inter-Bold':require('../assets/fonts/Inter-Bold.ttf'),
  'BricolageGrotesque-SemiBold':require('../assets/fonts/BricolageGrotesque-SemiBold.ttf'),
  'BricolageGrotesque-Bold':require('../assets/fonts/BricolageGrotesque-Bold.ttf'),
};
const embedded=()=>Object.keys(sources).every(Font.isLoaded);
export function FontProvider({children}:{children:ReactNode}) {
  const [ready,setReady]=useState(embedded);
  useEffect(()=>{
    if(ready)return;
    let active=true;
    // New builds embed the faces. Existing development binaries load bundled
    // assets without holding auth, navigation or the existing splash hostage.
    void Font.loadAsync(sources).then(()=>{if(active)setReady(true)}).catch(()=>{
      console.warn('[Everest typography] Using system fallback; bundled fonts could not load.');
    });
    return()=>{active=false};
  },[ready]);
  return <FontReadyContext.Provider value={ready}>{children}</FontReadyContext.Provider>;
}
