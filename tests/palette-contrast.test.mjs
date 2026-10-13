import test from 'node:test';
import assert from 'node:assert/strict';
import {light,dark} from '../lib/theme-colors.ts';

function luminance(hex){
  const channels=[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return channels.reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
test('beige actions and foreground/semantic text meet AA in light and dark surfaces',()=>{
  for(const palette of [light,dark]){
    assert.ok(contrast(palette.onBrand,palette.brand)>=4.5,'Filled actions remain readable');
    for(const foreground of ['text','textSecondary','muted','accent','success','danger','info']){
      for(const background of ['canvas','surface','elevated','soft']){
        assert.ok(contrast(palette[foreground],palette[background])>=4.5,`${foreground} on ${background}`);
      }
    }
  }
});
