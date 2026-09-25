import {Platform} from 'react-native';
import {useEffect,useState} from 'react';

export type VisualViewportState={
 height:number|null;
 width:number|null;
 offsetTop:number;
 keyboardInset:number;
 supported:boolean;
};

const initial:VisualViewportState={height:null,width:null,offsetTop:0,keyboardInset:0,supported:false};

export function useVisualViewport(){
 const [state,setState]=useState<VisualViewportState>(initial);
 useEffect(()=>{
  if(Platform.OS!=='web'||typeof window==='undefined')return;
  let raf=0;
  const update=()=>{
   cancelAnimationFrame(raf);
   raf=requestAnimationFrame(()=>{
    const vv=window.visualViewport;
    const layoutHeight=Math.max(document.documentElement.clientHeight,window.innerHeight);
    const height=vv?.height??window.innerHeight;
    const width=vv?.width??window.innerWidth;
    const offsetTop=vv?.offsetTop??0;
    const keyboardInset=Math.max(0,layoutHeight-height-offsetTop);
    const next={height,width,offsetTop,keyboardInset,supported:Boolean(vv)};
    setState(next);
    document.documentElement.style.setProperty('--everest-visual-height',Math.round(height)+'px');
    document.documentElement.style.setProperty('--everest-visual-top',Math.round(offsetTop)+'px');
    document.documentElement.style.setProperty('--everest-keyboard-inset',Math.round(keyboardInset)+'px');
   });
  };
  update();
  const vv=window.visualViewport;
  vv?.addEventListener('resize',update,{passive:true});
  vv?.addEventListener('scroll',update,{passive:true});
  window.addEventListener('resize',update,{passive:true});
  window.addEventListener('orientationchange',update,{passive:true});
  return()=>{
   cancelAnimationFrame(raf);
   vv?.removeEventListener('resize',update);
   vv?.removeEventListener('scroll',update);
   window.removeEventListener('resize',update);
   window.removeEventListener('orientationchange',update);
  };
 },[]);
 return state;
}
