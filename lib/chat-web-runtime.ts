import {Platform} from 'react-native';

const STYLE_ID='everest-chat-input-runtime-style';

function hexToRgba(hex:string,alpha:number){
 const value=hex.replace('#','');
 if(value.length!==6)return `rgba(216,195,165,${alpha})`;
 const r=parseInt(value.slice(0,2),16);
 const g=parseInt(value.slice(2,4),16);
 const b=parseInt(value.slice(4,6),16);
 return `rgba(${r},${g},${b},${alpha})`;
}

export function installChatWebRuntimeStyles(brand:string,text:string){
 if(Platform.OS!=='web'||typeof document==='undefined')return()=>{};
 let style=document.getElementById(STYLE_ID) as HTMLStyleElement|null;
 const created=!style;
 if(!style){
  style=document.createElement('style');
  style.id=STYLE_ID;
  document.head.appendChild(style);
 }
 style.textContent=`
#everest-message-composer,
#everest-message-composer:focus,
#everest-message-composer:focus-visible,
#everest-message-composer:active {
  -webkit-appearance: none !important;
  appearance: none !important;
  outline: none !important;
  outline-style: none !important;
  outline-width: 0 !important;
  outline-color: transparent !important;
  box-shadow: none !important;
  -webkit-box-shadow: none !important;
  border: 0 !important;
  border-color: transparent !important;
  border-image: none !important;
  -webkit-tap-highlight-color: transparent !important;
  caret-color: ${text} !important;
  font-size: 16px !important;
}
#everest-message-composer::selection {
  background: ${hexToRgba(brand,.28)};
  color: ${text};
}
#everest-composer-shell:focus-within {
  outline: none !important;
  box-shadow: none !important;
}
[data-everest-message-bubble="true"],
[data-everest-message-bubble="true"] *,
#everest-message-action-overlay,
#everest-message-action-overlay * {
  -webkit-user-select: none !important;
  user-select: none !important;
  -webkit-touch-callout: none !important;
  -webkit-tap-highlight-color: transparent !important;
}
[data-everest-message-bubble="true"] {
  touch-action: manipulation !important;
}
`;
 return()=>{
  if(created&&style?.parentNode)style.parentNode.removeChild(style);
 };
}
