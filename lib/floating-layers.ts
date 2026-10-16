import {useEffect,useSyncExternalStore} from 'react';

// Bottom-anchored floating UI (Live mini player, Ask Everest button) registers the space it
// occupies so other floating layers can stay clear of it instead of overlapping.
const layers=new Map<string,number>();
const listeners=new Set<()=>void>();
let total=0;
function publish(){total=[...layers.values()].reduce((sum,value)=>sum+value,0);listeners.forEach(listener=>listener())}
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
const snapshot=()=>total;

export function setFloatingLayer(id:string,height:number){
 const next=Math.max(0,Math.round(height));
 if(next){if(layers.get(id)===next)return;layers.set(id,next)}else if(!layers.delete(id))return;
 publish();
}
/** Height in px of all registered bottom floating layers. */
export function useFloatingLayerOffset(){return useSyncExternalStore(subscribe,snapshot,snapshot)}
export function useRegisterFloatingLayer(id:string,height:number){
 useEffect(()=>{setFloatingLayer(id,height);return()=>setFloatingLayer(id,0)},[id,height]);
}
