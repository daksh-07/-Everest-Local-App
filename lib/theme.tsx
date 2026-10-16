import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ThemePreference='SYSTEM'|'LIGHT'|'DARK';
import { light,dark,type ThemeColors } from './theme-colors';
export type { ThemeColors } from './theme-colors';
export type AppTheme={preference:ThemePreference;isDark:boolean;colors:ThemeColors;setPreference:(value:ThemePreference)=>Promise<void>;ready:boolean};
export const uiTokens={
  space:{xxs:4,xs:8,sm:12,md:16,lg:20,xl:24,xxl:32,section:40},
  radius:{sm:10,md:14,lg:20,xl:24,pill:999},
  control:{compact:44,standard:48,large:52},
  typography:{caption:12,small:13,body:16,title:20,display:31},
  layout:{contentMaxWidth:1180,navMaxWidth:760},
} as const;

const STORAGE_KEY='everest-local-theme';
// Everest Electric: neutral canvases let photography lead; blue marks actions and selection,
// teal identifies Everest Live, coral is a sparing discovery accent. Status colours are separate
// from brand colours and always appear with text or an icon (see lib/theme-colors.ts).
const ThemeContext=createContext<AppTheme|null>(null);

function valid(value:string|null):value is ThemePreference{return value==='SYSTEM'||value==='LIGHT'||value==='DARK'}
function initialWebPreference():ThemePreference{if(Platform.OS!=='web')return 'SYSTEM';try{const value=globalThis.localStorage?.getItem(STORAGE_KEY)??null;return valid(value)?value:'SYSTEM'}catch{return 'SYSTEM'}}
async function readPreference(){try{if(Platform.OS==='web'){const value=globalThis.localStorage?.getItem(STORAGE_KEY)??null;return valid(value)?value:'SYSTEM'}const value=await SecureStore.getItemAsync(STORAGE_KEY);return valid(value)?value:'SYSTEM'}catch{return'SYSTEM' as const}}
async function writePreference(value:ThemePreference){if(Platform.OS==='web'){globalThis.localStorage?.setItem(STORAGE_KEY,value);return}await SecureStore.setItemAsync(STORAGE_KEY,value)}

export function ThemeProvider({children}:{children:ReactNode}){
 const system=useColorScheme();const [preference,setValue]=useState<ThemePreference>(initialWebPreference);const [ready,setReady]=useState(false);
 useEffect(()=>{let active=true;void readPreference().then(value=>{if(active){setValue(value);setReady(true)}});return()=>{active=false}},[]);
 const setPreference=async(value:ThemePreference)=>{setValue(value);await writePreference(value)};
 const isDark=preference==='DARK'||(preference==='SYSTEM'&&system==='dark');
 useEffect(()=>{if(Platform.OS!=='web'||typeof document==='undefined')return;const canvas=isDark?dark.canvas:light.canvas;document.documentElement.style.setProperty('--everest-canvas',canvas);document.documentElement.style.setProperty('--everest-text',isDark?dark.text:light.text);document.documentElement.style.setProperty('--everest-focus',isDark?dark.focus:light.focus);document.documentElement.style.backgroundColor=canvas;document.body.style.backgroundColor=canvas;document.documentElement.style.colorScheme=isDark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',canvas)},[isDark]);
 const value=useMemo(()=>({preference,isDark,colors:isDark?dark:light,setPreference,ready}),[preference,isDark,ready]);
 return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useAppTheme(){const value=useContext(ThemeContext);if(!value)throw new Error('useAppTheme must be used inside ThemeProvider');return value}
/** Memoised themed StyleSheet: `const s=useThemedStyles(createStyles)` with `createStyles=(c:ThemeColors)=>StyleSheet.create({...})`. */
export function useThemedStyles<T>(factory:(colors:ThemeColors)=>T):T{const {colors}=useAppTheme();return useMemo(()=>factory(colors),[colors,factory])}
/** Theme colours when a provider exists, otherwise undefined (root error boundaries render outside it). */
export function useOptionalThemeColors():ThemeColors|undefined{return useContext(ThemeContext)?.colors}
