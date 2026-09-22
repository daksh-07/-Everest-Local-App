import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ThemePreference='SYSTEM'|'LIGHT'|'DARK';
export type ThemeColors={canvas:string;surface:string;elevated:string;text:string;textSecondary:string;muted:string;border:string;soft:string;input:string;danger:string;success:string;overlay:string;navigation:string;brand:string;onBrand:string};
export type AppTheme={preference:ThemePreference;isDark:boolean;colors:ThemeColors;setPreference:(value:ThemePreference)=>Promise<void>;ready:boolean};

const STORAGE_KEY='everest-local-theme';
const light:ThemeColors={canvas:'#f8f7f4',surface:'#ffffff',elevated:'#ffffff',text:'#171715',textSecondary:'#5f5c56',muted:'#77736c',border:'#e3e0d9',soft:'#f0eee9',input:'#ffffff',danger:'#9b2c24',success:'#2c6842',overlay:'rgba(17,17,15,.48)',navigation:'#fbfaf7',brand:'#9c8155',onBrand:'#ffffff'};
const dark:ThemeColors={canvas:'#171715',surface:'#211f1c',elevated:'#292622',text:'#f4efe6',textSecondary:'#c2bbb0',muted:'#918a80',border:'#39352f',soft:'#2d2924',input:'#25221e',danger:'#e49a92',success:'#91caa4',overlay:'rgba(0,0,0,.68)',navigation:'#1c1a18',brand:'#c4a574',onBrand:'#17130e'};
const ThemeContext=createContext<AppTheme|null>(null);

function valid(value:string|null):value is ThemePreference{return value==='SYSTEM'||value==='LIGHT'||value==='DARK'}
async function readPreference(){try{if(Platform.OS==='web'){const value=globalThis.localStorage?.getItem(STORAGE_KEY)??null;return valid(value)?value:'SYSTEM'}const value=await SecureStore.getItemAsync(STORAGE_KEY);return valid(value)?value:'SYSTEM'}catch{return'SYSTEM' as const}}
async function writePreference(value:ThemePreference){if(Platform.OS==='web'){globalThis.localStorage?.setItem(STORAGE_KEY,value);return}await SecureStore.setItemAsync(STORAGE_KEY,value)}

export function ThemeProvider({children}:{children:ReactNode}){
 const system=useColorScheme();const [preference,setValue]=useState<ThemePreference>('SYSTEM');const [ready,setReady]=useState(false);
 useEffect(()=>{let active=true;void readPreference().then(value=>{if(active){setValue(value);setReady(true)}});return()=>{active=false}},[]);
 const setPreference=async(value:ThemePreference)=>{setValue(value);await writePreference(value)};
 const isDark=preference==='DARK'||(preference==='SYSTEM'&&system==='dark');
 const value=useMemo(()=>({preference,isDark,colors:isDark?dark:light,setPreference,ready}),[preference,isDark,ready]);
 return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useAppTheme(){const value=useContext(ThemeContext);if(!value)throw new Error('useAppTheme must be used inside ThemeProvider');return value}
