// Rendered regression checks; run against a local Expo web server or served export.
// Uses the agent-browser CLI and an installed Chromium, without changing app data.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const base=process.env.EVEREST_PREVIEW_URL||'http://localhost:8082';
const browser=process.env.EVEREST_BROWSER_PATH||'/usr/bin/chromium';
const run=(...args)=>execFileSync('npx',['--yes','agent-browser@0.38.1','--session','everest-qa','--executable-path',browser,...args],{encoding:'utf8',timeout:60000}).trim();
const evaluate=expression=>JSON.parse(run('eval',`JSON.stringify(${expression})`));
function value(expression){const result=evaluate(expression);return typeof result==='string'?JSON.parse(result):result;}
function ready(label){run('wait','--fn',`!!document.querySelector('[aria-label="${label}"]')`);}
let checks=0;
try{
 run('open',base);
 ready('Open Everest menu');
 for(const mode of ['DEFAULT','PULSE','CLASSIC']){
  for(const theme of ['LIGHT','DARK']){
   run('eval',`localStorage.setItem('everest-local-experience-v1','${mode}');localStorage.setItem('everest-local-theme','${theme}')`);
   run('reload');ready('Open Everest menu');
   for(const width of [320,390,1280]){
    run('set','viewport',String(width),'844');
    run('wait','--fn','document.documentElement.scrollWidth <= innerWidth');
    const result=value(`(()=>{
     const rect=label=>{const el=document.querySelector('[aria-label="'+label+'"]');const r=el.getBoundingClientRect();const css=getComputedStyle(el);return {x:r.x,right:r.right,height:r.height,width:r.width,direction:css.flexDirection,bg:css.backgroundColor}};
     return {quote:rect('Request a Quote'),live:rect('Find someone now with Everest Live'),mode:document.documentElement.dataset.everestExperience,canvas:document.documentElement.style.getPropertyValue('--everest-canvas')};
    })()`);
    assert.equal(result.mode,mode.toLowerCase());
    assert.equal(result.canvas,theme==='DARK'?'#10100F':'#F7F5F0');
    for(const control of [result.quote,result.live]){
     assert.ok(control.height>=44,`Touch target at ${width}: ${JSON.stringify(control)}`);
     assert.ok(control.x>=0&&control.right<=width+1,`Overflow at ${width}`);
     assert.equal(control.direction,'row','Callback layout style must survive animation wrapper');
     assert.notEqual(control.bg,'rgba(0, 0, 0, 0)','CTA must retain its surface');
    }
    checks++;console.log(`PASS Home ${mode} ${theme} ${width}px`);
   }
  }
 }
 run('set','media','light','reduced-motion');
 run('eval',"localStorage.setItem('everest-local-experience-v1','DEFAULT')");
 run('reload');ready('Open Everest menu');
 assert.equal(value("matchMedia('(prefers-reduced-motion: reduce)').matches"),true);
 run('set','viewport','390','844');
 run('click','[aria-label="Open Everest menu"]');
 run('wait','[aria-label="Close menu"]');
 run('click','[aria-label="Close menu"]');
 run('wait','--fn',"!document.querySelector('[aria-label=\"Close menu\"]')?.getClientRects().length");
 checks++;console.log('PASS reduced-motion preference and menu open/close');
 run('open',base+'/shop');ready('Search local products');
 for(const width of [320,390,1280]){
  run('set','viewport',String(width),'844');
    run('wait','--fn','document.documentElement.scrollWidth <= innerWidth');
  const result=value(`(()=>{const bag=document.querySelector('[aria-label="Open shopping bag"]');const input=document.querySelector('[aria-label="Search local products"]');return {bagRight:bag.getBoundingClientRect().right,inputSize:parseFloat(getComputedStyle(input).fontSize),filters:[...document.querySelectorAll('[role="checkbox"]')].map(e=>e.getBoundingClientRect().height),overflow:document.documentElement.scrollWidth>innerWidth}})()`);
  assert.ok(result.bagRight<=width+1);assert.ok(result.inputSize>=16);assert.equal(result.overflow,false);
  assert.equal(result.filters.length,3);assert.ok(result.filters.every(height=>height>=44));
  checks++;console.log(`PASS Shop ${width}px`);
 }
 run('find','role','checkbox','click','--name','Pickup','--exact');
 assert.equal(value("document.querySelector('[role=checkbox]').getAttribute('aria-checked')"),'true');
 checks++;console.log('PASS filter state announcement');
 console.log(`${checks} rendered checks passed. Chromium emulation only; no native or authenticated flow coverage.`);
}finally{run('close');}
