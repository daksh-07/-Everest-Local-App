import {useSyncExternalStore} from 'react';

// Messages opens threads with local state (the URL may not change), so global overlays
// read this flag to stay out of the way of the composer and newest messages.
let threadOpen=false;
const listeners=new Set<()=>void>();
export function setChatThreadOpen(open:boolean){if(threadOpen===open)return;threadOpen=open;listeners.forEach(listener=>listener())}
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
export function useChatThreadOpen(){return useSyncExternalStore(subscribe,()=>threadOpen,()=>false)}

// Full-bleed media (the Clips feed) sets this so floating overlays keep clear of its controls.
let immersive=false;
const immersiveListeners=new Set<()=>void>();
export function setImmersiveMedia(on:boolean){if(immersive===on)return;immersive=on;immersiveListeners.forEach(listener=>listener())}
function subscribeImmersive(listener:()=>void){immersiveListeners.add(listener);return()=>{immersiveListeners.delete(listener)}}
export function useImmersiveMedia(){return useSyncExternalStore(subscribeImmersive,()=>immersive,()=>false)}
