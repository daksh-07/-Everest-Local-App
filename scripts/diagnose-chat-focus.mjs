import { webkit, devices } from 'playwright';

const browser=await webkit.launch();
const context=await browser.newContext({...devices['iPhone 15 Pro']});
const page=await context.newPage();
await page.goto('http://127.0.0.1:4173/messages?focusProbe=1',{waitUntil:'networkidle'});
const input=page.locator('#everest-message-composer');
await input.waitFor({state:'visible'});
await input.focus();
await page.waitForTimeout(250);

const result=await page.evaluate(()=>{
 const el=document.activeElement;
 if(!el)return null;
 const s=getComputedStyle(el);
 const attrs=Object.fromEntries(Array.from(el.attributes).map(a=>[a.name,a.value]));
 const matched=[];
 for(const sheet of Array.from(document.styleSheets)){
  let rules;
  try{rules=sheet.cssRules}catch{continue}
  for(const rule of Array.from(rules||[])){
   if(!('selectorText' in rule))continue;
   const selector=String(rule.selectorText||'');
   if(/everest|textarea|input|focus|textbox/i.test(selector)){
    matched.push({selector,cssText:rule.cssText});
   }
  }
 }
 return {
  tagName:el.tagName,
  id:el.id,
  className:typeof el.className==='string'?el.className:String(el.className),
  role:el.getAttribute('role'),
  attrs,
  outerHTML:el.outerHTML.slice(0,1200),
  computed:{
   outline:s.outline,
   outlineStyle:s.outlineStyle,
   outlineWidth:s.outlineWidth,
   outlineColor:s.outlineColor,
   border:s.border,
   borderColor:s.borderColor,
   boxShadow:s.boxShadow,
   webkitAppearance:s.webkitAppearance,
   appearance:s.appearance,
   caretColor:s.caretColor,
   backgroundColor:s.backgroundColor,
  },
  matchedRules:matched.slice(0,100)
 };
});
console.log('EVEREST_FOCUS_DIAGNOSTIC='+JSON.stringify(result,null,2));
await page.screenshot({path:'focus-probe-webkit.png',fullPage:true});
await browser.close();
