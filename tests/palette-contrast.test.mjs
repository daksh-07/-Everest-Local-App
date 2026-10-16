import test from 'node:test';
import assert from 'node:assert/strict';
import {light,dark,paletteName} from '../lib/theme-colors.ts';
import {candidates} from '../scripts/palette-candidates.mjs';

function luminance(hex){
  const channels=[1,3,5].map(at=>parseInt(hex.slice(at,at+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return channels.reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
const SURFACES=['canvas','surface','elevated','soft'];

test('filled actions and foreground/semantic text meet AA in light and dark surfaces',()=>{
  for(const palette of [light,dark]){
    assert.ok(contrast(palette.onBrand,palette.brand)>=4.5,'Filled actions remain readable');
    for(const foreground of ['text','textSecondary','muted','accent','success','danger','info','warning','secondaryText']){
      for(const background of [...SURFACES,'accentSoft']){
        assert.ok(contrast(palette[foreground],palette[background])>=4.5,`${foreground} on ${background}: ${contrast(palette[foreground],palette[background]).toFixed(2)}`);
      }
    }
  }
});

test('every on-colour pairing meets AA text contrast (WCAG 1.4.3)',()=>{
  const pairs=[['onPrimary','primary'],['onSecondary','secondary'],['onTertiary','tertiary'],['onPrimaryContainer','primaryContainer'],['onSecondaryContainer','secondaryContainer'],['onTertiaryContainer','tertiaryContainer'],['onSelected','selected'],['success','successContainer'],['warning','warningContainer'],['danger','dangerContainer'],['info','infoContainer'],['text','primaryContainer']];
  for(const [name,palette] of [['light',light],['dark',dark]])for(const [fg,bg] of pairs){
    const ratio=contrast(palette[fg],palette[bg]);
    assert.ok(ratio>=4.5,`${name}: ${fg} on ${bg} is ${ratio.toFixed(2)}`);
  }
});

test('control boundaries, focus and filled actions meet non-text contrast (WCAG 1.4.11)',()=>{
  for(const [name,palette] of [['light',light],['dark',dark]])for(const bg of ['canvas','surface']){
    for(const fg of ['borderStrong','focus','primary','secondary','rating']){
      const ratio=contrast(palette[fg],palette[bg]);
      assert.ok(ratio>=3,`${name}: ${fg} against ${bg} is ${ratio.toFixed(2)}`);
    }
  }
});

test('disabled content stays perceivable even though WCAG exempts it',()=>{
  for(const palette of [light,dark])assert.ok(contrast(palette.onDisabled,palette.disabled)>=3);
});

test('brand and status colours stay distinct so status never reads as branding',()=>{
  for(const palette of [light,dark]){
    for(const status of ['success','danger','warning'])assert.notEqual(palette.primary,palette[status]);
    assert.notEqual(palette.tertiary,palette.danger,'coral accent is never the error colour');
    assert.notEqual(palette.secondary,palette.success,'teal (Live) is never the success colour');
  }
});

test('dark mode uses true black and neutral un-tinted surfaces',()=>{
  assert.equal(dark.canvas,'#000000','The main dark canvas must be real black');
  for(const key of ['surface','elevated','soft','input','navigation','border','borderStrong','disabled']){
    const hex=dark[key];
    assert.match(hex,/^#[0-9a-f]{6}$/i,`${key} must be an opaque hex color`);
    const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
    assert.equal(r,g,`${key} must have no red/brown tint`);
    assert.equal(g,b,`${key} must have no green/olive tint`);
  }
});

test('the shipped palette is Everest Electric and matches its generator source',()=>{
  assert.equal(paletteName,'Everest Electric');
  assert.equal(light.primary,'#315BEE');assert.equal(light.secondary,'#087E78');assert.equal(light.tertiary,'#F36B52');
  assert.equal(light.canvas,'#F8FAFC');assert.equal(light.surface,'#FFFFFF');assert.equal(light.text,'#161A24');
  assert.equal(dark.surface,'#111111');assert.equal(dark.elevated,'#1F1F1F');assert.equal(dark.primary,'#88A5FF');assert.equal(dark.secondary,'#73DED2');
  assert.deepEqual({...light},{...candidates.electric.light});assert.deepEqual({...dark},{...candidates.electric.dark});
});

test('all candidate directions were held to the same contrast bar',()=>{
  for(const [key,c] of Object.entries(candidates))for(const mode of ['light','dark']){
    const p=c[mode];
    assert.ok(contrast(p.onPrimary,p.primary)>=4.5,`${key} ${mode} primary button`);
    for(const bg of SURFACES)assert.ok(contrast(p.primaryText,p[bg])>=4.5,`${key} ${mode} primaryText on ${bg}`);
  }
});
