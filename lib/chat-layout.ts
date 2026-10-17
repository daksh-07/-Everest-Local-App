export const COMPOSER_INPUT_MIN=36;
export const COMPOSER_INPUT_MAX=120;
export function composerInputHeight(contentHeight:number){return Math.max(COMPOSER_INPUT_MIN,Math.min(COMPOSER_INPUT_MAX,Math.ceil(Number.isFinite(contentHeight)?contentHeight:COMPOSER_INPUT_MIN)))}
/** The visual viewport already excludes the keyboard and its system accessory area. */
export function chatViewport(layoutHeight:number,height:number,offsetTop:number,scale=1){
 const top=Math.max(0,offsetTop);const visible=Math.max(1,height);
 return {height:visible,offsetTop:top,keyboardInset:scale>1.05?0:Math.max(0,layoutHeight-visible-top)};
}
