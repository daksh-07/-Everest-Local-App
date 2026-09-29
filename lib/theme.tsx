import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ThemePreference='SYSTEM'|'LIGHT'|'DARK';
export type ThemeColors={canvas:string;surface:string;elevated:string;text:string;textSecondary:string;muted:string;border:string;soft:string;input:string;danger:string;success:string;overlay:string;navigation:string;brand:string;onBrand:string;accent:string;accentSoft:string;info:string};
export type AppTheme={preference:ThemePreference;isDark:boolean;colors:ThemeColors;setPreference:(value:ThemePreference)=>Promise<void>;ready:boolean};
export const uiTokens={
  space:{xxs:4,xs:8,sm:12,md:16,lg:20,xl:24,xxl:32,section:40},
  radius:{sm:10,md:14,lg:20,xl:24,pill:999},
  control:{compact:44,standard:48,large:52},
  typography:{caption:12,small:13,body:15,title:20,display:31},
} as const;

const STORAGE_KEY='everest-local-theme';
// Everest uses warm neutral surfaces and champagne for brand emphasis.
// Green is reserved for semantic status such as live, available and success.
const light:ThemeColors={canvas:'#F7F5F0',surface:'#FFFEFB',elevated:'#F2EEE7',text:'#121411',textSecondary:'#626861',muted:'#686E66',border:'#DDD9D0',soft:'#EFECE5',input:'#FFFEFB',danger:'#A9433C',success:'#176B4D',overlay:'rgba(18,20,17,.48)',navigation:'#FFFEFB',brand:'#C6A26B',onBrand:'#121411',accent:'#805D2E',accentSoft:'#E8DCC8',info:'#315F8A'};
const dark:ThemeColors={canvas:'#070B09',surface:'#101512',elevated:'#151B17',text:'#F5F1E9',textSecondary:'#C5CAC5',muted:'#959D97',border:'#29312C',soft:'#1D241F',input:'#121814',danger:'#F1A39B',success:'#6FC39B',overlay:'rgba(0,0,0,.76)',navigation:'#0D120F',brand:'#D8BE96',onBrand:'#17130D',accent:'#D8BE96',accentSoft:'#29231C',info:'#9FC2E5'};
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
