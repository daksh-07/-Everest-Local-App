import {Platform} from 'react-native';
import * as Haptics from 'expo-haptics';

export type HapticCapability='native'|'web-vibration'|'unsupported';

export function hapticCapability():HapticCapability{
 if(Platform.OS!=='web')return 'native';
 if(typeof navigator!=='undefined'&&typeof navigator.vibrate==='function')return 'web-vibration';
 return 'unsupported';
}

async function native(run:()=>Promise<void>){
 try{await run();return true}catch{return false}
}
function web(pattern:number|number[]){
 try{return typeof navigator!=='undefined'&&typeof navigator.vibrate==='function'?navigator.vibrate(pattern):false}catch{return false}
}
async function fire(nativeRun:()=>Promise<void>,pattern:number|number[]){
 if(Platform.OS==='web')return web(pattern);
 return native(nativeRun);
}

export const haptic={
 capability:hapticCapability,
 light:()=>fire(()=>Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),12),
 medium:()=>fire(()=>Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),20),
 success:()=>fire(()=>Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),[12,24,12]),
 warning:()=>fire(()=>Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),[20,28,20]),
 selection:()=>fire(()=>Haptics.selectionAsync(),8),
};
