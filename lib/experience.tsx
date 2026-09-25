import {createContext,type ReactNode,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type ExperienceMode='DEFAULT'|'PULSE'|'CLASSIC';
export type ExperienceTokens={
 mode:ExperienceMode;
 typography:{hero:number;title:number;heading:number;body:number;caption:number;lineHeight:number;weight:'700'|'800'|'900'};
 spacing:{screen:number;section:number;card:number;controlGap:number};
 shape:{small:number;medium:number;large:number;card:number;pill:number};
 motion:{level:'restrained'|'expressive'|'reduced';fast:number;standard:number;springFriction:number;pressScale:number};
 content:{density:'balanced'|'rich'|'clear';imageProminence:'balanced'|'high'|'supporting';metadata:'balanced'|'rich'|'explicit';labelVerbosity:'balanced'|'compact'|'descriptive'};
 navigation:{height:number;showLabels:boolean;labelSize:number;iconSize:number};
 surfaces:{elevation:'subtle'|'expressive'|'outlined';borderWidth:number;shadowOpacity:number};
 controls:{minHeight:number;touchTarget:number};
};
export type ExperienceContextValue={mode:ExperienceMode;tokens:ExperienceTokens;ready:boolean;setMode:(mode:ExperienceMode)=>Promise<void>};

const STORAGE_KEY='everest-local-experience-v1';
const TOKENS:Record<ExperienceMode,ExperienceTokens>={
 DEFAULT:{mode:'DEFAULT',typography:{hero:30,title:28,heading:19,body:13,caption:10,lineHeight:1.5,weight:'800'},spacing:{screen:18,section:24,card:15,controlGap:10},shape:{small:12,medium:16,large:20,card:20,pill:999},motion:{level:'restrained',fast:150,standard:210,springFriction:8,pressScale:.985},content:{density:'balanced',imageProminence:'balanced',metadata:'balanced',labelVerbosity:'balanced'},navigation:{height:66,showLabels:true,labelSize:10,iconSize:21},surfaces:{elevation:'subtle',borderWidth:1,shadowOpacity:.06},controls:{minHeight:44,touchTarget:44}},
 PULSE:{mode:'PULSE',typography:{hero:34,title:31,heading:21,body:14,caption:10,lineHeight:1.45,weight:'900'},spacing:{screen:16,section:27,card:16,controlGap:9},shape:{small:14,medium:19,large:25,card:24,pill:999},motion:{level:'expressive',fast:140,standard:260,springFriction:7,pressScale:.975},content:{density:'rich',imageProminence:'high',metadata:'rich',labelVerbosity:'compact'},navigation:{height:68,showLabels:true,labelSize:9,iconSize:22},surfaces:{elevation:'expressive',borderWidth:1,shadowOpacity:.11},controls:{minHeight:46,touchTarget:44}},
 CLASSIC:{mode:'CLASSIC',typography:{hero:32,title:30,heading:21,body:15,caption:12,lineHeight:1.6,weight:'800'},spacing:{screen:20,section:28,card:18,controlGap:12},shape:{small:10,medium:13,large:16,card:16,pill:12},motion:{level:'reduced',fast:0,standard:0,springFriction:12,pressScale:1},content:{density:'clear',imageProminence:'supporting',metadata:'explicit',labelVerbosity:'descriptive'},navigation:{height:74,showLabels:true,labelSize:12,iconSize:23},surfaces:{elevation:'outlined',borderWidth:1.5,shadowOpacity:0},controls:{minHeight:52,touchTarget:48}},
};
const ExperienceContext=createContext<ExperienceContextValue|null>(null);
function valid(value:string|null):value is ExperienceMode{return value==='DEFAULT'||value==='PULSE'||value==='CLASSIC'}
function initialWebMode():ExperienceMode{if(Platform.OS!=='web')return'DEFAULT';try{const value=globalThis.localStorage?.getItem(STORAGE_KEY)??null;return valid(value)?value:'DEFAULT'}catch{return'DEFAULT'}}
async function readMode(){try{const value=Platform.OS==='web'?globalThis.localStorage?.getItem(STORAGE_KEY)??null:await SecureStore.getItemAsync(STORAGE_KEY);return valid(value)?value:'DEFAULT'}catch{return'DEFAULT' as const}}
async function writeMode(value:ExperienceMode){if(Platform.OS==='web'){globalThis.localStorage?.setItem(STORAGE_KEY,value);return}await SecureStore.setItemAsync(STORAGE_KEY,value)}

export function ExperienceProvider({children}:{children:ReactNode}){
 const [mode,setValue]=useState<ExperienceMode>(initialWebMode);const [ready,setReady]=useState(false);
 useEffect(()=>{let active=true;void readMode().then(value=>{if(active){setValue(value);setReady(true)}});return()=>{active=false}},[]);
 const setMode=useCallback(async(value:ExperienceMode)=>{setValue(value);await writeMode(value)},[]);
 useEffect(()=>{if(Platform.OS!=='web'||typeof document==='undefined')return;document.documentElement.dataset.everestExperience=mode.toLowerCase()},[mode]);
 const value=useMemo(()=>({mode,tokens:TOKENS[mode],ready,setMode}),[mode,ready,setMode]);
 return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}
export function useExperience(){const value=useContext(ExperienceContext);if(!value)throw new Error('useExperience must be used inside ExperienceProvider');return value}
export function experienceTokens(mode:ExperienceMode){return TOKENS[mode]}
