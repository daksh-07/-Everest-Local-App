import {webkit,devices} from 'playwright';

const browser=await webkit.launch();
const context=await browser.newContext({...devices['iPhone 15 Pro']});
const page=await context.newPage();
await page.goto('http://127.0.0.1:4173/chat-input-regression',{waitUntil:'domcontentloaded'});
const input=page.locator('#everest-message-composer');
await input.waitFor({state:'visible'});
await input.focus();
await page.waitForTimeout(100);

const result=await page.evaluate(()=>{
 const el=globalThis.document.activeElement;
 const input=globalThis.document.querySelector('#everest-message-composer');
 const shell=globalThis.document.querySelector('#everest-composer-shell');
 const focusSurface=shell?.firstElementChild;
 if(!el||!input||!shell||!focusSurface)return null;
 const s=globalThis.getComputedStyle(el);
 const surface=globalThis.getComputedStyle(focusSurface);
 return {
  activeTag:el.tagName,
  activeId:el.id,
  activeClass:typeof el.className==='string'?el.className:String(el.className),
  outline:s.outline,
  outlineStyle:s.outlineStyle,
  outlineWidth:s.outlineWidth,
  outlineColor:s.outlineColor,
  boxShadow:s.boxShadow,
  webkitAppearance:s.webkitAppearance,
  appearance:s.appearance,
  fontSize:s.fontSize,
  caretColor:s.caretColor,
  wrapperBorderColor:surface.borderColor,
  runtimeStyle:Boolean(globalThis.document.querySelector('#everest-chat-input-runtime-style')),
  focusVisible:el.matches(':focus-visible'),
 };
});
console.log('EVEREST_CHAT_WEBKIT='+JSON.stringify(result));
if(!result)throw new Error('Composer focus result missing');
if(result.activeTag!=='TEXTAREA'||result.activeId!=='everest-message-composer')throw new Error('Unexpected active composer element');
if(result.outlineStyle!=='none'||result.outlineWidth!=='0px')throw new Error('Native focus outline is still active: '+result.outline);
if(result.boxShadow!=='none')throw new Error('Focused textarea has unexpected box shadow: '+result.boxShadow);
if(result.webkitAppearance!=='none'&&result.appearance!=='none')throw new Error('Textarea appearance reset missing');
if(result.fontSize!=='16px')throw new Error('Textarea must stay 16px on iOS web');
if(!result.runtimeStyle)throw new Error('Runtime chat style was not installed');
if(/52,\s*132,\s*228|0,\s*122,\s*255|blue/i.test(result.outlineColor+' '+result.outline+' '+result.wrapperBorderColor))throw new Error('Blue focus styling detected');
await page.screenshot({path:'chat-input-webkit-regression.png',fullPage:true});
await browser.close();
