import {useSyncExternalStore} from 'react';

// Messages opens threads with local state (the URL may not change), so global overlays
// read this flag to stay out of the way of the composer and newest messages.
let threadOpen=false;
const listeners=new Set<()=>void>();
export function setChatThreadOpen(open:boolean){if(threadOpen===open)return;threadOpen=open;listeners.forEach(listener=>listener())}
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
export function useChatThreadOpen(){return useSyncExternalStore(subscribe,()=>threadOpen,()=>false)}
