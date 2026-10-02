import {AccessibilityInfo,Animated,Easing} from 'react-native';
import {useSyncExternalStore} from 'react';
import {useExperience} from '@/lib/experience';

export const MOTION={fast:150,standard:210,spring:{friction:8,tension:170}} as const;
export const ease=Easing.bezier(.2,.8,.2,1);

// All controls share one OS subscription. Start conservatively until it resolves.
let reduced=true;
let revision=0;
const listeners=new Set<()=>void>();
let subscription:ReturnType<typeof AccessibilityInfo.addEventListener>|undefined;
function publish(value:boolean){
 if(reduced===value)return;
 reduced=value;
 listeners.forEach(listener=>listener());
}
function subscribe(listener:()=>void){
 listeners.add(listener);
 if(listeners.size===1){
  const request=++revision;
  subscription=AccessibilityInfo.addEventListener('reduceMotionChanged',value=>{revision++;publish(value)});
  void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(request===revision)publish(value)}).catch(()=>{});
 }
 return()=>{
  listeners.delete(listener);
  if(!listeners.size){revision++;subscription?.remove();subscription=undefined;reduced=true}
 };
}
const snapshot=()=>reduced;
const serverSnapshot=()=>true;
export function useReducedMotion(){
 const {mode}=useExperience();
 const systemReduced=useSyncExternalStore(subscribe,snapshot,serverSnapshot);
 return systemReduced||mode==='CLASSIC';
}

export function animateValue(value:Animated.Value,toValue:number,reduced:boolean,duration=MOTION.standard){
 value.stopAnimation();
 if(reduced){value.setValue(toValue);return}
 Animated.timing(value,{toValue,duration,easing:ease,useNativeDriver:true}).start();
}
