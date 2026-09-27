export const CUSTOMER_PAGES=['/','/social?mode=posts','/social?mode=clips','/activity','/messages','/account'] as const;
export type CustomerPage=0|1|2|3|4|5;
export function pageForRoute(pathname:string,mode?:string):CustomerPage|null {
 if(pathname==='/')return 0;
 if(pathname==='/social')return mode==='clips'?2:1;
 if(pathname==='/activity')return 3;
 if(pathname==='/messages')return 4;
 if(pathname==='/account')return 5;
 return null;
}
export function tabForProgress(position:number){return position<=1?position:position<=2?1:position-1}
export function settlePage(current:number,translationX:number,velocityX:number,width:number){
 const distance=Math.abs(translationX),velocity=Math.abs(velocityX);
 if(distance<width*.16&&velocity<450)return current;
 const direction=translationX<0?1:-1;
 const steps=(distance>width*.85||velocity>1350)?2:1;
 return Math.max(0,Math.min(CUSTOMER_PAGES.length-1,current+direction*steps));
}
