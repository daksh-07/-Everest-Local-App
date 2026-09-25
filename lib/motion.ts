import {AccessibilityInfo,Animated,Easing} from 'react-native';
import {useEffect,useState} from 'react';

export const MOTION={fast:150,standard:210,spring:{friction:8,tension:170}} as const;
export const ease=Easing.bezier(.2,.8,.2,1);

export function useReducedMotion(){
 const [reduced,setReduced]=useState(false);
 useEffect(()=>{
  let active=true;
  void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active)setReduced(value)});
  const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);
  return()=>{active=false;sub.remove()}
 },[]);
 return reduced;
}

export function animateValue(value:Animated.Value,toValue:number,reduced:boolean,duration=MOTION.standard){
 if(reduced){value.setValue(toValue);return}
 Animated.timing(value,{toValue,duration,easing:ease,useNativeDriver:true}).start();
}
