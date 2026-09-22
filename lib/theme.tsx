import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ThemePreference='SYSTEM'|'LIGHT'|'DARK';
export type ThemeColors={canvas:string;surface:string;elevated:string;text:string;textSecondary:string;muted:string;border:string;soft:string;input:string;danger:string;success:string;overlay:string;navigation:string;brand:string;onBrand:string};
export type AppTheme={preference:ThemePreference;isDark:boolean;colors:ThemeColors;setPreference:(value:ThemePreference)=>Promise<void>;ready:boolean};

const STORAGE_KEY='everest-local-theme';
const light:ThemeColors={canvas:'#f8f7f4',surface:'#ffffff',elevated:'#ffffff',text:'#171715',textSecondary:'#5f5c56',muted:'#77736c',border:'#e3e0d9',soft:'#f0eee9',input:'#ffffff',danger:'#9b2c24',success:'#2c6842',overlay:'rgba(17,17,15,.48)',navigation:'#fbfaf7',brand:'#9c8155',onBrand:'#ffffff'};
const dark:ThemeColors={canvas:'#151513',surface:'#211f1b',elevated:'#2a2722',text:'#f7f1e8',textSecondary:'#c9c0b4',muted:'#a79d91',border:'#454038',soft:'#302c26',input:'#28241f',danger:'#efaaa0',success:'#a2d5b0',overlay:'rgba(0,0,0,.7)',navigation:'#1a1816',brand:'#d1ae75',onBrand:'#21180d'};
const ThemeContext=createContext<AppTheme|null>(null);

function valid(value:string|null):value is ThemePreference{return value==='SYSTEM'||value==='LIGHT'||value==='DARK'}
async function readPreference(){try{if(Platform.OS==='web'){const value=globalThis.localStorage?.getItem(STORAGE_KEY)??null;return valid(value)?value:'SYSTEM'}const value=await SecureStore.getItemAsync(STORAGE_KEY);return valid(value)?value:'SYSTEM'}catch{return'SYSTEM' as const}}
async function writePreference(value:ThemePreference){if(Platform.OS==='web'){globalThis.localStorage?.setItem(STORAGE_KEY,value);return}await SecureStore.setItemAsync(STORAGE_KEY,value)}

export function ThemeProvider({children}:{children:ReactNode}){
 const system=useColorScheme();const [preference,setValue]=useState<ThemePreference>('SYSTEM');const [ready,setReady]=useState(false);
 useEffect(()=>{let active=true;void readPreference().then(value=>{if(active){setValue(value);setReady(true)}});return()=>{active=false}},[]);
 const setPreference=async(value:ThemePreference)=>{setValue(value);await writePreference(value)};
 const isDark=preference==='DARK'||(preference==='SYSTEM'&&system==='dark');
 useEffect(()=>{if(Platform.OS!=='web'||typeof document==='undefined')return;const canvas=isDark?dark.canvas:light.canvas;document.documentElement.style.setProperty('--everest-canvas',canvas);document.documentElement.style.setProperty('--everest-text',isDark?dark.text:light.text);document.documentElement.style.backgroundColor=canvas;document.body.style.backgroundColor=canvas;document.documentElement.style.colorScheme=isDark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',canvas);document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content',isDark?'black-translucent':'default')},[isDark]);
 const value=useMemo(()=>({preference,isDark,colors:isDark?dark:light,setPreference,ready}),[preference,isDark,ready]);
 return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useAppTheme(){const value=useContext(ThemeContext);if(!value)throw new Error('useAppTheme must be used inside ThemeProvider');return value}
