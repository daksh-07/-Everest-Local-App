import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ThemePreference='SYSTEM'|'LIGHT'|'DARK';
export type ThemeColors={canvas:string;surface:string;elevated:string;text:string;textSecondary:string;muted:string;border:string;soft:string;input:string;danger:string;success:string;overlay:string;navigation:string;brand:string;onBrand:string;accent:string;accentSoft:string;info:string};
export type AppTheme={preference:ThemePreference;isDark:boolean;colors:ThemeColors;setPreference:(value:ThemePreference)=>Promise<void>;ready:boolean};

const STORAGE_KEY='everest-local-theme';
// Alpine green gives primary actions stronger contrast and trust; champagne remains the
// premium accent. Both palettes meet the product's black/beige identity without looking muted.
const light:ThemeColors={canvas:'#f6f5f1',surface:'#ffffff',elevated:'#fbfaf7',text:'#101513',textSecondary:'#4f5954',muted:'#737b77',border:'#deded7',soft:'#ecefe9',input:'#ffffff',danger:'#ad352e',success:'#216b4b',overlay:'rgba(11,18,15,.52)',navigation:'#fbfaf7',brand:'#195b43',onBrand:'#ffffff',accent:'#9a7540',accentSoft:'#f2eadc',info:'#315f8a'};
const dark:ThemeColors={canvas:'#090d0b',surface:'#131816',elevated:'#191f1c',text:'#f5f2eb',textSecondary:'#c7cec9',muted:'#98a29d',border:'#303a35',soft:'#202a25',input:'#171d1a',danger:'#f1a39b',success:'#9bd5b8',overlay:'rgba(0,0,0,.76)',navigation:'#0f1412',brand:'#d8c3a5',onBrand:'#17130d',accent:'#d8c3a5',accentSoft:'#29241d',info:'#9fc2e5'};
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
 useEffect(()=>{if(Platform.OS!=='web'||typeof document==='undefined')return;const canvas=isDark?dark.canvas:light.canvas;document.documentElement.style.setProperty('--everest-canvas',canvas);document.documentElement.style.setProperty('--everest-text',isDark?dark.text:light.text);document.documentElement.style.backgroundColor=canvas;document.body.style.backgroundColor=canvas;document.documentElement.style.colorScheme=isDark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',canvas)},[isDark]);
 const value=useMemo(()=>({preference,isDark,colors:isDark?dark:light,setPreference,ready}),[preference,isDark,ready]);
 return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useAppTheme(){const value=useContext(ThemeContext);if(!value)throw new Error('useAppTheme must be used inside ThemeProvider');return value}
